import { beforeEach, describe, expect, it, vi } from "vitest";

const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TREASURY = "5f1oiop1b3Bxw8ppwbAECAVXq118mHGCVLEsp4EFPSxb";
const PAYER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

vi.hoisted(() => {
  process.env.TOKEN_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  process.env.SHARK_TREASURY_WALLET = "5f1oiop1b3Bxw8ppwbAECAVXq118mHGCVLEsp4EFPSxb";
  process.env.TOKEN_DECIMALS = "6";
  process.env.TOKEN_TRANSFER_FEE_BPS = "200";
  process.env.SHARK_MIN_LIQUIDITY_USD = "10000";
});

const delivered = vi.hoisted(() => ({ next: { status: "delivered", providerRef: "p1", code: "REAL-CODE-1" } as Record<string, unknown> }));

vi.mock("@/lib/server/fulfillment/provider", async (orig) => {
  const mod = await orig<typeof import("@/lib/server/fulfillment/provider")>();
  const live = {
    id: "testdist",
    submit: async () => delivered.next,
    status: async () => delivered.next,
  };
  return { ...mod, providerFor: () => live };
});

import { one, resetDbForTests, run } from "@/lib/server/db";
import { transferFee } from "@/lib/server/rewards/engine";
import {
  checkSharkPayment,
  createSharkQuote,
  formatUnits,
  grossForNet,
  inspectPayment,
  resetPriceCacheForTests,
  sharkCheckout,
  sharkUsdPrice,
  tokensForSol,
} from "@/lib/server/payments/shark";
import type { Session } from "@/lib/server/auth/sessions";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const BULL_LAMPORTS = 1_500_000_000;
const NET_AT_HALF = 450_000_000n;

const priceFetch = (usdPrice: number, liquidity = 50_000, solUsd = 150) =>
  (async () =>
    new Response(
      JSON.stringify({
        [MINT]: { usdPrice, liquidity },
        [SOL_MINT]: { usdPrice: solUsd, liquidity: 1_000_000_000 },
      }),
    )) as unknown as typeof fetch;

function seed() {
  resetDbForTests();
  resetPriceCacheForTests();
  const now = Date.now();
  for (const id of ["usr_a", "usr_b"]) {
    run(`INSERT INTO users (id, realm, display_name, created_at) VALUES (?, 'live', ?, ?)`, id, id, now);
  }
  run(
    `INSERT INTO catalog_items (id, realm, sku, provider, provider_sku, name, tier, category, gta_amount, sol_price_lamports,
      platform, game_version, region, stock, status, verified_live, fulfillment_kind, updated_at)
     VALUES ('itm_bull', 'live', 'BULL-PS-US', 'testdist', 'D-BULL', 'Bull Shark Card', 'bull', 'shark_card', 600000, ${BULL_LAMPORTS},
      'playstation', 'gtao_gtav', 'US', 3, 'available', 1, 'code', ?)`,
    now,
  );
}

const session = (userId = "usr_a"): Session => ({
  idHash: "h",
  userId,
  realm: "live",
  kind: "real",
  authProvider: "google",
  authAt: Date.now(),
  expiresAt: Date.now() + 1e7,
});

function chainTx(reference: string, received: bigint, opts: { mint?: string; recipient?: string; blockTime?: number; err?: unknown } = {}) {
  return {
    blockTime: Math.floor((opts.blockTime ?? Date.now()) / 1000),
    meta: {
      err: opts.err ?? null,
      preTokenBalances: [
        { accountIndex: 1, mint: opts.mint ?? MINT, owner: PAYER, uiTokenAmount: { amount: "100000000000" } },
        { accountIndex: 2, mint: opts.mint ?? MINT, owner: opts.recipient ?? TREASURY, uiTokenAmount: { amount: "5" } },
      ],
      postTokenBalances: [
        { accountIndex: 1, mint: opts.mint ?? MINT, owner: PAYER, uiTokenAmount: { amount: (100000000000n - received).toString() } },
        { accountIndex: 2, mint: opts.mint ?? MINT, owner: opts.recipient ?? TREASURY, uiTokenAmount: { amount: (5n + received).toString() } },
      ],
    },
    transaction: { message: { accountKeys: [{ pubkey: PAYER }, { pubkey: "ataP" }, { pubkey: "ataT" }, { pubkey: reference }] } },
  };
}

const rpcFor = (txs: Record<string, unknown>) => async (method: string, params: unknown[]) => {
  if (method === "getSignaturesForAddress") return Object.keys(txs).map((signature) => ({ signature, err: null }));
  return txs[params[0] as string] ?? null;
};

describe("amounts", () => {
  it("rounds the token amount up so the price is always covered", () => {
    expect(tokensForSol(BULL_LAMPORTS, 150, 0.5, 6)).toBe(NET_AT_HALF);
    expect(tokensForSol(10_000_000, 100, 0.5, 6)).toBe(2_000_000n);
  });

  it("grosses up for the transfer fee so the treasury nets the full amount", () => {
    for (const net of [1n, 99n, 19_980_000n, 123_456_789n]) {
      const gross = grossForNet(net, 200);
      expect(gross - transferFee(gross, 200, 1n << 62n)).toBeGreaterThanOrEqual(net);
      expect(gross - 1n - transferFee(gross - 1n, 200, 1n << 62n)).toBeLessThan(net);
    }
    expect(grossForNet(500n, 0)).toBe(500n);
  });

  it("formats atomic units", () => {
    expect(formatUnits(20_387_756n, 6)).toBe("20.387756");
    expect(formatUnits(5_000_000n, 6)).toBe("5");
    expect(formatUnits(7n, 6)).toBe("0.000007");
  });
});

describe("price feed", () => {
  beforeEach(() => resetPriceCacheForTests());

  it("rejects thin liquidity and missing prices", async () => {
    await expect(sharkUsdPrice(MINT, priceFetch(0.5, 100))).rejects.toMatchObject({ code: "price_unavailable" });
    resetPriceCacheForTests();
    await expect(sharkUsdPrice(MINT, priceFetch(0))).rejects.toMatchObject({ code: "price_unavailable" });
    resetPriceCacheForTests();
    await expect(sharkUsdPrice(MINT, (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch)).rejects.toMatchObject({
      code: "price_unavailable",
    });
  });

  it("returns the server price", async () => {
    expect(await sharkUsdPrice(MINT, priceFetch(0.42))).toBe(0.42);
  });
});

describe("checkout availability", () => {
  it("is on once the mint, treasury and a fulfilment provider are configured", () => {
    expect(sharkCheckout()).toMatchObject({ enabled: true, mint: MINT, treasury: TREASURY });
  });
});

describe("transaction inspection", () => {
  const p = { reference: "REF111", mint: MINT, recipient: TREASURY };
  it("measures what the treasury actually received and who paid", () => {
    expect(inspectPayment(chainTx("REF111", 42n) as never, p)).toMatchObject({ received: 42n, payer: PAYER });
  });
  it("ignores failed, unreferenced, wrong-mint and wrong-recipient transfers", () => {
    expect(inspectPayment(chainTx("REF111", 42n, { err: { InstructionError: [] } }) as never, p)).toBeNull();
    expect(inspectPayment(chainTx("OTHER", 42n) as never, p)).toBeNull();
    expect(inspectPayment(chainTx("REF111", 42n, { mint: "So11111111111111111111111111111111111111112" }) as never, p)).toBeNull();
    expect(inspectPayment(chainTx("REF111", 42n, { recipient: PAYER }) as never, p)).toBeNull();
  });
});

describe("pay with $SHARK end to end", () => {
  beforeEach(() => {
    seed();
    delivered.next = { status: "delivered", providerRef: "p1", code: "REAL-CODE-1" };
  });

  it("quotes from the server price and delivers the card once the payment is final", async () => {
    const q = await createSharkQuote(session(), "itm_bull", priceFetch(0.5));
    expect(q.amount).toBe(formatUnits(grossForNet(NET_AT_HALF, 200), 6));
    expect(q.solanaPayUrl).toContain(`solana:${TREASURY}?`);
    expect(q.solanaPayUrl).toContain(`spl-token=${MINT}`);
    expect(q.solanaPayUrl).toContain(`reference=${q.reference}`);

    const pending = await checkSharkPayment(session(), q.id, rpcFor({}));
    expect(pending.payment.status).toBe("awaiting_payment");
    expect(pending.order).toBeNull();

    const res = await checkSharkPayment(session(), q.id, rpcFor({ sig1: chainTx(q.reference, NET_AT_HALF) }));
    expect(res.payment.status).toBe("paid");
    expect(res.order?.status).toBe("completed");
    expect(one<{ stock: number }>(`SELECT stock FROM catalog_items WHERE id = 'itm_bull'`)!.stock).toBe(2);

    const again = await checkSharkPayment(session(), q.id, rpcFor({ sig1: chainTx(q.reference, NET_AT_HALF) }));
    expect(again.order?.id).toBe(res.order?.id);
    expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM orders`)!.n).toBe(1);
  });

  it("never lets one transaction pay for two orders", async () => {
    const a = await createSharkQuote(session(), "itm_bull", priceFetch(0.5));
    const b = await createSharkQuote(session(), "itm_bull", priceFetch(0.5));
    const tx = chainTx(a.reference, NET_AT_HALF);
    tx.transaction.message.accountKeys.push({ pubkey: b.reference });
    await checkSharkPayment(session(), a.id, rpcFor({ sig1: tx }));
    const second = await checkSharkPayment(session(), b.id, rpcFor({ sig1: tx }));
    expect(second.payment.status).toBe("awaiting_payment");
    expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM orders`)!.n).toBe(1);
  });

  it("flags underpayment and late payment for refund instead of delivering", async () => {
    const under = await createSharkQuote(session(), "itm_bull", priceFetch(0.5));
    const r1 = await checkSharkPayment(session(), under.id, rpcFor({ s1: chainTx(under.reference, 10n) }));
    expect(r1.payment.status).toBe("refund_due");
    expect(r1.order).toBeNull();

    const late = await createSharkQuote(session(), "itm_bull", priceFetch(0.5));
    const r2 = await checkSharkPayment(
      session(),
      late.id,
      rpcFor({ s2: chainTx(late.reference, NET_AT_HALF, { blockTime: late.expiresAt + 5 * 60_000 }) }),
    );
    expect(r2.payment.status).toBe("refund_due");
  });

  it("marks a refund due when delivery fails", async () => {
    delivered.next = { status: "failed", providerRef: "p1", reason: "Provider out of codes" };
    const q = await createSharkQuote(session(), "itm_bull", priceFetch(0.5));
    const res = await checkSharkPayment(session(), q.id, rpcFor({ s: chainTx(q.reference, NET_AT_HALF) }));
    expect(res.order?.status).toBe("reversed");
    expect(one<{ status: string }>(`SELECT status FROM shark_payments WHERE id = ?`, q.id)!.status).toBe("refund_due");
    expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM ledger_entries`)!.n).toBe(0);
  });

  it("hides another member's payment", async () => {
    const q = await createSharkQuote(session("usr_a"), "itm_bull", priceFetch(0.5));
    await expect(checkSharkPayment(session("usr_b"), q.id, rpcFor({}))).rejects.toMatchObject({ status: 404 });
  });
});
