import { all, one, run, tx } from "../db";
import { randomId } from "../crypto";
import { AppError } from "../errors";

/**
 * Append-only, double-entry ledger of holder SOL rewards, in lamports. Every
 * transaction sums to zero. Balances are always derived from entries; nothing
 * is stored as a mutable balance. SQLite triggers reject UPDATE/DELETE on live
 * ledger rows. The ledger records SOL; it never moves it.
 *
 * Accounts
 *   external:settlement      SOL from settled fee proceeds (source of funding)
 *   pool:holder_rewards      funded but not yet allocated (carry-forward lives here)
 *   user:<id>:pending        allocated, waiting for the clearance window
 *   user:<id>:payable        earned and cleared, waiting for the operator payout
 *   external:paid_out        SOL the operator has sent, verified on-chain
 */
export const acct = {
  settlement: "external:settlement",
  pool: "pool:holder_rewards",
  paidOut: "external:paid_out",
  pending: (userId: string) => `user:${userId}:pending`,
  payable: (userId: string) => `user:${userId}:payable`,
};

export type LedgerKind = "funding" | "allocation" | "clearance" | "payout";

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

/** A member's SOL rewards in lamports. `paid` is what the operator has already sent. */
export function userBalances(realm: string, userId: string) {
  const paid =
    one<{ p: number | null }>(`SELECT SUM(lamports) AS p FROM payouts WHERE realm = ? AND user_id = ?`, realm, userId)?.p ?? 0;
  return {
    pending: balance(realm, acct.pending(userId)),
    payable: balance(realm, acct.payable(userId)),
    paid,
  };
}

/** Totals used for transparency and solvency checks. */
export function ledgerTotals(realm: string) {
  const rows = all<{ account: string; b: number }>(
    `SELECT account, SUM(amount) AS b FROM ledger_entries WHERE realm = ? GROUP BY account`,
    realm,
  );
  let outstanding = 0;
  let pending = 0;
  let payable = 0;
  let pool = 0;
  let paid = 0;
  let funded = 0;
  for (const r of rows) {
    if (r.account.startsWith("user:")) {
      outstanding += r.b;
      if (r.account.endsWith(":pending")) pending += r.b;
      if (r.account.endsWith(":payable")) payable += r.b;
    } else if (r.account === acct.pool) pool = r.b;
    else if (r.account === acct.paidOut) paid = r.b;
    else if (r.account === acct.settlement) funded = -r.b;
  }
  return { funded, pool, outstanding, pending, payable, paid, backed: funded - paid >= outstanding + pool };
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
