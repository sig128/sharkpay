import { clsx } from "clsx";
import { fmtDateTime } from "@/lib/format";

export interface ActivityView {
  id: string;
  kind: string;
  title: string;
  explanation: string;
  createdAt: number;
  amount: string;
  amountLabel: string;
  positive: boolean;
  refType: string | null;
  refId: string | null;
  explorerUrl: string | null;
  status: "completed" | "pending" | "reversed";
  detail?: Record<string, string | number | null>;
}

const kindTone: Record<string, string> = {
  payout: "bg-mint/15 text-mint",
  order: "bg-white/10 text-warm",
};
const kindGlyph: Record<string, string> = {
  payout: "→",
  order: "◆",
};

export function ActivityRow({ a, onOpen }: { a: ActivityView; onOpen?: () => void }) {
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
        <span className={clsx("num block text-sm", a.positive ? "text-mint" : "text-warm")}>
          {a.positive ? "+" : ""}
          {a.amount}
        </span>
        <span className="block text-[0.7rem] text-muted">{a.amountLabel}</span>
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
