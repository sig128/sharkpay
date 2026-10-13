"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { clsx } from "clsx";
import { Button } from "@/components/ui/Button";
import { SharkPay } from "./SharkPay";
import { brand } from "@/config/brand";
import { fmtGta, fmtSol, PLATFORM_LONG, REGION_LABEL, VERSION_LABEL } from "@/lib/format";
import { COMING_SOON_RAILS } from "@/components/brand/PaymentLogos";

export interface RewardItem {
  id: string;
  sku: string;
  name: string;
  tier: string;
  category: string;
  gtaAmount: number;
  solPriceLamports: number;
  retailReference: string | null;
  platform: string;
  gameVersion: string;
  region: string;
  stock: number | null;
  status: string;
}

type Step = "details" | "shark";

export interface SharkAvailability {
  enabled: boolean;
  reason: string | null;
}

export function RedeemDialog({
  item,
  userPlatform,
  shark,
  onClose,
}: {
  item: RewardItem | null;
  userPlatform: string;
  shark: SharkAvailability;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [confirmed, setConfirmed] = useState(false);
  if (!item) return null;
  const mismatch = userPlatform && userPlatform !== item.platform;

  const close = () => {
    onClose();
    router.refresh();
  };

  return (
    <Dialog.Root open={Boolean(item)} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-[fadein_200ms_ease-out]" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border border-line bg-surface shadow-2xl outline-none md:inset-auto md:left-1/2 md:top-1/2 md:w-[min(560px,calc(100vw-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl"
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line p-5 md:p-6">
            <div className="min-w-0">
              <Dialog.Title className="display text-3xl">{item.name}</Dialog.Title>
              <p className="mt-2 text-sm text-muted">
                {fmtSol(item.solPriceLamports)}, paid in {brand.ticker}
              </p>
            </div>
            <Dialog.Close className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/5 hover:text-warm" aria-label="Close">
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </Dialog.Close>
          </div>

          <div className="overflow-y-auto p-5 md:p-6">
            {step === "details" && (
              <div className="space-y-5">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["In-game amount", fmtGta(item.gtaAmount)],
                    ["Platform", PLATFORM_LONG[item.platform]],
                    ["Game version", VERSION_LABEL[item.gameVersion]],
                    ["Region", REGION_LABEL[item.region]],
                    ["Price", fmtSol(item.solPriceLamports)],
                    ["SKU", item.sku],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-line bg-midnight/40 p-3">
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd className={clsx("mt-0.5 break-words", (k === "SKU" || k === "Price" || k === "In-game amount") && "num")}>{v}</dd>
                    </div>
                  ))}
                </dl>
                {mismatch && (
                  <p className="rounded-xl border border-butter/30 bg-butter/[0.07] p-3 text-sm text-butter">
                    Heads up: your reward platform is {PLATFORM_LONG[userPlatform]}, but this card is for {PLATFORM_LONG[item.platform]}.
                    Codes only work on the platform they were issued for.
                  </p>
                )}
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-sm">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#FF4EAE]" />
                  <span>
                    I confirm this is for <strong>{PLATFORM_LONG[item.platform]}</strong>, <strong>{VERSION_LABEL[item.gameVersion]}</strong>, in{" "}
                    <strong>{REGION_LABEL[item.region]}</strong>, and that my game account matches.
                  </span>
                </label>
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-semibold">Pay with</legend>
                  <label className={clsx("flex min-h-14 items-center gap-3 rounded-xl border p-3 text-sm", shark.enabled ? "border-coral/60 bg-coral/[0.06]" : "border-line opacity-60")}>
                    <input type="radio" name="pay-method" checked readOnly className="h-4 w-4 shrink-0 accent-[#FF4EAE]" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{brand.ticker}</span>
                      <span className="block text-xs text-muted">
                        {shark.enabled ? `Fixed ${fmtSol(item.solPriceLamports)}, converted to ${brand.ticker} at checkout` : shark.reason}
                      </span>
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {COMING_SOON_RAILS.map(({ name, Logo }) => (
                      <span key={name} className="inline-flex min-h-8 items-center gap-2 rounded-full border border-line px-3 text-warm/80">
                        <Logo />
                        <span className="sr-only">{name},</span>
                        <span className="font-mono text-[0.55rem] uppercase tracking-wider text-butter">Coming soon</span>
                      </span>
                    ))}
                  </div>
                </fieldset>
                <Button className="w-full" size="lg" disabled={!confirmed || !shark.enabled} onClick={() => setStep("shark")}>
                  Continue to {brand.ticker} payment
                </Button>
              </div>
            )}

            {step === "shark" && <SharkPay itemId={item.id} onBack={() => setStep("details")} onOrder={() => router.refresh()} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
