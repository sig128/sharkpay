import type { Metadata } from "next";
import { requirePageSession } from "@/lib/server/guard";
import { activity } from "@/lib/server/services/dashboard";
import { clearMatured } from "@/lib/server/rewards/periods";
import { PageHeader } from "@/components/app/Page";
import { ActivityList } from "@/components/app/ActivityList";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const { session } = await requirePageSession();
  clearMatured(session.realm);
  return (
    <>
      <PageHeader eyebrow="Activity" title="Every reward, explained">
        Reward allocations, clearances, Shark Card orders and reversals in plain language. Select any entry for details.
      </PageHeader>
      <ActivityList items={activity(session)} />
    </>
  );
}
