import { all, one, run, tx } from "../db";
import { lookupHash, randomId } from "../crypto";
import { AppError, forbidden, notFound } from "../errors";
import { isRecentlyAuthenticated, type Session } from "./sessions";

export type Provider = "microsoft" | "xbox" | "steam" | "google" | "x" | "email" | "demo";
/** Providers that can sign a user in. Xbox is a verification link on top of Microsoft sign-in. */
export const LOGIN_PROVIDERS: Provider[] = ["microsoft", "steam", "google", "x", "email", "demo"];

export interface ProviderProfile {
  provider: Provider;
  subject: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  claims?: Record<string, unknown>;
}

export interface UserRow {
  id: string;
  realm: string;
  display_name: string;
  avatar_url: string | null;
  reward_platform: string | null;
  reward_region: string | null;
  selected_item_tier: string | null;
  onboarded_at: number | null;
  created_at: number;
}

export interface IdentityRow {
  id: string;
  user_id: string;
  realm: string;
  provider: Provider;
  subject: string;
  display_name: string | null;
  avatar_url: string | null;
  claims: string;
  created_at: number;
  last_auth_at: number;
}

export function getUser(userId: string): UserRow | undefined {
  return one<UserRow>(`SELECT * FROM users WHERE id = ?`, userId);
}

export function listIdentities(userId: string): IdentityRow[] {
  return all<IdentityRow>(`SELECT * FROM identities WHERE user_id = ? ORDER BY created_at`, userId);
}

function findIdentity(realm: string, provider: Provider, subject: string) {
  return one<IdentityRow>(
    `SELECT * FROM identities WHERE realm = ? AND provider = ? AND subject = ?`,
    realm,
    provider,
    subject,
  );
}

/**
 * Sign-in: resolves the internal user for a verified provider identity, or
 * creates a new one. Accounts are never merged by display name or email.
 */
export function signInWithIdentity(realm: string, profile: ProviderProfile, now = Date.now()) {
  if (!LOGIN_PROVIDERS.includes(profile.provider)) {
    throw new AppError("not_login_provider", "This provider can only be linked, not used to sign in");
  }
  return tx(() => {
    const existing = findIdentity(realm, profile.provider, profile.subject);
    if (existing) {
      run(
        `UPDATE identities SET last_auth_at = ?, display_name = COALESCE(?, display_name),
         avatar_url = COALESCE(?, avatar_url) WHERE id = ?`,
        now,
        profile.displayName ?? null,
        profile.avatarUrl ?? null,
        existing.id,
      );
      return { userId: existing.user_id, created: false };
    }
    const userId = randomId("usr");
    run(
      `INSERT INTO users (id, realm, display_name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)`,
      userId,
      realm,
      profile.displayName?.slice(0, 64) || "New member",
      profile.avatarUrl ?? null,
      now,
    );
    insertIdentity(userId, realm, profile, now);
    return { userId, created: true };
  });
}

function insertIdentity(userId: string, realm: string, profile: ProviderProfile, now: number) {
  run(
    `INSERT INTO identities (id, user_id, realm, provider, subject, display_name, avatar_url, claims, created_at, last_auth_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomId("idn"),
    userId,
    realm,
    profile.provider,
    profile.subject,
    profile.displayName ?? null,
    profile.avatarUrl ?? null,
    JSON.stringify(profile.claims ?? {}),
    now,
    now,
  );
}

export function requireRecentAuth(session: Session, now = Date.now()) {
  if (session.kind === "demo") throw forbidden("Demo sessions cannot link real accounts");
  if (!isRecentlyAuthenticated(session, now)) {
    throw new AppError("reauth_required", "Confirm it's you by signing in again", 403);
  }
}

/** Links an additional verified identity to the signed-in user. */
export function linkIdentity(session: Session, profile: ProviderProfile, now = Date.now()) {
  requireRecentAuth(session, now);
  return tx(() => {
    const existing = findIdentity(session.realm, profile.provider, profile.subject);
    if (existing && existing.user_id !== session.userId) {
      throw new AppError(
        "identity_in_use",
        "That account is already connected to a different member. Sign in with it and unlink it there first.",
        409,
      );
    }
    if (existing) return existing.id;
    const sameProvider = one<IdentityRow>(
      `SELECT * FROM identities WHERE user_id = ? AND provider = ?`,
      session.userId,
      profile.provider,
    );
    if (sameProvider) {
      throw new AppError("provider_already_linked", "Unlink your current account for this provider first", 409);
    }
    insertIdentity(session.userId, session.realm, profile, now);
    return findIdentity(session.realm, profile.provider, profile.subject)!.id;
  });
}

export function unlinkIdentity(session: Session, identityId: string, now = Date.now()) {
  requireRecentAuth(session, now);
  tx(() => {
    const identity = one<IdentityRow>(`SELECT * FROM identities WHERE id = ?`, identityId);
    if (!identity || identity.user_id !== session.userId) throw notFound("Connected account");
    const remainingLogins = all<IdentityRow>(
      `SELECT * FROM identities WHERE user_id = ? AND id != ?`,
      session.userId,
      identityId,
    ).filter((i) => LOGIN_PROVIDERS.includes(i.provider));
    if (LOGIN_PROVIDERS.includes(identity.provider) && remainingLogins.length === 0) {
      throw new AppError("last_login_method", "Keep at least one way to sign in before unlinking this one", 409);
    }
    run(`DELETE FROM identities WHERE id = ?`, identityId);
  });
}

export function updatePreferences(
  userId: string,
  prefs: { platform?: string; region?: string; tier?: string; markOnboarded?: boolean },
) {
  run(
    `UPDATE users SET reward_platform = COALESCE(?, reward_platform), reward_region = COALESCE(?, reward_region),
     selected_item_tier = COALESCE(?, selected_item_tier),
     onboarded_at = CASE WHEN ? = 1 AND onboarded_at IS NULL THEN ? ELSE onboarded_at END WHERE id = ?`,
    prefs.platform ?? null,
    prefs.region ?? null,
    prefs.tier ?? null,
    prefs.markOnboarded ? 1 : 0,
    Date.now(),
    userId,
  );
}

// ---- Recovery codes -------------------------------------------------------

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** Issues a fresh set of single-use recovery codes. Previous unused codes are invalidated. */
export function regenerateRecoveryCodes(session: Session, now = Date.now()) {
  requireRecentAuth(session, now);
  const codes = Array.from({ length: 8 }, makeCode);
  tx(() => {
    run(`DELETE FROM recovery_codes WHERE user_id = ?`, session.userId);
    for (const code of codes) {
      run(
        `INSERT INTO recovery_codes (id, user_id, code_hash, created_at) VALUES (?, ?, ?, ?)`,
        randomId("rc"),
        session.userId,
        lookupHash(code),
        now,
      );
    }
  });
  return codes;
}

export function recoveryCodeStatus(userId: string) {
  return one<{ total: number; remaining: number }>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN used_at IS NULL THEN 1 ELSE 0 END) AS remaining
     FROM recovery_codes WHERE user_id = ?`,
    userId,
  ) ?? { total: 0, remaining: 0 };
}

export function consumeRecoveryCode(code: string, now = Date.now()): string | null {
  const normalized = code.trim().toUpperCase();
  return tx(() => {
    const row = one<{ id: string; user_id: string; used_at: number | null }>(
      `SELECT r.id, r.user_id, r.used_at FROM recovery_codes r JOIN users u ON u.id = r.user_id
       WHERE r.code_hash = ? AND u.realm = 'live'`,
      lookupHash(normalized),
    );
    if (!row || row.used_at) return null;
    run(`UPDATE recovery_codes SET used_at = ? WHERE id = ?`, now, row.id);
    return row.user_id;
  });
}
