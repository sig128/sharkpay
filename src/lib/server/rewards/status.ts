import { all, one } from "../db";
import { env } from "../env";
import { acct, balance, ledgerTotals } from "../ledger/ledger";
import { payoutBlocker } from "./autopay";

const REALM = "live";

export interface CycleRow {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  status: string;
  incomeLamports: number;
  holderLamports: number;
  opsLamports: number;
  holders: number;
  creditedLamports: number;
  paidLamports: number;
  paidWallets: number;
  claimSignature: string | null;
}

export interface PayoutRow {
  wallet: string;
  lamports: number;
  paidAt: number;
  signature: string;
}

function cycles(limit: number): CycleRow[] {
  return all<{
    id: string;
    started_at: number;
    finished_at: number | null;
    status: string;
    income_lamports: number;
    holder_lamports: number;
    ops_lamports: number;
    holders: number;
    credited_lamports: number;
    paid_lamports: number;
    paid_wallets: number;
    claim_signature: string | null;
  }>(`SELECT * FROM payout_cycles ORDER BY started_at DESC LIMIT ?`, limit).map((c) => ({
    id: c.id,
    startedAt: c.started_at,
    finishedAt: c.finished_at,
    status: c.status,
    incomeLamports: c.income_lamports,
    holderLamports: c.holder_lamports,
    opsLamports: c.ops_lamports,
    holders: c.holders,
    creditedLamports: c.credited_lamports,
    paidLamports: c.paid_lamports,
    paidWallets: c.paid_wallets,
    claimSignature: c.claim_signature,
  }));
}

function payouts(where: string, params: unknown[], limit: number): PayoutRow[] {
  return all<{ wallet: string; lamports: number; paid_at: number; signature: string }>(
    `SELECT p.wallet, p.lamports, p.paid_at, t.signature FROM holder_payouts p
     JOIN payout_transfers t ON t.id = p.transfer_id ${where} ORDER BY p.paid_at DESC, p.id DESC LIMIT ?`,
    ...params,
    limit,
  ).map((p) => ({ wallet: p.wallet, lamports: p.lamports, paidAt: p.paid_at, signature: p.signature }));
}

/** Public, aggregate view of the automatic payout system. */
export function payoutStatus(opts: { cycles?: number; payouts?: number } = {}) {
  const e = env();
  const blocker = payoutBlocker();
  const recent = cycles(opts.cycles ?? 10);
  const last = recent[0] ?? null;
  const intervalMs = e.PAYOUT_INTERVAL_MINUTES * 60_000;
  const holdersPaid = one<{ n: number }>(`SELECT COUNT(DISTINCT wallet) AS n FROM holder_payouts`)?.n ?? 0;
  const latestSnapshot = one<{ taken_at: number; holders: number }>(
    `SELECT taken_at, holders FROM holder_snapshots ORDER BY taken_at DESC LIMIT 1`,
  );
  return {
    live: blocker === null,
    blocker,
    mint: e.TOKEN_MINT ?? null,
    intervalMinutes: e.PAYOUT_INTERVAL_MINUTES,
    holderShareBps: e.HOLDER_SHARE_BPS,
    tradeFeeBps: e.TRADE_FEE_BPS,
    minPayoutLamports: e.MIN_PAYOUT_LAMPORTS,
    minEligibleBalance: e.MIN_ELIGIBLE_BALANCE,
    lastCycleAt: last?.startedAt ?? null,
    nextCycleAt: blocker ? null : last ? last.startedAt + intervalMs : null,
    holdersNow: latestSnapshot?.holders ?? null,
    totals: { ...ledgerTotals(REALM), holdersPaid },
    recentCycles: recent,
    recentPayouts: payouts("", [], opts.payouts ?? 20),
  };
}

export type PayoutStatus = ReturnType<typeof payoutStatus>;

/** Rewards for a member's linked wallets: owed now, total paid, recent payouts. */
export function walletRewards(wallets: string[], limit = 20) {
  if (wallets.length === 0) return { owed: 0, paid: 0, payouts: [] as PayoutRow[] };
  const marks = wallets.map(() => "?").join(",");
  const owed = wallets.reduce((s, w) => s + balance(REALM, acct.holder(w)), 0);
  const paid = one<{ p: number | null }>(`SELECT SUM(lamports) AS p FROM holder_payouts WHERE wallet IN (${marks})`, ...wallets)?.p ?? 0;
  return { owed, paid, payouts: payouts(`WHERE p.wallet IN (${marks})`, wallets, limit) };
}

export type WalletRewards = ReturnType<typeof walletRewards>;
