"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Button } from "@/components/ui/Button";
import { EmailCodeForm } from "@/components/app/AccountActions";
import { ApiError, callApi } from "@/lib/client";
import type { GamingProviderInfo, SocialProviderInfo } from "@/lib/server/auth/providers";
import { GoogleLogo, MicrosoftLogo, PlayStationLogo, SteamLogo, XLogo } from "@/components/brand/ProviderLogos";

type ProviderId = GamingProviderInfo["id"] | SocialProviderInfo["id"];

const LOGOS: Record<ProviderId, (p: { className?: string }) => ReactNode> = {
  microsoft: MicrosoftLogo,
  playstation: PlayStationLogo,
  steam: SteamLogo,
  google: GoogleLogo,
  x: XLogo,
};

const ORDER: ProviderId[] = ["google", "x", "microsoft", "playstation", "steam"];

interface Tile {
  id: ProviderId;
  name: string;
  label: string;
  href: string | null;
  onClick?: () => void;
  badge?: string;
  note: string;
}

function ProviderTile({ tile, onBlocked }: { tile: Tile; onBlocked: (note: string) => void }) {
  const Logo = LOGOS[tile.id];
  const disabled = !tile.href && !tile.onClick;
  const face = (
    <>
      <span
        className={clsx(
          "relative flex size-12 items-center sm:size-14 justify-center rounded-2xl border border-line bg-white/[0.04] transition-[transform,border-color,background] duration-200",
          !disabled && "group-hover:-translate-y-0.5 group-hover:border-line-strong group-hover:bg-white/[0.09]",
          disabled && "opacity-45 grayscale",
        )}
      >
        <Logo className="size-5 text-warm sm:size-6" />
        {tile.badge && (
          <span className="absolute -right-1.5 -top-1.5 rounded-full border border-line bg-midnight px-1.5 py-px text-[0.6rem] font-semibold uppercase tracking-wide text-butter">
            {tile.badge}
          </span>
        )}
      </span>
      <span className={clsx("text-[0.7rem] font-medium", disabled ? "text-muted/70" : "text-muted group-hover:text-warm")}>{tile.name}</span>
    </>
  );
  const cls = "group flex w-14 flex-col sm:w-16 items-center gap-1.5 rounded-2xl outline-offset-4";
  if (tile.href)
    return (
      <a href={tile.href} aria-label={tile.label} title={tile.note} className={cls}>
        {face}
      </a>
    );
  return (
    <button
      type="button"
      aria-label={disabled ? `${tile.label} (${tile.note})` : tile.label}
      aria-disabled={disabled || undefined}
      title={tile.note}
      onClick={() => (disabled ? onBlocked(tile.note) : tile.onClick?.())}
      className={clsx(cls, disabled && "cursor-not-allowed")}
    >
      {face}
    </button>
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
  const [note, setNote] = useState<string | null>(null);

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

  if (mode === "email") {
    return (
      <div className="mt-8 space-y-4">
        <EmailCodeForm purpose="login" cta="Email me a code" devMode={devMode} onDone={(to) => router.push(to ?? "/app")} />
        <p className="text-xs text-muted">We&apos;ll email you a 6-digit code. No password needed.</p>
        <button type="button" onClick={() => setMode("main")} className="min-h-11 text-sm text-muted underline hover:text-warm">
          ← All sign-in options
        </button>
      </div>
    );
  }

  const google = social.find((p) => p.id === "google");
  const googleLive = google?.availability === "live";

  const tiles: Tile[] = [...social, ...providers]
    .filter((p) => p.id !== "google")
    .map((p): Tile => {
      if (p.id === "playstation")
        return emailEnabled
          ? { id: p.id, name: p.name, label: "PlayStation players: sign in with an email code", href: null, onClick: () => setMode("email"), badge: "Email", note: "Sign in with an email code, then pick PlayStation as your platform" }
          : { id: p.id, name: p.name, label: "PlayStation sign-in", href: null, badge: "Soon", note: "PlayStation sign-in is coming soon" };
      const live = p.availability === "live";
      return {
        id: p.id,
        name: p.name,
        label: p.label,
        href: live ? `/api/auth/${p.id}/start` : null,
        badge: live ? undefined : "Soon",
        note: live ? p.detail : `${p.name} sign-in isn't switched on yet`,
      };
    })
    .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

  return (
    <div className="mt-8">
      {googleLive ? (
        <a
          href="/api/auth/google/start"
          className="flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-white px-5 text-sm font-semibold text-[#1f1f1f] shadow-sm transition-colors hover:bg-white/90"
        >
          <GoogleLogo className="size-5" />
          Continue with Google
        </a>
      ) : (
        <button
          type="button"
          disabled
          className="flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-3 rounded-full bg-white/10 px-5 text-sm font-semibold text-muted"
        >
          <GoogleLogo className="size-5 opacity-60 grayscale" />
          Google sign-in isn&apos;t switched on yet
        </button>
      )}

      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> or continue with <span className="h-px flex-1 bg-line" />
      </div>

      <ul className="flex flex-wrap justify-center gap-x-2.5 gap-y-4 sm:justify-start sm:gap-x-3" aria-label="Sign in with">
        {tiles.map((t) => (
          <li key={t.id}>
            <ProviderTile tile={t} onBlocked={setNote} />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted" aria-live="polite">
        {note ?? "You sign in on the provider's own page. We never see your password."}
      </p>
      <p className="mt-1.5 text-xs text-muted">
        By continuing you agree to the{" "}
        <a href="/terms" className="text-warm/90 underline underline-offset-2">Terms</a> and{" "}
        <a href="/privacy" className="text-warm/90 underline underline-offset-2">Privacy Policy</a>.
      </p>

      {emailEnabled && (
        <button type="button" onClick={() => setMode("email")} className="mt-3 min-h-11 text-sm text-muted underline hover:text-warm">
          Sign in with an email code instead
        </button>
      )}

      <Button variant="secondary" className="mt-6 w-full" onClick={startDemo} disabled={demoBusy}>
        {demoBusy ? "Building sandbox…" : "Explore demo"}
      </Button>
      <p className="mt-3 text-xs text-muted">The demo is an isolated sandbox with sample data. Nothing in it is real or redeemable.</p>
      {error && <p role="alert" className="mt-3 text-sm text-[#ffb3b3]">{error}</p>}

      <button type="button" onClick={() => setMode("recovery")} className="mt-6 min-h-11 text-sm text-muted underline hover:text-warm">
        Lost access? Use a recovery code
      </button>
    </div>
  );
}
