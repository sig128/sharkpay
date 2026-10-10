import { all, one } from "../db";
import { env } from "../env";
import { userBalances, userLedger, ledgerTotals, type LedgerKind } from "../ledger/ledger";
import { clearMatured, listPeriods, userAllocations, CALC_BUFFER_S, ensureCurrentPeriod } from "../rewards/periods";
import { listWallets, maskAddress } from "../wallet/verify";
import { findTierItem, DEMO_TIERS } from "../catalog/catalog";
import { getUser } from "../auth/accounts";
import { listOrders } from "../orders/orders";
import { listExclusions, watermark } from "../chain/ingest";
import { membershipId, maskMembershipId } from "../passes/pass";
import { DEMO_FIXTURE } from "../simulation/demo";
import type { Session } from "../auth/sessions";

const isDemo = (realm: string) => realm.startsWith("demo:");

export function tokenAmount(raw: string | bigint) {
  const d = env().TOKEN_DECIMALS;
  const v = typeof raw === "bigint" ? raw : BigInt(raw);
  const whole = v / 10n ** BigInt(d);
  const frac = v % 10n ** BigInt(d);
  return Number(whole) + Number(frac) / 10 ** d;
}

function holdingsFor(realm: string, wallets: string[]) {
  if (wallets.length === 0) return { raw: 0n, accounts: 0 };
  const rows = all<{ token_account: string; balance_raw: string }>(
    `SELECT h.token_account, h.balance_raw FROM holding_events h
     WHERE h.realm = ? AND h.owner IN (${wallets.map(() => "?").join(",")})
       AND h.block_time = (SELECT MAX(block_time) FROM holding_events x WHERE x.realm = h.realm AND x.token_account = h.token_account)`,
    realm,
    ...wallets,
  );
  return { raw: rows.reduce((s, r) => s + BigInt(r.balance_raw), 0n), accounts: rows.length };
}

export function overview(session: Session, now = Date.now()) {
  if (!isDemo(session.realm)) ensureCurrentPeriod(session.realm, Math.floor(now / 1000));
  clearMatured(session.realm, now);
  const user = getUser(session.userId)!;
  const balances = userBalances(session.realm, session.userId);
  const wallets = listWallets(session.userId);
  const holdings = holdingsFor(session.realm, wallets.map((w) => w.address));
  const allocations = userAllocations(session.realm, session.userId);
  const latest = allocations[0] ?? null;
  const periods = listPeriods(session.realm);
  const lastFinalized = periods.find((p) => p.status === "finalized") ?? null;
  const open = periods.find((p) => p.status === "open") ?? null;

  const tier = user.selected_item_tier ?? DEMO_FIXTURE.selectedTier;
  const selected = user.reward_platform
    ? findTierItem(session.realm, tier, user.reward_platform, user.reward_region ?? "US")
    : undefined;

  return {
    isDemo: isDemo(session.realm),
    user: {
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      platform: user.reward_platform,
      region: user.reward_region,
      membershipId: maskMembershipId(membershipId(user.id)),
    },
    balances,
    qualifies: wallets.length > 0,
    wallets: wallets.map((w) => ({ id: w.id, address: w.address, masked: maskAddress(w.address), verifiedAt: w.verified_at })),
    holdings: {
      tokens: tokenAmount(holdings.raw),
      tokenAccounts: holdings.accounts,
      sampleValueUsd: isDemo(session.realm) ? (tokenAmount(holdings.raw) * DEMO_FIXTURE.tokenPriceUsdMicros) / 1e6 : null,
    },
    latestWeight: latest
      ? {
          periodSeq: latest.seq,
          share: Number((BigInt(latest.weight) * 1_000_000n) / BigInt(latest.total_weight || "1")) / 10_000,
          averageTokens: tokenAmount(BigInt(latest.weight) / BigInt(latest.ends_at - latest.starts_at)),
        }
      : null,
    latestPeriod: lastFinalized
      ? {
          seq: lastFinalized.seq,
          startsAt: lastFinalized.starts_at * 1000,
          endsAt: lastFinalized.ends_at * 1000,
          budget: lastFinalized.budget_credits ?? 0,
          myAllocation: allocations.find((a) => a.period_id === lastFinalized.id)?.credits ?? 0,
          myStatus: allocations.find((a) => a.period_id === lastFinalized.id)?.status ?? null,
          availableAt: allocations.find((a) => a.period_id === lastFinalized.id)?.available_at ?? null,
        }
      : null,
    nextCalculation: open ? (open.ends_at + CALC_BUFFER_S) * 1000 : null,
    openPeriod: open ? { seq: open.seq, startsAt: open.starts_at * 1000, endsAt: open.ends_at * 1000 } : null,
    selectedReward: selected
      ? {
          itemId: selected.id,
          name: selected.name,
          gtaAmount: selected.gta_amount,
          creditCost: selected.credit_cost,
          platform: selected.platform,
          region: selected.region,
          isDemo: Boolean(selected.is_demo),
          progress: Math.min(1, balances.available / selected.credit_cost),
        }
      : null,
    recent: activity(session).slice(0, 5),
  };
}

export interface ActivityItem {
  id: string;
  kind: LedgerKind;
  title: string;
  explanation: string;
  createdAt: number;
  availableDelta: number;
  pendingDelta: number;
  reservedDelta: number;
  refType: string | null;
  refId: string | null;
  status: "completed" | "pending" | "reversed";
  detail?: Record<string, string | number | null>;
}

export function activity(session: Session): ActivityItem[] {
  const lines = userLedger(session.realm, session.userId);
  const byTxn = new Map<string, ActivityItem>();
  const allocations = new Map(userAllocations(session.realm, session.userId).map((a) => [a.period_id, a]));
  const allocById = new Map(userAllocations(session.realm, session.userId).map((a) => [a.id, a]));
  const orders = new Map(listOrders(session).map((o) => [o.id, o]));

  for (const l of lines) {
    let item = byTxn.get(l.txnId);
    if (!item) {
      item = {
        id: l.txnId,
        kind: l.kind,
        title: "",
        explanation: "",
        createdAt: l.createdAt,
        availableDelta: 0,
        pendingDelta: 0,
        reservedDelta: 0,
        refType: l.refType,
        refId: l.refId,
        status: "completed",
      };
      byTxn.set(l.txnId, item);
    }
    if (l.account.endsWith(":available")) item.availableDelta += l.amount;
    if (l.account.endsWith(":pending")) item.pendingDelta += l.amount;
    if (l.account.endsWith(":reserved")) item.reservedDelta += l.amount;
  }

  for (const item of byTxn.values()) {
    const order = item.refType === "order" && item.refId ? orders.get(item.refId) : undefined;
    switch (item.kind) {
      case "allocation": {
        const a = item.refId ? allocations.get(item.refId) : undefined;
        item.title = `Reward period ${a?.seq ?? ""} allocation`;
        item.explanation =
          "Your share of the funded reward budget for this period, based on your time-weighted eligible holdings. It is pending until the clearance window ends.";
        item.status = a?.status === "pending" ? "pending" : "completed";
        if (a) {
          item.detail = {
            Period: `#${a.seq}`,
            "Your time-weighted weight": a.weight,
            "Total eligible weight": a.total_weight,
            "Funded period budget": `${a.budget_credits.toLocaleString("en-US")} credits`,
            Formula: "budget × your weight ÷ total weight, rounded down",
            Wallet: maskAddress(a.wallet),
            "Available from": a.available_at ? new Date(a.available_at).toISOString() : null,
          };
        }
        break;
      }
      case "clearance": {
        const a = item.refId ? allocById.get(item.refId) : undefined;
        item.title = `Period ${a?.seq ?? ""} credits cleared`;
        item.explanation = "The clearance window ended, so these credits moved from pending to available.";
        break;
      }
      case "reservation":
        item.title = `Reserved for ${order?.item_name ?? "a reward"}`;
        item.explanation = "Credits were held for your order so they can't be spent twice while the provider delivers it.";
        item.status = order && ["reserved", "pending_delivery", "needs_reconciliation"].includes(order.status) ? "pending" : "completed";
        break;
      case "capture":
        item.title = `Redeemed ${order?.item_name ?? "reward"}`;
        item.explanation = "Delivery completed, so the reserved credits were spent.";
        break;
      case "release":
        item.title = `Returned: ${order?.item_name ?? "order"}`;
        item.explanation = "Delivery failed and the provider confirmed nothing was issued, so the reserved credits were returned.";
        item.status = "reversed";
        break;
      case "reversal":
        item.title = `Reversed: ${order?.item_name ?? "order"}`;
        item.explanation = "The provider voided a delivered reward, so the credits were returned to your balance.";
        item.status = "reversed";
        break;
      default:
        item.title = "Ledger entry";
        item.explanation = "";
    }
    if (order) {
      item.detail = {
        Order: order.id,
        Reward: order.item_name,
        "GTA$ amount": `GTA$${order.gta_amount.toLocaleString("en-US")}`,
        Platform: order.platform,
        Region: order.region,
        "Order status": order.status.replace(/_/g, " "),
        "Credit cost": `${order.credit_cost.toLocaleString("en-US")} credits`,
      };
    }
  }

  return [...byTxn.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function transparency(realm: string) {
  const e = env();
  const fees = all<{ kind: string; amount_raw: string }>(`SELECT kind, amount_raw FROM fee_events WHERE realm = ?`, realm);
  const sum = (k: string) => fees.filter((f) => f.kind === k).reduce((s, f) => s + BigInt(f.amount_raw), 0n);
  const withheld = sum("withheld");
  const harvested = sum("harvested");
  const withdrawn = sum("withdrawn");
  const s = one<{
    sold: number | null;
    gross: number | null;
    costs: number | null;
    net: number | null;
    holder: number | null;
    ops: number | null;
    credits: number | null;
    n: number;
    last: number | null;
  }>(
    `SELECT SUM(CAST(tokens_sold_raw AS INTEGER)) AS sold, SUM(gross_usd_micros) AS gross, SUM(costs_usd_micros) AS costs,
       SUM(net_usd_micros) AS net, SUM(holder_usd_micros) AS holder, SUM(ops_usd_micros) AS ops, SUM(credits_funded) AS credits,
       COUNT(*) AS n, MAX(settled_at) AS last FROM settlements WHERE realm = ?`,
    realm,
  )!;
  const soldRaw = BigInt(s.sold ?? 0);
  const totals = ledgerTotals(realm);
  const buckets = one<{ pending: number | null; available: number | null; reserved: number | null }>(
    `SELECT SUM(CASE WHEN account LIKE '%:pending' THEN amount END) AS pending,
            SUM(CASE WHEN account LIKE '%:available' THEN amount END) AS available,
            SUM(CASE WHEN account LIKE '%:reserved' THEN amount END) AS reserved
     FROM ledger_entries WHERE realm = ? AND account LIKE 'user:%'`,
    realm,
  )!;
  const redemptions = one<{ n: number; credits: number | null }>(
    `SELECT COUNT(*) AS n, SUM(credit_cost) AS credits FROM orders WHERE realm = ? AND status = 'completed'`,
    realm,
  )!;
  const opCosts = all<{ label: string; usd_micros: number; incurred_at: number }>(
    `SELECT label, usd_micros, incurred_at FROM operating_costs WHERE realm = ? ORDER BY incurred_at`,
    realm,
  );
  const periods = listPeriods(realm).map((p) => ({
    seq: p.seq,
    startsAt: p.starts_at * 1000,
    endsAt: p.ends_at * 1000,
    status: p.status,
    budget: p.budget_credits,
    allocated: p.allocated_credits,
    carried: p.carried_credits,
    eligibleWallets: p.eligible_wallets,
    finalizedAt: p.finalized_at,
  }));
  const wm = watermark(realm);
  return {
    isSample: isDemo(realm),
    lastUpdated: wm?.updated_at ?? null,
    dataThrough: wm ? wm.finalized_time * 1000 : null,
    lastSettlement: s.last ? s.last * 1000 : null,
    config: {
      feeBps: e.REWARD_FEE_BPS,
      holderShareBps: e.HOLDER_SHARE_BPS,
      usdMicrosPerCredit: e.CREDIT_USD_MICROS,
      clearanceHours: e.PENDING_CLEARANCE_HOURS,
      periodDays: e.PERIOD_LENGTH_DAYS,
      minEligibleTokens: e.MIN_ELIGIBLE_BALANCE,
      tokenProgram: e.TOKEN_PROGRAM,
      mint: isDemo(realm) ? null : e.TOKEN_MINT ?? null,
    },
    tokens: {
      withheldNotHarvested: tokenAmount(withheld > harvested ? withheld - harvested : 0n),
      harvestedNotWithdrawn: tokenAmount(harvested > withdrawn ? harvested - withdrawn : 0n),
      collected: tokenAmount(withdrawn),
      sold: tokenAmount(soldRaw),
      inventory: tokenAmount(withdrawn > soldRaw ? withdrawn - soldRaw : 0n),
    },
    settlement: {
      count: s.n,
      grossUsd: (s.gross ?? 0) / 1e6,
      costsUsd: (s.costs ?? 0) / 1e6,
      netUsd: (s.net ?? 0) / 1e6,
      holderUsd: (s.holder ?? 0) / 1e6,
      opsUsd: (s.ops ?? 0) / 1e6,
    },
    credits: {
      funded: totals.funded,
      unallocated: totals.pool,
      outstanding: totals.outstanding,
      pending: buckets.pending ?? 0,
      available: buckets.available ?? 0,
      reserved: buckets.reserved ?? 0,
      redeemed: totals.redeemed,
      allocated: periods.reduce((acc, p) => acc + (p.allocated ?? 0), 0),
      backed: totals.backed,
    },
    redemptions: { count: redemptions.n, credits: redemptions.credits ?? 0 },
    operatingCosts: opCosts.map((c) => ({ label: c.label, usd: c.usd_micros / 1e6, at: c.incurred_at })),
    periods,
    exclusions: listExclusions(realm).map((x) => ({ ...x, address: maskAddress(x.address) })),
  };
}

export type Transparency = ReturnType<typeof transparency>;
export type Overview = ReturnType<typeof overview>;
export const demoTiers = DEMO_TIERS;
