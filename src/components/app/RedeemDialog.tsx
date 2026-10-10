"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { clsx } from "clsx";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badges";
import { OrderStatus } from "./OrderStatus";
import { SharkPay } from "./SharkPay";
import { brand } from "@/config/brand";
import { ApiError, callApi, newIdempotencyKey } from "@/lib/client";
import { fmtGta, fmtInt, PLATFORM_LONG, REGION_LABEL, VERSION_LABEL } from "@/lib/format";
import type { OrderView } from "@/lib/server/orders/orders";

export interface RewardItem {
  id: string;
  sku: string;
  name: string;
  tier: string;
  category: string;
  gtaAmount: number;
  creditCost: number;
  retailReference: string | null;
  platform: string;
  gameVersion: string;
  region: string;
  stock: number | null;
  status: string;
  isDemo: boolean;
}

interface Quote {
  quoteId: string;
  creditCost: number;
  expiresAt: number;
  available: number;
  sufficient: boolean;
}

type Step = "details" | "review" | "status" | "shark";
type PayMethod = "credits" | "shark";

export interface SharkAvailability {
  enabled: boolean;
  reason: string | null;
}

const COMING_SOON = ["Apple Pay", "Google Pay", "Visa / Mastercard"];

const SCENARIOS = [
  ["instant", "Instant delivery"],
  ["pending", "Pending, then delivered (~8s)"],
  ["fail", "Delivery fails → credits returned"],
  ["uncertain", "Provider timeout → reconcile"],
] as const;

const STEPS: Array<[Step, string]> = [
  ["details", "Confirm details"],
  ["review", "Review cost"],
  ["status", "Order status"],
];

export function RedeemDialog({
  item,
  available,
  demo,
  userPlatform,
  shark,
  onClose,
}: {
  item: RewardItem | null;
  available: number;
  demo: boolean;
  userPlatform: string;
  shark: SharkAvailability;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [confirmed, setConfirmed] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [scenario, setScenario] = useState<string>("instant");
  const [order, setOrder] = useState<OrderView | null>(null);
  const [method, setMethod] = useState<PayMethod>("credits");
  const idemKey = useRef<string | null>(null);

  useEffect(() => {
    if (step !== "review" || !quote) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step, quote]);

  if (!item) return null;
  const expired = quote ? now >= quote.expiresAt : false;
  const secondsLeft = quote ? Math.max(0, Math.ceil((quote.expiresAt - now) / 1000)) : 0;
  const mismatch = userPlatform && userPlatform !== item.platform;

  const getQuote = async () => {
    setBusy(true);
    setError(null);
    try {
      const q = await callApi<Quote>("/api/redemptions", { action: "quote", itemId: item.id });
      setQuote(q);
      setNow(Date.now());
      idemKey.current = newIdempotencyKey();
      setStep("review");
    } catch (e) {
      setError(e instanceof ApiError ? { code: e.code, message: e.message } : { code: "error", message: "Something went wrong" });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!quote || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { order } = await callApi<{ order: OrderView }>("/api/redemptions", {
        action: "confirm",
        quoteId: quote.quoteId,
        idempotencyKey: idemKey.current,
        demoScenario: demo ? scenario : undefined,
      });
      setOrder(order);
      setStep("status");
      router.refresh();
    } catch (e) {
      const err = e instanceof ApiError ? { code: e.code, message: e.message } : { code: "error", message: "Something went wrong" };
      setError(err);
      if (err.code === "quote_expired") setQuote((q) => (q ? { ...q, expiresAt: 0 } : q));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    onClose();
    router.refresh();
  };

  const balance = quote?.available ?? available;
  const cost = quote?.creditCost ?? item.creditCost;
  const sufficient = balance >= cost;

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
              <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Redemption steps">
                {STEPS.map(([s, label], i) => (
                  <li key={s} aria-current={step === s ? "step" : undefined} className={clsx("font-mono uppercase tracking-wider", step === s ? "text-coral" : "text-muted")}>
                    {i + 1}. {label}
                  </li>
                ))}
              </ol>
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
                    ["Credit cost", `${fmtInt(item.creditCost)} credits`],
                    ["SKU", item.sku],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-line bg-midnight/40 p-3">
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd className={clsx("mt-0.5 break-words", (k === "SKU" || k === "Credit cost" || k === "In-game amount") && "num")}>{v}</dd>
                    </div>
                  ))}
                </dl>
                {mismatch && (
                  <p className="rounded-xl border border-butter/30 bg-butter/[0.07] p-3 text-sm text-butter">
                    Heads up: your reward platform is {PLATFORM_LONG[userPlatform]}, but this card is for {PLATFORM_LONG[item.platform]}.
                    Codes only work on the platform they were issued for.
                  </p>
                )}
                {item.isDemo && <Badge tone="butter">Demo catalog item · illustrative cost</Badge>}
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-sm">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#FF4EAE]" />
                  <span>
                    I confirm this is for <strong>{PLATFORM_LONG[item.platform]}</strong>, <strong>{VERSION_LABEL[item.gameVersion]}</strong>, in{" "}
                    <strong>{REGION_LABEL[item.region]}</strong>, and that my game account matches.
                  </span>
                </label>
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-semibold">Pay with</legend>
                  {(
                    [
                      ["credits", "Reward credits", `${fmtInt(item.creditCost)} credits`, true, null],
                      ["shark", brand.ticker, "Live price, paid from your wallet", shark.enabled, shark.reason],
                    ] as const
                  ).map(([value, label, hint, enabled, reason]) => (
                    <label
                      key={value}
                      className={clsx(
                        "flex min-h-14 items-center gap-3 rounded-xl border p-3 text-sm",
                        enabled ? "cursor-pointer border-line hover:border-line-strong" : "cursor-not-allowed border-line opacity-60",
                        method === value && enabled && "border-coral/60 bg-coral/[0.06]",
                      )}
                    >
                      <input
                        type="radio"
                        name="pay-method"
                        value={value}
                        checked={method === value}
                        disabled={!enabled}
                        onChange={() => setMethod(value)}
                        className="h-4 w-4 shrink-0 accent-[#FF4EAE]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{label}</span>
                        <span className="block text-xs text-muted">{enabled ? hint : reason}</span>
                      </span>
                    </label>
                  ))}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {COMING_SOON.map((m) => (
                      <span key={m} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-muted">
                        {m}
                        <span className="font-mono text-[0.6rem] uppercase tracking-wider text-butter">Coming soon</span>
                      </span>
                    ))}
                  </div>
                </fieldset>
                {error && <ErrorNote error={error} />}
                <Button
                  className="w-full"
                  size="lg"
                  disabled={!confirmed || busy}
                  onClick={method === "shark" ? () => setStep("shark") : getQuote}
                >
                  {busy ? "Getting the latest cost…" : method === "shark" ? `Continue to ${brand.ticker} payment` : "Continue"}
                </Button>
              </div>
            )}

            {step === "review" && quote && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-line bg-midnight/40 p-5">
                  <div className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
                    <span className="text-muted">Available credits</span>
                    <span className="num text-right">{fmtInt(balance)}</span>
                    <span className="text-muted">Credit cost</span>
                    <span className="num text-right">−{fmtInt(cost)}</span>
                    <span className="border-t border-line pt-2 font-semibold">After redemption</span>
                    <span className={clsx("num border-t border-line pt-2 text-right font-semibold", sufficient ? "text-mint" : "text-[#ffb3b3]")}>
                      {sufficient ? fmtInt(balance - cost) : "Not enough"}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    You receive {fmtGta(item.gtaAmount)} in-game value as a code. Credits aren&apos;t GTA$ and the retail price is set separately by the provider.
                  </p>
                </div>

                <div className="flex items-center justify-between text-sm" aria-live="polite">
                  <span className="text-muted">Quote</span>
                  {expired ? <Badge tone="danger">Expired</Badge> : <span className="num text-muted">Valid for {secondsLeft}s</span>}
                </div>

                {!sufficient && (
                  <p className="rounded-xl border border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.07] p-3 text-sm text-[#ffb3b3]">
                    Insufficient balance. You need {fmtInt(cost - balance)} more credits for this reward. Nothing has been reserved.
                  </p>
                )}

                {demo && sufficient && !expired && (
                  <fieldset className="rounded-xl border border-butter/25 p-3">
                    <legend className="px-1 text-xs font-semibold text-butter">Demo fulfilment outcome</legend>
                    <div className="grid gap-1">
                      {SCENARIOS.map(([v, label]) => (
                        <label key={v} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-white/[0.03]">
                          <input type="radio" name="scenario" value={v} checked={scenario === v} onChange={() => setScenario(v)} className="h-4 w-4 accent-[#FFE5A5]" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                {error && error.code !== "quote_expired" && <ErrorNote error={error} />}

                {expired ? (
                  <Button className="w-full" size="lg" variant="secondary" onClick={getQuote} disabled={busy}>
                    {busy ? "Refreshing…" : "Quote expired · get a new quote"}
                  </Button>
                ) : (
                  <Button className="w-full" size="lg" onClick={confirm} disabled={!sufficient || busy}>
                    {busy ? "Confirming…" : `Confirm redemption · ${fmtInt(cost)} credits`}
                  </Button>
                )}
                <Button className="w-full" variant="ghost" onClick={() => setStep("details")} disabled={busy}>
                  Back
                </Button>
              </div>
            )}

            {step === "status" && order && <OrderStatus initial={order} compact onChange={() => router.refresh()} />}
            {step === "shark" && <SharkPay itemId={item.id} onBack={() => setStep("details")} onOrder={() => router.refresh()} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ErrorNote({ error }: { error: { code: string; message: string } }) {
  return (
    <p role="alert" className="rounded-xl border border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.07] p-3 text-sm text-[#ffb3b3]">
      {error.code === "insufficient_funds" ? "Insufficient balance. Nothing was reserved." : error.message}
    </p>
  );
}
