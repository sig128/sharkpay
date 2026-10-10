import { env } from "../env";
import { AppError } from "../errors";
import { one, run } from "../db";
import type { ProviderProfile } from "./accounts";

/**
 * Steam website sign-in via OpenID 2.0 (not OAuth). The positive assertion is
 * verified server-side with `check_authentication` against Steam's OP endpoint.
 * A Steam ID proves a Steam account only: not GTA ownership, not a Rockstar balance.
 */
export const STEAM_OP_ENDPOINT = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const NONCE_MAX_AGE_MS = 5 * 60 * 1000;

export function steamReturnTo(state: string) {
  return `${env().APP_URL}/api/auth/steam/callback?state=${encodeURIComponent(state)}`;
}

export function steamAuthorizationUrl(state: string) {
  const url = new URL(STEAM_OP_ENDPOINT);
  url.search = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": steamReturnTo(state),
    "openid.realm": env().APP_URL,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  }).toString();
  return url.href;
}

type FetchLike = typeof fetch;

export async function verifySteamAssertion(
  params: URLSearchParams,
  expectedState: string,
  fetchImpl: FetchLike = fetch,
  now = Date.now(),
): Promise<ProviderProfile> {
  const get = (k: string) => params.get(`openid.${k}`);
  if (get("ns") !== OPENID_NS) throw new AppError("invalid_callback", "Unexpected OpenID namespace");
  if (get("mode") !== "id_res") throw new AppError("provider_denied", "Steam sign-in was cancelled");
  if (get("op_endpoint") !== STEAM_OP_ENDPOINT) throw new AppError("invalid_callback", "Unexpected OpenID provider");
  if (get("return_to") !== steamReturnTo(expectedState)) {
    throw new AppError("invalid_callback", "OpenID return URL does not match this sign-in");
  }
  const claimed = get("claimed_id") ?? "";
  const match = CLAIMED_ID.exec(claimed);
  if (!match || get("identity") !== claimed) throw new AppError("invalid_callback", "Invalid Steam identity");

  const signed = (get("signed") ?? "").split(",");
  for (const field of ["op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"]) {
    if (!signed.includes(field)) throw new AppError("invalid_callback", `Unsigned OpenID field: ${field}`);
  }

  const nonce = get("response_nonce") ?? "";
  const issued = Date.parse(nonce.slice(0, 20));
  if (!Number.isFinite(issued) || Math.abs(now - issued) > NONCE_MAX_AGE_MS) {
    throw new AppError("invalid_callback", "Steam response is too old");
  }
  if (one(`SELECT 1 FROM openid_nonces WHERE nonce = ?`, nonce)) {
    throw new AppError("replayed_callback", "This Steam response was already used");
  }

  const verify = new URLSearchParams();
  for (const [key, value] of params) if (key.startsWith("openid.")) verify.set(key, value);
  verify.set("openid.mode", "check_authentication");
  const res = await fetchImpl(STEAM_OP_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: verify,
  });
  const text = res.ok ? await res.text() : "";
  if (!/^is_valid\s*:\s*true\s*$/m.test(text)) {
    throw new AppError("invalid_signature", "Steam could not verify this sign-in");
  }
  run(`INSERT INTO openid_nonces (nonce, created_at) VALUES (?, ?)`, nonce, now);
  run(`DELETE FROM openid_nonces WHERE created_at < ?`, now - 24 * 3600 * 1000);

  const steamId = match[1];
  const profile = await steamProfile(steamId, fetchImpl);
  return {
    provider: "steam",
    subject: steamId,
    displayName: profile?.name ?? `Steam member ••${steamId.slice(-4)}`,
    avatarUrl: profile?.avatar ?? null,
    claims: { steamId, verifiedBy: "openid2" },
  };
}

async function steamProfile(steamId: string, fetchImpl: FetchLike) {
  const key = env().STEAM_WEB_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${steamId}`;
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      response?: { players?: Array<{ personaname?: string; avatarfull?: string }> };
    };
    const p = body.response?.players?.[0];
    return p ? { name: p.personaname ?? null, avatar: p.avatarfull ?? null } : null;
  } catch {
    return null;
  }
}
