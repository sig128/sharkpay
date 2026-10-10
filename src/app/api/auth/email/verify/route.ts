import { NextResponse } from "next/server";
import { z } from "zod";
import { api, clientKey, currentSession, rateLimit, setSessionCookie } from "@/lib/server/http";
import { verifyEmailCode } from "@/lib/server/auth/email";
import { getUser, linkIdentity, signInWithIdentity } from "@/lib/server/auth/accounts";
import { createSession, markReauthenticated } from "@/lib/server/auth/sessions";
import { one } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";

const body = z.object({
  email: z.string().max(254),
  code: z.string().regex(/^\d{6}$/),
  purpose: z.enum(["login", "link", "reauth"]).default("login"),
  platform: z.enum(["pc", "playstation", "xbox"]).optional(),
});

export const POST = api(async (req) => {
  const input = body.parse(await req.json());
  rateLimit(`email-verify:${await clientKey()}`, 20, 15 * 60_000);
  const profile = verifyEmailCode(input.email, input.code);

  if (input.purpose === "login") {
    const { userId } = signInWithIdentity("live", profile);
    const { token, session } = createSession({ userId, realm: "live", kind: "real", authProvider: "email" });
    const user = getUser(userId)!;
    const res = NextResponse.json({ redirect: user.onboarded_at ? "/app" : `/onboarding${input.platform ? `?platform=${input.platform}` : ""}` });
    setSessionCookie(res, token, session.expiresAt);
    return res;
  }

  const session = await currentSession();
  if (!session || session.kind !== "real") throw new AppError("unauthorized", "Sign in first", 401);
  if (input.purpose === "reauth") {
    const owner = one<{ user_id: string }>(
      `SELECT user_id FROM identities WHERE realm = 'live' AND provider = 'email' AND subject = ?`,
      profile.subject,
    );
    if (owner?.user_id !== session.userId) {
      throw new AppError("reauth_wrong_account", "Use an email that's already connected to this membership", 403);
    }
    markReauthenticated(session.idHash, "email");
    return NextResponse.json({ ok: true });
  }
  linkIdentity(session, profile);
  return NextResponse.json({ ok: true });
});
