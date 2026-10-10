import { NextResponse } from "next/server";
import { createFlow } from "@/lib/server/auth/flows";
import { steamAuthorizationUrl } from "@/lib/server/auth/steam";
import { authErrorRedirect, flowContext, setFlowCookie } from "@/lib/server/auth/complete";
import { clientKey, rateLimit } from "@/lib/server/http";
import { integrations } from "@/lib/server/env";
import { AppError } from "@/lib/server/errors";

export async function GET(req: Request) {
  try {
    if (!integrations().steam) throw new AppError("provider_unavailable", "Steam sign-in is not enabled", 503);
    rateLimit(`auth:${await clientKey()}`, 30, 10 * 60_000);
    const url = new URL(req.url);
    const { purpose, session } = await flowContext(url.searchParams.get("purpose"));
    const flow = createFlow({
      provider: "steam",
      purpose,
      codeVerifier: null,
      nonce: null,
      userId: session?.userId ?? null,
      sessionHash: session?.idHash ?? null,
      returnTo: url.searchParams.get("returnTo"),
    });
    return setFlowCookie(NextResponse.redirect(steamAuthorizationUrl(flow.state), 303), flow.state);
  } catch (err) {
    return authErrorRedirect(err);
  }
}
