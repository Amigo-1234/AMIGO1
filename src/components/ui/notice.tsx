import type { ReactNode } from "react";
import { InfoIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

type Tone = "info" | "warning" | "danger";

const tones: Record<Tone, string> = {
  info: "border-brand-600 bg-brand-50 text-brand-900",
  warning: "border-gold-500 bg-warning-50 text-warning-700",
  danger: "border-danger-700 bg-danger-50 text-danger-700",
};

/** An inline message with an accent rule on the inline-start edge (left in LTR, right in RTL). */
export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-md border-s-2 px-3.5 py-3 text-sm",
        tones[tone],
        className,
      )}
    >
      <InfoIcon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
