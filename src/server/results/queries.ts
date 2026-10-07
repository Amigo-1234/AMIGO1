import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  type SheetSummary,
  type SubjectOutcome,
  rankByTotal,
  subjectOutcome,
  summarizeSheet,
} from "@/domain/results";
import {
  academicSessions,
  enrollments,
  levels,
  resultPublications,
  resultScores,
  subjects,
  termResults,
  termTypes,
  terms,
} from "@/db/schema";
import type { DbExecutor } from "@/db/types";
import { classEnrollments, curriculumOf, loadPolicy, loadScope } from "./scope";
import { classReadiness } from "./services";

/**
 * Read models for results. Pages check `results.read` (staff) or the student session
 * (portal) before calling these. Every derived value (grade, remark, verdict, average,
 * position) is computed here on the server from the stored scores and the session's policy.
 */

const versionOf = sql<string>`${resultScores.updatedAt}::text`;

/** Terms that can hold results: started terms of current or closed sessions, newest first. */
export async function resultTerms(db: DbExecutor) {
  return db
    .select({
      id: terms.id,
      status: terms.status,
      code: terms.termTypeCode,
      nameEn: termTypes.nameEn,
      nameAr: termTypes.nameAr,
      isLegacy: termTypes.isLegacy,
      sequence: termTypes.sequence,
      sessionId: academicSessions.id,
      sessionLabel: academicSessions.label,
      sessionStatus: academicSessions.status,
    })
    .from(terms)
    .innerJoin(termTypes, eq(termTypes.code, terms.termTypeCode))
    .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
    .where(
      and(
        inArray(academicSessions.status, ["active", "closed"]),
        sql`(${termTypes.isLegacy} OR ${terms.status} <> 'planned')`,
      ),
    )
    .orderBy(desc(academicSessions.startYear), desc(termTypes.sequence));
}

export async function publicationState(db: DbExecutor, termId: string) {
  const rows = await db
    .select({
      levelId: resultPublications.levelId,
      isPublished: resultPublications.isPublished,
      publishedAt: resultPublications.publishedAt,
    })
    .from(resultPublications)
    .where(eq(resultPublications.termId, termId));
  return {
    school: rows.find((r) => r.levelId === null) ?? null,
    levels: new Map(rows.filter((r) => r.levelId).map((r) => [r.levelId!, r])),
  };
}

/** One term across all levels: readiness and publication switches. */
export async function termOverview(db: DbExecutor, termId: string) {
  const all = await levelsWithCurriculum(db);
  const first = all[0];
  if (!first) return null;
  const base = await loadScope(db, { termId, levelId: first.id }, { allowLegacy: true });
  const publication = await publicationState(db, termId);
  const rows = [];
  for (const level of all) {
    const scope = { ...base, level, curriculum: await curriculumOf(db, level.id), subject: null };
    rows.push({
      level,
      subjects: scope.curriculum.length,
      readiness: await classReadiness(db, scope),
      published: publication.levels.get(level.id)?.isPublished ?? false,
    });
  }
  return {
    term: base.term,
    schoolPublished: publication.school?.isPublished ?? false,
    levels: rows,
  };
}

async function levelsWithCurriculum(db: DbExecutor) {
  return db.select().from(levels).where(eq(levels.isActive, true)).orderBy(asc(levels.sortOrder));
}

type ScoreRow = { termResultId: string; subjectId: string; ca: number | null; exam: number | null };

export type StudentRow = {
  enrollmentId: string;
  studentId: string;
  publicId: string;
  fullName: string;
  sheetId: string | null;
  sheetStatus: "draft" | "finalized" | null;
  outcomes: SubjectOutcome[];
  summary: SheetSummary;
  position: number | null;
};

/**
 * The whole class for a term: every student × every subject of the level's curriculum,
 * with summaries and positions (complete, finalized sheets only; ties share, next skipped).
 */
export async function classResults(db: DbExecutor, termId: string, levelId: string) {
  const scope = await loadScope(db, { termId, levelId }, { allowLegacy: true });
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
  const scores: ScoreRow[] = sheets.length
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

  const students: StudentRow[] = roster.map((member) => {
    const sheet = sheets.find((s) => s.enrollmentId === member.enrollmentId) ?? null;
    const own = sheet ? scores.filter((s) => s.termResultId === sheet.id) : [];
    const perSubject = scope.curriculum.map((subject) =>
      own.find((s) => s.subjectId === subject.id),
    );
    return {
      ...member,
      sheetId: sheet?.id ?? null,
      sheetStatus: sheet?.status ?? null,
      outcomes: perSubject.map((s) => subjectOutcome(s, scope.policy)),
      summary: summarizeSheet(perSubject, scope.policy),
      position: null,
    };
  });
  const positions = rankByTotal(
    students.map((s) => ({
      key: s.enrollmentId,
      total: s.sheetStatus === "finalized" && s.summary.complete ? s.summary.totalScore : null,
    })),
  );
  for (const s of students) s.position = positions.get(s.enrollmentId) ?? null;
  const ranked = students.filter((s) => s.position !== null).length;

  const subjectProgress = scope.curriculum.map((subject, index) => ({
    ...subject,
    complete: students.filter((s) => s.outcomes[index].total !== null).length,
    started: students.filter(
      (s) => s.outcomes[index].ca !== null || s.outcomes[index].exam !== null,
    ).length,
  }));
  const publication = await publicationState(db, scope.term.id);
  return {
    scope,
    students,
    ranked,
    subjectProgress,
    readiness: await classReadiness(db, scope),
    schoolPublished: publication.school?.isPublished ?? false,
    levelPublished: publication.levels.get(scope.level.id)?.isPublished ?? false,
  };
}

/** Score-entry roster for one subject, with each score's version for conflict checks. */
export async function subjectRoster(
  db: DbExecutor,
  termId: string,
  levelId: string,
  subjectId: string,
) {
  const scope = await loadScope(db, { termId, levelId, subjectId });
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
          ca: resultScores.ca,
          exam: resultScores.exam,
          version: versionOf,
        })
        .from(resultScores)
        .where(
          and(
            eq(resultScores.subjectId, subjectId),
            inArray(
              resultScores.termResultId,
              sheets.map((s) => s.id),
            ),
          ),
        )
    : [];
  return {
    scope,
    rows: roster.map((member) => {
      const sheet = sheets.find((s) => s.enrollmentId === member.enrollmentId);
      const score = sheet ? scores.find((s) => s.termResultId === sheet.id) : undefined;
      return {
        ...member,
        sheetStatus: sheet?.status ?? null,
        ca: score?.ca ?? null,
        exam: score?.exam ?? null,
        version: score?.version ?? null,
      };
    }),
  };
}

export type StudentSheet = Awaited<ReturnType<typeof studentSheets>>[number];

/**
 * A student's result sheets, newest first, each in its historical context: the session,
 * term and the level of that enrollment (never the student's current level).
 *
 * `visibleToStudent` returns only what the student may see: finalized sheets in a class
 * whose school-wide and level switches are both published. Drafts never leave the server.
 */
export async function studentSheets(
  db: DbExecutor,
  studentId: string,
  { visibleToStudent }: { visibleToStudent: boolean },
) {
  const rows = await db
    .select({
      sheetId: termResults.id,
      status: termResults.status,
      finalizedAt: termResults.finalizedAt,
      termId: terms.id,
      termCode: terms.termTypeCode,
      termNameEn: termTypes.nameEn,
      termNameAr: termTypes.nameAr,
      termSequence: termTypes.sequence,
      sessionLabel: academicSessions.label,
      sessionStartYear: academicSessions.startYear,
      policyId: academicSessions.gradingPolicyId,
      enrollmentId: enrollments.id,
      levelId: levels.id,
      levelCode: levels.code,
      levelNameEn: levels.nameEn,
      levelNameAr: levels.nameAr,
    })
    .from(termResults)
    .innerJoin(enrollments, eq(enrollments.id, termResults.enrollmentId))
    .innerJoin(terms, eq(terms.id, termResults.termId))
    .innerJoin(termTypes, eq(termTypes.code, terms.termTypeCode))
    .innerJoin(academicSessions, eq(academicSessions.id, termResults.sessionId))
    .innerJoin(levels, eq(levels.id, enrollments.levelId))
    .where(
      and(
        eq(enrollments.studentId, studentId),
        visibleToStudent ? eq(termResults.status, "finalized") : undefined,
      ),
    )
    .orderBy(desc(academicSessions.startYear), desc(termTypes.sequence));

  const sheets = [];
  for (const row of rows) {
    const publication = await publicationState(db, row.termId);
    const published =
      (publication.school?.isPublished ?? false) &&
      (publication.levels.get(row.levelId)?.isPublished ?? false);
    if (visibleToStudent && !published) continue;

    const policy = await loadPolicy(db, row.policyId);
    const curriculum = await curriculumOf(db, row.levelId);
    const scores = await db
      .select({
        subjectId: resultScores.subjectId,
        ca: resultScores.ca,
        exam: resultScores.exam,
        code: subjects.code,
        nameEn: subjects.nameEn,
        nameAr: subjects.nameAr,
      })
      .from(resultScores)
      .innerJoin(subjects, eq(subjects.id, resultScores.subjectId))
      .where(eq(resultScores.termResultId, row.sheetId));
    // Curriculum order first; scores for subjects outside today's curriculum (e.g.
    // imported V1 subjects) follow, so no recorded score is ever hidden.
    const extra = scores.filter((s) => !curriculum.some((c) => c.id === s.subjectId));
    const lines = [
      ...curriculum.map((subject) => ({
        subject,
        outcome: subjectOutcome(
          scores.find((s) => s.subjectId === subject.id),
          policy,
        ),
      })),
      ...extra.map((s) => ({
        subject: {
          id: s.subjectId,
          code: s.code,
          nameEn: s.nameEn,
          nameAr: s.nameAr,
          displayOrder: 999,
        },
        outcome: subjectOutcome(s, policy),
      })),
    ];
    const summary = summarizeSheet(
      curriculum.map((subject) => scores.find((s) => s.subjectId === subject.id)),
      policy,
    );
    let position: number | null = null;
    let ranked = 0;
    if (row.status === "finalized" && summary.complete) {
      const cls = await classResults(db, row.termId, row.levelId);
      position = cls.students.find((s) => s.enrollmentId === row.enrollmentId)?.position ?? null;
      ranked = cls.ranked;
    }
    sheets.push({ ...row, published, policy, lines, summary, position, ranked });
  }
  return sheets;
}
