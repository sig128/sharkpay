import { consumeFlow, type AuthFlow } from "@/lib/server/auth/flows";
import { completeGoogleSignIn, googleRedirectUri } from "@/lib/server/auth/google";
import { authErrorRedirect, clearFlowCookie, completeAuth, readFlowCookie } from "@/lib/server/auth/complete";
import { AppError } from "@/lib/server/errors";

export async function GET(req: Request) {
  const incoming = new URL(req.url);
  let flow: AuthFlow | null = null;
  try {
    flow = consumeFlow(incoming.searchParams.get("state"), "google", await readFlowCookie());
    if (incoming.searchParams.get("error")) throw new AppError("provider_denied", "Google sign-in was cancelled");
    const callbackUrl = new URL(googleRedirectUri());
    callbackUrl.search = incoming.search;
    const profile = await completeGoogleSignIn(callbackUrl, {
      state: flow.state,
      nonce: flow.nonce!,
      codeVerifier: flow.codeVerifier!,
    });
    return clearFlowCookie(await completeAuth(flow, profile));
  } catch (err) {
    return authErrorRedirect(err, flow);
  }
}
