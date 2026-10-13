import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BottomNav, MobileTopBar, Sidebar } from "@/components/app/AppNav";
import { requirePageSession } from "@/lib/server/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePageSession();
  if (!user.onboarded_at) redirect("/onboarding");
  return (
    <div className="flex min-h-dvh">
      <Sidebar name={user.display_name} avatarUrl={user.avatar_url} />
      <div className="min-w-0 flex-1">
        <MobileTopBar name={user.display_name} avatarUrl={user.avatar_url} />
        <main id="main" className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-6 md:px-8 md:pt-10 lg:pb-16">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
