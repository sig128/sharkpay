import * as oidc from "openid-client";
import { env } from "../env";
import { AppError } from "../errors";
import type { ProviderProfile } from "./accounts";

/**
 * Google sign-in (OIDC authorization code + PKCE, state, nonce). Only the
 * "openid profile" scopes are requested: no email, no Google API access.
 */
const GOOGLE_ISSUER = "https://accounts.google.com";

let configPromise: Promise<oidc.Configuration> | null = null;

function credentials() {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) {
    throw new AppError("provider_unavailable", "Google sign-in is not configured", 503);
  }
  return { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET };
}

async function googleConfig() {
  const { clientId, clientSecret } = credentials();
  configPromise ??= oidc.discovery(new URL(GOOGLE_ISSUER), clientId, clientSecret).catch((err) => {
    configPromise = null;
    throw err;
  });
  return configPromise;
}

export function googleRedirectUri() {
  return `${env().APP_URL}/api/auth/google/callback`;
}

export async function googleAuthorizationUrl(state: string, nonce: string, codeVerifier: string) {
  const config = await googleConfig();
  return oidc.buildAuthorizationUrl(config, {
    redirect_uri: googleRedirectUri(),
    scope: "openid profile",
    response_type: "code",
    code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state,
    nonce,
    prompt: "select_account",
  }).href;
}

export async function completeGoogleSignIn(
  callbackUrl: URL,
  expected: { state: string; nonce: string; codeVerifier: string },
): Promise<ProviderProfile> {
  const config = await googleConfig();
  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: expected.codeVerifier,
    expectedState: expected.state,
    expectedNonce: expected.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims?.sub) throw new AppError("invalid_token", "Google did not return a verified subject");
  return {
    provider: "google",
    subject: String(claims.sub),
    displayName: typeof claims.name === "string" ? claims.name : "Google member",
    avatarUrl: typeof claims.picture === "string" && claims.picture.startsWith("https://") ? claims.picture : null,
    claims: { issuer: claims.iss },
  };
}
