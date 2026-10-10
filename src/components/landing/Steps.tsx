"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { clsx } from "clsx";
import { brand } from "@/config/brand";

interface StepsProps {
  sample: { budget: number; share: number; allocation: number; holderShareBps: number; periodDays: number };
}

const steps = [
  { key: "hold", n: "01", title: "Hold", short: `Keep ${brand.ticker} in a wallet you link.` },
  { key: "receive", n: "02", title: "Receive", short: "Get a share of funded rewards." },
  { key: "redeem", n: "03", title: "Redeem", short: `Pay ${brand.ticker} for Shark Cards.` },
] as const;

export function Steps({ sample }: StepsProps) {
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKey = (e: KeyboardEvent) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const i = e.key === "Home" ? 0 : steps.length - 1;
      setActive(i);
      tabs.current[i]?.focus();
      return;
    }
    if (!dir) return;
    e.preventDefault();
    const i = (active + dir + steps.length) % steps.length;
    setActive(i);
    tabs.current[i]?.focus();
  };

  return (
    <section id="how-it-works" className="relative scroll-mt-20 py-24 md:py-32" aria-labelledby="how-title">
      <div className="container-site grid grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div data-reveal="left">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title" className="display mt-4 text-[clamp(3rem,7vw,5.5rem)]">
              Three moves.
              <br />
              <span className="text-sunset-flow-soft">No guesswork.</span>
            </h2>
            <p className="mt-6 max-w-md text-lg text-muted">{brand.tagline}</p>
          </div>

          <div role="tablist" aria-label="How it works" aria-orientation="vertical" className="mt-10 flex flex-col gap-2" onKeyDown={onKey} data-reveal-stagger="120">
            {steps.map((s, i) => (
              <button
                key={s.key}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                role="tab"
                id={`step-tab-${s.key}`}
                aria-selected={active === i}
                aria-controls={`step-panel-${s.key}`}
                tabIndex={active === i ? 0 : -1}
                onClick={() => setActive(i)}
                className={clsx(
                  "group flex min-h-16 items-center gap-5 rounded-2xl border px-5 py-4 text-left transition-[background,border-color] duration-200",
                  active === i ? "border-line-strong bg-white/[0.05]" : "border-transparent hover:bg-white/[0.03]",
                )}
              >
                <span className={clsx("num text-sm", active === i ? "text-coral" : "text-muted")}>{s.n}</span>
                <span className="flex-1">
                  <span className="display block text-3xl">{s.title}</span>
                  <span className="mt-1 block text-sm text-muted">{s.short}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={clsx("h-2 w-2 rounded-full transition-colors duration-200", active === i ? "bg-pink shadow-[0_0_14px_2px_rgb(255_78_174/0.6)]" : "bg-white/15")}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7" data-reveal="right">
          {steps.map((s, i) => (
            <div
              key={s.key}
              role="tabpanel"
              id={`step-panel-${s.key}`}
              aria-labelledby={`step-tab-${s.key}`}
              hidden={active !== i}
              tabIndex={0}
              className="panel noise relative h-full min-h-[440px] overflow-hidden p-6 md:p-10"
            >
              {s.key === "hold" && <HoldPanel />}
              {s.key === "receive" && <ReceivePanel sample={sample} />}
              {s.key === "redeem" && <RedeemPanel />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HoldPanel() {
  const bars = [0.2, 0.2, 0.55, 0.55, 0.55, 0.9, 0.9];
  return (
    <div className="flex h-full flex-col">
      <h3 className="display text-4xl md:text-5xl">Hold through the period</h3>
      <p className="mt-4 max-w-xl text-muted">
        Link a Solana wallet by signing a one-time message. That proves ownership; it never approves a transaction or
        token spending. Rewards use your <strong className="text-warm">time-weighted</strong> eligible balance across the
        whole period, so buying a minute before the cut-off barely moves your share.
      </p>
      <div className="mt-auto pt-10">
        <div className="flex h-40 items-end gap-2" aria-hidden="true">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t-lg bg-gradient-to-t from-coral/30 to-pink/70" style={{ height: `${h * 100}%` }} />
          ))}
        </div>
        <div className="mt-3 flex justify-between font-mono text-[0.7rem] text-muted">
          <span>Period start</span>
          <span>Balance × time held</span>
          <span>Period end</span>
        </div>
        <p className="mt-6 text-sm text-muted">
          Liquidity pools, exchange wallets, treasury and fee-authority accounts are excluded and never treated as members.
        </p>
      </div>
    </div>
  );
}

function ReceivePanel({ sample }: StepsProps) {
  return (
    <div className="flex h-full flex-col">
      <h3 className="display text-4xl md:text-5xl">Receive a funded share</h3>
      <p className="mt-4 max-w-xl text-muted">
        Rewards come only from fees that were actually collected <em>and</em> settled. In the demo configuration{" "}
        {sample.holderShareBps / 100}% of net settled proceeds funds the holder pool. The amount changes every period
        and can be zero. There is no fixed rate or yield.
      </p>
      <div className="mt-auto pt-8">
        <div className="rounded-2xl border border-line bg-midnight/60 p-5 md:p-6">
          <div className="eyebrow">Your allocation</div>
          <div className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 font-mono text-sm md:text-base">
            <span className="text-muted">Funded budget</span>
            <span className="num text-right text-warm">{sample.budget.toLocaleString("en-US")} CR</span>
            <span className="text-muted">× your weight</span>
            <span className="num text-right text-warm">{sample.share.toFixed(4)}%</span>
            <span className="text-muted">= allocation</span>
            <span className="num text-right text-xl text-mint">{sample.allocation.toLocaleString("en-US")} CR</span>
          </div>
          <p className="mt-4 text-xs text-muted">
            Rounded down. Leftover fractions and unclaimed shares carry forward to the next period. Sample figures.
          </p>
        </div>
      </div>
    </div>
  );
}

function RedeemPanel() {
  const rows = [
    { name: "Red Shark Card", gta: "GTA$100,000", cost: "0.02 SOL" },
    { name: "Bull Shark Card", gta: "GTA$600,000", cost: "0.07 SOL" },
    { name: "Great White Shark Card", gta: "GTA$1,250,000", cost: "0.14 SOL" },
  ];
  return (
    <div className="flex h-full flex-col">
      <h3 className="display text-4xl md:text-5xl">Redeem for game credit</h3>
      <p className="mt-4 max-w-xl text-muted">
        Choose a Shark Card for your platform and region, pay the fixed SOL price in $SHARK, and receive a code with the provider&apos;s
        redemption instructions. We never ask for your Rockstar, Xbox or PlayStation password.
      </p>
      <ul className="mt-auto space-y-2 pt-8">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-4 rounded-xl border border-line bg-midnight/50 px-4 py-3">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{r.name}</span>
              <span className="num text-xs text-muted">{r.gta}</span>
            </span>
            <span className="num shrink-0 text-sm text-coral">{r.cost}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">Demo catalog. SOL prices are placeholders for the operator to set.</p>
    </div>
  );
}
