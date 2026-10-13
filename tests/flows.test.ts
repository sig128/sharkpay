import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.TOKEN_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  process.env.SHARK_TREASURY_WALLET = "5f1oiop1b3Bxw8ppwbAECAVXq118mHGCVLEsp4EFPSxb";
  process.env.TOKEN_DECIMALS = "6";
  process.env.SHARK_MIN_LIQUIDITY_USD = "10000";
});

const provider = vi.hoisted(() => ({
  connected: true,
  submit: { status: "delivered", providerRef: "p1", code: "TEST-CODE-1" } as Record<string, unknown>,
  status: { status: "pending", providerRef: "p1" } as Record<string, unknown>,
}));

vi.mock("@/lib/server/fulfillment/provider", async (orig) => {
  const mod = await orig<typeof import("@/lib/server/fulfillment/provider")>();
  const testProvider = {
    id: "testdist",
    submit: async () => provider.submit,
    status: async () => provider.status,
  };
  return { ...mod, providerFor: () => (provider.connected ? testProvider : null) };
});

import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { resetDbForTests, run, one } from "@/lib/server/db";
import { createSession, resolveSession, type Session } from "@/lib/server/auth/sessions";
import { applyProviderResult, getOrder, reconcileOrder, revealCode } from "@/lib/server/orders/orders";
import { checkSharkPayment, createSharkQuote, resetPriceCacheForTests } from "@/lib/server/payments/shark";
import { post, acct } from "@/lib/server/ledger/ledger";
import { activity, overview } from "@/lib/server/services/dashboard";
import { createFlow, consumeFlow } from "@/lib/server/auth/flows";
import { verifySteamAssertion, steamReturnTo, STEAM_OP_ENDPOINT } from "@/lib/server/auth/steam";
import { linkIdentity, signInWithIdentity, unlinkIdentity } from "@/lib/server/auth/accounts";
import { createWalletChallenge, verifyWalletChallenge } from "@/lib/server/wallet/verify";
import { handleFulfillmentWebhook } from "@/lib/server/fulfillment/webhooks";
import { hmac, sha256 } from "@/lib/server/crypto";
import { AppError } from "@/lib/server/errors";

const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TREASURY = "5f1oiop1b3Bxw8ppwbAECAVXq118mHGCVLEsp4EFPSxb";
const PAYER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const SOL_MINT = "So11111111111111111111111111111111111111112";

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

function seedItem(id: string, opts: { stock?: number; status?: string; platform?: string; region?: string } = {}) {
  run(
    `INSERT INTO catalog_items (id, realm, sku, provider, provider_sku, name, tier, category, gta_amount, sol_price_lamports,
      platform, game_version, region, stock, status, verified_live, fulfillment_kind, updated_at)
     VALUES (?, 'live', ?, 'testdist', ?, 'Red Shark Card', 'red', 'shark_card', 100000, 450000000, ?, 'gtao_gtav', ?, ?, ?, 1, 'code', ?)`,
    id,
    `SKU-${id}`,
    `D-${id}`,
    opts.platform ?? "playstation",
    opts.region ?? "US",
    opts.stock ?? 5,
    opts.status ?? "available",
    Date.now(),
  );
}

const priceFetch = (async () =>
  new Response(JSON.stringify({ [MINT]: { usdPrice: 0.5, liquidity: 50_000 }, [SOL_MINT]: { usdPrice: 150 } }))) as unknown as typeof fetch;

function chainTx(reference: string, received: bigint) {
  return {
    blockTime: Math.floor(Date.now() / 1000),
    meta: {
      err: null,
      preTokenBalances: [
        { accountIndex: 1, mint: MINT, owner: PAYER, uiTokenAmount: { amount: "100000000000" } },
        { accountIndex: 2, mint: MINT, owner: TREASURY, uiTokenAmount: { amount: "0" } },
      ],
      postTokenBalances: [
        { accountIndex: 1, mint: MINT, owner: PAYER, uiTokenAmount: { amount: (100000000000n - received).toString() } },
        { accountIndex: 2, mint: MINT, owner: TREASURY, uiTokenAmount: { amount: received.toString() } },
      ],
    },
    transaction: { message: { accountKeys: [{ pubkey: PAYER }, { pubkey: reference }] } },
  };
}

/** Quotes the item and confirms a finalized payment of the full amount on-chain. */
async function buy(session: Session, itemId: string) {
  const q = await createSharkQuote(session, itemId, priceFetch);
  const net = BigInt(one<{ amount_net: string }>(`SELECT amount_net FROM shark_payments WHERE id = ?`, q.id)!.amount_net);
  const tx = chainTx(q.reference, net);
  return checkSharkPayment(session, q.id, async (method: string) =>
    method === "getSignaturesForAddress" ? [{ signature: `sig_${q.id}`, err: null }] : tx,
  );
}

beforeEach(() => {
  resetDbForTests();
  resetPriceCacheForTests();
  provider.connected = true;
  provider.submit = { status: "delivered", providerRef: "p1", code: "TEST-CODE-1" };
  provider.status = { status: "pending", providerRef: "p1" };
});

describe("$SHARK checkout", () => {
  it("delivers the provider's code once the payment is final, without touching SOL rewards", async () => {
    const session = liveSession("buyer-1");
    seedItem("itm_red");
    const { order } = await buy(session, "itm_red");
    expect(order?.status).toBe("completed");
    expect(revealCode(session, order!.id)).toBe("TEST-CODE-1");
    expect(overview(session).rewards).toMatchObject({ owed: 0, paid: 0 });
    expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM ledger_entries`)!.n).toBe(0);
  });

  it("marks a refund due and restocks when fulfilment fails", async () => {
    const session = liveSession("buyer-2");
    seedItem("itm_red", { stock: 3 });
    provider.submit = { status: "failed", providerRef: "p1", reason: "Provider declined" };
    const { order, payment } = await buy(session, "itm_red");
    expect(order?.status).toBe("reversed");
    expect(payment.status).toBe("refund_due");
    expect(one<{ stock: number }>(`SELECT stock FROM catalog_items WHERE id = 'itm_red'`)!.stock).toBe(3);
  });

  it("keeps an uncertain outcome open until the provider is reconciled", async () => {
    const session = liveSession("buyer-3");
    seedItem("itm_red");
    provider.submit = { status: "unknown", reason: "Provider timed out" };
    const { order } = await buy(session, "itm_red");
    expect(order?.status).toBe("needs_reconciliation");
    provider.status = { status: "failed", providerRef: "p1", reason: "Provider confirmed the order was never charged" };
    const after = await reconcileOrder(session, order!.id);
    expect(after.status).toBe("reversed");
  });

  it("ignores duplicated provider outcomes", async () => {
    const session = liveSession("buyer-4");
    seedItem("itm_red");
    provider.submit = { status: "failed", providerRef: "p1", reason: "Provider declined" };
    const { order } = await buy(session, "itm_red");
    applyProviderResult(order!.id, { status: "failed", reason: "again" });
    applyProviderResult(order!.id, { status: "delivered", providerRef: "x", code: "LATE" });
    expect(getOrder(session, order!.id).status).toBe("reversed");
  });

  it("rejects out-of-stock items", async () => {
    const session = liveSession("buyer-5");
    seedItem("itm_oos", { stock: 0, status: "out_of_stock", platform: "xbox" });
    await expectCode(() => createSharkQuote(session, "itm_oos", priceFetch), "out_of_stock");
  });

  it("hides unverified catalog rows", async () => {
    const session = liveSession("buyer-6");
    seedItem("itm_red");
    run(`UPDATE catalog_items SET verified_live = 0 WHERE id = 'itm_red'`);
    await expectCode(() => createSharkQuote(session, "itm_red", priceFetch), "not_found");
  });

  it("does not let one member read another member's order", async () => {
    const a = liveSession("buyer-a");
    const b = liveSession("buyer-b");
    seedItem("itm_red");
    const { order } = await buy(a, "itm_red");
    await expectCode(() => getOrder(b, order!.id), "not_found");
    await expectCode(() => revealCode(b, order!.id), "not_found");
  });

  it("fails closed when no fulfilment provider is connected", async () => {
    provider.connected = false;
    const s = liveSession("76561198000000001");
    seedItem("itm_red");
    await expectCode(() => createSharkQuote(s, "itm_red", priceFetch), "fulfillment_unavailable");
  });
});

describe("member rewards", () => {
  it("shows owed and paid SOL for the member's active linked wallets only", () => {
    const s = liveSession("holder-1");
    const mine = "Wallet1111111111111111111111111111111111111";
    const unlinked = "Wallet2222222222222222222222222222222222222";
    const now = Date.now();
    for (const [address, unlinkedAt] of [[mine, null], [unlinked, now]] as const) {
      run(
        `INSERT INTO wallets (id, user_id, realm, address, proof_message, proof_signature, verified_at, unlinked_at)
         VALUES (?, ?, 'live', ?, 'm', 's', ?, ?)`,
        `wal_${address.slice(-4)}`,
        s.userId,
        address,
        now,
        unlinkedAt,
      );
    }
    for (const w of [mine, unlinked]) {
      post("live", { kind: "fee_income", idempotencyKey: `in_${w}`, entries: [{ account: acct.feeIncome, amount: -5_000_000 }, { account: acct.pool, amount: 5_000_000 }] });
      post("live", { kind: "accrual", idempotencyKey: `ac_${w}`, entries: [{ account: acct.pool, amount: -5_000_000 }, { account: acct.holder(w), amount: 5_000_000 }] });
    }
    run(`INSERT INTO payout_cycles (id, started_at, status) VALUES ('cyc_1', ?, 'done')`, now);
    run(
      `INSERT INTO payout_transfers (id, cycle_id, signature, status, lamports, recipients, last_valid_block_height, created_at)
       VALUES ('ptx_1', 'cyc_1', 'SIG1', 'confirmed', 3000000, '[]', 1, ?)`,
      now,
    );
    run(`INSERT INTO holder_payouts (transfer_id, wallet, lamports, paid_at) VALUES ('ptx_1', ?, 3000000, ?), ('ptx_1', ?, 3000000, ?)`, mine, now, unlinked, now);

    const o = overview(s);
    expect(o.rewards).toMatchObject({ owed: 5_000_000, paid: 3_000_000 });
    expect(o.rewards.latestPayout?.explorerUrl).toBe("https://solscan.io/tx/SIG1");
    expect(o.payouts.live).toBe(false);
    expect(o.payouts.blocker).toMatch(/FEE_WALLET_SECRET_KEY/);
    const payouts = activity(s).filter((a) => a.kind === "payout");
    expect(payouts).toHaveLength(1);
    expect(payouts[0].explorerUrl).toBe("https://solscan.io/tx/SIG1");
  });
});

describe("ledger", () => {
  it("is append-only", () => {
    post("live", {
      kind: "fee_income",
      idempotencyKey: "f1",
      entries: [
        { account: acct.feeIncome, amount: -10 },
        { account: acct.pool, amount: 10 },
      ],
    });
    expect(() => run(`UPDATE ledger_entries SET amount = 999`)).toThrow(/append-only/);
    expect(() => run(`DELETE FROM ledger_entries`)).toThrow(/append-only/);
  });

  it("refuses unbalanced or overdrawing transactions", () => {
    expect(() => post("live", { kind: "fee_income", idempotencyKey: "u", entries: [{ account: acct.pool, amount: 5 }, { account: acct.feeIncome, amount: -4 }] })).toThrow(/balance/);
    expect(() => post("live", { kind: "accrual", idempotencyKey: "o", entries: [{ account: acct.pool, amount: -5 }, { account: acct.holder("w1"), amount: 5 }] })).toThrow(/Insufficient/);
  });
});

describe("sessions", () => {
  it("only resolves live member sessions", () => {
    const s = liveSession("sess-1");
    const token = "tok_" + "x".repeat(40);
    const now = Date.now();
    run(
      `INSERT INTO sessions (id_hash, user_id, realm, kind, auth_provider, auth_at, created_at, expires_at) VALUES (?, ?, 'demo:old', 'demo', 'demo', ?, ?, ?)`,
      sha256(token),
      s.userId,
      now,
      now,
      now + 60_000,
    );
    expect(resolveSession(token)).toBeNull();
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
    const session = liveSession("hook-1");
    seedItem("itm_red");
    provider.submit = { status: "pending", providerRef: "p1" };
    const { order } = await buy(session, "itm_red");
    expect(order).toBeTruthy();
    expect(order!.status).toBe("pending_delivery");
    const body = JSON.stringify({ id: "evt_12345678", type: "order.delivered", data: { idempotencyKey: order!.provider_idempotency_key, code: "WEBHOOK-CODE-1" } });
    const t = Math.floor(Date.now() / 1000);
    expect(() => handleFulfillmentWebhook("testdist", "secret", `t=${t},v1=${"0".repeat(64)}`, body)).toThrow(/Invalid signature/);
    const header = `t=${t},v1=${hmac("secret", `${t}.${body}`)}`;
    expect(handleFulfillmentWebhook("testdist", "secret", header, body)).toEqual({ replay: false });
    expect(handleFulfillmentWebhook("testdist", "secret", header, body)).toEqual({ replay: true });
    expect(getOrder(session, order!.id).status).toBe("completed");
    expect(revealCode(session, order!.id)).toBe("WEBHOOK-CODE-1");
    const old = t - 3_600;
    expect(() => handleFulfillmentWebhook("testdist", "secret", `t=${old},v1=${hmac("secret", `${old}.${body}`)}`, body)).toThrow(/tolerance/);
  });
});
