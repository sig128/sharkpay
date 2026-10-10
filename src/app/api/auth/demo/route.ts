import { NextResponse } from "next/server";
import { api, clientKey, rateLimit, setSessionCookie } from "@/lib/server/http";
import { createDemoRealm, pruneDemoRealms } from "@/lib/server/simulation/demo";
import { createSession } from "@/lib/server/auth/sessions";

/** Starts an isolated demo sandbox. No real authentication, no real credits. */
export const POST = api(async () => {
  rateLimit(`demo:${await clientKey()}`, 20, 60 * 60_000);
  pruneDemoRealms();
  const { realm, userId } = await createDemoRealm();
  const { token, session } = createSession({ userId, realm, kind: "demo", authProvider: "demo" });
  const res = NextResponse.json({ redirect: "/app" });
  setSessionCookie(res, token, session.expiresAt);
  return res;
});
