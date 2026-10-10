"use client";

import { useEffect, useRef } from "react";
import { fmtInt } from "@/lib/format";

/** Counts from 0 to `value` once the opening sequence has revealed the page. */
export function CountUp({ value, delay = 700, duration = 1800, className }: { value: number; delay?: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const html = document.documentElement;
    let raf = 0;
    let timer = 0;
    el.textContent = fmtInt(0);

    const run = () => {
      timer = window.setTimeout(() => {
        const start = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 4);
          el.textContent = fmtInt(Math.round(value * eased));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      }, delay);
    };

    let mo: MutationObserver | undefined;
    if (html.dataset.revealed) run();
    else {
      mo = new MutationObserver(() => {
        if (html.dataset.revealed) {
          mo?.disconnect();
          run();
        }
      });
      mo.observe(html, { attributes: true, attributeFilter: ["data-revealed"] });
    }
    return () => {
      mo?.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      el.textContent = fmtInt(value);
    };
  }, [value, delay, duration]);

  return (
    <span ref={ref} className={className}>
      {fmtInt(value)}
    </span>
  );
}
