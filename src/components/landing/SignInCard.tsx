"use client";

import { Dialog } from "radix-ui";
import { brand } from "@/config/brand";
import { LoginPanel } from "@/components/auth/LoginPanel";
import type { GamingProviderInfo, SocialProviderInfo } from "@/lib/server/auth/providers";

export interface SignInOptions {
  providers: GamingProviderInfo[];
  social: SocialProviderInfo[];
  emailEnabled: boolean;
  devMode: boolean;
}

const STEPS = [
  {
    title: "Sign in with an account you already have",
    body: "Microsoft, Steam, Google, X or a one-time email code. Sign-in happens on the provider's own page, and we never see your password.",
  },
  {
    title: "Pick your platform and region",
    body: "PC, PlayStation or Xbox, plus your store region. Shark Card codes only work where they're bought.",
  },
  {
    title: "Link a Solana wallet (optional)",
    body: "Sign a short message to prove it's yours. No transaction, no token approval, never a seed phrase. Rewards start from the next period.",
  },
];

export function SignInCard({ open, onOpenChange, options }: { open: boolean; onOpenChange: (open: boolean) => void; options: SignInOptions }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm data-[state=open]:animate-[fadein_200ms_ease-out]" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[70] max-h-[94dvh] overflow-y-auto rounded-t-3xl border border-line bg-surface shadow-2xl outline-none md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[92dvh] md:w-[min(920px,calc(100vw-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl">
          <Dialog.Close
            className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-white/5 hover:text-warm"
            aria-label="Close sign-in"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </Dialog.Close>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.1fr]">
            <section className="noise relative overflow-hidden border-b border-line p-6 md:border-b-0 md:border-r md:p-8" aria-labelledby="signin-how">
              <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(80%_60%_at_20%_100%,rgb(255_78_174/0.16),transparent_70%)]" />
              <div className="relative">
                <p className="eyebrow">How it works</p>
                <h3 id="signin-how" className="display mt-3 text-3xl md:text-4xl">
                  Three steps <span className="text-sunset">in.</span>
                </h3>
                <ol className="mt-5 space-y-3 md:mt-6 md:space-y-5">
                  {STEPS.map((s, i) => (
                    <li key={s.title} className="flex items-start gap-3 md:gap-4">
                      <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-sm text-coral md:h-8 md:w-8">{i + 1}</span>
                      <div className="pt-0.5">
                        <div className="text-sm font-semibold md:text-base">{s.title}</div>
                        <p className="mt-1 hidden text-sm leading-relaxed text-muted md:block">{s.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
            <section className="p-6 md:p-8">
              <p className="eyebrow">Sign in</p>
              <Dialog.Title className="display mt-3 text-3xl md:text-4xl">
                Your game. <span className="text-sunset">Your rewards.</span>
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted">
                New here? Signing in creates your {brand.name} membership.
              </Dialog.Description>
              <LoginPanel {...options} />
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
