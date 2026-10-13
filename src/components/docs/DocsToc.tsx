"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";

export type TocGroup = { title: string; items: Array<{ id: string; label: string }> };

export function DocsToc({ groups }: { groups: TocGroup[] }) {
  const [active, setActive] = useState(groups[0]?.items[0]?.id ?? "");

  useEffect(() => {
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [groups]);

  return (
    <nav aria-label="Documentation" className="space-y-7 text-sm">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="eyebrow">{g.title}</p>
          <ul className="mt-2 border-l border-line">
            {g.items.map((i) => (
              <li key={i.id}>
                <a
                  href={`#${i.id}`}
                  aria-current={active === i.id ? "location" : undefined}
                  className={clsx(
                    "-ml-px block border-l py-1.5 pl-4 transition-colors",
                    active === i.id ? "border-pink text-warm" : "border-transparent text-muted hover:text-warm",
                  )}
                >
                  {i.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
