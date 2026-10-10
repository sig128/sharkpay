"use client";

import { useEffect, useState } from "react";
import { brand } from "@/config/brand";

const TIMEOUT_MS = 2400;
const MIN_VISIBLE_MS = 450;

type Phase = "wait" | "expand" | "done";

/**
 * Opening sequence. Waits for real readiness (web fonts, hydration, first
 * frame of the hero) with a timeout fallback, then expands the frame to the
 * viewport. Plays once per tab; reduced motion gets a short fade instead.
 */
export function OpeningLoader() {
  const [phase, setPhase] = useState<Phase>("wait");
  const [message, setMessage] = useState(`Loading ${brand.name}`);

  useEffect(() => {
    const html = document.documentElement;
    if (html.dataset.intro === "skip") {
      html.dataset.revealed = "1";
      const f = requestAnimationFrame(() => setPhase("done"));
      return () => cancelAnimationFrame(f);
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    let cancelled = false;
    const timers: number[] = [];

    const ready = Promise.all([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    ]);
    const timeout = new Promise<void>((r) => timers.push(window.setTimeout(r, TIMEOUT_MS)));

    Promise.race([ready, timeout]).then(() => {
      if (cancelled) return;
      const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - started));
      timers.push(
        window.setTimeout(() => {
          setMessage(`${brand.name} loaded`);
          try {
            sessionStorage.setItem("sc-intro", "1");
          } catch {}
          if (reduce) {
            html.dataset.revealed = "1";
            setPhase("done");
            return;
          }
          setPhase("expand");
          timers.push(
            window.setTimeout(() => {
              html.dataset.revealed = "1";
              setPhase("done");
            }, 820),
          );
        }, wait),
      );
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="loader" data-phase={phase} aria-hidden={phase === "done"}>
      <div className="loader-frame" />
      <div className="loader-mark" aria-hidden="true">
        {brand.name}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  );
}
