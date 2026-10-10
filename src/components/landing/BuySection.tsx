"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { brand } from "@/config/brand";
import { Badge } from "@/components/ui/Badges";
import { useTilt } from "@/components/landing/fx/useTilt";
import type { BuyInfo, BuyOption } from "@/lib/server/services/buy";

const STEP: Record<BuyOption["id"], string> = { card: "Step 1 · Get SOL", jupiter: "Step 2 · Swap", raydium: "Step 2 · Swap" };

function statusText(s: BuyOption["status"]) {
  return s === "not_live" ? "Not live yet" : s === "not_configured" ? "Coming soon" : null;
}

function OptionIcon({ id }: { id: BuyOption["id"] }) {
  if (id === "card")
    return (
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
        <rect x="2.5" y="5" width="19" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M2.5 10h19M6.5 15h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyMint({ mint }: { mint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(mint);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-warm px-5 text-sm font-semibold text-ink transition-transform duration-200 hover:-translate-y-0.5"
    >
      <span aria-live="polite">{copied ? "Copied" : "Copy address"}</span>
    </button>
  );
}

export function BuySection({ info }: { info: BuyInfo }) {
  const tilt = useTilt(7);
  return (
    <section id="buy" className="relative scroll-mt-20 py-24 md:py-32" aria-labelledby="buy-title">
      <div className="container-site">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7" data-reveal>
            <p className="eyebrow">
              {brand.tokenName} · {brand.ticker}
            </p>
            <h2 id="buy-title" className="display mt-4 text-[clamp(3rem,7vw,5.5rem)]">
              Get <span className="text-sunset-flow-soft">{brand.ticker}.</span>
            </h2>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Holding {brand.ticker} in a linked wallet is what earns SOL rewards. You buy it from third parties into your
              own wallet. {brand.name} never sells you tokens, never takes your card details and never holds your money.
            </p>
          </div>

          <div className="lg:col-span-5" data-reveal="right">
            <div className="panel noise relative overflow-hidden p-5">
              <div className="eyebrow">Official contract address</div>
              {info.mint ? (
                <>
                  <p className="mt-3 break-all font-mono text-sm text-warm">{info.mint}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <CopyMint mint={info.mint} />
                    {info.explorerUrl && (
                      <a
                        href={info.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center text-sm text-muted underline decoration-white/20 underline-offset-4 hover:text-warm"
                      >
                        Verify on Solscan
                      </a>
                    )}
                  </div>
                  <p className="mt-4 text-xs text-muted">
                    Check every character before you swap. Tokens with the same name or ticker and a different address are not ours.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 font-semibold text-warm">Not published yet</p>
                  <p className="mt-2 text-sm text-muted">
                    {brand.ticker} isn&apos;t live. Any token calling itself {brand.tokenName} or {brand.ticker} right now is not ours.
                    The address will be posted here and on X first.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <ul className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3" data-reveal-stagger="120">
          {info.options.map((o) => {
            const pending = statusText(o.status);
            const body = (
              <>
                <span aria-hidden="true" className="tilt-holo z-10" />
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-12 place-items-center rounded-2xl border border-line bg-white/[0.04] text-coral">
                    <OptionIcon id={o.id} />
                  </span>
                  {pending ? <Badge>{pending}</Badge> : <Badge tone="mint">Available</Badge>}
                </div>
                <div className="mt-8 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">{STEP[o.id]}</div>
                <h3 className="display mt-2 text-3xl">{o.name}</h3>
                <p className="mt-2 text-sm text-muted">{o.detail}</p>
                <span className={clsx("mt-auto inline-flex items-center gap-2 pt-8 text-sm font-semibold", o.href ? "text-warm" : "text-muted")}>
                  {o.href ? "Open in a new tab" : "Unavailable"}
                  {o.href && (
                    <svg viewBox="0 0 16 16" className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true">
                      <path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </>
            );
            const cls = "tilt panel group relative flex h-full min-h-[300px] w-full flex-col p-6 transition-[border-color] duration-200";
            return (
              <li key={o.id} className="flex">
                {o.href ? (
                  <a {...tilt} href={o.href} target="_blank" rel="noopener noreferrer" className={clsx(cls, "hover:border-line-strong")}>
                    {body}
                  </a>
                ) : (
                  <div className={clsx(cls, "opacity-75")} aria-disabled="true">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted">
          Providers set their own fees, identity checks and country availability. Swaps can have price impact and slippage, and
          token transfers carry the disclosed transfer fee. Token prices can fall as well as rise and you can lose what you put in.
          Holding {brand.ticker} doesn&apos;t guarantee any reward. This is not investment advice.
        </p>
      </div>
    </section>
  );
}
