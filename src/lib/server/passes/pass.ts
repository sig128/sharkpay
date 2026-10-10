import fs from "node:fs";
import path from "node:path";
import http2 from "node:http2";
import { brand } from "@/config/brand";
import { all, one, run } from "../db";
import { hmac, randomToken, safeEqual, sha256 } from "../crypto";
import { env, integrations, sessionSecret } from "../env";
import { AppError } from "../errors";
import { userBalances } from "../ledger/ledger";
import { fmtSol } from "@/lib/format";
import { listWallets } from "../wallet/verify";
import { getUser } from "../auth/accounts";

/**
 * Apple Wallet store-card pass. It displays membership info and balances only.
 * The barcode carries an opaque membership reference, never a secret, and
 * cannot authorize redemption or spending. Redemption always happens in the
 * authenticated app.
 */

export function membershipId(userId: string) {
  const h = hmac(sessionSecret(), `membership:${userId}`).toUpperCase();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chars = [...h.slice(0, 12)].map((c) => alphabet[parseInt(c, 16) * 2]).join("");
  return `SC-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function maskMembershipId(id: string) {
  return `SC-••••-••••-${id.slice(-4)}`;
}

function holdingsLabel(raw: bigint) {
  const d = env().TOKEN_DECIMALS;
  const n = Number(raw / 10n ** BigInt(d)) + Number(raw % 10n ** BigInt(d)) / 10 ** d;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function lastBalanceChange(realm: string, userId: string) {
  return (
    one<{ t: number | null }>(
      `SELECT MAX(created_at) AS t FROM ledger_entries WHERE realm = ? AND account LIKE ?`,
      realm,
      `user:${userId}:%`,
    )?.t ?? 0
  );
}

export interface PassModel {
  serial: string;
  organizationName: string;
  description: string;
  logoText: string;
  colors: { background: string; foreground: string; label: string };
  header: { label: string; value: string };
  primary: { label: string; value: string };
  secondary: Array<{ label: string; value: string }>;
  auxiliary: Array<{ label: string; value: string }>;
  back: Array<{ label: string; value: string }>;
  barcode: { message: string; altText: string };
  updatedAt: number;
}

export function passModel(realm: string, userId: string): PassModel {
  const user = getUser(userId);
  if (!user) throw new AppError("not_found", "Member not found", 404);
  const b = userBalances(realm, userId);
  const wallets = listWallets(userId).map((w) => w.address);
  const holdings = wallets.length
    ? all<{ balance_raw: string }>(
        `SELECT h.balance_raw FROM holding_events h
         WHERE h.realm = ? AND h.owner IN (${wallets.map(() => "?").join(",")})
           AND h.block_time = (SELECT MAX(block_time) FROM holding_events x WHERE x.realm = h.realm AND x.token_account = h.token_account)`,
        realm,
        ...wallets,
      ).reduce((s, r) => s + BigInt(r.balance_raw), 0n)
    : 0n;
  const mid = membershipId(userId);
  const updatedAt = lastBalanceChange(realm, userId) || user.created_at;
  const platform = { pc: "PC", playstation: "PlayStation", xbox: "Xbox" }[user.reward_platform ?? ""] ?? "Not set";
  return {
    serial: `pass_${sha256(`pass:${userId}`).slice(0, 24)}`,
    organizationName: brand.name,
    description: `${brand.name} rewards membership`,
    logoText: brand.name,
    colors: { background: "rgb(18, 22, 37)", foreground: "rgb(255, 244, 234)", label: "rgb(255, 136, 107)" },
    header: { label: brand.ticker, value: holdingsLabel(holdings) },
    primary: { label: `${brand.ticker} HOLDINGS`, value: holdingsLabel(holdings) },
    secondary: [
      { label: "MEMBER", value: user.display_name },
      { label: "SOL REWARDS", value: fmtSol(b.payable + b.pending) },
    ],
    auxiliary: [
      { label: "MEMBERSHIP", value: maskMembershipId(mid) },
      { label: "PLATFORM", value: platform },
    ],
    back: [
      { label: "Redeem", value: `Open ${env().APP_URL}/app/rewards and sign in to redeem. This pass cannot be used to pay or redeem.` },
      { label: "About rewards", value: brand.legal.rewards },
      { label: "Not a payment card", value: "This pass shows membership information only. It is not an Apple Pay card and holds no money." },
      { label: "Last updated", value: new Date(updatedAt).toISOString() },
      { label: "Independence", value: brand.legal.independence },
    ],
    barcode: { message: mid, altText: maskMembershipId(mid) },
    updatedAt,
  };
}

// ---- Pass records & web service ------------------------------------------

/** Creates (or rotates) the pass record and its web-service authentication token. */
export function issuePassRecord(realm: string, userId: string) {
  const serial = passModel(realm, userId).serial;
  const token = randomToken(24);
  run(
    `INSERT INTO passes (serial, user_id, realm, auth_token_hash, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(serial) DO UPDATE SET auth_token_hash = excluded.auth_token_hash, updated_at = excluded.updated_at`,
    serial,
    userId,
    realm,
    sha256(token),
    Date.now(),
  );
  return { serial, token };
}

export function authenticatePassRequest(serial: string, authorization: string | null) {
  const token = authorization?.startsWith("ApplePass ") ? authorization.slice(10).trim() : null;
  const row = one<{ serial: string; user_id: string; realm: string; auth_token_hash: string }>(
    `SELECT * FROM passes WHERE serial = ?`,
    serial,
  );
  if (!row || !token || !safeEqual(sha256(token), row.auth_token_hash)) return null;
  return row;
}

export function registerDevice(deviceId: string, passTypeId: string, serial: string, pushToken: string) {
  const res = run(
    `INSERT OR IGNORE INTO pass_registrations (device_id, pass_type_id, serial, push_token, created_at) VALUES (?, ?, ?, ?, ?)`,
    deviceId,
    passTypeId,
    serial,
    pushToken,
    Date.now(),
  );
  if (res.changes === 0) {
    run(
      `UPDATE pass_registrations SET push_token = ? WHERE device_id = ? AND pass_type_id = ? AND serial = ?`,
      pushToken,
      deviceId,
      passTypeId,
      serial,
    );
    return "existing" as const;
  }
  return "created" as const;
}

export function unregisterDevice(deviceId: string, passTypeId: string, serial: string) {
  run(`DELETE FROM pass_registrations WHERE device_id = ? AND pass_type_id = ? AND serial = ?`, deviceId, passTypeId, serial);
}

export function updatedSerials(deviceId: string, passTypeId: string, since: number) {
  const rows = all<{ serial: string; user_id: string; realm: string }>(
    `SELECT p.serial, p.user_id, p.realm FROM pass_registrations r JOIN passes p ON p.serial = r.serial
     WHERE r.device_id = ? AND r.pass_type_id = ?`,
    deviceId,
    passTypeId,
  );
  let latest = since;
  const serials: string[] = [];
  for (const r of rows) {
    const t = lastBalanceChange(r.realm, r.user_id);
    if (t > since) {
      serials.push(r.serial);
      latest = Math.max(latest, t);
    }
  }
  return { serials, lastUpdated: String(latest) };
}

// ---- Signing ---------------------------------------------------------------

function readCredential(p: string | undefined) {
  if (!p) throw new AppError("pass_unavailable", "Apple Wallet pass signing is not configured", 503);
  return fs.readFileSync(path.resolve(p));
}

const ASSET_DIR = path.join(process.cwd(), "src/lib/server/passes/assets");

/** Builds a signed .pkpass. Fails closed without an Apple-issued certificate. */
export async function buildSignedPass(realm: string, userId: string, authToken: string): Promise<Buffer> {
  if (!integrations().applePass) {
    throw new AppError("pass_unavailable", "Apple Wallet pass signing is not configured", 503);
  }
  if (realm !== "live") throw new AppError("pass_unavailable", "Signed passes are only issued for live accounts", 403);
  const e = env();
  const { PKPass } = await import("passkit-generator");
  const model = passModel(realm, userId);
  const files: Record<string, Buffer> = {};
  for (const name of ["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png"]) {
    files[name] = fs.readFileSync(path.join(ASSET_DIR, name));
  }
  const pass = new PKPass(
    files,
    {
      wwdr: readCredential(e.APPLE_WWDR_CERT_PATH),
      signerCert: readCredential(e.APPLE_PASS_CERT_PATH),
      signerKey: readCredential(e.APPLE_PASS_KEY_PATH),
      signerKeyPassphrase: e.APPLE_PASS_KEY_PASSPHRASE,
    },
    {
      formatVersion: 1,
      passTypeIdentifier: e.APPLE_PASS_TYPE_ID!,
      teamIdentifier: e.APPLE_TEAM_ID!,
      serialNumber: model.serial,
      organizationName: model.organizationName,
      description: model.description,
      logoText: model.logoText,
      backgroundColor: model.colors.background,
      foregroundColor: model.colors.foreground,
      labelColor: model.colors.label,
      webServiceURL: `${e.APP_URL}/api/passkit`,
      authenticationToken: authToken,
      sharingProhibited: true,
    },
  );
  pass.type = "storeCard";
  pass.headerFields.push({ key: "holdings", label: model.header.label, value: model.header.value, changeMessage: `${brand.ticker} holdings: %@` });
  pass.primaryFields.push({ key: "available", label: model.primary.label, value: model.primary.value });
  model.secondary.forEach((f, i) => pass.secondaryFields.push({ key: `s${i}`, label: f.label, value: f.value }));
  model.auxiliary.forEach((f, i) => pass.auxiliaryFields.push({ key: `a${i}`, label: f.label, value: f.value }));
  model.back.forEach((f, i) => pass.backFields.push({ key: `b${i}`, label: f.label, value: f.value }));
  pass.setBarcodes({ message: model.barcode.message, format: "PKBarcodeFormatQR", messageEncoding: "iso-8859-1", altText: model.barcode.altText });
  return pass.getAsBuffer();
}

/** Best-effort APNs push so registered devices fetch the updated pass. */
export async function pushPassUpdate(userId: string) {
  if (!integrations().applePass) return;
  const e = env();
  const tokens = all<{ push_token: string }>(
    `SELECT r.push_token FROM pass_registrations r JOIN passes p ON p.serial = r.serial WHERE p.user_id = ? AND p.realm = 'live'`,
    userId,
  );
  if (tokens.length === 0) return;
  const client = http2.connect("https://api.push.apple.com", {
    cert: readCredential(e.APPLE_PASS_CERT_PATH),
    key: readCredential(e.APPLE_PASS_KEY_PATH),
    passphrase: e.APPLE_PASS_KEY_PASSPHRASE,
  });
  client.on("error", () => {});
  await Promise.all(
    tokens.map(
      (t) =>
        new Promise<void>((resolve) => {
          const req = client.request({
            ":method": "POST",
            ":path": `/3/device/${t.push_token}`,
            "apns-topic": e.APPLE_PASS_TYPE_ID!,
          });
          req.on("response", () => resolve());
          req.on("error", () => resolve());
          req.end("{}");
        }),
    ),
  );
  client.close();
}
