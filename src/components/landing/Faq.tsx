"use client";

import { Accordion } from "radix-ui";
import { faqItems as items } from "./faq-items";

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 py-24 md:py-32" aria-labelledby="faq-title">
      <div className="container-site grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4" data-reveal="left">
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-title" className="display mt-4 text-[clamp(3rem,6vw,4.75rem)]">
            Straight <span className="text-sunset-flow-soft">answers.</span>
          </h2>
        </div>
        <Accordion.Root type="single" collapsible className="lg:col-span-8" data-reveal-stagger="70">
          {items.map((it, i) => (
            <Accordion.Item key={it.q} value={`q${i}`} className="border-b border-line">
              <Accordion.Header>
                <Accordion.Trigger className="group flex min-h-16 w-full items-center justify-between gap-6 py-5 text-left text-lg font-semibold transition-colors duration-200 hover:text-coral">
                  {it.q}
                  <span aria-hidden="true" className="relative h-4 w-4 shrink-0">
                    <span className="absolute inset-x-0 top-1/2 h-px bg-current" />
                    <span className="absolute inset-y-0 left-1/2 w-px bg-current transition-transform duration-200 group-data-[state=open]:scale-y-0" />
                  </span>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden data-[state=closed]:animate-none">
                <p className="max-w-2xl pb-6 text-muted">{it.a}</p>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
    </section>
  );
}
