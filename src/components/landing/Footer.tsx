import Link from "next/link";
import { brand } from "@/config/brand";
import { Wordmark } from "@/components/brand/Wordmark";
import { Fin } from "@/components/brand/Fin";
import { Palm } from "@/components/brand/Atmosphere";
import { XLink } from "@/components/brand/XLink";
import { ButtonLink } from "@/components/ui/Button";
import { env } from "@/lib/server/env";
import { faqItems } from "./faq-items";

type FooterLink = { href: string; label: string; note?: string };

const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#buy", label: `Buy ${brand.ticker}` },
      { href: "/#rewards", label: "Shark Card rewards" },
      { href: "/#wallet", label: "Apple Wallet pass" },
      { href: "/#transparency", label: "Reward funding" },
    ],
  },
  {
    title: "Members",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/app", label: "Dashboard" },
      { href: "/app/rewards", label: "Redeem credits" },
      { href: "/app/activity", label: "Activity" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/app/transparency", label: "Transparency report" },
      { href: "/#faq", label: "FAQ" },
      { href: "/app/accounts", label: "Linked accounts" },
    ],
  },
  {
    title: "Roadmap",
    links: [
      { href: "/app/card", label: `Pay with ${brand.name}`, note: "Planned" },
      { href: "/#rewards", label: "GTA VI rewards", note: "Not available" },
    ],
  },
];

const promises = [
  { title: "No passwords, ever", body: "We never ask for Rockstar, Xbox, PlayStation or Steam passwords." },
  { title: "No seed phrases", body: "Linking a wallet is a one-time signature. It can't move tokens." },
  { title: "No promised yield", body: "Rewards come from settled fees, vary each period and can be zero." },
];

function StructuredData({ url }: { url: string }) {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${url}/#organization`,
        name: brand.name,
        url,
        logo: `${url}/icon.png`,
        sameAs: [brand.social.x.url],
        description: `${brand.tagline} ${brand.legal.independence}`,
      },
      {
        "@type": "WebSite",
        "@id": `${url}/#website`,
        name: brand.name,
        url,
        publisher: { "@id": `${url}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "FAQPage",
        "@id": `${url}/#faq`,
        mainEntity: faqItems.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export function Footer() {
  const url = env().APP_URL.replace(/\/$/, "");
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer relative isolate overflow-hidden border-t border-line" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        {brand.name} site footer
      </h2>
      <div aria-hidden="true" className="footer-aurora pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70%]" />

      {/* Call to action */}
      <div className="container-site pt-20 md:pt-28">
        <div className="panel noise relative overflow-hidden px-6 py-10 md:px-12 md:py-14">
          <div aria-hidden="true" className="footer-cta-glow pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow">Product preview</p>
              <p className="display mt-4 text-[clamp(2.75rem,6.5vw,5.25rem)]">
                Your next upgrade
                <br />
                <span className="text-sunset-flow-soft">starts here.</span>
              </p>
              <p className="mt-4 max-w-md text-muted">
                Link a wallet, collect funded credits and redeem them for GTA Online Shark Cards on your platform.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/login" size="lg" className="shine">
                Sign in
              </ButtonLink>
              <ButtonLink href="/#rewards" size="lg" variant="secondary">
                See the rewards
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="container-site grid grid-cols-2 gap-x-6 gap-y-12 pt-16 md:grid-cols-12 md:pt-20">
        <div className="col-span-2 md:col-span-12 lg:col-span-3">
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{brand.tagline}</p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-butter/60 motion-reduce:animate-none" />
              <span className="relative size-2 rounded-full bg-butter" />
            </span>
            Preview build · simulated data
          </p>
          <div className="mt-6 flex items-center gap-3">
            <XLink label />
            <span className="text-xs text-muted">News and launch updates</span>
          </div>
        </div>
        {columns.map((col) => (
          <nav
            key={col.title}
            aria-labelledby={`footer-${col.title.toLowerCase()}`}
            className={col.title === "Roadmap" ? "md:col-span-3 lg:col-span-3" : "md:col-span-3 lg:col-span-2"}
          >
            <h3 id={`footer-${col.title.toLowerCase()}`} className="eyebrow">
              {col.title}
            </h3>
            <ul className="mt-4 space-y-0.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="f-link group inline-flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 py-1 text-[0.95rem] text-warm/80">
                    <span className="f-link-text">{l.label}</span>
                    {l.note && (
                      <span className="whitespace-nowrap rounded-full border border-line px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-muted">
                        {l.note}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* Promises */}
      <div className="container-site pt-14">
        <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
          {promises.map((p) => (
            <li key={p.title} className="flex gap-4 bg-midnight p-5 md:p-6">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-mint">
                <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3zM9 12l2 2 4-4" />
              </svg>
              <div>
                <h3 className="font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-muted">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Giant wordmark with a fin cruising the waterline */}
      <div aria-hidden="true" className="relative mt-16 select-none md:mt-24">
        <Palm className="absolute bottom-[18%] left-[-70px] h-[120%] text-[#05060b] opacity-80 md:left-[2%]" />
        <Palm className="absolute bottom-[18%] right-[-90px] h-[95%] -scale-x-100 text-[#05060b] opacity-60 md:right-[3%]" />
        <div className="footer-giant display relative text-center leading-[0.8]">
          <span className="footer-giant-outline">{brand.name}</span>
          <span className="footer-giant-fill absolute inset-0">{brand.name}</span>
        </div>
        <div className="relative h-16 overflow-hidden md:h-24">
          <div className="footer-fin absolute top-0">
            <Fin className="size-12 md:size-20" />
          </div>
          <div className="absolute inset-x-0 top-[55%] bottom-0 bg-gradient-to-b from-[#0b0d18] to-midnight" />
          <div className="footer-waves absolute inset-x-0 top-[42%] h-6 md:h-8" />
        </div>
      </div>

      {/* Legal */}
      <div className="border-t border-line bg-midnight">
        <div className="container-site grid grid-cols-1 gap-6 py-10 text-xs leading-relaxed text-muted md:grid-cols-12">
          <div className="space-y-3 md:col-span-8">
            <p className="text-sm font-medium text-warm/90">{brand.legal.independence}</p>
            <p>{brand.legal.credits}</p>
            <p>{brand.legal.trademarks}</p>
            <p>Figures marked as sample or product preview are illustrative and are not live data.</p>
          </div>
          <div className="flex flex-col items-start justify-between gap-6 md:col-span-4 md:items-end">
            <div className="flex items-center gap-2">
              <XLink />
              <a href="#main" className="f-link group inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm text-warm/90 hover:border-line-strong">
              <span className="f-link-text">Back to top</span>
              <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 transition-transform duration-300 group-hover:-translate-y-0.5">
                <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              </a>
            </div>
            <nav aria-label="Legal" className="flex gap-5 text-sm">
              <Link href="/terms" className="inline-flex min-h-11 items-center text-warm/90 underline-offset-4 hover:underline">
                Terms of Service
              </Link>
              <Link href="/privacy" className="inline-flex min-h-11 items-center text-warm/90 underline-offset-4 hover:underline">
                Privacy Policy
              </Link>
            </nav>
            <p className="font-mono">
              © {year} {brand.name}. All rights reserved.
            </p>
          </div>
        </div>
      </div>
      <StructuredData url={url} />
    </footer>
  );
}
