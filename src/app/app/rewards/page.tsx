import type { Metadata } from "next";
import { requirePageSession } from "@/lib/server/guard";
import { listCatalog } from "@/lib/server/catalog/catalog";
import { userBalances } from "@/lib/server/ledger/ledger";
import { providerFor } from "@/lib/server/fulfillment/provider";
import { clearMatured } from "@/lib/server/rewards/periods";
import { PageHeader } from "@/components/app/Page";
import { RewardsBrowser } from "@/components/app/RewardsBrowser";
import { PreviewBadge } from "@/components/ui/Badges";
import { sharkCheckout } from "@/lib/server/payments/shark";

export const metadata: Metadata = { title: "Rewards" };

export default async function RewardsPage() {
  const { session, user } = await requirePageSession();
  clearMatured(session.realm);
  const items = listCatalog(session.realm).map((i) => ({
    id: i.id,
    sku: i.sku,
    name: i.name,
    tier: i.tier,
    category: i.category,
    gtaAmount: i.gta_amount,
    creditCost: i.credit_cost,
    retailReference: i.retail_reference,
    platform: i.platform,
    gameVersion: i.game_version,
    region: i.region,
    stock: i.stock,
    status: i.status,
    isDemo: Boolean(i.is_demo),
  }));
  const demo = session.kind === "demo";
  const shark = sharkCheckout(session.realm);
  return (
    <>
      <PageHeader eyebrow="Rewards" title="Redeem credits" actions={demo ? <PreviewBadge label="Demo catalog" /> : undefined}>
        Shark Cards for GTA Online. Each item is a specific platform and region; codes don&apos;t work elsewhere.
      </PageHeader>
      <RewardsBrowser
        items={items}
        available={userBalances(session.realm, session.userId).available}
        defaults={{ platform: user.reward_platform ?? "", region: user.reward_region ?? "" }}
        selectedTier={user.selected_item_tier}
        demo={demo}
        fulfillmentConnected={Boolean(providerFor(session.realm))}
        shark={{ enabled: shark.enabled, reason: shark.enabled ? null : shark.reason }}
      />
    </>
  );
}
