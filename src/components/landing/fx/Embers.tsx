"use client";

import { useEffect, useRef } from "react";

const COLORS = ["255,136,107", "255,78,174", "255,229,165", "116,233,206"];

interface Ember {
  x: number;
  y: number;
  r: number;
  vy: number;
  sway: number;
  phase: number;
  life: number;
  color: string;
}

/** Glowing embers drifting up from the horizon. Paused offscreen; off for reduced motion. */
export function Embers({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let embers: Ember[] = [];

    const spawn = (anywhere: boolean): Ember => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 10,
      r: 0.6 + Math.random() * 2.1,
      vy: 0.25 + Math.random() * 0.9,
      sway: 0.3 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
      life: 0.4 + Math.random() * 0.6,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    });

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = w < 640 ? 34 : 80;
      embers = Array.from({ length: count }, () => spawn(true));
    };

    const draw = (t: number) => {
      raf = 0;
      if (!visible) return;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.y -= e.vy;
        const x = e.x + Math.sin(t / 1000 + e.phase) * 14 * e.sway;
        if (e.y < -20) embers[i] = spawn(false);
        const fade = Math.min(1, e.y / (h * 0.6)) * e.life;
        const flicker = 0.75 + Math.sin(t / 180 + e.phase * 3) * 0.25;
        const g = ctx.createRadialGradient(x, e.y, 0, x, e.y, e.r * 5);
        g.addColorStop(0, `rgba(${e.color},${(0.9 * fade * flicker).toFixed(3)})`);
        g.addColorStop(1, `rgba(${e.color},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - e.r * 5, e.y - e.r * 5, e.r * 10, e.r * 10);
      }
      raf = requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && !document.hidden;
      if (visible && !raf) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);
    resize();
    raf = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
