"use client";

import { useRef } from "react";

/** Pulls its child toward the pointer while hovered (fine pointers only). */
export function Magnetic({ children, strength = 0.3 }: { children: React.ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  const move = (e: React.PointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * strength;
    const y = (e.clientY - (r.top + r.height / 2)) * strength;
    el.style.transition = "transform 120ms linear";
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "transform 700ms cubic-bezier(0.2, 1.6, 0.3, 1)";
    el.style.transform = "";
  };

  return (
    <span ref={ref} className="inline-block" onPointerMove={move} onPointerLeave={leave}>
      {children}
    </span>
  );
}
