import { describe, expect, it } from "vitest";
import { allocate, creditsBacked, holderShare, timeWeightedWeights, transferFee } from "@/lib/server/rewards/engine";

describe("time-weighted holdings", () => {
  const start = 1_000;
  const end = 2_000;
  const base = { start, end, excluded: new Set<string>(), minAverageRaw: 0n };

  it("weights balances by how long they were held, not by a single snapshot", () => {
    const w = timeWeightedWeights(
      [
        { owner: "A", tokenAccount: "a1", balanceRaw: 100n, time: 500 },
        { owner: "B", tokenAccount: "b1", balanceRaw: 0n, time: 500 },
        // B buys 1,000 tokens one minute before the period ends
        { owner: "B", tokenAccount: "b1", balanceRaw: 1_000n, time: 1_940 },
      ],
      base,
    );
    expect(w.get("A")).toBe(100n * 1_000n);
    expect(w.get("B")).toBe(1_000n * 60n);
  });

  it("sums multiple token accounts owned by the same wallet", () => {
    const w = timeWeightedWeights(
      [
        { owner: "A", tokenAccount: "ata", balanceRaw: 10n, time: 0 },
        { owner: "A", tokenAccount: "aux", balanceRaw: 5n, time: 1_500 },
      ],
      base,
    );
    expect(w.get("A")).toBe(10n * 1_000n + 5n * 500n);
  });

  it("excludes treasury, pool and exchange accounts by owner or token account", () => {
    const w = timeWeightedWeights(
      [
        { owner: "LP", tokenAccount: "vault", balanceRaw: 1_000_000n, time: 0 },
        { owner: "X", tokenAccount: "exch", balanceRaw: 1_000_000n, time: 0 },
        { owner: "A", tokenAccount: "a1", balanceRaw: 1n, time: 0 },
      ],
      { ...base, excluded: new Set(["LP", "exch"]) },
    );
    expect([...w.keys()]).toEqual(["A"]);
  });

  it("drops holders whose average balance is below the minimum", () => {
    const w = timeWeightedWeights(
      [
        { owner: "A", tokenAccount: "a1", balanceRaw: 99n, time: 0 },
        { owner: "B", tokenAccount: "b1", balanceRaw: 100n, time: 0 },
      ],
      { ...base, minAverageRaw: 100n },
    );
    expect([...w.keys()]).toEqual(["B"]);
  });
});

describe("allocation", () => {
  it("floors deterministically and reports the remainder to carry forward", () => {
    const r = allocate(100, new Map([["a", 1n], ["b", 1n], ["c", 1n]]));
    expect(r.shares.map((s) => s.credits)).toEqual([33, 33, 33]);
    expect(r.allocated).toBe(99);
    expect(r.remainder).toBe(1);
  });

  it("carries the whole budget when total weight is zero", () => {
    const r = allocate(5_000, new Map());
    expect(r.allocated).toBe(0);
    expect(r.remainder).toBe(5_000);
  });

  it("never allocates more than the budget for large weights", () => {
    const weights = new Map<string, bigint>();
    for (let i = 0; i < 500; i++) weights.set(`w${i}`, BigInt(i + 1) * 10n ** 18n + 7n);
    const r = allocate(1_234_567, weights);
    expect(r.allocated).toBeLessThanOrEqual(1_234_567);
    expect(r.allocated + r.remainder).toBe(1_234_567);
  });
});

describe("funding maths", () => {
  it("splits net proceeds 80/20 without losing micro-units", () => {
    const s = holderShare(1_000_003, 8_000);
    expect(s.holder + s.operations).toBe(1_000_003);
    expect(s.holder).toBe(800_002);
  });

  it("computes credits from cumulative funding so dust is carried", () => {
    expect(creditsBacked(19_999, 10_000)).toBe(1);
    expect(creditsBacked(19_999 + 1, 10_000)).toBe(2);
  });

  it("matches Token-2022 fee rounding (ceil) and maximum", () => {
    expect(transferFee(1_000n, 200, 1_000_000n)).toBe(20n);
    expect(transferFee(1n, 200, 1_000_000n)).toBe(1n);
    expect(transferFee(10n ** 12n, 200, 5_000n)).toBe(5_000n);
  });
});
