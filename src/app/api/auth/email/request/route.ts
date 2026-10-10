import { NextResponse } from "next/server";
import { z } from "zod";
import { api, clientKey, rateLimit } from "@/lib/server/http";
import { requestEmailCode } from "@/lib/server/auth/email";
import { lookupHash } from "@/lib/server/crypto";

export const POST = api(async (req) => {
  const { email } = z.object({ email: z.string().max(254) }).parse(await req.json());
  rateLimit(`email-ip:${await clientKey()}`, 10, 15 * 60_000);
  rateLimit(`email:${lookupHash(email)}`, 3, 10 * 60_000);
  const { devCode } = await requestEmailCode(email);
  return NextResponse.json({ sent: true, devCode });
});
