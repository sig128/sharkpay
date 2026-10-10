import { clsx } from "clsx";
import { fmtDateTime, fmtInt } from "@/lib/format";

export interface ActivityView {
  id: string;
  kind: string;
  title: string;
  explanation: string;
  createdAt: number;
  availableDelta: number;
  pendingDelta: number;
  reservedDelta: number;
  refType: string | null;
  refId: string | null;
  status: "completed" | "pending" | "reversed";
  detail?: Record<string, string | number | null>;
}

const kindTone: Record<string, string> = {
  allocation: "bg-mint/15 text-mint",
  clearance: "bg-mint/10 text-mint",
  reservation: "bg-butter/10 text-butter",
  capture: "bg-pink/15 text-[#ff9fd2]",
  release: "bg-white/10 text-muted",
  reversal: "bg-white/10 text-muted",
};
const kindGlyph: Record<string, string> = {
  allocation: "+",
  clearance: "✓",
  reservation: "◷",
  capture: "★",
  release: "↺",
  reversal: "↺",
};

/** The headline number: change to spendable credits, or pending credits for allocations. */
export function primaryDelta(a: ActivityView) {
  if (a.kind === "allocation") return { value: a.pendingDelta, label: "pending" };
  if (a.kind === "clearance") return { value: a.availableDelta, label: "now available" };
  if (a.kind === "capture") return { value: a.reservedDelta, label: "spent from reserved" };
  if (a.kind === "reservation") return { value: a.availableDelta, label: "reserved" };
  if (a.kind === "release" || a.kind === "reversal") return { value: a.availableDelta, label: "returned" };
  return { value: a.availableDelta, label: "available" };
}

export function ActivityRow({ a, onOpen }: { a: ActivityView; onOpen?: () => void }) {
  const d = primaryDelta(a);
  const content = (
    <>
      <span aria-hidden="true" className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", kindTone[a.kind])}>
        {kindGlyph[a.kind] ?? "•"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{a.title}</span>
        <span className="block font-mono text-xs text-muted">
          {fmtDateTime(a.createdAt)}
          {a.status === "pending" && " · pending"}
          {a.status === "reversed" && " · reversed"}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={clsx("num block text-sm", d.value > 0 ? "text-mint" : d.value < 0 ? "text-warm" : "text-muted")}>
          {d.value > 0 ? "+" : d.value < 0 ? "−" : ""}
          {fmtInt(Math.abs(d.value))} CR
        </span>
        <span className="block text-[0.7rem] text-muted">{d.label}</span>
      </span>
    </>
  );
  if (!onOpen) return <div className="flex items-center gap-3 py-3">{content}</div>;
  return (
    <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors duration-200 hover:bg-white/[0.04]" aria-haspopup="dialog">
      {content}
    </button>
  );
}
