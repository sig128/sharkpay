import { all, one, run, tx } from "../db";
import { randomId } from "../crypto";
import { AppError } from "../errors";

/**
 * Append-only, double-entry credit ledger. Every transaction sums to zero.
 * Balances are always derived from entries; nothing is stored as a mutable
 * balance. SQLite triggers reject UPDATE/DELETE on live ledger rows.
 *
 * Accounts
 *   external:settlement      source of funding (settled holder-reward proceeds)
 *   pool:holder_rewards      funded but not yet allocated (carry-forward lives here)
 *   user:<id>:pending        allocated, waiting for the clearance window
 *   user:<id>:available      spendable on rewards
 *   user:<id>:reserved       held for an in-flight order
 *   redeemed                 obligations discharged by completed fulfilment
 */
export const acct = {
  settlement: "external:settlement",
  pool: "pool:holder_rewards",
  redeemed: "redeemed",
  pending: (userId: string) => `user:${userId}:pending`,
  available: (userId: string) => `user:${userId}:available`,
  reserved: (userId: string) => `user:${userId}:reserved`,
};

export type LedgerKind =
  | "funding"
  | "allocation"
  | "clearance"
  | "reservation"
  | "capture"
  | "release"
  | "reversal";

export interface PostInput {
  kind: LedgerKind;
  idempotencyKey: string;
  refType?: string;
  refId?: string;
  memo?: string;
  entries: Array<{ account: string; amount: number }>;
}

function mustStayNonNegative(account: string) {
  return account.startsWith("user:") || account.startsWith("pool:");
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
        throw new AppError("insufficient_funds", `Insufficient balance in ${e.account.split(":").pop()}`, 409, {
          account: e.account,
        });
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

export function userBalances(realm: string, userId: string) {
  return {
    available: balance(realm, acct.available(userId)),
    pending: balance(realm, acct.pending(userId)),
    reserved: balance(realm, acct.reserved(userId)),
  };
}

/** Totals used for transparency and solvency checks. */
export function ledgerTotals(realm: string) {
  const rows = all<{ account: string; b: number }>(
    `SELECT account, SUM(amount) AS b FROM ledger_entries WHERE realm = ? GROUP BY account`,
    realm,
  );
  let outstanding = 0;
  let pool = 0;
  let redeemed = 0;
  let funded = 0;
  for (const r of rows) {
    if (r.account.startsWith("user:")) outstanding += r.b;
    else if (r.account === acct.pool) pool = r.b;
    else if (r.account === acct.redeemed) redeemed = r.b;
    else if (r.account === acct.settlement) funded = -r.b;
  }
  return { funded, pool, outstanding, redeemed, backed: funded - redeemed >= outstanding + pool };
}

export interface LedgerLine {
  txnId: string;
  kind: LedgerKind;
  refType: string | null;
  refId: string | null;
  memo: string | null;
  createdAt: number;
  account: string;
  amount: number;
}

export function userLedger(realm: string, userId: string): LedgerLine[] {
  return all<{
    txn_id: string;
    kind: LedgerKind;
    ref_type: string | null;
    ref_id: string | null;
    memo: string | null;
    created_at: number;
    account: string;
    amount: number;
  }>(
    `SELECT e.txn_id, t.kind, t.ref_type, t.ref_id, t.memo, t.created_at, e.account, e.amount
     FROM ledger_entries e JOIN ledger_txns t ON t.id = e.txn_id
     WHERE e.realm = ? AND e.account LIKE ? ORDER BY t.created_at DESC, e.id DESC`,
    realm,
    `user:${userId}:%`,
  ).map((r) => ({
    txnId: r.txn_id,
    kind: r.kind,
    refType: r.ref_type,
    refId: r.ref_id,
    memo: r.memo,
    createdAt: r.created_at,
    account: r.account,
    amount: r.amount,
  }));
}
