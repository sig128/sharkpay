import { NextResponse } from "next/server";
import * as oidc from "openid-client";
import { createFlow } from "@/lib/server/auth/flows";
import { xAuthorizationUrl } from "@/lib/server/auth/x";
import { authErrorRedirect, flowContext, setFlowCookie } from "@/lib/server/auth/complete";
import { clientKey, rateLimit } from "@/lib/server/http";

export async function GET(req: Request) {
  try {
    rateLimit(`auth:${await clientKey()}`, 30, 10 * 60_000);
    const url = new URL(req.url);
    const { purpose, session } = await flowContext(url.searchParams.get("purpose"));
    const flow = createFlow({
      provider: "x",
      purpose,
      codeVerifier: oidc.randomPKCECodeVerifier(),
      nonce: null,
      userId: session?.userId ?? null,
      sessionHash: session?.idHash ?? null,
      returnTo: url.searchParams.get("returnTo"),
    });
    return setFlowCookie(NextResponse.redirect(await xAuthorizationUrl(flow.state, flow.codeVerifier!), 303), flow.state);
  } catch (err) {
    return authErrorRedirect(err);
  }
}
