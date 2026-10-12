import { and, asc, eq, ne } from "drizzle-orm";
import type { PolicyRules } from "@/domain/results";
import {
  academicSessions,
  enrollments,
  gradeBands,
  gradingPolicies,
  levelSubjects,
  levels,
  students,
  subjects,
  termTypes,
  terms,
} from "@/db/schema";
import type { DbExecutor } from "@/db/types";
import { AdminRuleError } from "../admin/common";

/**
 * The academic scope of a results operation: a term (of a session), a level, optionally a
 * subject. Every results service resolves its scope here from IDs, so a browser can never
 * pair a level, subject or term that do not belong together:
 *
 * - the term must exist, must not be planned, and must not be the Legacy term (imported V1
 *   results are read-only) unless explicitly allowed;
 * - its session must be current or closed (results belong to sessions that have started);
 * - the subject must be in the level's active curriculum;
 * - the grading policy is the session's own, so maximums and grades never come from input.
 */
export type ResultScope = Awaited<ReturnType<typeof loadScope>>;

export async function loadPolicy(db: DbExecutor, policyId: string): Promise<PolicyRules> {
  const [policy] = await db.select().from(gradingPolicies).where(eq(gradingPolicies.id, policyId));
  if (!policy) throw new Error("Grading policy missing");
  const bands = await db
    .select({
      grade: gradeBands.grade,
      minScore: gradeBands.minScore,
      maxScore: gradeBands.maxScore,
      remarkEn: gradeBands.remarkEn,
      remarkAr: gradeBands.remarkAr,
    })
    .from(gradeBands)
    .where(eq(gradeBands.policyId, policy.id))
    .orderBy(asc(gradeBands.minScore));
  return { caMax: policy.caMax, examMax: policy.examMax, passMark: policy.passMark, bands };
}

/** The level's active curriculum in display order. */
export async function curriculumOf(db: DbExecutor, levelId: string) {
  return db
    .select({
      id: subjects.id,
      code: subjects.code,
      nameEn: subjects.nameEn,
      nameAr: subjects.nameAr,
      displayOrder: levelSubjects.displayOrder,
    })
    .from(levelSubjects)
    .innerJoin(subjects, eq(subjects.id, levelSubjects.subjectId))
    .where(and(eq(levelSubjects.levelId, levelId), eq(levelSubjects.isActive, true)))
    .orderBy(asc(levelSubjects.displayOrder));
}

export async function loadScope(
  db: DbExecutor,
  input: { termId: string; levelId: string; subjectId?: string | null },
  { allowLegacy = false } = {},
) {
  const [term] = await db
    .select({
      id: terms.id,
      status: terms.status,
      code: terms.termTypeCode,
      nameEn: termTypes.nameEn,
      nameAr: termTypes.nameAr,
      isLegacy: termTypes.isLegacy,
      sessionId: academicSessions.id,
      sessionLabel: academicSessions.label,
      sessionStatus: academicSessions.status,
      policyId: academicSessions.gradingPolicyId,
    })
    .from(terms)
    .innerJoin(termTypes, eq(termTypes.code, terms.termTypeCode))
    .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
    .where(eq(terms.id, input.termId));
  if (!term) throw new AdminRuleError("not_found");
  if (term.isLegacy && !allowLegacy) throw new AdminRuleError("legacy_term");
  if (!term.isLegacy && term.status === "planned") throw new AdminRuleError("term_not_open");
  if (term.sessionStatus !== "active" && term.sessionStatus !== "closed")
    throw new AdminRuleError("term_not_open");

  const [level] = await db.select().from(levels).where(eq(levels.id, input.levelId));
  if (!level) throw new AdminRuleError("not_found");
  const curriculum = await curriculumOf(db, level.id);
  let subject: (typeof curriculum)[number] | null = null;
  if (input.subjectId) {
    subject = curriculum.find((s) => s.id === input.subjectId) ?? null;
    if (!subject) throw new AdminRuleError("subject_not_in_level");
  }
  const policy = await loadPolicy(db, term.policyId);
  return { term, level, subject, curriculum, policy };
}

/**
 * The class for results: enrollments of the term's session at this level. Withdrawn
 * enrollments are excluded from entry; their existing sheets stay in history.
 */
export async function classEnrollments(
  db: DbExecutor,
  scope: { term: { sessionId: string }; level: { id: string } },
  { includeWithdrawn = false } = {},
) {
  return db
    .select({
      enrollmentId: enrollments.id,
      enrollmentStatus: enrollments.status,
      studentId: students.id,
      publicId: students.publicId,
      fullName: students.fullName,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(
      and(
        eq(enrollments.sessionId, scope.term.sessionId),
        eq(enrollments.levelId, scope.level.id),
        includeWithdrawn ? undefined : ne(enrollments.status, "withdrawn"),
      ),
    )
    .orderBy(asc(students.fullName), asc(students.publicId));
}
