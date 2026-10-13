import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { requirePageSession } from "@/lib/server/guard";
import { passModel, membershipId, maskMembershipId } from "@/lib/server/passes/pass";
import { memberRewards } from "@/lib/server/rewards/member";
import { payoutView } from "@/lib/server/services/dashboard";
import { integrations } from "@/lib/server/env";
import { cardIssuer } from "@/lib/server/issuer/issuer";
import { MembershipCard } from "@/components/brand/MembershipCard";
import { PageHeader, Panel, KV } from "@/components/app/Page";
import { PassPreview } from "@/components/app/PassPreview";
import { Waitlist } from "@/components/app/Waitlist";
import { Badge } from "@/components/ui/Badges";
import { fmtDateTime, fmtSol } from "@/lib/format";

export const metadata: Metadata = { title: "My Card" };

const OFFICIAL_BADGE = "/brand/apple/add-to-apple-wallet.svg";

export default async function CardPage() {
  const { session, user } = await requirePageSession();
  const model = passModel(session.realm, session.userId);
  const rewards = memberRewards(session.userId, 4);
  const recent = rewards.payouts.map(payoutView);
  const signing = integrations().applePass && session.realm === "live";
  const badgeAvailable = fs.existsSync(path.join(process.cwd(), "public", OFFICIAL_BADGE));
  const mid = membershipId(session.userId);

  return (
    <>
      <PageHeader eyebrow="My Card" title="Membership">
        Your {brand.name} card on the web, and a simpler Apple Wallet pass for checking your balance on the go.
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="panel noise relative flex items-center justify-center overflow-hidden px-6 py-12 lg:col-span-7" aria-label="Website membership card">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_60%,rgb(255_78_174/0.16),transparent_70%)]" />
          <MembershipCard
            memberName={user.display_name}
            membershipId={maskMembershipId(mid)}
            balance={rewards.owed}
            priority="hero"
            className="w-full max-w-[520px]"
          />
        </section>

        <Panel title="Apple Wallet pass" className="lg:col-span-5" action={<Badge>{signing ? "Signing configured" : "Not available yet"}</Badge>}>
          <PassPreview model={model} />
          <div className="mt-5">
            {signing ? (
              badgeAvailable ? (
                <a href="/api/pass" className="inline-block min-h-11" aria-label="Add to Apple Wallet">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={OFFICIAL_BADGE} alt="Add to Apple Wallet" height={44} className="h-11 w-auto" />
                </a>
              ) : (
                <a href="/api/pass" className="text-sm text-coral underline">Download signed pass (.pkpass)</a>
              )
            ) : (
              <p className="rounded-xl border border-line bg-white/[0.03] p-3 text-sm text-muted">
                Adding to Apple Wallet becomes available once the signed pass service is configured on this server.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Membership details" className="lg:col-span-5">
          <KV
            items={[
              ["Membership ID", <span key="m" className="num text-xs">{maskMembershipId(mid)}</span>],
              ["SOL owed", <span key="a" className="num">{fmtSol(rewards.owed)}</span>],
              ["SOL paid", <span key="p" className="num">{fmtSol(rewards.paid)}</span>],
              ["Last updated", <span key="u" className="num text-xs">{fmtDateTime(model.updatedAt)}</span>],
            ]}
          />
          <p className="mt-3 text-xs text-muted">
            The pass barcode carries only this opaque membership reference. It can&apos;t authorize redemptions or payments.
          </p>
        </Panel>

        <Panel title="Recent payouts" className="lg:col-span-7">
          {recent.length ? (
            <ul className="divide-y divide-line text-sm">
              {recent.map((p) => (
                <li key={`${p.signature}:${p.wallet}`} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <a href={p.explorerUrl} target="_blank" rel="noreferrer" className="num text-xs text-coral hover:underline">
                      {p.masked}
                    </a>{" "}
                    <span className="font-mono text-xs text-muted">· {fmtDateTime(p.paidAt)}</span>
                  </span>
                  <span className="num text-mint">+{fmtSol(p.lamports)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No SOL has been sent to your linked wallets yet.</p>
          )}
        </Panel>

        <section className="panel relative overflow-hidden border-dashed p-6 md:p-8 lg:col-span-12" aria-labelledby="pay-title">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div>
              <Badge>Planned · not available</Badge>
              <h2 id="pay-title" className="display mt-4 text-4xl md:text-5xl">Pay with {brand.name}</h2>
              <p className="mt-3 text-muted">
                A possible future payment card for everyday spending with Apple Pay. It depends on a supported, regulated
                issuing partner whose card program supports Apple Pay. None is integrated today, so there is no card to
                activate here.
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-muted">
                <li>· A card balance would be separate from SOL rewards, {brand.ticker} holdings and GTA$.</li>
                <li>· SOL rewards would not automatically become spendable money.</li>
                <li>· Issuer status: <span className="num text-warm">{cardIssuer.status.replace("_", " ")}</span></li>
              </ul>
            </div>
            <Waitlist />
          </div>
        </section>
      </div>
    </>
  );
}
