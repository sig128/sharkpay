import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, unauthorized } from "./errors";
import { env } from "./env";
import { one, run } from "./db";
import { resolveSession, SESSION_COOKIE, type Session } from "./auth/sessions";

export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<Session> {
  const s = await currentSession();
  if (!s) throw unauthorized();
  return s;
}

const secureCookies = () => env().APP_URL.startsWith("https://");

export function cookieOptions(maxAgeS: number) {
  return { httpOnly: true, secure: secureCookies(), sameSite: "lax" as const, path: "/", maxAge: maxAgeS };
}

export function setSessionCookie(res: NextResponse, token: string, expiresAt: number) {
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(Math.floor((expiresAt - Date.now()) / 1000)));
}

/**
 * CSRF defence for state-changing requests: the Origin (or Sec-Fetch-Site)
 * must be this site. Session cookies are SameSite=Lax as a second layer.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    let o: URL;
    try {
      o = new URL(origin);
    } catch {
      throw new AppError("bad_origin", "Cross-site request blocked", 403);
    }
    if (o.host === host || o.origin === new URL(env().APP_URL).origin) return;
    throw new AppError("bad_origin", "Cross-site request blocked", 403);
  }
  if (site && site !== "same-origin" && site !== "none") throw new AppError("bad_origin", "Cross-site request blocked", 403);
}

/** Keys can contain IP addresses; the privacy policy promises deletion within 24 hours. Must exceed the longest window. */
const RATE_LIMIT_RETENTION_MS = 24 * 3600 * 1000;

/** Fixed-window limiter persisted in the database (works across restarts). */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const row = one<{ count: number; window_start: number }>(`SELECT count, window_start FROM rate_limits WHERE key = ?`, key);
  if (!row || now - row.window_start >= windowMs) {
    run(`DELETE FROM rate_limits WHERE window_start < ?`, now - RATE_LIMIT_RETENTION_MS);
    run(
      `INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start`,
      key,
      now,
    );
    return;
  }
  if (row.count >= limit) throw new AppError("rate_limited", "Too many attempts. Please wait a moment.", 429);
  run(`UPDATE rate_limits SET count = count + 1 WHERE key = ?`, key);
}

export async function clientKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, ...err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: { code: "invalid_request", message: "Some fields are missing or invalid" } }, { status: 400 });
  }
  console.error("Unhandled API error:", err instanceof Error ? err.name + ": " + err.message : "unknown");
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: same-origin check on mutations, uniform error JSON. */
export function api<C = unknown>(handler: Handler<C>, opts: { csrf?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      if (opts.csrf !== false && req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function redirectWithError(path: string, code: string) {
  const url = new URL(path, env().APP_URL);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url, 303);
}
