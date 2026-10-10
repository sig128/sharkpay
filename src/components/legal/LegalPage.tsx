import Link from "next/link";
import type { ReactNode } from "react";
import { brand } from "@/config/brand";
import { Wordmark } from "@/components/brand/Wordmark";

export const LEGAL_UPDATED = "October 10, 2026";

export function Contact() {
  return brand.contactEmail ? (
    <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>
  ) : (
    <>
      a direct message to <a href={brand.social.x.url} rel="noopener noreferrer" target="_blank">{brand.social.x.handle}</a> on X
    </>
  );
}

export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <main id="main" className="noise min-h-dvh px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <Wordmark />
        <p className="eyebrow mt-12">Legal</p>
        <h1 className="display mt-3 text-[clamp(2.6rem,8vw,4.5rem)]">{title}</h1>
        <p className="num mt-3 text-xs text-muted">Last updated {LEGAL_UPDATED}</p>
        <div className="mt-6 text-lg leading-relaxed text-warm/90">{intro}</div>
        <div className="legal mt-10 space-y-10 text-[0.97rem] leading-relaxed text-muted">{children}</div>
        <footer className="mt-16 flex flex-wrap gap-x-6 border-t border-line pt-4 text-sm text-muted">
          <Link href="/" className="inline-flex min-h-11 items-center hover:text-warm">Home</Link>
          <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-warm">Terms of Service</Link>
          <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-warm">Privacy Policy</Link>
          <span className="mt-2 w-full text-xs">{brand.legal.independence}</span>
        </footer>
      </div>
    </main>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-8">
      <h2 id={`${id}-h`} className="display text-3xl text-warm">
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
