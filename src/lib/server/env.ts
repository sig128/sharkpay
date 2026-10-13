import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  APP_MODE: z.enum(["demo", "production"]).default("demo"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().optional(),
  DATA_ENCRYPTION_KEY: z.string().optional(),
  DATABASE_PATH: z.string().default(".data/sharkcard.db"),

  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  XBOX_LINKING_ENABLED: bool,
  XBOX_RELYING_PARTY: z.string().optional(),
  XBOX_SANDBOX_ID: z.string().default("RETAIL"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),

  // Steam OpenID needs no client secret. On unless set to false.
  STEAM_LOGIN_ENABLED: z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? true : v === "true" || v === "1")),
  STEAM_WEB_API_KEY: z.string().optional(),

  PLAYSTATION_PARTNER_ENABLED: bool,

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  APPLE_PASS_TYPE_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_PASS_CERT_PATH: z.string().optional(),
  APPLE_PASS_KEY_PATH: z.string().optional(),
  APPLE_PASS_KEY_PASSPHRASE: z.string().optional(),
  APPLE_WWDR_CERT_PATH: z.string().optional(),

  FULFILLMENT_PROVIDER: z.enum(["none"]).default("none"),
  FULFILLMENT_WEBHOOK_SECRET: z.string().optional(),

  TOKEN_MINT: z.string().optional(),
  MOONPAY_PUBLISHABLE_KEY: z.string().startsWith("pk_").optional(),
  SHARK_TREASURY_WALLET: z.string().optional(),
  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
  SHARK_PRICE_URL: z.string().url().default("https://lite-api.jup.ag/price/v3"),
  SHARK_MIN_LIQUIDITY_USD: z.coerce.number().min(0).default(25_000),
  SHARK_QUOTE_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  TOKEN_DECIMALS: z.coerce.number().int().min(0).max(12).default(6),
  TOKEN_PROGRAM: z.enum(["token-2022", "spl-token"]).default("token-2022"),

  /** Token-level transfer fee (Token-2022 extension). pump.fun coins have none. */
  TOKEN_TRANSFER_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(0),
  /** Trading fee the coin charges on buys and sells; shown on the site only. */
  TRADE_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(200),
  HOLDER_SHARE_BPS: z.coerce.number().int().min(0).max(10000).default(8000),
  MIN_ELIGIBLE_BALANCE: z.coerce.number().min(0).default(1000),

  /** pump.fun creator wallet. Signs fee claims and holder payouts. Never logged. */
  FEE_WALLET_SECRET_KEY: z.string().optional(),
  /** Receives the non-holder share. Unset: that share stays in the fee wallet. */
  OPS_WALLET: z.string().optional(),
  AUTO_PAYOUTS_ENABLED: z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  PAYOUT_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  SNAPSHOT_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
  /** Below the ~0.00089 SOL rent minimum a transfer to an empty wallet fails. */
  MIN_PAYOUT_LAMPORTS: z.coerce.number().int().min(900_000).default(1_000_000),
  MAX_PAYOUT_PER_CYCLE_LAMPORTS: z.coerce.number().int().positive().default(50_000_000_000),
  PRIORITY_FEE_MICROLAMPORTS: z.coerce.number().int().min(0).max(5_000_000).default(20_000),
  PUMP_FEES_API_URL: z.string().url().default("https://fun-block.pump.fun"),
  /** Bearer secret for the operator payout status / run-now endpoint. */
  OPERATOR_SECRET: z.string().min(32).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.parse({
    ...process.env,
    APP_URL: process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || undefined,
  });
  if (parsed.APP_MODE === "production") {
    if (!parsed.SESSION_SECRET || parsed.SESSION_SECRET.length < 32) {
      throw new Error("SESSION_SECRET (>= 32 chars) is required when APP_MODE=production");
    }
    if (!parsed.DATA_ENCRYPTION_KEY) {
      throw new Error("DATA_ENCRYPTION_KEY is required when APP_MODE=production");
    }
  }
  cached = parsed;
  return parsed;
}

export function isProduction() {
  return env().APP_MODE === "production";
}

export function sessionSecret(): string {
  return env().SESSION_SECRET ?? "local-demo-session-secret-do-not-use-in-production";
}

/** What is actually wired up. The UI reads this to label features honestly. */
export function integrations() {
  const e = env();
  return {
    microsoft: Boolean(e.MICROSOFT_CLIENT_ID && e.MICROSOFT_CLIENT_SECRET),
    xbox: Boolean(
      e.XBOX_LINKING_ENABLED && e.XBOX_RELYING_PARTY && e.MICROSOFT_CLIENT_ID && e.MICROSOFT_CLIENT_SECRET,
    ),
    google: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    x: Boolean(e.X_CLIENT_ID && e.X_CLIENT_SECRET),
    steam: e.STEAM_LOGIN_ENABLED,
    playstation: false as boolean,
    email: Boolean(e.RESEND_API_KEY && e.EMAIL_FROM) || e.APP_MODE === "demo",
    emailDevOutbox: !(e.RESEND_API_KEY && e.EMAIL_FROM) && e.APP_MODE === "demo",
    applePass: Boolean(
      e.APPLE_PASS_TYPE_ID &&
        e.APPLE_TEAM_ID &&
        e.APPLE_PASS_CERT_PATH &&
        e.APPLE_PASS_KEY_PATH &&
        e.APPLE_WWDR_CERT_PATH,
    ),
    liveFulfillment: false as boolean,
    autoPayouts: Boolean(e.AUTO_PAYOUTS_ENABLED && e.TOKEN_MINT && e.FEE_WALLET_SECRET_KEY),
    cardIssuer: false as boolean,
  };
}
