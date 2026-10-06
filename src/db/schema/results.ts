import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, timestamptz, updatedAt } from "./_shared";
import { academicSessions, levels, subjects, terms } from "./academic";
import { recordSource, termResultStatus } from "./enums";
import { staffUsers } from "./staff";
import { enrollments } from "./students";

/**
 * One student's result sheet for one term (Student → Enrollment → Session → Term).
 * Composite foreign keys guarantee the enrollment and the term belong to the same session.
 */
export const termResults = pgTable(
  "term_results",
  {
    id: uuid().primaryKey().defaultRandom(),
    enrollmentId: uuid().notNull(),
    sessionId: uuid()
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    termId: uuid().notNull(),
    status: termResultStatus().notNull().default("draft"),
    source: recordSource().notNull().default("v2"),
    finalizedAt: timestamptz(),
    finalizedById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("term_results_enrollment_term_unique").on(t.enrollmentId, t.termId),
    index("term_results_term_idx").on(t.termId),
    foreignKey({
      name: "term_results_enrollment_session_fk",
      columns: [t.enrollmentId, t.sessionId],
      foreignColumns: [enrollments.id, enrollments.sessionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "term_results_term_session_fk",
      columns: [t.termId, t.sessionId],
      foreignColumns: [terms.id, terms.sessionId],
    }).onDelete("restrict"),
    check(
      "term_results_finalized_consistent",
      sql`(status = 'finalized') = (finalized_at IS NOT NULL)`,
    ),
  ],
);

/**
 * Current CA and exam scores for one subject on a result sheet.
 * - Blank stays blank: NULL means "not yet entered", never 0.
 * - `total` is computed by the database and is NULL until both parts are present.
 * - Maximums come from the session's grading policy (enforced by trigger).
 * - Every insert and change is copied to `result_score_revisions` (trigger), so history
 *   is never lost; rows cannot be deleted.
 */
export const resultScores = pgTable(
  "result_scores",
  {
    id: uuid().primaryKey().defaultRandom(),
    termResultId: uuid()
      .notNull()
      .references(() => termResults.id, { onDelete: "restrict" }),
    subjectId: uuid()
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    ca: smallint(),
    exam: smallint(),
    total: smallint().generatedAlwaysAs(
      sql`CASE WHEN ca IS NOT NULL AND exam IS NOT NULL THEN ca + exam END`,
    ),
    source: recordSource().notNull().default("v2"),
    enteredById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("result_scores_sheet_subject_unique").on(t.termResultId, t.subjectId),
    index("result_scores_subject_idx").on(t.subjectId),
    check("result_scores_ca_range", sql`ca IS NULL OR ca BETWEEN 0 AND 100`),
    check("result_scores_exam_range", sql`exam IS NULL OR exam BETWEEN 0 AND 100`),
  ],
);

/** Append-only history of every score write (filled by trigger; immutable). */
export const resultScoreRevisions = pgTable(
  "result_score_revisions",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    resultScoreId: uuid()
      .notNull()
      .references(() => resultScores.id, { onDelete: "restrict" }),
    caBefore: smallint(),
    examBefore: smallint(),
    caAfter: smallint(),
    examAfter: smallint(),
    /** Staff member from the transaction's `app.actor_id` setting (see src/db/actor.ts). */
    changedById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    reason: text(),
    changedAt: createdAt(),
  },
  (t) => [index("result_score_revisions_score_idx").on(t.resultScoreId, t.changedAt)],
);

/**
 * Result publication for a term. A row with `level_id` NULL is the school-wide switch;
 * rows with a level are per-class switches. Results for a level are visible only when
 * both the school-wide and the level switch for that term are published (enforced on the
 * server when results are read).
 */
export const resultPublications = pgTable(
  "result_publications",
  {
    id: uuid().primaryKey().defaultRandom(),
    termId: uuid()
      .notNull()
      .references(() => terms.id, { onDelete: "restrict" }),
    levelId: uuid().references(() => levels.id, { onDelete: "restrict" }),
    isPublished: boolean().notNull().default(false),
    publishedAt: timestamptz(),
    changedById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("result_publications_term_level_unique").on(t.termId, t.levelId).nullsNotDistinct(),
    check("result_publications_published_at", sql`NOT is_published OR published_at IS NOT NULL`),
  ],
);
