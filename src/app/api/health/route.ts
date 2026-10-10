import { NextResponse } from "next/server";
import { one } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** Liveness for the host's health check: the app is up and the database answers. */
export function GET() {
  try {
    one(`SELECT 1 AS ok`);
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
