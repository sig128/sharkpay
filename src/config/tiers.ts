/**
 * Shark Card price list. GTA$ denominations mirror the Shark Card tiers for
 * GTA Online; SOL prices are the fixed card prices members pay the $SHARK
 * equivalent of. Display only: orderable rows come from a connected
 * fulfilment provider's verified catalog.
 */
export const CARD_TIERS = [
  { tier: "red", name: "Red Shark Card", gta: 100_000, lamports: 450_000_000 },
  { tier: "tiger", name: "Tiger Shark Card", gta: 250_000, lamports: 750_000_000 },
  { tier: "bull", name: "Bull Shark Card", gta: 600_000, lamports: 1_500_000_000 },
  { tier: "great_white", name: "Great White Shark Card", gta: 1_250_000, lamports: 3_000_000_000 },
  { tier: "whale", name: "Whale Shark Card", gta: 4_250_000, lamports: 7_500_000_000 },
  { tier: "megalodon", name: "Megalodon Shark Card", gta: 10_000_000, lamports: 15_000_000_000 },
] as const;

export type CardTier = (typeof CARD_TIERS)[number];

export function cardTier(tier: string | null | undefined): CardTier | undefined {
  return CARD_TIERS.find((t) => t.tier === tier);
}
