import Link from "next/link";
import { brand } from "@/config/brand";
import { Fin } from "./Fin";

export function Wordmark({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`group inline-flex min-h-11 items-center gap-2 font-[family-name:var(--font-display)] text-[1.35rem] font-extrabold tracking-[0.06em] text-warm ${className}`}
      aria-label={`${brand.name} home`}
    >
      <Fin className="h-6 w-6 transition-transform duration-300 group-hover:-translate-y-0.5" />
      <span>{brand.name}</span>
    </Link>
  );
}
