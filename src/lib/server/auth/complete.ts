import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { one } from "../db";
import { env } from "../env";
import { AppError } from "../errors";
import { cookieOptions, currentSession, redirectWithError, setSessionCookie } from "../http";
import { FLOW_COOKIE, type AuthFlow } from "./flows";
import { createSession, markReauthenticated, type Session } from "./sessions";
import { getUser, linkIdentity, signInWithIdentity, type ProviderProfile } from "./accounts";

/**
 * Applies a verified provider identity according to the flow's purpose.
 * - login:  resolve or create the internal account and start a session
 * - link:   attach to the signed-in account (collision-checked)
 * - reauth: refresh the session's auth time if the identity belongs to it
 */
export async function completeAuth(flow: AuthFlow, profile: ProviderProfile) {
  if (flow.purpose === "login") {
    const { userId } = signInWithIdentity("live", profile);
    const { token, session } = createSession({ userId, realm: "live", kind: "real", authProvider: profile.provider });
    const user = getUser(userId)!;
    const dest = user.onboarded_at ? (flow.returnTo ?? "/app") : "/onboarding";
    const res = NextResponse.redirect(new URL(dest, env().APP_URL), 303);
    setSessionCookie(res, token, session.expiresAt);
    return res;
  }

  const session = await currentSession();
  if (!session || session.idHash !== flow.sessionHash || session.userId !== flow.userId) {
    throw new AppError("session_mismatch", "Your session changed during sign-in. Please try again.", 403);
  }

  if (flow.purpose === "reauth") {
    assertOwnsIdentity(session, profile);
    markReauthenticated(session.idHash, profile.provider);
    return NextResponse.redirect(new URL(flow.returnTo ?? "/app/accounts", env().APP_URL), 303);
  }

  // Linking itself proves control of the new identity; the session must also be recent.
  linkIdentity(session, profile);
  const url = new URL(flow.returnTo ?? "/app/accounts", env().APP_URL);
  url.searchParams.set("linked", profile.provider);
  return NextResponse.redirect(url, 303);
}

function assertOwnsIdentity(session: Session, profile: ProviderProfile) {
  const owner = one<{ user_id: string }>(
    `SELECT user_id FROM identities WHERE realm = ? AND provider = ? AND subject = ?`,
    session.realm,
    profile.provider,
    profile.subject,
  );
  if (!owner || owner.user_id !== session.userId) {
    throw new AppError("reauth_wrong_account", "Sign in with an account that's already connected to this membership.", 403);
  }
}

export async function setFlowCookie(res: NextResponse, state: string) {
  res.cookies.set(FLOW_COOKIE, state, { ...cookieOptions(600), path: "/api/auth" });
  return res;
}

export async function readFlowCookie() {
  return (await cookies()).get(FLOW_COOKIE)?.value ?? null;
}

export function clearFlowCookie(res: Response) {
  if (res instanceof NextResponse) res.cookies.set(FLOW_COOKIE, "", { ...cookieOptions(0), path: "/api/auth" });
  return res;
}

export function authErrorRedirect(err: unknown, flow?: AuthFlow | null) {
  const code = err instanceof AppError ? err.code : "signin_failed";
  if (!(err instanceof AppError)) console.error("Sign-in failed:", err instanceof Error ? err.name : "unknown");
  const dest = flow && flow.purpose !== "login" ? (flow.returnTo ?? "/app/accounts") : "/login";
  return clearFlowCookie(redirectWithError(dest, code));
}

/** Start-of-flow guard shared by providers. */
export async function flowContext(purpose: string | null) {
  const p = purpose === "link" || purpose === "reauth" ? purpose : "login";
  if (p === "login") return { purpose: p as AuthFlow["purpose"], session: null };
  const session = await currentSession();
  if (!session || session.kind !== "real") throw new AppError("unauthorized", "Sign in first", 401);
  return { purpose: p as AuthFlow["purpose"], session };
}
