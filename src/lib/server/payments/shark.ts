import bs58 from "bs58";
import { randomBytes } from "node:crypto";
import { one, run, tx } from "../db";
import { env } from "../env";
import { randomId } from "../crypto";
import { AppError, notFound } from "../errors";
import { getItem } from "../catalog/catalog";
import { providerFor } from "../fulfillment/provider";
import { transferFee } from "../rewards/engine";
import { validAddress, validMint } from "../services/buy";
import { formatUnits } from "./units";

export { formatUnits };
import { availableItem, orderEvent, submitOrder, type OrderRow } from "../orders/orders";
import type { Session } from "../auth/sessions";

/** Payments that arrive this long after the quote expired are still honoured. */
const LATE_GRACE_MS = 60_000;
const PRICE_CACHE_MS = 15_000;

export type SharkPaymentStatus = "awaiting_payment" | "paid" | "expired" | "refund_due" | "refunded";

export interface SharkPaymentRow {
  id: string;
  realm: string;
  user_id: string;
  item_id: string;
  usd_cents: number;
  token_usd_price: number;
  amount_net: string;
  amount_gross: string;
  mint: string;
  recipient: string;
  reference: string;
  status: SharkPaymentStatus;
  tx_signature: string | null;
  payer: string | null;
  received: string | null;
  order_id: string | null;
  note: string | null;
  created_at: number;
  expires_at: number;
  paid_at: number | null;
  updated_at: number;
}

export type CheckoutAvailability =
  | { enabled: true; mint: string; treasury: string }
  | { enabled: false; code: "live_only" | "not_live" | "not_configured" | "fulfillment_unavailable"; reason: string };

/** Whether $SHARK checkout can take a payment right now. Fails closed on every missing piece. */
export function sharkCheckout(realm: string): CheckoutAvailability {
  const e = env();
  if (realm.startsWith("demo:")) {
    return { enabled: false, code: "live_only", reason: "Paying with $SHARK needs a signed-in account, not the demo." };
  }
  const mint = validMint(e.TOKEN_MINT);
  if (!mint) return { enabled: false, code: "not_live", reason: "$SHARK isn't live yet." };
  const treasury = validAddress(e.SHARK_TREASURY_WALLET);
  if (!treasury) return { enabled: false, code: "not_configured", reason: "$SHARK payments aren't set up yet." };
  if (!providerFor(realm)) {
    return {
      enabled: false,
      code: "fulfillment_unavailable",
      reason: "Shark Card delivery isn't connected yet, so we can't take payment for a code we can't send.",
    };
  }
  return { enabled: true, mint, treasury };
}

// ---- Price ---------------------------------------------------------------------

let priceCache: { mint: string; at: number; usd: number } | null = null;

export function resetPriceCacheForTests() {
  priceCache = null;
}

/** Server-side USD price for the token from the configured price API (Jupiter by default). */
export async function sharkUsdPrice(mint: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<number> {
  if (priceCache && priceCache.mint === mint && now - priceCache.at < PRICE_CACHE_MS) return priceCache.usd;
  const e = env();
  let body: unknown;
  try {
    const res = await fetchImpl(`${e.SHARK_PRICE_URL}?ids=${encodeURIComponent(mint)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`price ${res.status}`);
    body = await res.json();
  } catch {
    throw new AppError("price_unavailable", "We couldn't get a reliable $SHARK price. Try again in a moment.", 503);
  }
  const entry = (body as Record<string, { usdPrice?: unknown; liquidity?: unknown } | null>)?.[mint];
  const usd = Number(entry?.usdPrice);
  const liquidity = Number(entry?.liquidity);
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new AppError("price_unavailable", "There's no market price for $SHARK yet.", 503);
  }
  if (!Number.isFinite(liquidity) || liquidity < e.SHARK_MIN_LIQUIDITY_USD) {
    throw new AppError("price_unavailable", "$SHARK liquidity is too low to price a payment safely right now.", 503);
  }
  priceCache = { mint, at: now, usd };
  return usd;
}

// ---- Amounts -------------------------------------------------------------------

/** Atomic token units worth `usdCents` at `usdPrice`, rounded up so the price is always covered. */
export function tokensForUsd(usdCents: number, usdPrice: number, decimals: number): bigint {
  const atomic = Math.ceil((usdCents / 100 / usdPrice) * 10 ** decimals);
  if (!Number.isSafeInteger(atomic) || atomic <= 0) throw new AppError("price_unavailable", "This amount can't be priced safely.", 503);
  return BigInt(atomic);
}

/** Smallest send amount whose net after the Token-2022 transfer fee is at least `net`. */
export function grossForNet(net: bigint, feeBps: number): bigint {
  if (feeBps <= 0) return net;
  let gross = (net * 10_000n + BigInt(10_000 - feeBps) - 1n) / BigInt(10_000 - feeBps);
  const noCap = 1n << 62n;
  while (gross - transferFee(gross, feeBps, noCap) < net) gross++;
  return gross;
}

// ---- Quote ---------------------------------------------------------------------

export async function createSharkQuote(session: Session, itemId: string, fetchImpl: typeof fetch = fetch, now = Date.now()) {
  const status = sharkCheckout(session.realm);
  if (!status.enabled) throw new AppError(status.code, status.reason, 503);
  const item = availableItem(session.realm, itemId);
  if (!item.usd_price_cents || item.usd_price_cents <= 0) {
    throw new AppError("price_unavailable", "This card doesn't have a provider price yet.", 503);
  }
  const e = env();
  const usd = await sharkUsdPrice(status.mint, fetchImpl, now);
  const net = tokensForUsd(item.usd_price_cents, usd, e.TOKEN_DECIMALS);
  const gross = grossForNet(net, e.REWARD_FEE_BPS);
  const reference = bs58.encode(randomBytes(32));
  const id = randomId("spay");
  const expiresAt = now + e.SHARK_QUOTE_TTL_SECONDS * 1000;
  run(
    `INSERT INTO shark_payments (id, realm, user_id, item_id, usd_cents, token_usd_price, amount_net, amount_gross, mint,
      recipient, reference, status, created_at, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?)`,
    id,
    session.realm,
    session.userId,
    item.id,
    item.usd_price_cents,
    usd,
    net.toString(),
    gross.toString(),
    status.mint,
    status.treasury,
    reference,
    now,
    expiresAt,
    now,
  );
  return paymentView(one<SharkPaymentRow>(`SELECT * FROM shark_payments WHERE id = ?`, id)!);
}

export function paymentView(p: SharkPaymentRow) {
  const decimals = env().TOKEN_DECIMALS;
  const amount = formatUnits(BigInt(p.amount_gross), decimals);
  const item = getItem(p.realm, p.item_id);
  const params = new URLSearchParams({
    amount,
    "spl-token": p.mint,
    reference: p.reference,
    label: "SHARKCARD",
    message: item ? `${item.name} (${item.platform}, ${item.region})` : "Shark Card",
  });
  return {
    id: p.id,
    status: p.status,
    itemId: p.item_id,
    itemName: item?.name ?? "Shark Card",
    usdCents: p.usd_cents,
    tokenUsdPrice: p.token_usd_price,
    amount,
    recipient: p.recipient,
    mint: p.mint,
    reference: p.reference,
    solanaPayUrl: `solana:${p.recipient}?${params.toString().replace(/\+/g, "%20")}`,
    expiresAt: p.expires_at,
    txSignature: p.tx_signature,
    explorerUrl: p.tx_signature ? `https://solscan.io/tx/${p.tx_signature}` : null,
    orderId: p.order_id,
    note: p.note,
  };
}

export type SharkPaymentView = ReturnType<typeof paymentView>;

export function getSharkPayment(session: Session, paymentId: string): SharkPaymentRow {
  const p = one<SharkPaymentRow>(
    `SELECT * FROM shark_payments WHERE id = ? AND user_id = ? AND realm = ?`,
    paymentId,
    session.userId,
    session.realm,
  );
  if (!p) throw notFound("Payment");
  return p;
}

// ---- On-chain verification -------------------------------------------------------

type Rpc = (method: string, params: unknown[]) => Promise<unknown>;

export function solanaRpc(fetchImpl: typeof fetch = fetch): Rpc {
  return async (method, params) => {
    let body: { result?: unknown; error?: unknown };
    try {
      const res = await fetchImpl(env().SOLANA_RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      body = await res.json();
    } catch {
      throw new AppError("chain_unavailable", "We couldn't reach Solana. Your payment is safe; check again shortly.", 503);
    }
    if (body.error) throw new AppError("chain_unavailable", "Solana returned an error. Check again shortly.", 503);
    return body.result;
  };
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

interface ParsedTx {
  blockTime: number | null;
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    loadedAddresses?: { writable?: string[]; readonly?: string[] };
  } | null;
  transaction: { message: { accountKeys: Array<string | { pubkey: string }> } };
}

/** Pure check of a finalized transaction against a payment request. */
export function inspectPayment(t: ParsedTx | null, p: Pick<SharkPaymentRow, "reference" | "mint" | "recipient">) {
  if (!t?.meta || t.meta.err) return null;
  const keys = [
    ...t.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey)),
    ...(t.meta.loadedAddresses?.writable ?? []),
    ...(t.meta.loadedAddresses?.readonly ?? []),
  ];
  if (!keys.includes(p.reference)) return null;

  const pre = t.meta.preTokenBalances ?? [];
  const post = t.meta.postTokenBalances ?? [];
  const before = (idx: number) => BigInt(pre.find((b) => b.accountIndex === idx)?.uiTokenAmount.amount ?? "0");

  let received = 0n;
  for (const b of post) {
    if (b.mint === p.mint && b.owner === p.recipient) received += BigInt(b.uiTokenAmount.amount) - before(b.accountIndex);
  }
  if (received <= 0n) return null;

  let payer: string | null = null;
  let biggest = 0n;
  for (const b of pre) {
    if (b.mint !== p.mint || !b.owner || b.owner === p.recipient) continue;
    const after = BigInt(post.find((x) => x.accountIndex === b.accountIndex)?.uiTokenAmount.amount ?? "0");
    const spent = BigInt(b.uiTokenAmount.amount) - after;
    if (spent > biggest) {
      biggest = spent;
      payer = b.owner;
    }
  }
  return { received, payer, blockTimeMs: t.blockTime ? t.blockTime * 1000 : null };
}

/**
 * Looks for a finalized transfer carrying this payment's reference. On a match the
 * payment is settled exactly once (the transaction signature is unique) and the
 * Shark Card order is created and sent to the fulfilment provider.
 */
export async function checkSharkPayment(session: Session, paymentId: string, rpc: Rpc = solanaRpc(), now = Date.now()) {
  let p = getSharkPayment(session, paymentId);
  if (p.status !== "awaiting_payment" && p.status !== "expired") return { payment: paymentView(p), order: orderFor(p) };

  const sigs = ((await rpc("getSignaturesForAddress", [p.reference, { commitment: "finalized", limit: 20 }])) ?? []) as Array<{
    signature: string;
    err: unknown;
  }>;

  for (const s of [...sigs].reverse()) {
    if (s.err) continue;
    const t = (await rpc("getTransaction", [
      s.signature,
      { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ])) as ParsedTx | null;
    const match = inspectPayment(t, p);
    if (!match) continue;
    const settled = settle(p, s.signature, match, now);
    if (settled) {
      p = settled;
      break;
    }
  }

  if (p.status === "awaiting_payment" && now > p.expires_at + LATE_GRACE_MS) {
    run(`UPDATE shark_payments SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'awaiting_payment'`, now, p.id);
    p = getSharkPayment(session, paymentId);
  }

  if (p.status === "paid" && p.order_id) {
    const order = one<OrderRow>(`SELECT * FROM orders WHERE id = ?`, p.order_id)!;
    if (order.status === "reserved") await submitOrder(order, now);
  }
  return { payment: paymentView(p), order: orderFor(p) };
}

function orderFor(p: SharkPaymentRow): OrderRow | null {
  return p.order_id ? (one<OrderRow>(`SELECT * FROM orders WHERE id = ?`, p.order_id) ?? null) : null;
}

function settle(
  p: SharkPaymentRow,
  signature: string,
  match: { received: bigint; payer: string | null; blockTimeMs: number | null },
  now: number,
): SharkPaymentRow | null {
  return tx(() => {
    if (one(`SELECT 1 FROM shark_payments WHERE tx_signature = ?`, signature)) return null;
    const fresh = one<SharkPaymentRow>(`SELECT * FROM shark_payments WHERE id = ?`, p.id)!;
    if (fresh.status !== "awaiting_payment" && fresh.status !== "expired") return fresh;

    const record = (status: SharkPaymentStatus, note: string | null, orderId: string | null = null) => {
      run(
        `UPDATE shark_payments SET status = ?, tx_signature = ?, payer = ?, received = ?, note = ?, order_id = ?, paid_at = ?, updated_at = ?
         WHERE id = ?`,
        status,
        signature,
        match.payer,
        match.received.toString(),
        note,
        orderId,
        match.blockTimeMs ?? now,
        now,
        p.id,
      );
      return one<SharkPaymentRow>(`SELECT * FROM shark_payments WHERE id = ?`, p.id)!;
    };

    if (match.received < BigInt(p.amount_net)) {
      return record("refund_due", "Less than the quoted amount arrived. It will be refunded to the sending wallet.");
    }
    const paidAt = match.blockTimeMs ?? now;
    if (paidAt > p.expires_at + LATE_GRACE_MS) {
      return record("refund_due", "Payment arrived after the quote expired. It will be refunded to the sending wallet.");
    }
    const provider = providerFor(p.realm);
    let item;
    try {
      item = availableItem(p.realm, p.item_id);
    } catch {
      item = null;
    }
    if (!provider || !item) {
      return record("refund_due", "This card became unavailable before delivery. Your payment will be refunded to the sending wallet.");
    }

    const orderId = randomId("ord");
    run(
      `INSERT INTO orders (id, realm, user_id, item_id, quote_id, idempotency_key, credit_cost, status, provider,
        provider_idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'reserved', ?, ?, ?, ?)`,
      orderId,
      p.realm,
      p.user_id,
      item.id,
      p.id,
      p.id,
      provider.id,
      `pik_${orderId}`,
      now,
      now,
    );
    if (item.stock !== null) {
      const res = run(`UPDATE catalog_items SET stock = stock - 1 WHERE id = ? AND stock > 0`, item.id);
      if (res.changes !== 1) throw new AppError("out_of_stock", "This reward just went out of stock", 409);
      run(`UPDATE catalog_items SET status = 'out_of_stock' WHERE id = ? AND stock = 0`, item.id);
    }
    orderEvent(orderId, "reserved", "$SHARK payment confirmed on Solana. Sending the order to the fulfilment provider.", now);
    return record("paid", null, orderId);
  });
}
