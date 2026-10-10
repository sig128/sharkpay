"use client";

import { useCallback } from "react";

/** Pointer handlers for `.tilt` elements: sets rotation and holo-glare position vars. */
export function useTilt(max = 10) {
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.dataset.active = "";
      el.style.setProperty("--ry", `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${((0.5 - py) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
    },
    [max],
  );
  const onPointerLeave = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    delete el.dataset.active;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }, []);
  return { onPointerMove, onPointerLeave };
}
