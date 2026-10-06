import { khatamInnerRadius, starPoints, toPolygonPoints } from "@/lib/geometry";
import { cn } from "@/lib/cn";

const OUTER = toPolygonPoints(starPoints(24, 24, 21, khatamInnerRadius(21)));
const INNER = toPolygonPoints(starPoints(24, 24, 13, khatamInnerRadius(13)));

/**
 * The Markaz il Ginna mark: a khatam (eight-pointed star of two overlapping squares)
 * framing a smaller star and a gold centre. Decorative unless given a `title`.
 */
export function BrandMark({
  className,
  tone = "brand",
  title,
}: {
  className?: string;
  tone?: "brand" | "light";
  title?: string;
}) {
  const stroke = tone === "brand" ? "text-brand-800" : "text-ivory";
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("shrink-0", stroke, className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <polygon
        points={OUTER}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="miter"
      />
      <polygon
        points={INNER}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinejoin="miter"
        opacity={0.7}
      />
      <circle cx={24} cy={24} r={3.25} className="fill-gold-500" />
    </svg>
  );
}
