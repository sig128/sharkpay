import { NextResponse } from "next/server";
import { api, requireSession } from "@/lib/server/http";
import { orderView, reconcileOrder } from "@/lib/server/orders/orders";

/** Owner-only order status. Pending or uncertain orders are reconciled with the provider. */
export const GET = api<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const session = await requireSession();
  const { id } = await params;
  const order = await reconcileOrder(session, id);
  return NextResponse.json({ order: orderView(order) }, { headers: { "cache-control": "no-store" } });
});
