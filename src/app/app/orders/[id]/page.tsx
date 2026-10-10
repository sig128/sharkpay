import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageSession } from "@/lib/server/guard";
import { getOrder, orderView } from "@/lib/server/orders/orders";
import { AppError } from "@/lib/server/errors";
import { PageHeader, Panel, KV } from "@/components/app/Page";
import { OrderStatus } from "@/components/app/OrderStatus";
import { PrintButton } from "@/components/app/PrintButton";
import { Badge } from "@/components/ui/Badges";
import { brand } from "@/config/brand";
import { fmtDateTime, fmtGta, fmtInt, PLATFORM_LONG, REGION_LABEL, VERSION_LABEL } from "@/lib/format";

export const metadata: Metadata = { title: "Receipt" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { session } = await requirePageSession();
  const { id } = await params;
  let view;
  try {
    view = orderView(getOrder(session, id));
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
  const item = view.item;
  return (
    <>
      <PageHeader eyebrow="Receipt" title={item?.name ?? "Order"} actions={<PrintButton />}>
        <Link href="/app/activity" className="inline-flex min-h-11 items-center text-coral hover:underline">← Back to activity</Link>
      </PageHeader>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel title="Status" className="lg:col-span-7">
          <OrderStatus initial={view} />
        </Panel>
        <Panel title="Receipt" className="lg:col-span-5" action={view.simulated ? <Badge tone="butter">Demo order</Badge> : undefined}>
          <KV
            items={[
              ["Order ID", <span key="o" className="num break-all text-xs">{view.id}</span>],
              ["Placed", <span key="p" className="num text-xs">{fmtDateTime(view.createdAt)}</span>],
              ["Reward", item?.name],
              ["In-game amount", <span key="g" className="num">{item ? fmtGta(item.gtaAmount) : "—"}</span>],
              ["Platform", item ? PLATFORM_LONG[item.platform] : "—"],
              ["Game version", item ? VERSION_LABEL[item.gameVersion] : "—"],
              ["Region", item ? REGION_LABEL[item.region] : "—"],
              ["SKU", <span key="s" className="num text-xs">{item?.sku}</span>],
              ["Credits", <span key="c" className="num">{fmtInt(view.creditCost)} CR</span>],
              ["Provider", view.simulated ? "Demo provider (simulated)" : view.provider],
              ["Provider reference", <span key="r" className="num text-xs">{view.providerRef ?? "—"}</span>],
              ...(view.completedAt ? ([["Delivered", <span key="d" className="num text-xs">{fmtDateTime(view.completedAt)}</span>]] as Array<[string, React.ReactNode]>) : []),
              ...(view.reversedAt ? ([["Reversed", <span key="v" className="num text-xs">{fmtDateTime(view.reversedAt)}</span>]] as Array<[string, React.ReactNode]>) : []),
            ]}
          />
          <p className="mt-4 text-xs text-muted">
            {brand.legal.independence} Credits are not GTA$ and cannot be exchanged for cash.
          </p>
        </Panel>
      </div>
    </>
  );
}
