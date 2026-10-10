import { brand } from "@/config/brand";
import { Atmosphere } from "@/components/brand/Atmosphere";
import { MembershipCard } from "@/components/brand/MembershipCard";
import { PhoneFrame, WalletPass, type WalletPassData } from "@/components/brand/WalletPass";
import { ButtonLink } from "@/components/ui/Button";
import { PreviewBadge } from "@/components/ui/Badges";
import { fmtSol } from "@/lib/format";
import { HeroStage } from "@/components/landing/fx/HeroStage";
import { Embers } from "@/components/landing/fx/Embers";
import { Magnetic } from "@/components/landing/fx/Magnetic";

export interface HeroSample {
  memberName: string;
  membershipId: string;
  available: number;
  pending: number;
  selectedName: string;
  selectedCost: number;
  pass: WalletPassData;
}

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/** Headline line split into letters that flip up in sequence after the intro. */
function SplitLine({ text, delay, offset }: { text: string; delay: number; offset: number }) {
  let i = offset;
  return (
    <span className="split-line" aria-hidden="true" style={{ "--d": `${delay}ms` } as Vars}>
      {text.split(" ").map((word, w) => (
        <span key={w}>
          {w > 0 && " "}
          <span className="split-word">
            {Array.from(word).map((ch, c) => (
              <span key={c} className="split-char" style={{ "--i": i++ } as Vars}>
                {ch}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

export function Hero({ sample }: { sample: HeroSample }) {
  const progress = Math.min(1, sample.available / sample.selectedCost);
  return (
    <HeroStage className="relative isolate overflow-hidden pt-24 pb-16 md:pt-28 lg:min-h-[100svh] lg:pb-24" aria-labelledby="hero-title">
      {/* Synthwave sun sitting on the horizon */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-[2] overflow-hidden">
        <div
          className="depth absolute bottom-[20%] left-1/2 w-[88vw] max-w-[560px] -translate-x-1/2 translate-y-[18%] lg:left-[72%] lg:w-[44vw]"
          style={{ "--depth": -14, "--lift": 160 } as Vars}
        >
          <div className="relative aspect-square w-full">
            <div className="retro-sun-glow -left-[25%] -top-[25%] w-[150%]" />
            <div className="retro-sun inset-0 w-full" />
          </div>
        </div>
        <div className="retro-grid top-[80%] bg-midnight">
          <div className="retro-plane" />
        </div>
      </div>
      <Atmosphere />
      <Embers className="pointer-events-none absolute inset-0 size-full" />

      <div className="container-site relative grid grid-cols-1 items-center gap-y-14 lg:grid-cols-12 lg:gap-x-8">
        <div className="hero-exit lg:col-span-6 xl:col-span-6">
          <p className="eyebrow reveal-up" style={{ "--d": "0ms" } as Vars}>
            Hold {brand.ticker} · Collect funded rewards · Redeem for game credit
          </p>
          <h1
            id="hero-title"
            aria-label="Your next upgrade. Earned."
            className="display mt-5 text-[clamp(4rem,13.5vw,9.75rem)] lg:text-[clamp(5.5rem,9.4vw,9.75rem)]"
          >
            <SplitLine text="Your next" delay={80} offset={0} />
            <SplitLine text="upgrade." delay={80} offset={9} />
            <span aria-hidden="true" className="wipe-in block w-fit pr-[0.06em]" style={{ "--d": "760ms" } as Vars}>
              <span className="text-sunset-flow">Earned.</span>
            </span>
          </h1>
          <p className="reveal-up mt-7 max-w-[30rem] text-lg leading-relaxed text-warm/85 md:text-xl" style={{ "--d": "900ms" } as Vars}>
            {brand.heroSupport}
          </p>
          <div className="reveal-up mt-9 flex flex-wrap gap-3" style={{ "--d": "1000ms" } as Vars}>
            <Magnetic>
              <ButtonLink href="#rewards" size="lg" className="shine shadow-[0_0_40px_-6px_rgb(255_78_174/0.7)]">
                Explore rewards
              </ButtonLink>
            </Magnetic>
            <Magnetic strength={0.22}>
              <ButtonLink href="#wallet" size="lg" variant="secondary">
                Preview your card
              </ButtonLink>
            </Magnetic>
          </div>
          <div className="reveal-up mt-10 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ "--d": "1100ms" } as Vars}>
            <span className="eyebrow">GTA Online Shark Cards for</span>
            <ul className="flex items-center gap-3 text-sm font-semibold text-warm/90" aria-label="Supported platforms">
              <li>PC</li>
              <li aria-hidden="true" className="text-muted/50">/</li>
              <li>PlayStation</li>
              <li aria-hidden="true" className="text-muted/50">/</li>
              <li>Xbox</li>
            </ul>
          </div>
        </div>

        {/* Card scene */}
        <div className="relative mx-auto w-full max-w-[640px] lg:col-span-6 lg:max-w-none">
          <div className="reveal-up relative aspect-[1.08/1] w-full sm:aspect-[1.25/1]" style={{ "--d": "300ms" } as Vars}>
            <div className="depth absolute right-[2%] top-[0%] w-[34%] sm:w-[30%]" style={{ "--depth": 30, "--lift": -60 } as Vars}>
              <div className="bob rotate-[7deg] opacity-90" style={{ "--bob": "9s", "--bob-delay": "-3s" } as Vars}>
                <PhoneFrame className="text-[7px] sm:text-[8px] lg:text-[9px]">
                  <WalletPass data={sample.pass} fontSize="inherit" />
                </PhoneFrame>
              </div>
            </div>
            <div className="depth absolute left-[2%] top-[18%] w-[80%] sm:left-[4%] sm:w-[74%]" style={{ "--depth": 16, "--lift": -20 } as Vars}>
              <div className="bob" style={{ "--bob": "8s" } as Vars}>
                <MembershipCard
                  memberName={sample.memberName}
                  membershipId={sample.membershipId}
                  balance={sample.available}
                  priority="hero"
                />
              </div>
            </div>
            <div className="depth absolute bottom-[1%] left-0 w-[46%] max-w-[230px]" style={{ "--depth": 44, "--lift": -110 } as Vars}>
              <div className="glass bob rounded-2xl p-3 sm:p-4" style={{ "--bob": "6s", "--bob-delay": "-1.5s" } as Vars}>
                <div className="eyebrow !text-[0.6rem]">SOL rewards ready</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="num text-xl font-medium text-warm sm:text-2xl">{fmtSol(sample.available, { unit: false })}</span>
                  <span className="font-mono text-[0.65rem] text-muted">SOL</span>
                </div>
                <div className="mt-1 font-mono text-[0.62rem] text-muted">+{fmtSol(sample.pending)} pending</div>
              </div>
            </div>
            <div className="depth absolute bottom-[6%] right-0 w-[48%] max-w-[250px]" style={{ "--depth": 38, "--lift": -80 } as Vars}>
              <div className="glass bob rounded-2xl p-3 sm:p-4" style={{ "--bob": "7s", "--bob-delay": "-4s" } as Vars}>
                <div className="eyebrow !text-[0.6rem]">Progress to reward</div>
                <div className="mt-1 truncate text-sm font-semibold">{sample.selectedName}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={`Progress toward ${sample.selectedName}`}>
                  <div className="h-full rounded-full" style={{ width: `${progress * 100}%` }}>
                    <div className="fill-reveal h-full rounded-full bg-mint shadow-[0_0_10px_rgb(116_233_206/0.9)]" />
                  </div>
                </div>
                <div className="mt-1.5 font-mono text-[0.62rem] text-muted">
                  {fmtSol(sample.available)} / {fmtSol(sample.selectedCost)}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-center lg:justify-end">
            <PreviewBadge label="Product preview · sample data" />
          </div>
        </div>
      </div>
    </HeroStage>
  );
}
