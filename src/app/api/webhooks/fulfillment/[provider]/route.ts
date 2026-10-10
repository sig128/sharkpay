import { NextResponse } from "next/server";
import { env } from "@/lib/server/env";
import { errorResponse } from "@/lib/server/http";
import { handleFulfillmentWebhook } from "@/lib/server/fulfillment/webhooks";

/** Signed provider callbacks. Server-to-server, so no same-origin check; the HMAC is the authentication. */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const secret = env().FULFILLMENT_WEBHOOK_SECRET;
  if (!secret || provider !== env().FULFILLMENT_PROVIDER || provider === "none") {
    return NextResponse.json({ error: { code: "not_configured" } }, { status: 404 });
  }
  try {
    const raw = await req.text();
    const result = handleFulfillmentWebhook(provider, secret, req.headers.get("x-provider-signature"), raw);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
