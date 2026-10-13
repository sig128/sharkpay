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
import { LAMPORTS_PER_SOL } from "@/lib/format";
import { getFinalizedTransaction, solanaRpc, type Rpc } from "../chain/rpc";
import { availableItem, orderEvent, submitOrder, type OrderRow } from "../orders/orders";
import type { Session } from "../auth/sessions";

export { formatUnits, solanaRpc };

const SOL_MINT = "So11111111111111111111111111111111111111112";
/** Payments that arrive this long after the quote expired are still honoured. */
const LATE_GRACE_MS = 60_000;
const PRICE_CACHE_MS = 15_000;

export type SharkPaymentStatus = "awaiting_payment" | "paid" | "expired" | "refund_due" | "refunded";

export interface SharkPaymentRow {
  id: string;
  realm: string;
  user_id: string;
  item_id: string;
  sol_price_lamports: number;
  sol_usd_price: number;
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
  | { enabled: false; code: "not_live" | "not_configured" | "fulfillment_unavailable"; reason: string };

/** Whether $SHARK checkout can take a payment right now. Fails closed on every missing piece. */
export function sharkCheckout(): CheckoutAvailability {
  const e = env();
  const mint = validMint(e.TOKEN_MINT);
  if (!mint) return { enabled: false, code: "not_live", reason: "$SHARK isn't live yet." };
  const treasury = validAddress(e.SHARK_TREASURY_WALLET);
  if (!treasury) return { enabled: false, code: "not_configured", reason: "$SHARK payments aren't set up yet." };
  if (!providerFor()) {
    return {
      enabled: false,
      code: "fulfillment_unavailable",
      reason: "Shark Card delivery isn't connected yet, so we can't take payment for a code we can't send.",
    };
  }
  return { enabled: true, mint, treasury };
}

// ---- Price ---------------------------------------------------------------------

export interface MarketPrices {
  solUsd: number;
  tokenUsd: number;
}

let priceCache: { mint: string; at: number; prices: MarketPrices } | null = null;

export function resetPriceCacheForTests() {
  priceCache = null;
}

function readPrice(body: unknown, mint: string, needLiquidity: boolean) {
  const entry = (body as Record<string, { usdPrice?: unknown; liquidity?: unknown } | null>)?.[mint];
  const usd = Number(entry?.usdPrice);
  const liquidity = Number(entry?.liquidity);
  if (!Number.isFinite(usd) || usd <= 0) return null;
  if (needLiquidity && (!Number.isFinite(liquidity) || liquidity < env().SHARK_MIN_LIQUIDITY_USD)) return null;
  return usd;
}

/** SOL and $SHARK USD prices from Jupiter. */
export async function marketPrices(mint: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<MarketPrices> {
  if (priceCache && priceCache.mint === mint && now - priceCache.at < PRICE_CACHE_MS) return priceCache.prices;
  const e = env();
  let body: unknown;
  try {
    const res = await fetchImpl(`${e.SHARK_PRICE_URL}?ids=${encodeURIComponent(`${SOL_MINT},${mint}`)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`price ${res.status}`);
    body = await res.json();
  } catch {
    throw new AppError("price_unavailable", "We couldn't get a reliable market price. Try again in a moment.", 503);
  }
  const solUsd = readPrice(body, SOL_MINT, false);
  const tokenUsd = readPrice(body, mint, true);
  if (!solUsd) throw new AppError("price_unavailable", "We couldn't get a reliable SOL price.", 503);
  if (!tokenUsd) {
    throw new AppError("price_unavailable", "There's no market price for $SHARK yet, or liquidity is too low.", 503);
  }
  const prices = { solUsd, tokenUsd };
  priceCache = { mint, at: now, prices };
  return prices;
}

export async function sharkUsdPrice(mint: string, fetchImpl: typeof fetch = fetch, now = Date.now()) {
  return (await marketPrices(mint, fetchImpl, now)).tokenUsd;
}

// ---- Amounts -------------------------------------------------------------------

const PRICE_SCALE = 100_000_000n;

/** Atomic $SHARK units that cover a fixed SOL price at the given USD prices, rounded up. */
export function tokensForSol(lamports: number, solUsd: number, tokenUsd: number, decimals: number): bigint {
  const sol = BigInt(Math.round(solUsd * Number(PRICE_SCALE)));
  const tok = BigInt(Math.round(tokenUsd * Number(PRICE_SCALE)));
  if (sol <= 0n || tok <= 0n || lamports <= 0 || decimals < 0 || decimals > 18) {
    throw new AppError("price_unavailable", "This amount can't be priced safely.", 503);
  }
  const num = BigInt(lamports) * sol * 10n ** BigInt(decimals);
  const den = BigInt(LAMPORTS_PER_SOL) * tok;
  const atomic = (num + den - 1n) / den;
  if (atomic <= 0n) throw new AppError("price_unavailable", "This amount can't be priced safely.", 503);
  return atomic;
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
  const status = sharkCheckout();
  if (!status.enabled) throw new AppError(status.code, status.reason, 503);
  const item = availableItem(session.realm, itemId);
  if (!item.sol_price_lamports || item.sol_price_lamports <= 0) {
    throw new AppError("price_unavailable", "This card doesn't have a SOL price yet.", 503);
  }
  const e = env();
  const market = await marketPrices(status.mint, fetchImpl, now);
  const net = tokensForSol(item.sol_price_lamports, market.solUsd, market.tokenUsd, e.TOKEN_DECIMALS);
  const gross = grossForNet(net, e.TOKEN_TRANSFER_FEE_BPS);
  const reference = bs58.encode(randomBytes(32));
  const id = randomId("spay");
  const expiresAt = now + e.SHARK_QUOTE_TTL_SECONDS * 1000;
  run(
    `INSERT INTO shark_payments (id, realm, user_id, item_id, sol_price_lamports, sol_usd_price, token_usd_price, amount_net, amount_gross, mint,
      recipient, reference, status, created_at, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?)`,
    id,
    session.realm,
    session.userId,
    item.id,
    item.sol_price_lamports,
    market.solUsd,
    market.tokenUsd,
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
    solPriceLamports: p.sol_price_lamports,
    solUsdPrice: p.sol_usd_price,
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
    const t = (await getFinalizedTransaction(rpc, s.signature)) as ParsedTx | null;
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
    p = getSharkPayment(session, paymentId);
  }
  return { payment: paymentView(p), order: orderFor(p) };
}

export async function estimateSharkAmount(lamports: number, mint: string | null, fetchImpl: typeof fetch = fetch) {
  if (!mint || lamports <= 0) return null;
  try {
    const market = await marketPrices(mint, fetchImpl);
    return formatUnits(tokensForSol(lamports, market.solUsd, market.tokenUsd, env().TOKEN_DECIMALS), env().TOKEN_DECIMALS);
  } catch {
    return null;
  }
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
    const provider = providerFor();
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
      `INSERT INTO orders (id, realm, user_id, item_id, payment_id, status, provider,
        provider_idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?)`,
      orderId,
      p.realm,
      p.user_id,
      item.id,
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
