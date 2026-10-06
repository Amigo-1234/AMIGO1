import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

type ButtonStyleProps = { variant?: Variant; size?: Size; block?: boolean };

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap " +
  "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55 " +
  "aria-disabled:cursor-not-allowed aria-disabled:opacity-55";

const variants: Record<Variant, string> = {
  primary: "bg-brand-800 text-ivory hover:bg-brand-900 active:bg-brand-950",
  secondary:
    "border border-stone-300 bg-white text-charcoal-900 hover:border-stone-400 hover:bg-sand-50",
  ghost: "text-brand-800 hover:bg-brand-50",
  danger: "bg-danger-700 text-white hover:bg-danger-800",
};

// Heights keep touch targets at 44px or more.
const sizes: Record<Size, string> = {
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

export function buttonClasses({ variant = "primary", size = "md", block }: ButtonStyleProps = {}) {
  return cn(base, variants[variant], sizes[size], block && "w-full");
}

export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & ButtonStyleProps) {
  return (
    <button
      type={type}
      className={cn(buttonClasses({ variant, size, block }), className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant,
  size,
  block,
  className,
  ...props
}: ComponentProps<typeof Link> & ButtonStyleProps) {
  return <Link className={cn(buttonClasses({ variant, size, block }), className)} {...props} />;
}
