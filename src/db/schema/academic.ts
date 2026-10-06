import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, timestamptz, updatedAt } from "./_shared";
import { recordSource, sessionStatus, termStatus } from "./enums";
import { staffUsers } from "./staff";

/** Levels (classes) students progress through. Configurable by administrators. */
export const levels = pgTable(
  "levels",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    nameEn: text().notNull(),
    nameAr: text().notNull(),
    stageEn: text(),
    stageAr: text(),
    sortOrder: smallint().notNull().unique(),
    /** Level students are promoted into; null means students graduate from this level. */
    nextLevelId: uuid().references((): AnyPgColumn => levels.id, { onDelete: "restrict" }),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    check("levels_code_format", sql`code ~ '^[A-Z]{2,5}$'`),
    check("levels_not_own_next", sql`next_level_id IS DISTINCT FROM id`),
  ],
);

/** Subjects. `code` is a stable identifier and is never reused. */
export const subjects = pgTable(
  "subjects",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    nameEn: text().notNull(),
    nameAr: text().notNull(),
    isActive: boolean().notNull().default(true),
    source: recordSource().notNull().default("v2"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [check("subjects_code_format", sql`code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'`)],
);

/** Which subjects a level takes, and their curriculum (display) order. */
export const levelSubjects = pgTable(
  "level_subjects",
  {
    id: uuid().primaryKey().defaultRandom(),
    levelId: uuid()
      .notNull()
      .references(() => levels.id, { onDelete: "restrict" }),
    subjectId: uuid()
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    displayOrder: smallint().notNull(),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("level_subjects_level_subject_unique").on(t.levelId, t.subjectId),
    index("level_subjects_level_order_idx").on(t.levelId, t.displayOrder),
    check("level_subjects_order_positive", sql`display_order > 0`),
  ],
);

/** Grading policies. A session points at one; bands are locked once the policy is in use. */
export const gradingPolicies = pgTable(
  "grading_policies",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull().unique(),
    caMax: smallint().notNull().default(40),
    examMax: smallint().notNull().default(60),
    isDefault: boolean().notNull().default(false),
    /** Once set, maxima and bands can no longer change (database trigger). */
    lockedAt: timestamptz(),
    createdById: uuid().references((): AnyPgColumn => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("grading_policies_maxima", sql`ca_max > 0 AND exam_max > 0 AND ca_max + exam_max = 100`),
    uniqueIndex("grading_policies_single_default")
      .on(t.isDefault)
      .where(sql`is_default`),
  ],
);

export const gradeBands = pgTable(
  "grade_bands",
  {
    id: uuid().primaryKey().defaultRandom(),
    policyId: uuid()
      .notNull()
      .references(() => gradingPolicies.id, { onDelete: "restrict" }),
    grade: text().notNull(),
    minScore: smallint().notNull(),
    maxScore: smallint().notNull(),
    remarkEn: text(),
    remarkAr: text(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("grade_bands_policy_grade_unique").on(t.policyId, t.grade),
    check("grade_bands_grade_format", sql`grade ~ '^[A-Z][+-]?$'`),
    check("grade_bands_range", sql`min_score >= 0 AND min_score <= max_score AND max_score <= 100`),
  ],
);

/** Academic sessions, e.g. 2025/2026. The label is derived from the start year. */
export const academicSessions = pgTable(
  "academic_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    startYear: integer().notNull().unique(),
    label: text()
      .notNull()
      .generatedAlwaysAs(sql`start_year::text || '/' || (start_year + 1)::text`),
    status: sessionStatus().notNull().default("planned"),
    startsOn: date(),
    endsOn: date(),
    gradingPolicyId: uuid()
      .notNull()
      .references(() => gradingPolicies.id, { onDelete: "restrict" }),
    activatedAt: timestamptz(),
    closedAt: timestamptz(),
    createdById: uuid().references((): AnyPgColumn => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("academic_sessions_year_range", sql`start_year BETWEEN 2000 AND 2200`),
    check(
      "academic_sessions_dates",
      sql`ends_on IS NULL OR starts_on IS NULL OR ends_on > starts_on`,
    ),
    // At most one active (current) session.
    uniqueIndex("academic_sessions_single_active")
      .on(t.status)
      .where(sql`status = 'active'`),
  ],
);

/** Kinds of term: First, Second, Third, and Legacy (V1 results with no recorded term). */
export const termTypes = pgTable(
  "term_types",
  {
    code: text().primaryKey(),
    nameEn: text().notNull(),
    nameAr: text().notNull(),
    sequence: smallint().notNull().unique(),
    isLegacy: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  () => [check("term_types_code_format", sql`code ~ '^[a-z_]+$'`)],
);

export const terms = pgTable(
  "terms",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    termTypeCode: text()
      .notNull()
      .references(() => termTypes.code, { onDelete: "restrict" }),
    status: termStatus().notNull().default("planned"),
    startsOn: date(),
    endsOn: date(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("terms_session_type_unique").on(t.sessionId, t.termTypeCode),
    // Lets other tables prove a term belongs to a given session (composite foreign keys).
    unique("terms_id_session_unique").on(t.id, t.sessionId),
    check("terms_dates", sql`ends_on IS NULL OR starts_on IS NULL OR ends_on > starts_on`),
    // At most one active (current) term.
    uniqueIndex("terms_single_active")
      .on(t.status)
      .where(sql`status = 'active'`),
  ],
);
