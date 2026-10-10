import { brand } from "@/config/brand";
import { PreviewBadge } from "@/components/ui/Badges";
import { fmtDateTime, fmtInt, fmtUsd } from "@/lib/format";
import type { Transparency } from "@/lib/server/services/dashboard";

export function Funding({ t }: { t: Transparency }) {
  const s = t.settlement;
  const max = Math.max(s.grossUsd, 1);
  const rows = [
    { label: "Settled gross proceeds", value: s.grossUsd, tone: "bg-white/25", note: `${fmtInt(t.tokens.sold)} ${brand.ticker} sold from collected fees` },
    { label: "Swap, network and venue costs", value: -s.costsUsd, tone: "bg-[#ff6b6b]/60", note: "Actual deductions on settlement" },
    { label: "Net settled proceeds", value: s.netUsd, tone: "bg-warm/70", note: "What funding is based on" },
    { label: `Holder reward pool · ${t.config.holderShareBps / 100}%`, value: s.holderUsd, tone: "bg-sunset", note: `Backs ${fmtInt(t.credits.funded)} credits at ${fmtUsd(t.config.usdMicrosPerCredit / 1e6)} each` },
    { label: `Operations & reserves · ${100 - t.config.holderShareBps / 100}%`, value: s.opsUsd, tone: "bg-lilac/70", note: "Infrastructure, fulfilment, support" },
  ];
  return (
    <section id="transparency" className="relative scroll-mt-20 py-24 md:py-32" aria-labelledby="funding-title">
      <div className="container-site grid grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5" data-reveal="left">
          <p className="eyebrow">Reward funding</p>
          <h2 id="funding-title" className="display mt-4 text-[clamp(3rem,7vw,5.5rem)]">
            Every credit <span className="text-sunset-flow-soft">is backed.</span>
          </h2>
          <p className="mt-6 max-w-md text-lg text-muted">
            Credits are created only from fees that were actually collected and sold, never from trading volume,
            projections or unsold tokens. Funded credits are never more than the money set aside for them.
          </p>
          <div className="mt-8 rounded-2xl border border-line p-5 text-sm text-muted">
            <div className="eyebrow mb-3">Demo configuration — not a deployed contract</div>
            <ul className="space-y-1.5">
              <li>Token-2022 transfer fee: <span className="num text-warm">{t.config.feeBps / 100}%</span> (illustrative)</li>
              <li>Holder share of net settled proceeds: <span className="num text-warm">{t.config.holderShareBps / 100}%</span></li>
              <li>Credit backing: <span className="num text-warm">{fmtUsd(t.config.usdMicrosPerCredit / 1e6)}</span> of holder funding per credit</li>
              <li>Pending clearance: <span className="num text-warm">{t.config.clearanceHours}h</span> · period length <span className="num text-warm">{t.config.periodDays} days</span></li>
            </ul>
            <p className="mt-3">
              Transfer fees apply to every transfer, not only trades, and stay in tokens until they are settled. Fee and
              withdrawal authorities are disclosed for the live mint before launch.
            </p>
          </div>
        </div>

        <div className="lg:col-span-7" data-reveal="zoom">
          <div className="panel p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">Where rewards come from</h3>
              <PreviewBadge label="Sample data" />
            </div>
            <ol className="mt-6 space-y-5" data-reveal-stagger="140">
              {rows.map((r) => (
                <li key={r.label}>
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="font-medium">{r.label}</span>
                    <span className="num text-warm">{r.value < 0 ? "−" : ""}{fmtUsd(Math.abs(r.value))}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/[0.06]">
                    <div className={`bar-grow h-full rounded-full ${r.tone}`} style={{ width: `${Math.max(1.5, (Math.abs(r.value) / max) * 100)}%` }} />
                  </div>
                  <div className="mt-1.5 text-xs text-muted">{r.note}</div>
                </li>
              ))}
            </ol>

            <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
              {[
                ["Credits funded", fmtInt(t.credits.funded)],
                ["Allocated to members", fmtInt(t.credits.allocated)],
                ["Unallocated (carried)", fmtInt(t.credits.unallocated)],
                ["Outstanding obligations", fmtInt(t.credits.outstanding)],
              ].map(([k, v]) => (
                <div key={k} className="bg-surface p-4">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="num mt-1 text-lg">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 rounded-xl bg-white/[0.03] p-4 text-sm text-muted">
              <span className="text-warm">Token inventory is not cash.</span> {fmtInt(t.tokens.inventory)} {brand.ticker}{" "}
              of collected fees haven&apos;t been sold yet, so they fund nothing until they are.
            </div>
            {t.lastUpdated && <p className="mt-4 font-mono text-xs text-muted">Sample data generated {fmtDateTime(t.lastUpdated)}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
