/** Formats atomic token units as a decimal string without trailing zeros. */
export function formatUnits(atomic: bigint, decimals: number): string {
  const s = atomic.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
