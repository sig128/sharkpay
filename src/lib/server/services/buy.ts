import bs58 from "bs58";
import { env, type Env } from "@/lib/server/env";

const SOL_MINT = "So11111111111111111111111111111111111111112";

export type BuyStatus = "ready" | "not_configured" | "not_live";

export interface BuyOption {
  id: "card" | "jupiter" | "raydium";
  name: string;
  detail: string;
  href: string | null;
  status: BuyStatus;
}

export interface BuyInfo {
  mint: string | null;
  explorerUrl: string | null;
  options: BuyOption[];
}

/** Returns the address only if it is a well-formed 32-byte base58 Solana public key. */
export function validAddress(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) return null;
  try {
    return bs58.decode(v).length === 32 ? v : null;
  } catch {
    return null;
  }
}

export function validMint(raw: string | undefined): string | null {
  const v = validAddress(raw);
  return v && v !== SOL_MINT ? v : null;
}

/**
 * Third-party ways to acquire the token. Everything links out: the user pays the
 * provider and signs swaps in their own wallet. Nothing is offered without a valid mint.
 */
export function buyInfo(e: Env = env()): BuyInfo {
  const mint = validMint(e.TOKEN_MINT);
  const live = (href: string): Pick<BuyOption, "href" | "status"> =>
    mint ? { href, status: "ready" } : { href: null, status: "not_live" };

  const card: Pick<BuyOption, "href" | "status"> = !mint
    ? { href: null, status: "not_live" }
    : !e.MOONPAY_PUBLISHABLE_KEY
      ? { href: null, status: "not_configured" }
      : {
          href: `https://buy.moonpay.com/?${new URLSearchParams({
            apiKey: e.MOONPAY_PUBLISHABLE_KEY,
            currencyCode: "sol",
            baseCurrencyCode: "usd",
            colorCode: "#FF4EAE",
          })}`,
          status: "ready",
        };

  return {
    mint,
    explorerUrl: mint ? `https://solscan.io/token/${mint}` : null,
    options: [
      {
        id: "card",
        name: "Card, Apple Pay or Google Pay",
        detail: "Buy SOL with MoonPay straight into your own wallet, then swap it below.",
        ...card,
      },
      {
        id: "jupiter",
        name: "Swap on Jupiter",
        detail: "Best route across Solana DEXs. Swap SOL or USDC in your wallet.",
        ...live(`https://jup.ag/swap?${new URLSearchParams({ sell: SOL_MINT, buy: mint ?? "" })}`),
      },
      {
        id: "raydium",
        name: "Swap on Raydium",
        detail: "Swap directly against the Raydium pool.",
        ...live(`https://raydium.io/swap/?${new URLSearchParams({ inputMint: "sol", outputMint: mint ?? "" })}`),
      },
    ],
  };
}
