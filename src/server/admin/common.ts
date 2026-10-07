import type { Permission } from "@/domain/permissions";
import { setTransactionActor } from "@/db/actor";
import type { DbExecutor } from "@/db/types";
import type { AuditActor } from "../audit";
import { type StaffAccess, assertPermission } from "../staff-auth/access";

/**
 * Shared pieces of the admin services. Every service function receives the verified
 * StaffAccess of the caller and checks its own permission again (defence in depth: the
 * Server Action already checked it), validates its input, runs in one transaction and
 * writes audit entries in that same transaction.
 */

/** A business-rule refusal. `code` is translated for display; it never contains data. */
export class AdminRuleError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(code);
    this.name = "AdminRuleError";
  }
}

export type AdminErrorCode =
  | "not_found"
  | "level_unavailable"
  | "session_unavailable"
  | "session_closed"
  | "status_change_not_allowed"
  | "archived_read_only"
  | "not_archived"
  | "not_enrollable"
  | "already_enrolled_in_session"
  | "has_active_enrollment"
  | "enrollment_not_active"
  | "has_results"
  | "same_level"
  | "duplicate_session"
  | "session_not_planned"
  | "session_not_active"
  | "another_session_active"
  | "session_has_active_enrollments"
  | "term_not_planned"
  | "term_not_active"
  | "dates_outside_session"
  | "guardian_already_linked"
  | "guardian_not_linked";

export function requirePermissions(actor: StaffAccess, ...permissions: Permission[]): void {
  for (const permission of permissions) assertPermission(actor, permission);
}

export function staffActor(actor: StaffAccess): AuditActor {
  return { type: "staff", userId: actor.staffId, label: actor.email };
}

/** Run `work` in a transaction attributed to `actor` (see src/db/actor.ts). */
export function inStaffTransaction<T>(
  db: DbExecutor,
  actor: StaffAccess,
  work: (tx: DbExecutor) => Promise<T>,
  reason?: string | null,
): Promise<T> {
  return db.transaction(async (tx) => {
    await setTransactionActor(tx, { actorId: actor.staffId, reason: reason ?? null });
    return work(tx);
  });
}

/** Field-by-field differences, for audit entries ({ field: { from, to } }). */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after) as (keyof T & string)[]) {
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    if (from !== to) changes[key] = { from, to };
  }
  return changes;
}
