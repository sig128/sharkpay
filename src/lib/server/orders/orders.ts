import { all, one, run, tx } from "../db";
import { decrypt, encrypt } from "../crypto";
import { AppError, notFound } from "../errors";
import { getItem, redemptionInstructions, type CatalogItem } from "../catalog/catalog";
import { providerFor, type DemoScenario, type ProviderResult } from "../fulfillment/provider";
import type { Session } from "../auth/sessions";
import { env } from "../env";
import { formatUnits } from "../payments/units";

export type OrderStatus =
  | "reserved"
  | "pending_delivery"
  | "needs_reconciliation"
  | "completed"
  | "failed"
  | "reversed";

/** Orders exist only once a $SHARK payment for them is confirmed (`payment_id`). */
export interface OrderRow {
  id: string;
  realm: string;
  user_id: string;
  item_id: string;
  payment_id: string;
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

export function orderEvent(orderId: string, status: string, note: string, now: number) {
  run(`INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, ?, ?, ?)`, orderId, status, note, now);
}
const event = orderEvent;

function markRefundDue(orderId: string, note: string, now: number) {
  run(
    `UPDATE shark_payments SET status = 'refund_due', note = ?, updated_at = ? WHERE order_id = ? AND status = 'paid'`,
    note,
    now,
    orderId,
  );
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
 * duplicated provider message cannot double-deliver or double-refund.
 */
export function applyProviderResult(orderId: string, result: ProviderResult, now = Date.now()) {
  tx(() => {
    const o = one<OrderRow>(`SELECT * FROM orders WHERE id = ?`, orderId);
    if (!o) throw notFound("Order");
    const open = o.status === "reserved" || o.status === "pending_delivery" || o.status === "needs_reconciliation";

    if (result.status === "delivered" && open) {
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
      restock(o);
      markRefundDue(o.id, `Delivery failed: ${result.reason}`, now);
      run(
        `UPDATE orders SET status = 'reversed', failure_reason = ?, reversed_at = ?, updated_at = ? WHERE id = ?`,
        result.reason,
        now,
        now,
        o.id,
      );
      event(o.id, "reversed", "Your $SHARK payment will be refunded to the wallet it was sent from.", now);
    } else if (result.status === "voided" && o.status === "completed") {
      markRefundDue(o.id, `Provider voided the code: ${result.reason}`, now);
      run(
        `UPDATE orders SET status = 'reversed', failure_reason = ?, reversed_at = ?, updated_at = ?, code_ciphertext = NULL WHERE id = ?`,
        result.reason,
        now,
        now,
        o.id,
      );
      event(o.id, "reversed", "The provider voided this reward. Your $SHARK payment will be refunded.", now);
    } else if (result.status === "unknown" && (o.status === "reserved" || o.status === "pending_delivery")) {
      run(`UPDATE orders SET status = 'needs_reconciliation', updated_at = ? WHERE id = ?`, now, o.id);
      event(o.id, "needs_reconciliation", "We're confirming the outcome with the provider. Your payment is recorded.", now);
    }
  });
}

function restock(o: OrderRow) {
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
  const shark = one<{ amount_gross: string; sol_price_lamports: number; tx_signature: string | null; status: string }>(
    `SELECT amount_gross, sol_price_lamports, tx_signature, status FROM shark_payments WHERE id = ?`,
    o.payment_id,
  );
  const simulated = o.realm.startsWith("demo:");
  return {
    id: o.id,
    status: o.status,
    payment: {
      method: "shark" as const,
      amount: shark ? formatUnits(BigInt(shark.amount_gross), env().TOKEN_DECIMALS) : null,
      solPriceLamports: shark?.sol_price_lamports ?? null,
      txSignature: simulated ? null : (shark?.tx_signature ?? null),
      explorerUrl: !simulated && shark?.tx_signature ? `https://solscan.io/tx/${shark.tx_signature}` : null,
      refundDue: shark?.status === "refund_due",
      simulated,
    },
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
