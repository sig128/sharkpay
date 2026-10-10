import Link from "next/link";
import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { requirePageSession } from "@/lib/server/guard";
import { overview } from "@/lib/server/services/dashboard";
import { MembershipCard } from "@/components/brand/MembershipCard";
import { PageHeader, Panel, KV } from "@/components/app/Page";
import { ActivityRow } from "@/components/app/ActivityRow";
import { Badge, PreviewBadge } from "@/components/ui/Badges";
import { ButtonLink } from "@/components/ui/Button";
import { fmtDate, fmtDateTime, fmtGta, fmtInt, fmtTokens, fmtUsd, PLATFORM_LABEL, REGION_LABEL } from "@/lib/format";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const { session } = await requirePageSession();
  const o = overview(session);
  const sel = o.selectedReward;

  return (
    <>
      <PageHeader
        eyebrow={o.isDemo ? "Overview · demo sandbox" : "Overview"}
        title={`Hey, ${o.user.displayName.split(" ")[0]}`}
        actions={
          <>
            {o.user.platform && <Badge>{PLATFORM_LABEL[o.user.platform]} · {o.user.region}</Badge>}
            {o.isDemo && <PreviewBadge />}
          </>
        }
      />

      {!o.qualifies && (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-coral/30 bg-coral/[0.07] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-warm">Link wallet to qualify</h2>
            <p className="mt-1 text-sm text-muted">
              Holder rewards are credited only to a verified wallet. Linking takes one signed message and never approves a
              transaction.
            </p>
          </div>
          <ButtonLink href="/app/accounts#wallets" variant="primary">
            Link a wallet
          </ButtonLink>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="panel noise relative overflow-hidden p-6 md:p-8 lg:col-span-8" aria-labelledby="bal-title">
          <div aria-hidden="true" className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-pink/20 blur-3xl" />
          <h2 id="bal-title" className="eyebrow relative">Available reward credits</h2>
          <div className="relative mt-3 flex flex-wrap items-baseline gap-x-3">
            <span className="display text-[clamp(4.5rem,13vw,8rem)] tabular-nums">{fmtInt(o.balances.available)}</span>
            <span className="font-mono text-lg text-muted">credits</span>
          </div>
          <dl className="relative mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-line bg-midnight/40 p-4">
              <dt className="text-xs text-muted">Pending</dt>
              <dd className="num mt-1 text-xl">{fmtInt(o.balances.pending)} <span className="text-xs text-muted">CR</span></dd>
              {o.latestPeriod?.availableAt && o.latestPeriod.myStatus === "pending" && (
                <dd className="mt-1 text-xs text-muted">Clears {fmtDateTime(o.latestPeriod.availableAt)}</dd>
              )}
            </div>
            <div className="rounded-xl border border-line bg-midnight/40 p-4">
              <dt className="text-xs text-muted">Reserved for orders</dt>
              <dd className="num mt-1 text-xl">{fmtInt(o.balances.reserved)} <span className="text-xs text-muted">CR</span></dd>
            </div>
            <div className="col-span-2 rounded-xl border border-line bg-midnight/40 p-4 md:col-span-1">
              <dt className="text-xs text-muted">What a credit is</dt>
              <dd className="mt-1 text-xs leading-relaxed text-muted">Internal redemption unit. Not GTA$, not cash, not transferable.</dd>
            </div>
          </dl>
          <div className="relative mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/app/rewards">Redeem credits</ButtonLink>
            <ButtonLink href="/app/activity" variant="secondary">View activity</ButtonLink>
          </div>
        </section>

        <section className="panel flex flex-col p-5 lg:col-span-4" aria-labelledby="card-title">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="card-title" className="text-sm font-semibold">Your {brand.name} card</h2>
            <Link href="/app/card" className="inline-flex min-h-11 items-center text-sm text-coral hover:underline">Open</Link>
          </div>
          <MembershipCard
            memberName={o.user.displayName}
            membershipId={o.user.membershipId}
            balance={o.balances.available}
            demo={o.isDemo}
            pose={{ x: 6, y: -10, z: -3 }}
            className="my-auto px-2 py-4"
          />
        </section>

        <Panel title="Token holdings" className="lg:col-span-4" id="hold-title">
          {o.qualifies ? (
            <>
              <div className="num text-2xl">{fmtTokens(o.holdings.tokens, brand.ticker)}</div>
              <p className="mt-1 text-xs text-muted">
                Across {o.holdings.tokenAccounts} token account{o.holdings.tokenAccounts === 1 ? "" : "s"} in {o.wallets.length} linked wallet{o.wallets.length === 1 ? "" : "s"}
              </p>
              <KV
                className="mt-4"
                items={[
                  [
                    "Market value",
                    o.holdings.sampleValueUsd !== null ? (
                      <span className="num">{fmtUsd(o.holdings.sampleValueUsd)} <span className="text-xs text-muted">sample price</span></span>
                    ) : (
                      <span className="text-muted">No price feed connected</span>
                    ),
                  ],
                  [
                    "Latest eligible weight",
                    o.latestWeight ? (
                      <span className="num">{o.latestWeight.share.toFixed(4)}% <span className="text-xs text-muted">period {o.latestWeight.periodSeq}</span></span>
                    ) : (
                      <span className="text-muted">No finalized period yet</span>
                    ),
                  ],
                  ["Time-weighted average", o.latestWeight ? <span className="num">{fmtTokens(o.latestWeight.averageTokens, brand.ticker)}</span> : "—"],
                ]}
              />
              <p className="mt-3 text-xs text-muted">Token value is separate from credits and from GTA$.</p>
            </>
          ) : (
            <p className="text-sm text-muted">Link a wallet to see holdings and your eligible weight.</p>
          )}
        </Panel>

        <Panel title="Latest reward period" className="lg:col-span-4" id="period-title">
          {o.latestPeriod ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="num text-2xl text-mint">+{fmtInt(o.latestPeriod.myAllocation)}</span>
                <span className="text-sm text-muted">credits allocated to you</span>
              </div>
              <KV
                className="mt-4"
                items={[
                  ["Period", <span key="p" className="num">#{o.latestPeriod.seq} · {fmtDate(o.latestPeriod.startsAt)} – {fmtDate(o.latestPeriod.endsAt)}</span>],
                  ["Funded budget", <span key="b" className="num">{fmtInt(o.latestPeriod.budget)} CR</span>],
                  ["Status", o.latestPeriod.myStatus === "pending" ? <Badge key="s" tone="butter">Pending clearance</Badge> : <Badge key="s" tone="mint">Available</Badge>],
                ]}
              />
            </>
          ) : (
            <p className="text-sm text-muted">No reward period has been finalized yet.</p>
          )}
        </Panel>

        <Panel title="Next scheduled calculation" className="lg:col-span-4" id="next-title">
          {o.nextCalculation ? (
            <>
              <div className="num text-xl">{fmtDateTime(o.nextCalculation)}</div>
              <p className="mt-3 text-sm text-muted">
                Period #{o.openPeriod?.seq} ends {fmtDateTime(o.openPeriod!.endsAt)}. The calculation runs once finalized chain
                data is in. The amount depends on fees actually settled and may be zero. This is not a scheduled payment.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">No open period.</p>
          )}
        </Panel>

        <Panel title="Progress toward your reward" className="lg:col-span-5" id="goal-title" action={<Link href="/app/rewards" className="inline-flex min-h-11 items-center text-sm text-coral hover:underline">Change</Link>}>
          {sel ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{sel.name}</span>
                <span className="num text-sm text-muted">{fmtGta(sel.gtaAmount)}</span>
              </div>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(sel.progress * 100)} aria-label={`Progress toward ${sel.name}`}>
                <div className="h-full rounded-full bg-gradient-to-r from-mint to-[#4fd1b0]" style={{ width: `${sel.progress * 100}%` }} />
              </div>
              <div className="mt-2 flex justify-between font-mono text-xs text-muted">
                <span>{fmtInt(o.balances.available)} / {fmtInt(sel.creditCost)} CR</span>
                <span>{sel.progress >= 1 ? "Ready to redeem" : `${fmtInt(sel.creditCost - o.balances.available)} CR to go`}</span>
              </div>
              <p className="mt-4 text-xs text-muted">
                {PLATFORM_LABEL[sel.platform]} · {REGION_LABEL[sel.region]}
                {sel.isDemo && " · demo catalog item, illustrative cost"}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Choose a reward to track your progress.</p>
          )}
        </Panel>

        <Panel title="Latest transactions" className="lg:col-span-7" id="tx-title" action={<Link href="/app/activity" className="inline-flex min-h-11 items-center text-sm text-coral hover:underline">All activity</Link>}>
          {o.recent.length ? (
            <ul className="-my-1 divide-y divide-line">
              {o.recent.map((a) => (
                <li key={a.id}>
                  <ActivityRow a={a} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No activity yet.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
