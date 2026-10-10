"use client";

import { useEffect, useRef } from "react";
import { brand } from "@/config/brand";

const ROW_A = ["Hold", brand.ticker, "Earn SOL", "Redeem", "Shark Cards"];
const ROW_B = ["PC", "PlayStation", "Xbox", "Funded rewards", "Apple Wallet pass"];

function Star() {
  return (
    <svg viewBox="0 0 24 24" className="mx-[0.35em] inline-block size-[0.5em] shrink-0 text-coral" aria-hidden="true">
      <path fill="currentColor" d="M12 0c.8 6.6 4.4 10.4 12 12-7.6 1.6-11.2 5.4-12 12-.8-6.6-4.4-10.4-12-12C7.6 10.4 11.2 6.6 12 0Z" />
    </svg>
  );
}

function Row({ words, dir, outlineEven }: { words: string[]; dir?: "rev"; outlineEven: boolean }) {
  const seq = [...words, ...words];
  return (
    <div className="marquee-track" data-dir={dir}>
      {[0, 1].map((copy) => (
        <div key={copy} className="flex shrink-0 items-center">
          {seq.map((w, i) => (
            <span key={i} className="flex items-center">
              <span className={(i % 2 === 0) === outlineEven ? "text-outline" : "text-sunset-flow-soft"}>{w}</span>
              <Star />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Giant two-row marquee whose speed, direction and skew follow scroll velocity. */
export function Marquee() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tracks = Array.from(el.querySelectorAll<HTMLElement>(".marquee-track"));
    let lastY = window.scrollY;
    let vel = 0;
    let dir = 1;
    let raf = 0;
    let visible = false;

    const tick = () => {
      raf = 0;
      if (!visible) return;
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      vel += (dy - vel) * 0.12;
      if (Math.abs(dy) > 1) dir = dy > 0 ? 1 : -1;
      const rate = dir * (1 + Math.min(6, Math.abs(vel) * 0.35));
      for (const t of tracks) for (const a of t.getAnimations()) a.playbackRate = rate;
      el.style.setProperty("--skew", `${Math.max(-12, Math.min(12, vel * -0.4)).toFixed(2)}deg`);
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      lastY = window.scrollY;
      if (visible && !raf) raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="relative overflow-hidden border-y border-white/[0.06] bg-[#0b0d18] py-6 select-none md:py-10">
      <div
        className="display flex flex-col gap-1 text-[clamp(3.5rem,11vw,10rem)] leading-[0.95] md:gap-3"
        style={{ transform: "skewX(var(--skew, 0deg))" }}
      >
        <Row words={ROW_A} outlineEven />
        <Row words={ROW_B} dir="rev" outlineEven={false} />
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[12%] bg-gradient-to-r from-[#0b0d18] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[12%] bg-gradient-to-l from-[#0b0d18] to-transparent" />
    </div>
  );
}
