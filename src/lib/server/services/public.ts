import { CARD_TIERS } from "../catalog/catalog";
import { payoutStatus } from "../rewards/status";
import { payoutView } from "./dashboard";
import { env } from "../env";
import { showcaseFrom } from "@/components/brand/placeholders";

/** Everything the public landing page shows: the price list and the live payout status. */
export function landing() {
  const s = payoutStatus({ cycles: 1, payouts: 5 });
  return {
    payouts: {
      live: s.live,
      blocker: s.blocker,
      intervalMinutes: s.intervalMinutes,
      holderShareBps: s.holderShareBps,
      tradeFeeBps: s.tradeFeeBps,
      minPayoutLamports: s.minPayoutLamports,
      lastCycleAt: s.lastCycleAt,
      nextCycleAt: s.nextCycleAt,
      holdersNow: s.holdersNow,
      totals: s.totals,
      recentPayouts: s.recentPayouts.map(payoutView),
    },
    showcase: showcaseFrom({ holderShareBps: s.holderShareBps, intervalMinutes: s.intervalMinutes, appUrl: env().APP_URL }),
    tiers: CARD_TIERS.map((t) => ({ tier: t.tier, name: t.name, gta: t.gta, cost: t.lamports })),
  };
}

export type Landing = ReturnType<typeof landing>;
export type LandingPayouts = Landing["payouts"];
