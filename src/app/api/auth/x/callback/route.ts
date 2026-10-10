import { consumeFlow, type AuthFlow } from "@/lib/server/auth/flows";
import { completeXSignIn, xRedirectUri } from "@/lib/server/auth/x";
import { authErrorRedirect, clearFlowCookie, completeAuth, readFlowCookie } from "@/lib/server/auth/complete";
import { AppError } from "@/lib/server/errors";

export async function GET(req: Request) {
  const incoming = new URL(req.url);
  let flow: AuthFlow | null = null;
  try {
    flow = consumeFlow(incoming.searchParams.get("state"), "x", await readFlowCookie());
    if (incoming.searchParams.get("error")) throw new AppError("provider_denied", "X sign-in was cancelled");
    const callbackUrl = new URL(xRedirectUri());
    callbackUrl.search = incoming.search;
    const profile = await completeXSignIn(callbackUrl, { state: flow.state, codeVerifier: flow.codeVerifier! });
    return clearFlowCookie(await completeAuth(flow, profile));
  } catch (err) {
    return authErrorRedirect(err, flow);
  }
}
