import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { brand } from "@/config/brand";
import { all, one, run, tx } from "../db";
import { randomId, randomToken } from "../crypto";
import { env } from "../env";
import { AppError, notFound } from "../errors";
import { isRecentlyAuthenticated, type Session } from "../auth/sessions";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_WALLETS_PER_USER = 3;

export function isSolanaAddress(address: string) {
  try {
    return bs58.decode(address).length === 32;
  } catch {
    return false;
  }
}

function requireWalletAuth(session: Session, now: number) {
  if (session.kind === "demo") return;
  if (!isRecentlyAuthenticated(session, now)) {
    throw new AppError("reauth_required", "Confirm it's you by signing in again before changing wallets", 403);
  }
}

export interface WalletChallenge {
  id: string;
  message: string;
  expiresAt: number;
}

/** A domain-bound, expiring, single-use message. Signing it authorizes nothing on-chain. */
export function createWalletChallenge(session: Session, address: string, now = Date.now()): WalletChallenge {
  requireWalletAuth(session, now);
  if (!isSolanaAddress(address)) throw new AppError("invalid_address", "That is not a valid Solana address");
  const appUrl = new URL(env().APP_URL);
  const nonce = randomToken(16);
  const expiresAt = now + CHALLENGE_TTL_MS;
  const message = [
    `${appUrl.host} wants you to link a Solana wallet to your ${brand.name} account.`,
    "",
    "This proves you control the wallet so holder rewards can be credited to you.",
    "It does not approve any transaction, transfer or token spending.",
    "",
    `Wallet: ${address}`,
    `Account: ${session.userId}`,
    `URI: ${appUrl.origin}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(now).toISOString()}`,
    `Expiration Time: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");
  const id = randomId("wch");
  run(
    `INSERT INTO wallet_challenges (id, user_id, realm, address, message, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    session.userId,
    session.realm,
    address,
    message,
    now,
    expiresAt,
  );
  return { id, message, expiresAt };
}

function decodeSignature(signature: string): Uint8Array {
  try {
    const b58 = bs58.decode(signature);
    if (b58.length === 64) return b58;
  } catch {
    /* fall through to base64 */
  }
  const b64 = Buffer.from(signature, "base64");
  if (b64.length === 64) return new Uint8Array(b64);
  throw new AppError("invalid_signature", "Signature format not recognised");
}

export function verifyWalletChallenge(
  session: Session,
  input: { challengeId: string; signature: string },
  now = Date.now(),
) {
  requireWalletAuth(session, now);
  return tx(() => {
    const ch = one<{
      id: string;
      user_id: string;
      realm: string;
      address: string;
      message: string;
      expires_at: number;
      consumed_at: number | null;
    }>(`SELECT * FROM wallet_challenges WHERE id = ?`, input.challengeId);
    if (!ch || ch.user_id !== session.userId || ch.realm !== session.realm) {
      throw new AppError("invalid_challenge", "Unknown wallet challenge");
    }
    if (ch.consumed_at) throw new AppError("challenge_used", "This challenge was already used. Start again.");
    if (ch.expires_at <= now) throw new AppError("challenge_expired", "This challenge expired. Start again.");
    run(`UPDATE wallet_challenges SET consumed_at = ? WHERE id = ?`, now, ch.id);

    const ok = ed25519.verify(
      decodeSignature(input.signature),
      new TextEncoder().encode(ch.message),
      bs58.decode(ch.address),
    );
    if (!ok) throw new AppError("invalid_signature", "The signature does not match this wallet");

    const active = one<{ user_id: string }>(
      `SELECT user_id FROM wallets WHERE realm = ? AND address = ? AND unlinked_at IS NULL`,
      ch.realm,
      ch.address,
    );
    if (active && active.user_id !== session.userId) {
      throw new AppError("wallet_in_use", "This wallet is already linked to another member", 409);
    }
    if (active) return { address: ch.address, alreadyLinked: true };

    const cooldownMs = env().PERIOD_LENGTH_DAYS * 24 * 3600 * 1000;
    const recent = one<{ user_id: string }>(
      `SELECT user_id FROM wallets WHERE realm = ? AND address = ? AND unlinked_at > ? AND user_id != ?
       ORDER BY unlinked_at DESC LIMIT 1`,
      ch.realm,
      ch.address,
      now - cooldownMs,
      session.userId,
    );
    if (recent) {
      throw new AppError(
        "wallet_cooldown",
        "This wallet was recently linked to another member. It can be linked again after one full reward period.",
        409,
      );
    }
    const count = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM wallets WHERE user_id = ? AND unlinked_at IS NULL`,
      session.userId,
    )!.n;
    if (count >= MAX_WALLETS_PER_USER) {
      throw new AppError("wallet_limit", `You can link up to ${MAX_WALLETS_PER_USER} wallets`, 409);
    }
    run(
      `INSERT INTO wallets (id, user_id, realm, address, proof_message, proof_signature, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      randomId("wal"),
      session.userId,
      ch.realm,
      ch.address,
      ch.message,
      input.signature,
      now,
    );
    return { address: ch.address, alreadyLinked: false };
  });
}

export function listWallets(userId: string) {
  return all<{ id: string; address: string; verified_at: number }>(
    `SELECT id, address, verified_at FROM wallets WHERE user_id = ? AND unlinked_at IS NULL ORDER BY verified_at`,
    userId,
  );
}

export function unlinkWallet(session: Session, walletId: string, now = Date.now()) {
  requireWalletAuth(session, now);
  const res = run(
    `UPDATE wallets SET unlinked_at = ? WHERE id = ? AND user_id = ? AND unlinked_at IS NULL`,
    now,
    walletId,
    session.userId,
  );
  if (res.changes === 0) throw notFound("Wallet");
}

export function maskAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
