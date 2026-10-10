"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { clsx } from "clsx";
import { ActivityRow, primaryDelta, type ActivityView } from "./ActivityRow";
import { EmptyState } from "./Page";
import { Badge } from "@/components/ui/Badges";
import { buttonClass } from "@/components/ui/Button";
import { fmtDate, fmtDateTime, fmtInt } from "@/lib/format";

const FILTERS = [
  { id: "all", label: "All", match: () => true },
  { id: "rewards", label: "Rewards", match: (a: ActivityView) => a.kind === "allocation" || a.kind === "clearance" },
  { id: "redemptions", label: "Redemptions", match: (a: ActivityView) => a.kind === "reservation" || a.kind === "capture" },
  { id: "reversals", label: "Reversals", match: (a: ActivityView) => a.kind === "release" || a.kind === "reversal" },
  { id: "pending", label: "Pending", match: (a: ActivityView) => a.status === "pending" },
] as const;

function groupLabel(ms: number, now: number) {
  const day = 86_400_000;
  const startToday = Math.floor(now / day) * day;
  if (ms >= startToday) return "Today";
  if (ms >= startToday - day) return "Yesterday";
  if (ms >= startToday - 6 * day) return "Earlier this week";
  return fmtDate(ms, { month: "long", year: "numeric" });
}

export function ActivityList({ items }: { items: ActivityView[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [open, setOpen] = useState<ActivityView | null>(null);
  const [now] = useState(() => Date.now());

  const groups = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    const map = new Map<string, ActivityView[]>();
    for (const a of items.filter(f.match)) {
      const k = groupLabel(a.createdAt, now);
      map.set(k, [...(map.get(k) ?? []), a]);
    }
    return [...map];
  }, [items, filter, now]);

  return (
    <>
      <div role="group" aria-label="Filter activity" className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const count = items.filter(f.match).length;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={clsx(
                "min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors duration-200",
                filter === f.id ? "border-warm bg-warm text-ink" : "border-line-strong text-muted hover:text-warm",
              )}
            >
              {f.label} <span className="num ml-1 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <EmptyState title="Nothing here yet">No entries match this filter.</EmptyState>
      ) : (
        <div className="space-y-8">
          {groups.map(([label, list]) => (
            <section key={label} aria-label={label}>
              <h2 className="eyebrow mb-2">{label}</h2>
              <ul className="panel divide-y divide-line p-2">
                {list.map((a) => (
                  <li key={a.id}>
                    <ActivityRow a={a} onOpen={() => setOpen(a)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Dialog.Root open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-3xl border border-line bg-surface outline-none md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[440px] md:rounded-none md:rounded-l-3xl">
            {open && <Drawer a={open} />}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function Drawer({ a }: { a: ActivityView }) {
  const d = primaryDelta(a);
  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-line p-5">
        <div className="min-w-0">
          <Dialog.Title className="text-lg font-bold">{a.title}</Dialog.Title>
          <p className="font-mono text-xs text-muted">{fmtDateTime(a.createdAt)}</p>
        </div>
        <Dialog.Close className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/5 hover:text-warm" aria-label="Close details">
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </Dialog.Close>
      </div>
      <div className="space-y-6 overflow-y-auto p-5">
        <div>
          <div className={clsx("display text-5xl tabular-nums", d.value > 0 ? "text-mint" : "text-warm")}>
            {d.value > 0 ? "+" : d.value < 0 ? "−" : ""}
            {fmtInt(Math.abs(d.value))}
            <span className="ml-2 font-mono text-base text-muted">CR {d.label}</span>
          </div>
          <div className="mt-2">
            {a.status === "pending" ? <Badge tone="butter">Pending</Badge> : a.status === "reversed" ? <Badge>Reversed</Badge> : <Badge tone="mint">Completed</Badge>}
          </div>
        </div>
        <Dialog.Description className="text-sm leading-relaxed text-muted">{a.explanation}</Dialog.Description>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {[
            ["Available", a.availableDelta],
            ["Pending", a.pendingDelta],
            ["Reserved", a.reservedDelta],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl border border-line p-3">
              <div className="text-muted">{k}</div>
              <div className="num mt-1 text-sm">
                {(v as number) > 0 ? "+" : (v as number) < 0 ? "−" : ""}
                {fmtInt(Math.abs(v as number))}
              </div>
            </div>
          ))}
        </div>
        {a.detail && (
          <dl className="divide-y divide-line rounded-2xl border border-line px-4 text-sm">
            {Object.entries(a.detail)
              .filter(([, v]) => v !== null)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-muted">{k}</dt>
                  <dd className="num min-w-0 break-all text-right text-xs">{String(v)}</dd>
                </div>
              ))}
          </dl>
        )}
        <p className="font-mono text-[0.7rem] text-muted">Ledger transaction {a.id}</p>
        {a.refType === "order" && a.refId && (
          <Link href={`/app/orders/${a.refId}`} className={buttonClass("secondary", "md", "w-full")}>
            View receipt
          </Link>
        )}
      </div>
    </>
  );
}
