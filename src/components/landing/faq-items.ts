import { brand } from "@/config/brand";

/** FAQ copy, shared by the accordion and the FAQPage structured data. */
export const faqItems = [
  {
    q: "Which platforms can I redeem on?",
    a: "Shark Cards for GTA Online (GTA V) on PC, PlayStation 5 and Xbox Series X|S, subject to provider stock in your region. Each code only works on the platform and region it was issued for. Signing in with Steam or Microsoft proves your account, not that you own the game.",
  },
  {
    q: "Are rewards fixed or guaranteed?",
    a: "No. Rewards depend on fees that were actually collected and settled in each period, and your share of eligible holdings. They vary and can be zero. There is no APY, fixed rate or promise of profit.",
  },
  {
    q: "How are Shark Cards priced?",
    a: `Each card has a fixed price in SOL. You pay that amount in ${brand.ticker} at the live conversion when you check out. If ${brand.ticker} goes up, you pay fewer tokens for the same card.`,
  },
  {
    q: "Is the Apple Wallet pass the same as Apple Pay?",
    a: `No. The Wallet pass shows your ${brand.ticker} holdings and SOL rewards and can't be used to pay. "Pay with ${brand.name}" is a planned, separate payment card that would need a regulated issuing partner. It isn't live and nothing here activates a payment card.`,
  },
  {
    q: "Does this work with GTA VI?",
    a: "Not today. Current Shark Cards are for GTA Online associated with GTA V. GTA VI rewards stay an unavailable future category until compatibility and fulfilment are verified.",
  },
  {
    q: "Will you ever ask for my game account password?",
    a: "Never. We don't collect Rockstar, Xbox, PlayStation or Steam passwords and can't add GTA$ to your account directly. You redeem codes yourself on your platform.",
  },
  {
    q: "Is this an official Rockstar product?",
    a: brand.legal.independence,
  },
];
