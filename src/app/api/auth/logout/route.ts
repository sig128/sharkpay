import { NextResponse } from "next/server";
import { z } from "zod";
import { api, cookieOptions, currentSession } from "@/lib/server/http";
import { revokeAllSessions, revokeSession, SESSION_COOKIE } from "@/lib/server/auth/sessions";

export const POST = api(async (req) => {
  const { everywhere } = z.object({ everywhere: z.boolean().default(false) }).parse(await req.json().catch(() => ({})));
  const session = await currentSession();
  if (session) {
    if (everywhere) revokeAllSessions(session.userId);
    revokeSession(session.idHash);
  }
  const res = NextResponse.json({ redirect: "/" });
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  return res;
});
