import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, timestamptz, updatedAt } from "./_shared";
import { academicSessions, levels, terms } from "./academic";
import { ledgerStatus, paymentMethod, recordSource } from "./enums";
import { staffUsers } from "./staff";
import { enrollments } from "./students";

/*
 * Money is stored as whole kobo in BIGINT columns (₦1 = 100 kobo): exact integer
 * arithmetic, no floating point. Amounts are always positive; direction comes from the
 * table (charges owe, payments pay). Balances are computed, never stored:
 *   outstanding(enrollment) = Σ posted charges − Σ posted payments
 * Because charges and payments belong to an enrollment (one session), a previous year's
 * balance can only reach a new session through an explicit "arrears" charge.
 */

const voidConsistency = sql`(status = 'voided') = (voided_at IS NOT NULL AND void_reason IS NOT NULL)`;

/** The standard fee for a level in a session (optionally for one term). */
export const feeStructures = pgTable(
  "fee_structures",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    levelId: uuid()
      .notNull()
      .references(() => levels.id, { onDelete: "restrict" }),
    termId: uuid(),
    description: text().notNull(),
    amountKobo: bigint({ mode: "number" }).notNull(),
    isActive: boolean().notNull().default(true),
    createdById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("fee_structures_amount_positive", sql`amount_kobo > 0`),
    foreignKey({
      name: "fee_structures_term_session_fk",
      columns: [t.termId, t.sessionId],
      foreignColumns: [terms.id, terms.sessionId],
    }).onDelete("restrict"),
    // One active structure per session + level + term (whole-session when term is NULL).
    uniqueIndex("fee_structures_active_unique")
      .on(
        t.sessionId,
        t.levelId,
        sql`coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`is_active`),
  ],
);

/** What a student owes for an enrollment (debits). Never edited; voided if wrong. */
export const feeCharges = pgTable(
  "fee_charges",
  {
    id: uuid().primaryKey().defaultRandom(),
    enrollmentId: uuid().notNull(),
    sessionId: uuid()
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    termId: uuid(),
    feeStructureId: uuid().references(() => feeStructures.id, { onDelete: "restrict" }),
    description: text().notNull(),
    amountKobo: bigint({ mode: "number" }).notNull(),
    status: ledgerStatus().notNull().default("posted"),
    source: recordSource().notNull().default("v2"),
    voidedAt: timestamptz(),
    voidedById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    voidReason: text(),
    createdById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    check("fee_charges_amount_positive", sql`amount_kobo > 0`),
    check("fee_charges_void_consistent", voidConsistency),
    check("fee_charges_creator", sql`created_by_id IS NOT NULL OR source = 'v1_import'`),
    foreignKey({
      name: "fee_charges_enrollment_session_fk",
      columns: [t.enrollmentId, t.sessionId],
      foreignColumns: [enrollments.id, enrollments.sessionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "fee_charges_term_session_fk",
      columns: [t.termId, t.sessionId],
      foreignColumns: [terms.id, terms.sessionId],
    }).onDelete("restrict"),
    index("fee_charges_enrollment_idx").on(t.enrollmentId),
  ],
);

/**
 * Money received (credits). Append-only: a wrong payment is voided (with a reason) and a
 * corrected one recorded with `replaces_payment_id`. Each V2 payment has a unique receipt
 * number. V1 imports carry the single "amount paid" figure V1 kept, without a date.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    receiptNumber: text().unique(),
    enrollmentId: uuid().notNull(),
    sessionId: uuid()
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    termId: uuid(),
    amountKobo: bigint({ mode: "number" }).notNull(),
    paidOn: date(),
    method: paymentMethod(),
    reference: text(),
    notes: text(),
    status: ledgerStatus().notNull().default("posted"),
    source: recordSource().notNull().default("v2"),
    replacesPaymentId: uuid().references((): AnyPgColumn => payments.id, { onDelete: "restrict" }),
    voidedAt: timestamptz(),
    voidedById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    voidReason: text(),
    recordedById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    check("payments_amount_positive", sql`amount_kobo > 0`),
    check("payments_void_consistent", voidConsistency),
    check(
      "payments_v2_complete",
      sql`source = 'v1_import' OR (receipt_number IS NOT NULL AND paid_on IS NOT NULL AND method IS NOT NULL AND recorded_by_id IS NOT NULL)`,
    ),
    check("payments_not_self_replacing", sql`replaces_payment_id IS DISTINCT FROM id`),
    foreignKey({
      name: "payments_enrollment_session_fk",
      columns: [t.enrollmentId, t.sessionId],
      foreignColumns: [enrollments.id, enrollments.sessionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "payments_term_session_fk",
      columns: [t.termId, t.sessionId],
      foreignColumns: [terms.id, terms.sessionId],
    }).onDelete("restrict"),
    index("payments_enrollment_idx").on(t.enrollmentId),
    index("payments_recent_idx").on(t.createdAt.desc()),
    index("payments_paid_on_idx").on(t.paidOn),
  ],
);

/** Gap-free yearly sequences for printed documents (e.g. receipt numbers). */
export const documentCounters = pgTable(
  "document_counters",
  {
    scope: text().notNull(),
    year: integer().notNull(),
    lastValue: integer().notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.year] }),
    check("document_counters_value", sql`last_value >= 0`),
  ],
);
