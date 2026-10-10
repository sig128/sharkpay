import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[background,color,box-shadow,transform,border-color] duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] select-none";
const variants: Record<Variant, string> = {
  primary:
    "bg-sunset text-ink shadow-[0_0_0_1px_rgb(255_255_255/0.15)_inset,0_10px_30px_-10px_rgb(255_78_174/0.7)] hover:shadow-[0_0_0_1px_rgb(255_255_255/0.3)_inset,0_14px_40px_-10px_rgb(255_78_174/0.9)]",
  secondary: "border border-line-strong bg-white/[0.04] text-warm hover:border-white/30 hover:bg-white/[0.08]",
  ghost: "text-muted hover:bg-white/[0.06] hover:text-warm",
  danger: "border border-[#ff6b6b]/40 bg-[#ff6b6b]/10 text-[#ffb3b3] hover:bg-[#ff6b6b]/20",
};
const sizes: Record<Size, string> = {
  sm: "min-h-11 px-4 text-sm",
  md: "min-h-11 px-5 text-[0.95rem]",
  lg: "min-h-13 px-7 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return clsx(base, variants[variant], sizes[size], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode } & Omit<
  ComponentProps<typeof Link>,
  "href" | "className"
>) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
