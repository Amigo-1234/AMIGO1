/**
 * Result calculations. Pure and deterministic: the server computes every derived value
 * (totals come from the database; grades, verdicts, averages and positions from here), and
 * the browser only previews. Rules, from the session's grading policy and the school's
 * decisions (Phase 5):
 *
 * - A subject is complete when both CA and exam are entered. Blank is "not entered",
 *   never 0. Its total is CA + exam; its grade and remark come from the policy's bands.
 * - Pass/fail: a subject passes when its total reaches the policy's pass mark; the term
 *   passes when the average does. No pass mark in the policy means no verdict.
 * - Average: mean of the subject totals, to one decimal (half up), only when every subject
 *   of the level's curriculum is complete.
 * - Positions: within a level and term, by the sum of subject totals (equivalent to the
 *   average, since everyone ranked takes the same subjects). Ties share a position and the
 *   next is skipped (1, 1, 3). Only complete, finalized sheets are ranked.
 */

export type PolicyBand = {
  grade: string;
  minScore: number;
  maxScore: number;
  remarkEn: string | null;
  remarkAr: string | null;
};

export type PolicyRules = {
  caMax: number;
  examMax: number;
  passMark: number | null;
  bands: PolicyBand[];
};

export type ScorePair = { ca: number | null; exam: number | null };

export type SubjectOutcome = {
  ca: number | null;
  exam: number | null;
  total: number | null;
  band: PolicyBand | null;
  passed: boolean | null;
};

export function bandFor(total: number, bands: readonly PolicyBand[]): PolicyBand | null {
  return bands.find((b) => total >= b.minScore && total <= b.maxScore) ?? null;
}

export function passes(score: number | null, passMark: number | null): boolean | null {
  return score === null || passMark === null ? null : score >= passMark;
}

export function subjectOutcome(
  score: ScorePair | null | undefined,
  policy: PolicyRules,
): SubjectOutcome {
  const ca = score?.ca ?? null;
  const exam = score?.exam ?? null;
  const total = ca !== null && exam !== null ? ca + exam : null;
  return {
    ca,
    exam,
    total,
    band: total === null ? null : bandFor(total, policy.bands),
    passed: passes(total, policy.passMark),
  };
}

/** Mean of whole-number totals to one decimal place, rounding halves up. */
export function averageOf(totals: readonly number[]): number | null {
  if (!totals.length) return null;
  const sum = totals.reduce((a, b) => a + b, 0);
  return Math.round((sum * 10) / totals.length) / 10;
}

export type SheetSummary = {
  subjects: number;
  /** Subjects with both parts entered. */
  completeSubjects: number;
  /** Subjects with at least one part entered. */
  startedSubjects: number;
  complete: boolean;
  /** Sum of subject totals, only when complete. */
  totalScore: number | null;
  average: number | null;
  passed: boolean | null;
};

/**
 * Summarise one sheet over the level's curriculum (one entry per subject, in order;
 * `undefined` or blanks for subjects without scores).
 */
export function summarizeSheet(
  scores: readonly (ScorePair | null | undefined)[],
  policy: PolicyRules,
): SheetSummary {
  const outcomes = scores.map((s) => subjectOutcome(s, policy));
  const totals = outcomes.flatMap((o) => (o.total === null ? [] : [o.total]));
  const complete = scores.length > 0 && totals.length === scores.length;
  const average = complete ? averageOf(totals) : null;
  return {
    subjects: scores.length,
    completeSubjects: totals.length,
    startedSubjects: outcomes.filter((o) => o.ca !== null || o.exam !== null).length,
    complete,
    totalScore: complete ? totals.reduce((a, b) => a + b, 0) : null,
    average,
    passed: passes(average, policy.passMark),
  };
}

/**
 * Competition ranking ("1224"): equal totals share a position and the next position is
 * skipped. Entries without a total are not ranked (null).
 */
export function rankByTotal<K>(
  entries: readonly { key: K; total: number | null }[],
): Map<K, number | null> {
  const ranked = entries
    .filter((e): e is { key: K; total: number } => e.total !== null)
    .sort((a, b) => b.total - a.total);
  const positions = new Map<K, number | null>(entries.map((e) => [e.key, null]));
  ranked.forEach((entry, index) => {
    const previous = ranked[index - 1];
    const position =
      previous && previous.total === entry.total ? positions.get(previous.key)! : index + 1;
    positions.set(entry.key, position);
  });
  return positions;
}

/** A typed score: blank → null (not entered); a whole number → itself; otherwise invalid. */
export function parseScoreInput(raw: unknown): number | null | "invalid" {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (!/^\d{1,3}$/.test(text)) return "invalid";
  return Number(text);
}

export function scoreWithin(value: number | null, max: number): boolean {
  return value === null || (Number.isInteger(value) && value >= 0 && value <= max);
}

/** English ordinal (1st, 2nd, 3rd, 11th, 21st...). */
export function englishOrdinal(n: number): string {
  const rule = new Intl.PluralRules("en", { type: "ordinal" }).select(n);
  const suffix =
    { one: "st", two: "nd", few: "rd", other: "th" }[rule as "one" | "two" | "few" | "other"] ??
    "th";
  return `${n}${suffix}`;
}
