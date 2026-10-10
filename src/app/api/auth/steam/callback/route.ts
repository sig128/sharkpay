import { consumeFlow, type AuthFlow } from "@/lib/server/auth/flows";
import { verifySteamAssertion } from "@/lib/server/auth/steam";
import { authErrorRedirect, clearFlowCookie, completeAuth, readFlowCookie } from "@/lib/server/auth/complete";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  let flow: AuthFlow | null = null;
  try {
    flow = consumeFlow(params.get("state"), "steam", await readFlowCookie());
    const profile = await verifySteamAssertion(params, flow.state);
    return clearFlowCookie(await completeAuth(flow, profile));
  } catch (err) {
    return authErrorRedirect(err, flow);
  }
}
