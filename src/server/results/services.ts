import { and, eq, inArray, sql } from "drizzle-orm";
import { scoreWithin, summarizeSheet } from "@/domain/results";
import {
  academicSessions,
  resultPublications,
  resultScores,
  termResults,
  termTypes,
  terms,
} from "@/db/schema";
import type { DbExecutor } from "@/db/types";
import { recordAudit } from "../audit";
import type { StaffAccess } from "../staff-auth/access";
import { hasPermission } from "../staff-auth/access";
import {
  AdminRuleError,
  inStaffTransaction,
  requirePermissions,
  staffActor,
} from "../admin/common";
import { classEnrollments, loadScope } from "./scope";

/**
 * Result services. Each one checks its permission (again, after the Server Action),
 * resolves the scope from IDs on the server, validates against the session's grading
 * policy, runs in one transaction attributed to the staff member and audits the change.
 * The database adds its own guarantees: maximums from the policy, finalized sheets locked,
 * one sheet per enrollment and term, one score per sheet and subject, and an append-only
 * revision for every score write (with actor and reason).
 */

export type ScoreRowInput = {
  enrollmentId: string;
  ca: number | null;
  exam: number | null;
  /** The score's version when the roster was loaded (null: no score existed). */
  version: string | null;
};

export type ScoreRowProblem = {
  enrollmentId: string;
  field: "ca" | "exam" | "row";
  code: "score_out_of_range" | "enrollment_not_in_class" | "sheet_finalized" | "score_conflict";
};

/** Refusal listing the rows that need attention. Nothing was saved. */
export class ScoreRowsError extends AdminRuleError {
  constructor(
    code: "score_out_of_range" | "enrollment_not_in_class" | "sheet_finalized" | "score_conflict",
    readonly problems: ScoreRowProblem[],
  ) {
    super(code);
  }
}

/** A score's version: its update time at full database precision. */
const versionOf = sql<string>`${resultScores.updatedAt}::text`;

/** Both switches for a term and level are on (what students need to see results). */
export async function isLevelPublished(db: DbExecutor, termId: string, levelId: string) {
  const rows = await db
    .select({ levelId: resultPublications.levelId, isPublished: resultPublications.isPublished })
    .from(resultPublications)
    .where(eq(resultPublications.termId, termId));
  const school = rows.find((r) => r.levelId === null)?.isPublished ?? false;
  const level = rows.find((r) => r.levelId === levelId)?.isPublished ?? false;
  return school && level;
}

/**
 * Save one subject's scores for a class (roster entry). All-or-nothing: if any row is out
 * of range, outside the class, on a finalized sheet, or was changed by someone else since
 * the roster was loaded (optimistic version check), nothing is saved and the rows are named.
 */
export async function saveSubjectScores(
  db: DbExecutor,
  actor: StaffAccess,
  input: {
    termId: string;
    levelId: string;
    subjectId: string;
    rows: ScoreRowInput[];
    reason?: string | null;
  },
): Promise<{ saved: number; versions: Record<string, string> }> {
  requirePermissions(actor, "results.enter");
  if (!input.rows.length) throw new AdminRuleError("nothing_to_save");
  if (
    input.rows.length > 300 ||
    new Set(input.rows.map((r) => r.enrollmentId)).size !== input.rows.length
  )
    throw new AdminRuleError("nothing_to_save");

  return inStaffTransaction(
    db,
    actor,
    async (tx) => {
      const scope = await loadScope(tx, input);
      const policy = scope.policy;

      const range: ScoreRowProblem[] = [];
      for (const row of input.rows) {
        if (!scoreWithin(row.ca, policy.caMax))
          range.push({ enrollmentId: row.enrollmentId, field: "ca", code: "score_out_of_range" });
        if (!scoreWithin(row.exam, policy.examMax))
          range.push({ enrollmentId: row.enrollmentId, field: "exam", code: "score_out_of_range" });
      }
      if (range.length) throw new ScoreRowsError("score_out_of_range", range);

      const roster = new Map((await classEnrollments(tx, scope)).map((e) => [e.enrollmentId, e]));
      const outside = input.rows.filter((r) => !roster.has(r.enrollmentId));
      if (outside.length)
        throw new ScoreRowsError(
          "enrollment_not_in_class",
          outside.map((r) => ({
            enrollmentId: r.enrollmentId,
            field: "row",
            code: "enrollment_not_in_class",
          })),
        );

      // One sheet per enrollment and term; created on first use, then locked for this save.
      const ids = input.rows.map((r) => r.enrollmentId);
      await tx
        .insert(termResults)
        .values(
          ids.map((enrollmentId) => ({
            enrollmentId,
            sessionId: scope.term.sessionId,
            termId: scope.term.id,
          })),
        )
        .onConflictDoNothing({ target: [termResults.enrollmentId, termResults.termId] });
      const sheets = await tx
        .select({
          id: termResults.id,
          enrollmentId: termResults.enrollmentId,
          status: termResults.status,
        })
        .from(termResults)
        .where(and(eq(termResults.termId, scope.term.id), inArray(termResults.enrollmentId, ids)))
        .for("update");
      const sheetOf = new Map(sheets.map((s) => [s.enrollmentId, s]));

      const existing = await tx
        .select({
          id: resultScores.id,
          termResultId: resultScores.termResultId,
          ca: resultScores.ca,
          exam: resultScores.exam,
          version: versionOf,
        })
        .from(resultScores)
        .where(
          and(
            eq(resultScores.subjectId, scope.subject!.id),
            inArray(
              resultScores.termResultId,
              sheets.map((s) => s.id),
            ),
          ),
        )
        .for("update");
      const scoreOf = new Map(existing.map((s) => [s.termResultId, s]));

      const finalized: ScoreRowProblem[] = [];
      const conflicts: ScoreRowProblem[] = [];
      const changes: {
        row: ScoreRowInput;
        sheetId: string;
        current?: (typeof existing)[number];
      }[] = [];
      for (const row of input.rows) {
        const sheet = sheetOf.get(row.enrollmentId)!;
        const current = scoreOf.get(sheet.id);
        if ((current?.version ?? null) !== row.version) {
          conflicts.push({ enrollmentId: row.enrollmentId, field: "row", code: "score_conflict" });
          continue;
        }
        const unchanged = (current?.ca ?? null) === row.ca && (current?.exam ?? null) === row.exam;
        if (unchanged) continue;
        if (sheet.status === "finalized") {
          finalized.push({ enrollmentId: row.enrollmentId, field: "row", code: "sheet_finalized" });
          continue;
        }
        changes.push({ row, sheetId: sheet.id, current });
      }
      if (conflicts.length) throw new ScoreRowsError("score_conflict", conflicts);
      if (finalized.length) throw new ScoreRowsError("sheet_finalized", finalized);

      for (const { row, sheetId, current } of changes) {
        if (current) {
          await tx
            .update(resultScores)
            .set({ ca: row.ca, exam: row.exam, enteredById: actor.staffId })
            .where(eq(resultScores.id, current.id));
        } else {
          await tx.insert(resultScores).values({
            termResultId: sheetId,
            subjectId: scope.subject!.id,
            ca: row.ca,
            exam: row.exam,
            enteredById: actor.staffId,
          });
        }
      }

      if (changes.length) {
        await recordAudit(tx, {
          actor: staffActor(actor),
          action: "result.scores_saved",
          targetType: "term",
          targetId: scope.term.id,
          metadata: {
            session: scope.term.sessionLabel,
            term: scope.term.code,
            level: scope.level.code,
            subject: scope.subject!.code,
            reason: input.reason ?? null,
            changes: changes.map(({ row, current }) => ({
              student: roster.get(row.enrollmentId)!.publicId,
              ca: [current?.ca ?? null, row.ca],
              exam: [current?.exam ?? null, row.exam],
            })),
          },
        });
      }

      // New versions for the saved roster, so the next save is checked against them.
      const after = await tx
        .select({ termResultId: resultScores.termResultId, version: versionOf })
        .from(resultScores)
        .where(
          and(
            eq(resultScores.subjectId, scope.subject!.id),
            inArray(
              resultScores.termResultId,
              sheets.map((s) => s.id),
            ),
          ),
        );
      const enrollmentOfSheet = new Map(sheets.map((s) => [s.id, s.enrollmentId]));
      return {
        saved: changes.length,
        versions: Object.fromEntries(
          after.map((a) => [enrollmentOfSheet.get(a.termResultId)!, a.version]),
        ),
      };
    },
    input.reason,
  );
}

/**
 * Mark a class's sheets as finalized (review done). Sheets with no scores are left alone.
 * Incomplete sheets are finalized only when `includeIncomplete` is confirmed; their blanks
 * stay "not entered". Finalized sheets are locked by the database until reopened.
 */
export async function finalizeClass(
  db: DbExecutor,
  actor: StaffAccess,
  input: { termId: string; levelId: string; includeIncomplete: boolean },
): Promise<{ finalized: number; skippedIncomplete: number }> {
  requirePermissions(actor, "results.enter");
  return inStaffTransaction(db, actor, async (tx) => {
    const scope = await loadScope(tx, input);
    const roster = await classEnrollments(tx, scope);
    if (!roster.length) return { finalized: 0, skippedIncomplete: 0 };
    const sheets = await tx
      .select({ id: termResults.id, enrollmentId: termResults.enrollmentId })
      .from(termResults)
      .where(
        and(
          eq(termResults.termId, scope.term.id),
          eq(termResults.status, "draft"),
          inArray(
            termResults.enrollmentId,
            roster.map((r) => r.enrollmentId),
          ),
        ),
      )
      .for("update");
    if (!sheets.length) return { finalized: 0, skippedIncomplete: 0 };
    const scores = await tx
      .select({
        termResultId: resultScores.termResultId,
        subjectId: resultScores.subjectId,
        ca: resultScores.ca,
        exam: resultScores.exam,
      })
      .from(resultScores)
      .where(
        inArray(
          resultScores.termResultId,
          sheets.map((s) => s.id),
        ),
      );

    const toFinalize: string[] = [];
    let skippedIncomplete = 0;
    let incompleteIncluded = 0;
    for (const sheet of sheets) {
      const own = scores.filter((s) => s.termResultId === sheet.id);
      const summary = summarizeSheet(
        scope.curriculum.map((subject) => own.find((s) => s.subjectId === subject.id)),
        scope.policy,
      );
      if (summary.startedSubjects === 0) continue;
      if (!summary.complete) {
        if (!input.includeIncomplete) {
          skippedIncomplete++;
          continue;
        }
        incompleteIncluded++;
      }
      toFinalize.push(sheet.id);
    }
    if (toFinalize.length) {
      await tx
        .update(termResults)
        .set({ status: "finalized", finalizedAt: new Date(), finalizedById: actor.staffId })
        .where(inArray(termResults.id, toFinalize));
      await recordAudit(tx, {
        actor: staffActor(actor),
        action: "result.sheets_finalized",
        targetType: "term",
        targetId: scope.term.id,
        metadata: {
          session: scope.term.sessionLabel,
          term: scope.term.code,
          level: scope.level.code,
          finalized: toFinalize.length,
          incompleteIncluded,
        },
      });
    }
    return { finalized: toFinalize.length, skippedIncomplete };
  });
}

/**
 * Reopen one student's finalized sheet for correction (reason required). While reopened
 * the sheet is hidden from the student. In a published class this is a correction to a
 * published result, so it also needs results.publish.
 */
export async function reopenSheet(
  db: DbExecutor,
  actor: StaffAccess,
  input: { termId: string; levelId: string; enrollmentId: string; reason: string },
): Promise<void> {
  requirePermissions(actor, "results.enter");
  if (input.reason.trim().length < 3) throw new AdminRuleError("reason_required");
  await inStaffTransaction(
    db,
    actor,
    async (tx) => {
      const scope = await loadScope(tx, input);
      const member = (await classEnrollments(tx, scope, { includeWithdrawn: true })).find(
        (e) => e.enrollmentId === input.enrollmentId,
      );
      if (!member) throw new AdminRuleError("enrollment_not_in_class");
      const published = await isLevelPublished(tx, scope.term.id, scope.level.id);
      if (published) requirePermissions(actor, "results.publish");
      const [sheet] = await tx
        .update(termResults)
        .set({ status: "draft", finalizedAt: null, finalizedById: null })
        .where(
          and(
            eq(termResults.termId, scope.term.id),
            eq(termResults.enrollmentId, input.enrollmentId),
            eq(termResults.status, "finalized"),
          ),
        )
        .returning({ id: termResults.id });
      if (!sheet) throw new AdminRuleError("sheet_not_finalized");
      await recordAudit(tx, {
        actor: staffActor(actor),
        action: "result.sheet_reopened",
        targetType: "student",
        targetId: member.studentId,
        metadata: {
          session: scope.term.sessionLabel,
          term: scope.term.code,
          level: scope.level.code,
          termResultId: sheet.id,
          publishedAtTheTime: published,
          reason: input.reason,
        },
      });
    },
    input.reason,
  );
}

export type Readiness = {
  enrolled: number;
  finalizedComplete: number;
  finalizedIncomplete: number;
  draft: number;
  noResults: number;
};

/** How ready a class is for publication (students see only finalized sheets). */
export async function classReadiness(
  db: DbExecutor,
  scope: Awaited<ReturnType<typeof loadScope>>,
): Promise<Readiness> {
  const roster = await classEnrollments(db, scope);
  const sheets = roster.length
    ? await db
        .select({
          id: termResults.id,
          enrollmentId: termResults.enrollmentId,
          status: termResults.status,
        })
        .from(termResults)
        .where(
          and(
            eq(termResults.termId, scope.term.id),
            inArray(
              termResults.enrollmentId,
              roster.map((r) => r.enrollmentId),
            ),
          ),
        )
    : [];
  const scores = sheets.length
    ? await db
        .select({
          termResultId: resultScores.termResultId,
          subjectId: resultScores.subjectId,
          ca: resultScores.ca,
          exam: resultScores.exam,
        })
        .from(resultScores)
        .where(
          inArray(
            resultScores.termResultId,
            sheets.map((s) => s.id),
          ),
        )
    : [];
  const readiness: Readiness = {
    enrolled: roster.length,
    finalizedComplete: 0,
    finalizedIncomplete: 0,
    draft: 0,
    noResults: 0,
  };
  for (const member of roster) {
    const sheet = sheets.find((s) => s.enrollmentId === member.enrollmentId);
    const own = sheet ? scores.filter((s) => s.termResultId === sheet.id) : [];
    if (!sheet || !own.some((s) => s.ca !== null || s.exam !== null)) readiness.noResults++;
    else if (sheet.status === "draft") readiness.draft++;
    else {
      const summary = summarizeSheet(
        scope.curriculum.map((subject) => own.find((s) => s.subjectId === subject.id)),
        scope.policy,
      );
      if (summary.complete) readiness.finalizedComplete++;
      else readiness.finalizedIncomplete++;
    }
  }
  return readiness;
}

export const isReady = (r: Readiness) => r.enrolled > 0 && r.finalizedComplete === r.enrolled;

/**
 * Turn a term's school-wide switch (levelId null) or a level's switch on or off. Students
 * see a level's results only when both are on, and only finalized sheets. Publishing a
 * level that is not fully complete and finalized needs `acknowledgeIncomplete` (an
 * explicit confirmation of the listed gaps). Unpublishing needs a reason.
 */
export async function setPublication(
  db: DbExecutor,
  actor: StaffAccess,
  input: {
    termId: string;
    levelId: string | null;
    publish: boolean;
    reason?: string | null;
    acknowledgeIncomplete?: boolean;
  },
): Promise<void> {
  requirePermissions(actor, "results.publish");
  if (!input.publish && (input.reason ?? "").trim().length < 3)
    throw new AdminRuleError("reason_required");
  await inStaffTransaction(
    db,
    actor,
    async (tx) => {
      // Publication also covers imported (Legacy term) results.
      const scope = input.levelId
        ? await loadScope(
            tx,
            { termId: input.termId, levelId: input.levelId },
            { allowLegacy: true },
          )
        : null;
      if (!scope) await loadTermOnly(tx, input.termId);
      let readiness: Readiness | null = null;
      if (scope && input.publish) {
        readiness = await classReadiness(tx, scope);
        if (!isReady(readiness) && !input.acknowledgeIncomplete)
          throw new AdminRuleError("publication_incomplete");
      }
      const now = new Date();
      await tx
        .insert(resultPublications)
        .values({
          termId: input.termId,
          levelId: input.levelId,
          isPublished: input.publish,
          publishedAt: input.publish ? now : null,
          changedById: actor.staffId,
        })
        .onConflictDoUpdate({
          target: [resultPublications.termId, resultPublications.levelId],
          set: {
            isPublished: input.publish,
            // Keeps the last publication time when unpublishing (allowed by the check).
            publishedAt: input.publish ? now : sql`${resultPublications.publishedAt}`,
            changedById: actor.staffId,
          },
        });
      await recordAudit(tx, {
        actor: staffActor(actor),
        action: input.publish ? "result.published" : "result.unpublished",
        targetType: "term",
        targetId: input.termId,
        metadata: {
          scope: scope ? "level" : "school",
          level: scope?.level.code ?? null,
          reason: input.reason ?? null,
          readiness,
          acknowledgedIncomplete: readiness ? !isReady(readiness) : false,
        },
      });
    },
    input.reason ?? null,
  );
}

/** Validate a term for the school-wide switch (any non-planned term, Legacy included). */
async function loadTermOnly(tx: DbExecutor, termId: string) {
  const [term] = await tx
    .select({
      status: terms.status,
      isLegacy: termTypes.isLegacy,
      sessionStatus: academicSessions.status,
    })
    .from(terms)
    .innerJoin(termTypes, eq(termTypes.code, terms.termTypeCode))
    .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
    .where(eq(terms.id, termId));
  if (!term) throw new AdminRuleError("not_found");
  if (!term.isLegacy && term.status === "planned") throw new AdminRuleError("term_not_open");
  if (term.sessionStatus !== "active" && term.sessionStatus !== "closed")
    throw new AdminRuleError("term_not_open");
}

export function canCorrectPublished(actor: StaffAccess): boolean {
  return hasPermission(actor, "results.enter") && hasPermission(actor, "results.publish");
}
