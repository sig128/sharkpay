"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { clsx } from "clsx";
import { brand } from "@/config/brand";
import { CARD_TIERS } from "@/config/tiers";
import { fmtGta, fmtSol } from "@/lib/format";

interface StepsProps {
  payouts: { intervalMinutes: number; holderShareBps: number; minPayoutLamports: number };
}

const steps = [
  { key: "hold", n: "01", title: "Hold", short: `Keep ${brand.ticker} in any Solana wallet.` },
  { key: "receive", n: "02", title: "Receive", short: "Get SOL from creator fees, automatically." },
  { key: "redeem", n: "03", title: "Redeem", short: `Pay ${brand.ticker} for Shark Cards.` },
] as const;

export function Steps({ payouts }: StepsProps) {
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
              {s.key === "hold" && <HoldPanel payouts={payouts} />}
              {s.key === "receive" && <ReceivePanel payouts={payouts} />}
              {s.key === "redeem" && <RedeemPanel />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HoldPanel({ payouts }: StepsProps) {
  const bars = [0.2, 0.2, 0.55, 0.55, 0.55, 0.9, 0.9];
  return (
    <div className="flex h-full flex-col">
      <h3 className="display text-4xl md:text-5xl">Just hold</h3>
      <p className="mt-4 max-w-xl text-muted">
        Every wallet holding {brand.ticker} counts, whether or not it&apos;s linked here. Balances are read from Solana
        every few minutes, and each payout uses your <strong className="text-warm">average</strong> balance since the
        previous one, so buying a minute before a payout barely moves your share.
      </p>
      <div className="mt-auto pt-10">
        <div className="flex h-40 items-end gap-2" aria-hidden="true">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t-lg bg-gradient-to-t from-coral/30 to-pink/70" style={{ height: `${h * 100}%` }} />
          ))}
        </div>
        <div className="mt-3 flex justify-between font-mono text-[0.7rem] text-muted">
          <span>Last payout</span>
          <span>Average balance</span>
          <span>Next payout · {payouts.intervalMinutes} min</span>
        </div>
        <p className="mt-6 text-sm text-muted">
          Liquidity pools, the fee wallet and other program-owned accounts are excluded. Linking a wallet to your account
          only lets you see its rewards here.
        </p>
      </div>
    </div>
  );
}

function ReceivePanel({ payouts }: StepsProps) {
  return (
    <div className="flex h-full flex-col">
      <h3 className="display text-4xl md:text-5xl">SOL, sent automatically</h3>
      <p className="mt-4 max-w-xl text-muted">
        Every {payouts.intervalMinutes} minutes the server claims the pump.fun creator fees {brand.ticker} trading has
        earned. {payouts.holderShareBps / 100}% of that new SOL is split between holders by average balance; the rest funds
        operations. The amount depends on real trading and can be zero. There is no fixed rate or yield.
      </p>
      <div className="mt-auto pt-8">
        <div className="rounded-2xl border border-line bg-midnight/60 p-5 md:p-6">
          <div className="eyebrow">Each run</div>
          <div className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 font-mono text-sm md:text-base">
            <span className="text-muted">New creator fees</span>
            <span className="text-right text-warm">claimed on-chain</span>
            <span className="text-muted">× holder share</span>
            <span className="num text-right text-warm">{payouts.holderShareBps / 100}%</span>
            <span className="text-muted">× your share</span>
            <span className="text-right text-warm">of the average balance</span>
            <span className="text-muted">= sent to you</span>
            <span className="text-right text-xl text-mint">in SOL</span>
          </div>
          <p className="mt-4 text-xs text-muted">
            Wallets owed at least {fmtSol(payouts.minPayoutLamports)} are paid in that run. Smaller amounts keep adding up
            until they reach it.
          </p>
        </div>
      </div>
    </div>
  );
}

const REDEEM_TIERS = new Set(["red", "bull", "great_white"]);

function RedeemPanel() {
  const rows = CARD_TIERS.filter((t) => REDEEM_TIERS.has(t.tier)).map((t) => ({ name: t.name, gta: fmtGta(t.gta), cost: fmtSol(t.lamports) }));
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
      <p className="mt-3 text-xs text-muted">Fixed SOL prices. Cards can be ordered once a fulfilment partner is connected.</p>
    </div>
  );
}
