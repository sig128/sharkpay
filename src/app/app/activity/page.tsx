import type { Metadata } from "next";
import { requirePageSession } from "@/lib/server/guard";
import { activity } from "@/lib/server/services/dashboard";
import { PageHeader } from "@/components/app/Page";
import { ActivityList } from "@/components/app/ActivityList";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const { session } = await requirePageSession();
  return (
    <>
      <PageHeader eyebrow="Activity" title="Every reward, explained">
        SOL payouts to your linked wallets, Shark Card orders and reversals in plain language. Select any entry for
        details.
      </PageHeader>
      <ActivityList items={activity(session)} />
    </>
  );
}
