import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./_shared";
import { actorType } from "./enums";
import { staffUsers } from "./staff";
import { students } from "./students";

/**
 * Append-only record of important actions (immutable: database trigger).
 * `action` is a dotted verb such as "student.registered" or "payment.voided".
 * `metadata` carries action-specific details (before/after values, reasons).
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: createdAt(),
    actorType: actorType().notNull(),
    actorUserId: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    actorStudentId: uuid().references(() => students.id, { onDelete: "restrict" }),
    /** Name/email at the time of the action, so the log reads correctly later. */
    actorLabel: text(),
    action: text().notNull(),
    targetType: text(),
    targetId: text(),
    metadata: jsonb().notNull().default({}),
    ipHash: text(),
    requestId: text(),
  },
  (t) => [
    check("audit_logs_action_format", sql`action ~ '^[a-z_]+(\\.[a-z_]+)+$'`),
    check(
      "audit_logs_actor_consistent",
      sql`(actor_type = 'staff' AND actor_user_id IS NOT NULL AND actor_student_id IS NULL)
        OR (actor_type = 'student' AND actor_student_id IS NOT NULL AND actor_user_id IS NULL)
        OR (actor_type = 'system' AND actor_user_id IS NULL AND actor_student_id IS NULL)`,
    ),
    index("audit_logs_occurred_idx").on(t.occurredAt.desc()),
    index("audit_logs_target_idx").on(t.targetType, t.targetId, t.occurredAt.desc()),
    index("audit_logs_actor_idx").on(t.actorUserId, t.occurredAt.desc()),
    index("audit_logs_action_idx").on(t.action, t.occurredAt.desc()),
  ],
);
