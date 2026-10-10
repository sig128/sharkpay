/**
 * Brand configuration. Every user-facing product name, ticker and legal line
 * reads from here so the identity can be changed without touching components.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "SHARKCARD",
  ticker: process.env.NEXT_PUBLIC_TOKEN_TICKER || "$SHARK",
  tokenName: process.env.NEXT_PUBLIC_TOKEN_NAME || "SHARKCARD",
  tagline: "Hold $SHARK. Earn SOL from settled fees. Pay for Shark Cards in $SHARK.",
  heroSupport: "Fixed SOL prices, paid in $SHARK. Holder rewards paid in SOL.",
  social: {
    x: { handle: "@usesharkcard", url: "https://x.com/usesharkcard" },
  },
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || null,
  legal: {
    independence:
      "Independent rewards platform. Not affiliated with Rockstar Games or Take-Two Interactive.",
    trademarks:
      "Grand Theft Auto, GTA Online and Shark Cards are products of Rockstar Games. Apple Wallet and Apple Pay are trademarks of Apple Inc. Xbox, PlayStation and Steam are trademarks of their respective owners. Their names are used only to describe compatibility.",
    rewards:
      "Holder rewards are a share of SOL from fees that have actually been collected and settled. They vary each period and can be zero. They are not a guaranteed yield, APY or profit.",
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
