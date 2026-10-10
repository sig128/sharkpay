import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/server/guard";
import { listWallets, maskAddress } from "@/lib/server/wallet/verify";
import { isRecentlyAuthenticated } from "@/lib/server/auth/sessions";
import { DEMO_TIERS } from "@/lib/server/catalog/catalog";
import { Wordmark } from "@/components/brand/Wordmark";
import { Onboarding } from "@/components/auth/Onboarding";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up your membership", robots: { index: false, follow: false } };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { session, user } = await requirePageSession();
  if (session.kind === "demo" || user.onboarded_at) redirect("/app");
  const sp = await searchParams;
  const wallets = listWallets(user.id).map((w) => ({ id: w.id, address: maskAddress(w.address), verifiedAt: w.verified_at }));
  const platform = user.reward_platform ?? (["pc", "playstation", "xbox"].includes(sp.platform ?? "") ? sp.platform! : null);

  return (
    <main id="main" className="min-h-dvh px-5 py-8 sm:px-10">
      <div className="mx-auto max-w-2xl">
        <Wordmark />
        <p className="eyebrow mt-12">Welcome, {user.display_name}</p>
        <h1 className="display mt-3 text-[clamp(2.6rem,7vw,4rem)]">Set up your membership</h1>
        <p className="mt-3 text-muted">Three quick choices. You can change all of them later.</p>
        <Onboarding
          initial={{ platform, region: user.reward_region, tier: user.selected_item_tier }}
          tiers={DEMO_TIERS.map((t) => ({ id: t.tier, name: t.name, gta: t.gta }))}
          wallets={wallets}
          canLinkWallet={isRecentlyAuthenticated(session)}
        />
      </div>
    </main>
  );
}
