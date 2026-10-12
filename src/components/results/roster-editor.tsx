"use client";

import { type KeyboardEvent, useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { type PolicyBand, bandFor, parseScoreInput } from "@/domain/results";
import { cn } from "@/lib/cn";
import { type SaveScoresResult, saveScoresAction } from "@/server/results/actions";

export type RosterRow = {
  enrollmentId: string;
  fullName: string;
  publicId: string;
  sheetStatus: "draft" | "finalized" | null;
  ca: number | null;
  exam: number | null;
  version: string | null;
};

export type RosterStrings = {
  student: string;
  ca: string;
  exam: string;
  total: string;
  grade: string;
  locked: string;
  lockedNote: string;
  max: string;
  unsaved: string;
  allSaved: string;
  save: string;
  saving: string;
  savedCount: string;
  noChanges: string;
  reload: string;
  conflictNames: string;
  keyboard: string;
  reason: string;
  reasonHint: string;
  leaveWarning: string;
  errors: Record<string, string>;
};

type Cell = { ca: string; exam: string };
const text = (n: number | null) => (n === null ? "" : String(n));
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

/**
 * Roster score entry for one subject. The browser only previews totals and grades and
 * checks ranges for instant feedback; the server validates and saves (all-or-nothing) and
 * refuses rows someone else changed since this page loaded.
 */
export function RosterEditor({
  termId,
  levelId,
  subjectId,
  caMax,
  examMax,
  bands,
  rows,
  canEdit,
  strings,
}: {
  termId: string;
  levelId: string;
  subjectId: string;
  caMax: number;
  examMax: number;
  bands: PolicyBand[];
  rows: RosterRow[];
  canEdit: boolean;
  strings: RosterStrings;
}) {
  const initial = useMemo(
    () =>
      Object.fromEntries(rows.map((r) => [r.enrollmentId, { ca: text(r.ca), exam: text(r.exam) }])),
    [rows],
  );
  const [values, setValues] = useState<Record<string, Cell>>(initial);
  const [baseline, setBaseline] = useState<Record<string, Cell>>(initial);
  const [versions, setVersions] = useState<Record<string, string | null>>(
    Object.fromEntries(rows.map((r) => [r.enrollmentId, r.version])),
  );
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<SaveScoresResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nameOf = useMemo(() => new Map(rows.map((r) => [r.enrollmentId, r.fullName])), [rows]);
  const editable = (row: RosterRow) => canEdit && row.sheetStatus !== "finalized";
  const dirty = rows.filter(
    (r) =>
      editable(r) &&
      (values[r.enrollmentId].ca.trim() !== baseline[r.enrollmentId].ca ||
        values[r.enrollmentId].exam.trim() !== baseline[r.enrollmentId].exam),
  );

  // Warn before leaving with unsaved scores.
  useEffect(() => {
    if (!dirty.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = strings.leaveWarning;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty.length, strings.leaveWarning]);

  const problemFor = (enrollmentId: string, field: "ca" | "exam") => {
    const raw = values[enrollmentId][field];
    const parsed = parseScoreInput(raw);
    const max = field === "ca" ? caMax : examMax;
    if (parsed === "invalid" || (parsed !== null && parsed > max))
      return fill(strings.max, { max });
    // Field-level problems from the server; row-level ones (conflicts) mark the row instead.
    if (result && !result.ok)
      if (result.problems?.some((p) => p.enrollmentId === enrollmentId && p.field === field))
        return strings.errors[result.error] ?? strings.errors.server;
    return null;
  };
  const rowProblem = (enrollmentId: string) =>
    !!result &&
    !result.ok &&
    !!result.problems?.some((p) => p.enrollmentId === enrollmentId && p.field === "row");
  const hasLocalErrors = dirty.some(
    (r) => problemFor(r.enrollmentId, "ca") || problemFor(r.enrollmentId, "exam"),
  );

  function move(event: KeyboardEvent<HTMLInputElement>, row: number, field: "ca" | "exam") {
    const step =
      event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" || event.key === "Enter" ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = document.querySelector<HTMLInputElement>(
      `[data-row="${row + step}"][data-field="${field}"]`,
    );
    next?.focus();
    next?.select();
  }

  function save() {
    setMessage(null);
    if (!dirty.length) {
      setMessage(strings.noChanges);
      return;
    }
    const payload = dirty.map((r) => ({
      enrollmentId: r.enrollmentId,
      ca: values[r.enrollmentId].ca,
      exam: values[r.enrollmentId].exam,
      version: versions[r.enrollmentId],
    }));
    startTransition(async () => {
      const outcome = await saveScoresAction({ termId, levelId, subjectId, reason, rows: payload });
      setResult(outcome);
      if (outcome.ok) {
        const saved = Object.fromEntries(
          dirty.map((r) => [
            r.enrollmentId,
            { ca: values[r.enrollmentId].ca.trim(), exam: values[r.enrollmentId].exam.trim() },
          ]),
        );
        setBaseline((b) => ({ ...b, ...saved }));
        setValues((v) => ({ ...v, ...saved }));
        setVersions((v) => ({ ...v, ...outcome.versions }));
        setMessage(fill(strings.savedCount, { count: outcome.saved }));
      } else if (outcome.error === "signed_out") {
        window.location.reload();
      }
    });
  }

  const conflictNames =
    result && !result.ok && result.error === "score_conflict"
      ? (result.problems ?? [])
          .map((p) => nameOf.get(p.enrollmentId))
          .filter(Boolean)
          .join(", ")
      : null;

  return (
    <div>
      <p className="mb-3 text-sm text-stone-600">{strings.keyboard}</p>
      {result && !result.ok && (
        <Notice tone="danger" className="mb-4">
          {strings.errors[result.error] ?? strings.errors.server}
          {conflictNames && (
            <>
              {" "}
              {fill(strings.conflictNames, { names: conflictNames })}{" "}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => window.location.reload()}
              >
                {strings.reload}
              </button>
            </>
          )}
        </Notice>
      )}

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-sand-50 text-stone-600">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                {strings.student}
              </th>
              <th scope="col" className="w-20 px-1 py-2.5 text-center font-semibold sm:w-24">
                {strings.ca}
                <span dir="ltr" className="block text-xs font-normal">
                  /{caMax}
                </span>
              </th>
              <th scope="col" className="w-20 px-1 py-2.5 text-center font-semibold sm:w-24">
                {strings.exam}
                <span dir="ltr" className="block text-xs font-normal">
                  /{examMax}
                </span>
              </th>
              <th scope="col" className="w-16 px-2 py-2.5 text-end font-semibold">
                {strings.total}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {rows.map((row, index) => {
              const cell = values[row.enrollmentId];
              const ca = parseScoreInput(cell.ca);
              const exam = parseScoreInput(cell.exam);
              const total =
                typeof ca === "number" && typeof exam === "number" && ca <= caMax && exam <= examMax
                  ? ca + exam
                  : null;
              const grade = total === null ? null : bandFor(total, bands)?.grade;
              const changed =
                cell.ca.trim() !== baseline[row.enrollmentId].ca ||
                cell.exam.trim() !== baseline[row.enrollmentId].exam;
              const locked = row.sheetStatus === "finalized";
              return (
                <tr
                  key={row.enrollmentId}
                  className={cn(
                    rowProblem(row.enrollmentId)
                      ? "bg-danger-50"
                      : changed
                        ? "bg-warning-50"
                        : locked && "bg-stone-100/60",
                  )}
                >
                  <th scope="row" className="px-3 py-2 text-start font-normal">
                    <span className="user-text block font-semibold text-charcoal-900">
                      {row.fullName}
                    </span>
                    <span
                      dir="ltr"
                      className="block text-start text-xs text-stone-600 tabular-nums rtl:text-end"
                    >
                      {row.publicId}
                    </span>
                    {locked && (
                      <span className="text-xs font-semibold text-gold-700">{strings.locked}</span>
                    )}
                  </th>
                  {(["ca", "exam"] as const).map((field) => {
                    const problem = editable(row) ? problemFor(row.enrollmentId, field) : null;
                    const id = `score-${row.enrollmentId}-${field}`;
                    return (
                      <td key={field} className="px-1 py-2 align-top">
                        <input
                          id={id}
                          data-row={index}
                          data-field={field}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={3}
                          dir="ltr"
                          disabled={!editable(row)}
                          value={cell[field]}
                          aria-label={`${field === "ca" ? strings.ca : strings.exam} · ${row.fullName}`}
                          aria-invalid={problem ? true : undefined}
                          aria-describedby={problem ? `${id}-error` : undefined}
                          onKeyDown={(event) => move(event, index, field)}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) =>
                            setValues((v) => ({
                              ...v,
                              [row.enrollmentId]: {
                                ...v[row.enrollmentId],
                                [field]: event.target.value,
                              },
                            }))
                          }
                          className={cn(inputClasses, "min-h-11 px-1 text-center tabular-nums")}
                        />
                        {problem && (
                          <p
                            id={`${id}-error`}
                            className="mt-0.5 text-center text-xs font-medium text-danger-700"
                          >
                            {problem}
                          </p>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-end font-semibold tabular-nums">
                    <span className="inline-flex items-baseline gap-1">
                      {total ?? "—"}
                      {grade && <span className="text-gold-700">{grade}</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.some((r) => r.sheetStatus === "finalized") && (
        <p className="mt-2 text-sm text-stone-600">{strings.lockedNote}</p>
      )}

      {canEdit && (
        <div className="sticky bottom-0 z-10 mt-4 flex flex-col gap-3 border-t border-stone-200 bg-ivory/95 py-3 backdrop-blur-sm sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="score-reason" className="text-sm font-semibold text-charcoal-900">
              {strings.reason}
            </label>
            <input
              id="score-reason"
              type="text"
              dir="auto"
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby="score-reason-hint"
              className={inputClasses}
            />
            <p id="score-reason-hint" className="text-xs text-stone-600">
              {strings.reasonHint}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p
              role="status"
              aria-live="polite"
              className={cn("text-sm", dirty.length ? "text-warning-700" : "text-brand-800")}
            >
              {message ??
                (dirty.length ? fill(strings.unsaved, { count: dirty.length }) : strings.allSaved)}
            </p>
            <Button
              onClick={save}
              disabled={pending || hasLocalErrors}
              aria-disabled={pending || hasLocalErrors}
            >
              {pending ? strings.saving : strings.save}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
