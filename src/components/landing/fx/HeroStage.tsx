"use client";

import { useEffect, useRef } from "react";

const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Hero wrapper that feeds pointer position (--mx/--my, -1..1), spotlight
 * coordinates and scroll progress (--sp, 0..1) to its layers as CSS variables.
 */
export function HeroStage({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const spot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced()) return;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const target = { x: 0, y: 0, cx: el.clientWidth * 0.7, cy: el.clientHeight * 0.45 };
    const cur = { ...target };
    let visible = true;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      target.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      target.cx = e.clientX - r.left;
      target.cy = e.clientY - r.top;
    };

    const tick = () => {
      raf = 0;
      if (!visible) return;
      cur.x += (target.x - cur.x) * 0.08;
      cur.y += (target.y - cur.y) * 0.08;
      cur.cx += (target.cx - cur.cx) * 0.14;
      cur.cy += (target.cy - cur.cy) * 0.14;
      const sp = Math.min(1, Math.max(0, window.scrollY / Math.max(1, el.offsetHeight)));
      el.style.setProperty("--mx", cur.x.toFixed(4));
      el.style.setProperty("--my", cur.y.toFixed(4));
      el.style.setProperty("--sp", sp.toFixed(4));
      if (spot.current) spot.current.style.transform = `translate3d(${cur.cx - 350}px, ${cur.cy - 350}px, 0)`;
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    if (finePointer) window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={ref} className={className} {...rest}>
      <div
        ref={spot}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 -z-[1] hidden size-[700px] rounded-full opacity-70 mix-blend-screen [@media(pointer:fine)]:block motion-reduce:!hidden"
        style={{ background: "radial-gradient(circle, rgb(255 78 174 / 0.16), rgb(255 136 107 / 0.06) 40%, transparent 68%)" }}
      />
      {children}
    </section>
  );
}
