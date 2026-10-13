import Link from "next/link";
import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { requirePageSession } from "@/lib/server/guard";
import { listCatalog } from "@/lib/server/catalog/catalog";
import { providerFor } from "@/lib/server/fulfillment/provider";
import { memberRewards } from "@/lib/server/rewards/member";
import { payoutStatus } from "@/lib/server/rewards/status";
import { payoutView } from "@/lib/server/services/dashboard";
import { listWallets } from "@/lib/server/wallet/verify";
import { PageHeader, Panel, KV } from "@/components/app/Page";
import { RewardsBrowser } from "@/components/app/RewardsBrowser";
import { Badge } from "@/components/ui/Badges";
import { ButtonLink } from "@/components/ui/Button";
import { sharkCheckout } from "@/lib/server/payments/shark";
import { fmtDateTime, fmtSol } from "@/lib/format";

export const metadata: Metadata = { title: "Rewards" };

export default async function RewardsPage() {
  const { session, user } = await requirePageSession();
  const items = listCatalog(session.realm).map((i) => ({
    id: i.id,
    sku: i.sku,
    name: i.name,
    tier: i.tier,
    category: i.category,
    gtaAmount: i.gta_amount,
    solPriceLamports: i.sol_price_lamports,
    retailReference: i.retail_reference,
    platform: i.platform,
    gameVersion: i.game_version,
    region: i.region,
    stock: i.stock,
    status: i.status,
  }));
  const shark = sharkCheckout();
  const status = payoutStatus({ cycles: 1, payouts: 0 });
  const rewards = memberRewards(session.userId, 10);
  const payouts = rewards.payouts.map(payoutView);
  const linked = listWallets(session.userId).length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Rewards"
        title="SOL rewards & Shark Cards"
        actions={status.live ? <Badge tone="mint">Payouts live</Badge> : <Badge>Payouts not live yet</Badge>}
      >
        SOL from {brand.ticker} creator fees, sent to holder wallets automatically. Shark Cards have fixed SOL prices and are
        paid in {brand.ticker}.
      </PageHeader>

      {!status.live && (
        <p className="mb-6 rounded-2xl border border-line bg-white/[0.03] p-5 text-sm text-muted">
          <strong className="text-warm">Automatic payouts aren&apos;t running yet.</strong> {status.blocker}
        </p>
      )}

      <div className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="panel noise relative overflow-hidden p-6 md:p-8 lg:col-span-7" aria-labelledby="owed-title">
          <div aria-hidden="true" className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-pink/20 blur-3xl" />
          <h2 id="owed-title" className="eyebrow relative">Owed to your linked wallets</h2>
          <div className="relative mt-3 flex flex-wrap items-baseline gap-x-3">
            <span className="display text-[clamp(2.8rem,8vw,5rem)] tabular-nums">{fmtSol(rewards.owed, { unit: false })}</span>
            <span className="font-mono text-lg text-muted">SOL</span>
          </div>
          <p className="relative mt-2 text-sm text-muted">
            Accumulating. Paid automatically once a wallet is owed at least {fmtSol(status.minPayoutLamports)}.
          </p>
          <dl className="relative mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-line bg-midnight/40 p-4">
              <dt className="text-xs text-muted">Total paid to you</dt>
              <dd className="num mt-1 text-xl">{fmtSol(rewards.paid)}</dd>
            </div>
            <div className="rounded-xl border border-line bg-midnight/40 p-4">
              <dt className="text-xs text-muted">Next payout run</dt>
              <dd className="num mt-1 text-sm">
                {status.live ? (status.nextCycleAt ? fmtDateTime(status.nextCycleAt) : "First run soon") : "Not scheduled"}
              </dd>
            </div>
          </dl>
          {!linked && (
            <div className="relative mt-6 flex flex-wrap items-center gap-3">
              <ButtonLink href="/app/accounts#wallets" variant="primary">
                Link a wallet
              </ButtonLink>
              <span className="text-sm text-muted">to see what your wallets are owed and paid.</span>
            </div>
          )}
        </section>

        <Panel title="How it works" className="lg:col-span-5">
          <ol className="space-y-3 text-sm text-muted">
            <li>
              <span className="text-warm">Every {status.intervalMinutes} minutes</span> the server claims the pump.fun creator
              fees {brand.ticker} trading has earned.
            </li>
            <li>
              <span className="text-warm">{status.holderShareBps / 100}%</span> of that new SOL is split between holders by
              their average {brand.ticker} balance since the previous run. The rest funds operations.
            </li>
            <li>
              <span className="text-warm">Any wallet holding {brand.ticker} counts</span>, even if it isn&apos;t linked here.
              Linking a wallet only shows its rewards on this page.
            </li>
            <li>
              Wallets owed at least <span className="num text-warm">{fmtSol(status.minPayoutLamports)}</span> are sent SOL in
              that run; smaller amounts carry over until they reach it.
            </li>
          </ol>
          <p className="mt-4 text-xs text-muted">{brand.legal.rewards}</p>
        </Panel>

        <Panel
          title="Recent payouts to your wallets"
          className="lg:col-span-12"
          action={
            <Link href="/app/transparency" className="inline-flex min-h-11 items-center text-sm text-coral hover:underline">
              All payouts
            </Link>
          }
        >
          {payouts.length ? (
            <KV
              items={payouts.map((p) => [
                <span key="w">
                  <span className="num text-xs">{p.masked}</span>{" "}
                  <span className="font-mono text-xs">· {fmtDateTime(p.paidAt)}</span>
                </span>,
                <span key="v" className="flex items-center justify-end gap-3">
                  <span className="num text-mint">+{fmtSol(p.lamports)}</span>
                  <a href={p.explorerUrl} target="_blank" rel="noreferrer" className="text-xs text-coral hover:underline">
                    Solscan
                  </a>
                </span>,
              ])}
            />
          ) : (
            <p className="text-sm text-muted">
              {linked ? "No SOL has been sent to your linked wallets yet." : "Link a wallet to see its payouts here."}
            </p>
          )}
        </Panel>
      </div>

      <h2 className="display mb-2 text-4xl">Shark Cards</h2>
      <p className="mb-6 max-w-2xl text-muted">
        Fixed SOL prices, paid in {brand.ticker}. Each item is a specific platform and region; codes don&apos;t work elsewhere.
      </p>
      <RewardsBrowser
        items={items}
        defaults={{ platform: user.reward_platform ?? "", region: user.reward_region ?? "" }}
        selectedTier={user.selected_item_tier}
        fulfillmentConnected={Boolean(providerFor())}
        shark={{ enabled: shark.enabled, reason: shark.enabled ? null : shark.reason }}
      />
    </>
  );
}
