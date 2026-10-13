"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import bs58 from "bs58";
import { Button } from "@/components/ui/Button";
import { ApiError, callApi } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import { UnlinkButton } from "./AccountActions";

/**
 * Message-signing only. The app never asks a wallet to sign a transaction,
 * approve token spending, or reveal a seed phrase.
 */
interface InjectedSolana {
  publicKey?: { toString(): string } | null;
  connect(): Promise<unknown>;
  signMessage(message: Uint8Array, encoding?: "utf8"): Promise<Uint8Array | { signature: Uint8Array }>;
}

type WalletId = "phantom" | "solflare" | "backpack";

function detect(): Array<{ id: WalletId; name: string; provider: InjectedSolana }> {
  const w = window as unknown as {
    phantom?: { solana?: InjectedSolana & { isPhantom?: boolean } };
    solflare?: InjectedSolana & { isSolflare?: boolean };
    backpack?: InjectedSolana;
  };
  const found: Array<{ id: WalletId; name: string; provider: InjectedSolana }> = [];
  if (w.phantom?.solana?.isPhantom) found.push({ id: "phantom", name: "Phantom", provider: w.phantom.solana });
  if (w.solflare?.isSolflare) found.push({ id: "solflare", name: "Solflare", provider: w.solflare });
  if (w.backpack?.signMessage) found.push({ id: "backpack", name: "Backpack", provider: w.backpack });
  return found;
}

export function WalletLinker({
  wallets,
  canChange,
}: {
  wallets: Array<{ id: string; address: string; verifiedAt: number }>;
  canChange: boolean;
}) {
  const router = useRouter();
  const [available, setAvailable] = useState<ReturnType<typeof detect> | null>(null);
  const [busy, setBusy] = useState<WalletId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setAvailable(detect()), 300);
    return () => clearTimeout(t);
  }, []);

  async function link(id: WalletId, provider: InjectedSolana) {
    setBusy(id);
    setError(null);
    try {
      const res = (await provider.connect()) as { publicKey?: { toString(): string } } | undefined;
      const address = (res?.publicKey ?? provider.publicKey)?.toString();
      if (!address) throw new Error("The wallet didn't share an address");
      const challenge = await callApi<{ id: string; message: string }>("/api/wallet", { action: "challenge", address });
      setMessage(challenge.message);
      const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), "utf8");
      const signature = signed instanceof Uint8Array ? signed : signed.signature;
      await callApi("/api/wallet", { action: "verify", challengeId: challenge.id, signature: bs58.encode(signature) });
      setMessage(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error && /reject|cancel|denied/i.test(err.message) ? "Signature request was cancelled." : err instanceof Error ? err.message : "Couldn't link wallet");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {wallets.length ? (
        <ul className="divide-y divide-line">
          {wallets.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <div className="num text-sm">{w.address}</div>
                <div className="text-xs text-muted">Verified {fmtDate(w.verifiedAt)}</div>
              </div>
              <UnlinkButton kind="wallet" id={w.id} label={`wallet ${w.address}`} disabled={!canChange} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No wallet linked. Holder wallets are paid automatically either way; link one to see its rewards here.</p>
      )}

      <div className="rounded-2xl border border-line bg-white/[0.02] p-4 text-xs leading-relaxed text-muted">
        Linking asks your wallet to <strong className="text-warm">sign a text message</strong>. It does not approve any
        transaction, transfer or token spending. We will never ask for your seed phrase.
      </div>

      {message && (
        <details className="text-xs text-muted">
          <summary className="min-h-11 cursor-pointer py-2">Message you&apos;re signing</summary>
          <pre className="whitespace-pre-wrap break-all rounded-xl bg-midnight/60 p-3 font-mono">{message}</pre>
        </details>
      )}

      {error && (
        <p role="alert" className="text-sm text-[#ffb3b3]">
          {error}
        </p>
      )}

      {available === null ? null : available.length ? (
        <div className="flex flex-wrap gap-2">
          {available.map((w) => (
            <Button key={w.id} variant="secondary" size="sm" disabled={!canChange || busy !== null} onClick={() => link(w.id, w.provider)}>
              {busy === w.id ? "Waiting for wallet…" : `Link with ${w.name}`}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No Solana wallet extension detected in this browser. Install Phantom, Solflare or Backpack, then reload.</p>
      )}
      {!canChange && <p className="text-xs text-muted">Confirm it&apos;s you to link or unlink wallets.</p>}
    </div>
  );
}
