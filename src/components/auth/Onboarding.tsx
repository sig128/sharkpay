"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Button } from "@/components/ui/Button";
import { WalletLinker } from "@/components/app/WalletLinker";
import { ApiError, callApi } from "@/lib/client";
import { fmtGta, PLATFORM_LABEL, REGION_LABEL } from "@/lib/format";

function Choice({ name, value, checked, onChange, label, hint }: { name: string; value: string; checked: boolean; onChange: (v: string) => void; label: string; hint?: string }) {
  return (
    <label
      className={clsx(
        "flex min-h-14 cursor-pointer flex-col justify-center rounded-2xl border px-4 py-3 transition-colors duration-200 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-coral",
        checked ? "border-coral bg-coral/10" : "border-line hover:border-line-strong",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} className="sr-only" />
      <span className="font-semibold">{label}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Onboarding({
  initial,
  tiers,
  wallets,
  canLinkWallet,
}: {
  initial: { platform: string | null; region: string | null; tier: string | null };
  tiers: Array<{ id: string; name: string; gta: number }>;
  wallets: Array<{ id: string; address: string; verifiedAt: number }>;
  canLinkWallet: boolean;
}) {
  const router = useRouter();
  const [platform, setPlatform] = useState(initial.platform ?? "");
  const [region, setRegion] = useState(initial.region ?? "");
  const [tier, setTier] = useState(initial.tier ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(platform && region);

  return (
    <form
      className="mt-10 space-y-10"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        setBusy(true);
        setError(null);
        try {
          await callApi("/api/account", { action: "preferences", platform, region, tier: tier || undefined, completeOnboarding: true });
          router.push("/app");
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Couldn't save your choices");
          setBusy(false);
        }
      }}
    >
      <fieldset>
        <legend className="mb-1 text-lg font-bold">1 · Where do you play?</legend>
        <p className="mb-4 text-sm text-muted">Shark Card codes only work on the platform they&apos;re bought for.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {["pc", "playstation", "xbox"].map((p) => (
            <Choice key={p} name="platform" value={p} checked={platform === p} onChange={setPlatform} label={PLATFORM_LABEL[p]} hint={p === "playstation" ? "Selected, not verified" : undefined} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-lg font-bold">2 · Store region</legend>
        <p className="mb-4 text-sm text-muted">Codes are region-locked to your platform store account.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {["US", "UK", "EU"].map((r) => (
            <Choice key={r} name="region" value={r} checked={region === r} onChange={setRegion} label={REGION_LABEL[r]} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-lg font-bold">
          3 · Pick a goal <span className="text-sm font-normal text-muted">(optional)</span>
        </legend>
        <p className="mb-4 text-sm text-muted">We&apos;ll show your progress toward it. Credit prices appear once live rewards are available.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tiers.map((t) => (
            <Choice key={t.id} name="tier" value={t.id} checked={tier === t.id} onChange={setTier} label={t.name} hint={fmtGta(t.gta)} />
          ))}
        </div>
      </fieldset>

      <section aria-labelledby="ob-wallet" className="panel p-5">
        <h2 id="ob-wallet" className="mb-1 text-lg font-bold">
          Link a Solana wallet <span className="text-sm font-normal text-muted">(optional)</span>
        </h2>
        <p className="mb-4 text-sm text-muted">Rewards are based on your time-weighted balance in linked wallets. You can do this later from Connected accounts.</p>
        <WalletLinker wallets={wallets} canChange={canLinkWallet} />
      </section>

      {error && <p role="alert" className="text-sm text-[#ffb3b3]">{error}</p>}
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={!ready || busy}>
        {busy ? "Saving…" : "Finish setup"}
      </Button>
      {!ready && <p className="text-xs text-muted">Choose a platform and region to continue.</p>}
    </form>
  );
}
