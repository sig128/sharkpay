import type { Metadata } from "next";
import { OpeningLoader } from "@/components/landing/OpeningLoader";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Steps } from "@/components/landing/Steps";
import { CardCatalog } from "@/components/landing/CardCatalog";
import { WalletSection } from "@/components/landing/WalletSection";
import { Funding } from "@/components/landing/Funding";
import { Faq } from "@/components/landing/Faq";
import { Footer } from "@/components/landing/Footer";
import { BuySection } from "@/components/landing/BuySection";
import { buyInfo } from "@/lib/server/services/buy";
import { Marquee } from "@/components/landing/fx/Marquee";
import { RevealObserver } from "@/components/landing/fx/RevealObserver";
import { CursorGlow, ScrollProgress } from "@/components/landing/fx/ScrollFx";
import { landing } from "@/lib/server/services/public";
import { currentSession } from "@/lib/server/http";
import { integrations } from "@/lib/server/env";
import { gamingProviders, socialProviders } from "@/lib/server/auth/providers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const [data, session] = await Promise.all([landing(), currentSession()]);
  const i = integrations();
  return (
    <>
      <OpeningLoader />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-warm focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <Nav
        signedIn={Boolean(session)}
        signIn={{ providers: gamingProviders(), social: socialProviders(), emailEnabled: i.email, devMode: i.emailDevOutbox }}
      />
      <main id="main" className="overflow-x-clip">
        <Hero payouts={data.payouts} showcase={data.showcase} />
        <Marquee />
        <Steps payouts={{ intervalMinutes: data.payouts.intervalMinutes, holderShareBps: data.payouts.holderShareBps, minPayoutLamports: data.payouts.minPayoutLamports }} />
        <BuySection info={buyInfo()} />
        <CardCatalog tiers={data.tiers} />
        <WalletSection showcase={data.showcase} />
        <Funding payouts={data.payouts} />
        <Faq />
      </main>
      <Footer />
      <RevealObserver />
      <ScrollProgress />
      <CursorGlow />
    </>
  );
}
