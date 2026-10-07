import { and, desc, eq, sql } from "drizzle-orm";
import { sessionAcceptsEnrollment } from "@/domain/academic-calendar";
import type { StudentDetails, StudentIntake } from "@/domain/admin-input";
import { todayInLagos } from "@/domain/admin-input";
import { parseStudentId } from "@/domain/student-id";
import {
  type StudentStatus,
  canChangeStatus,
  endsActiveEnrollment,
  isStudentStatus,
  restoreTarget,
} from "@/domain/student-lifecycle";
import {
  academicSessions,
  auditLogs,
  enrollments,
  levels,
  studentIdentifiers,
  students,
} from "@/db/schema";
import { allocateStudentId } from "@/db/student-ids";
import type { DbExecutor } from "@/db/types";
import { recordAudit } from "../audit";
import type { StaffAccess } from "../staff-auth/access";
import { revokeAllStudentSessions } from "../student-auth/sessions";
import { AdminRuleError, diff, inStaffTransaction, requirePermissions, staffActor } from "./common";
import { attachGuardian } from "./guardians";

/**
 * Register a student in one transaction: allocate the permanent ID from the admission
 * level and session (MG{LEVEL}-{START YEAR}-{SERIAL}), insert the student and its primary
 * identifier, optionally place them in that session and level, optionally add or reuse a
 * guardian, and audit each step. Any failure rolls everything back, including the ID
 * counter, so no serial is skipped.
 */
export async function registerStudent(
  db: DbExecutor,
  actor: StaffAccess,
  intake: StudentIntake,
): Promise<{ id: string; publicId: string }> {
  requirePermissions(actor, "students.create");
  if (intake.enrollNow) requirePermissions(actor, "enrollments.manage");
  if (intake.guardian) requirePermissions(actor, "students.update");

  return inStaffTransaction(db, actor, async (tx) => {
    const [level] = await tx.select().from(levels).where(eq(levels.id, intake.levelId));
    if (!level || !level.isActive) throw new AdminRuleError("level_unavailable");
    const [session] = await tx
      .select()
      .from(academicSessions)
      .where(eq(academicSessions.id, intake.sessionId));
    if (!session) throw new AdminRuleError("session_unavailable");
    if (intake.enrollNow && !sessionAcceptsEnrollment(session.status))
      throw new AdminRuleError("session_closed");

    const publicId = await allocateStudentId(tx, {
      levelCode: level.code,
      year: session.startYear,
    });
    const parts = parseStudentId(publicId)!;
    const [student] = await tx
      .insert(students)
      .values({ ...intake.student, publicId, status: "active", createdById: actor.staffId })
      .returning({ id: students.id });
    await tx.insert(studentIdentifiers).values({
      value: publicId,
      studentId: student.id,
      isPrimary: true,
      source: "v2",
      levelCode: parts.levelCode,
      year: parts.year,
      serial: parts.serial,
    });
    await recordAudit(tx, {
      actor: staffActor(actor),
      action: "student.created",
      targetType: "student",
      targetId: student.id,
      metadata: { publicId, admissionLevel: level.code, admissionSession: session.label },
    });

    if (intake.enrollNow) {
      const [enrollment] = await tx
        .insert(enrollments)
        .values({
          studentId: student.id,
          sessionId: session.id,
          levelId: level.id,
          enrolledOn: intake.student.admittedOn ?? todayInLagos(),
          createdById: actor.staffId,
        })
        .returning({ id: enrollments.id });
      await recordAudit(tx, {
        actor: staffActor(actor),
        action: "enrollment.created",
        targetType: "student",
        targetId: student.id,
        metadata: { enrollmentId: enrollment.id, session: session.label, level: level.code },
      });
    }

    if (intake.guardian) await attachGuardian(tx, actor, student.id, intake.guardian);
    return { id: student.id, publicId };
  });
}

/** Edit a student's personal details. Archived records are read-only until restored. */
export async function updateStudentDetails(
  db: DbExecutor,
  actor: StaffAccess,
  studentId: string,
  details: StudentDetails,
): Promise<"updated" | "unchanged"> {
  requirePermissions(actor, "students.update");
  return inStaffTransaction(db, actor, async (tx) => {
    const [current] = await tx
      .select()
      .from(students)
      .where(eq(students.id, studentId))
      .for("update");
    if (!current) throw new AdminRuleError("not_found");
    if (current.status === "archived") throw new AdminRuleError("archived_read_only");

    const changes = diff(current, details);
    if (!Object.keys(changes).length) return "unchanged";
    await tx.update(students).set(details).where(eq(students.id, studentId));
    await recordAudit(tx, {
      actor: staffActor(actor),
      action: "student.updated",
      targetType: "student",
      targetId: studentId,
      metadata: { changes },
    });
    return "updated";
  });
}

/**
 * Change a student's status by hand (suspend, reactivate, withdraw, readmit, archive).
 * Leaving the school ends the active enrollment as `withdrawn`; a student who may no
 * longer sign in loses any open portal sessions. Always audited with the reason.
 */
export async function changeStudentStatus(
  db: DbExecutor,
  actor: StaffAccess,
  input: { studentId: string; to: StudentStatus; reason: string; now?: Date },
): Promise<void> {
  requirePermissions(actor, "students.archive");
  const now = input.now ?? new Date();
  await inStaffTransaction(
    db,
    actor,
    async (tx) => {
      const [current] = await tx
        .select({ id: students.id, status: students.status })
        .from(students)
        .where(eq(students.id, input.studentId))
        .for("update");
      if (!current) throw new AdminRuleError("not_found");
      if (!canChangeStatus(current.status, input.to))
        throw new AdminRuleError("status_change_not_allowed");

      await tx
        .update(students)
        .set({ status: input.to, archivedAt: input.to === "archived" ? now : null })
        .where(eq(students.id, current.id));

      let endedEnrollmentId: string | null = null;
      if (endsActiveEnrollment(input.to)) {
        const [ended] = await tx
          .update(enrollments)
          .set({ status: "withdrawn", endedOn: todayInLagos(now) })
          .where(and(eq(enrollments.studentId, current.id), eq(enrollments.status, "active")))
          .returning({ id: enrollments.id });
        endedEnrollmentId = ended?.id ?? null;
      }
      if (input.to !== "active") await revokeAllStudentSessions(tx, current.id, now);

      await recordAudit(tx, {
        actor: staffActor(actor),
        action: "student.status_changed",
        targetType: "student",
        targetId: current.id,
        metadata: { from: current.status, to: input.to, reason: input.reason, endedEnrollmentId },
      });
    },
    input.reason,
  );
}

/** Return an archived student to the status they had before archiving. */
export async function restoreStudent(
  db: DbExecutor,
  actor: StaffAccess,
  input: { studentId: string; reason: string },
): Promise<StudentStatus> {
  requirePermissions(actor, "students.archive");
  return inStaffTransaction(
    db,
    actor,
    async (tx) => {
      const [current] = await tx
        .select({ id: students.id, status: students.status })
        .from(students)
        .where(eq(students.id, input.studentId))
        .for("update");
      if (!current) throw new AdminRuleError("not_found");
      if (current.status !== "archived") throw new AdminRuleError("not_archived");

      const target = restoreTarget(await statusBeforeArchive(tx, current.id));
      await tx
        .update(students)
        .set({ status: target, archivedAt: null })
        .where(eq(students.id, current.id));
      await recordAudit(tx, {
        actor: staffActor(actor),
        action: "student.status_changed",
        targetType: "student",
        targetId: current.id,
        metadata: { from: "archived", to: target, reason: input.reason, restored: true },
      });
      return target;
    },
    input.reason,
  );
}

/** The status recorded by the most recent archiving of this student, if any. */
export async function statusBeforeArchive(
  db: DbExecutor,
  studentId: string,
): Promise<string | null> {
  const [entry] = await db
    .select({ from: sql<string | null>`${auditLogs.metadata} ->> 'from'` })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.targetId, studentId),
        eq(auditLogs.action, "student.status_changed"),
        sql`${auditLogs.metadata} ->> 'to' = 'archived'`,
      ),
    )
    .orderBy(desc(auditLogs.id))
    .limit(1);
  return entry && isStudentStatus(entry.from) ? entry.from : null;
}
