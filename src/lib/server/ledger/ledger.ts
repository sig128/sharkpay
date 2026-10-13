import { all, one, run, tx } from "../db";
import { randomId } from "../crypto";
import { AppError } from "../errors";

/**
 * Append-only, double-entry ledger of holder SOL rewards, in lamports. Every
 * transaction sums to zero. Balances are always derived from entries; nothing
 * is stored as a mutable balance. SQLite triggers reject UPDATE/DELETE on live
 * ledger rows.
 *
 * Accounts
 *   external:fee_income      SOL creator fees that reached the fee wallet (source)
 *   pool:holder_rewards      holder share not yet credited to a wallet (dust carries here)
 *   holder:<wallet>          credited to a holder wallet, waiting for the next payout
 *   ops:owed                 operations share waiting to be sent to OPS_WALLET
 *   external:ops_kept        operations share left in the fee wallet (no OPS_WALLET)
 *   external:paid_holders    SOL sent to holders, confirmed on-chain
 *   external:paid_ops        SOL sent to OPS_WALLET, confirmed on-chain
 *
 * Liabilities (SOL the fee wallet must hold for others) = pool + holder:* + ops:owed.
 */
export const acct = {
  feeIncome: "external:fee_income",
  pool: "pool:holder_rewards",
  holder: (wallet: string) => `holder:${wallet}`,
  opsOwed: "ops:owed",
  opsKept: "external:ops_kept",
  paidHolders: "external:paid_holders",
  paidOps: "external:paid_ops",
};

export type LedgerKind = "fee_income" | "accrual" | "payout";

export interface PostInput {
  kind: LedgerKind;
  idempotencyKey: string;
  refType?: string;
  refId?: string;
  memo?: string;
  entries: Array<{ account: string; amount: number }>;
}

function mustStayNonNegative(account: string) {
  return account.startsWith("holder:") || account.startsWith("pool:") || account.startsWith("ops:");
}

/** Posts a balanced transaction once. Re-posting the same idempotency key is a no-op. */
export function post(realm: string, input: PostInput, now = Date.now()): { txnId: string; duplicate: boolean } {
  const entries = input.entries.filter((e) => e.amount !== 0);
  if (entries.length < 2) throw new AppError("ledger_invalid", "A ledger transaction needs two or more entries", 500);
  for (const e of entries) {
    if (!Number.isSafeInteger(e.amount)) throw new AppError("ledger_invalid", "Ledger amounts must be integers", 500);
  }
  if (entries.reduce((s, e) => s + e.amount, 0) !== 0) {
    throw new AppError("ledger_unbalanced", "Ledger transaction does not balance", 500);
  }
  return tx(() => {
    const existing = one<{ id: string }>(
      `SELECT id FROM ledger_txns WHERE realm = ? AND idempotency_key = ?`,
      realm,
      input.idempotencyKey,
    );
    if (existing) return { txnId: existing.id, duplicate: true };
    const txnId = randomId("ltx");
    run(
      `INSERT INTO ledger_txns (id, realm, kind, ref_type, ref_id, memo, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      txnId,
      realm,
      input.kind,
      input.refType ?? null,
      input.refId ?? null,
      input.memo ?? null,
      input.idempotencyKey,
      now,
    );
    for (const e of entries) {
      run(
        `INSERT INTO ledger_entries (txn_id, realm, account, amount, created_at) VALUES (?, ?, ?, ?, ?)`,
        txnId,
        realm,
        e.account,
        e.amount,
        now,
      );
    }
    for (const e of entries) {
      if (e.amount < 0 && mustStayNonNegative(e.account) && balance(realm, e.account) < 0) {
        throw new AppError("insufficient_funds", `Insufficient balance in ${e.account}`, 409, { account: e.account });
      }
    }
    return { txnId, duplicate: false };
  });
}

export function balance(realm: string, account: string): number {
  return (
    one<{ b: number | null }>(
      `SELECT SUM(amount) AS b FROM ledger_entries WHERE realm = ? AND account = ?`,
      realm,
      account,
    )?.b ?? 0
  );
}

/** Wallets with an owed balance, largest first. */
export function holderBalances(realm: string): Array<{ wallet: string; owed: number }> {
  return all<{ account: string; b: number }>(
    `SELECT account, SUM(amount) AS b FROM ledger_entries WHERE realm = ? AND account LIKE 'holder:%'
     GROUP BY account HAVING b > 0 ORDER BY b DESC, account`,
    realm,
  ).map((r) => ({ wallet: r.account.slice("holder:".length), owed: r.b }));
}

/** Totals used for transparency and solvency checks. */
export function ledgerTotals(realm: string) {
  const rows = all<{ account: string; b: number }>(
    `SELECT account, SUM(amount) AS b FROM ledger_entries WHERE realm = ? GROUP BY account`,
    realm,
  );
  let owed = 0;
  let pool = 0;
  let opsOwed = 0;
  let received = 0;
  let paidHolders = 0;
  let paidOps = 0;
  let opsKept = 0;
  for (const r of rows) {
    if (r.account.startsWith("holder:")) owed += r.b;
    else if (r.account === acct.pool) pool = r.b;
    else if (r.account === acct.opsOwed) opsOwed = r.b;
    else if (r.account === acct.feeIncome) received = -r.b;
    else if (r.account === acct.paidHolders) paidHolders = r.b;
    else if (r.account === acct.paidOps) paidOps = r.b;
    else if (r.account === acct.opsKept) opsKept = r.b;
  }
  return { received, pool, owed, opsOwed, opsKept, paidHolders, paidOps, liabilities: pool + owed + opsOwed };
}
