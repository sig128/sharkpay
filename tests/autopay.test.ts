import { beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@solana/web3.js";

vi.hoisted(() => {
  process.env.TOKEN_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  process.env.TOKEN_DECIMALS = "6";
  process.env.MIN_ELIGIBLE_BALANCE = "10";
  process.env.HOLDER_SHARE_BPS = "8000";
  process.env.MIN_PAYOUT_LAMPORTS = "1000000";
  process.env.PRIORITY_FEE_MICROLAMPORTS = "0";
});

import { all, one, resetDbForTests, run } from "@/lib/server/db";
import { acct, balance, ledgerTotals } from "@/lib/server/ledger/ledger";
import { getFloat, runPayoutCycle } from "@/lib/server/rewards/autopay";
import { payoutStatus, walletRewards } from "@/lib/server/rewards/status";
import { parseSecretKey, type PayoutChain, type SignedTransfer } from "@/lib/server/solana/chain";
import bs58 from "bs58";

const SOL = 1_000_000_000;
const tokens = (n: number) => BigInt(n) * 1_000_000n;
const addr = () => Keypair.generate().publicKey.toBase58();

class FakeChain implements PayoutChain {
  feeWallet = addr();
  lamports: number;
  claimable = 0;
  holderMap = new Map<string, bigint>();
  autoConfirm = true;
  failSend = false;
  height = 1_000;
  status = new Map<string, "confirmed" | "failed" | "unknown">();
  pending = new Map<string, Array<{ wallet: string; lamports: number }>>();
  received = new Map<string, number>();
  private n = 0;

  constructor(lamports: number) {
    this.lamports = lamports;
  }

  balance = async () => this.lamports;
  claimCreatorFees = async () => {
    if (!this.claimable) return null;
    this.lamports += this.claimable;
    this.claimable = 0;
    return `claim${++this.n}`;
  };
  unwrapWsol = async () => null;
  holders = async () => new Map(this.holderMap);
  signTransfers = async (recipients: Array<{ wallet: string; lamports: number }>): Promise<SignedTransfer> => {
    const signature = `sig${++this.n}`;
    this.pending.set(signature, recipients);
    return { signature, serialized: new TextEncoder().encode(signature), lastValidBlockHeight: this.height + 150 };
  };
  send = async (serialized: Uint8Array) => {
    if (this.failSend) throw new Error("rpc down");
    if (this.autoConfirm) this.land(new TextDecoder().decode(serialized));
  };
  land(signature: string) {
    for (const r of this.pending.get(signature) ?? []) {
      this.lamports -= r.lamports;
      this.received.set(r.wallet, (this.received.get(r.wallet) ?? 0) + r.lamports);
    }
    this.lamports -= 5_000;
    this.status.set(signature, "confirmed");
  }
  statuses = async (signatures: string[]) => signatures.map((s) => this.status.get(s) ?? "unknown");
  blockHeight = async () => this.height;
}

let clock = 1_700_000_000_000;
const opts = { now: () => clock++, sleep: async () => {} };
const nextInterval = () => (clock += 30 * 60_000);

describe("automatic holder payouts", () => {
  let chain: FakeChain;
  let alice: string;
  let bob: string;

  beforeEach(() => {
    resetDbForTests();
    chain = new FakeChain(SOL / 20);
    alice = addr();
    bob = addr();
    chain.holderMap.set(alice, tokens(300));
    chain.holderMap.set(bob, tokens(100));
    nextInterval();
  });

  it("splits new creator fees 80/20 and pays holders by balance", async () => {
    chain.claimable = SOL;
    const s = await runPayoutCycle(chain, opts);
    expect(s.status).toBe("done");
    expect(s.incomeLamports).toBe(SOL);
    expect(s.holderLamports).toBe(0.8 * SOL);
    expect(s.opsLamports).toBe(0.2 * SOL);
    expect(chain.received.get(alice)).toBe(0.6 * SOL);
    expect(chain.received.get(bob)).toBe(0.2 * SOL);
    expect(s.paidWallets).toBe(2);
    expect(balance("live", acct.holder(alice))).toBe(0);
    // Pre-existing SOL plus the kept operations share are never treated as income.
    expect(getFloat()).toBe(SOL / 20 + 0.2 * SOL);
    expect(walletRewards([alice]).paid).toBe(0.6 * SOL);
    expect(payoutStatus().totals.paidHolders).toBe(0.8 * SOL);
  });

  it("never pays out the float or re-counts old SOL as income", async () => {
    const first = await runPayoutCycle(chain, opts);
    expect(first.incomeLamports).toBe(0);
    nextInterval();
    const second = await runPayoutCycle(chain, opts);
    expect(second.incomeLamports).toBe(0);
    expect(second.paidLamports).toBe(0);
    expect(chain.received.size).toBe(0);
  });

  it("accumulates amounts below the minimum until they reach it", async () => {
    chain.claimable = 2_000_000; // holders: 1_600_000 → alice 1_200_000, bob 400_000
    await runPayoutCycle(chain, opts);
    expect(chain.received.get(alice)).toBe(1_200_000);
    expect(chain.received.get(bob)).toBeUndefined();
    expect(balance("live", acct.holder(bob))).toBe(400_000);

    for (let i = 0; i < 2; i++) {
      nextInterval();
      chain.claimable = 2_000_000;
      await runPayoutCycle(chain, opts);
    }
    // Network fees come out of income, so bob's share is a little under 3 × 400_000.
    expect(chain.received.get(bob)).toBeGreaterThan(1_000_000);
    expect(balance("live", acct.holder(bob))).toBe(0);
  });

  it("excludes the fee wallet, exclusion list and tiny holders", async () => {
    const pool = addr();
    const dust = addr();
    chain.holderMap.set(chain.feeWallet, tokens(10_000));
    chain.holderMap.set(pool, tokens(10_000));
    chain.holderMap.set(dust, tokens(5));
    run(`INSERT INTO exclusions (realm, address, kind, label, source, added_at) VALUES ('live', ?, 'pool', 'AMM', 'test', 0)`, pool);
    chain.claimable = SOL;
    await runPayoutCycle(chain, opts);
    expect(chain.received.has(chain.feeWallet)).toBe(false);
    expect(chain.received.has(pool)).toBe(false);
    expect(chain.received.has(dust)).toBe(false);
    expect(chain.received.get(alice)).toBe(0.6 * SOL);
  });

  it("does not send again while an earlier transfer may still land", async () => {
    chain.autoConfirm = false;
    chain.claimable = SOL;
    const first = await runPayoutCycle(chain, opts);
    expect(first.paidLamports).toBe(0);
    expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM payout_transfers WHERE status = 'sending'`)?.n).toBe(1);

    nextInterval();
    chain.claimable = SOL;
    const waiting = await runPayoutCycle(chain, opts);
    expect(waiting.status).toBe("waiting");
    expect(chain.pending.size).toBe(1);

    // The transfer lands late: it is settled once and the owed balance is cleared.
    const [sig] = chain.pending.keys();
    chain.land(sig);
    chain.autoConfirm = true;
    nextInterval();
    const after = await runPayoutCycle(chain, opts);
    expect(after.status).toBe("done");
    expect(walletRewards([alice]).paid).toBeGreaterThanOrEqual(0.6 * SOL);
    expect(all(`SELECT * FROM holder_payouts WHERE wallet = ?`, alice).length).toBe(2);
    expect(ledgerTotals("live").owed).toBe(0);
  });

  it("pays again after a transfer expires without landing", async () => {
    chain.autoConfirm = false;
    chain.claimable = SOL;
    await runPayoutCycle(chain, opts);
    expect(chain.received.size).toBe(0);
    expect(balance("live", acct.holder(alice))).toBe(0.6 * SOL);

    chain.height += 1_000;
    chain.autoConfirm = true;
    nextInterval();
    const retry = await runPayoutCycle(chain, opts);
    expect(one<{ status: string }>(`SELECT status FROM payout_transfers ORDER BY created_at LIMIT 1`)?.status).toBe("expired");
    expect(retry.paidWallets).toBe(2);
    expect(chain.received.get(alice)).toBe(0.6 * SOL);
  });

  it("keeps owed SOL when a broadcast fails and retries next run", async () => {
    chain.failSend = true;
    chain.claimable = SOL;
    const s = await runPayoutCycle(chain, opts);
    expect(s.notes.join(" ")).toMatch(/Broadcast failed/);
    expect(ledgerTotals("live").owed).toBe(0.8 * SOL);

    chain.failSend = false;
    chain.height += 1_000;
    nextInterval();
    await runPayoutCycle(chain, opts);
    expect(chain.received.get(alice)).toBe(0.6 * SOL);
    expect(ledgerTotals("live").owed).toBe(0);
  });
});

describe("fee wallet key", () => {
  it("accepts base58 and JSON-array secret keys", () => {
    const kp = Keypair.generate();
    const pub = kp.publicKey.toBase58();
    expect(parseSecretKey(bs58.encode(kp.secretKey)).publicKey.toBase58()).toBe(pub);
    expect(parseSecretKey(JSON.stringify([...kp.secretKey])).publicKey.toBase58()).toBe(pub);
    expect(() => parseSecretKey("not-a-key")).toThrow(/FEE_WALLET_SECRET_KEY/);
    expect(() => parseSecretKey(bs58.encode(kp.secretKey.slice(0, 32)))).toThrow(/64-byte/);
  });
});
