"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TierArt } from "@/components/brand/TierArt";
import { Badge } from "@/components/ui/Badges";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/app/Page";
import { RedeemDialog, type RewardItem, type SharkAvailability } from "./RedeemDialog";
import { CARD_TIERS } from "@/config/tiers";
import { callApi } from "@/lib/client";
import { fmtGta, fmtSol, PLATFORM_LONG, REGION_LABEL, VERSION_LABEL } from "@/lib/format";

interface Props {
  items: RewardItem[];
  defaults: { platform: string; region: string };
  selectedTier: string | null;
  fulfillmentConnected: boolean;
  shark: SharkAvailability;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-11 w-full appearance-none rounded-xl border border-line-strong bg-surface px-3 pr-9 text-sm text-warm transition-colors hover:border-white/30 focus:border-coral"
        >
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </span>
    </label>
  );
}

export function RewardsBrowser({ items, defaults, selectedTier, fulfillmentConnected, shark }: Props) {
  const router = useRouter();
  const [platform, setPlatform] = useState(defaults.platform);
  const [region, setRegion] = useState(defaults.region);
  const [version, setVersion] = useState("gtao_gtav");
  const [category, setCategory] = useState("shark_card");
  const [active, setActive] = useState<RewardItem | null>(null);
  const [goal, setGoal] = useState(selectedTier);
  const [goalBusy, setGoalBusy] = useState<string | null>(null);

  const futureOnly = version === "gta_vi" || category === "gta_vi";
  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (!platform || i.platform === platform) &&
          (!region || i.region === region) &&
          i.gameVersion === version &&
          i.category === category,
      ),
    [items, platform, region, version, category],
  );

  const setAsGoal = async (tier: string) => {
    setGoalBusy(tier);
    try {
      await callApi("/api/account", { action: "preferences", tier });
      setGoal(tier);
      router.refresh();
    } finally {
      setGoalBusy(null);
    }
  };

  const reset = () => {
    setPlatform("");
    setRegion("");
    setVersion("gtao_gtav");
    setCategory("shark_card");
  };

  return (
    <>
      <div className="panel mb-6 grid grid-cols-2 gap-3 p-4 md:items-end xl:grid-cols-5">
        <Select label="Platform" value={platform} onChange={setPlatform} options={[["", "All platforms"], ["pc", "PC"], ["playstation", "PlayStation 5"], ["xbox", "Xbox Series X|S"]]} />
        <Select label="Game version" value={version} onChange={setVersion} options={[["gtao_gtav", "GTA Online (GTA V)"], ["gta_vi", "GTA VI"]]} />
        <Select label="Region" value={region} onChange={setRegion} options={[["", "All regions"], ["US", "United States"], ["UK", "United Kingdom"], ["EU", "European Union"]]} />
        <Select label="Category" value={category} onChange={setCategory} options={[["shark_card", "Shark Cards"], ["gta_vi", "GTA VI rewards"]]} />
        <div className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:justify-end">
          <span className="text-xs text-muted md:hidden" aria-live="polite">{filtered.length} items</span>
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset filters
          </Button>
        </div>
      </div>

      <div className="mb-4 hidden text-sm text-muted md:block" aria-live="polite">
        {futureOnly ? "0 items" : `${filtered.length} item${filtered.length === 1 ? "" : "s"}`}
      </div>

      {futureOnly ? (
        <EmptyState title="GTA VI rewards — not available">
          Current Shark Cards are for GTA Online associated with GTA V and are not offered for GTA VI. This category stays
          unavailable until compatibility and fulfilment are verified.
        </EmptyState>
      ) : !fulfillmentConnected || items.length === 0 ? (
        <>
          <p className="mb-4 rounded-2xl border border-line bg-white/[0.03] p-4 text-sm text-muted">
            Ordering opens once a licensed fulfilment provider is connected and its catalog is verified. Until then this is
            the price list; nothing can be bought yet. You can still pick a goal.
          </p>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {CARD_TIERS.map((t) => (
              <li key={t.tier} className="panel flex flex-col p-3">
                <TierArt tier={t.tier} className="aspect-[2/1]" label={t.name.replace(" Card", "")} />
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="font-semibold">{t.name}</h2>
                    <Badge>Not orderable yet</Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-muted">In-game amount</dt>
                    <dd className="num text-right">{fmtGta(t.gta)}</dd>
                    <dt className="text-muted">Price</dt>
                    <dd className="num text-right text-coral">{fmtSol(t.lamports)}</dd>
                    <dt className="text-muted">Version</dt>
                    <dd className="text-right">{VERSION_LABEL.gtao_gtav}</dd>
                  </dl>
                  <div className="mt-auto pt-5">
                    <Button
                      variant="secondary"
                      className="w-full"
                      disabled={goal === t.tier || goalBusy === t.tier}
                      onClick={() => setAsGoal(t.tier)}
                      aria-label={goal === t.tier ? `${t.name} is your goal` : `Set ${t.name} as your goal`}
                    >
                      {goal === t.tier ? "Your goal" : goalBusy === t.tier ? "Saving…" : "Set goal"}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nothing matches" action={<Button variant="secondary" onClick={reset}>Reset filters</Button>}>
          Try another platform or region.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((i) => {
            const oos = i.status !== "available" || i.stock === 0;
            return (
              <li key={i.id} className="panel flex flex-col p-3">
                <TierArt tier={i.tier} className="aspect-[2/1]" label={i.name.replace(" Card", "")} />
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="font-semibold">{i.name}</h2>
                    <div className="flex gap-1.5">
                      {oos ? <Badge tone="danger">Out of stock</Badge> : <Badge tone="mint">{i.stock === null ? "Available" : `${i.stock} in stock`}</Badge>}
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-muted">In-game amount</dt>
                    <dd className="num text-right">{fmtGta(i.gtaAmount)}</dd>
                    <dt className="text-muted">Price</dt>
                    <dd className="num text-right text-coral">{fmtSol(i.solPriceLamports)}</dd>
                    <dt className="text-muted">Retail price</dt>
                    <dd className="text-right text-muted">{i.retailReference ?? "Set by provider"}</dd>
                    <dt className="text-muted">Platform</dt>
                    <dd className="text-right">{PLATFORM_LONG[i.platform]}</dd>
                    <dt className="text-muted">Version</dt>
                    <dd className="text-right">{VERSION_LABEL[i.gameVersion]}</dd>
                    <dt className="text-muted">Region</dt>
                    <dd className="text-right">{REGION_LABEL[i.region]}</dd>
                  </dl>
                  <div className="mt-auto flex flex-wrap gap-2 pt-5">
                    <Button className="flex-1" disabled={oos} onClick={() => setActive(i)}>
                      {oos ? "Out of stock" : "Buy"}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={goal === i.tier || goalBusy === i.tier}
                      onClick={() => setAsGoal(i.tier)}
                      aria-label={goal === i.tier ? `${i.name} is your goal` : `Set ${i.name} as your goal`}
                    >
                      {goal === i.tier ? "Your goal" : goalBusy === i.tier ? "Saving…" : "Set goal"}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <RedeemDialog key={active?.id ?? "none"} item={active} userPlatform={defaults.platform} shark={shark} onClose={() => setActive(null)} />
    </>
  );
}
