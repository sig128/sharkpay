import { beforeEach, describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { resetDbForTests, run, one } from "@/lib/server/db";
import { createDemoRealm, DEMO_FIXTURE } from "@/lib/server/simulation/demo";
import { createSession, type Session } from "@/lib/server/auth/sessions";
import { findTierItem } from "@/lib/server/catalog/catalog";
import { applyProviderResult, confirmRedemption, createQuote, getOrder, reconcileOrder, revealCode } from "@/lib/server/orders/orders";
import { ledgerTotals, userBalances, post, acct } from "@/lib/server/ledger/ledger";
import { overview } from "@/lib/server/services/dashboard";
import { createFlow, consumeFlow } from "@/lib/server/auth/flows";
import { verifySteamAssertion, steamReturnTo, STEAM_OP_ENDPOINT } from "@/lib/server/auth/steam";
import { linkIdentity, signInWithIdentity, unlinkIdentity } from "@/lib/server/auth/accounts";
import { createWalletChallenge, verifyWalletChallenge } from "@/lib/server/wallet/verify";
import { handleFulfillmentWebhook } from "@/lib/server/fulfillment/webhooks";
import { hmac } from "@/lib/server/crypto";
import { AppError } from "@/lib/server/errors";

const key = () => `idk_${Math.random().toString(36).slice(2)}${Date.now()}`;

async function demoSession(): Promise<{ session: Session; realm: string }> {
  const { realm, userId } = await createDemoRealm();
  const { session } = createSession({ userId, realm, kind: "demo", authProvider: "demo" });
  return { session, realm };
}

function liveSession(subject: string, provider: "steam" | "microsoft" | "email" = "steam") {
  const { userId } = signInWithIdentity("live", { provider, subject, displayName: subject });
  return createSession({ userId, realm: "live", kind: "real", authProvider: provider }).session;
}

async function expectCode(p: Promise<unknown> | (() => unknown), code: string) {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

beforeEach(() => {
  resetDbForTests();
});

describe("demo fixture", () => {
  it("is produced by the real engine with the documented balances", async () => {
    const { session, realm } = await demoSession();
    const o = overview(session);
    expect(o.balances.available).toBe(DEMO_FIXTURE.available);
    expect(o.balances.pending).toBe(DEMO_FIXTURE.pending);
    expect(o.selectedReward?.creditCost).toBe(DEMO_FIXTURE.selectedCost);
    expect(o.latestPeriod?.myAllocation).toBe(360);
    const totals = ledgerTotals(realm);
    expect(totals.backed).toBe(true);
    expect(totals.pool).toBeGreaterThanOrEqual(0);
  });
});

describe("redemption", () => {
  it("completes a redemption end to end and returns an unmistakably invalid demo code", async () => {
    const { session, realm } = await demoSession();
    const item = findTierItem(realm, "red", "playstation", "US")!;
    const q = createQuote(session, item.id);
    expect(q.sufficient).toBe(true);
    const { order } = await confirmRedemption(session, { quoteId: q.quoteId, idempotencyKey: key() });
    expect(order.status).toBe("completed");
    expect(revealCode(session, order.id)).toMatch(/^DEMO-NOT-REDEEMABLE-/);
    expect(userBalances(realm, session.userId).available).toBe(DEMO_FIXTURE.available - item.credit_cost);
  });

  it("rejects insufficient balance without reserving anything", async () => {
    const { session, realm } = await demoSession();
    const item = findTierItem(realm, "bull", "playstation", "US")!;
    const q = createQuote(session, item.id);
    expect(q.sufficient).toBe(false);
    await expectCode(confirmRedemption(session, { quoteId: q.quoteId, idempotencyKey: key() }), "insufficient_funds");
    expect(userBalances(realm, session.userId).available).toBe(DEMO_FIXTURE.available);
    expect(one(`SELECT 1 FROM orders WHERE quote_id = ?`, q.quoteId)).toBeUndefined();
  });

  it("protects against duplicate submission (same key, and same quote with a new key)", async () => {
    const { session, realm } = await demoSession();
    const item = findTierItem(realm, "red", "pc", "US")!;
    const q = createQuote(session, item.id);
    const k = key();
    const [a, b] = await Promise.all([
      confirmRedemption(session, { quoteId: q.quoteId, idempotencyKey: k }),
      confirmRedemption(session, { quoteId: q.quoteId, idempotencyKey: k }),
    ]);
    expect(a.order.id).toBe(b.order.id);
    const c = await confirmRedemption(session, { quoteId: q.quoteId, idempotencyKey: key() });
    expect(c.order.id).toBe(a.order.id);
    expect(c.duplicate).toBe(true);
    expect(userBalances(realm, session.userId).available).toBe(DEMO_FIXTURE.available - item.credit_cost);
  });

  it("returns reserved credits when fulfilment definitively fails", async () => {
    const { session, realm } = await demoSession();
    const item = findTierItem(realm, "red", "xbox", "UK")!;
    const stock = item.stock!;
    const q = createQuote(session, item.id);
    const { order } = await confirmRedemption(session, { quoteId: q.quoteId, idempotencyKey: key(), demoScenario: "fail" });
    expect(order.status).toBe("reversed");
    expect(userBalances(realm, session.userId)).toMatchObject({ available: DEMO_FIXTURE.available, reserved: 0 });
    expect(findTierItem(realm, "red", "xbox", "UK")!.stock).toBe(stock);
  });

  it("keeps credits reserved on an uncertain outcome until the provider is reconciled", async () => {
    const { session, realm } = await demoSession();
    const item = findTierItem(realm, "red", "pc", "EU")!;
    const q = createQuote(session, item.id);
    const { order } = await confirmRedemption(session, { quoteId: q.quoteId, idempotencyKey: key(), demoScenario: "uncertain" });
    expect(order.status).toBe("needs_reconciliation");
    expect(userBalances(realm, session.userId).reserved).toBe(item.credit_cost);
    const after = await reconcileOrder(session, order.id);
    expect(after.status).toBe("reversed");
    expect(userBalances(realm, session.userId).reserved).toBe(0);
  });

  it("ignores duplicated provider outcomes (no double refund or capture)", async () => {
    const { session, realm } = await demoSession();
    const item = findTierItem(realm, "red", "pc", "UK")!;
    const q = createQuote(session, item.id);
    const { order } = await confirmRedemption(session, { quoteId: q.quoteId, idempotencyKey: key(), demoScenario: "fail" });
    applyProviderResult(order.id, { status: "failed", reason: "again" });
    applyProviderResult(order.id, { status: "delivered", providerRef: "x", code: "LATE" });
    expect(userBalances(realm, session.userId).available).toBe(DEMO_FIXTURE.available);
    expect(getOrder(session, order.id).status).toBe("reversed");
  });

  it("rejects expired quotes and out-of-stock items", async () => {
    const { session, realm } = await demoSession();
    const item = findTierItem(realm, "red", "pc", "US")!;
    const t = Date.now();
    const q = createQuote(session, item.id, t);
    await expectCode(confirmRedemption(session, { quoteId: q.quoteId, idempotencyKey: key() }, t + 91_000), "quote_expired");
    const oos = findTierItem(realm, "megalodon", "xbox", "US")!;
    await expectCode(() => createQuote(session, oos.id), "out_of_stock");
  });

  it("does not let one member read another member's order", async () => {
    const a = await demoSession();
    const item = findTierItem(a.realm, "red", "pc", "US")!;
    const q = createQuote(a.session, item.id);
    const { order } = await confirmRedemption(a.session, { quoteId: q.quoteId, idempotencyKey: key() });
    const b = await demoSession();
    await expectCode(() => getOrder(b.session, order.id), "not_found");
    await expectCode(() => revealCode(b.session, order.id), "not_found");
    const sameRealmOther = createSession({
      userId: signInWithIdentity(a.realm, { provider: "demo", subject: "intruder" }).userId,
      realm: a.realm,
      kind: "demo",
      authProvider: "demo",
    }).session;
    await expectCode(() => getOrder(sameRealmOther, order.id), "not_found");
  });

  it("fails closed for live redemption when no provider is connected", () => {
    const s = liveSession("76561198000000001");
    expect(() => createQuote(s, "itm_anything")).toThrowError(/not available/);
  });
});

describe("ledger", () => {
  it("is append-only for live data", () => {
    post("live", {
      kind: "funding",
      idempotencyKey: "f1",
      entries: [
        { account: acct.settlement, amount: -10 },
        { account: acct.pool, amount: 10 },
      ],
    });
    expect(() => run(`UPDATE ledger_entries SET amount = 999`)).toThrow(/append-only/);
    expect(() => run(`DELETE FROM ledger_entries`)).toThrow(/append-only/);
  });

  it("refuses unbalanced or overdrawing transactions", () => {
    expect(() => post("live", { kind: "funding", idempotencyKey: "u", entries: [{ account: acct.pool, amount: 5 }, { account: acct.settlement, amount: -4 }] })).toThrow(/balance/);
    expect(() => post("live", { kind: "allocation", idempotencyKey: "o", entries: [{ account: acct.pool, amount: -5 }, { account: acct.pending("u1"), amount: 5 }] })).toThrow(/Insufficient/);
  });
});

describe("sign-in callbacks", () => {
  it("rejects a callback whose state does not match this browser, is reused or expired", () => {
    const flow = createFlow({ provider: "microsoft", purpose: "login", codeVerifier: "v", nonce: "n", userId: null, sessionHash: null, returnTo: null });
    expect(() => consumeFlow(flow.state, "microsoft", "other-browser")).toThrow(/not valid/);
    expect(() => consumeFlow(flow.state, "steam", flow.state)).toThrow(/Unknown/);
    consumeFlow(flow.state, "microsoft", flow.state);
    expect(() => consumeFlow(flow.state, "microsoft", flow.state)).toThrow(/already used/);
    const old = createFlow({ provider: "steam", purpose: "login", codeVerifier: null, nonce: null, userId: null, sessionHash: null, returnTo: null, now: Date.now() - 3_600_000 });
    expect(() => consumeFlow(old.state, "steam", old.state)).toThrow(/expired/);
  });

  function steamParams(state: string, overrides: Record<string, string> = {}) {
    const claimed = "https://steamcommunity.com/openid/id/76561198000000042";
    return new URLSearchParams({
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "id_res",
      "openid.op_endpoint": STEAM_OP_ENDPOINT,
      "openid.claimed_id": claimed,
      "openid.identity": claimed,
      "openid.return_to": steamReturnTo(state),
      "openid.response_nonce": `${new Date().toISOString().slice(0, 19)}Zabc${Math.random()}`,
      "openid.assoc_handle": "1234567890",
      "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
      "openid.sig": "sig",
      ...overrides,
    });
  }
  const valid = (async () => new Response("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n")) as unknown as typeof fetch;
  const invalid = (async () => new Response("ns:http://specs.openid.net/auth/2.0\nis_valid:false\n")) as unknown as typeof fetch;

  it("verifies Steam OpenID assertions server-side", async () => {
    const p = await verifySteamAssertion(steamParams("s1"), "s1", valid);
    expect(p.subject).toBe("76561198000000042");
  });

  it("rejects Steam assertions Steam won't confirm, replays and tampering", async () => {
    await expectCode(verifySteamAssertion(steamParams("s2"), "s2", invalid), "invalid_signature");
    const params = steamParams("s3");
    await verifySteamAssertion(params, "s3", valid);
    await expectCode(verifySteamAssertion(params, "s3", valid), "replayed_callback");
    await expectCode(verifySteamAssertion(steamParams("s4"), "different-state", valid), "invalid_callback");
    await expectCode(verifySteamAssertion(steamParams("s5", { "openid.op_endpoint": "https://evil.example/openid/login" }), "s5", valid), "invalid_callback");
    await expectCode(verifySteamAssertion(steamParams("s6", { "openid.signed": "signed,op_endpoint" }), "s6", valid), "invalid_callback");
  });
});

describe("account linking", () => {
  it("prevents a provider identity from being linked to two members", () => {
    const a = liveSession("ms-a", "microsoft");
    const b = liveSession("ms-b", "microsoft");
    linkIdentity(a, { provider: "steam", subject: "76561198000000099" });
    expect(() => linkIdentity(b, { provider: "steam", subject: "76561198000000099" })).toThrow(/different member/);
    expect(() => linkIdentity(a, { provider: "steam", subject: "76561198000000100" })).toThrow(/Unlink/);
  });

  it("requires a recent sign-in to link or unlink, and keeps one sign-in method", () => {
    const s = liveSession("ms-c", "microsoft");
    const stale = { ...s, authAt: Date.now() - 60 * 60 * 1000 };
    expect(() => linkIdentity(stale, { provider: "steam", subject: "76561198000000101" })).toThrow(/signing in again/);
    const only = one<{ id: string }>(`SELECT id FROM identities WHERE user_id = ?`, s.userId)!;
    expect(() => unlinkIdentity(s, only.id)).toThrow(/at least one/);
  });

  it("never merges accounts that share a display name", () => {
    const a = signInWithIdentity("live", { provider: "steam", subject: "1", displayName: "Tommy" });
    const b = signInWithIdentity("live", { provider: "microsoft", subject: "2", displayName: "Tommy" });
    expect(a.userId).not.toBe(b.userId);
  });
});

describe("wallet linking", () => {
  function wallet() {
    const secret = ed25519.utils.randomSecretKey();
    return { secret, address: bs58.encode(ed25519.getPublicKey(secret)) };
  }
  const sign = (secret: Uint8Array, msg: string) => bs58.encode(ed25519.sign(new TextEncoder().encode(msg), secret));

  it("verifies a signed, single-use challenge", () => {
    const s = liveSession("w-a");
    const w = wallet();
    const ch = createWalletChallenge(s, w.address);
    expect(ch.message).toContain("does not approve any transaction");
    verifyWalletChallenge(s, { challengeId: ch.id, signature: sign(w.secret, ch.message) });
    expect(() => verifyWalletChallenge(s, { challengeId: ch.id, signature: sign(w.secret, ch.message) })).toThrow(/already used/);
  });

  it("rejects a signature from a different key and an expired challenge", () => {
    const s = liveSession("w-b");
    const w = wallet();
    const other = wallet();
    const ch = createWalletChallenge(s, w.address);
    expect(() => verifyWalletChallenge(s, { challengeId: ch.id, signature: sign(other.secret, ch.message) })).toThrow(/does not match/);
    const t = Date.now();
    const ch2 = createWalletChallenge(s, w.address, t);
    expect(() => verifyWalletChallenge(s, { challengeId: ch2.id, signature: sign(w.secret, ch2.message) }, t + 6 * 60_000)).toThrow();
  });

  it("prevents one wallet from being linked to several gaming accounts", () => {
    const a = liveSession("w-c");
    const b = liveSession("w-d");
    const w = wallet();
    const c1 = createWalletChallenge(a, w.address);
    verifyWalletChallenge(a, { challengeId: c1.id, signature: sign(w.secret, c1.message) });
    const c2 = createWalletChallenge(b, w.address);
    expect(() => verifyWalletChallenge(b, { challengeId: c2.id, signature: sign(w.secret, c2.message) })).toThrow(/another member/);
  });
});

describe("provider webhooks", () => {
  it("verifies signatures and rejects replays", async () => {
    const { session, realm } = await demoSession();
    const item = findTierItem(realm, "red", "pc", "US")!;
    const q = createQuote(session, item.id);
    const { order } = await confirmRedemption(session, { quoteId: q.quoteId, idempotencyKey: key(), demoScenario: "pending" });
    expect(order.status).toBe("pending_delivery");
    const body = JSON.stringify({ id: "evt_12345678", type: "order.delivered", data: { idempotencyKey: order.provider_idempotency_key, code: "DEMO-NOT-REDEEMABLE-WEBH-OOK1" } });
    const t = Math.floor(Date.now() / 1000);
    expect(() => handleFulfillmentWebhook("demo", "secret", `t=${t},v1=${"0".repeat(64)}`, body)).toThrow(/Invalid signature/);
    const header = `t=${t},v1=${hmac("secret", `${t}.${body}`)}`;
    expect(handleFulfillmentWebhook("demo", "secret", header, body)).toEqual({ replay: false });
    expect(handleFulfillmentWebhook("demo", "secret", header, body)).toEqual({ replay: true });
    expect(getOrder(session, order.id).status).toBe("completed");
    const old = t - 3_600;
    expect(() => handleFulfillmentWebhook("demo", "secret", `t=${old},v1=${hmac("secret", `${old}.${body}`)}`, body)).toThrow(/tolerance/);
  });
});
