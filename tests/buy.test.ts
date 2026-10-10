import { describe, expect, it } from "vitest";
import { env } from "@/lib/server/env";
import { buyInfo, validMint } from "@/lib/server/services/buy";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const base = env();

describe("buy options", () => {
  it("accepts only 32-byte base58 mints", () => {
    expect(validMint(USDC)).toBe(USDC);
    expect(validMint(` ${USDC} `)).toBe(USDC);
    expect(validMint(undefined)).toBeNull();
    expect(validMint("not-a-mint")).toBeNull();
    expect(validMint("0OIl" + USDC.slice(4))).toBeNull();
    expect(validMint("So11111111111111111111111111111111111111112")).toBeNull();
  });

  it("offers no links until a valid mint is configured", () => {
    const info = buyInfo({ ...base, TOKEN_MINT: undefined, MOONPAY_PUBLISHABLE_KEY: "pk_test_x" });
    expect(info.mint).toBeNull();
    expect(info.options.every((o) => o.href === null && o.status === "not_live")).toBe(true);
  });

  it("prefills the mint in swap links and keeps card off without a key", () => {
    const info = buyInfo({ ...base, TOKEN_MINT: USDC, MOONPAY_PUBLISHABLE_KEY: undefined });
    const byId = Object.fromEntries(info.options.map((o) => [o.id, o]));
    expect(byId.card.status).toBe("not_configured");
    expect(byId.card.href).toBeNull();
    expect(new URL(byId.jupiter.href!).searchParams.get("buy")).toBe(USDC);
    expect(new URL(byId.raydium.href!).searchParams.get("outputMint")).toBe(USDC);
    expect(info.explorerUrl).toBe(`https://solscan.io/token/${USDC}`);
  });

  it("builds a MoonPay link with only the publishable key", () => {
    const info = buyInfo({ ...base, TOKEN_MINT: USDC, MOONPAY_PUBLISHABLE_KEY: "pk_test_abc" });
    const card = info.options.find((o) => o.id === "card")!;
    const url = new URL(card.href!);
    expect(url.origin).toBe("https://buy.moonpay.com");
    expect(url.searchParams.get("apiKey")).toBe("pk_test_abc");
    expect(url.searchParams.get("currencyCode")).toBe("sol");
    expect(url.searchParams.has("walletAddress")).toBe(false);
  });
});
