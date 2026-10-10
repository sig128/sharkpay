import { NextResponse } from "next/server";
import { z } from "zod";
import { api, rateLimit, requireSession } from "@/lib/server/http";
import { orderView } from "@/lib/server/orders/orders";
import { checkSharkPayment, createSharkQuote, simulateDemoPayment } from "@/lib/server/payments/shark";

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("quote"), itemId: z.string().max(64) }),
  z.object({ action: z.literal("check"), paymentId: z.string().max(64) }),
  z.object({
    action: z.literal("simulate"),
    paymentId: z.string().max(64),
    demoScenario: z.enum(["instant", "pending", "fail", "uncertain"]).optional(),
  }),
]);

export const POST = api(async (req) => {
  const session = await requireSession();
  const input = action.parse(await req.json());
  if (input.action === "quote") {
    rateLimit(`shark-quote:${session.userId}`, 20, 60_000);
    return NextResponse.json({ payment: await createSharkQuote(session, input.itemId) });
  }
  rateLimit(`shark-check:${session.userId}`, 40, 60_000);
  if (input.action === "simulate") {
    rateLimit(`shark-sim:${session.userId}`, 20, 60_000);
    const { payment, order } = await simulateDemoPayment(session, input.paymentId, input.demoScenario);
    return NextResponse.json({ payment, order: order ? orderView(order) : null });
  }
  const { payment, order } = await checkSharkPayment(session, input.paymentId);
  return NextResponse.json({ payment, order: order ? orderView(order) : null });
});
