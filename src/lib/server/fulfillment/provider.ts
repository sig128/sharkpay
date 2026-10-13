import { env } from "../env";

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
  submit(req: SubmitRequest): Promise<ProviderResult>;
  status(idempotencyKey: string): Promise<ProviderResult>;
}

/**
 * There is no provider until a real one is integrated and selected via
 * FULFILLMENT_PROVIDER, so redemption fails closed.
 */
export function providerFor(): FulfillmentProvider | null {
  switch (env().FULFILLMENT_PROVIDER) {
    case "none":
      return null;
  }
}
