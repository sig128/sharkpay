import Link from "next/link";
import { brand } from "@/config/brand";
import { Badge } from "@/components/ui/Badges";
import { fmtDateTime, fmtInt, fmtSol } from "@/lib/format";
import type { LandingPayouts } from "@/lib/server/services/public";

export function Funding({ payouts: p }: { payouts: LandingPayouts }) {
  const t = p.totals;
  const toHolders = t.pool + t.owed + t.paidHolders;
  const toOps = t.opsOwed + t.opsKept + t.paidOps;
  const max = Math.max(t.received, 1);
  const rows = [
    { label: "Creator fees received", value: t.received, tone: "bg-white/25", note: "SOL claimed into the fee wallet from pump.fun" },
    { label: `To holders · ${p.holderShareBps / 100}%`, value: toHolders, tone: "bg-sunset", note: "Split by average balance across every holder wallet" },
    { label: `Operations · ${100 - p.holderShareBps / 100}%`, value: toOps, tone: "bg-lilac/70", note: "Infrastructure, fulfilment, support" },
    { label: "Already sent to holders", value: t.paidHolders, tone: "bg-mint/70", note: "Confirmed SOL transfers on Solana" },
  ];
  return (
    <section id="transparency" className="relative scroll-mt-20 py-24 md:py-32" aria-labelledby="funding-title">
      <div className="container-site grid grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5" data-reveal="left">
          <p className="eyebrow">Reward funding</p>
          <h2 id="funding-title" className="display mt-4 text-[clamp(3rem,7vw,5.5rem)]">
            Real fees, <span className="text-sunset-flow-soft">real SOL.</span>
          </h2>
          <p className="mt-6 max-w-md text-lg text-muted">
            Holder rewards come only from the creator fees the fee wallet actually receives, never from projections or
            token sales. Every payout is a public Solana transfer you can check yourself.
          </p>
          <div className="mt-8 rounded-2xl border border-line p-5 text-sm text-muted">
            <div className="eyebrow mb-3">How payouts are set up</div>
            <ul className="space-y-1.5">
              <li>Holder share of creator fees: <span className="num text-warm">{p.holderShareBps / 100}%</span></li>
              <li>Payout run: every <span className="num text-warm">{p.intervalMinutes} minutes</span></li>
              <li>Paid automatically once owed: <span className="num text-warm">{fmtSol(p.minPayoutLamports)}</span></li>
              <li>Rewards paid in: <span className="num text-warm">SOL</span></li>
            </ul>
            <p className="mt-3">
              The coin&apos;s trading fee is shown as <span className="num text-warm">{p.tradeFeeBps / 100}%</span>, but
              pump.fun sets the real fee and the creator&apos;s cut of it. Holders get {p.holderShareBps / 100}% of whatever
              the fee wallet actually receives.
            </p>
          </div>
        </div>

        <div className="lg:col-span-7" data-reveal="zoom">
          <div className="panel p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">Where rewards come from</h3>
              {p.live ? <Badge tone="mint">Live</Badge> : <Badge>Not live yet</Badge>}
            </div>
            {!p.live && (
              <p className="mt-4 rounded-xl bg-white/[0.03] p-4 text-sm text-muted">
                Automatic payouts haven&apos;t started, so every figure is zero. They start once {brand.ticker} has launched
                and the fee wallet is connected.
              </p>
            )}
            <ol className="mt-6 space-y-5" data-reveal-stagger="140">
              {rows.map((r) => (
                <li key={r.label}>
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="font-medium">{r.label}</span>
                    <span className="num text-warm">{fmtSol(r.value)}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/[0.06]">
                    <div className={`bar-grow h-full rounded-full ${r.tone}`} style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />
                  </div>
                  <div className="mt-1.5 text-xs text-muted">{r.note}</div>
                </li>
              ))}
            </ol>

            <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
              {[
                ["Received", fmtSol(t.received)],
                ["Paid to holders", fmtSol(t.paidHolders)],
                ["Owed, accumulating", fmtSol(t.owed)],
                ["Wallets paid", fmtInt(t.holdersPaid)],
              ].map(([k, v]) => (
                <div key={k} className="bg-surface p-4">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="num mt-1 text-lg">{v}</dd>
                </div>
              ))}
            </dl>

            {p.recentPayouts.length > 0 && (
              <ul className="mt-6 divide-y divide-line text-sm">
                {p.recentPayouts.map((x) => (
                  <li key={`${x.signature}:${x.wallet}`} className="flex items-center justify-between gap-3 py-2.5">
                    <a href={x.explorerUrl} target="_blank" rel="noreferrer" className="num text-xs text-coral hover:underline">
                      {x.masked}
                    </a>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted">{fmtDateTime(x.paidAt)}</span>
                      <span className="num text-mint">+{fmtSol(x.lamports)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 font-mono text-xs text-muted">
              {p.lastCycleAt ? `Last payout run ${fmtDateTime(p.lastCycleAt)}` : "No payout run yet"} ·{" "}
              <Link href="/app/transparency" className="text-coral hover:underline">
                Full report
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
