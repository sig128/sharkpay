import { one } from "../db";
import { env } from "../env";
import { randomToken } from "../crypto";

/**
 * Fulfilment provider boundary. A real provider (a licensed digital-code
 * distributor) is integrated by implementing this interface. Every call carries
 * the order's provider idempotency key so a retried submit can never buy twice.
 */
export type ProviderResult =
  | { status: "delivered"; providerRef: string; code?: string }
  | { status: "pending"; providerRef: string }
  /** Definitive failure: the provider confirms nothing was charged or issued. */
  | { status: "failed"; providerRef?: string; reason: string }
  /** Code was issued then voided/refunded by the provider. */
  | { status: "voided"; providerRef: string; reason: string }
  /** Outcome not known (timeout, 5xx). Must be reconciled, never auto-refunded. */
  | { status: "unknown"; reason: string };

export interface SubmitRequest {
  orderId: string;
  idempotencyKey: string;
  providerSku: string;
}

export interface FulfillmentProvider {
  readonly id: string;
  readonly simulated: boolean;
  submit(req: SubmitRequest): Promise<ProviderResult>;
  status(idempotencyKey: string): Promise<ProviderResult>;
}

export const DEMO_SCENARIOS = ["instant", "pending", "fail", "uncertain"] as const;
export type DemoScenario = (typeof DEMO_SCENARIOS)[number];
const PENDING_DELAY_MS = 8_000;

function demoCode() {
  const r = randomToken(6).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  return `DEMO-NOT-REDEEMABLE-${r.slice(0, 4)}-${r.slice(4, 8)}`;
}

/** Simulated provider for demo realms. It never returns a usable code. */
export const demoProvider: FulfillmentProvider = {
  id: "demo",
  simulated: true,
  async submit(req) {
    const order = one<{ demo_scenario: DemoScenario | null }>(
      `SELECT demo_scenario FROM orders WHERE provider_idempotency_key = ?`,
      req.idempotencyKey,
    );
    const ref = `demo_${req.idempotencyKey.slice(-10)}`;
    switch (order?.demo_scenario ?? "instant") {
      case "pending":
        return { status: "pending", providerRef: ref };
      case "fail":
        return { status: "failed", providerRef: ref, reason: "Demo provider declined the order (simulated)" };
      case "uncertain":
        return { status: "unknown", reason: "Demo provider timed out (simulated)" };
      default:
        return { status: "delivered", providerRef: ref, code: demoCode() };
    }
  },
  async status(idempotencyKey) {
    const order = one<{ demo_scenario: DemoScenario | null; created_at: number }>(
      `SELECT demo_scenario, created_at FROM orders WHERE provider_idempotency_key = ?`,
      idempotencyKey,
    );
    const ref = `demo_${idempotencyKey.slice(-10)}`;
    if (!order) return { status: "failed", reason: "Order unknown to provider" };
    if (order.demo_scenario === "pending") {
      return Date.now() - order.created_at >= PENDING_DELAY_MS
        ? { status: "delivered", providerRef: ref, code: demoCode() }
        : { status: "pending", providerRef: ref };
    }
    if (order.demo_scenario === "uncertain") {
      return { status: "failed", providerRef: ref, reason: "Provider confirmed the order was never charged (simulated)" };
    }
    return { status: "pending", providerRef: ref };
  },
};

/**
 * Live realm has no provider until a real one is integrated and selected via
 * FULFILLMENT_PROVIDER, so live redemption fails closed.
 */
export function providerFor(realm: string): FulfillmentProvider | null {
  if (realm.startsWith("demo:")) return demoProvider;
  switch (env().FULFILLMENT_PROVIDER) {
    case "none":
      return null;
  }
}
