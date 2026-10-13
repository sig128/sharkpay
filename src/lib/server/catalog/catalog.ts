import { all, one } from "../db";

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
  fulfillment_kind: "code" | "instructions";
  updated_at: number;
}

export { CARD_TIERS, cardTier, type CardTier } from "@/config/tiers";

export interface CatalogFilter {
  platform?: string;
  version?: string;
  region?: string;
  category?: string;
}

/** Only provider-verified rows are listed. Unknown filter values simply match nothing. */
export function listCatalog(realm: string, filter: CatalogFilter = {}): CatalogItem[] {
  const where = ["realm = ?", "verified_live = 1"];
  const params: unknown[] = [realm];
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
  if (item && !item.verified_live) return undefined;
  return item;
}

export function findTierItem(realm: string, tier: string, platform: string, region: string) {
  return one<CatalogItem>(
    `SELECT * FROM catalog_items WHERE realm = ? AND tier = ? AND platform = ? AND region = ? AND verified_live = 1`,
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
