import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/config/brand";
import { currentSession } from "@/lib/server/http";
import { gamingProviders, socialProviders } from "@/lib/server/auth/providers";
import { integrations } from "@/lib/server/env";
import { Wordmark } from "@/components/brand/Wordmark";
import { Atmosphere } from "@/components/brand/Atmosphere";
import { MembershipCard } from "@/components/brand/MembershipCard";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { AUTH_ERRORS } from "@/lib/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await currentSession();
  if (session) redirect("/app");
  const sp = await searchParams;
  const i = integrations();
  const error = sp.error ? (AUTH_ERRORS[sp.error] ?? AUTH_ERRORS.signin_failed) : null;

  return (
    <main id="main" className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <section className="noise relative hidden overflow-hidden lg:block">
        <Atmosphere variant="login" />
        <div className="absolute left-12 top-10">
          <Wordmark />
        </div>
        <div className="absolute inset-0 flex items-center justify-center px-16">
          <div className="w-full max-w-[460px] [animation:float-y_9s_ease-in-out_infinite] motion-reduce:animate-none">
            <MembershipCard memberName="Your name" membershipId="SC-••••-••••-••••" balance={null} demo priority="hero" interactive={false} />
          </div>
        </div>
        <p className="absolute bottom-10 left-12 max-w-sm text-sm text-warm/80">{brand.tagline}</p>
      </section>

      <section className="relative flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-16 xl:px-24">
        <div className="mb-10 flex items-center justify-between lg:hidden">
          <Wordmark />
        </div>
        <div className="mx-auto w-full max-w-[440px]">
          <p className="eyebrow">Sign in</p>
          <h1 className="display mt-3 text-[clamp(3rem,8vw,4.6rem)]">
            Your game.
            <br />
            <span className="text-sunset">Your rewards.</span>
          </h1>
          <p className="mt-4 text-muted">
            Sign in with Google or another account you already have. We never ask for your Rockstar, Xbox or PlayStation
            password.
          </p>

          {error && (
            <p role="alert" className="mt-6 rounded-2xl border border-[#ff6b6b]/40 bg-[#ff6b6b]/10 p-4 text-sm text-[#ffb3b3]">
              {error}
            </p>
          )}

          <LoginPanel providers={gamingProviders()} social={socialProviders()} emailEnabled={i.email} devMode={i.emailDevOutbox} />

          <p className="mt-10 text-xs text-muted">
            {brand.legal.independence} <Link href="/" className="underline hover:text-warm">Back to home</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
