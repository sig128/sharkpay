"use client";

import { useEffect } from "react";

/**
 * Marks `[data-reveal]` and `[data-reveal-stagger]` elements with `data-shown`
 * as they enter the viewport. Stagger parents give each child an increasing delay.
 */
export function RevealObserver() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal], [data-reveal-stagger]");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.setAttribute("data-shown", ""));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          if (el.hasAttribute("data-reveal-stagger")) {
            const step = Number(el.dataset.revealStagger) || 90;
            Array.from(el.children).forEach((child, i) => (child as HTMLElement).style.setProperty("--rd", `${i * step}ms`));
          }
          el.setAttribute("data-shown", "");
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
