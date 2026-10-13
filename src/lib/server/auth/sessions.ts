import { one, run } from "../db";
import { randomToken, sha256 } from "../crypto";

export const SESSION_COOKIE = "sc_session";
export const SESSION_TTL_MS = 14 * 24 * 3600 * 1000;
/** Linking or unlinking identities and wallets requires a sign-in this recent. */
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;

export type SessionKind = "real";

export interface Session {
  idHash: string;
  userId: string;
  realm: string;
  kind: SessionKind;
  authProvider: string;
  authAt: number;
  expiresAt: number;
}

export function createSession(input: {
  userId: string;
  realm: string;
  kind: SessionKind;
  authProvider: string;
  now?: number;
}): { token: string; session: Session } {
  const now = input.now ?? Date.now();
  const token = randomToken(32);
  const idHash = sha256(token);
  const ttl = SESSION_TTL_MS;
  run(
    `INSERT INTO sessions (id_hash, user_id, realm, kind, auth_provider, auth_at, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    idHash,
    input.userId,
    input.realm,
    input.kind,
    input.authProvider,
    now,
    now,
    now + ttl,
  );
  return {
    token,
    session: {
      idHash,
      userId: input.userId,
      realm: input.realm,
      kind: input.kind,
      authProvider: input.authProvider,
      authAt: now,
      expiresAt: now + ttl,
    },
  };
}

export function resolveSession(token: string | undefined, now = Date.now()): Session | null {
  if (!token || token.length > 128) return null;
  const row = one<{
    id_hash: string;
    user_id: string;
    realm: string;
    kind: SessionKind;
    auth_provider: string;
    auth_at: number;
    expires_at: number;
    revoked_at: number | null;
  }>(`SELECT * FROM sessions WHERE id_hash = ?`, sha256(token));
  if (!row || row.revoked_at || row.expires_at <= now || row.kind !== "real" || row.realm !== "live") return null;
  return {
    idHash: row.id_hash,
    userId: row.user_id,
    realm: row.realm,
    kind: row.kind,
    authProvider: row.auth_provider,
    authAt: row.auth_at,
    expiresAt: row.expires_at,
  };
}

export function markReauthenticated(idHash: string, provider: string, now = Date.now()) {
  run(`UPDATE sessions SET auth_at = ?, auth_provider = ? WHERE id_hash = ?`, now, provider, idHash);
}

export function isRecentlyAuthenticated(session: Session, now = Date.now()) {
  return now - session.authAt <= REAUTH_WINDOW_MS;
}

export function revokeSession(idHash: string) {
  run(`UPDATE sessions SET revoked_at = ? WHERE id_hash = ? AND revoked_at IS NULL`, Date.now(), idHash);
}

export function revokeAllSessions(userId: string, exceptIdHash?: string) {
  run(
    `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id_hash != ?`,
    Date.now(),
    userId,
    exceptIdHash ?? "",
  );
}
