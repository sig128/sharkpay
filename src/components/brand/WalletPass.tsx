import qrcode from "qrcode-generator";
import { clsx } from "clsx";
import { Fin } from "./Fin";

export interface WalletPassData {
  logoText: string;
  header: { label: string; value: string };
  primary: { label: string; value: string };
  secondary: Array<{ label: string; value: string }>;
  auxiliary: Array<{ label: string; value: string }>;
  barcode: { message: string; altText: string };
}

export function Qr({ message }: { message: string }) {
  const qr = qrcode(0, "M");
  qr.addData(message);
  qr.make();
  const n = qr.getModuleCount();
  const cells: string[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push(`M${c} ${r}h1v1h-1z`);
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} className="h-full w-full" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
      <path d={cells.join("")} fill="#000" />
    </svg>
  );
}

function Field({ label, value, align = "left", big = false }: { label: string; value: string; align?: "left" | "right"; big?: boolean }) {
  return (
    <div className={clsx("min-w-0", align === "right" && "text-right")}>
      <div className="text-[0.58em] font-semibold uppercase tracking-[0.06em] text-[rgb(255,136,107)]">{label}</div>
      <div className={clsx("truncate tabular-nums text-[rgb(255,244,234)]", big ? "text-[2.1em] font-light leading-tight" : "text-[0.95em]")}>
        {value}
      </div>
    </div>
  );
}

/**
 * Flat, Apple Wallet store-card style layout. Wallet renders passes as flat
 * cards; the website card's 3D material is intentionally not reproduced here.
 */
export function WalletPass({ data, className, fontSize }: { data: WalletPassData; className?: string; fontSize?: string }) {
  return (
    <div
      style={fontSize ? { fontSize } : undefined}
      className={clsx(
        "flex aspect-[0.66/1] w-full flex-col overflow-hidden rounded-[0.9em] bg-[rgb(18,22,37)] p-[0.9em] font-[system-ui,-apple-system,'Helvetica_Neue',sans-serif] text-[clamp(10px,1.1vw,15px)] shadow-[0_0_0_1px_rgb(255_255_255/0.08)]",
        className,
      )}
      role="img"
      aria-label={`Wallet pass preview: ${data.primary.label.toLowerCase()} ${data.primary.value}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-[0.4em]">
          <Fin className="h-[1.6em] w-[1.6em] shrink-0" />
          <span className="truncate text-[1.05em] font-semibold text-[rgb(255,244,234)]">{data.logoText}</span>
        </div>
        <Field label={data.header.label} value={data.header.value} align="right" />
      </div>
      <div className="mt-[1.2em]">
        <Field label={data.primary.label} value={data.primary.value} big />
      </div>
      <div className="mt-[1em] grid grid-cols-2 gap-[0.8em]">
        {data.secondary.map((f, i) => (
          <Field key={f.label} label={f.label} value={f.value} align={i === 1 ? "right" : "left"} />
        ))}
      </div>
      <div className="mt-[0.8em] grid grid-cols-2 gap-[0.8em]">
        {data.auxiliary.map((f, i) => (
          <Field key={f.label} label={f.label} value={f.value} align={i === 1 ? "right" : "left"} />
        ))}
      </div>
      <div className="mt-auto flex flex-col items-center pt-[0.8em]">
        <div className="w-[42%] rounded-[0.35em] bg-white p-[0.3em]">
          <Qr message={data.barcode.message} />
        </div>
        <div className="mt-[0.35em] font-mono text-[0.62em] tracking-wide text-[rgb(179,182,199)]">{data.barcode.altText}</div>
      </div>
    </div>
  );
}

/** A restrained phone frame for showing the pass in context. */
export function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("relative rounded-[2.4em] bg-[#0b0d16] p-[0.55em] shadow-[0_0_0_1px_rgb(255_255_255/0.12),0_40px_80px_-30px_rgb(0_0_0/0.9)]", className)}>
      <div className="relative overflow-hidden rounded-[1.95em] bg-[#000] px-[0.7em] pb-[1em] pt-[2.2em]">
        <div aria-hidden="true" className="absolute left-1/2 top-[0.6em] h-[1.1em] w-[32%] -translate-x-1/2 rounded-full bg-[#111]" />
        <div aria-hidden="true" className="mb-[0.6em] flex items-center justify-between px-[0.3em] text-[0.7em] font-semibold text-white/80">
          <span>Wallet</span>
          <span className="text-white/50">•••</span>
        </div>
        {children}
      </div>
    </div>
  );
}
