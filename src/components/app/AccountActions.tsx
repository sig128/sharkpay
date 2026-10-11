"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ApiError, callApi } from "@/lib/client";

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-[#ffb3b3]">
      {error}
    </p>
  );
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm placeholder:text-muted/60 focus:border-coral";

/** Two-step email code form used for sign-in, linking and re-authentication. */
export function EmailCodeForm({
  purpose,
  cta,
  devMode,
  platform,
  onDone,
}: {
  purpose: "login" | "link" | "reauth";
  cta: string;
  devMode: boolean;
  platform?: string;
  onDone?: (redirect?: string) => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idBase = `email-${purpose}`;

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === "email") {
          void run(async () => {
            const r = await callApi<{ devCode?: string }>("/api/auth/email/request", { email });
            setDevCode(r.devCode ?? null);
            setStep("code");
          });
        } else {
          void run(async () => {
            const r = await callApi<{ redirect?: string }>("/api/auth/email/verify", { email, code, purpose, platform });
            if (onDone) onDone(r.redirect);
            else if (r.redirect) router.push(r.redirect);
            else router.refresh();
          });
        }
      }}
    >
      {step === "email" ? (
        <div>
          <label htmlFor={`${idBase}-addr`} className="mb-1.5 block text-sm font-semibold">
            Email
          </label>
          <input id={`${idBase}-addr`} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
        </div>
      ) : (
        <div>
          <label htmlFor={`${idBase}-code`} className="mb-1.5 block text-sm font-semibold">
            6-digit code sent to {email}
          </label>
          <input
            id={`${idBase}-code`}
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${inputClass} num tracking-[0.4em]`}
          />
          {devMode && devCode && (
            <p className="mt-2 rounded-lg bg-butter/10 p-2 font-mono text-xs text-butter">
              Development outbox (no email provider configured): <strong>{devCode}</strong>
            </p>
          )}
          <button type="button" className="mt-2 min-h-11 text-xs text-muted underline" onClick={() => { setStep("email"); setCode(""); }}>
            Use a different email
          </button>
        </div>
      )}
      <ErrorText error={error} />
      <Button type="submit" variant={purpose === "login" ? "primary" : "secondary"} className="w-full" disabled={busy}>
        {busy ? "Working…" : step === "email" ? cta : "Verify code"}
      </Button>
    </form>
  );
}

export function UnlinkButton({ kind, id, label, disabled }: { kind: "identity" | "wallet"; id: string; label: string; disabled?: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setConfirming(true)} title={disabled ? "Confirm it's you first" : undefined}>
        Unlink
      </Button>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={busy}
          aria-label={`Confirm unlinking ${label}`}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              if (kind === "identity") await callApi("/api/account", { action: "unlink_identity", identityId: id });
              else await callApi("/api/wallet", { action: "unlink", walletId: id });
              router.refresh();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Couldn't unlink");
              setBusy(false);
            }
          }}
        >
          {busy ? "Unlinking…" : "Confirm unlink"}
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

export function RecoveryCodes({ remaining, total, canGenerate }: { remaining: number; total: number; canGenerate: boolean }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        If you lose access to your sign-in methods, a single-use recovery code signs you in. {total ? `${remaining} of ${total} codes unused.` : "You haven't generated codes yet."}
      </p>
      {codes && (
        <div className="rounded-2xl border border-butter/30 bg-butter/5 p-4">
          <p className="mb-3 text-sm text-butter">Save these now. They won&apos;t be shown again, and any older codes stopped working.</p>
          <ul className="num grid grid-cols-2 gap-2 text-sm">
            {codes.map((c) => (
              <li key={c} className="rounded-lg bg-midnight/60 px-3 py-2 text-center">{c}</li>
            ))}
          </ul>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>
            Copy all
          </Button>
        </div>
      )}
      <ErrorText error={error} />
      <Button
        variant="secondary"
        disabled={!canGenerate || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await callApi<{ codes: string[] }>("/api/account", { action: "recovery_codes" });
            setCodes(r.codes);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't generate codes");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Generating…" : total ? "Generate new codes" : "Generate recovery codes"}
      </Button>
      {!canGenerate && <p className="text-xs text-muted">Confirm it&apos;s you first.</p>}
    </div>
  );
}

export function SignOutEverywhere({ demo }: { demo: boolean }) {
  const [busy, setBusy] = useState<null | "here" | "all">(null);
  const out = async (everywhere: boolean) => {
    setBusy(everywhere ? "all" : "here");
    const r = await callApi<{ redirect: string }>("/api/auth/logout", { everywhere }).catch(() => ({ redirect: "/" }));
    window.location.assign(r.redirect);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => out(false)} disabled={busy !== null}>
        {busy === "here" ? "Signing out…" : demo ? "End demo" : "Sign out"}
      </Button>
      {!demo && (
        <Button variant="danger" onClick={() => out(true)} disabled={busy !== null}>
          {busy === "all" ? "Signing out…" : "Sign out everywhere"}
        </Button>
      )}
    </div>
  );
}
