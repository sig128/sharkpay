import Link from "next/link";
import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { requirePageSession } from "@/lib/server/guard";
import { overview } from "@/lib/server/services/dashboard";
import { MembershipCard } from "@/components/brand/MembershipCard";
import { PageHeader, Panel, KV } from "@/components/app/Page";
import { ActivityRow } from "@/components/app/ActivityRow";
import { Badge } from "@/components/ui/Badges";
import { ButtonLink } from "@/components/ui/Button";
import { fmtDateTime, fmtGta, fmtSol, fmtTokens, PLATFORM_LABEL, REGION_LABEL } from "@/lib/format";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const { session } = await requirePageSession();
  const o = overview(session);
  const sel = o.selectedReward;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Hey, ${o.user.displayName.split(" ")[0]}`}
        actions={o.user.platform ? <Badge>{PLATFORM_LABEL[o.user.platform]} · {o.user.region}</Badge> : undefined}
      />

      {!o.linked && (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-coral/30 bg-coral/[0.07] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-warm">Link a wallet to see your rewards</h2>
            <p className="mt-1 text-sm text-muted">
              Every wallet holding {brand.ticker} is paid automatically, linked or not. Linking one just shows its rewards
              here. It takes one signed message and never approves a transaction.
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
          <h2 id="bal-title" className="eyebrow relative">SOL owed to your wallets</h2>
          <div className="relative mt-3 flex flex-wrap items-baseline gap-x-3">
            <span className="display text-[clamp(3rem,10vw,6rem)] tabular-nums">{fmtSol(o.rewards.owed, { unit: false })}</span>
            <span className="font-mono text-lg text-muted">SOL</span>
          </div>
          <dl className="relative mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-line bg-midnight/40 p-4">
              <dt className="text-xs text-muted">Already paid out</dt>
              <dd className="num mt-1 text-xl">{fmtSol(o.rewards.paid)}</dd>
            </div>
            <div className="rounded-xl border border-line bg-midnight/40 p-4">
              <dt className="text-xs text-muted">Next payout run</dt>
              <dd className="num mt-1 text-sm">
                {o.payouts.live ? (o.payouts.nextCycleAt ? fmtDateTime(o.payouts.nextCycleAt) : "Soon") : "Not live yet"}
              </dd>
            </div>
            <div className="col-span-2 rounded-xl border border-line bg-midnight/40 p-4 md:col-span-1">
              <dt className="text-xs text-muted">What this is</dt>
              <dd className="mt-1 text-xs leading-relaxed text-muted">
                Your share of creator fees, in SOL. Sent automatically once it reaches {fmtSol(o.payouts.minPayoutLamports)}.
                Not a guaranteed yield.
              </dd>
            </div>
          </dl>
          <div className="relative mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/app/rewards">Buy a Shark Card</ButtonLink>
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
            balance={o.rewards.owed}
            pose={{ x: 6, y: -10, z: -3 }}
            className="my-auto px-2 py-4"
          />
        </section>

        <Panel title="Token holdings" className="lg:col-span-4" id="hold-title">
          {o.linked ? (
            <>
              <div className="num text-2xl">{fmtTokens(o.holdings.tokens, brand.ticker)}</div>
              <p className="mt-1 text-xs text-muted">
                Across {o.wallets.length} linked wallet{o.wallets.length === 1 ? "" : "s"}
                {o.holdings.takenAt ? ` · as of ${fmtDateTime(o.holdings.takenAt)}` : ""}
              </p>
              {!o.holdings.takenAt && <p className="mt-3 text-sm text-muted">No holder snapshot yet. Balances appear once payouts are live.</p>}
              <p className="mt-3 text-xs text-muted">Token value is separate from SOL rewards and from GTA$.</p>
            </>
          ) : (
            <p className="text-sm text-muted">Link a wallet to see its holdings.</p>
          )}
        </Panel>

        <Panel title="Latest payout" className="lg:col-span-4" id="payout-title">
          {o.rewards.latestPayout ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="num text-2xl text-mint">+{fmtSol(o.rewards.latestPayout.lamports)}</span>
                <span className="text-sm text-muted">sent to {o.rewards.latestPayout.masked}</span>
              </div>
              <KV
                className="mt-4"
                items={[
                  ["Sent", <span key="t" className="num text-xs">{fmtDateTime(o.rewards.latestPayout.paidAt)}</span>],
                  [
                    "Transaction",
                    <a key="s" href={o.rewards.latestPayout.explorerUrl} target="_blank" rel="noreferrer" className="text-coral hover:underline">
                      View on Solscan
                    </a>,
                  ],
                ]}
              />
            </>
          ) : (
            <p className="text-sm text-muted">No SOL has been sent to your linked wallets yet.</p>
          )}
        </Panel>

        <Panel title="Automatic payouts" className="lg:col-span-4" id="next-title">
          {o.payouts.live ? (
            <>
              <div className="num text-xl">{o.payouts.nextCycleAt ? fmtDateTime(o.payouts.nextCycleAt) : "First run soon"}</div>
              <p className="mt-3 text-sm text-muted">
                Every {o.payouts.intervalMinutes} minutes, {o.payouts.holderShareBps / 100}% of new creator fees is split
                between all holders by average balance. The amount depends on real trading and may be zero.
              </p>
            </>
          ) : (
            <>
              <Badge>Not live yet</Badge>
              <p className="mt-3 text-sm text-muted">{o.payouts.blocker}</p>
            </>
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
                <span>{fmtSol(sel.earned)} earned / {fmtSol(sel.solPriceLamports)}</span>
                <span>{sel.progress >= 1 ? "Enough SOL earned" : `${fmtSol(sel.solPriceLamports - sel.earned)} to go`}</span>
              </div>
              <p className="mt-4 text-xs text-muted">
                {sel.platform ? PLATFORM_LABEL[sel.platform] : "Platform not set"}
                {sel.region ? ` · ${REGION_LABEL[sel.region]}` : ""}. Earned counts SOL paid and owed to your linked wallets;
                cards themselves are paid in {brand.ticker}.
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
