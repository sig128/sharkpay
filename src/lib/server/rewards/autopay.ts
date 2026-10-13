import { all, one, run, tx } from "../db";
import { randomId } from "../crypto";
import { env } from "../env";
import { acct, balance, holderBalances, ledgerTotals, post } from "../ledger/ledger";
import { TRANSFERS_PER_TX, type PayoutChain } from "../solana/chain";
import { allocate, holderShare } from "./engine";

/**
 * Automatic holder payouts. Every PAYOUT_INTERVAL_MINUTES:
 *
 *   1. Settle transfers from earlier runs. If one may still land, stop here.
 *   2. Claim pump.fun creator fees into the fee wallet and unwrap WSOL.
 *   3. New income = fee wallet balance − float − liabilities. The float is the
 *      SOL that was already in the wallet before the first run (it pays network
 *      fees and is never distributed). Liabilities are SOL already promised.
 *   4. Split income: HOLDER_SHARE_BPS to the holder pool, the rest to operations.
 *   5. Credit the pool to holders by their average balance across the snapshots
 *      taken since the last run. Rounding dust stays in the pool.
 *   6. Send SOL to every wallet owed at least MIN_PAYOUT_LAMPORTS. Smaller
 *      amounts keep accumulating.
 *
 * Network fees are paid from income: they lower the balance, so the next run
 * sees less new income. The cycle is stateless apart from the ledger and the
 * float, so a crash at any step is repaired by the next run.
 */

const REALM = "live";
const LOCK = "payout-cycle";
const LOCK_TTL_MS = 15 * 60_000;
const FLOAT_KEY = "fee_wallet_float";
const SNAPSHOT_RETENTION_MS = 48 * 3600_000;
const CONFIRM_POLLS = 20;
const CONFIRM_POLL_MS = 3_000;
const SIGNATURE_FEE = 5_000;

export interface Recipient {
  wallet: string;
  lamports: number;
  /** Ledger account debited when the transfer confirms. */
  account: string;
}

export interface CycleSummary {
  id: string | null;
  status: "done" | "waiting" | "skipped" | "error";
  incomeLamports: number;
  holderLamports: number;
  opsLamports: number;
  creditedLamports: number;
  holders: number;
  paidLamports: number;
  paidWallets: number;
  notes: string[];
}

export interface CycleOptions {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Why automatic payouts are not running, or null when they are configured. */
export function payoutBlocker(): string | null {
  const e = env();
  if (!e.TOKEN_MINT) return "Waiting for the $SHARK contract address (TOKEN_MINT).";
  if (!e.FEE_WALLET_SECRET_KEY) return "Waiting for the fee wallet key (FEE_WALLET_SECRET_KEY).";
  if (!e.AUTO_PAYOUTS_ENABLED) return "Automatic payouts are switched off (AUTO_PAYOUTS_ENABLED).";
  return null;
}

// ---------------------------------------------------------------- locking

function acquireLock(name: string, now: number): string | null {
  const owner = randomId("lock");
  return tx(() => {
    const held = one<{ expires_at: number }>(`SELECT expires_at FROM job_locks WHERE name = ?`, name);
    if (held && held.expires_at > now) return null;
    run(`INSERT OR REPLACE INTO job_locks (name, owner, expires_at) VALUES (?, ?, ?)`, name, owner, now + LOCK_TTL_MS);
    return owner;
  });
}

function releaseLock(name: string, owner: string) {
  run(`DELETE FROM job_locks WHERE name = ? AND owner = ?`, name, owner);
}

// ---------------------------------------------------------------- state

export function getFloat(): number | null {
  const row = one<{ value: string }>(`SELECT value FROM job_state WHERE key = ?`, FLOAT_KEY);
  return row ? Number(row.value) : null;
}

function setFloat(value: number, now: number) {
  run(
    `INSERT INTO job_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    FLOAT_KEY,
    String(value),
    now,
  );
}

/** Addresses that never receive holder rewards. */
export function excludedAddresses(feeWallet: string): Set<string> {
  const e = env();
  const out = new Set(all<{ address: string }>(`SELECT address FROM exclusions WHERE realm = ?`, REALM).map((r) => r.address));
  out.add(feeWallet);
  if (e.OPS_WALLET) out.add(e.OPS_WALLET);
  if (e.SHARK_TREASURY_WALLET) out.add(e.SHARK_TREASURY_WALLET);
  return out;
}

// ---------------------------------------------------------------- snapshots

export async function takeSnapshot(chain: PayoutChain, now = Date.now()) {
  const mint = env().TOKEN_MINT;
  if (!mint) throw new Error("TOKEN_MINT is not set");
  const holders = await chain.holders(mint);
  const excluded = excludedAddresses(chain.feeWallet);
  const kept = [...holders].filter(([owner, raw]) => raw > 0n && !excluded.has(owner));
  const id = randomId("snap");
  tx(() => {
    run(
      `INSERT INTO holder_snapshots (id, taken_at, holders, total_raw) VALUES (?, ?, ?, ?)`,
      id,
      now,
      kept.length,
      kept.reduce((s, [, raw]) => s + raw, 0n).toString(),
    );
    for (const [owner, raw] of kept) {
      run(`INSERT INTO holder_snapshot_balances (snapshot_id, owner, balance_raw) VALUES (?, ?, ?)`, id, owner, raw.toString());
    }
    run(`DELETE FROM holder_snapshots WHERE taken_at < ?`, now - SNAPSHOT_RETENTION_MS);
  });
  return { id, holders: kept.length };
}

/** Sum of each wallet's balance across snapshots in (since, until]. Wallets below the minimum average drop out. */
export function snapshotWeights(sinceMs: number, untilMs: number, excluded: Set<string>) {
  const snaps = all<{ id: string }>(
    `SELECT id FROM holder_snapshots WHERE taken_at > ? AND taken_at <= ?`,
    sinceMs,
    untilMs,
  );
  const weights = new Map<string, bigint>();
  if (snaps.length === 0) return { weights, snapshots: 0 };
  const rows = all<{ owner: string; balance_raw: string }>(
    `SELECT owner, balance_raw FROM holder_snapshot_balances WHERE snapshot_id IN (${snaps.map(() => "?").join(",")})`,
    ...snaps.map((s) => s.id),
  );
  for (const r of rows) {
    if (excluded.has(r.owner)) continue;
    weights.set(r.owner, (weights.get(r.owner) ?? 0n) + BigInt(r.balance_raw));
  }
  const e = env();
  const minRaw = BigInt(Math.round(e.MIN_ELIGIBLE_BALANCE * 10 ** e.TOKEN_DECIMALS));
  const n = BigInt(snaps.length);
  for (const [owner, w] of weights) if (w / n < minRaw || w === 0n) weights.delete(owner);
  return { weights, snapshots: snaps.length };
}

// ---------------------------------------------------------------- transfers

function settleConfirmed(transferId: string, signature: string, recipients: Recipient[], now: number) {
  tx(() => {
    const holders = recipients.filter((r) => r.account !== acct.opsOwed);
    const ops = recipients.filter((r) => r.account === acct.opsOwed);
    const holderSum = holders.reduce((s, r) => s + r.lamports, 0);
    const opsSum = ops.reduce((s, r) => s + r.lamports, 0);
    post(
      REALM,
      {
        kind: "payout",
        idempotencyKey: `transfer:${signature}`,
        refType: "payout_transfer",
        refId: transferId,
        memo: signature,
        entries: [
          ...recipients.map((r) => ({ account: r.account, amount: -r.lamports })),
          { account: acct.paidHolders, amount: holderSum },
          { account: acct.paidOps, amount: opsSum },
        ],
      },
      now,
    );
    for (const r of holders) {
      run(`INSERT INTO holder_payouts (transfer_id, wallet, lamports, paid_at) VALUES (?, ?, ?, ?)`, transferId, r.wallet, r.lamports, now);
    }
    run(`UPDATE payout_transfers SET status = 'confirmed', settled_at = ? WHERE id = ?`, now, transferId);
  });
}

/** Resolves every in-flight transfer it can. Returns how many may still land. */
export async function reconcileTransfers(chain: PayoutChain, now: number): Promise<number> {
  const open = all<{ id: string; signature: string; recipients: string; last_valid_block_height: number }>(
    `SELECT id, signature, recipients, last_valid_block_height FROM payout_transfers WHERE status = 'sending' ORDER BY created_at`,
  );
  if (open.length === 0) return 0;
  const statuses = await chain.statuses(open.map((t) => t.signature));
  const height = statuses.includes("unknown") ? await chain.blockHeight() : 0;
  let stillOpen = 0;
  open.forEach((t, i) => {
    const s = statuses[i];
    if (s === "confirmed") settleConfirmed(t.id, t.signature, JSON.parse(t.recipients) as Recipient[], now);
    else if (s === "failed") run(`UPDATE payout_transfers SET status = 'failed', settled_at = ? WHERE id = ?`, now, t.id);
    else if (height > t.last_valid_block_height) {
      run(`UPDATE payout_transfers SET status = 'expired', settled_at = ? WHERE id = ?`, now, t.id);
    } else stillOpen++;
  });
  return stillOpen;
}

/**
 * Who gets paid this run: owed ≥ minimum, largest first, within the budget.
 * Network fees are taken from `feeCushion` (the float) first; the next run's
 * income makes up for them.
 */
export function selectRecipients(budget: number, feeCushion: number): Recipient[] {
  const e = env();
  const owed: Recipient[] = holderBalances(REALM)
    .filter((h) => h.owed >= e.MIN_PAYOUT_LAMPORTS)
    .map((h) => ({ wallet: h.wallet, lamports: h.owed, account: acct.holder(h.wallet) }));
  const opsOwed = balance(REALM, acct.opsOwed);
  if (e.OPS_WALLET && opsOwed >= e.MIN_PAYOUT_LAMPORTS) owed.push({ wallet: e.OPS_WALLET, lamports: opsOwed, account: acct.opsOwed });
  const perTxFee = SIGNATURE_FEE + Math.ceil((e.PRIORITY_FEE_MICROLAMPORTS * (1_000 + 300 * TRANSFERS_PER_TX)) / 1e6);
  let left = Math.min(budget, e.MAX_PAYOUT_PER_CYCLE_LAMPORTS);
  let cushion = Math.max(0, feeCushion);
  const out: Recipient[] = [];
  for (const r of owed) {
    const fee = out.length % TRANSFERS_PER_TX === 0 ? perTxFee : 0;
    const fromCushion = Math.min(fee, cushion);
    if (r.lamports + fee - fromCushion > left) continue;
    cushion -= fromCushion;
    left -= r.lamports + fee - fromCushion;
    out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------- the cycle

export async function runPayoutCycle(chain: PayoutChain, opts: CycleOptions = {}): Promise<CycleSummary> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const e = env();
  const summary: CycleSummary = {
    id: null,
    status: "skipped",
    incomeLamports: 0,
    holderLamports: 0,
    opsLamports: 0,
    creditedLamports: 0,
    holders: 0,
    paidLamports: 0,
    paidWallets: 0,
    notes: [],
  };
  const mint = e.TOKEN_MINT;
  if (!mint) {
    summary.notes.push("TOKEN_MINT is not set");
    return summary;
  }
  const lock = acquireLock(LOCK, now());
  if (!lock) {
    summary.notes.push("Another payout run is in progress");
    return summary;
  }

  const id = randomId("cyc");
  summary.id = id;
  const startedAt = now();
  const previous = one<{ started_at: number; finished_at: number | null }>(
    `SELECT started_at, finished_at FROM payout_cycles ORDER BY started_at DESC LIMIT 1`,
  );
  run(`INSERT INTO payout_cycles (id, started_at, status) VALUES (?, ?, 'running')`, id, startedAt);
  let claimSignature: string | null = null;
  let balanceNow: number | null = null;
  let snapshots = 0;

  try {
    if ((await reconcileTransfers(chain, now())) > 0) {
      summary.status = "waiting";
      summary.notes.push("Earlier payouts are still confirming; this run will not send anything.");
      return summary;
    }

    if (getFloat() === null) setFloat(await chain.balance(), now());

    try {
      claimSignature = await chain.claimCreatorFees(mint);
    } catch (err) {
      summary.notes.push(`Fee claim skipped: ${(err as Error).message}`);
    }
    try {
      await chain.unwrapWsol();
    } catch (err) {
      summary.notes.push(`WSOL unwrap skipped: ${(err as Error).message}`);
    }
    try {
      await takeSnapshot(chain, now());
    } catch (err) {
      summary.notes.push(`Holder snapshot failed: ${(err as Error).message}`);
    }

    balanceNow = await chain.balance();
    const float = getFloat() ?? 0;
    const income = balanceNow - float - ledgerTotals(REALM).liabilities;

    if (income > 0) {
      const split = holderShare(income, e.HOLDER_SHARE_BPS);
      tx(() => {
        post(
          REALM,
          {
            kind: "fee_income",
            idempotencyKey: `income:${id}`,
            refType: "payout_cycle",
            refId: id,
            memo: claimSignature ?? undefined,
            entries: [
              { account: acct.feeIncome, amount: -income },
              { account: acct.pool, amount: split.holder },
              { account: e.OPS_WALLET ? acct.opsOwed : acct.opsKept, amount: split.operations },
            ],
          },
          now(),
        );
        // Kept operations SOL stays in the wallet; folding it into the float stops it counting as income again.
        if (!e.OPS_WALLET && split.operations > 0) setFloat(float + split.operations, now());
      });
      summary.incomeLamports = income;
      summary.holderLamports = split.holder;
      summary.opsLamports = split.operations;
    }

    const excluded = excludedAddresses(chain.feeWallet);
    const since = previous ? (previous.finished_at ?? previous.started_at) : startedAt - e.PAYOUT_INTERVAL_MINUTES * 60_000;
    const { weights, snapshots: n } = snapshotWeights(since, now(), excluded);
    snapshots = n;
    const pool = balance(REALM, acct.pool);
    const result = allocate(pool, weights);
    if (result.allocated > 0) {
      post(
        REALM,
        {
          kind: "accrual",
          idempotencyKey: `accrual:${id}`,
          refType: "payout_cycle",
          refId: id,
          entries: [
            { account: acct.pool, amount: -result.allocated },
            ...result.shares.filter((s) => s.lamports > 0).map((s) => ({ account: acct.holder(s.wallet), amount: s.lamports })),
          ],
        },
        now(),
      );
    }
    summary.creditedLamports = result.allocated;
    summary.holders = result.shares.filter((s) => s.lamports > 0).length;

    const floatNow = getFloat() ?? 0;
    const recipients = selectRecipients(balanceNow - floatNow, Math.min(floatNow, balanceNow));
    for (let i = 0; i < recipients.length; i += TRANSFERS_PER_TX) {
      const batch = recipients.slice(i, i + TRANSFERS_PER_TX);
      const signed = await chain.signTransfers(batch.map(({ wallet, lamports }) => ({ wallet, lamports })));
      run(
        `INSERT INTO payout_transfers (id, cycle_id, signature, status, lamports, recipients, last_valid_block_height, created_at)
         VALUES (?, ?, ?, 'sending', ?, ?, ?, ?)`,
        randomId("ptx"),
        id,
        signed.signature,
        batch.reduce((s, r) => s + r.lamports, 0),
        JSON.stringify(batch),
        signed.lastValidBlockHeight,
        now(),
      );
      try {
        await chain.send(signed.serialized);
      } catch (err) {
        summary.notes.push(`Broadcast failed, will retry next run: ${(err as Error).message}`);
        break;
      }
    }

    let open = recipients.length > 0 ? await reconcileTransfers(chain, now()) : 0;
    for (let i = 0; open > 0 && i < CONFIRM_POLLS; i++) {
      await sleep(CONFIRM_POLL_MS);
      open = await reconcileTransfers(chain, now());
    }
    const paid = one<{ total: number | null; wallets: number }>(
      `SELECT SUM(p.lamports) AS total, COUNT(DISTINCT p.wallet) AS wallets
       FROM holder_payouts p JOIN payout_transfers t ON t.id = p.transfer_id WHERE t.cycle_id = ?`,
      id,
    );
    summary.paidLamports = paid?.total ?? 0;
    summary.paidWallets = paid?.wallets ?? 0;
    if (open > 0) summary.notes.push(`${open} transfer(s) still confirming; the next run settles them.`);
    summary.status = "done";
    return summary;
  } catch (err) {
    summary.status = "error";
    summary.notes.push((err as Error).message);
    return summary;
  } finally {
    run(
      `UPDATE payout_cycles SET finished_at = ?, status = ?, claim_signature = ?, balance_lamports = ?, income_lamports = ?,
         holder_lamports = ?, ops_lamports = ?, snapshots = ?, holders = ?, credited_lamports = ?, paid_lamports = ?,
         paid_wallets = ?, note = ? WHERE id = ?`,
      now(),
      summary.status,
      claimSignature,
      balanceNow,
      summary.incomeLamports,
      summary.holderLamports,
      summary.opsLamports,
      snapshots,
      summary.holders,
      summary.creditedLamports,
      summary.paidLamports,
      summary.paidWallets,
      summary.notes.join(" ") || null,
      id,
    );
    releaseLock(LOCK, lock);
  }
}
