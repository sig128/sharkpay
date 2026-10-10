import { NextResponse } from "next/server";
import { env } from "@/lib/server/env";
import { errorResponse } from "@/lib/server/http";
import { ingest, ingestBatch } from "@/lib/server/chain/ingest";
import { verifyWebhookSignature } from "@/lib/server/fulfillment/webhooks";

/**
 * Indexer push endpoint for finalized chain events (live realm only).
 * Authenticated with the same timestamped HMAC scheme as provider webhooks.
 */
export async function POST(req: Request) {
  const secret = env().CHAIN_INGEST_SECRET;
  if (!secret || !env().TOKEN_MINT) return NextResponse.json({ error: { code: "not_configured" } }, { status: 404 });
  try {
    const raw = await req.text();
    verifyWebhookSignature(secret, req.headers.get("x-ingest-signature"), raw);
    const batch = ingestBatch.parse(JSON.parse(raw));
    return NextResponse.json(ingest("live", batch));
  } catch (err) {
    return errorResponse(err);
  }
}
