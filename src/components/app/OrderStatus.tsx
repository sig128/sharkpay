"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import type { OrderView } from "@/lib/server/orders/orders";
import { Badge } from "@/components/ui/Badges";
import { Button, buttonClass } from "@/components/ui/Button";
import { callApi } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import { brand } from "@/config/brand";

export const STATUS_META: Record<string, { label: string; tone: "mint" | "butter" | "danger" | "neutral" | "pink" }> = {
  reserved: { label: "Payment confirmed", tone: "butter" },
  pending_delivery: { label: "Pending delivery", tone: "butter" },
  needs_reconciliation: { label: "Confirming with provider", tone: "butter" },
  completed: { label: "Delivered", tone: "mint" },
  failed: { label: "Delivery failed", tone: "danger" },
  reversed: { label: "Reversed · refund due", tone: "neutral" },
};

const OPEN = new Set(["reserved", "pending_delivery", "needs_reconciliation"]);

/** Live order status: polls while open, reveals the code to its owner on request. */
export function OrderStatus({ initial, compact = false, onChange }: { initial: OrderView; compact?: boolean; onChange?: (o: OrderView) => void }) {
  const [order, setOrder] = useState(initial);
  const [code, setCode] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!OPEN.has(order.status)) return;
    const t = window.setTimeout(async () => {
      try {
        const { order: next } = await callApi<{ order: OrderView }>(`/api/orders/${order.id}`);
        setOrder(next);
        onChange?.(next);
      } catch {
        setOrder((o) => ({ ...o }));
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [order, onChange]);

  const reveal = async () => {
    setRevealing(true);
    setError(null);
    try {
      const { code } = await callApi<{ code: string }>(`/api/orders/${order.id}/code`, {});
      setCode(code);
    } catch {
      setError("We couldn't load the code. Try again.");
    } finally {
      setRevealing(false);
    }
  };

  const paidWithShark = order.payment.method === "shark";
  const base = STATUS_META[order.status] ?? STATUS_META.reserved;
  const meta = !paidWithShark
    ? base
    : order.status === "reserved"
      ? { label: "Payment confirmed", tone: "butter" as const }
      : order.status === "reversed"
        ? { label: "Reversed · refund due", tone: "neutral" as const }
        : base;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3" aria-live="polite">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {OPEN.has(order.status) && (
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <span className="h-2 w-2 rounded-full bg-butter [animation:pulse-ring_1.4s_ease-out_infinite]" aria-hidden="true" />
            Checking with the provider…
          </span>
        )}
      </div>

      {order.status === "completed" && (
        <div className="rounded-2xl border border-mint/25 bg-mint/[0.06] p-5">
          <div className="text-sm font-semibold text-mint">Your reward is ready</div>
          {order.hasCode ? (
            code ? (
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-3">
                  <code className="num select-all break-all rounded-lg bg-midnight px-3 py-2 text-base text-warm">{code}</code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(code).catch(() => {});
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    }}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <Button size="sm" onClick={reveal} disabled={revealing}>
                  {revealing ? "Loading…" : "Reveal code"}
                </Button>
                {error && <p className="mt-2 text-sm text-[#ffb3b3]">{error}</p>}
                <p className="mt-2 text-xs text-muted">Codes are shown only to you and are never sent by email or chat.</p>
              </div>
            )
          ) : (
            <p className="mt-2 text-sm text-muted">The provider delivered this reward directly. Follow the instructions below.</p>
          )}
        </div>
      )}

      {order.payment.method === "shark" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-midnight/40 px-4 py-3 text-sm">
          <span>
            Paid <span className="num text-warm">{order.payment.amount} {brand.ticker}</span>
          </span>
          {order.payment.explorerUrl && (
            <a href={order.payment.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-muted underline underline-offset-4 hover:text-warm">
              View on Solscan
            </a>
          )}
        </div>
      )}

      {order.status === "reversed" && (
        <div className="rounded-2xl border border-line bg-white/[0.03] p-5 text-sm">
          <div className="font-semibold">Delivery didn&apos;t complete</div>
          <p className="mt-1 text-muted">
            {(order.failureReason ?? "The provider couldn't fulfil this order").replace(/\.?$/, ".")}{" "}
            {paidWithShark
              ? `Your ${brand.ticker} payment will be refunded to the wallet it was sent from.`
              : "This order was cancelled."}
          </p>
        </div>
      )}

      {order.status === "needs_reconciliation" && (
        <p className="rounded-2xl border border-butter/25 bg-butter/[0.06] p-4 text-sm text-butter">
          The provider didn&apos;t confirm the outcome yet.{" "}
          {paidWithShark ? "Your payment is recorded" : "This order is on hold"} until we confirm with the
          provider, so nothing is charged or delivered twice.
        </p>
      )}

      {(order.status === "completed" || !compact) && order.instructions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">How to redeem</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted">
            {order.instructions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      {!compact && (
        <div>
          <h3 className="text-sm font-semibold">Timeline</h3>
          <ol className="mt-3 space-y-3 border-l border-line pl-5">
            {order.events.map((e, i) => (
              <li key={i} className="relative">
                <span aria-hidden="true" className={clsx("absolute -left-[25px] top-1.5 h-2 w-2 rounded-full", e.status === "completed" ? "bg-mint" : e.status === "failed" ? "bg-[#ff6b6b]" : "bg-white/40")} />
                <div className="text-sm">{e.note}</div>
                <div className="font-mono text-xs text-muted">{fmtDateTime(e.created_at)}</div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {compact && (
        <Link href={`/app/orders/${order.id}`} className={buttonClass("secondary", "md", "w-full")}>
          View receipt
        </Link>
      )}
    </div>
  );
}
