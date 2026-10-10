import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { requirePageSession } from "@/lib/server/guard";
import { passModel, membershipId, maskMembershipId } from "@/lib/server/passes/pass";
import { userBalances } from "@/lib/server/ledger/ledger";
import { userAllocations, clearMatured } from "@/lib/server/rewards/periods";
import { integrations } from "@/lib/server/env";
import { cardIssuer } from "@/lib/server/issuer/issuer";
import { MembershipCard } from "@/components/brand/MembershipCard";
import { PageHeader, Panel, KV } from "@/components/app/Page";
import { PassPreview } from "@/components/app/PassPreview";
import { Waitlist } from "@/components/app/Waitlist";
import { Badge, PreviewBadge } from "@/components/ui/Badges";
import { fmtDate, fmtDateTime, fmtInt } from "@/lib/format";

export const metadata: Metadata = { title: "My Card" };

const OFFICIAL_BADGE = "/brand/apple/add-to-apple-wallet.svg";

export default async function CardPage() {
  const { session, user } = await requirePageSession();
  clearMatured(session.realm);
  const model = passModel(session.realm, session.userId);
  const b = userBalances(session.realm, session.userId);
  const recent = userAllocations(session.realm, session.userId).slice(0, 4);
  const demo = session.kind === "demo";
  const signing = integrations().applePass && session.realm === "live";
  const badgeAvailable = fs.existsSync(path.join(process.cwd(), "public", OFFICIAL_BADGE));
  const mid = membershipId(session.userId);

  return (
    <>
      <PageHeader eyebrow="My Card" title="Membership" actions={demo ? <PreviewBadge /> : undefined}>
        Your {brand.name} card on the web, and a simpler Apple Wallet pass for checking your balance on the go.
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="panel noise relative flex items-center justify-center overflow-hidden px-6 py-12 lg:col-span-7" aria-label="Website membership card">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_60%,rgb(255_78_174/0.16),transparent_70%)]" />
          <MembershipCard
            memberName={user.display_name}
            membershipId={maskMembershipId(mid)}
            balance={b.available}
            demo={demo}
            priority="hero"
            className="w-full max-w-[520px]"
          />
        </section>

        <Panel title="Apple Wallet pass" className="lg:col-span-5" action={<Badge>{signing ? "Signing configured" : "Preview"}</Badge>}>
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
                {demo
                  ? "This is a working preview. Signed passes are issued only for real accounts once an Apple pass certificate is configured."
                  : "Adding to Apple Wallet becomes available once the signed pass service is configured on this server."}
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Membership details" className="lg:col-span-5">
          <KV
            items={[
              ["Membership ID", <span key="m" className="num text-xs">{maskMembershipId(mid)}</span>],
              ["Available", <span key="a" className="num">{fmtInt(b.available)} CR</span>],
              ["Pending", <span key="p" className="num">{fmtInt(b.pending)} CR</span>],
              ["Last updated", <span key="u" className="num text-xs">{fmtDateTime(model.updatedAt)}</span>],
            ]}
          />
          <p className="mt-3 text-xs text-muted">
            The pass barcode carries only this opaque membership reference. It can&apos;t authorize redemptions or payments.
          </p>
        </Panel>

        <Panel title="Recent rewards" className="lg:col-span-7">
          {recent.length ? (
            <ul className="divide-y divide-line text-sm">
              {recent.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    Period #{a.seq} <span className="font-mono text-xs text-muted">· {fmtDate(a.ends_at * 1000)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {a.status === "pending" ? <Badge tone="butter">Pending</Badge> : <Badge tone="mint">Available</Badge>}
                    <span className="num text-mint">+{fmtInt(a.credits)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No reward allocations yet.</p>
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
                <li>· A card balance would be separate from reward credits and from GTA$.</li>
                <li>· Reward credits would not automatically become spendable money.</li>
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
