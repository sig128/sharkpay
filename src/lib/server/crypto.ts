import crypto from "node:crypto";
import { env, sessionSecret } from "./env";

export function randomId(prefix: string, bytes = 12) {
  return `${prefix}_${crypto.randomBytes(bytes).toString("base64url")}`;
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(input: string | Buffer) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hmac(secret: string, input: string | Buffer) {
  return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

/** Keyed hash for lookups of sensitive values (emails, tokens) without storing them in clear. */
export function lookupHash(value: string) {
  return hmac(sessionSecret(), value.trim().toLowerCase());
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function dataKey(): Buffer {
  const configured = env().DATA_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    return key;
  }
  return crypto.createHash("sha256").update(`dev-data-key:${sessionSecret()}`).digest();
}

/** AES-256-GCM for data at rest (redemption codes, waitlist emails). */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dataKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, ct] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", dataKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
