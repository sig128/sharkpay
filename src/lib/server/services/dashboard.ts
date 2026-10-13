import { env } from "../env";
import { listWallets, maskAddress } from "../wallet/verify";
import { cardTier, findTierItem } from "../catalog/catalog";
import { getUser } from "../auth/accounts";
import { listOrders } from "../orders/orders";
import { membershipId, maskMembershipId } from "../passes/pass";
import { payoutStatus, type PayoutRow } from "../rewards/status";
import { linkedWalletAddresses, memberRewards, snapshotHoldings } from "../rewards/member";
import { parseSecretKey } from "../solana/chain";
import { fmtGta, fmtSol } from "@/lib/format";
import type { Session } from "../auth/sessions";

export const solscanTx = (signature: string) => `https://solscan.io/tx/${signature}`;
export const solscanAccount = (address: string) => `https://solscan.io/account/${address}`;

export function overview(session: Session) {
  const user = getUser(session.userId)!;
  const wallets = listWallets(session.userId);
  const addresses = linkedWalletAddresses(session.userId);
  const rewards = memberRewards(session.userId, 5);
  const holdings = snapshotHoldings(addresses);
  const status = payoutStatus({ cycles: 1, payouts: 0 });

  const tier = cardTier(user.selected_item_tier);
  const item =
    tier && user.reward_platform ? findTierItem(session.realm, tier.tier, user.reward_platform, user.reward_region ?? "US") : undefined;
  const price = item?.sol_price_lamports ?? tier?.lamports ?? 0;
  const earned = rewards.owed + rewards.paid;

  return {
    user: {
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      platform: user.reward_platform,
      region: user.reward_region,
      membershipId: maskMembershipId(membershipId(user.id)),
    },
    rewards: {
      owed: rewards.owed,
      paid: rewards.paid,
      latestPayout: rewards.payouts[0] ? payoutView(rewards.payouts[0]) : null,
    },
    payouts: {
      live: status.live,
      blocker: status.blocker,
      intervalMinutes: status.intervalMinutes,
      holderShareBps: status.holderShareBps,
      minPayoutLamports: status.minPayoutLamports,
      lastCycleAt: status.lastCycleAt,
      nextCycleAt: status.nextCycleAt,
    },
    linked: wallets.length > 0,
    wallets: wallets.map((w) => ({ id: w.id, address: w.address, masked: maskAddress(w.address), verifiedAt: w.verified_at })),
    holdings: { tokens: holdings.tokens, takenAt: holdings.takenAt },
    selectedReward: tier
      ? {
          name: tier.name,
          gtaAmount: tier.gta,
          solPriceLamports: price,
          platform: user.reward_platform,
          region: user.reward_region,
          earned,
          progress: price > 0 ? Math.min(1, earned / price) : 0,
        }
      : null,
    recent: activity(session).slice(0, 5),
  };
}

export function payoutView(p: PayoutRow) {
  return { ...p, masked: maskAddress(p.wallet), explorerUrl: solscanTx(p.signature) };
}

export interface ActivityItem {
  id: string;
  kind: "payout" | "order";
  title: string;
  explanation: string;
  createdAt: number;
  /** Headline amount, already formatted. */
  amount: string;
  amountLabel: string;
  positive: boolean;
  refType: string | null;
  refId: string | null;
  explorerUrl: string | null;
  status: "completed" | "pending" | "reversed";
  detail?: Record<string, string | number | null>;
}

export function activity(session: Session, limit = 200): ActivityItem[] {
  const rows: ActivityItem[] = memberRewards(session.userId, limit).payouts.map((p) => ({
    id: `${p.signature}:${p.wallet}`,
    kind: "payout",
    title: "SOL reward paid",
    explanation:
      "Your share of the creator fees collected since the previous run, sent automatically to this wallet. Confirmed on Solana.",
    createdAt: p.paidAt,
    amount: fmtSol(p.lamports),
    amountLabel: "paid",
    positive: true,
    refType: "payout",
    refId: p.signature,
    explorerUrl: solscanTx(p.signature),
    status: "completed",
    detail: { Wallet: maskAddress(p.wallet), Transaction: p.signature },
  }));

  for (const o of listOrders(session)) {
    rows.push({
      id: o.id,
      kind: "order",
      title: o.status === "completed" ? `Bought ${o.item_name}` : `Order: ${o.item_name}`,
      explanation: "Paid in $SHARK. SOL rewards are not spent here.",
      createdAt: o.created_at,
      amount: fmtGta(o.gta_amount),
      amountLabel: "Shark Card",
      positive: false,
      refType: "order",
      refId: o.id,
      explorerUrl: null,
      status: o.status === "reversed" || o.status === "failed" ? "reversed" : o.status === "completed" ? "completed" : "pending",
      detail: {
        Order: o.id,
        Reward: o.item_name,
        "GTA$ amount": fmtGta(o.gta_amount),
        Platform: o.platform,
        Region: o.region,
        "Order status": o.status.replace(/_/g, " "),
        Payment: "Paid in $SHARK",
      },
    });
  }
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

function feeWalletAddress(): string | null {
  const secret = env().FEE_WALLET_SECRET_KEY;
  if (!secret) return null;
  try {
    return parseSecretKey(secret).publicKey.toBase58();
  } catch {
    return null;
  }
}

/** Public view of the automatic payout system, for the transparency page. */
export function transparency() {
  const s = payoutStatus({ cycles: 20, payouts: 20 });
  return {
    ...s,
    feeWallet: feeWalletAddress(),
    opsWallet: env().OPS_WALLET ?? null,
    recentPayouts: s.recentPayouts.map(payoutView),
  };
}

export type Transparency = ReturnType<typeof transparency>;
export type Overview = ReturnType<typeof overview>;
