import { NextResponse } from "next/server";
import { api, rateLimit, requireSession } from "@/lib/server/http";
import { revealCode } from "@/lib/server/orders/orders";
import { notFound } from "@/lib/server/errors";

/** Reveals a delivered code to its owner only. Never logged, never cached. */
export const POST = api<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const session = await requireSession();
  rateLimit(`reveal:${session.userId}`, 30, 60_000);
  const { id } = await params;
  const code = revealCode(session, id);
  if (!code) throw notFound("Code");
  return NextResponse.json({ code }, { headers: { "cache-control": "no-store, private" } });
});
