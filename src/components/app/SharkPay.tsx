"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Qr } from "@/components/brand/WalletPass";
import { Badge } from "@/components/ui/Badges";
import { Button, ButtonLink } from "@/components/ui/Button";
import { OrderStatus } from "./OrderStatus";
import { ApiError, callApi } from "@/lib/client";
import { brand } from "@/config/brand";
import type { OrderView } from "@/lib/server/orders/orders";
import type { SharkPaymentView } from "@/lib/server/payments/shark";
import { fmtSol } from "@/lib/format";

const POLL_MS = 5_000;

/** Pay-with-$SHARK flow: server quote, Solana Pay request, on-chain confirmation, then the order. */
export function SharkPay({ itemId, onBack, onOrder }: { itemId: string; onBack: () => void; onOrder: () => void }) {
  const [payment, setPayment] = useState<SharkPaymentView | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const started = useRef(false);

  const quote = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { payment } = await callApi<{ payment: SharkPaymentView }>("/api/checkout/shark", { action: "quote", itemId });
      setPayment(payment);
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, [itemId]);

  const check = useCallback(async (id: string) => {
    try {
      const res = await callApi<{ payment: SharkPaymentView; order: OrderView | null }>("/api/checkout/shark", { action: "check", paymentId: id });
      setPayment(res.payment);
      if (res.order) {
        setOrder(res.order);
        onOrder();
      }
    } catch (e) {
      if (e instanceof ApiError && e.code !== "chain_unavailable") setError(e.message);
    }
  }, [onOrder]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = window.setTimeout(quote, 0);
    return () => clearTimeout(t);
  }, [quote]);

  const waiting = payment?.status === "awaiting_payment";
  useEffect(() => {
    if (!payment || !waiting) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => check(payment.id), POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [payment, waiting, check]);

  if (order) return <OrderStatus initial={order} compact onChange={onOrder} />;

  if (!payment) {
    return (
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-xl border border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.07] p-3 text-sm text-[#ffb3b3]">
            {error}
          </p>
        ) : (
          <p className="text-sm text-muted" aria-live="polite">
            Getting the live {brand.ticker} price…
          </p>
        )}
        {error && (
          <Button className="w-full" variant="secondary" onClick={quote} disabled={busy}>
            Try again
          </Button>
        )}
        <Button className="w-full" variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
      </div>
    );
  }

  const secondsLeft = Math.max(0, Math.ceil((payment.expiresAt - now) / 1000));
  const expired = payment.status === "expired" || (waiting && secondsLeft === 0);
  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  if (payment.status === "refund_due" || payment.status === "refunded") {
    return (
      <div className="space-y-4">
        <Badge tone={payment.status === "refunded" ? "mint" : "butter"}>{payment.status === "refunded" ? "Refunded" : "Refund due"}</Badge>
        <p className="text-sm text-warm">{payment.note}</p>
        {payment.explorerUrl && (
          <a href={payment.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-muted underline underline-offset-4 hover:text-warm">
            View your payment on Solscan
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-midnight/40 p-5">
        <div className="grid grid-cols-[1fr_auto] items-baseline gap-y-2 text-sm">
          <span className="text-muted">Card price</span>
          <span className="num text-right">{fmtSol(payment.solPriceLamports)}</span>
          <span className="text-muted">{brand.ticker} price</span>
          <span className="num text-right">${payment.tokenUsdPrice.toPrecision(4)}</span>
          <span className="border-t border-line pt-2 font-semibold">You pay</span>
          <span className="num border-t border-line pt-2 text-right text-lg font-semibold text-mint">
            {payment.amount} {brand.ticker}
          </span>
        </div>
        <p className="mt-3 text-xs text-muted">Includes the token&apos;s transfer fee so the full price arrives. Network fees are paid in SOL by your wallet.</p>
      </div>

      {!expired ? (
        <>
          <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-[180px_1fr]">
            <div className="mx-auto aspect-square w-44 overflow-hidden rounded-2xl bg-white p-2 sm:w-full">
              <Qr message={payment.solanaPayUrl} />
            </div>
            <div className="space-y-3 text-sm">
              <p>
                Scan with Phantom, Solflare or Backpack, or open the request in your wallet on this device. The amount and
                recipient are filled in for you.
              </p>
              <ButtonLink href={payment.solanaPayUrl} className="w-full">
                Open in wallet
              </ButtonLink>
              <p className="text-xs text-muted">
                Don&apos;t send {brand.ticker} manually to an address: only this payment request can be matched to your order.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm" aria-live="polite">
            <span className="flex items-center gap-2 text-muted">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-mint/60 motion-reduce:animate-none" />
                <span className="relative size-2 rounded-full bg-mint" />
              </span>
              Waiting for your payment on Solana
            </span>
            <span className="num text-muted">Price held {mmss}</span>
          </div>
          <Button className="w-full" variant="secondary" onClick={() => check(payment.id)}>
            I&apos;ve paid · check now
          </Button>
        </>
      ) : (
        <>
          <p className="rounded-xl border border-butter/30 bg-butter/[0.07] p-3 text-sm text-butter">
            This price expired. If you already paid, check once more; otherwise get a new price.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => check(payment.id)}>
              Check again
            </Button>
            <Button onClick={quote} disabled={busy}>
              {busy ? "Refreshing…" : "New price"}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.07] p-3 text-sm text-[#ffb3b3]">
          {error}
        </p>
      )}
      <Button className="w-full" variant="ghost" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}
