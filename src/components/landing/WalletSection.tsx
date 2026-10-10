"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { MembershipCard } from "@/components/brand/MembershipCard";
import { PhoneFrame, WalletPass, type WalletPassData } from "@/components/brand/WalletPass";
import { PreviewBadge } from "@/components/ui/Badges";

interface Props {
  memberName: string;
  membershipId: string;
  balance: number;
  pass: WalletPassData;
}

const beats = [
  { title: "Your card, on the web", body: "The full-colour membership card lives on the site and in the app." },
  { title: "Resolved into a Wallet pass", body: "Apple Wallet shows a clean, flat pass with your $SHARK holdings, SOL rewards and membership reference." },
  { title: "A view, not a wallet of money", body: "The pass can't pay or redeem. Redemption always happens in the signed-in app." },
];

export function WalletSection(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  const cardRotX = useTransform(scrollYProgress, [0, 0.45], [10, 0]);
  const cardRotY = useTransform(scrollYProgress, [0, 0.45], [-18, 0]);
  const cardScale = useTransform(scrollYProgress, [0.2, 0.6], [1, 0.56]);
  const cardX = useTransform(scrollYProgress, [0.2, 0.6], ["-30%", "0%"]);
  const cardOpacity = useTransform(scrollYProgress, [0.52, 0.66], [1, 0]);
  const phoneOpacity = useTransform(scrollYProgress, [0.25, 0.5], [0, 1]);
  const phoneY = useTransform(scrollYProgress, [0.25, 0.55], [60, 0]);
  const passOpacity = useTransform(scrollYProgress, [0.55, 0.7], [0, 1]);
  const b0 = useTransform(scrollYProgress, [0, 0.2, 0.33], [1, 1, 0.25]);
  const b1 = useTransform(scrollYProgress, [0.28, 0.42, 0.62, 0.72], [0.25, 1, 1, 0.25]);
  const b2 = useTransform(scrollYProgress, [0.66, 0.8], [0.25, 1]);
  const beatOpacity = [b0, b1, b2];

  const copy = (
    <div>
      <p className="eyebrow">Apple Wallet</p>
      <h2 id="wallet-title" className="display mt-4 text-[clamp(3rem,7vw,5.5rem)]">
        Balance in <span className="text-sunset-flow-soft">your pocket.</span>
      </h2>
      <ol className="mt-8 space-y-6">
        {beats.map((b, i) => (
          <motion.li key={b.title} style={reduce ? undefined : { opacity: beatOpacity[i] }} className="border-l border-line-strong pl-5">
            <h3 className="text-lg font-bold">{b.title}</h3>
            <p className="mt-1 max-w-md text-muted">{b.body}</p>
          </motion.li>
        ))}
      </ol>
      <div className="mt-8 rounded-2xl border border-line bg-white/[0.03] p-5 text-sm text-muted">
        <strong className="text-warm">Wallet pass ≠ Apple Pay.</strong> A rewards pass displays membership info. It does
        not turn SOL rewards or GTA$ into spendable money. A future payment card would need a regulated issuing
        partner and is shown in the app as planned, not live.
      </div>
      <div className="mt-5">
        <PreviewBadge label="Preview · not an official Apple product" />
      </div>
    </div>
  );

  if (reduce) {
    return (
      <section id="wallet" className="scroll-mt-20 py-24" aria-labelledby="wallet-title">
        <div className="container-site grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">{copy}</div>
          <div className="grid grid-cols-1 items-center gap-10 sm:grid-cols-2 lg:col-span-7">
            <MembershipCard {...props} pose={{ x: 0, y: 0, z: 0 }} interactive={false} />
            <PhoneFrame className="mx-auto w-[240px] text-[10px]">
              <WalletPass data={props.pass} fontSize="inherit" />
            </PhoneFrame>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="wallet" ref={ref} className="relative h-[260vh] scroll-mt-20" aria-labelledby="wallet-title">
      <div className="sticky top-0 flex min-h-[100svh] items-center overflow-hidden py-20">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(50%_50%_at_70%_50%,rgb(255_78_174/0.12),transparent_70%)]" />
        <div className="container-site relative grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
          <div className="order-2 lg:order-1 lg:col-span-5">{copy}</div>
          <div className="relative order-1 flex h-[46svh] min-h-[340px] items-center justify-center lg:order-2 lg:col-span-7 lg:h-[72svh]">
            <motion.div style={{ opacity: phoneOpacity, y: phoneY }} className="absolute aspect-[0.5/1] h-full max-h-[600px]">
              <PhoneFrame className="h-full text-[clamp(7px,1.5svh,11px)]">
                <motion.div style={{ opacity: passOpacity }}>
                  <WalletPass data={props.pass} fontSize="inherit" />
                </motion.div>
              </PhoneFrame>
            </motion.div>
            <motion.div
              style={{ rotateX: cardRotX, rotateY: cardRotY, scale: cardScale, x: cardX, opacity: cardOpacity, transformPerspective: 1400 }}
              className="absolute w-[min(92%,520px)]"
            >
              <MembershipCard {...props} pose={{ x: 0, y: 0, z: 0 }} interactive={false} />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
