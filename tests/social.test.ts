import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/lib/server/db";
import { completeXSignIn, xAuthorizationUrl, xRedirectUri } from "@/lib/server/auth/x";
import { createFlow, consumeFlow } from "@/lib/server/auth/flows";
import { createSession, type Session } from "@/lib/server/auth/sessions";
import { linkIdentity, signInWithIdentity } from "@/lib/server/auth/accounts";
import { AppError } from "@/lib/server/errors";

beforeEach(() => resetDbForTests());

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e) => e instanceof AppError && e.code === code);
}

function callback(params: Record<string, string>) {
  const url = new URL(xRedirectUri());
  url.search = new URLSearchParams(params).toString();
  return url;
}

function fakeX(me: unknown, opts: { tokenOk?: boolean } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/oauth2/token")) {
      return opts.tokenOk === false
        ? new Response("{}", { status: 400 })
        : Response.json({ access_token: "at_123", token_type: "bearer" });
    }
    if (url.includes("/users/me")) return Response.json(me);
    if (url.endsWith("/oauth2/revoke")) return Response.json({ revoked: true });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

describe("X sign-in", () => {
  it("builds a PKCE authorization URL with read-only scopes", async () => {
    const url = new URL(await xAuthorizationUrl("st", "verifier-verifier-verifier-verifier-verifier"));
    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("users.read tweet.read");
    expect(url.searchParams.get("redirect_uri")).toBe(xRedirectUri());
  });

  it("returns the verified X account ID and revokes the token", async () => {
    const x = fakeX({ data: { id: "1234567890", name: "Tommy V", username: "tommyv", profile_image_url: "https://pbs.twimg.com/a.jpg" } });
    const p = await completeXSignIn(callback({ state: "s1", code: "c1" }), { state: "s1", codeVerifier: "v" }, x.impl);
    expect(p).toMatchObject({ provider: "x", subject: "1234567890", displayName: "Tommy V", avatarUrl: "https://pbs.twimg.com/a.jpg" });
    const token = x.calls.find((c) => c.url.endsWith("/oauth2/token"))!;
    expect(String(token.init?.body)).toContain("code_verifier=v");
    expect(new Headers(token.init?.headers).get("authorization")).toMatch(/^Basic /);
    expect(x.calls.some((c) => c.url.endsWith("/oauth2/revoke"))).toBe(true);
  });

  it("rejects state mismatch, denial, failed exchange and missing IDs", async () => {
    const ok = fakeX({ data: { id: "1" } });
    await expectCode(completeXSignIn(callback({ state: "a", code: "c" }), { state: "b", codeVerifier: "v" }, ok.impl), "invalid_state");
    await expectCode(completeXSignIn(callback({ state: "a", error: "access_denied" }), { state: "a", codeVerifier: "v" }, ok.impl), "provider_denied");
    await expectCode(completeXSignIn(callback({ state: "a" }), { state: "a", codeVerifier: "v" }, ok.impl), "invalid_callback");
    await expectCode(completeXSignIn(callback({ state: "a", code: "c" }), { state: "a", codeVerifier: "v" }, fakeX({}, { tokenOk: false }).impl), "token_exchange_failed");
    const noId = fakeX({ data: { name: "No ID" } });
    await expectCode(completeXSignIn(callback({ state: "a", code: "c" }), { state: "a", codeVerifier: "v" }, noId.impl), "invalid_token");
    expect(noId.calls.some((c) => c.url.endsWith("/oauth2/revoke"))).toBe(true);
  });

  it("ignores avatar URLs from unexpected hosts", async () => {
    const x = fakeX({ data: { id: "42", name: "N", profile_image_url: "https://evil.example/a.jpg" } });
    const p = await completeXSignIn(callback({ state: "s", code: "c" }), { state: "s", codeVerifier: "v" }, x.impl);
    expect(p.avatarUrl).toBeNull();
  });

  it("binds X and Google flows to their provider", () => {
    const flow = createFlow({ provider: "x", purpose: "login", codeVerifier: "v", nonce: null, userId: null, sessionHash: null, returnTo: null });
    expect(() => consumeFlow(flow.state, "google", flow.state)).toThrow(/Unknown/);
    const g = createFlow({ provider: "google", purpose: "login", codeVerifier: "v", nonce: "n", userId: null, sessionHash: null, returnTo: null });
    expect(consumeFlow(g.state, "google", g.state).nonce).toBe("n");
  });
});

describe("Google and X accounts", () => {
  function session(userId: string): Session {
    return createSession({ userId, realm: "live", kind: "real", authProvider: "email" }).session;
  }

  it("sign in as their own accounts and never merge by display name", () => {
    const g = signInWithIdentity("live", { provider: "google", subject: "g-1", displayName: "Tommy" });
    const x = signInWithIdentity("live", { provider: "x", subject: "1", displayName: "Tommy" });
    expect(g.userId).not.toBe(x.userId);
    expect(signInWithIdentity("live", { provider: "google", subject: "g-1" }).userId).toBe(g.userId);
  });

  it("cannot be linked to a second member", () => {
    const a = signInWithIdentity("live", { provider: "email", subject: "hash-a" });
    const b = signInWithIdentity("live", { provider: "email", subject: "hash-b" });
    linkIdentity(session(a.userId), { provider: "x", subject: "99" });
    expect(() => linkIdentity(session(b.userId), { provider: "x", subject: "99" })).toThrow(/different member/);
    linkIdentity(session(a.userId), { provider: "google", subject: "g-99" });
    expect(() => linkIdentity(session(b.userId), { provider: "google", subject: "g-99" })).toThrow(/different member/);
  });
});
