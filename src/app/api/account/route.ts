import { NextResponse } from "next/server";
import { z } from "zod";
import { api, requireSession } from "@/lib/server/http";
import { regenerateRecoveryCodes, unlinkIdentity, updatePreferences } from "@/lib/server/auth/accounts";

const action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("preferences"),
    platform: z.enum(["pc", "playstation", "xbox"]).optional(),
    region: z.enum(["US", "UK", "EU"]).optional(),
    tier: z.enum(["red", "tiger", "bull", "great_white", "whale", "megalodon"]).optional(),
    completeOnboarding: z.boolean().optional(),
  }),
  z.object({ action: z.literal("unlink_identity"), identityId: z.string().max(64) }),
  z.object({ action: z.literal("recovery_codes") }),
]);

export const POST = api(async (req) => {
  const session = await requireSession();
  const input = action.parse(await req.json());
  switch (input.action) {
    case "preferences":
      updatePreferences(session.userId, {
        platform: input.platform,
        region: input.region,
        tier: input.tier,
        markOnboarded: input.completeOnboarding,
      });
      return NextResponse.json({ ok: true });
    case "unlink_identity":
      unlinkIdentity(session, input.identityId);
      return NextResponse.json({ ok: true });
    case "recovery_codes":
      return NextResponse.json({ codes: regenerateRecoveryCodes(session) });
  }
});
