import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { requirePageSession } from "@/lib/server/guard";
import { transparency } from "@/lib/server/services/dashboard";
import { PageHeader, Panel, KV } from "@/components/app/Page";
import { Badge, PreviewBadge } from "@/components/ui/Badges";
import { fmtDate, fmtDateTime, fmtInt, fmtSol, fmtTokens, fmtUsd } from "@/lib/format";

export const metadata: Metadata = { title: "Transparency" };

export default async function TransparencyPage() {
  const { session } = await requirePageSession();
  const t = transparency(session.realm);
  const ops = t.operatingCosts.reduce((s, c) => s + c.usd, 0);
  const tok = (n: number) => <span className="num whitespace-nowrap">{fmtTokens(n, brand.ticker)}</span>;
  const usd = (n: number) => <span className="num">{fmtUsd(n)}</span>;
  const sol = (n: number) => <span className="num">{fmtSol(n)}</span>;
  const hasData = t.settlement.count > 0 || t.periods.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Transparency"
        title="Where rewards come from"
        actions={t.isSample ? <PreviewBadge label="Sample values" /> : t.lastUpdated ? <Badge tone="mint">Live · updated {fmtDateTime(t.lastUpdated)}</Badge> : <Badge>No live data yet</Badge>}
      >
        Fees are collected in tokens, sold for settlement assets, and only then fund rewards. Token inventory is shown
        separately because unsold tokens back nothing.
      </PageHeader>

      {!hasData && !t.isSample && (
        <p className="mb-6 rounded-2xl border border-line bg-white/[0.03] p-5 text-sm text-muted">
          No verified chain events or settlements have been ingested for the live mint yet, so every figure is zero. Values
          appear here only after the indexer pushes finalized data.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel title={`Collected fees · token inventory (${brand.ticker})`} className="lg:col-span-6">
          <KV
            items={[
              ["Withheld in holder accounts (not yet harvested)", tok(t.tokens.withheldNotHarvested)],
              ["Harvested to mint (not yet withdrawn)", tok(t.tokens.harvestedNotWithdrawn)],
              ["Collected to treasury", tok(t.tokens.collected)],
              ["Sold in settlements", tok(t.tokens.sold)],
              [<strong key="i" className="text-warm">Unsold token inventory</strong>, tok(t.tokens.inventory)],
            ]}
          />
          <p className="mt-3 text-xs text-muted">Tokens, not cash. Their market value is not counted as funding.</p>
        </Panel>

        <Panel title="Settled proceeds (USD stablecoin)" className="lg:col-span-6">
          <KV
            items={[
              ["Settlements", <span key="n" className="num">{t.settlement.count}</span>],
              ["Gross proceeds", sol(t.settlement.grossLamports)],
              ["Swap, network and venue costs", <span key="c" className="num">−{fmtSol(t.settlement.costsLamports)}</span>],
              [<strong key="n2" className="text-warm">Net settled proceeds</strong>, sol(t.settlement.netLamports)],
              [`Holder reward pool (${t.config.holderShareBps / 100}%)`, sol(t.settlement.holderLamports)],
              [`Operations & reserves (${100 - t.config.holderShareBps / 100}%)`, sol(t.settlement.opsLamports)],
            ]}
          />
          {t.lastSettlement && <p className="mt-3 font-mono text-xs text-muted">Last settlement {fmtDateTime(t.lastSettlement)}</p>}
        </Panel>

        <Panel title="SOL reward obligations" className="lg:col-span-6">
          <KV
            items={[
              ["SOL funded from settled fees", sol(t.rewards.funded)],
              ["Allocated to members", sol(t.rewards.allocated)],
              ["Unallocated (carried forward)", sol(t.rewards.unallocated)],
              [<strong key="o" className="text-warm">Outstanding</strong>, sol(t.rewards.outstanding)],
              ["· pending", sol(t.rewards.pending)],
              ["· ready to pay out", sol(t.rewards.payable)],
              ["· already paid", sol(t.rewards.paid)],
              ["Completed card orders", <span key="r" className="num">{t.redemptions.count}</span>],
            ]}
          />
          <div className="mt-4 flex items-center gap-2 text-sm">
            {t.rewards.backed ? <Badge tone="mint">Fully backed</Badge> : <Badge tone="danger">Backing check failed</Badge>}
            <span className="text-muted">Outstanding + unallocated ≤ funded − paid</span>
          </div>
        </Panel>

        <Panel title="Operating costs" className="lg:col-span-6">
          {t.operatingCosts.length ? (
            <KV items={[...t.operatingCosts.map((c) => [<span key={c.label}>{c.label} <span className="font-mono text-xs">· {fmtDate(c.at)}</span></span>, usd(c.usd)] as [React.ReactNode, React.ReactNode]), [<strong key="tot" className="text-warm">Recorded operating costs</strong>, usd(ops)]]} />
          ) : (
            <p className="text-sm text-muted">No operating costs recorded.</p>
          )}
        </Panel>

        <Panel title="Reward periods" className="lg:col-span-12">
          <div className="-mx-5 overflow-x-auto md:-mx-6">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Reward periods</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  {["Period", "Window (UTC)", "Status", "Budget", "Allocated", "Carried forward", "Eligible wallets"].map((h) => (
                    <th key={h} scope="col" className="px-5 py-2 font-semibold md:px-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {t.periods.map((p) => (
                  <tr key={p.seq}>
                    <td className="num px-5 py-3 md:px-6">#{p.seq}</td>
                    <td className="num px-5 py-3 text-xs md:px-6">{fmtDate(p.startsAt)} – {fmtDate(p.endsAt)}</td>
                    <td className="px-5 py-3 md:px-6">{p.status === "finalized" ? <Badge tone="mint">Finalized</Badge> : <Badge>Open</Badge>}</td>
                    <td className="num px-5 py-3 md:px-6">{p.budget === null ? "—" : fmtInt(p.budget)}</td>
                    <td className="num px-5 py-3 md:px-6">{p.allocated === null ? "—" : fmtInt(p.allocated)}</td>
                    <td className="num px-5 py-3 md:px-6">{p.carried === null ? "—" : fmtInt(p.carried)}</td>
                    <td className="num px-5 py-3 md:px-6">{p.eligibleWallets ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted">
            Allocation = funded period budget × your time-weighted eligible weight ÷ total eligible weight, rounded down.
            Rounding dust, shares of wallets not linked to a member, and whole budgets with zero eligible weight carry forward.
          </p>
        </Panel>

        <Panel title="Excluded accounts" className="lg:col-span-7">
          {t.exclusions.length ? (
            <ul className="divide-y divide-line text-sm">
              {t.exclusions.map((x) => (
                <li key={x.address} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>{x.label}</span>
                  <span className="flex items-center gap-2">
                    <Badge>{x.kind.replace(/_/g, " ")}</Badge>
                    <span className="num text-xs text-muted">{x.address}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No exclusions configured.</p>
          )}
          <p className="mt-3 text-xs text-muted">Pools, exchanges, treasury and authority accounts never receive allocations as if they were members.</p>
        </Panel>

        <Panel title="Configuration" className="lg:col-span-5">
          <KV
            items={[
              ["Token program", t.config.tokenProgram === "token-2022" ? "Token-2022 (TransferFee)" : "SPL Token"],
              ["Mint", <span key="m" className="num text-xs">{t.config.mint ?? (t.isSample ? "Sample" : "Not configured")}</span>],
              ["Transfer fee", `${t.config.feeBps / 100}%${t.isSample ? " (illustrative)" : ""}`],
              ["Holder share", `${t.config.holderShareBps / 100}% of net settled proceeds`],
              ["Pending clearance", `${t.config.clearanceHours} hours`],
              ["Period length", `${t.config.periodDays} days`],
              ["Minimum average balance", fmtTokens(t.config.minEligibleTokens, brand.ticker)],
              ["Chain data through", t.dataThrough ? <span key="d" className="num text-xs">{fmtDateTime(t.dataThrough)}</span> : "—"],
            ]}
          />
          {t.isSample && <p className="mt-3 text-xs text-butter">Demo configuration for illustration. Not a deployed contract.</p>}
        </Panel>
      </div>
    </>
  );
}
