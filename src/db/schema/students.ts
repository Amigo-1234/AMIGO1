import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { STUDENT_ID_SQL_PATTERN } from "@/domain/student-id";
import { createdAt, timestamptz, updatedAt } from "./_shared";
import { academicSessions, levels } from "./academic";
import { enrollmentStatus, gender, recordSource, studentStatus } from "./enums";
import { staffUsers } from "./staff";

const idFormat = (column: string) =>
  sql.raw(`source = 'v1_import' OR ${column} ~ '${STUDENT_ID_SQL_PATTERN}'`);

/**
 * A student's permanent identity. The internal `id` (UUID) is the true key; `public_id`
 * is the Markaz ID shown to people. It never changes (database trigger) and must be a
 * primary entry in `student_identifiers` (deferred composite foreign key, see migrations).
 * Level, class and session live on enrollments, never on the student.
 */
export const students = pgTable(
  "students",
  {
    id: uuid().primaryKey().defaultRandom(),
    publicId: text().notNull().unique(),
    fullName: text().notNull(),
    status: studentStatus().notNull().default("active"),
    gender: gender(),
    dateOfBirth: date(),
    phone: text(),
    address: text(),
    notes: text(),
    admittedOn: date(),
    source: recordSource().notNull().default("v2"),
    createdById: uuid().references((): AnyPgColumn => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamptz(),
  },
  (t) => [
    check("students_full_name_present", sql`length(btrim(full_name)) > 0`),
    // V2-issued IDs must match the official format; imported V1 IDs are preserved as-is.
    check("students_public_id_format", idFormat("public_id")),
    index("students_status_idx").on(t.status),
    index("students_full_name_idx").on(sql`lower(full_name)`),
  ],
);

/**
 * Registry of every student ID ever issued or imported: each student's primary (public)
 * ID and any earlier V1 IDs kept as aliases. Rows are never updated or deleted
 * (database triggers), and `value` is the primary key, so an ID can never be assigned to
 * anyone else.
 */
export const studentIdentifiers = pgTable(
  "student_identifiers",
  {
    value: text().primaryKey(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    isPrimary: boolean().notNull(),
    source: recordSource().notNull(),
    /** Parsed parts, when the value follows the official format. Used for allocation. */
    levelCode: text(),
    year: integer(),
    serial: integer(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("student_identifiers_value_student_unique").on(t.value, t.studentId),
    uniqueIndex("student_identifiers_one_primary")
      .on(t.studentId)
      .where(sql`is_primary`),
    index("student_identifiers_student_idx").on(t.studentId),
    index("student_identifiers_allocation_idx").on(t.levelCode, t.year, t.serial),
    check("student_identifiers_format", idFormat("value")),
    check(
      "student_identifiers_parts",
      sql`(level_code IS NULL AND year IS NULL AND serial IS NULL)
        OR (level_code IS NOT NULL AND year IS NOT NULL AND serial > 0)`,
    ),
  ],
);

/**
 * High-water mark per level code and year, so serials only ever increase.
 * Allocation (src/db/student-ids.ts) also checks the registry, so the counter can never
 * fall behind imported IDs.
 */
export const studentIdCounters = pgTable(
  "student_id_counters",
  {
    levelCode: text().notNull(),
    year: integer().notNull(),
    lastSerial: integer().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.levelCode, t.year] }),
    check("student_id_counters_serial", sql`last_serial >= 0`),
  ],
);

/** Optional parent / guardian contacts (none are required to register a student). */
export const guardians = pgTable("guardians", {
  id: uuid().primaryKey().defaultRandom(),
  fullName: text().notNull(),
  phone: text(),
  email: text(),
  address: text(),
  notes: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const studentGuardians = pgTable(
  "student_guardians",
  {
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    guardianId: uuid()
      .notNull()
      .references(() => guardians.id, { onDelete: "restrict" }),
    relationship: text(),
    isPrimaryContact: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.guardianId] }),
    index("student_guardians_guardian_idx").on(t.guardianId),
  ],
);

/**
 * A student's place in one academic session: which level, and how it ended.
 * One enrollment per student per session; at most one active enrollment per student.
 */
export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid().primaryKey().defaultRandom(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    sessionId: uuid()
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    levelId: uuid()
      .notNull()
      .references(() => levels.id, { onDelete: "restrict" }),
    status: enrollmentStatus().notNull().default("active"),
    enrolledOn: date(),
    endedOn: date(),
    source: recordSource().notNull().default("v2"),
    /** For imported history: the V1 ID the student held during this enrollment. */
    legacyStudentId: text(),
    createdById: uuid().references((): AnyPgColumn => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("enrollments_student_session_unique").on(t.studentId, t.sessionId),
    unique("enrollments_id_session_unique").on(t.id, t.sessionId),
    uniqueIndex("enrollments_single_active")
      .on(t.studentId)
      .where(sql`status = 'active'`),
    index("enrollments_class_list_idx").on(t.sessionId, t.levelId, t.status),
    // The legacy ID must be one of this student's registered identifiers.
    foreignKey({
      name: "enrollments_legacy_student_id_fk",
      columns: [t.legacyStudentId, t.studentId],
      foreignColumns: [studentIdentifiers.value, studentIdentifiers.studentId],
    }).onDelete("restrict"),
    check(
      "enrollments_dates",
      sql`ended_on IS NULL OR enrolled_on IS NULL OR ended_on >= enrolled_on`,
    ),
    check(
      "enrollments_legacy_only_imported",
      sql`legacy_student_id IS NULL OR source = 'v1_import'`,
    ),
  ],
);
