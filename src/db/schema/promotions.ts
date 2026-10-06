import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./_shared";
import { academicSessions, levels } from "./academic";
import { promotionOutcome } from "./enums";
import { staffUsers } from "./staff";
import { enrollments, students } from "./students";

/** A bulk promotion run (e.g. "all of Ibtidā'iyah, 2025/2026 → 2026/2027"). */
export const promotionBatches = pgTable("promotion_batches", {
  id: uuid().primaryKey().defaultRandom(),
  fromSessionId: uuid()
    .notNull()
    .references(() => academicSessions.id, { onDelete: "restrict" }),
  toSessionId: uuid().references(() => academicSessions.id, { onDelete: "restrict" }),
  levelId: uuid().references(() => levels.id, { onDelete: "restrict" }),
  note: text(),
  createdById: uuid()
    .notNull()
    .references(() => staffUsers.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
});

/**
 * The decision that closes one enrollment: promoted or repeated (with the new enrollment
 * it created in the next session) or graduated (no new enrollment). Each enrollment can be
 * decided only once; records are immutable.
 */
export const promotions = pgTable(
  "promotions",
  {
    id: uuid().primaryKey().defaultRandom(),
    batchId: uuid().references(() => promotionBatches.id, { onDelete: "restrict" }),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    fromEnrollmentId: uuid()
      .notNull()
      .unique()
      .references(() => enrollments.id, { onDelete: "restrict" }),
    toEnrollmentId: uuid()
      .unique()
      .references(() => enrollments.id, { onDelete: "restrict" }),
    outcome: promotionOutcome().notNull(),
    decidedById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "promotions_target_matches_outcome",
      sql`(outcome = 'graduated') = (to_enrollment_id IS NULL)`,
    ),
    index("promotions_student_idx").on(t.studentId),
    index("promotions_batch_idx").on(t.batchId),
  ],
);
