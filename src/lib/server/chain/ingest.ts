import { z } from "zod";
import { all, one, run, tx } from "../db";
import { randomId } from "../crypto";
import { env } from "../env";
import { acct, post } from "../ledger/ledger";
import { creditsBacked, holderShare } from "../rewards/engine";

/**
 * Ingestion boundary for verified chain data. An indexer you operate (reading
 * finalized Solana blocks for the configured mint) pushes batches here. Only
 * `finalized` commitment is accepted. Every event is idempotent on its
 * signature, so replays and overlapping batches are harmless.
 *
 * This module never signs or submits transactions.
 */

const finalized = z.literal("finalized");
const raw = z.string().regex(/^\d+$/);

export const balanceEvent = z.object({
  type: z.literal("balance"),
  owner: z.string().min(32).max(44),
  tokenAccount: z.string().min(32).max(44),
  balanceRaw: raw,
  slot: z.number().int().nonnegative(),
  blockTime: z.number().int().positive(),
  signature: z.string().min(16).max(128),
  commitment: finalized,
});

export const feeEvent = z.object({
  type: z.literal("fee"),
  /** withheld: fee held in a recipient token account; harvested: moved to the mint; withdrawn: moved to the treasury by the withdraw authority. */
  kind: z.enum(["withheld", "harvested", "withdrawn"]),
  amountRaw: raw,
  slot: z.number().int().nonnegative(),
  blockTime: z.number().int().positive(),
  signature: z.string().min(16).max(128),
  ixIndex: z.number().int().nonnegative().default(0),
  commitment: finalized,
});

export const settlementEvent = z.object({
  type: z.literal("settlement"),
  tokensSoldRaw: raw,
  grossUsdMicros: z.number().int().nonnegative(),
  /** Venue fees, network fees, slippage and other deductions actually paid. */
  costsUsdMicros: z.number().int().nonnegative(),
  venue: z.string().min(1).max(64),
  signature: z.string().min(16).max(128),
  settledAt: z.number().int().positive(),
  commitment: finalized,
});

export const ingestBatch = z.object({
  events: z.array(z.discriminatedUnion("type", [balanceEvent, feeEvent, settlementEvent])).max(5000),
  watermark: z.object({ slot: z.number().int().nonnegative(), blockTime: z.number().int().positive() }).optional(),
});

export type IngestBatch = z.infer<typeof ingestBatch>;

export function ingest(realm: string, batch: IngestBatch, now = Date.now()) {
  let inserted = 0;
  tx(() => {
    for (const e of batch.events) {
      if (e.type === "balance") {
        inserted += Number(
          run(
            `INSERT OR IGNORE INTO holding_events (id, realm, owner, token_account, balance_raw, slot, block_time, signature)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            randomId("hev"),
            realm,
            e.owner,
            e.tokenAccount,
            e.balanceRaw,
            e.slot,
            e.blockTime,
            e.signature,
          ).changes,
        );
      } else if (e.type === "fee") {
        inserted += Number(
          run(
            `INSERT OR IGNORE INTO fee_events (id, realm, kind, amount_raw, slot, block_time, signature, ix_index)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            randomId("fee"),
            realm,
            e.kind,
            e.amountRaw,
            e.slot,
            e.blockTime,
            e.signature,
            e.ixIndex,
          ).changes,
        );
      } else {
        inserted += recordSettlement(realm, e, now) ? 1 : 0;
      }
    }
    if (batch.watermark) {
      run(
        `INSERT INTO chain_watermarks (realm, finalized_slot, finalized_time, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(realm) DO UPDATE SET
           finalized_slot = MAX(finalized_slot, excluded.finalized_slot),
           finalized_time = MAX(finalized_time, excluded.finalized_time),
           updated_at = excluded.updated_at`,
        realm,
        batch.watermark.slot,
        batch.watermark.blockTime,
        now,
      );
    }
  });
  return { inserted };
}

/**
 * Records settled proceeds and funds the holder pool. Credits are only ever
 * created here, from actual net proceeds; never from volume or unsold fees.
 */
export function recordSettlement(realm: string, s: z.infer<typeof settlementEvent>, now = Date.now()) {
  return tx(() => {
    if (one(`SELECT 1 FROM settlements WHERE realm = ? AND signature = ?`, realm, s.signature)) return false;
    const e = env();
    const net = Math.max(0, s.grossUsdMicros - s.costsUsdMicros);
    const split = holderShare(net, e.HOLDER_SHARE_BPS);
    const prior = one<{ holder: number | null; credits: number | null }>(
      `SELECT SUM(holder_usd_micros) AS holder, SUM(credits_funded) AS credits FROM settlements WHERE realm = ?`,
      realm,
    );
    const credits =
      creditsBacked((prior?.holder ?? 0) + split.holder, e.CREDIT_USD_MICROS) - (prior?.credits ?? 0);
    const id = randomId("stl");
    run(
      `INSERT INTO settlements (id, realm, tokens_sold_raw, gross_usd_micros, costs_usd_micros, net_usd_micros,
        holder_share_bps, holder_usd_micros, ops_usd_micros, credits_funded, venue, signature, settled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      realm,
      s.tokensSoldRaw,
      s.grossUsdMicros,
      s.costsUsdMicros,
      net,
      e.HOLDER_SHARE_BPS,
      split.holder,
      split.operations,
      credits,
      s.venue,
      s.signature,
      s.settledAt,
    );
    if (credits > 0) {
      post(
        realm,
        {
          kind: "funding",
          idempotencyKey: `funding:${id}`,
          refType: "settlement",
          refId: id,
          memo: "Settled fee proceeds funded the holder reward pool",
          entries: [
            { account: acct.settlement, amount: -credits },
            { account: acct.pool, amount: credits },
          ],
        },
        now,
      );
    }
    return true;
  });
}

export function watermark(realm: string) {
  return one<{ finalized_slot: number; finalized_time: number; updated_at: number }>(
    `SELECT * FROM chain_watermarks WHERE realm = ?`,
    realm,
  );
}

export function addExclusion(
  realm: string,
  x: { address: string; kind: string; label: string; source: string },
  now = Date.now(),
) {
  run(
    `INSERT OR REPLACE INTO exclusions (realm, address, kind, label, source, added_at) VALUES (?, ?, ?, ?, ?, ?)`,
    realm,
    x.address,
    x.kind,
    x.label,
    x.source,
    now,
  );
}

export function listExclusions(realm: string) {
  return all<{ address: string; kind: string; label: string; source: string }>(
    `SELECT address, kind, label, source FROM exclusions WHERE realm = ? ORDER BY kind, label`,
    realm,
  );
}
