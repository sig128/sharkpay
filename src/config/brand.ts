/**
 * Brand configuration. Every user-facing product name, ticker and legal line
 * reads from here so the identity can be changed without touching components.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "SHARKCARD",
  ticker: process.env.NEXT_PUBLIC_TOKEN_TICKER || "$SHARK",
  tokenName: process.env.NEXT_PUBLIC_TOKEN_NAME || "SHARKCARD",
  creditUnit: "credits",
  creditUnitShort: "CR",
  tagline: "Hold the token. Collect funded rewards. Redeem for game credit.",
  heroSupport: "Token-funded rewards for your next GTA Online upgrade.",
  social: {
    x: { handle: "@usesharkcard", url: "https://x.com/usesharkcard" },
  },
  legal: {
    independence:
      "Independent rewards platform. Not affiliated with Rockstar Games or Take-Two Interactive.",
    trademarks:
      "Grand Theft Auto, GTA Online and Shark Cards are products of Rockstar Games. Apple Wallet and Apple Pay are trademarks of Apple Inc. Xbox, PlayStation and Steam are trademarks of their respective owners. Their names are used only to describe compatibility.",
    credits:
      "Reward credits are non-transferable internal redemption units. They are not GTA$, not a bank deposit, not withdrawable cash and have no guaranteed value or yield.",
  },
  colors: {
    midnight: "#080A12",
    surface: "#121625",
    warmWhite: "#FFF4EA",
    muted: "#B3B6C7",
    pink: "#FF4EAE",
    coral: "#FF886B",
    butter: "#FFE5A5",
    mint: "#74E9CE",
  },
} as const;

export type Brand = typeof brand;
