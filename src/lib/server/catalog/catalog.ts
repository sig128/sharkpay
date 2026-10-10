import { all, one, run } from "../db";
import { randomId } from "../crypto";

export const PLATFORMS = {
  pc: { label: "PC", long: "PC" },
  playstation: { label: "PlayStation", long: "PlayStation 5" },
  xbox: { label: "Xbox", long: "Xbox Series X|S" },
} as const;
export type Platform = keyof typeof PLATFORMS;

export const GAME_VERSIONS = {
  gtao_gtav: { label: "GTA Online (GTA V)", available: true },
  gta_vi: { label: "GTA VI", available: false },
} as const;
export type GameVersion = keyof typeof GAME_VERSIONS;

export const REGIONS = {
  US: "United States",
  UK: "United Kingdom",
  EU: "European Union",
} as const;
export type Region = keyof typeof REGIONS;

export const CATEGORIES = {
  shark_card: "Shark Cards",
  gta_vi: "GTA VI rewards",
} as const;

export interface CatalogItem {
  id: string;
  realm: string;
  sku: string;
  provider: string;
  provider_sku: string;
  name: string;
  tier: string;
  category: keyof typeof CATEGORIES;
  gta_amount: number;
  /** Fixed card price in SOL (lamports). Members pay the $SHARK equivalent at checkout. */
  sol_price_lamports: number;
  retail_reference: string | null;
  platform: Platform;
  game_version: GameVersion;
  region: Region;
  stock: number | null;
  status: "available" | "out_of_stock" | "unavailable";
  verified_live: number;
  is_demo: number;
  fulfillment_kind: "code" | "instructions";
  updated_at: number;
}

/**
 * GTA$ denominations mirror the Shark Card tiers for GTA Online. SOL prices
 * are placeholders for the operator to set from distributor costs; every demo
 * row is flagged `is_demo`. A connected provider catalog replaces these rows.
 */
export const DEMO_TIERS = [
  { tier: "red", name: "Red Shark Card", gta: 100_000, lamports: 450_000_000 },
  { tier: "tiger", name: "Tiger Shark Card", gta: 250_000, lamports: 750_000_000 },
  { tier: "bull", name: "Bull Shark Card", gta: 600_000, lamports: 1_500_000_000 },
  { tier: "great_white", name: "Great White Shark Card", gta: 1_250_000, lamports: 3_000_000_000 },
  { tier: "whale", name: "Whale Shark Card", gta: 4_250_000, lamports: 7_500_000_000 },
  { tier: "megalodon", name: "Megalodon Shark Card", gta: 10_000_000, lamports: 15_000_000_000 },
] as const;

export function seedDemoCatalog(realm: string, now = Date.now()) {
  for (const t of DEMO_TIERS) {
    for (const platform of Object.keys(PLATFORMS) as Platform[]) {
      for (const region of Object.keys(REGIONS) as Region[]) {
        const outOfStock = t.tier === "megalodon" && platform === "xbox";
        const sku = `DEMO-${t.tier.toUpperCase()}-${platform.toUpperCase()}-${region}`;
        run(
          `INSERT OR IGNORE INTO catalog_items (id, realm, sku, provider, provider_sku, name, tier, category, gta_amount,
            sol_price_lamports, retail_reference, platform, game_version, region, stock, status, verified_live, is_demo,
            fulfillment_kind, updated_at)
           VALUES (?, ?, ?, 'demo', ?, ?, ?, 'shark_card', ?, ?, NULL, ?, 'gtao_gtav', ?, ?, ?, 0, 1, 'code', ?)`,
          randomId("itm"),
          realm,
          sku,
          sku,
          t.name,
          t.tier,
          t.gta,
          t.lamports,
          platform,
          region,
          outOfStock ? 0 : 25,
          outOfStock ? "out_of_stock" : "available",
          now,
        );
        run(
          `UPDATE catalog_items SET sol_price_lamports = ?, updated_at = ? WHERE realm = ? AND sku = ? AND is_demo = 1`,
          t.lamports,
          now,
          realm,
          sku,
        );
      }
    }
  }
}

export interface CatalogFilter {
  platform?: string;
  version?: string;
  region?: string;
  category?: string;
}

/**
 * Live realms only ever see provider-verified rows. Demo realms see their own
 * demo rows. Unknown filter values simply match nothing.
 */
export function listCatalog(realm: string, filter: CatalogFilter = {}): CatalogItem[] {
  const where = ["realm = ?"];
  const params: unknown[] = [realm];
  if (realm === "live") where.push("verified_live = 1 AND is_demo = 0");
  const columns = { platform: "platform", version: "game_version", region: "region", category: "category" } as const;
  for (const [key, column] of Object.entries(columns)) {
    const value = filter[key as keyof typeof columns];
    if (value) {
      where.push(`${column} = ?`);
      params.push(value);
    }
  }
  return all<CatalogItem>(
    `SELECT * FROM catalog_items WHERE ${where.join(" AND ")} ORDER BY sol_price_lamports, platform, region`,
    ...params,
  );
}

export function getItem(realm: string, itemId: string): CatalogItem | undefined {
  const item = one<CatalogItem>(`SELECT * FROM catalog_items WHERE id = ? AND realm = ?`, itemId, realm);
  if (item && realm === "live" && (!item.verified_live || item.is_demo)) return undefined;
  return item;
}

export function findTierItem(realm: string, tier: string, platform: string, region: string) {
  return one<CatalogItem>(
    `SELECT * FROM catalog_items WHERE realm = ? AND tier = ? AND platform = ? AND region = ?`,
    realm,
    tier,
    platform,
    region,
  );
}

export function redemptionInstructions(platform: Platform): string[] {
  const common = [
    "Codes and instructions come from the fulfilment provider. Follow the provider's steps exactly.",
    "We will never ask for your Rockstar, Xbox, PlayStation or Steam password, and nobody from this service can add GTA$ to your account directly.",
  ];
  switch (platform) {
    case "playstation":
      return ["On PlayStation 5, open PlayStation Store and choose Redeem Codes, or use the provider's link.", ...common];
    case "xbox":
      return ["On Xbox Series X|S, open Microsoft Store and choose Redeem, or visit microsoft.com/redeem.", ...common];
    case "pc":
      return [
        "On PC, redeem through the launcher or store named in the provider's instructions for your copy of the game.",
        ...common,
      ];
  }
}
