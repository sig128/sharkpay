import { brand } from "@/config/brand";

export function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

/** Link to the official X profile. `label` shows the handle next to the logo. */
export function XLink({ className = "", label = false }: { className?: string; label?: boolean }) {
  const { handle, url } = brand.social.x;
  return (
    <a
      href={url}
      target="_blank"
      rel="me noopener noreferrer"
      aria-label={`Follow ${brand.name} on X (${handle}), opens in a new tab`}
      className={`group inline-flex min-h-11 items-center justify-center gap-2.5 rounded-full border border-line text-warm transition-[background,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:bg-white/[0.06] ${label ? "px-4" : "w-11"} ${className}`}
    >
      <XLogo className="size-4 transition-transform duration-300 group-hover:scale-110" />
      {label && <span className="text-sm font-medium">{handle}</span>}
    </a>
  );
}
