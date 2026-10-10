import { one, run } from "../db";
import { encrypt, lookupHash, randomId } from "../crypto";
import { normalizeEmail } from "../auth/email";

/**
 * Future payment card ("Pay with SHARKCARD"). Real merchant spending through
 * Apple Pay needs a regulated issuing partner whose card program supports
 * Apple Pay, plus issuer provisioning integration. None exists in this build.
 *
 * A card balance would be its own ledger, funded in fiat by the issuer
 * program, and kept separate from SOL rewards, token holdings and GTA$. Nothing here
 * provisions a card or moves money.
 */
export interface CardIssuerProvider {
  readonly id: string;
  readonly status: "not_integrated" | "sandbox" | "live";
  readonly supportsApplePay: boolean;
}

export const cardIssuer: CardIssuerProvider = {
  id: "none",
  status: "not_integrated",
  supportsApplePay: false,
};

export function joinCardWaitlist(input: { email: string; userId?: string; region?: string }) {
  const email = normalizeEmail(input.email);
  const hash = lookupHash(email);
  if (one(`SELECT 1 FROM waitlist WHERE email_hash = ?`, hash)) return { alreadyJoined: true };
  run(
    `INSERT INTO waitlist (id, email_hash, email_ciphertext, user_id, region, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    randomId("wtl"),
    hash,
    encrypt(email),
    input.userId ?? null,
    input.region?.slice(0, 8) ?? null,
    Date.now(),
  );
  return { alreadyJoined: false };
}
