import { NextResponse } from "next/server";
import { z } from "zod";
import { api, rateLimit, requireSession } from "@/lib/server/http";
import { confirmRedemption, createQuote, orderView } from "@/lib/server/orders/orders";

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("quote"), itemId: z.string().max(64) }),
  z.object({
    action: z.literal("confirm"),
    quoteId: z.string().max(64),
    idempotencyKey: z.string().min(16).max(80),
    demoScenario: z.enum(["instant", "pending", "fail", "uncertain"]).optional(),
  }),
]);

export const POST = api(async (req) => {
  const session = await requireSession();
  const input = action.parse(await req.json());
  if (input.action === "quote") {
    rateLimit(`quote:${session.userId}`, 60, 60_000);
    return NextResponse.json(createQuote(session, input.itemId));
  }
  rateLimit(`confirm:${session.userId}`, 20, 60_000);
  const { order, duplicate } = await confirmRedemption(session, input);
  return NextResponse.json({ order: orderView(order), duplicate });
});
