/**
 * Pure reward maths. No I/O, so it can be audited and unit-tested in isolation.
 *
 *   user allocation = floor(budget × user weight / total eligible weight)
 *
 * Weights are time-weighted token balances (raw base units × seconds) over the
 * period. All arithmetic is BigInt fixed-point; flooring is deterministic and
 * whatever is not allocated (rounding dust, unclaimed shares, or the whole
 * budget when total weight is zero) is carried forward in the pool.
 */

export interface BalanceEvent {
  owner: string;
  tokenAccount: string;
  /** Token account balance immediately after this event, raw base units. */
  balanceRaw: bigint;
  /** Unix seconds. */
  time: number;
}

export interface WeightOptions {
  start: number;
  end: number;
  /** Owners or token accounts that must never receive allocations. */
  excluded: Set<string>;
  /** Minimum time-averaged balance (raw units) to be eligible. */
  minAverageRaw: bigint;
}

export function timeWeightedWeights(events: BalanceEvent[], opts: WeightOptions): Map<string, bigint> {
  const { start, end } = opts;
  if (end <= start) throw new Error("Period end must be after start");
  const byAccount = new Map<string, BalanceEvent[]>();
  for (const e of events) {
    if (opts.excluded.has(e.owner) || opts.excluded.has(e.tokenAccount)) continue;
    const list = byAccount.get(e.tokenAccount) ?? [];
    list.push(e);
    byAccount.set(e.tokenAccount, list);
  }

  const weights = new Map<string, bigint>();
  for (const list of byAccount.values()) {
    list.sort((a, b) => a.time - b.time);
    let balance = 0n;
    let owner = list[0].owner;
    let cursor = start;
    for (const e of list) {
      if (e.time <= start) {
        balance = e.balanceRaw;
        owner = e.owner;
        continue;
      }
      if (e.time >= end) break;
      weights.set(owner, (weights.get(owner) ?? 0n) + balance * BigInt(e.time - cursor));
      balance = e.balanceRaw;
      owner = e.owner;
      cursor = e.time;
    }
    weights.set(owner, (weights.get(owner) ?? 0n) + balance * BigInt(end - cursor));
  }

  const duration = BigInt(end - start);
  for (const [owner, w] of weights) {
    if (w <= 0n || w / duration < opts.minAverageRaw) weights.delete(owner);
  }
  return weights;
}

export interface AllocationResult {
  shares: Array<{ wallet: string; weight: bigint; credits: number }>;
  totalWeight: bigint;
  allocated: number;
  remainder: number;
}

export function allocate(budgetCredits: number, weights: Map<string, bigint>): AllocationResult {
  if (!Number.isSafeInteger(budgetCredits) || budgetCredits < 0) throw new Error("Budget must be a non-negative integer");
  const wallets = [...weights.keys()].sort();
  const totalWeight = wallets.reduce((s, w) => s + weights.get(w)!, 0n);
  if (totalWeight === 0n || budgetCredits === 0) {
    return { shares: [], totalWeight, allocated: 0, remainder: budgetCredits };
  }
  const budget = BigInt(budgetCredits);
  let allocated = 0;
  const shares = wallets.map((wallet) => {
    const weight = weights.get(wallet)!;
    const credits = Number((budget * weight) / totalWeight);
    allocated += credits;
    return { wallet, weight, credits };
  });
  return { shares, totalWeight, allocated, remainder: budgetCredits - allocated };
}

/** Holder share of settled net proceeds, in USD micro-units (floored). */
export function holderShare(netUsdMicros: number, holderShareBps: number) {
  const holder = Math.floor((netUsdMicros * holderShareBps) / 10_000);
  return { holder, operations: netUsdMicros - holder };
}

/**
 * Credits backed by cumulative holder funding. Computed on the cumulative
 * total so sub-credit dust from one settlement is never lost.
 */
export function creditsBacked(cumulativeHolderUsdMicros: number, usdMicrosPerCredit: number) {
  return Math.floor(cumulativeHolderUsdMicros / usdMicrosPerCredit);
}

/** Basis-point fee with a maximum, as Token-2022 TransferFeeConfig computes it (ceil). */
export function transferFee(amountRaw: bigint, feeBps: number, maxFeeRaw: bigint) {
  if (feeBps === 0 || amountRaw === 0n) return 0n;
  const fee = (amountRaw * BigInt(feeBps) + 9_999n) / 10_000n;
  return fee > maxFeeRaw ? maxFeeRaw : fee;
}
