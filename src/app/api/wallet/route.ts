import { NextResponse } from "next/server";
import { z } from "zod";
import { api, requireSession } from "@/lib/server/http";
import { createWalletChallenge, unlinkWallet, verifyWalletChallenge } from "@/lib/server/wallet/verify";

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("challenge"), address: z.string().min(32).max(44) }),
  z.object({ action: z.literal("verify"), challengeId: z.string().max(64), signature: z.string().min(64).max(128) }),
  z.object({ action: z.literal("unlink"), walletId: z.string().max(64) }),
]);

export const POST = api(async (req) => {
  const session = await requireSession();
  const input = action.parse(await req.json());
  switch (input.action) {
    case "challenge":
      return NextResponse.json(createWalletChallenge(session, input.address));
    case "verify":
      return NextResponse.json(verifyWalletChallenge(session, input));
    case "unlink":
      unlinkWallet(session, input.walletId);
      return NextResponse.json({ ok: true });
  }
});
