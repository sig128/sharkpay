import { clsx } from "clsx";
import { Fin } from "./Fin";

/** Original tier artwork for reward tiles (not Rockstar artwork). */
const palettes: Record<string, string> = {
  red: "linear-gradient(135deg,#ff6b6b,#ff4eae)",
  tiger: "linear-gradient(135deg,#ffb36b,#ff886b)",
  bull: "linear-gradient(135deg,#74e9ce,#4aa8ff)",
  great_white: "linear-gradient(135deg,#e8ecff,#b9a4ff)",
  whale: "linear-gradient(135deg,#6b8cff,#b9a4ff)",
  megalodon: "linear-gradient(135deg,#ffe5a5,#ff886b 60%,#ff4eae)",
};

export function TierArt({ tier, className, label }: { tier: string; className?: string; label?: string }) {
  return (
    <div
      aria-hidden="true"
      className={clsx("relative overflow-hidden rounded-xl", className)}
      style={{ background: palettes[tier] ?? palettes.red }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_20%_10%,rgb(255_255_255/0.45),transparent_60%)]" />
      <Fin tone="ink" className="absolute -bottom-[18%] -right-[8%] h-[110%] w-auto opacity-25" />
      {label && (
        <span className="absolute left-3 top-3 font-display text-lg font-extrabold uppercase leading-none tracking-wide text-ink/85">
          {label}
        </span>
      )}
    </div>
  );
}
