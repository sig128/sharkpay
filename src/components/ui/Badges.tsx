import { clsx } from "clsx";
import type { ReactNode } from "react";

type Tone = "neutral" | "mint" | "butter" | "pink" | "coral" | "danger";

const tones: Record<Tone, string> = {
  neutral: "border-line-strong text-muted bg-white/[0.03]",
  mint: "border-mint/30 text-mint bg-mint/[0.08]",
  butter: "border-butter/30 text-butter bg-butter/[0.08]",
  pink: "border-pink/35 text-[#ff9fd2] bg-pink/[0.08]",
  coral: "border-coral/35 text-coral bg-coral/[0.08]",
  danger: "border-[#ff6b6b]/35 text-[#ffb3b3] bg-[#ff6b6b]/[0.08]",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 font-[family-name:var(--font-mono)] text-[0.68rem] uppercase tracking-[0.12em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Shown wherever sample information is displayed. */
export function PreviewBadge({ label = "Product preview", className }: { label?: string; className?: string }) {
  return (
    <Badge tone="butter" className={className}>
      <span className="h-1.5 w-1.5 rounded-full bg-butter" aria-hidden="true" />
      {label}
    </Badge>
  );
}
