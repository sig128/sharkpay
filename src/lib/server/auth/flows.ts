import { one, run, tx } from "../db";
import { randomToken } from "../crypto";
import { AppError } from "../errors";

export const FLOW_COOKIE = "sc_flow";
const FLOW_TTL_MS = 10 * 60 * 1000;

export type FlowPurpose = "login" | "link" | "reauth";

export interface AuthFlow {
  state: string;
  provider: string;
  purpose: FlowPurpose;
  codeVerifier: string | null;
  nonce: string | null;
  userId: string | null;
  sessionHash: string | null;
  returnTo: string | null;
}

/** Stores single-use, expiring state for a redirect-based sign-in. */
export function createFlow(input: Omit<AuthFlow, "state"> & { now?: number }): AuthFlow {
  const now = input.now ?? Date.now();
  const state = randomToken(24);
  run(
    `INSERT INTO auth_flows (state, provider, purpose, code_verifier, nonce, user_id, session_hash, return_to, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    state,
    input.provider,
    input.purpose,
    input.codeVerifier,
    input.nonce,
    input.userId,
    input.sessionHash,
    safeReturnTo(input.returnTo),
    now,
    now + FLOW_TTL_MS,
  );
  return { ...input, state, returnTo: safeReturnTo(input.returnTo) };
}

/**
 * Consumes the flow exactly once. The state must also match the value bound to
 * this browser in the flow cookie, which stops login CSRF and callback replay.
 */
export function consumeFlow(
  state: string | null | undefined,
  provider: string,
  browserState: string | null | undefined,
  now = Date.now(),
): AuthFlow {
  if (!state || !browserState || state !== browserState) {
    throw new AppError("invalid_state", "This sign-in link is not valid for this browser. Please start again.");
  }
  return tx(() => {
    const row = one<{
      state: string;
      provider: string;
      purpose: FlowPurpose;
      code_verifier: string | null;
      nonce: string | null;
      user_id: string | null;
      session_hash: string | null;
      return_to: string | null;
      expires_at: number;
      consumed_at: number | null;
    }>(`SELECT * FROM auth_flows WHERE state = ?`, state);
    if (!row || row.provider !== provider) throw new AppError("invalid_state", "Unknown sign-in attempt. Please start again.");
    if (row.consumed_at) throw new AppError("state_reused", "This sign-in response was already used.");
    if (row.expires_at <= now) throw new AppError("state_expired", "This sign-in attempt expired. Please start again.");
    run(`UPDATE auth_flows SET consumed_at = ? WHERE state = ?`, now, state);
    return {
      state: row.state,
      provider: row.provider,
      purpose: row.purpose,
      codeVerifier: row.code_verifier,
      nonce: row.nonce,
      userId: row.user_id,
      sessionHash: row.session_hash,
      returnTo: row.return_to,
    };
  });
}

/** Only allow same-site relative paths as post-login destinations. */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value.slice(0, 200);
}
