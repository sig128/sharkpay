"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { clsx } from "clsx";
import { brand } from "@/config/brand";
import { Fin } from "./Fin";

export interface MembershipCardProps {
  memberName: string;
  membershipId: string;
  balance: number | null;
  demo?: boolean;
  className?: string;
  /** Resting orientation in degrees. */
  pose?: { x: number; y: number; z: number };
  interactive?: boolean;
  priority?: "hero" | "inline";
}

const MAX_TILT = 6;

/**
 * Website-only brand visualization of a rewards membership. Not a payment
 * card: no network marks, no card number, no payment claims.
 */
export function MembershipCard({
  memberName,
  membershipId,
  balance,
  demo = true,
  className,
  pose = { x: 8, y: -16, z: -5 },
  interactive = true,
  priority = "inline",
}: MembershipCardProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current;
    const c = card.current;
    if (!el || !c || !interactive) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const set = (tx: number, ty: number, mx: number, my: number) => {
      c.style.setProperty("--tx", `${tx}deg`);
      c.style.setProperty("--ty", `${ty}deg`);
      c.style.setProperty("--mx", `${mx}%`);
      c.style.setProperty("--my", `${my}%`);
    };
    const onMove = (e: PointerEvent) => {
      if (reduce.matches || e.pointerType === "touch") return;
      const r = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => set((0.5 - y) * 2 * MAX_TILT, (x - 0.5) * 2 * MAX_TILT, x * 100, y * 100));
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      set(0, 0, 30, 20);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [interactive]);

  const style = {
    "--px": `${pose.x}deg`,
    "--py": `${pose.y}deg`,
    "--pz": `${pose.z}deg`,
    "--tx": "0deg",
    "--ty": "0deg",
    "--mx": "30%",
    "--my": "20%",
  } as CSSProperties;

  return (
    <div ref={wrap} className={clsx("@container relative [perspective:1400px]", className)}>
      <div
        ref={card}
        style={style}
        className="relative aspect-[1.586/1] w-full rounded-[var(--radius-card)] transition-transform duration-300 ease-out [transform-style:preserve-3d] [transform:rotateX(calc(var(--px)+var(--tx)))_rotateY(calc(var(--py)+var(--ty)))_rotateZ(var(--pz))] motion-reduce:transition-none"
        role="img"
        aria-label={`${brand.name} rewards membership card for ${memberName}, membership ${membershipId}${balance !== null ? `, ${balance.toLocaleString("en-US")} reward credits` : ""}${demo ? ", product preview" : ""}`}
      >
        {/* body */}
        <div
          className="absolute inset-0 overflow-hidden rounded-[inherit]"
          style={{
            background:
              "linear-gradient(128deg, rgb(255 176 132 / 0.95) 0%, rgb(255 120 140 / 0.92) 34%, rgb(255 78 174 / 0.9) 64%, rgb(190 150 255 / 0.88) 100%)",
            boxShadow:
              "inset 0 0 0 1px rgb(255 255 255 / 0.42), inset 0 1px 0 rgb(255 255 255 / 0.7), inset 0 -18px 40px -20px rgb(90 10 70 / 0.45), 0 40px 90px -30px rgb(255 78 174 / 0.55), 0 20px 40px -24px rgb(0 0 0 / 0.8)",
          }}
        >
          {/* guilloché microlines */}
          <svg className="absolute inset-0 h-full w-full opacity-[0.16] mix-blend-overlay" aria-hidden="true">
            <defs>
              <pattern id="guil" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">
                <path d="M0 11 Q5.5 0 11 11 T22 11" fill="none" stroke="white" strokeWidth="0.6" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#guil)" />
          </svg>
          {/* pointer-follow sheen */}
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(60% 70% at var(--mx) var(--my), rgb(255 255 255 / 0.32), transparent 60%)" }}
          />
          {/* slow specular sweep */}
          <div className="pointer-events-none absolute inset-y-[-40%] left-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent blur-md [animation:specular_9s_ease-in-out_infinite] motion-reduce:hidden" />
          <Fin tone="ink" className="absolute -right-[6%] -bottom-[14%] h-[95%] w-auto opacity-[0.1]" />
          {/* edge light */}
          <div className="absolute inset-0 rounded-[inherit] [background:linear-gradient(180deg,rgb(255_255_255/0.35),transparent_22%,transparent_80%,rgb(255_255_255/0.12))] mix-blend-soft-light" />
        </div>

        {/* content */}
        <div className="relative flex h-full flex-col justify-between p-[6.5%] text-ink">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-[0.4em] font-display text-[max(0.7rem,5.2cqw)] font-extrabold leading-none tracking-[0.07em]">
              <Fin tone="ink" className="h-[1.15em] w-[1.15em]" />
              {brand.name}
            </div>
            <div className="text-right font-mono text-[max(0.42rem,2.3cqw)] uppercase leading-tight tracking-[0.18em] opacity-80">
              Rewards
              <br />
              membership
            </div>
          </div>

          <div>
            <div className="font-mono text-[max(0.42rem,2.2cqw)] uppercase tracking-[0.2em] opacity-75">
              {demo ? "Illustrative balance" : "Available reward credits"}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-[max(1.4rem,12.5cqw)] font-extrabold leading-none tabular-nums">
                {balance === null ? "—" : balance.toLocaleString("en-US")}
              </span>
              <span className="font-mono text-[max(0.45rem,2.6cqw)] font-medium tracking-[0.12em]">CREDITS</span>
            </div>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[max(0.4rem,2cqw)] uppercase tracking-[0.2em] opacity-70">Member</div>
              <div className="truncate text-[max(0.6rem,3.6cqw)] font-bold">{memberName}</div>
              <div className="mt-0.5 font-mono text-[max(0.42rem,2.4cqw)] tracking-[0.12em] opacity-80">{membershipId}</div>
            </div>
            {demo && (
              <span className="shrink-0 rounded-full border border-ink/25 bg-white/25 px-2 py-0.5 font-mono text-[max(0.38rem,1.9cqw)] uppercase tracking-[0.16em]">
                Product preview
              </span>
            )}
          </div>
        </div>
      </div>
      {priority === "hero" && (
        <div aria-hidden="true" className="absolute inset-x-[12%] -bottom-[14%] h-[18%] rounded-[50%] bg-pink/30 blur-3xl" />
      )}
    </div>
  );
}
