import { all, one } from "../db";
import { env } from "../env";
import { walletRewards } from "./status";

/** A member's active linked wallet addresses. */
export function linkedWalletAddresses(userId: string): string[] {
  return all<{ address: string }>(
    `SELECT address FROM wallets WHERE user_id = ? AND realm = 'live' AND unlinked_at IS NULL ORDER BY verified_at`,
    userId,
  ).map((w) => w.address);
}

/** Owed, paid and recent payouts across a member's linked wallets. */
export function memberRewards(userId: string, limit = 20) {
  return walletRewards(linkedWalletAddresses(userId), limit);
}

export function tokenAmount(raw: bigint) {
  const d = env().TOKEN_DECIMALS;
  return Number(raw / 10n ** BigInt(d)) + Number(raw % 10n ** BigInt(d)) / 10 ** d;
}

/** $SHARK held by these wallets in the most recent holder snapshot. */
export function snapshotHoldings(wallets: string[]): { raw: bigint; tokens: number; takenAt: number | null } {
  const snap = one<{ id: string; taken_at: number }>(`SELECT id, taken_at FROM holder_snapshots ORDER BY taken_at DESC LIMIT 1`);
  if (!snap || wallets.length === 0) return { raw: 0n, tokens: 0, takenAt: snap?.taken_at ?? null };
  const raw = all<{ balance_raw: string }>(
    `SELECT balance_raw FROM holder_snapshot_balances WHERE snapshot_id = ? AND owner IN (${wallets.map(() => "?").join(",")})`,
    snap.id,
    ...wallets,
  ).reduce((s, r) => s + BigInt(r.balance_raw), 0n);
  return { raw, tokens: tokenAmount(raw), takenAt: snap.taken_at };
}
