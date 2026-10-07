import { describe, expect, it } from "vitest";
import { DEFAULT_GRADING_POLICY, validateGradingPolicy } from "./grading";
import {
  type PolicyRules,
  averageOf,
  bandFor,
  englishOrdinal,
  parseScoreInput,
  rankByTotal,
  scoreWithin,
  subjectOutcome,
  summarizeSheet,
} from "./results";

const policy: PolicyRules = {
  caMax: 40,
  examMax: 60,
  passMark: 50,
  bands: DEFAULT_GRADING_POLICY.bands.map((b) => ({
    ...b,
    remarkEn: b.remarkEn ?? null,
    remarkAr: b.remarkAr ?? null,
  })),
};

describe("grading policy", () => {
  it("keeps the V1 bands and the school's pass mark and remarks valid", () => {
    expect(validateGradingPolicy(DEFAULT_GRADING_POLICY)).toEqual([]);
    expect(DEFAULT_GRADING_POLICY.passMark).toBe(50);
    expect(validateGradingPolicy({ ...DEFAULT_GRADING_POLICY, passMark: 101 })).toContain(
      "Pass mark must be a whole number from 0 to 100",
    );
  });

  it("maps every boundary to the right grade and remark", () => {
    const grade = (total: number) => bandFor(total, policy.bands)?.grade;
    expect([100, 70, 69, 60, 59, 50, 49, 45, 44, 40, 39, 0].map(grade).join("")).toBe(
      "AABBCCDDEEFF",
    );
    expect(bandFor(72, policy.bands)).toMatchObject({ remarkEn: "Excellent", remarkAr: "ممتاز" });
  });
});

describe("subject outcome", () => {
  it("treats blanks as not entered, never as zero", () => {
    expect(subjectOutcome({ ca: 30, exam: null }, policy)).toEqual({
      ca: 30,
      exam: null,
      total: null,
      band: null,
      passed: null,
    });
    expect(subjectOutcome(undefined, policy).total).toBeNull();
  });

  it("totals, grades and judges pass/fail against the pass mark", () => {
    expect(subjectOutcome({ ca: 20, exam: 30 }, policy)).toMatchObject({ total: 50, passed: true });
    // D (45–49) reads "Fair" but is below the pass mark of 50: remark and verdict differ.
    expect(subjectOutcome({ ca: 19, exam: 30 }, policy)).toMatchObject({
      total: 49,
      band: { grade: "D", remarkEn: "Fair" },
      passed: false,
    });
    expect(subjectOutcome({ ca: 0, exam: 0 }, { ...policy, passMark: null }).passed).toBeNull();
  });
});

describe("sheet summary", () => {
  it("gives an average and verdict only when every subject is complete", () => {
    const partial = summarizeSheet(
      [{ ca: 30, exam: 40 }, { ca: 20, exam: null }, undefined],
      policy,
    );
    expect(partial).toMatchObject({
      subjects: 3,
      completeSubjects: 1,
      startedSubjects: 2,
      complete: false,
      totalScore: null,
      average: null,
      passed: null,
    });
    const full = summarizeSheet(
      [
        { ca: 30, exam: 40 },
        { ca: 20, exam: 25 },
        { ca: 10, exam: 20 },
      ],
      policy,
    );
    expect(full).toMatchObject({ complete: true, totalScore: 145, average: 48.3, passed: false });
    expect(summarizeSheet([], policy).complete).toBe(false);
  });

  it("rounds the average half up to one decimal", () => {
    expect(averageOf([50, 51])).toBe(50.5);
    expect(averageOf([60, 61, 61, 61])).toBe(60.8); // 60.75 → 60.8
    expect(averageOf([1, 1, 2])).toBe(1.3);
    expect(averageOf([])).toBeNull();
  });
});

describe("positions", () => {
  it("lets ties share a position and skips the next (1, 1, 3)", () => {
    const ranks = rankByTotal([
      { key: "a", total: 400 },
      { key: "b", total: 520 },
      { key: "c", total: 400 },
      { key: "d", total: 380 },
      { key: "e", total: null },
      { key: "f", total: 520 },
    ]);
    expect(Object.fromEntries(ranks)).toEqual({ b: 1, f: 1, a: 3, c: 3, d: 5, e: null });
  });

  it("does not depend on input order", () => {
    const rows = [
      { key: 1, total: 10 },
      { key: 2, total: 30 },
      { key: 3, total: 20 },
      { key: 4, total: 30 },
    ];
    const a = Object.fromEntries(rankByTotal(rows));
    const b = Object.fromEntries(rankByTotal([...rows].reverse()));
    expect(a).toEqual(b);
    expect(a).toEqual({ 1: 4, 2: 1, 3: 3, 4: 1 });
  });

  it("writes English ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(englishOrdinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "101st",
    ]);
  });
});

describe("score input", () => {
  it("accepts blanks and whole numbers only", () => {
    expect(parseScoreInput("")).toBeNull();
    expect(parseScoreInput("  ")).toBeNull();
    expect(parseScoreInput(" 35 ")).toBe(35);
    for (const bad of ["-1", "3.5", "1e2", "abc", "1000", "٣٥"])
      expect(parseScoreInput(bad)).toBe("invalid");
    expect(scoreWithin(40, 40)).toBe(true);
    expect(scoreWithin(41, 40)).toBe(false);
    expect(scoreWithin(null, 40)).toBe(true);
  });
});
