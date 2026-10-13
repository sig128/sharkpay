"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { TierArt } from "@/components/brand/TierArt";
import { Badge } from "@/components/ui/Badges";
import { ButtonLink } from "@/components/ui/Button";
import { fmtGta, fmtSol } from "@/lib/format";
import { useTilt } from "@/components/landing/fx/useTilt";
import { brand } from "@/config/brand";
import { COMING_SOON_RAILS } from "@/components/brand/PaymentLogos";

export interface PriceListTier {
  tier: string;
  name: string;
  gta: number;
  cost: number;
}

const platforms = [
  { id: "pc", label: "PC" },
  { id: "playstation", label: "PlayStation" },
  { id: "xbox", label: "Xbox" },
] as const;

export function CardCatalog({ tiers }: { tiers: PriceListTier[] }) {
  const [platform, setPlatform] = useState<(typeof platforms)[number]["id"]>("playstation");
  const tilt = useTilt(9);
  const platformLabel = platforms.find((p) => p.id === platform)!.label;
  return (
    <section id="rewards" className="relative scroll-mt-20 py-24 md:py-32" aria-labelledby="rewards-title">
      <div className="container-site">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div data-reveal>
            <p className="eyebrow">Reward catalog</p>
            <h2 id="rewards-title" className="display mt-4 text-[clamp(3rem,7vw,5.5rem)]">
              Pick your <span className="text-sunset-flow-soft">Shark Card.</span>
            </h2>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Platform-specific Shark Cards for GTA Online. GTA$ amount, SOL price and stock are shown separately, and
              each code only works on the platform and region it was issued for.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end" data-reveal="right">
            <div role="radiogroup" aria-label="Platform" className="inline-flex rounded-full border border-line bg-white/[0.03] p-1">
              {platforms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={platform === p.id}
                  onClick={() => setPlatform(p.id)}
                  className={clsx(
                    "min-h-11 rounded-full px-5 text-sm font-semibold transition-colors duration-200",
                    platform === p.id ? "bg-warm text-ink" : "text-muted hover:text-warm",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-reveal-stagger="110">
          {tiers.map((t) => (
            <li key={t.tier} className="flex">
              <div
                {...tilt}
                className="tilt panel group relative flex w-full flex-col p-3 transition-[border-color] duration-200 hover:border-line-strong"
              >
                <span aria-hidden="true" className="tilt-holo z-10" />
                <TierArt tier={t.tier} className="aspect-[1.6/1]" label={t.name.replace(" Card", "")} />
                <div className="flex flex-1 flex-col p-3">
                  <h3 className="font-semibold">{t.name}</h3>
                  <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                    <dt className="text-muted">In-game</dt>
                    <dd className="num text-right">{fmtGta(t.gta)}</dd>
                    <dt className="text-muted">Price</dt>
                    <dd className="num text-right text-coral">{fmtSol(t.cost)}</dd>
                    <dt className="text-muted">Platform</dt>
                    <dd className="text-right">{platformLabel}</dd>
                    <dt className="text-muted">Version</dt>
                    <dd className="text-right">GTA Online (GTA V)</dd>
                  </dl>
                </div>
              </div>
            </li>
          ))}
          <li className="panel flex flex-col justify-between border-dashed p-6 sm:col-span-2 lg:col-span-2">
            <div>
              <Badge>Not available</Badge>
              <h3 className="display mt-4 text-4xl">GTA VI rewards</h3>
              <p className="mt-3 max-w-md text-sm text-muted">
                A future category. Current Shark Cards are for GTA Online (GTA V) and aren&apos;t offered for GTA VI. This
                stays unavailable until compatibility and fulfilment are verified.
              </p>
            </div>
            <div className="mt-6">
              <ButtonLink href="/login" variant="secondary">
                Browse the full catalog
              </ButtonLink>
            </div>
          </li>
        </ul>
        <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-line bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between" data-reveal>
          <span className="eyebrow">Pay with</span>
          <ul className="flex flex-wrap items-center gap-2" aria-label="Payment options">
            <li className="inline-flex min-h-10 items-center rounded-full border border-coral/40 bg-coral/[0.08] px-4 text-sm font-semibold text-warm">
              {brand.ticker}
            </li>
            {COMING_SOON_RAILS.map(({ name, Logo }) => (
              <li key={name} className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-line px-3.5 text-warm/85">
                <Logo />
                <span className="sr-only">{name},</span>
                <span className="font-mono text-[0.55rem] uppercase tracking-wider text-butter">Coming soon</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-6 text-xs text-muted">
          Fixed SOL prices, paid in {brand.ticker} at checkout. Ordering opens once a fulfilment partner is connected;
          live stock for your platform and region is shown in the app. Retail cost to us is separate from the GTA$ printed
          on the card.
        </p>
      </div>
    </section>
  );
}
