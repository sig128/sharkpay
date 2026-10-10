import { one } from "../db";
import { publicSampleRealm, DEMO_FIXTURE } from "../simulation/demo";
import { overview, transparency } from "./dashboard";
import { passModel } from "../passes/pass";
import { DEMO_TIERS } from "../catalog/catalog";
import type { Session } from "../auth/sessions";

/** Everything the public landing page shows, all from the sample realm. */
export async function landingSample() {
  const realm = await publicSampleRealm();
  const member = one<{ id: string }>(
    `SELECT id FROM users WHERE realm = ? AND display_name = ? ORDER BY created_at LIMIT 1`,
    realm,
    DEMO_FIXTURE.displayName,
  )!;
  const session: Session = {
    idHash: "public",
    userId: member.id,
    realm,
    kind: "demo",
    authProvider: "demo",
    authAt: 0,
    expiresAt: 0,
  };
  const o = overview(session);
  const pass = passModel(realm, member.id);
  const t = transparency(realm);
  return {
    hero: {
      memberName: o.user.displayName,
      membershipId: o.user.membershipId,
      available: o.balances.available,
      pending: o.balances.pending,
      selectedName: o.selectedReward?.name ?? "Bull Shark Card",
      selectedCost: o.selectedReward?.creditCost ?? DEMO_FIXTURE.selectedCost,
      pass,
    },
    steps: {
      budget: o.latestPeriod?.budget ?? 0,
      share: o.latestWeight?.share ?? 0,
      allocation: o.latestPeriod?.myAllocation ?? 0,
      holderShareBps: t.config.holderShareBps,
      periodDays: t.config.periodDays,
    },
    tiers: DEMO_TIERS.map((d) => ({
      tier: d.tier,
      name: d.name,
      gta: d.gta,
      cost: d.cost,
      outOfStockOn: d.tier === "megalodon" ? ["xbox"] : [],
    })),
    transparency: t,
  };
}
