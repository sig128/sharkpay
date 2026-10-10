import { consumeFlow, type AuthFlow } from "@/lib/server/auth/flows";
import { completeMicrosoftSignIn, microsoftRedirectUri } from "@/lib/server/auth/microsoft";
import { authErrorRedirect, clearFlowCookie, completeAuth, readFlowCookie } from "@/lib/server/auth/complete";
import { AppError } from "@/lib/server/errors";

export async function GET(req: Request) {
  const incoming = new URL(req.url);
  let flow: AuthFlow | null = null;
  try {
    flow = consumeFlow(incoming.searchParams.get("state"), "microsoft", await readFlowCookie());
    if (incoming.searchParams.get("error")) throw new AppError("provider_denied", "Microsoft sign-in was cancelled");
    // Rebuild against the registered redirect URI so proxies can't alter what is validated.
    const callbackUrl = new URL(microsoftRedirectUri());
    callbackUrl.search = incoming.search;
    const profile = await completeMicrosoftSignIn(callbackUrl, {
      state: flow.state,
      nonce: flow.nonce!,
      codeVerifier: flow.codeVerifier!,
    });
    return clearFlowCookie(await completeAuth(flow, profile));
  } catch (err) {
    return authErrorRedirect(err, flow);
  }
}
