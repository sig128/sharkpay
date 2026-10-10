import { consumeFlow, type AuthFlow } from "@/lib/server/auth/flows";
import { completeXboxLink, xboxRedirectUri } from "@/lib/server/auth/microsoft";
import { authErrorRedirect, clearFlowCookie, completeAuth, readFlowCookie } from "@/lib/server/auth/complete";

export async function GET(req: Request) {
  const incoming = new URL(req.url);
  let flow: AuthFlow | null = null;
  try {
    flow = consumeFlow(incoming.searchParams.get("state"), "xbox", await readFlowCookie());
    const callbackUrl = new URL(xboxRedirectUri());
    callbackUrl.search = incoming.search;
    const profile = await completeXboxLink(callbackUrl, { state: flow.state, codeVerifier: flow.codeVerifier! });
    return clearFlowCookie(await completeAuth(flow, profile));
  } catch (err) {
    return authErrorRedirect(err, flow);
  }
}
