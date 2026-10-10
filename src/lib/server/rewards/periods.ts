import { all, one, run, tx } from "../db";
import { randomId } from "../crypto";
import { env } from "../env";
import { AppError } from "../errors";
import { acct, post } from "../ledger/ledger";
import { watermark } from "../chain/ingest";
import { allocate, timeWeightedWeights, type BalanceEvent } from "./engine";

export interface PeriodRow {
  id: string;
  realm: string;
  seq: number;
  starts_at: number;
  ends_at: number;
  status: "open" | "finalized";
  budget_credits: number | null;
  total_weight: string | null;
  allocated_credits: number | null;
  carried_credits: number | null;
  eligible_wallets: number | null;
  finalized_at: number | null;
}

/** Calculation runs after this buffer past period end, once finalized chain data has caught up. */
export const CALC_BUFFER_S = 2 * 3600;

export function listPeriods(realm: string) {
  return all<PeriodRow>(`SELECT * FROM reward_periods WHERE realm = ? ORDER BY seq DESC`, realm);
}

export function createPeriod(realm: string, startsAt: number, endsAt: number) {
  const last = one<{ seq: number; ends_at: number }>(
    `SELECT seq, ends_at FROM reward_periods WHERE realm = ? ORDER BY seq DESC LIMIT 1`,
    realm,
  );
  if (last && startsAt !== last.ends_at) throw new AppError("period_gap", "Periods must be contiguous", 500);
  const id = randomId("per");
  run(
    `INSERT INTO reward_periods (id, realm, seq, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, 'open')`,
    id,
    realm,
    (last?.seq ?? 0) + 1,
    startsAt,
    endsAt,
  );
  return id;
}

/** Keeps an open period covering `now` (unix seconds), rolling forward contiguously. */
export function ensureCurrentPeriod(realm: string, nowS: number) {
  const len = env().PERIOD_LENGTH_DAYS * 86400;
  let last = one<{ ends_at: number }>(
    `SELECT ends_at FROM reward_periods WHERE realm = ? ORDER BY seq DESC LIMIT 1`,
    realm,
  );
  if (!last) {
    const start = Math.floor(nowS / len) * len;
    createPeriod(realm, start, start + len);
    return;
  }
  while (last.ends_at <= nowS) {
    createPeriod(realm, last.ends_at, last.ends_at + len);
    last = { ends_at: last.ends_at + len };
  }
}

function balanceEvents(realm: string, end: number): BalanceEvent[] {
  return all<{ owner: string; token_account: string; balance_raw: string; block_time: number }>(
    `SELECT owner, token_account, balance_raw, block_time FROM holding_events WHERE realm = ? AND block_time < ?
     ORDER BY block_time, slot`,
    realm,
    end,
  ).map((r) => ({ owner: r.owner, tokenAccount: r.token_account, balanceRaw: BigInt(r.balance_raw), time: r.block_time }));
}

/** Funded credits settled before `end`, minus everything already credited to members. */
function periodBudget(realm: string, end: number) {
  const funded =
    one<{ c: number | null }>(
      `SELECT SUM(credits_funded) AS c FROM settlements WHERE realm = ? AND settled_at < ?`,
      realm,
      end,
    )?.c ?? 0;
  const credited =
    one<{ c: number | null }>(
      `SELECT SUM(a.credits) AS c FROM allocations a WHERE a.realm = ? AND a.status != 'unclaimed'`,
      realm,
    )?.c ?? 0;
  return Math.max(0, funded - credited);
}

/**
 * Finalizes one period exactly once. Requires: period ended, finalized chain
 * data ingested through its end, and every earlier period finalized.
 */
export function finalizePeriod(realm: string, periodId: string, nowMs = Date.now()) {
  return tx(() => {
    const p = one<PeriodRow>(`SELECT * FROM reward_periods WHERE id = ? AND realm = ?`, periodId, realm);
    if (!p) throw new AppError("not_found", "Period not found", 404);
    if (p.status === "finalized") return { alreadyFinalized: true as const };
    const nowS = Math.floor(nowMs / 1000);
    if (nowS < p.ends_at) throw new AppError("period_open", "Period has not ended yet", 409);
    const wm = watermark(realm);
    if (!wm || wm.finalized_time < p.ends_at) {
      throw new AppError("data_incomplete", "Finalized chain data has not reached the end of this period", 409);
    }
    const earlierOpen = one(`SELECT 1 FROM reward_periods WHERE realm = ? AND seq < ? AND status = 'open'`, realm, p.seq);
    if (earlierOpen) throw new AppError("out_of_order", "Earlier periods must be finalized first", 409);

    const e = env();
    const excluded = new Set(all<{ address: string }>(`SELECT address FROM exclusions WHERE realm = ?`, realm).map((x) => x.address));
    const minAverageRaw = BigInt(Math.round(e.MIN_ELIGIBLE_BALANCE * 10 ** e.TOKEN_DECIMALS));
    const weights = timeWeightedWeights(balanceEvents(realm, p.ends_at), {
      start: p.starts_at,
      end: p.ends_at,
      excluded,
      minAverageRaw,
    });
    const budget = periodBudget(realm, p.ends_at);
    const result = allocate(budget, weights);

    const availableAt = nowMs + e.PENDING_CLEARANCE_HOURS * 3600 * 1000;
    const credited: Array<{ userId: string; credits: number }> = [];
    let unclaimed = 0;
    for (const share of result.shares) {
      const link = one<{ user_id: string }>(
        `SELECT user_id FROM wallets WHERE realm = ? AND address = ? AND unlinked_at IS NULL AND verified_at <= ?`,
        realm,
        share.wallet,
        nowMs,
      );
      const status = link && share.credits > 0 ? "pending" : "unclaimed";
      if (status === "unclaimed") unclaimed += share.credits;
      else credited.push({ userId: link!.user_id, credits: share.credits });
      run(
        `INSERT INTO allocations (id, realm, period_id, wallet, user_id, weight, credits, status, available_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomId("alc"),
        realm,
        p.id,
        share.wallet,
        status === "pending" ? link!.user_id : null,
        share.weight.toString(),
        share.credits,
        status,
        status === "pending" ? availableAt : null,
        nowMs,
      );
    }

    const creditedTotal = credited.reduce((s, c) => s + c.credits, 0);
    if (creditedTotal > 0) {
      const perUser = new Map<string, number>();
      for (const c of credited) perUser.set(c.userId, (perUser.get(c.userId) ?? 0) + c.credits);
      post(
        realm,
        {
          kind: "allocation",
          idempotencyKey: `alloc:${p.id}`,
          refType: "period",
          refId: p.id,
          memo: `Reward period ${p.seq} allocation`,
          entries: [
            { account: acct.pool, amount: -creditedTotal },
            ...[...perUser].map(([userId, credits]) => ({ account: acct.pending(userId), amount: credits })),
          ],
        },
        nowMs,
      );
    }

    const updated = run(
      `UPDATE reward_periods SET status = 'finalized', budget_credits = ?, total_weight = ?, allocated_credits = ?,
       carried_credits = ?, eligible_wallets = ?, finalized_at = ? WHERE id = ? AND status = 'open'`,
      budget,
      result.totalWeight.toString(),
      creditedTotal,
      budget - creditedTotal,
      result.shares.length,
      nowMs,
      p.id,
    );
    if (updated.changes !== 1) throw new AppError("conflict", "Period was finalized concurrently", 409);
    return {
      alreadyFinalized: false as const,
      budget,
      allocated: creditedTotal,
      unclaimed,
      roundingRemainder: result.remainder,
      carried: budget - creditedTotal,
    };
  });
}

/** Moves cleared allocations from pending to available. Idempotent per allocation. */
export function clearMatured(realm: string, nowMs = Date.now()) {
  const due = all<{ id: string; user_id: string; credits: number; period_id: string }>(
    `SELECT id, user_id, credits, period_id FROM allocations WHERE realm = ? AND status = 'pending' AND available_at <= ?`,
    realm,
    nowMs,
  );
  for (const a of due) {
    tx(() => {
      post(
        realm,
        {
          kind: "clearance",
          idempotencyKey: `clear:${a.id}`,
          refType: "allocation",
          refId: a.id,
          memo: "Reward allocation cleared and became available",
          entries: [
            { account: acct.pending(a.user_id), amount: -a.credits },
            { account: acct.available(a.user_id), amount: a.credits },
          ],
        },
        nowMs,
      );
      run(`UPDATE allocations SET status = 'available' WHERE id = ? AND status = 'pending'`, a.id);
    });
  }
  return due.length;
}

export function userAllocations(realm: string, userId: string) {
  return all<{
    id: string;
    period_id: string;
    seq: number;
    starts_at: number;
    ends_at: number;
    wallet: string;
    weight: string;
    total_weight: string;
    credits: number;
    budget_credits: number;
    status: string;
    available_at: number | null;
    created_at: number;
  }>(
    `SELECT a.id, a.period_id, p.seq, p.starts_at, p.ends_at, a.wallet, a.weight, p.total_weight, a.credits,
            p.budget_credits, a.status, a.available_at, a.created_at
     FROM allocations a JOIN reward_periods p ON p.id = a.period_id
     WHERE a.realm = ? AND a.user_id = ? ORDER BY p.seq DESC`,
    realm,
    userId,
  );
}
