import { useId } from "react";

/** Original shark-fin emblem. Same geometry as the pass icon (scripts/generate-pass-assets.mjs). */
export function Fin({ className, tone = "sunset" }: { className?: string; tone?: "sunset" | "ink" | "warm" }) {
  const id = useId();
  const fill = tone === "sunset" ? `url(#${id})` : tone === "ink" ? "#1A0B17" : "#FFF4EA";
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#FF886B" />
          <stop offset="1" stopColor="#FF4EAE" />
        </linearGradient>
      </defs>
      <path d="M16 80 Q38 30 66 14 Q56 52 84 80 Z" fill={fill} />
      <path d="M8 88 q8 -5 16 0 t16 0 t16 0 t16 0 t16 0" fill="none" stroke={fill} strokeWidth="3.2" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}
