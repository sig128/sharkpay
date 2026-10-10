"use client";

import { useEffect, useRef } from "react";

/** Sunset progress line pinned to the top of the viewport. */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (ref.current) ref.current.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[55] h-[3px]">
      <div
        ref={ref}
        className="h-full origin-left bg-[linear-gradient(90deg,#FFE5A5,#FF886B,#FF4EAE,#74E9CE)] shadow-[0_0_12px_rgb(255_78_174/0.8)]"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}

/** Soft glow trailing the mouse across the landing page (fine pointers only). */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = { x: -400, y: -400 };
    const cur = { ...target };
    let raf = 0;
    const tick = () => {
      cur.x += (target.x - cur.x) * 0.18;
      cur.y += (target.y - cur.y) * 0.18;
      el.style.transform = `translate3d(${cur.x - 16}px, ${cur.y - 16}px, 0)`;
      raf = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) > 0.3 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      el.style.opacity = "1";
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => (el.style.opacity = "0");
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[65] size-8 rounded-full opacity-0 mix-blend-screen transition-opacity duration-300"
      style={{ background: "radial-gradient(circle, rgb(255 229 165 / 0.9), rgb(255 78 174 / 0.45) 40%, transparent 70%)", filter: "blur(2px)" }}
    />
  );
}
