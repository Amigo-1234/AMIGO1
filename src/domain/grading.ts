/**
 * Grading policy rules. The defaults reproduce V1 exactly:
 * CA out of 40, exam out of 60 (total 100); A 70–100, B 60–69, C 50–59, D 45–49,
 * E 40–44, F 0–39.
 *
 * Policies are stored in the database (grading_policies, grade_bands) so thresholds can
 * change in future sessions without code changes; each session points at one policy.
 */
export type GradeBand = { grade: string; minScore: number; maxScore: number };

export type GradingPolicyDefinition = {
  name: string;
  caMax: number;
  examMax: number;
  bands: GradeBand[];
};

export const DEFAULT_GRADING_POLICY: GradingPolicyDefinition = {
  name: "Standard (CA 40 / Exam 60)",
  caMax: 40,
  examMax: 60,
  bands: [
    { grade: "A", minScore: 70, maxScore: 100 },
    { grade: "B", minScore: 60, maxScore: 69 },
    { grade: "C", minScore: 50, maxScore: 59 },
    { grade: "D", minScore: 45, maxScore: 49 },
    { grade: "E", minScore: 40, maxScore: 44 },
    { grade: "F", minScore: 0, maxScore: 39 },
  ],
};

/**
 * A policy is valid when CA + exam = 100 and its bands cover every whole score from 0 to
 * 100 exactly once (no gaps, no overlaps) with distinct grade letters.
 * Returns a list of problems; empty means valid.
 */
export function validateGradingPolicy(policy: GradingPolicyDefinition): string[] {
  const problems: string[] = [];
  const isWhole = (n: number) => Number.isInteger(n);

  if (!isWhole(policy.caMax) || policy.caMax <= 0)
    problems.push("CA maximum must be a positive whole number");
  if (!isWhole(policy.examMax) || policy.examMax <= 0)
    problems.push("Exam maximum must be a positive whole number");
  if (policy.caMax + policy.examMax !== 100)
    problems.push("CA and exam maximums must add up to 100");

  const grades = policy.bands.map((b) => b.grade);
  if (new Set(grades).size !== grades.length) problems.push("Grade letters must be unique");

  for (const band of policy.bands) {
    if (!/^[A-Z][+-]?$/.test(band.grade)) problems.push(`Invalid grade label: ${band.grade}`);
    if (!isWhole(band.minScore) || !isWhole(band.maxScore) || band.minScore > band.maxScore) {
      problems.push(`Band ${band.grade} has an invalid range`);
    }
  }

  const sorted = [...policy.bands].sort((a, b) => a.minScore - b.minScore);
  let expected = 0;
  for (const band of sorted) {
    if (band.minScore !== expected) {
      problems.push(
        band.minScore > expected
          ? `Scores ${expected}–${band.minScore - 1} have no grade`
          : `Band ${band.grade} overlaps another band`,
      );
    }
    expected = Math.max(expected, band.maxScore + 1);
  }
  if (expected !== 101) problems.push(`Scores ${expected}–100 have no grade`);

  return problems;
}
