import { useId } from "react";
import { khatamInnerRadius, starPoints, toPolygonPoints } from "@/lib/geometry";
import { cn } from "@/lib/cn";

const TILE = 64;
const STAR_RADIUS = 19;
const DIAMOND = 7;

function star(cx: number, cy: number) {
  return toPolygonPoints(starPoints(cx, cy, STAR_RADIUS, khatamInnerRadius(STAR_RADIUS)));
}

function diamond(cx: number, cy: number) {
  return `${cx},${cy - DIAMOND} ${cx + DIAMOND},${cy} ${cx},${cy + DIAMOND} ${cx - DIAMOND},${cy}`;
}

// A star-and-cross lattice: khatam stars on the tile centre and corners, diamonds between them.
const STARS = [
  [TILE / 2, TILE / 2],
  [0, 0],
  [TILE, 0],
  [0, TILE],
  [TILE, TILE],
].map(([x, y]) => star(x, y));
const DIAMONDS = [
  [TILE / 2, 0],
  [0, TILE / 2],
  [TILE, TILE / 2],
  [TILE / 2, TILE],
].map(([x, y]) => diamond(x, y));

/**
 * A restrained, mashrabiya-inspired repeating pattern that fills its positioned parent.
 * Colour comes from `currentColor`; keep opacity low (it is atmosphere, not content).
 */
export function GeometricPattern({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    >
      <defs>
        <pattern id={id} width={TILE} height={TILE} patternUnits="userSpaceOnUse">
          {STARS.map((points) => (
            <polygon
              key={points}
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.75}
            />
          ))}
          {DIAMONDS.map((points) => (
            <polygon
              key={points}
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.75}
            />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
