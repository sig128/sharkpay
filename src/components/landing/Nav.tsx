"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { brand } from "@/config/brand";
import { Wordmark } from "@/components/brand/Wordmark";
import { XLink } from "@/components/brand/XLink";
import { buttonClass } from "@/components/ui/Button";
import { SignInCard, type SignInOptions } from "./SignInCard";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#buy", label: `Buy ${brand.ticker}` },
  { href: "#rewards", label: "Rewards" },
  { href: "#transparency", label: "Transparency" },
];

export function Nav({ signedIn, signIn }: { signedIn: boolean; signIn: SignInOptions }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  const openApp = (className: string) =>
    signedIn ? (
      <Link href="/app" className={className}>
        Open app
      </Link>
    ) : (
      <button
        type="button"
        aria-haspopup="dialog"
        className={className}
        onClick={() => {
          setOpen(false);
          setSignInOpen(true);
        }}
      >
        Open app
      </button>
    );

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={clsx(
        "fixed inset-x-0 top-0 z-50 transition-[background,border-color,backdrop-filter] duration-300",
        scrolled || open ? "glass border-x-0 border-t-0" : "border-b border-transparent",
      )}
    >
      <nav className="container-site flex h-16 items-center justify-between gap-6" aria-label="Main">
        <Wordmark />
        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-muted transition-colors duration-200 hover:text-warm">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <XLink />
          </div>
          {openApp(buttonClass("secondary", "sm", "hidden sm:inline-flex"))}
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-warm hover:bg-white/5 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M4 8h16M4 16h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </nav>
      {open && (
        <div id="mobile-menu" className="container-site pb-5 md:hidden">
          <ul className="flex flex-col gap-1 border-t border-line pt-3">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-xl px-3 text-base font-medium text-warm hover:bg-white/5">
                  {l.label}
                </a>
              </li>
            ))}
            <li className="pt-2">
              {openApp(buttonClass("primary", "md", "w-full"))}
            </li>
            <li>
              <XLink label className="w-full" />
            </li>
          </ul>
        </div>
      )}
      {!signedIn && <SignInCard open={signInOpen} onOpenChange={setSignInOpen} options={signIn} />}
    </header>
  );
}
