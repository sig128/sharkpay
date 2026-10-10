"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Button, buttonClass } from "@/components/ui/Button";
import { EmailCodeForm } from "@/components/app/AccountActions";
import { ApiError, callApi } from "@/lib/client";
import type { GamingProviderInfo, SocialProviderInfo } from "@/lib/server/auth/providers";

function ProviderGlyph({ id }: { id: GamingProviderInfo["id"] }) {
  if (id === "steam")
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <circle cx="15.5" cy="8.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="8" cy="16" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 15l3-4" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  if (id === "playstation")
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" rx="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M4 4h7.5v7.5H4zM12.5 4H20v7.5h-7.5zM4 12.5h7.5V20H4zM12.5 12.5H20V20h-7.5z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

export function LoginPanel({
  providers,
  social,
  emailEnabled,
  devMode,
}: {
  providers: GamingProviderInfo[];
  social: SocialProviderInfo[];
  emailEnabled: boolean;
  devMode: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"main" | "email" | "recovery">("main");
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState("");
  const [recBusy, setRecBusy] = useState(false);

  const startDemo = async () => {
    setDemoBusy(true);
    setError(null);
    try {
      const r = await callApi<{ redirect: string }>("/api/auth/demo", {});
      router.push(r.redirect);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the demo");
      setDemoBusy(false);
    }
  };

  if (mode === "email") {
    return (
      <div className="mt-8 space-y-4">
        <EmailCodeForm purpose="login" cta="Email me a code" devMode={devMode} onDone={(to) => router.push(to ?? "/app")} />
        <p className="text-xs text-muted">Good for PlayStation players while PlayStation sign-in isn&apos;t available. You&apos;ll pick your platform next.</p>
        <button type="button" onClick={() => setMode("main")} className="min-h-11 text-sm text-muted underline hover:text-warm">
          ← All sign-in options
        </button>
      </div>
    );
  }

  if (mode === "recovery") {
    return (
      <form
        className="mt-8 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setRecBusy(true);
          setError(null);
          try {
            const r = await callApi<{ redirect: string }>("/api/auth/recovery", { code: recovery });
            router.push(r.redirect);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't recover the account");
            setRecBusy(false);
          }
        }}
      >
        <label htmlFor="recovery-code" className="block text-sm font-semibold">
          Recovery code
        </label>
        <input
          id="recovery-code"
          required
          autoComplete="off"
          value={recovery}
          onChange={(e) => setRecovery(e.target.value.toUpperCase())}
          placeholder="XXXX-XXXX-XXXX"
          className="num min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm tracking-[0.2em] placeholder:text-muted/60 focus:border-coral"
        />
        {error && <p role="alert" className="text-sm text-[#ffb3b3]">{error}</p>}
        <Button type="submit" className="w-full" disabled={recBusy}>
          {recBusy ? "Checking…" : "Recover account"}
        </Button>
        <button type="button" onClick={() => { setMode("main"); setError(null); }} className="min-h-11 text-sm text-muted underline hover:text-warm">
          ← All sign-in options
        </button>
      </form>
    );
  }

  return (
    <div className="@container mt-8">
      <ul className="space-y-3">
        {providers.map((p) => {
          const live = p.availability === "live";
          const inner = (
            <>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
                <ProviderGlyph id={p.id} />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block font-semibold">{p.label}</span>
                <span className="block text-xs font-normal text-muted">{p.detail}</span>
              </span>
            </>
          );
          return (
            <li key={p.id}>
              {live ? (
                <a href={`/api/auth/${p.id}/start`} className={clsx(buttonClass("secondary", "lg", "w-full justify-start gap-3 text-left"))}>
                  {inner}
                </a>
              ) : (
                <div aria-disabled="true" className={clsx(buttonClass("secondary", "lg", "w-full cursor-not-allowed justify-start gap-3 opacity-55"))}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>

      <ul className="mb-3 grid grid-cols-1 gap-3 @md:grid-cols-2">
        {social.map((p) => {
          const live = p.availability === "live";
          const inner = (
            <>
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-sm font-bold">
                {p.id === "google" ? "G" : "𝕏"}
              </span>
              <span className="min-w-0 text-left">
                <span className="block font-semibold">{p.label}</span>
                {!live && <span className="block text-[0.7rem] font-normal text-muted">{p.detail}</span>}
              </span>
            </>
          );
          return (
            <li key={p.id}>
              {live ? (
                <a href={`/api/auth/${p.id}/start`} title={p.detail} className={buttonClass("secondary", "md", "w-full justify-start gap-2.5")}>
                  {inner}
                </a>
              ) : (
                <div aria-disabled="true" className={buttonClass("secondary", "md", "h-auto min-h-11 w-full cursor-not-allowed justify-start gap-2.5 py-2 opacity-55")}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button variant="secondary" onClick={() => setMode("email")} disabled={!emailEnabled}>
          {emailEnabled ? "Use email code" : "Email sign-in unavailable"}
        </Button>
        <Button onClick={startDemo} disabled={demoBusy}>
          {demoBusy ? "Building sandbox…" : "Explore demo"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">The demo is an isolated sandbox with sample credits. Nothing in it is real or redeemable.</p>
      {error && <p role="alert" className="mt-3 text-sm text-[#ffb3b3]">{error}</p>}

      <button type="button" onClick={() => setMode("recovery")} className="mt-6 min-h-11 text-sm text-muted underline hover:text-warm">
        Lost access? Use a recovery code
      </button>
    </div>
  );
}
