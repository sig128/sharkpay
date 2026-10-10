"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError, callApi } from "@/lib/client";

export function Waitlist() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "already">("idle");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col justify-center gap-3 rounded-2xl border border-line bg-midnight/40 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError(null);
        try {
          const r = await callApi<{ alreadyJoined: boolean }>("/api/waitlist", { email });
          setState(r.alreadyJoined ? "already" : "done");
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Something went wrong");
          setState("idle");
        }
      }}
    >
      <label htmlFor="wl-email" className="text-sm font-semibold">
        Get notified if it launches
      </label>
      <p className="text-xs text-muted">Joining the waitlist doesn&apos;t create a card, an account with an issuer, or any obligation.</p>
      {state === "done" || state === "already" ? (
        <p role="status" className="rounded-xl bg-mint/10 p-3 text-sm text-mint">
          {state === "done" ? "You're on the list. We'll only email you about this feature." : "That email is already on the list."}
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="wl-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="min-h-11 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-sm placeholder:text-muted/60 focus:border-coral"
          />
          <Button type="submit" disabled={state === "busy"}>
            {state === "busy" ? "Joining…" : "Join waitlist"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-[#ffb3b3]">
          {error}
        </p>
      )}
    </form>
  );
}
