import { all, one, run, tx } from "../db";
import { randomId } from "../crypto";
import { env } from "../env";
import { AppError } from "../errors";
import { acct, balance, post } from "../ledger/ledger";
import { getFinalizedTransaction, solanaRpc, type ParsedTx, type Rpc } from "../chain/rpc";
import { validAddress } from "../services/buy";

/**
 * SOL reward payouts. The website never sends SOL: the operator pays members
 * from the payout wallet with their own signer, then records each transfer
 * here. A record is accepted only if the finalized transaction really moved at
 * least that many lamports from the payout wallet to the member's linked wallet.
 */

export function payoutWallet() {
  const e = env();
  return validAddress(e.REWARDS_PAYOUT_WALLET) ?? validAddress(e.SHARK_TREASURY_WALLET);
}

/** Pure check: lamports `to` gained in a successful transaction signed by `from`. */
export function inspectSolTransfer(t: ParsedTx | null, from: string, to: string) {
  if (!t?.meta || t.meta.err || !t.meta.preBalances || !t.meta.postBalances) return null;
  const keys = t.transaction.message.accountKeys;
  const index = (addr: string) => keys.findIndex((k) => (typeof k === "string" ? k : k.pubkey) === addr);
  const fromIdx = index(from);
  const toIdx = index(to);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return null;
  const signer = keys[fromIdx];
  if (typeof signer === "string" || !signer.signer) return null;
  const received = t.meta.postBalances[toIdx] - t.meta.preBalances[toIdx];
  const sent = t.meta.preBalances[fromIdx] - t.meta.postBalances[fromIdx];
  if (received <= 0 || sent < received) return null;
  return { received, blockTimeMs: t.blockTime ? t.blockTime * 1000 : null };
}

interface PayoutInput {
  wallet: string;
  lamports: number;
  signature: string;
}

function checkInput(realm: string, input: PayoutInput) {
  if (!Number.isSafeInteger(input.lamports) || input.lamports <= 0) throw new AppError("invalid_request", "Amount must be positive lamports");
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(input.signature)) throw new AppError("invalid_request", "That isn't a transaction signature");
  if (one(`SELECT 1 FROM payouts WHERE signature = ?`, input.signature)) {
    throw new AppError("duplicate_payout", "That transaction is already recorded as a payout", 409);
  }
  const link = one<{ user_id: string }>(
    `SELECT user_id FROM wallets WHERE realm = ? AND address = ? AND unlinked_at IS NULL`,
    realm,
    input.wallet,
  );
  if (!link) throw new AppError("not_found", "That wallet isn't linked to a member", 404);
  if (balance(realm, acct.payable(link.user_id)) < input.lamports) {
    throw new AppError("insufficient_funds", "That's more than this member is owed", 409);
  }
  return link.user_id;
}

function write(realm: string, userId: string, input: PayoutInput, verifiedBy: string, paidAt: number, now: number) {
  return tx(() => {
    checkInput(realm, input);
    const id = randomId("pay");
    run(
      `INSERT INTO payouts (id, realm, user_id, wallet, lamports, signature, verified_by, paid_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      realm,
      userId,
      input.wallet,
      input.lamports,
      input.signature,
      verifiedBy,
      paidAt,
      now,
    );
    post(
      realm,
      {
        kind: "payout",
        idempotencyKey: `payout:${input.signature}`,
        refType: "payout",
        refId: id,
        memo: "SOL reward paid to your linked wallet",
        entries: [
          { account: acct.payable(userId), amount: -input.lamports },
          { account: acct.paidOut, amount: input.lamports },
        ],
      },
      now,
    );
    return { id, userId, lamports: input.lamports, signature: input.signature };
  });
}

/** Records a live payout after verifying the finalized transfer on-chain. Fails closed. */
export async function recordPayout(input: PayoutInput, rpc: Rpc = solanaRpc(), now = Date.now()) {
  const realm = "live";
  const from = payoutWallet();
  if (!from) throw new AppError("not_configured", "No payout wallet is configured", 503);
  const userId = checkInput(realm, input);
  const t = await getFinalizedTransaction(rpc, input.signature);
  const transfer = inspectSolTransfer(t, from, input.wallet);
  if (!transfer) {
    throw new AppError("payout_unverified", "No finalized SOL transfer from the payout wallet to that wallet in this transaction", 422);
  }
  if (transfer.received < input.lamports) {
    throw new AppError("payout_unverified", `The transaction only sent ${transfer.received} lamports`, 422);
  }
  return write(realm, userId, input, "rpc", transfer.blockTimeMs ?? now, now);
}

/** Sandbox-only payout used to build demo history. There is no chain to verify against. */
export function recordDemoPayout(realm: string, input: PayoutInput, now = Date.now()) {
  if (!realm.startsWith("demo:")) throw new AppError("forbidden", "Unverified payouts are only allowed in demo sandboxes", 403);
  const userId = checkInput(realm, input);
  return write(realm, userId, input, "demo", now, now);
}

/** What each member is owed, for the operator to pay. Live realm only. */
export function payoutsDue(realm = "live") {
  return all<{ user_id: string; lamports: number }>(
    `SELECT substr(account, 6, length(account) - 13) AS user_id, SUM(amount) AS lamports FROM ledger_entries
     WHERE realm = ? AND account LIKE 'user:%:payable' GROUP BY account HAVING SUM(amount) > 0`,
    realm,
  ).map((r) => ({
    userId: r.user_id,
    lamports: r.lamports,
    wallets: all<{ address: string }>(
      `SELECT address FROM wallets WHERE realm = ? AND user_id = ? AND unlinked_at IS NULL ORDER BY verified_at`,
      realm,
      r.user_id,
    ).map((w) => w.address),
  }));
}

export function userPayouts(realm: string, userId: string) {
  return all<{ id: string; wallet: string; lamports: number; signature: string; verified_by: string; paid_at: number }>(
    `SELECT id, wallet, lamports, signature, verified_by, paid_at FROM payouts WHERE realm = ? AND user_id = ? ORDER BY paid_at DESC`,
    realm,
    userId,
  );
}
