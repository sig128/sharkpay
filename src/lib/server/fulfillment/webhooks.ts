import { z } from "zod";
import { one, run, tx } from "../db";
import { hmac, safeEqual } from "../crypto";
import { AppError } from "../errors";
import { applyProviderResult } from "../orders/orders";

const TOLERANCE_S = 300;

/**
 * Verifies `x-provider-signature: t=<unix>,v1=<hex hmac_sha256(secret, "<t>.<raw body>")>`.
 * Real providers have their own scheme; adapt the parser, keep the checks:
 * constant-time compare, timestamp tolerance, and event-id replay rejection.
 */
export function verifyWebhookSignature(secret: string, header: string | null, rawBody: string, nowS = Math.floor(Date.now() / 1000)) {
  if (!header) throw new AppError("bad_signature", "Missing signature", 401);
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) throw new AppError("bad_signature", "Malformed signature", 401);
  if (Math.abs(nowS - t) > TOLERANCE_S) throw new AppError("stale_signature", "Signature timestamp outside tolerance", 401);
  if (!safeEqual(hmac(secret, `${t}.${rawBody}`), parts.v1)) throw new AppError("bad_signature", "Invalid signature", 401);
}

const payload = z.object({
  id: z.string().min(8).max(128),
  type: z.enum(["order.delivered", "order.pending", "order.failed", "order.voided"]),
  data: z.object({
    idempotencyKey: z.string().min(8).max(128),
    providerRef: z.string().max(128).optional(),
    code: z.string().max(256).optional(),
    reason: z.string().max(256).optional(),
  }),
});

export function handleFulfillmentWebhook(provider: string, secret: string, header: string | null, rawBody: string) {
  verifyWebhookSignature(secret, header, rawBody);
  const body = payload.parse(JSON.parse(rawBody));
  return tx(() => {
    const inserted = run(
      `INSERT OR IGNORE INTO webhook_events (provider, event_id, received_at) VALUES (?, ?, ?)`,
      provider,
      body.id,
      Date.now(),
    );
    if (inserted.changes === 0) return { replay: true };
    const order = one<{ id: string }>(
      `SELECT id FROM orders WHERE provider = ? AND provider_idempotency_key = ?`,
      provider,
      body.data.idempotencyKey,
    );
    if (!order) throw new AppError("not_found", "Unknown order", 404);
    const ref = body.data.providerRef ?? "";
    const reason = body.data.reason ?? "Reported by provider";
    switch (body.type) {
      case "order.delivered":
        applyProviderResult(order.id, { status: "delivered", providerRef: ref, code: body.data.code });
        break;
      case "order.pending":
        applyProviderResult(order.id, { status: "pending", providerRef: ref });
        break;
      case "order.failed":
        applyProviderResult(order.id, { status: "failed", providerRef: ref, reason });
        break;
      case "order.voided":
        applyProviderResult(order.id, { status: "voided", providerRef: ref, reason });
        break;
    }
    return { replay: false };
  });
}
