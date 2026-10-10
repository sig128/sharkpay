"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { TierArt } from "@/components/brand/TierArt";
import { Badge, PreviewBadge } from "@/components/ui/Badges";
import { ButtonLink } from "@/components/ui/Button";
import { fmtGta, fmtInt } from "@/lib/format";
import { useTilt } from "@/components/landing/fx/useTilt";
import { brand } from "@/config/brand";

export interface PreviewTier {
  tier: string;
  name: string;
  gta: number;
  cost: number;
  outOfStockOn: string[];
}

const platforms = [
  { id: "pc", label: "PC" },
  { id: "playstation", label: "PlayStation" },
  { id: "xbox", label: "Xbox" },
] as const;

export function CatalogPreview({ tiers }: { tiers: PreviewTier[] }) {
  const [platform, setPlatform] = useState<(typeof platforms)[number]["id"]>("playstation");
  const tilt = useTilt(9);
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
              Platform-specific Shark Cards for GTA Online. GTA$ amount, credit cost and stock are shown separately, and
              each code only works on the platform and region it was issued for.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end" data-reveal="right">
            <PreviewBadge label="Demo catalog" />
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
          {tiers.map((t) => {
            const oos = t.outOfStockOn.includes(platform);
            return (
              <li key={t.tier} className="flex">
                <div
                  {...tilt}
                  className="tilt panel group relative flex w-full flex-col p-3 transition-[border-color] duration-200 hover:border-line-strong"
                >
                <span aria-hidden="true" className="tilt-holo z-10" />
                <TierArt tier={t.tier} className="aspect-[1.6/1]" label={t.name.replace(" Card", "")} />
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{t.name}</h3>
                    {oos ? <Badge tone="danger">Out of stock</Badge> : <Badge tone="mint">In stock</Badge>}
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                    <dt className="text-muted">In-game</dt>
                    <dd className="num text-right">{fmtGta(t.gta)}</dd>
                    <dt className="text-muted">Credit cost</dt>
                    <dd className="num text-right text-coral">{fmtInt(t.cost)} CR</dd>
                    <dt className="text-muted">Version</dt>
                    <dd className="text-right">GTA Online (GTA V)</dd>
                  </dl>
                </div>
                </div>
              </li>
            );
          })}
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
          <ul className="flex flex-wrap gap-2" aria-label="Payment options">
            {[
              [brand.ticker, null],
              ["Reward credits", null],
              ["Apple Pay", "Coming soon"],
              ["Google Pay", "Coming soon"],
              ["Visa / Mastercard", "Coming soon"],
            ].map(([label, note]) => (
              <li
                key={label}
                className={clsx(
                  "inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm",
                  note ? "border-line text-muted" : "border-coral/40 bg-coral/[0.08] font-semibold text-warm",
                )}
              >
                {label}
                {note && <span className="font-mono text-[0.6rem] uppercase tracking-wider text-butter">{note}</span>}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-6 text-xs text-muted">
          Credit costs are illustrative, not real prices. Retail prices are set by the fulfilment provider and are separate
          from GTA$ amounts and credit costs.
        </p>
      </div>
    </section>
  );
}
