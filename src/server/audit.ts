import { auditLogs } from "@/db/schema";
import type { DbExecutor } from "@/db/types";

export type AuditActor =
  | { type: "staff"; userId: string; label?: string }
  | { type: "student"; studentId: string; label?: string }
  | { type: "system"; label?: string };

/**
 * Append an entry to the audit log. Metadata must never contain secrets: no passwords,
 * PINs, hashes, tokens or connection strings. Ordinary failed sign-ins are deliberately
 * not audited (they are counted in auth_throttles instead), so the log cannot be flooded.
 */
export async function recordAudit(
  db: DbExecutor,
  entry: {
    actor: AuditActor;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { actor } = entry;
  await db.insert(auditLogs).values({
    actorType: actor.type,
    actorUserId: actor.type === "staff" ? actor.userId : null,
    actorStudentId: actor.type === "student" ? actor.studentId : null,
    actorLabel: actor.label ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });
}
