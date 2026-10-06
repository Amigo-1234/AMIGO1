/**
 * Small helpers for the Islamic geometric motifs (8-fold stars, pointed arches).
 * Pure functions that return SVG coordinate strings, so they render on the server
 * and ship no JavaScript.
 */

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Vertices of a star polygon alternating between `outer` and `inner` radii. */
export function starPoints(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points = 8,
  rotationDegrees = -90,
): Array<[number, number]> {
  const vertices: Array<[number, number]> = [];
  const step = Math.PI / points;
  const start = (rotationDegrees * Math.PI) / 180;
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = start + i * step;
    vertices.push([round(cx + radius * Math.cos(angle)), round(cy + radius * Math.sin(angle))]);
  }
  return vertices;
}

/** `points` attribute value for an SVG <polygon>. */
export function toPolygonPoints(vertices: Array<[number, number]>): string {
  return vertices.map(([x, y]) => `${x},${y}`).join(" ");
}

/**
 * Inner radius that makes an 8-pointed star from two overlapping squares
 * (the khatam / Rub el Hizb): r = R·cos(45°)/cos(22.5°).
 */
export function khatamInnerRadius(outer: number): number {
  return round((outer * Math.cos(Math.PI / 4)) / Math.cos(Math.PI / 8));
}

/**
 * Outline of a pointed (two-centred) arch standing on its springing line.
 * `shoulder` is the fraction of the height where the straight jambs end.
 */
export function pointedArchPath(width: number, height: number, shoulder = 0.42): string {
  const spring = round(height * shoulder);
  const mid = round(width / 2);
  const control = round(height * 0.1);
  return [
    `M0 ${height}`,
    `L0 ${spring}`,
    `Q0 ${control} ${mid} 0`,
    `Q${width} ${control} ${width} ${spring}`,
    `L${width} ${height}`,
  ].join(" ");
}
