export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** SOL amount from lamports, e.g. 150000000 → "0.15 SOL". Small amounts keep more decimals. */
export function fmtSol(lamports: number, opts: { unit?: boolean } = {}) {
  const sol = lamports / LAMPORTS_PER_SOL;
  const digits = sol !== 0 && Math.abs(sol) < 0.01 ? 6 : 4;
  const text = sol.toLocaleString("en-US", { minimumFractionDigits: sol === 0 ? 0 : 2, maximumFractionDigits: digits });
  return opts.unit === false ? text : `${text} SOL`;
}

export const fmtGta = (n: number) => `GTA$${fmtInt(n)}`;

export function fmtUsd(n: number, digits = 2) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtTokens(n: number, ticker: string) {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 })} ${ticker}`;
}

export function fmtDate(ms: number, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(ms));
}

export function fmtDateTime(ms: number) {
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }).format(new Date(ms))} UTC`;
}

export const PLATFORM_LABEL: Record<string, string> = { pc: "PC", playstation: "PlayStation", xbox: "Xbox" };
export const PLATFORM_LONG: Record<string, string> = { pc: "PC", playstation: "PlayStation 5", xbox: "Xbox Series X|S" };
export const REGION_LABEL: Record<string, string> = { US: "United States", UK: "United Kingdom", EU: "European Union" };
export const VERSION_LABEL: Record<string, string> = { gtao_gtav: "GTA Online (GTA V)", gta_vi: "GTA VI" };
