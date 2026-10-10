import crypto from "node:crypto";
import bs58 from "bs58";
import { all, one, run, tx } from "../db";
import { randomId } from "../crypto";
import { env } from "../env";
import { acct, balance } from "../ledger/ledger";
import { addExclusion, ingest, recordSettlement } from "../chain/ingest";
import { allocate, timeWeightedWeights, type BalanceEvent } from "../rewards/engine";
import { clearMatured, createPeriod, finalizePeriod, CALC_BUFFER_S } from "../rewards/periods";
import { findTierItem, seedDemoCatalog } from "../catalog/catalog";
import { confirmRedemption, createQuote } from "../orders/orders";
import { signInWithIdentity, updatePreferences } from "../auth/accounts";
import type { Session } from "../auth/sessions";

/**
 * Demo fixture targets. These come out of the real engine: the seed funds each
 * period with exactly enough settled proceeds that the demo member's
 * time-weighted share floors to the target. Nothing here is real data.
 */
export const DEMO_FIXTURE = {
  available: 2_840,
  pending: 360,
  selectedTier: "bull",
  selectedCost: 5_000,
  quickTier: "red",
  periodTargets: [1_180, 1_420, 1_740, 360],
  pastRedemptionTier: "red",
  tokenPriceUsdMicros: 4_200,
  displayName: "Demo Member",
};

const DAY = 86_400;

function address(realm: string, label: string) {
  return bs58.encode(crypto.createHash("sha256").update(`${realm}:${label}`).digest());
}

function tokens(n: number) {
  return BigInt(Math.round(n * 10 ** env().TOKEN_DECIMALS));
}

let sigCounter = 0;
function sig(realm: string) {
  return bs58.encode(crypto.createHash("sha256").update(`${realm}:sig:${sigCounter++}:${Math.random()}`).digest());
}

interface Holder {
  label: string;
  owner: string;
  tokenAccount: string;
  linked: boolean;
  timeline: Array<{ at: "start" | "mid"; period: number; tokens: number }>;
}

/** Creates an isolated demo realm with a complete, engine-computed history. */
export async function createDemoRealm(nowMs = Date.now(), realmName?: string) {
  const realm = realmName ?? `demo:${randomId("rlm", 9).slice(4)}`;
  const nowS = Math.floor(nowMs / 1000);

  // Five contiguous weekly periods; the last is open, the fourth closed ~46h ago.
  const p5Start = nowS - 2 * DAY;
  const starts = [p5Start - 28 * DAY, p5Start - 21 * DAY, p5Start - 14 * DAY, p5Start - 7 * DAY, p5Start];

  const member = signInWithIdentity(realm, {
    provider: "demo",
    subject: `demo-member-${realm}`,
    displayName: DEMO_FIXTURE.displayName,
  }, (starts[0] - 10 * DAY) * 1000);
  updatePreferences(member.userId, {
    platform: "playstation",
    region: "US",
    tier: DEMO_FIXTURE.selectedTier,
    markOnboarded: true,
  });

  seedDemoCatalog(realm, nowMs);

  const excluded = [
    { label: "treasury", kind: "treasury", name: "Rewards treasury (fee withdrawal destination)" },
    { label: "lp", kind: "liquidity_pool", name: "AMM liquidity pool vault" },
    { label: "exchange", kind: "exchange", name: "Exchange hot wallet (custodial)" },
    { label: "authority", kind: "fee_authority", name: "Withdraw-withheld authority" },
  ];
  for (const x of excluded) {
    addExclusion(realm, { address: address(realm, x.label), kind: x.kind, label: x.name, source: "Sample configuration" }, nowMs);
  }

  const memberWallet = address(realm, "member");
  const holders: Holder[] = [
    { label: "member", owner: memberWallet, tokenAccount: address(realm, "member-ata"), linked: true, timeline: [{ at: "start", period: 0, tokens: 1_000_000 }] },
    { label: "h1", owner: address(realm, "h1"), tokenAccount: address(realm, "h1-ata"), linked: true, timeline: [{ at: "start", period: 0, tokens: 17_333_333.25 }] },
    { label: "h2", owner: address(realm, "h2"), tokenAccount: address(realm, "h2-ata"), linked: true, timeline: [{ at: "start", period: 0, tokens: 20_111_111 }, { at: "mid", period: 2, tokens: 14_000_000 }] },
    { label: "h3", owner: address(realm, "h3"), tokenAccount: address(realm, "h3-ata"), linked: false, timeline: [{ at: "start", period: 0, tokens: 1_555_556 }] },
    { label: "h4", owner: address(realm, "h4"), tokenAccount: address(realm, "h4-ata"), linked: true, timeline: [{ at: "mid", period: 1, tokens: 4_000_000 }] },
    { label: "dust", owner: address(realm, "dust"), tokenAccount: address(realm, "dust-ata"), linked: true, timeline: [{ at: "start", period: 0, tokens: 420 }] },
    { label: "lp", owner: address(realm, "lp"), tokenAccount: address(realm, "lp-vault"), linked: false, timeline: [{ at: "start", period: 0, tokens: 120_000_000 }] },
    { label: "exchange", owner: address(realm, "exchange"), tokenAccount: address(realm, "exchange-ata"), linked: false, timeline: [{ at: "start", period: 0, tokens: 35_000_000 }] },
    { label: "treasury", owner: address(realm, "treasury"), tokenAccount: address(realm, "treasury-ata"), linked: false, timeline: [{ at: "start", period: 0, tokens: 60_000_000 }] },
  ];

  const events = holders.flatMap((h) =>
    h.timeline.map((t) => ({
      type: "balance" as const,
      owner: h.owner,
      tokenAccount: h.tokenAccount,
      balanceRaw: tokens(t.tokens).toString(),
      slot: 0,
      blockTime: t.at === "start" ? starts[t.period] - 3600 : starts[t.period] + Math.floor(3.5 * DAY),
      signature: sig(realm),
      commitment: "finalized" as const,
    })),
  );
  events.forEach((e, i) => (e.slot = 300_000_000 + i));
  ingest(realm, { events }, nowMs);

  // Link wallets for sample holders (sandbox-only accounts; never displayed as users).
  const linkedAt = (starts[0] - 5 * DAY) * 1000;
  for (const h of holders.filter((x) => x.linked)) {
    const userId =
      h.label === "member"
        ? member.userId
        : signInWithIdentity(realm, { provider: "demo", subject: `sample-${h.label}-${realm}`, displayName: "Sample holder" }, linkedAt).userId;
    run(
      `INSERT INTO wallets (id, user_id, realm, address, proof_message, proof_signature, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      randomId("wal"),
      userId,
      realm,
      h.owner,
      "Demo fixture: ownership simulated",
      "demo-fixture",
      linkedAt,
    );
  }

  for (const s of starts) createPeriod(realm, s, s + 7 * DAY);
  const periods = all<{ id: string; starts_at: number; ends_at: number }>(
    `SELECT id, starts_at, ends_at FROM reward_periods WHERE realm = ? ORDER BY seq`,
    realm,
  );

  const e = env();
  const exclusionSet = new Set(all<{ address: string }>(`SELECT address FROM exclusions WHERE realm = ?`, realm).map((x) => x.address));
  const balanceEvents: BalanceEvent[] = events.map((ev) => ({
    owner: ev.owner,
    tokenAccount: ev.tokenAccount,
    balanceRaw: BigInt(ev.balanceRaw),
    time: ev.blockTime,
  }));
  const minAverageRaw = BigInt(Math.round(e.MIN_ELIGIBLE_BALANCE * 10 ** e.TOKEN_DECIMALS));

  for (let k = 0; k < 4; k++) {
    const p = periods[k];
    const weights = timeWeightedWeights(balanceEvents, { start: p.starts_at, end: p.ends_at, excluded: exclusionSet, minAverageRaw });
    const total = [...weights.values()].reduce((a, b) => a + b, 0n);
    const mine = weights.get(memberWallet)!;
    const target = BigInt(DEMO_FIXTURE.periodTargets[k]);
    const budget = Number((target * total + mine - 1n) / mine);
    const carry = balance(realm, acct.pool);
    const fund = budget - carry;
    if (fund <= 0) throw new Error("Demo fixture: carried pool exceeds the period target");
    // net proceeds needed so the holder share funds exactly `fund` credits
    const holderMicros = fund * e.CREDIT_USD_MICROS;
    const netMicros = Math.ceil((holderMicros * 10_000) / e.HOLDER_SHARE_BPS);
    const costsMicros = Math.round(netMicros * 0.015);
    const grossMicros = netMicros + costsMicros;
    const tokensSold = (BigInt(grossMicros) * 10n ** BigInt(e.TOKEN_DECIMALS)) / BigInt(DEMO_FIXTURE.tokenPriceUsdMicros);
    const withdrawn = (tokensSold * 125n) / 100n;
    const t0 = p.ends_at - 2 * DAY;
    ingest(realm, {
      events: [
        { type: "fee", kind: "withheld", amountRaw: withdrawn.toString(), slot: 310_000_000 + k * 10, blockTime: t0 - DAY, signature: sig(realm), ixIndex: 0, commitment: "finalized" },
        { type: "fee", kind: "harvested", amountRaw: withdrawn.toString(), slot: 310_000_001 + k * 10, blockTime: t0 - 3600, signature: sig(realm), ixIndex: 0, commitment: "finalized" },
        { type: "fee", kind: "withdrawn", amountRaw: withdrawn.toString(), slot: 310_000_002 + k * 10, blockTime: t0 - 1800, signature: sig(realm), ixIndex: 0, commitment: "finalized" },
      ],
    }, nowMs);
    recordSettlement(realm, {
      type: "settlement",
      tokensSoldRaw: tokensSold.toString(),
      grossUsdMicros: grossMicros,
      costsUsdMicros: costsMicros,
      venue: "Sample DEX route",
      signature: sig(realm),
      settledAt: t0,
      commitment: "finalized",
    }, t0 * 1000);
    ingest(realm, { events: [], watermark: { slot: 320_000_000 + k, blockTime: p.ends_at + 600 } }, nowMs);
    // sanity: the engine reproduces the target exactly
    const check = allocate(budget, weights).shares.find((s) => s.wallet === memberWallet)!;
    if (BigInt(check.credits) !== target) throw new Error("Demo fixture mismatch");
    finalizePeriod(realm, p.id, (p.ends_at + CALC_BUFFER_S) * 1000);
    if (k < 3) clearMatured(realm, (p.ends_at + CALC_BUFFER_S) * 1000 + e.PENDING_CLEARANCE_HOURS * 3600 * 1000);
  }

  ingest(realm, { events: [], watermark: { slot: 330_000_000, blockTime: nowS - 60 } }, nowMs);

  run(
    `INSERT INTO operating_costs (id, realm, label, usd_micros, incurred_at) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
    randomId("opc"), realm, "Infrastructure and indexing (sample)", 38_500_000, (starts[2] + DAY) * 1000,
    randomId("opc"), realm, "Fulfilment and support (sample)", 52_000_000, (starts[3] + DAY) * 1000,
  );

  // Past activity for the demo member, through the real order path.
  const session: Session = {
    idHash: "seed",
    userId: member.userId,
    realm,
    kind: "demo",
    authProvider: "demo",
    authAt: nowMs,
    expiresAt: nowMs + DAY * 1000,
  };
  const redeemAt = (starts[3] + 2 * DAY) * 1000;
  const item = findTierItem(realm, DEMO_FIXTURE.pastRedemptionTier, "playstation", "US")!;
  const q1 = createQuote(session, item.id, redeemAt);
  await confirmRedemption(session, { quoteId: q1.quoteId, idempotencyKey: `seed_${randomId("idk")}`, demoScenario: "fail" }, redeemAt);
  const q2 = createQuote(session, item.id, redeemAt + 120_000);
  await confirmRedemption(session, { quoteId: q2.quoteId, idempotencyKey: `seed_${randomId("idk")}`, demoScenario: "instant" }, redeemAt + 120_000);

  return { realm, userId: member.userId, memberWallet };
}

export const PUBLIC_SAMPLE_REALM = "demo:public";
let publicRealmPromise: Promise<string> | null = null;

/** Shared sample realm for the public transparency view (no session required). */
export function publicSampleRealm(): Promise<string> {
  publicRealmPromise ??= (async () => {
    if (one(`SELECT 1 FROM reward_periods WHERE realm = ? AND status = 'finalized'`, PUBLIC_SAMPLE_REALM)) {
      return PUBLIC_SAMPLE_REALM;
    }
    await createDemoRealm(Date.now(), PUBLIC_SAMPLE_REALM);
    return PUBLIC_SAMPLE_REALM;
  })().catch((err) => {
    publicRealmPromise = null;
    throw err;
  });
  return publicRealmPromise;
}

const DEMO_TABLES_IN_ORDER = [
  "ledger_entries",
  "ledger_txns",
  "allocations",
  "reward_periods",
  "quotes",
  "orders",
  "catalog_items",
  "settlements",
  "fee_events",
  "holding_events",
  "exclusions",
  "chain_watermarks",
  "operating_costs",
  "wallet_challenges",
  "wallets",
  "passes",
  "sessions",
  "identities",
  "users",
];

/** Deletes demo realms older than `maxAgeMs`. Live data is never touched. */
export function pruneDemoRealms(maxAgeMs = 48 * 3600 * 1000, nowMs = Date.now()) {
  const realms = all<{ realm: string }>(
    `SELECT c.realm FROM catalog_items c WHERE c.realm LIKE 'demo:%' AND c.realm != ?
     GROUP BY c.realm HAVING MAX(c.updated_at) < ?
       AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.realm = c.realm AND s.expires_at > ?)`,
    PUBLIC_SAMPLE_REALM,
    nowMs - maxAgeMs,
    nowMs,
  );
  for (const { realm } of realms) {
    if (!realm.startsWith("demo:")) continue;
    tx(() => {
      for (const table of DEMO_TABLES_IN_ORDER) run(`DELETE FROM ${table} WHERE realm = ?`, realm);
    });
  }
  return realms.length;
}
