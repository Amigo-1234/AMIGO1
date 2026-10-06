import { describe, expect, it } from "vitest";
import { khatamInnerRadius, pointedArchPath, starPoints, toPolygonPoints } from "./geometry";

describe("starPoints", () => {
  it("returns two vertices per point, alternating radii", () => {
    const vertices = starPoints(0, 0, 10, 5, 8);
    expect(vertices).toHaveLength(16);
    const radius = ([x, y]: [number, number]) => Math.hypot(x, y);
    expect(radius(vertices[0])).toBeCloseTo(10);
    expect(radius(vertices[1])).toBeCloseTo(5);
  });

  it("starts at the top by default", () => {
    expect(starPoints(20, 20, 10, 5)[0]).toEqual([20, 10]);
  });
});

describe("khatamInnerRadius", () => {
  it("places inner vertices where two overlapping squares intersect", () => {
    // The inner vertex of a khatam lies on a square's edge: x + y = R·√2 for the 45° square.
    const outer = 10;
    const [, inner] = starPoints(0, 0, outer, khatamInnerRadius(outer), 8, 0);
    expect(Math.abs(inner[0]) + Math.abs(inner[1])).toBeCloseTo(outer, 2);
  });
});

describe("toPolygonPoints", () => {
  it("serialises vertices for SVG", () => {
    expect(
      toPolygonPoints([
        [1, 2],
        [3.5, 4],
      ]),
    ).toBe("1,2 3.5,4");
  });
});

describe("pointedArchPath", () => {
  it("draws a symmetric arch that meets at the apex", () => {
    expect(pointedArchPath(100, 200)).toBe("M0 200 L0 84 Q0 20 50 0 Q100 20 100 84 L100 200");
  });
});
