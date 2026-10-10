import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

/**
 * Local transactional store (SQLite, WAL). Every table carries a `realm`:
 * `live` for real accounts, `demo:<id>` for an isolated demo sandbox. Queries
 * always filter by realm so demo activity can never touch real balances.
 */

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  reward_platform TEXT,
  reward_region TEXT,
  selected_item_tier TEXT,
  onboarded_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  realm TEXT NOT NULL,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  claims TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  last_auth_at INTEGER NOT NULL,
  UNIQUE (realm, provider, subject)
);
CREATE INDEX IF NOT EXISTS identities_user ON identities(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  realm TEXT NOT NULL,
  kind TEXT NOT NULL,
  auth_provider TEXT NOT NULL,
  auth_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS auth_flows (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_verifier TEXT,
  nonce TEXT,
  user_id TEXT,
  session_hash TEXT,
  return_to TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS openid_nonces (
  nonce TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_codes (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  user_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS dev_outbox (
  id TEXT PRIMARY KEY,
  to_hash TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE IF NOT EXISTS wallet_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  realm TEXT NOT NULL,
  address TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  realm TEXT NOT NULL,
  address TEXT NOT NULL,
  proof_message TEXT NOT NULL,
  proof_signature TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  unlinked_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS wallets_active_address ON wallets(realm, address) WHERE unlinked_at IS NULL;

CREATE TABLE IF NOT EXISTS holding_events (
  id TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  owner TEXT NOT NULL,
  token_account TEXT NOT NULL,
  balance_raw TEXT NOT NULL,
  slot INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  signature TEXT NOT NULL,
  UNIQUE (realm, token_account, signature)
);
CREATE INDEX IF NOT EXISTS holding_events_owner ON holding_events(realm, owner, block_time);

CREATE TABLE IF NOT EXISTS exclusions (
  realm TEXT NOT NULL,
  address TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  source TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (realm, address)
);

CREATE TABLE IF NOT EXISTS chain_watermarks (
  realm TEXT PRIMARY KEY,
  finalized_slot INTEGER NOT NULL,
  finalized_time INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fee_events (
  id TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount_raw TEXT NOT NULL,
  slot INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  signature TEXT NOT NULL,
  ix_index INTEGER NOT NULL DEFAULT 0,
  UNIQUE (realm, signature, kind, ix_index)
);

CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  tokens_sold_raw TEXT NOT NULL,
  gross_lamports INTEGER NOT NULL,
  costs_lamports INTEGER NOT NULL,
  net_lamports INTEGER NOT NULL,
  holder_share_bps INTEGER NOT NULL,
  holder_lamports INTEGER NOT NULL,
  ops_lamports INTEGER NOT NULL,
  venue TEXT NOT NULL,
  signature TEXT NOT NULL,
  settled_at INTEGER NOT NULL,
  UNIQUE (realm, signature)
);

CREATE TABLE IF NOT EXISTS operating_costs (
  id TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  label TEXT NOT NULL,
  usd_micros INTEGER NOT NULL,
  incurred_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reward_periods (
  id TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  seq INTEGER NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  budget_lamports INTEGER,
  total_weight TEXT,
  allocated_lamports INTEGER,
  carried_lamports INTEGER,
  eligible_wallets INTEGER,
  finalized_at INTEGER,
  UNIQUE (realm, seq)
);

CREATE TABLE IF NOT EXISTS allocations (
  id TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  period_id TEXT NOT NULL REFERENCES reward_periods(id),
  wallet TEXT NOT NULL,
  user_id TEXT,
  weight TEXT NOT NULL,
  lamports INTEGER NOT NULL,
  status TEXT NOT NULL,
  available_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (period_id, wallet)
);
CREATE INDEX IF NOT EXISTS allocations_user ON allocations(user_id);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  lamports INTEGER NOT NULL,
  signature TEXT NOT NULL UNIQUE,
  verified_by TEXT NOT NULL,
  paid_at INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS payouts_user ON payouts(user_id);

CREATE TABLE IF NOT EXISTS ledger_txns (
  id TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  memo TEXT,
  idempotency_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (realm, idempotency_key)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  txn_id TEXT NOT NULL REFERENCES ledger_txns(id),
  realm TEXT NOT NULL,
  account TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_entries_account ON ledger_entries(realm, account);

CREATE TRIGGER IF NOT EXISTS ledger_entries_no_update BEFORE UPDATE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS ledger_entries_no_delete BEFORE DELETE ON ledger_entries
WHEN OLD.realm NOT LIKE 'demo:%'
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS ledger_txns_no_update BEFORE UPDATE ON ledger_txns
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS ledger_txns_no_delete BEFORE DELETE ON ledger_txns
WHEN OLD.realm NOT LIKE 'demo:%'
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;

CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  sku TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_sku TEXT NOT NULL,
  name TEXT NOT NULL,
  tier TEXT NOT NULL,
  category TEXT NOT NULL,
  gta_amount INTEGER NOT NULL,
  sol_price_lamports INTEGER NOT NULL,
  retail_reference TEXT,
  platform TEXT NOT NULL,
  game_version TEXT NOT NULL,
  region TEXT NOT NULL,
  stock INTEGER,
  status TEXT NOT NULL,
  verified_live INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  fulfillment_kind TEXT NOT NULL DEFAULT 'code',
  updated_at INTEGER NOT NULL,
  UNIQUE (realm, sku)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  payment_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_ref TEXT,
  provider_idempotency_key TEXT NOT NULL UNIQUE,
  code_ciphertext TEXT,
  failure_reason TEXT,
  demo_scenario TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  reversed_at INTEGER
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE IF NOT EXISTS passes (
  serial TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  realm TEXT NOT NULL,
  auth_token_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pass_registrations (
  device_id TEXT NOT NULL,
  pass_type_id TEXT NOT NULL,
  serial TEXT NOT NULL REFERENCES passes(serial) ON DELETE CASCADE,
  push_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, pass_type_id, serial)
);

CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  email_ciphertext TEXT NOT NULL,
  user_id TEXT,
  region TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shark_payments (
  id TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  sol_price_lamports INTEGER NOT NULL,
  sol_usd_price REAL NOT NULL,
  token_usd_price REAL NOT NULL,
  amount_net TEXT NOT NULL,
  amount_gross TEXT NOT NULL,
  mint TEXT NOT NULL,
  recipient TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  tx_signature TEXT UNIQUE,
  payer TEXT,
  received TEXT,
  order_id TEXT UNIQUE,
  demo_scenario TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shark_payments_user ON shark_payments (user_id, created_at);
CREATE INDEX IF NOT EXISTS shark_payments_status ON shark_payments (status);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
`;

declare global {
  var __sharkcardDb: DatabaseSync | undefined;
}

function open(file: string): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  migrateCreditEra(db);
  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

/** 2: prices in SOL, rewards in lamports, no reward credits. */
const SCHEMA_VERSION = 2;

const CREDIT_ERA_TABLES = [
  "order_events",
  "orders",
  "quotes",
  "shark_payments",
  "catalog_items",
  "allocations",
  "reward_periods",
  "ledger_entries",
  "ledger_txns",
  "settlements",
  "operating_costs",
];
const DEMO_SCOPED_TABLES = [
  "holding_events",
  "fee_events",
  "exclusions",
  "chain_watermarks",
  "wallet_challenges",
  "wallets",
  "passes",
  "sessions",
  "identities",
  "users",
];

/**
 * Databases from the reward-credit era store credits where SOL amounts now go.
 * Their money tables are rebuilt, but only when no live money record exists:
 * real balances are never silently discarded, startup fails instead.
 */
function migrateCreditEra(db: DatabaseSync) {
  const cols = db.prepare(`PRAGMA table_info(catalog_items)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "credit_cost")) return;
  const tables = new Set(
    (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>).map((t) => t.name),
  );
  for (const t of ["ledger_entries", "settlements", "orders", "shark_payments"]) {
    if (!tables.has(t)) continue;
    const live = db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE realm = 'live'`).get() as { n: number };
    if (live.n > 0) {
      throw new Error(
        `Database ${t} holds live reward-credit records. Refusing to convert them automatically; migrate them by hand before upgrading.`,
      );
    }
  }
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const t of CREDIT_ERA_TABLES) db.exec(`DROP TABLE IF EXISTS ${t}`);
    for (const t of DEMO_SCOPED_TABLES) if (tables.has(t)) db.exec(`DELETE FROM ${t} WHERE realm LIKE 'demo:%'`);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

export function db(): DatabaseSync {
  if (!globalThis.__sharkcardDb) globalThis.__sharkcardDb = open(env().DATABASE_PATH);
  return globalThis.__sharkcardDb;
}

/** Test hook: swap in a fresh in-memory database. */
export function resetDbForTests() {
  globalThis.__sharkcardDb?.close();
  globalThis.__sharkcardDb = open(":memory:");
  return globalThis.__sharkcardDb;
}

let depth = 0;

/**
 * Runs `fn` in a single IMMEDIATE transaction (write lock taken up front).
 * Nested calls join the outer transaction. `fn` must be synchronous so no other
 * request can interleave between the balance check and the write.
 */
export function tx<T>(fn: () => T): T {
  const d = db();
  if (depth > 0) return fn();
  d.exec("BEGIN IMMEDIATE");
  depth++;
  try {
    const out = fn();
    if (out instanceof Promise) throw new Error("tx() callback must be synchronous");
    d.exec("COMMIT");
    return out;
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  } finally {
    depth--;
  }
}

type Row = Record<string, unknown>;

// node:sqlite returns null-prototype rows, which React cannot pass to client components.
export function one<T = Row>(sql: string, ...params: unknown[]): T | undefined {
  const row = db().prepare(sql).get(...(params as never[]));
  return (row ? { ...row } : undefined) as T | undefined;
}

export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...(params as never[])).map((row) => ({ ...row })) as T[];
}

export function run(sql: string, ...params: unknown[]) {
  return db().prepare(sql).run(...(params as never[]));
}
