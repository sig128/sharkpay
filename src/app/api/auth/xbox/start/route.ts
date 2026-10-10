import { NextResponse } from "next/server";
import * as oidc from "openid-client";
import { createFlow } from "@/lib/server/auth/flows";
import { xboxAuthorizationUrl } from "@/lib/server/auth/microsoft";
import { authErrorRedirect, setFlowCookie } from "@/lib/server/auth/complete";
import { currentSession } from "@/lib/server/http";
import { integrations } from "@/lib/server/env";
import { AppError } from "@/lib/server/errors";
import { requireRecentAuth } from "@/lib/server/auth/accounts";

/** Xbox profile verification is link-only, on top of an existing signed-in account. */
export async function GET() {
  try {
    if (!integrations().xbox) throw new AppError("provider_unavailable", "Xbox verification is not enabled", 503);
    const session = await currentSession();
    if (!session) throw new AppError("unauthorized", "Sign in first", 401);
    requireRecentAuth(session);
    const flow = createFlow({
      provider: "xbox",
      purpose: "link",
      codeVerifier: oidc.randomPKCECodeVerifier(),
      nonce: null,
      userId: session.userId,
      sessionHash: session.idHash,
      returnTo: "/app/accounts",
    });
    return setFlowCookie(NextResponse.redirect(await xboxAuthorizationUrl(flow.state, flow.codeVerifier!), 303), flow.state);
  } catch (err) {
    return authErrorRedirect(err, { purpose: "link", returnTo: "/app/accounts" } as never);
  }
}
