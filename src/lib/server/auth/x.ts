import { env } from "../env";
import { AppError } from "../errors";
import type { ProviderProfile } from "./accounts";

/**
 * X sign-in (OAuth 2.0 authorization code + PKCE, confidential client). X has
 * no OIDC ID token, so identity comes from GET /2/users/me with the fresh
 * access token. The token is revoked right after and never stored.
 */
const X_AUTHORIZE = "https://x.com/i/oauth2/authorize";
const X_TOKEN = "https://api.x.com/2/oauth2/token";
const X_REVOKE = "https://api.x.com/2/oauth2/revoke";
const X_ME = "https://api.x.com/2/users/me?user.fields=profile_image_url";
const X_SCOPES = "users.read tweet.read";

type FetchLike = typeof fetch;

function credentials() {
  const e = env();
  if (!e.X_CLIENT_ID || !e.X_CLIENT_SECRET) {
    throw new AppError("provider_unavailable", "X sign-in is not configured", 503);
  }
  return { clientId: e.X_CLIENT_ID, clientSecret: e.X_CLIENT_SECRET };
}

function basicAuth(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64")}`;
}

async function codeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}

export function xRedirectUri() {
  return `${env().APP_URL}/api/auth/x/callback`;
}

export async function xAuthorizationUrl(state: string, codeVerifier: string) {
  const { clientId } = credentials();
  const url = new URL(X_AUTHORIZE);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: xRedirectUri(),
    scope: X_SCOPES,
    state,
    code_challenge: await codeChallenge(codeVerifier),
    code_challenge_method: "S256",
  }).toString();
  return url.href;
}

export async function completeXSignIn(
  callbackUrl: URL,
  expected: { state: string; codeVerifier: string },
  fetchImpl: FetchLike = fetch,
): Promise<ProviderProfile> {
  const { clientId, clientSecret } = credentials();
  const params = callbackUrl.searchParams;
  if (params.get("state") !== expected.state) throw new AppError("invalid_state", "State mismatch");
  if (params.get("error")) throw new AppError("provider_denied", "X sign-in was cancelled");
  const code = params.get("code");
  if (!code) throw new AppError("invalid_callback", "Missing authorization code");

  const tokenRes = await fetchImpl(X_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: basicAuth(clientId, clientSecret) },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: xRedirectUri(),
      code_verifier: expected.codeVerifier,
    }),
  });
  if (!tokenRes.ok) throw new AppError("token_exchange_failed", "Could not complete X sign-in", 502);
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) throw new AppError("token_exchange_failed", "Could not complete X sign-in", 502);

  try {
    const meRes = await fetchImpl(X_ME, { headers: { authorization: `Bearer ${access_token}` } });
    if (!meRes.ok) throw new AppError("invalid_token", "X did not return your profile", 502);
    const me = (await meRes.json()) as { data?: { id?: string; name?: string; username?: string; profile_image_url?: string } };
    const id = me.data?.id;
    if (!id || !/^\d{1,20}$/.test(id)) throw new AppError("invalid_token", "X did not return a verified account ID", 502);
    const avatar = me.data?.profile_image_url;
    return {
      provider: "x",
      subject: id,
      displayName: me.data?.name?.slice(0, 64) ?? (me.data?.username ? `@${me.data.username}` : "X member"),
      avatarUrl: avatar?.startsWith("https://pbs.twimg.com/") ? avatar : null,
      claims: { username: me.data?.username ?? null },
    };
  } finally {
    await fetchImpl(X_REVOKE, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: basicAuth(clientId, clientSecret) },
      body: new URLSearchParams({ token: access_token, token_type_hint: "access_token" }),
    }).catch(() => undefined);
  }
}
