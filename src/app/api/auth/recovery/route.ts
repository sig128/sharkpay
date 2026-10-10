import { NextResponse } from "next/server";
import { z } from "zod";
import { api, clientKey, rateLimit, setSessionCookie } from "@/lib/server/http";
import { consumeRecoveryCode } from "@/lib/server/auth/accounts";
import { createSession } from "@/lib/server/auth/sessions";
import { AppError } from "@/lib/server/errors";

/** Account recovery with a single-use code issued from Connected Accounts. */
export const POST = api(async (req) => {
  const { code } = z.object({ code: z.string().min(12).max(20) }).parse(await req.json());
  rateLimit(`recovery:${await clientKey()}`, 5, 15 * 60_000);
  const userId = consumeRecoveryCode(code);
  if (!userId) throw new AppError("invalid_code", "That recovery code isn't valid or was already used", 401);
  const { token, session } = createSession({ userId, realm: "live", kind: "real", authProvider: "recovery" });
  const res = NextResponse.json({ redirect: "/app/accounts?recovered=1" });
  setSessionCookie(res, token, session.expiresAt);
  return res;
});
