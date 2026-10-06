import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "accent";

const tones: Record<BadgeTone, string> = {
  neutral: "border-stone-300 bg-stone-100 text-charcoal-700",
  success: "border-brand-200 bg-brand-50 text-brand-800",
  warning: "border-gold-300 bg-warning-50 text-warning-700",
  danger: "border-danger-200 bg-danger-50 text-danger-700",
  accent: "border-gold-300 bg-sand-50 text-gold-700",
};

/** Compact status label (e.g. PAID / PARTIAL / UNPAID). Meaning is in the text, not only the colour. */
export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-semibold tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
