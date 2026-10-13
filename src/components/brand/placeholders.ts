import { brand } from "@/config/brand";
import type { WalletPassData } from "./WalletPass";

/** What the card and pass show to visitors without an account: the product, not a person. */
export interface Showcase {
  sharePct: number;
  minutes: number;
  site: string;
}

export function showcaseFrom(opts: { holderShareBps: number; intervalMinutes: number; appUrl: string }): Showcase {
  return {
    sharePct: Math.round(opts.holderShareBps / 100),
    minutes: opts.intervalMinutes,
    site: opts.appUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  };
}

export function showcasePass(s: Showcase): WalletPassData {
  return {
    logoText: brand.name,
    header: { label: "PAID IN", value: "SOL" },
    primary: { label: "HOLDER REWARDS", value: `${s.sharePct}% of fees` },
    secondary: [
      { label: "HOLDER", value: `${brand.ticker} Holder` },
      { label: "PAYOUTS", value: `Every ${s.minutes} min` },
    ],
    auxiliary: [
      { label: "SHARK CARDS", value: "PC · PS5 · Xbox" },
      { label: "WEBSITE", value: s.site },
    ],
    barcode: { message: `https://${s.site}`, altText: s.site },
  };
}
