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

  STEAM_LOGIN_ENABLED: bool,
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

  CHAIN_INGEST_SECRET: z.string().optional(),
  TOKEN_MINT: z.string().optional(),
  MOONPAY_PUBLISHABLE_KEY: z.string().startsWith("pk_").optional(),
  SHARK_TREASURY_WALLET: z.string().optional(),
  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
  SHARK_PRICE_URL: z.string().url().default("https://lite-api.jup.ag/price/v3"),
  SHARK_MIN_LIQUIDITY_USD: z.coerce.number().min(0).default(25_000),
  SHARK_QUOTE_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  TOKEN_DECIMALS: z.coerce.number().int().min(0).max(12).default(6),
  TOKEN_PROGRAM: z.enum(["token-2022", "spl-token"]).default("token-2022"),

  REWARD_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(200),
  HOLDER_SHARE_BPS: z.coerce.number().int().min(0).max(10000).default(8000),
  CREDIT_USD_MICROS: z.coerce.number().int().positive().default(10000),
  PENDING_CLEARANCE_HOURS: z.coerce.number().int().min(0).default(72),
  PERIOD_LENGTH_DAYS: z.coerce.number().int().positive().default(7),
  MIN_ELIGIBLE_BALANCE: z.coerce.number().min(0).default(1000),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.parse(process.env);
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
    steam: e.STEAM_LOGIN_ENABLED || e.APP_MODE === "demo",
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
    chainIngest: Boolean(e.CHAIN_INGEST_SECRET && e.TOKEN_MINT),
    cardIssuer: false as boolean,
  };
}
