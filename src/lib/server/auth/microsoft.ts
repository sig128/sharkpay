import * as oidc from "openid-client";
import { env } from "../env";
import { AppError } from "../errors";
import type { ProviderProfile } from "./accounts";

/**
 * Personal Microsoft account sign-in (OIDC authorization code + PKCE, state, nonce).
 * The consumer tenant's metadata is used directly so the issuer check is exact.
 * This proves a Microsoft account only. It does NOT verify a gamertag or XUID.
 */
const MSA_CONSUMER_ISSUER = "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0";
const XBOX_AUTHORIZE = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const XBOX_TOKEN = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

let configPromise: Promise<oidc.Configuration> | null = null;

function credentials() {
  const e = env();
  if (!e.MICROSOFT_CLIENT_ID || !e.MICROSOFT_CLIENT_SECRET) {
    throw new AppError("provider_unavailable", "Microsoft sign-in is not configured", 503);
  }
  return { clientId: e.MICROSOFT_CLIENT_ID, clientSecret: e.MICROSOFT_CLIENT_SECRET };
}

async function microsoftConfig() {
  const { clientId, clientSecret } = credentials();
  configPromise ??= oidc.discovery(new URL(MSA_CONSUMER_ISSUER), clientId, clientSecret).catch((err) => {
    configPromise = null;
    throw err;
  });
  return configPromise;
}

export function microsoftRedirectUri() {
  return `${env().APP_URL}/api/auth/microsoft/callback`;
}

export function xboxRedirectUri() {
  return `${env().APP_URL}/api/auth/xbox/callback`;
}

export async function microsoftAuthorizationUrl(state: string, nonce: string, codeVerifier: string) {
  const config = await microsoftConfig();
  const challenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  return oidc.buildAuthorizationUrl(config, {
    redirect_uri: microsoftRedirectUri(),
    scope: "openid profile",
    response_type: "code",
    response_mode: "query",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    nonce,
    prompt: "select_account",
  }).href;
}

export async function completeMicrosoftSignIn(
  callbackUrl: URL,
  expected: { state: string; nonce: string; codeVerifier: string },
): Promise<ProviderProfile> {
  const config = await microsoftConfig();
  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: expected.codeVerifier,
    expectedState: expected.state,
    expectedNonce: expected.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims?.sub) throw new AppError("invalid_token", "Microsoft did not return a verified subject");
  return {
    provider: "microsoft",
    subject: String(claims.sub),
    displayName: typeof claims.name === "string" ? claims.name : "Microsoft member",
    claims: { issuer: claims.iss },
  };
}

// ---- Xbox services linking (separate, approved-partner flow) --------------

export async function xboxAuthorizationUrl(state: string, codeVerifier: string) {
  const { clientId } = credentials();
  const challenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const url = new URL(XBOX_AUTHORIZE);
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: xboxRedirectUri(),
    scope: "XboxLive.signin",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.href;
}

type FetchLike = typeof fetch;

/**
 * Exchanges the code for an MSA token, then an Xbox user token, then an XSTS
 * token for our relying party. Only a returned XUID counts as verification.
 */
export async function completeXboxLink(
  callbackUrl: URL,
  expected: { state: string; codeVerifier: string },
  fetchImpl: FetchLike = fetch,
): Promise<ProviderProfile> {
  const e = env();
  const { clientId, clientSecret } = credentials();
  if (!e.XBOX_LINKING_ENABLED || !e.XBOX_RELYING_PARTY) {
    throw new AppError("provider_unavailable", "Xbox account linking is not enabled", 503);
  }
  const params = callbackUrl.searchParams;
  if (params.get("state") !== expected.state) throw new AppError("invalid_state", "State mismatch");
  if (params.get("error")) throw new AppError("provider_denied", "Xbox sign-in was cancelled");
  const code = params.get("code");
  if (!code) throw new AppError("invalid_callback", "Missing authorization code");

  const tokenRes = await fetchImpl(XBOX_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: xboxRedirectUri(),
      grant_type: "authorization_code",
      code_verifier: expected.codeVerifier,
    }),
  });
  if (!tokenRes.ok) throw new AppError("token_exchange_failed", "Could not complete Xbox sign-in", 502);
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) throw new AppError("token_exchange_failed", "Could not complete Xbox sign-in", 502);

  const userRes = await fetchImpl("https://user.auth.xboxlive.com/user/authenticate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-xbl-contract-version": "1" },
    body: JSON.stringify({
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
      Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: `d=${access_token}` },
    }),
  });
  if (!userRes.ok) throw new AppError("xbox_auth_failed", "Xbox services rejected the sign-in", 502);
  const userToken = ((await userRes.json()) as { Token?: string }).Token;
  if (!userToken) throw new AppError("xbox_auth_failed", "Xbox services rejected the sign-in", 502);

  const xstsRes = await fetchImpl("https://xsts.auth.xboxlive.com/xsts/authorize", {
    method: "POST",
    headers: { "content-type": "application/json", "x-xbl-contract-version": "1" },
    body: JSON.stringify({
      RelyingParty: e.XBOX_RELYING_PARTY,
      TokenType: "JWT",
      Properties: { SandboxId: e.XBOX_SANDBOX_ID, UserTokens: [userToken] },
    }),
  });
  if (!xstsRes.ok) throw new AppError("xbox_auth_failed", "This Microsoft account has no Xbox profile we can verify", 502);
  const xsts = (await xstsRes.json()) as { DisplayClaims?: { xui?: Array<{ xid?: string; gtg?: string }> } };
  const xui = xsts.DisplayClaims?.xui?.[0];
  if (!xui?.xid) throw new AppError("xbox_unverified", "Xbox did not return a verified XUID", 502);
  return {
    provider: "xbox",
    subject: xui.xid,
    displayName: xui.gtg ?? null,
    claims: { xuid: xui.xid, gamertag: xui.gtg ?? null, verifiedBy: "xsts" },
  };
}
