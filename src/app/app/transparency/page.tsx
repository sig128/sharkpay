import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { requirePageSession } from "@/lib/server/guard";
import { solscanAccount, solscanTx, transparency } from "@/lib/server/services/dashboard";
import { PageHeader, Panel, KV } from "@/components/app/Page";
import { Badge } from "@/components/ui/Badges";
import { fmtDateTime, fmtInt, fmtSol, fmtTokens } from "@/lib/format";

export const metadata: Metadata = { title: "Transparency" };

const STATUS_TONE: Record<string, "mint" | "butter" | "danger" | "neutral"> = {
  done: "mint",
  waiting: "butter",
  running: "butter",
  error: "danger",
};

function Address({ address }: { address: string | null }) {
  if (!address) return <span className="text-muted">Not configured</span>;
  return (
    <a href={solscanAccount(address)} target="_blank" rel="noreferrer" className="num break-all text-xs text-coral hover:underline">
      {address}
    </a>
  );
}

export default async function TransparencyPage() {
  await requirePageSession();
  const t = transparency();
  const sol = (n: number) => <span className="num">{fmtSol(n)}</span>;
  const toHolders = t.totals.pool + t.totals.owed + t.totals.paidHolders;
  const toOps = t.totals.opsOwed + t.totals.opsKept + t.totals.paidOps;

  return (
    <>
      <PageHeader
        eyebrow="Transparency"
        title="Where rewards come from"
        actions={
          t.live ? (
            <Badge tone="mint">Live{t.lastCycleAt ? ` · last run ${fmtDateTime(t.lastCycleAt)}` : ""}</Badge>
          ) : (
            <Badge>Not live yet</Badge>
          )
        }
      >
        Creator fees from {brand.ticker} trading are claimed into the fee wallet every {t.intervalMinutes} minutes.{" "}
        {t.holderShareBps / 100}% of each run&apos;s new SOL goes to holders by average balance and is sent automatically.
        Every figure below comes from the payout ledger and on-chain transfers.
      </PageHeader>

      {!t.live && (
        <p className="mb-6 rounded-2xl border border-line bg-white/[0.03] p-5 text-sm text-muted">
          <strong className="text-warm">Automatic payouts aren&apos;t running yet.</strong> {t.blocker} Until then every
          figure is zero.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel title="Totals" className="lg:col-span-6">
          <KV
            items={[
              ["Creator fees received", sol(t.totals.received)],
              [`To holders (${t.holderShareBps / 100}%)`, sol(toHolders)],
              [<strong key="p" className="text-warm">Paid to holders</strong>, sol(t.totals.paidHolders)],
              ["Owed to holders, accumulating", sol(t.totals.owed)],
              ["Not yet credited (rounding, carried to next run)", sol(t.totals.pool)],
              ["Wallets paid so far", <span key="h" className="num">{fmtInt(t.totals.holdersPaid)}</span>],
              ["Holders in latest snapshot", <span key="n" className="num">{t.holdersNow === null ? "—" : fmtInt(t.holdersNow)}</span>],
            ]}
          />
        </Panel>

        <Panel title="Operations share and obligations" className="lg:col-span-6">
          <KV
            items={[
              [`Operations (${100 - t.holderShareBps / 100}%)`, sol(toOps)],
              ["· sent to the operations wallet", sol(t.totals.paidOps)],
              ["· waiting to be sent", sol(t.totals.opsOwed)],
              ["· kept in the fee wallet", sol(t.totals.opsKept)],
              [<strong key="l" className="text-warm">SOL the fee wallet holds for others</strong>, sol(t.totals.liabilities)],
            ]}
          />
          <p className="mt-3 text-xs text-muted">
            Obligations are what holders and operations are owed but haven&apos;t been sent yet. The fee wallet must always hold
            at least this much.
          </p>
        </Panel>

        <Panel title="Recent payout runs" className="lg:col-span-12">
          {t.recentCycles.length ? (
            <div className="-mx-5 overflow-x-auto md:-mx-6">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">Recent payout runs</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    {["Started (UTC)", "Status", "New fees", "To holders", "Holders", "Paid", "Wallets paid", "Claim"].map((h) => (
                      <th key={h} scope="col" className="px-5 py-2 font-semibold md:px-6">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {t.recentCycles.map((c) => (
                    <tr key={c.id}>
                      <td className="num px-5 py-3 text-xs md:px-6">{fmtDateTime(c.startedAt)}</td>
                      <td className="px-5 py-3 md:px-6"><Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Badge></td>
                      <td className="num px-5 py-3 md:px-6">{fmtSol(c.incomeLamports)}</td>
                      <td className="num px-5 py-3 md:px-6">{fmtSol(c.holderLamports)}</td>
                      <td className="num px-5 py-3 md:px-6">{fmtInt(c.holders)}</td>
                      <td className="num px-5 py-3 md:px-6">{fmtSol(c.paidLamports)}</td>
                      <td className="num px-5 py-3 md:px-6">{fmtInt(c.paidWallets)}</td>
                      <td className="px-5 py-3 md:px-6">
                        {c.claimSignature ? (
                          <a href={solscanTx(c.claimSignature)} target="_blank" rel="noreferrer" className="text-xs text-coral hover:underline">
                            Solscan
                          </a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">No payout run yet.</p>
          )}
        </Panel>

        <Panel title="Recent payouts" className="lg:col-span-7">
          {t.recentPayouts.length ? (
            <ul className="divide-y divide-line text-sm">
              {t.recentPayouts.map((p) => (
                <li key={`${p.signature}:${p.wallet}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <a href={p.explorerUrl} target="_blank" rel="noreferrer" className="num text-xs text-coral hover:underline">
                    {p.masked}
                  </a>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted">{fmtDateTime(p.paidAt)}</span>
                    <span className="num text-mint">+{fmtSol(p.lamports)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No SOL has been sent to holders yet.</p>
          )}
        </Panel>

        <Panel title="Configuration" className="lg:col-span-5">
          <KV
            items={[
              ["Mint", t.mint ? <Address key="m" address={t.mint} /> : <span key="m" className="text-muted">Not launched yet</span>],
              ["Fee wallet", <Address key="f" address={t.feeWallet} />],
              ["Operations wallet", t.opsWallet ? <Address key="o" address={t.opsWallet} /> : <span key="o" className="text-muted">Not set · share stays in the fee wallet</span>],
              ["Payout run", `Every ${t.intervalMinutes} minutes`],
              ["Holder share", `${t.holderShareBps / 100}% of creator fees received`],
              ["Minimum payout", fmtSol(t.minPayoutLamports)],
              ["Minimum average balance", fmtTokens(t.minEligibleBalance, brand.ticker)],
              ["Trading fee shown", `${t.tradeFeeBps / 100}% (set by pump.fun)`],
            ]}
          />
          <p className="mt-3 text-xs text-muted">
            The fee wallet is the pump.fun creator wallet. SOL already in it before the first payout run is kept as a float for
            network fees and is never distributed. Network fees for claims and transfers are paid from income.
          </p>
        </Panel>
      </div>
    </>
  );
}
