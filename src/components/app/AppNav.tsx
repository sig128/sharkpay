"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { Wordmark } from "@/components/brand/Wordmark";
import { callApi } from "@/lib/client";

const items = [
  { href: "/app", label: "Overview", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/app/rewards", label: "Rewards", icon: "M4 8h16v12H4zM2 8h20M12 8v12M12 8c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1" },
  { href: "/app/card", label: "My Card", icon: "M3 6h18v12H3zM3 10h18M7 15h4" },
  { href: "/app/activity", label: "Activity", icon: "M4 6h16M4 12h10M4 18h7" },
  { href: "/app/transparency", label: "Transparency", icon: "M12 3v18M5 8l7-5 7 5M4 14h6l-3 5zM14 14h6l-3 5z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const isActive = (path: string, href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));

export function Sidebar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-[#0a0c15] px-4 py-5 lg:flex">
      <Wordmark className="px-2" />
      <nav aria-label="App" className="mt-8">
        <ul className="space-y-1">
          {items.map((it) => {
            const active = isActive(path, it.href);
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors duration-200",
                    active ? "bg-white/[0.07] text-warm" : "text-muted hover:bg-white/[0.04] hover:text-warm",
                  )}
                >
                  <span className={active ? "text-coral" : ""}>
                    <Icon d={it.icon} />
                  </span>
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto space-y-1 border-t border-line pt-4">
        <Link
          href="/app/accounts"
          aria-current={path.startsWith("/app/accounts") ? "page" : undefined}
          className={clsx(
            "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm transition-colors duration-200",
            path.startsWith("/app/accounts") ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
          )}
        >
          <Avatar name={name} url={avatarUrl} />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-warm">{name}</span>
            <span className="block text-xs text-muted">Connected accounts</span>
          </span>
        </Link>
        <SignOutButton />
      </div>
    </aside>
  );
}

export function Avatar({ name, url, size = 32 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full" referrerPolicy="no-referrer" />;
  }
  return (
    <span aria-hidden="true" style={{ width: size, height: size }} className="bg-sunset inline-flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-ink">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await callApi("/api/auth/logout", {}).catch(() => {});
        router.replace("/");
        router.refresh();
      }}
      className={clsx("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted transition-colors hover:bg-white/[0.04] hover:text-warm", className)}
    >
      <Icon d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

export function MobileTopBar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <div className="glass sticky top-0 z-40 flex h-14 items-center justify-between border-x-0 border-t-0 px-4 lg:hidden">
      <Wordmark href="/app" />
      <Link href="/app/accounts" className="inline-flex h-11 w-11 items-center justify-center rounded-full" aria-label="Connected accounts and settings">
        <Avatar name={name} url={avatarUrl} />
      </Link>
    </div>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="App" className="glass fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const active = isActive(path, it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.66rem] font-semibold transition-colors",
                  active ? "text-warm" : "text-muted",
                )}
              >
                <span className={active ? "text-coral" : ""}>
                  <Icon d={it.icon} />
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
