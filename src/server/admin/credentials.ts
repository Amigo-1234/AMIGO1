import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { studentCredentials, students } from "@/db/schema";
import type { DbExecutor } from "@/db/types";
import { recordAudit } from "../audit";
import { hashCredential } from "../auth/crypto";
import type { StaffAccess } from "../staff-auth/access";
import { canSignIn, isWeakPin } from "../student-auth/rules";
import { revokeAllStudentSessions } from "../student-auth/sessions";
import { AdminRuleError, inStaffTransaction, requirePermissions, staffActor } from "./common";

/**
 * Staff control of student portal access (`student_credentials.reset`).
 *
 * - Issuing a PIN (first time or reset) generates a random 6-digit PIN that passes the
 *   weak-PIN rule, stores only its argon2id hash, revokes every live credential (PIN and V1
 *   password) and ends every session. The plain PIN is returned once, to be shown to the
 *   staff member and handed to the family; it is never stored or logged.
 * - A staff-issued PIN (`created_by_id` set) is one-time: signing in with it opens the short
 *   "choose your own PIN" session, so staff never know the PIN the student goes on to use.
 * - Revoking access revokes every live credential and ends every session; a new PIN must be
 *   issued to sign in again.
 */

/** A uniformly random 6-digit PIN that is not weak. */
export function generatePin(): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (!isWeakPin(pin)) return pin;
  }
}

export async function issueStudentPin(
  db: DbExecutor,
  actor: StaffAccess,
  input: { studentId: string; authSecret: string; now?: Date },
): Promise<{ pin: string; reset: boolean }> {
  requirePermissions(actor, "student_credentials.reset");
  const now = input.now ?? new Date();
  const pin = generatePin();
  // Hash before the transaction: argon2id is deliberately slow.
  const secretHash = await hashCredential(pin, input.authSecret);

  const reset = await inStaffTransaction(db, actor, async (tx) => {
    const [student] = await tx
      .select({ id: students.id, status: students.status, publicId: students.publicId })
      .from(students)
      .where(eq(students.id, input.studentId))
      .for("update");
    if (!student) throw new AdminRuleError("not_found");
    if (!canSignIn(student.status)) throw new AdminRuleError("cannot_sign_in");

    const revoked = await tx
      .update(studentCredentials)
      .set({ revokedAt: now, revokedReason: "reset_by_staff" })
      .where(
        and(eq(studentCredentials.studentId, student.id), isNull(studentCredentials.revokedAt)),
      )
      .returning({ kind: studentCredentials.kind });
    await tx.insert(studentCredentials).values({
      studentId: student.id,
      kind: "pin",
      secretHash,
      createdById: actor.staffId,
      createdAt: now,
    });
    const sessionsEnded = await revokeAllStudentSessions(tx, student.id, now);
    const hadAccess = revoked.length > 0;
    await recordAudit(tx, {
      actor: staffActor(actor),
      action: hadAccess ? "student.pin_reset" : "student.pin_issued",
      targetType: "student",
      targetId: student.id,
      metadata: {
        publicId: student.publicId,
        revoked: revoked.map((r) => r.kind),
        sessionsEnded,
      },
    });
    return hadAccess;
  });
  return { pin, reset };
}

export async function revokeStudentAccess(
  db: DbExecutor,
  actor: StaffAccess,
  input: { studentId: string; reason: string; now?: Date },
): Promise<void> {
  requirePermissions(actor, "student_credentials.reset");
  const now = input.now ?? new Date();
  await inStaffTransaction(
    db,
    actor,
    async (tx) => {
      const [student] = await tx
        .select({ id: students.id, publicId: students.publicId })
        .from(students)
        .where(eq(students.id, input.studentId))
        .for("update");
      if (!student) throw new AdminRuleError("not_found");
      const revoked = await tx
        .update(studentCredentials)
        .set({ revokedAt: now, revokedReason: "revoked_by_staff" })
        .where(
          and(eq(studentCredentials.studentId, student.id), isNull(studentCredentials.revokedAt)),
        )
        .returning({ kind: studentCredentials.kind });
      const sessionsEnded = await revokeAllStudentSessions(tx, student.id, now);
      if (!revoked.length && !sessionsEnded) throw new AdminRuleError("no_access_to_revoke");
      await recordAudit(tx, {
        actor: staffActor(actor),
        action: "student.access_revoked",
        targetType: "student",
        targetId: student.id,
        metadata: {
          publicId: student.publicId,
          revoked: revoked.map((r) => r.kind),
          sessionsEnded,
          reason: input.reason,
        },
      });
    },
    input.reason,
  );
}
