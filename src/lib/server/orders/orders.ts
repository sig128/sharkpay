import { all, one, run, tx } from "../db";
import { decrypt, encrypt, randomId } from "../crypto";
import { AppError, notFound } from "../errors";
import { acct, post, userBalances } from "../ledger/ledger";
import { getItem, redemptionInstructions, type CatalogItem } from "../catalog/catalog";
import { DEMO_SCENARIOS, providerFor, type DemoScenario, type ProviderResult } from "../fulfillment/provider";
import type { Session } from "../auth/sessions";
import { env } from "../env";
import { formatUnits } from "../payments/units";

export const QUOTE_TTL_MS = 90_000;

export type OrderStatus =
  | "reserved"
  | "pending_delivery"
  | "needs_reconciliation"
  | "completed"
  | "failed"
  | "reversed";

export interface OrderRow {
  id: string;
  realm: string;
  user_id: string;
  item_id: string;
  quote_id: string;
  idempotency_key: string;
  credit_cost: number;
  status: OrderStatus;
  provider: string;
  provider_ref: string | null;
  provider_idempotency_key: string;
  code_ciphertext: string | null;
  failure_reason: string | null;
  demo_scenario: DemoScenario | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  reversed_at: number | null;
}

export function availableItem(realm: string, itemId: string): CatalogItem {
  const item = getItem(realm, itemId);
  if (!item || item.status === "unavailable" || item.category !== "shark_card") throw notFound("Reward");
  if (item.status === "out_of_stock" || item.stock === 0) {
    throw new AppError("out_of_stock", "This reward is out of stock for that platform and region", 409);
  }
  return item;
}

/** Server-priced quote. The browser never supplies a price. */
export function createQuote(session: Session, itemId: string, now = Date.now()) {
  if (!providerFor(session.realm)) {
    throw new AppError("fulfillment_unavailable", "Live redemption is not available yet. No fulfilment provider is connected.", 503);
  }
  const item = availableItem(session.realm, itemId);
  const id = randomId("qte");
  run(
    `INSERT INTO quotes (id, realm, user_id, item_id, credit_cost, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    session.realm,
    session.userId,
    item.id,
    item.credit_cost,
    now,
    now + QUOTE_TTL_MS,
  );
  const balances = userBalances(session.realm, session.userId);
  return {
    quoteId: id,
    itemId: item.id,
    creditCost: item.credit_cost,
    expiresAt: now + QUOTE_TTL_MS,
    available: balances.available,
    sufficient: balances.available >= item.credit_cost,
  };
}

export function orderEvent(orderId: string, status: string, note: string, now: number) {
  run(`INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, ?, ?, ?)`, orderId, status, note, now);
}
const event = orderEvent;

/** The $SHARK payment that paid for an order, if it wasn't paid with credits. */
function sharkPaymentFor(orderId: string) {
  return one<{ id: string; amount_gross: string; payer: string | null; tx_signature: string | null }>(
    `SELECT id, amount_gross, payer, tx_signature FROM shark_payments WHERE order_id = ?`,
    orderId,
  );
}

function markRefundDue(orderId: string, note: string, now: number) {
  run(
    `UPDATE shark_payments SET status = 'refund_due', note = ?, updated_at = ? WHERE order_id = ? AND status = 'paid'`,
    note,
    now,
    orderId,
  );
}

/**
 * Confirms a quote. Atomically: dedupes on the client idempotency key,
 * validates the quote, reserves credits in the ledger and decrements stock.
 * Fulfilment is then attempted outside the transaction.
 */
export async function confirmRedemption(
  session: Session,
  input: { quoteId: string; idempotencyKey: string; demoScenario?: string },
  now = Date.now(),
) {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(input.idempotencyKey)) {
    throw new AppError("invalid_request", "A valid idempotency key is required");
  }
  const provider = providerFor(session.realm);
  if (!provider) throw new AppError("fulfillment_unavailable", "Live redemption is not available yet", 503);
  const scenario: DemoScenario | null = provider.simulated
    ? DEMO_SCENARIOS.includes(input.demoScenario as DemoScenario)
      ? (input.demoScenario as DemoScenario)
      : "instant"
    : null;

  const reserved = tx(() => {
    const dup = one<OrderRow>(
      `SELECT * FROM orders WHERE user_id = ? AND idempotency_key = ?`,
      session.userId,
      input.idempotencyKey,
    );
    if (dup) return { order: dup, duplicate: true };

    const quote = one<{
      id: string;
      realm: string;
      user_id: string;
      item_id: string;
      credit_cost: number;
      expires_at: number;
      used_at: number | null;
    }>(`SELECT * FROM quotes WHERE id = ?`, input.quoteId);
    if (!quote || quote.user_id !== session.userId || quote.realm !== session.realm) throw notFound("Quote");
    if (quote.used_at) {
      const existing = one<OrderRow>(`SELECT * FROM orders WHERE quote_id = ? AND user_id = ?`, quote.id, session.userId);
      if (existing) return { order: existing, duplicate: true };
      throw new AppError("quote_used", "This quote was already used", 409);
    }
    if (quote.expires_at <= now) {
      throw new AppError("quote_expired", "This quote expired. Review the latest cost and confirm again.", 409);
    }
    const item = availableItem(session.realm, quote.item_id);
    if (item.credit_cost !== quote.credit_cost) {
      throw new AppError("quote_expired", "The credit cost changed. Review the new cost and confirm again.", 409);
    }

    const orderId = randomId("ord");
    run(`UPDATE quotes SET used_at = ? WHERE id = ? AND used_at IS NULL`, now, quote.id);
    run(
      `INSERT INTO orders (id, realm, user_id, item_id, quote_id, idempotency_key, credit_cost, status, provider,
        provider_idempotency_key, demo_scenario, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?, ?)`,
      orderId,
      session.realm,
      session.userId,
      item.id,
      quote.id,
      input.idempotencyKey,
      quote.credit_cost,
      provider.id,
      `pik_${orderId}`,
      scenario,
      now,
      now,
    );
    post(
      session.realm,
      {
        kind: "reservation",
        idempotencyKey: `reserve:${orderId}`,
        refType: "order",
        refId: orderId,
        memo: `Credits reserved for ${item.name}`,
        entries: [
          { account: acct.available(session.userId), amount: -quote.credit_cost },
          { account: acct.reserved(session.userId), amount: quote.credit_cost },
        ],
      },
      now,
    );
    if (item.stock !== null) {
      const res = run(`UPDATE catalog_items SET stock = stock - 1 WHERE id = ? AND stock > 0`, item.id);
      if (res.changes !== 1) throw new AppError("out_of_stock", "This reward just went out of stock", 409);
      run(`UPDATE catalog_items SET status = 'out_of_stock' WHERE id = ? AND stock = 0`, item.id);
    }
    event(orderId, "reserved", "Credits reserved. Sending order to the fulfilment provider.", now);
    return { order: one<OrderRow>(`SELECT * FROM orders WHERE id = ?`, orderId)!, duplicate: false };
  });

  if (reserved.duplicate) return { order: reserved.order, duplicate: true };
  return { order: await submitOrder(reserved.order, now), duplicate: false };
}

/** Sends a reserved order to its provider once and applies the outcome. */
export async function submitOrder(order: OrderRow, now = Date.now()): Promise<OrderRow> {
  const provider = providerFor(order.realm);
  let result: ProviderResult;
  if (!provider) {
    result = { status: "unknown", reason: "No fulfilment provider is connected" };
  } else {
    try {
      result = await provider.submit({
        orderId: order.id,
        idempotencyKey: order.provider_idempotency_key,
        providerSku: getItem(order.realm, order.item_id)!.provider_sku,
      });
    } catch {
      result = { status: "unknown", reason: "Provider did not respond" };
    }
  }
  applyProviderResult(order.id, result, now);
  return one<OrderRow>(`SELECT * FROM orders WHERE id = ?`, order.id)!;
}

/**
 * Applies a provider outcome. State transitions are guarded so a late or
 * duplicated provider message cannot double-capture or double-refund.
 */
export function applyProviderResult(orderId: string, result: ProviderResult, now = Date.now()) {
  tx(() => {
    const o = one<OrderRow>(`SELECT * FROM orders WHERE id = ?`, orderId);
    if (!o) throw notFound("Order");
    const open = o.status === "reserved" || o.status === "pending_delivery" || o.status === "needs_reconciliation";
    const shark = sharkPaymentFor(o.id);

    if (result.status === "delivered" && open) {
      if (!shark) post(o.realm, {
        kind: "capture",
        idempotencyKey: `capture:${o.id}`,
        refType: "order",
        refId: o.id,
        memo: "Redemption completed",
        entries: [
          { account: acct.reserved(o.user_id), amount: -o.credit_cost },
          { account: acct.redeemed, amount: o.credit_cost },
        ],
      }, now);
      run(
        `UPDATE orders SET status = 'completed', provider_ref = ?, code_ciphertext = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
        result.providerRef,
        result.code ? encrypt(result.code) : null,
        now,
        now,
        o.id,
      );
      event(o.id, "completed", result.code ? "Delivered. Your code is ready." : "Delivered by the provider.", now);
    } else if (result.status === "pending" && (o.status === "reserved" || o.status === "needs_reconciliation")) {
      run(`UPDATE orders SET status = 'pending_delivery', provider_ref = ?, updated_at = ? WHERE id = ?`, result.providerRef, now, o.id);
      event(o.id, "pending_delivery", "The provider accepted the order and is preparing delivery.", now);
    } else if (result.status === "failed" && open) {
      event(o.id, "failed", `Delivery failed: ${result.reason}`, now);
      release(o, "release", "Delivery failed. Reserved credits were returned.", now);
      if (shark) markRefundDue(o.id, `Delivery failed: ${result.reason}`, now);
      run(
        `UPDATE orders SET status = 'reversed', failure_reason = ?, reversed_at = ?, updated_at = ? WHERE id = ?`,
        result.reason,
        now,
        now,
        o.id,
      );
      event(
        o.id,
        "reversed",
        shark ? "Your $SHARK payment will be refunded to the wallet it was sent from." : "Credits returned to your available balance.",
        now,
      );
    } else if (result.status === "voided" && o.status === "completed") {
      if (shark) markRefundDue(o.id, `Provider voided the code: ${result.reason}`, now);
      else post(o.realm, {
        kind: "reversal",
        idempotencyKey: `reversal:${o.id}`,
        refType: "order",
        refId: o.id,
        memo: "Provider voided the delivered reward. Credits returned.",
        entries: [
          { account: acct.redeemed, amount: -o.credit_cost },
          { account: acct.available(o.user_id), amount: o.credit_cost },
        ],
      }, now);
      run(
        `UPDATE orders SET status = 'reversed', failure_reason = ?, reversed_at = ?, updated_at = ?, code_ciphertext = NULL WHERE id = ?`,
        result.reason,
        now,
        now,
        o.id,
      );
      event(
        o.id,
        "reversed",
        shark ? "The provider voided this reward. Your $SHARK payment will be refunded." : "The provider voided this reward. Credits were returned.",
        now,
      );
    } else if (result.status === "unknown" && (o.status === "reserved" || o.status === "pending_delivery")) {
      run(`UPDATE orders SET status = 'needs_reconciliation', updated_at = ? WHERE id = ?`, now, o.id);
      event(
        o.id,
        "needs_reconciliation",
        shark
          ? "We're confirming the outcome with the provider. Your payment is recorded."
          : "We're confirming the outcome with the provider. Credits stay reserved until then.",
        now,
      );
    }
  });
}

function release(o: OrderRow, kind: "release", memo: string, now: number) {
  if (!sharkPaymentFor(o.id)) post(o.realm, {
    kind,
    idempotencyKey: `release:${o.id}`,
    refType: "order",
    refId: o.id,
    memo,
    entries: [
      { account: acct.reserved(o.user_id), amount: -o.credit_cost },
      { account: acct.available(o.user_id), amount: o.credit_cost },
    ],
  }, now);
  run(
    `UPDATE catalog_items SET stock = stock + 1, status = CASE WHEN status = 'out_of_stock' THEN 'available' ELSE status END
     WHERE id = ? AND stock IS NOT NULL`,
    o.item_id,
  );
}

/** Ownership-checked fetch. Another member's order is indistinguishable from a missing one. */
export function getOrder(session: Session, orderId: string): OrderRow {
  const o = one<OrderRow>(`SELECT * FROM orders WHERE id = ? AND user_id = ? AND realm = ?`, orderId, session.userId, session.realm);
  if (!o) throw notFound("Order");
  return o;
}

/** Asks the provider for the authoritative state of an uncertain or pending order. */
export async function reconcileOrder(session: Session, orderId: string) {
  const o = getOrder(session, orderId);
  if (o.status !== "pending_delivery" && o.status !== "needs_reconciliation") return o;
  const provider = providerFor(o.realm);
  if (!provider) return o;
  try {
    applyProviderResult(o.id, await provider.status(o.provider_idempotency_key));
  } catch {
    /* stays in its current state; try again later */
  }
  return getOrder(session, orderId);
}

export function revealCode(session: Session, orderId: string): string | null {
  const o = getOrder(session, orderId);
  if (o.status !== "completed" || !o.code_ciphertext) return null;
  return decrypt(o.code_ciphertext);
}

export function orderEvents(orderId: string) {
  return all<{ status: string; note: string; created_at: number }>(
    `SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id`,
    orderId,
  );
}

export function listOrders(session: Session) {
  return all<OrderRow & { item_name: string; platform: string; region: string; gta_amount: number }>(
    `SELECT o.*, c.name AS item_name, c.platform, c.region, c.gta_amount FROM orders o JOIN catalog_items c ON c.id = o.item_id
     WHERE o.user_id = ? AND o.realm = ? ORDER BY o.created_at DESC`,
    session.userId,
    session.realm,
  );
}

export type OrderView = ReturnType<typeof orderView>;

/** Public view of an order with the code omitted. */
export function orderView(o: OrderRow) {
  const item = one<CatalogItem>(`SELECT * FROM catalog_items WHERE id = ?`, o.item_id);
  const shark = one<{ amount_gross: string; usd_cents: number; tx_signature: string | null; status: string }>(
    `SELECT amount_gross, usd_cents, tx_signature, status FROM shark_payments WHERE order_id = ?`,
    o.id,
  );
  return {
    id: o.id,
    status: o.status,
    creditCost: o.credit_cost,
    payment: shark
      ? {
          method: "shark" as const,
          amount: formatUnits(BigInt(shark.amount_gross), env().TOKEN_DECIMALS),
          usdCents: shark.usd_cents,
          txSignature: shark.tx_signature,
          explorerUrl: shark.tx_signature ? `https://solscan.io/tx/${shark.tx_signature}` : null,
          refundDue: shark.status === "refund_due",
        }
      : { method: "credits" as const },
    provider: o.provider,
    providerRef: o.provider_ref,
    failureReason: o.failure_reason,
    hasCode: Boolean(o.code_ciphertext),
    simulated: o.provider === "demo",
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    completedAt: o.completed_at,
    reversedAt: o.reversed_at,
    item: item
      ? {
          name: item.name,
          gtaAmount: item.gta_amount,
          platform: item.platform,
          region: item.region,
          gameVersion: item.game_version,
          sku: item.sku,
          isDemo: Boolean(item.is_demo),
        }
      : null,
    instructions: item ? redemptionInstructions(item.platform) : [],
    events: orderEvents(o.id),
  };
}
