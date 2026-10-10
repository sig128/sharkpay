import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/server/env";
import { safeEqual, sha256 } from "@/lib/server/crypto";
import { errorResponse } from "@/lib/server/http";
import { payoutsDue, recordPayout } from "@/lib/server/rewards/payouts";

/**
 * Operator-only. GET lists what members are owed; POST records a SOL payout the
 * operator already sent from the payout wallet. This endpoint never sends SOL.
 * Disabled (404) unless PAYOUT_RECORDER_SECRET is set.
 */
function authorized(req: Request) {
  const secret = env().PAYOUT_RECORDER_SECRET;
  if (!secret) return null;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return safeEqual(sha256(token), sha256(secret));
}

const payout = z.object({
  wallet: z.string().min(32).max(44),
  lamports: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  signature: z.string().min(64).max(90),
});

function gate(req: Request) {
  const ok = authorized(req);
  if (ok === null) return NextResponse.json({ error: { code: "not_configured" } }, { status: 404 });
  if (!ok) return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
  return null;
}

export async function GET(req: Request) {
  const denied = gate(req);
  if (denied) return denied;
  return NextResponse.json({ due: payoutsDue() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const denied = gate(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ payout: await recordPayout(payout.parse(await req.json())) });
  } catch (err) {
    return errorResponse(err);
  }
}
