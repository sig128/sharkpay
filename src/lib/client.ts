"use client";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function callApi<T = unknown>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(err?.code ?? "error", err?.message ?? "Something went wrong", res.status);
  }
  return data as T;
}

export function newIdempotencyKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return `idk_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export const AUTH_ERRORS: Record<string, string> = {
  invalid_state: "That sign-in link isn't valid for this browser. Please start again.",
  state_reused: "That sign-in response was already used. Please start again.",
  state_expired: "The sign-in attempt timed out. Please start again.",
  invalid_callback: "We couldn't verify the response from the sign-in provider.",
  invalid_signature: "The sign-in provider couldn't confirm that sign-in.",
  replayed_callback: "That sign-in response was already used.",
  provider_denied: "Sign-in was cancelled.",
  provider_unavailable: "That sign-in option isn't configured on this server.",
  identity_in_use: "That account is already connected to a different member.",
  provider_already_linked: "Unlink your current account for that provider first.",
  reauth_required: "For your security, sign in again to continue.",
  reauth_wrong_account: "Use an account that's already connected to this membership.",
  session_mismatch: "Your session changed during sign-in. Please try again.",
  xbox_unverified: "Xbox didn't return a verified profile for that account.",
  xbox_auth_failed: "Xbox services couldn't verify that account.",
  token_exchange_failed: "We couldn't complete sign-in with Microsoft.",
  invalid_token: "Microsoft returned an invalid sign-in token.",
  rate_limited: "Too many attempts. Please wait a moment.",
  unauthorized: "Please sign in first.",
  signin_failed: "Sign-in failed. Please try again.",
};
