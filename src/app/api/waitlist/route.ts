import { NextResponse } from "next/server";
import { z } from "zod";
import { api, clientKey, currentSession, rateLimit } from "@/lib/server/http";
import { joinCardWaitlist } from "@/lib/server/issuer/issuer";

export const POST = api(async (req) => {
  rateLimit(`waitlist:${await clientKey()}`, 10, 60 * 60_000);
  const { email, region } = z.object({ email: z.string().max(254), region: z.string().max(8).optional() }).parse(await req.json());
  const session = await currentSession();
  const result = joinCardWaitlist({ email, region, userId: session?.kind === "real" ? session.userId : undefined });
  return NextResponse.json(result);
});
