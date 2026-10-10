import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav, MobileTopBar, Sidebar } from "@/components/app/AppNav";
import { requirePageSession } from "@/lib/server/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, user } = await requirePageSession();
  if (session.kind === "real" && !user.onboarded_at) redirect("/onboarding");
  const demo = session.kind === "demo";
  return (
    <div className="flex min-h-dvh">
      <Sidebar name={user.display_name} avatarUrl={user.avatar_url} demo={demo} />
      <div className="min-w-0 flex-1">
        <MobileTopBar name={user.display_name} avatarUrl={user.avatar_url} />
        {demo && (
          <div role="note" className="border-b border-butter/20 bg-butter/[0.07] px-4 py-2.5 text-center text-sm text-butter md:px-8">
            <strong className="font-semibold">Product preview.</strong> You&apos;re in an isolated demo sandbox with simulated
            credits that are not real.{" "}
            <Link href="/login" className="underline decoration-butter/50 underline-offset-2 hover:decoration-butter">
              Sign in for real
            </Link>
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-6 md:px-8 md:pt-10 lg:pb-16">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
