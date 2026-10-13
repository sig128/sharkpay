import { NextResponse } from "next/server";
import { env } from "@/lib/server/env";
import { safeEqual, sha256 } from "@/lib/server/crypto";
import { errorResponse } from "@/lib/server/http";
import { payoutBlocker, runPayoutCycle } from "@/lib/server/rewards/autopay";
import { holderBalances } from "@/lib/server/ledger/ledger";
import { payoutStatus } from "@/lib/server/rewards/status";
import { liveChain } from "@/lib/server/solana/chain";

/**
 * Operator-only. GET shows payout status and who is owed; POST runs a payout
 * cycle now instead of waiting for the timer. Disabled (404) unless
 * OPERATOR_SECRET is set.
 */
function gate(req: Request) {
  const secret = env().OPERATOR_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "not_configured" } }, { status: 404 });
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!safeEqual(sha256(token), sha256(secret))) {
    return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
  }
  return null;
}

export async function GET(req: Request) {
  const denied = gate(req);
  if (denied) return denied;
  return NextResponse.json(
    { status: payoutStatus({ cycles: 20, payouts: 50 }), owed: holderBalances("live").slice(0, 200) },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const denied = gate(req);
  if (denied) return denied;
  const blocker = payoutBlocker();
  if (blocker) return NextResponse.json({ error: { code: "not_configured", message: blocker } }, { status: 409 });
  try {
    return NextResponse.json({ cycle: await runPayoutCycle(liveChain()) });
  } catch (err) {
    return errorResponse(err);
  }
}
