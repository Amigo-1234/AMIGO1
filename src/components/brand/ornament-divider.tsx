import { khatamInnerRadius, starPoints, toPolygonPoints } from "@/lib/geometry";
import { cn } from "@/lib/cn";

const STAR = toPolygonPoints(starPoints(8, 8, 7, khatamInnerRadius(7)));

/** A fine rule with a small khatam at its centre. Decorative. */
export function OrnamentDivider({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex items-center gap-3 text-gold-500", className)}>
      <span className="h-px flex-1 bg-linear-to-l from-gold-300 to-transparent rtl:bg-linear-to-r" />
      <svg viewBox="0 0 16 16" className="size-4" focusable="false">
        <polygon points={STAR} fill="none" stroke="currentColor" strokeWidth={1} />
      </svg>
      <span className="h-px flex-1 bg-linear-to-r from-gold-300 to-transparent rtl:bg-linear-to-l" />
    </div>
  );
}
