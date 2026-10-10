/** Original palm silhouette (drawn for this project). */
export function Palm({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 600" className={className} aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <path d="M205 600 C 200 470 196 360 214 250 C 218 228 224 212 230 200 L 238 204 C 230 230 226 262 224 300 C 220 400 222 500 226 600 Z" />
        <path d="M232 200 C 190 170 130 168 60 196 C 120 160 180 150 236 186 Z" />
        <path d="M232 198 C 200 140 150 110 90 104 C 160 92 214 128 240 186 Z" />
        <path d="M236 192 C 240 130 270 84 320 60 C 286 104 262 146 246 196 Z" />
        <path d="M238 196 C 290 160 350 160 396 188 C 340 178 290 186 244 206 Z" />
        <path d="M236 200 C 268 214 300 250 318 300 C 286 262 258 236 230 214 Z" />
        <path d="M232 202 C 196 216 160 250 140 300 C 172 262 202 236 236 214 Z" />
        <path d="M234 194 C 222 150 200 120 170 98 C 214 116 236 150 244 192 Z" />
      </g>
    </svg>
  );
}

/** Sunset horizon, palms and grain behind hero/auth scenes. Decorative only. */
export function Atmosphere({ variant = "hero" }: { variant?: "hero" | "login" | "quiet" }) {
  return (
    <div aria-hidden="true" className="noise pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-x-0 bottom-0 h-[70%]"
        style={{
          background:
            variant === "quiet"
              ? "radial-gradient(80% 60% at 70% 100%, rgb(255 78 174 / 0.10), transparent 70%)"
              : "radial-gradient(70% 55% at 68% 92%, rgb(255 136 107 / 0.30), transparent 62%), radial-gradient(60% 50% at 30% 100%, rgb(255 78 174 / 0.18), transparent 70%), radial-gradient(50% 40% at 90% 70%, rgb(185 164 255 / 0.12), transparent 70%)",
        }}
      />
      {variant !== "quiet" && (
        <>
          <div className="absolute inset-x-0 top-[80%] h-px bg-gradient-to-r from-transparent via-coral/40 to-transparent" />
          <div
            className="absolute inset-x-0 top-[80%] h-[20%] opacity-60"
            style={{
              background:
                "repeating-linear-gradient(180deg, rgb(255 136 107 / 0.10) 0 1px, transparent 1px 14px)",
              maskImage: "linear-gradient(180deg, black, transparent 80%)",
              WebkitMaskImage: "linear-gradient(180deg, black, transparent 80%)",
            }}
          />
          <Palm className="absolute -bottom-6 right-[-60px] h-[78%] max-h-[640px] text-[#05060b] opacity-90 md:right-[2%]" />
          <Palm className="absolute -bottom-10 left-[-120px] hidden h-[58%] max-h-[480px] -scale-x-100 text-[#05060b] opacity-70 lg:block" />
        </>
      )}
    </div>
  );
}
