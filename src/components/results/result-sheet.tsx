import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { Badge } from "@/components/ui/badge";
import {
  englishOrdinal,
  type PolicyRules,
  type SheetSummary,
  type SubjectOutcome,
} from "@/domain/results";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatNumber, interpolate } from "@/i18n/format";
import { cn } from "@/lib/cn";

export type SheetLine = {
  subject: { id: string; code: string; nameEn: string; nameAr: string };
  outcome: SubjectOutcome;
};

export type SheetData = {
  sessionLabel: string;
  termNameEn: string;
  termNameAr: string;
  levelCode: string;
  levelNameEn: string;
  levelNameAr: string;
  status: "draft" | "finalized";
  published: boolean;
  policy: PolicyRules;
  lines: SheetLine[];
  summary: SheetSummary;
  position: number | null;
  ranked: number;
};

/**
 * One student's result sheet. Shows only stored scores and values computed on the server
 * from the session's grading policy: no signatures, attendance, comments or statistics
 * (the school records none yet). Prints on A4.
 */
export function ResultSheet({
  locale,
  t,
  student,
  sheet,
  staffView = false,
}: {
  locale: Locale;
  t: Dictionary;
  student: { fullName: string; publicId: string };
  sheet: SheetData;
  /** Shows the sheet's status and whether the student can see it. */
  staffView?: boolean;
}) {
  const s = t.sheet;
  const ar = locale === "ar";
  const num = (n: number) => formatNumber(n, locale);
  const blank = <span className="text-stone-500 italic">{s.notEntered}</span>;
  const value = (n: number | null) => (n === null ? blank : num(n));
  const verdict = (passed: boolean | null) =>
    passed === null ? (
      <span className="text-stone-500">—</span>
    ) : (
      <span className={cn("font-semibold", passed ? "text-brand-800" : "text-danger-700")}>
        {passed ? s.pass : s.fail}
      </span>
    );
  const position =
    sheet.position === null
      ? s.notRanked
      : interpolate(s.positionOf, {
          position: ar ? num(sheet.position) : englishOrdinal(sheet.position),
          count: num(sheet.ranked),
        });

  const facts: [string, ReactNode][] = [
    [
      s.name,
      <span key="n" className="user-text">
        {student.fullName}
      </span>,
    ],
    [
      s.studentId,
      <span key="i" dir="ltr">
        {student.publicId}
      </span>,
    ],
    [
      s.session,
      <span key="s" dir="ltr">
        {sheet.sessionLabel}
      </span>,
    ],
    [s.term, ar ? sheet.termNameAr : sheet.termNameEn],
    [s.level, `${ar ? sheet.levelNameAr : sheet.levelNameEn} (${sheet.levelCode})`],
  ];

  return (
    <article className="result-sheet rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gold-300 pb-4">
        <BrandLockup locale={locale} />
        <div className="text-end">
          <h2 className="text-xl font-semibold text-brand-950">{s.title}</h2>
          {staffView && (
            <p className="mt-1 flex flex-wrap justify-end gap-2 print:hidden">
              <Badge tone={sheet.status === "finalized" ? "success" : "warning"}>
                {sheet.status === "finalized" ? s.finalized : s.draft}
              </Badge>
              <Badge tone={sheet.status === "finalized" && sheet.published ? "success" : "neutral"}>
                {sheet.status === "finalized" && sheet.published
                  ? s.visibleToStudent
                  : s.hiddenFromStudent}
              </Badge>
            </p>
          )}
        </div>
      </header>

      <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 print:grid-cols-3">
        {facts.map(([label, content]) => (
          <div key={label}>
            <dt className="text-xs text-stone-600">{label}</dt>
            <dd className="font-semibold text-charcoal-900">{content}</dd>
          </div>
        ))}
      </dl>

      {/* Phones: one row per subject. */}
      <ul className="mt-5 divide-y divide-stone-200 border-y border-stone-200 sm:hidden print:hidden">
        {sheet.lines.map(({ subject, outcome }) => (
          <li key={subject.id} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-charcoal-900">
                {ar ? subject.nameAr : subject.nameEn}
              </span>
              <span className="text-lg font-semibold text-brand-950 tabular-nums">
                {outcome.total === null ? blank : num(outcome.total)}
                {outcome.band && (
                  <span className="ms-2 text-base text-gold-700">{outcome.band.grade}</span>
                )}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap justify-between gap-x-4 text-sm text-charcoal-700">
              <span>
                {s.ca} {value(outcome.ca)} · {s.exam} {value(outcome.exam)}
              </span>
              <span>
                {outcome.band && (ar ? outcome.band.remarkAr : outcome.band.remarkEn)}
                {outcome.passed !== null && <> · {verdict(outcome.passed)}</>}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* Wider screens and print: a table. */}
      <table className="mt-5 hidden w-full text-sm sm:table print:table">
        <thead className="border-y border-stone-300 bg-sand-50 text-stone-600 print:bg-transparent">
          <tr>
            <th scope="col" className="px-2 py-2 text-start font-semibold">
              {s.subject}
            </th>
            <th scope="col" className="px-2 py-2 text-end font-semibold">
              {s.ca} <span className="font-normal">/{num(sheet.policy.caMax)}</span>
            </th>
            <th scope="col" className="px-2 py-2 text-end font-semibold">
              {s.exam} <span className="font-normal">/{num(sheet.policy.examMax)}</span>
            </th>
            <th scope="col" className="px-2 py-2 text-end font-semibold">
              {s.total}
            </th>
            <th scope="col" className="px-2 py-2 text-center font-semibold">
              {s.grade}
            </th>
            <th scope="col" className="px-2 py-2 text-start font-semibold">
              {s.remark}
            </th>
            <th scope="col" className="px-2 py-2 text-start font-semibold">
              {s.verdict}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200">
          {sheet.lines.map(({ subject, outcome }) => (
            <tr key={subject.id}>
              <th scope="row" className="px-2 py-2 text-start font-semibold text-charcoal-900">
                {ar ? subject.nameAr : subject.nameEn}
              </th>
              <td className="px-2 py-2 text-end tabular-nums">{value(outcome.ca)}</td>
              <td className="px-2 py-2 text-end tabular-nums">{value(outcome.exam)}</td>
              <td className="px-2 py-2 text-end font-semibold tabular-nums">
                {value(outcome.total)}
              </td>
              <td className="px-2 py-2 text-center font-semibold text-gold-700">
                {outcome.band?.grade ?? "—"}
              </td>
              <td className="px-2 py-2">
                {outcome.band ? (ar ? outcome.band.remarkAr : outcome.band.remarkEn) : "—"}
              </td>
              <td className="px-2 py-2">{verdict(outcome.passed)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [s.totalScore, sheet.summary.totalScore === null ? "—" : num(sheet.summary.totalScore)],
          [s.average, sheet.summary.average === null ? "—" : num(sheet.summary.average)],
          [s.overall, verdict(sheet.summary.passed)],
          [s.position, position],
        ].map(([label, content]) => (
          <div key={String(label)} className="rounded-md border border-stone-200 px-3 py-2">
            <dt className="text-xs text-stone-600">{label}</dt>
            <dd className="text-lg font-semibold text-brand-950 tabular-nums">{content}</dd>
          </div>
        ))}
      </dl>
      {!sheet.summary.complete && <p className="mt-3 text-sm text-warning-700">{s.incomplete}</p>}

      <footer className="mt-6 border-t border-stone-200 pt-3 text-xs text-stone-600">
        <p>
          {interpolate(s.policy, {
            ca: num(sheet.policy.caMax),
            exam: num(sheet.policy.examMax),
            pass: sheet.policy.passMark === null ? "—" : num(sheet.policy.passMark),
          })}
        </p>
        <p className="mt-1">
          <span className="font-semibold">{s.gradeKey}:</span>{" "}
          {sheet.policy.bands
            .slice()
            .sort((a, b) => b.minScore - a.minScore)
            .map(
              (b) =>
                `${b.grade} ${num(b.minScore)}–${num(b.maxScore)}${(ar ? b.remarkAr : b.remarkEn) ? ` ${ar ? b.remarkAr : b.remarkEn}` : ""}`,
            )
            .join(" · ")}
        </p>
      </footer>
    </article>
  );
}
