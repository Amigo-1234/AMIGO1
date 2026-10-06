import { pointedArchPath } from "@/lib/geometry";
import { cn } from "@/lib/cn";

const WIDTH = 200;
const HEIGHT = 260;
const PATH = pointedArchPath(WIDTH, HEIGHT);

/** A thin pointed-arch outline, used as a quiet architectural frame behind a focal element. */
export function PointedArch({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`-2 -2 ${WIDTH + 4} ${HEIGHT + 2}`}
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
      className={cn("pointer-events-none", className)}
    >
      <path
        d={PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
