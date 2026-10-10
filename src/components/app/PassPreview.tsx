"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { PhoneFrame, WalletPass } from "@/components/brand/WalletPass";
import type { PassModel } from "@/lib/server/passes/pass";

/** Working pass preview: flip between the front fields and the back fields. */
export function PassPreview({ model }: { model: PassModel }) {
  const [side, setSide] = useState<"front" | "back">("front");
  return (
    <div className="flex flex-col items-center">
      <div role="group" aria-label="Pass side" className="mb-4 inline-flex rounded-full border border-line p-1">
        {(["front", "back"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => setSide(s)}
            className={clsx("min-h-11 rounded-full px-5 text-sm font-semibold capitalize transition-colors", side === s ? "bg-warm text-ink" : "text-muted hover:text-warm")}
          >
            {s}
          </button>
        ))}
      </div>
      <PhoneFrame className="w-[min(100%,280px)] text-[11px]">
        {side === "front" ? (
          <WalletPass data={model} fontSize="inherit" />
        ) : (
          <div className="aspect-[0.66/1] overflow-y-auto rounded-[0.9em] bg-[rgb(18,22,37)] p-[1em] text-[rgb(255,244,234)]">
            <dl className="space-y-[0.9em]">
              {model.back.map((f) => (
                <div key={f.label}>
                  <dt className="text-[0.8em] font-semibold text-[rgb(255,136,107)]">{f.label}</dt>
                  <dd className="mt-[0.2em] break-words text-[0.85em] leading-snug">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </PhoneFrame>
    </div>
  );
}
