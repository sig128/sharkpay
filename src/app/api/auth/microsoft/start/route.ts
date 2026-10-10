import { NextResponse } from "next/server";
import * as oidc from "openid-client";
import { createFlow } from "@/lib/server/auth/flows";
import { microsoftAuthorizationUrl } from "@/lib/server/auth/microsoft";
import { authErrorRedirect, flowContext, setFlowCookie } from "@/lib/server/auth/complete";
import { clientKey, rateLimit } from "@/lib/server/http";

export async function GET(req: Request) {
  try {
    rateLimit(`auth:${await clientKey()}`, 30, 10 * 60_000);
    const url = new URL(req.url);
    const { purpose, session } = await flowContext(url.searchParams.get("purpose"));
    const flow = createFlow({
      provider: "microsoft",
      purpose,
      codeVerifier: oidc.randomPKCECodeVerifier(),
      nonce: oidc.randomNonce(),
      userId: session?.userId ?? null,
      sessionHash: session?.idHash ?? null,
      returnTo: url.searchParams.get("returnTo"),
    });
    const target = await microsoftAuthorizationUrl(flow.state, flow.nonce!, flow.codeVerifier!);
    return setFlowCookie(NextResponse.redirect(target, 303), flow.state);
  } catch (err) {
    return authErrorRedirect(err);
  }
}
