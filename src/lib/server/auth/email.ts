import crypto from "node:crypto";
import { one, run, tx } from "../db";
import { lookupHash, randomId } from "../crypto";
import { env, integrations } from "../env";
import { AppError } from "../errors";
import type { ProviderProfile } from "./accounts";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

export function normalizeEmail(raw: string) {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    throw new AppError("invalid_email", "Enter a valid email address");
  }
  return email;
}

/** Sends a one-time sign-in code. Returns the dev-outbox code only in local demo mode. */
export async function requestEmailCode(rawEmail: string, now = Date.now()) {
  if (!integrations().email) throw new AppError("provider_unavailable", "Email sign-in is not configured", 503);
  const email = normalizeEmail(rawEmail);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const emailHash = lookupHash(email);
  run(`UPDATE email_codes SET consumed_at = ? WHERE email_hash = ? AND consumed_at IS NULL`, now, emailHash);
  run(
    `INSERT INTO email_codes (id, email_hash, code_hash, purpose, created_at, expires_at) VALUES (?, ?, ?, 'login', ?, ?)`,
    randomId("eml"),
    emailHash,
    lookupHash(`${emailHash}:${code}`),
    now,
    now + CODE_TTL_MS,
  );
  const subject = "Your sign-in code";
  const body = `Your one-time code is ${code}. It expires in 10 minutes. If you didn't request it, ignore this email.`;
  const e = env();
  if (e.RESEND_API_KEY && e.EMAIL_FROM) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: e.EMAIL_FROM, to: [email], subject, text: body }),
    });
    if (!res.ok) throw new AppError("email_failed", "We couldn't send the email. Try again shortly.", 502);
    return { devCode: null };
  }
  run(
    `INSERT INTO dev_outbox (id, to_hash, subject, body, created_at) VALUES (?, ?, ?, ?, ?)`,
    randomId("out"),
    emailHash,
    subject,
    body,
    now,
  );
  return { devCode: code };
}

export function verifyEmailCode(rawEmail: string, code: string, now = Date.now()): ProviderProfile {
  const email = normalizeEmail(rawEmail);
  const emailHash = lookupHash(email);
  return tx(() => {
    const row = one<{ id: string; code_hash: string; attempts: number; expires_at: number }>(
      `SELECT * FROM email_codes WHERE email_hash = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      emailHash,
    );
    if (!row || row.expires_at <= now) throw new AppError("code_expired", "That code expired. Request a new one.");
    if (row.attempts >= MAX_ATTEMPTS) throw new AppError("too_many_attempts", "Too many attempts. Request a new code.");
    if (row.code_hash !== lookupHash(`${emailHash}:${code.trim()}`)) {
      run(`UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?`, row.id);
      throw new AppError("invalid_code", "That code is not correct");
    }
    run(`UPDATE email_codes SET consumed_at = ? WHERE id = ?`, now, row.id);
    return {
      provider: "email",
      subject: emailHash,
      displayName: maskEmail(email),
      claims: { emailVerified: true },
    };
  });
}
