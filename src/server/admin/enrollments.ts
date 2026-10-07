import { and, eq, sql } from "drizzle-orm";
import { sessionAcceptsEnrollment } from "@/domain/academic-calendar";
import { todayInLagos } from "@/domain/admin-input";
import { canBeEnrolled } from "@/domain/student-lifecycle";
import { academicSessions, enrollments, levels, students, termResults } from "@/db/schema";
import type { DbExecutor } from "@/db/types";
import { recordAudit } from "../audit";
import type { StaffAccess } from "../staff-auth/access";
import { AdminRuleError, inStaffTransaction, requirePermissions, staffActor } from "./common";

/**
 * Class placement. A student has at most one enrollment per session and at most one
 * active enrollment (also enforced by the database). Moving a student on to the next
 * session is promotion processing (a later phase), so here a student can be placed only
 * when they have no active enrollment.
 */
export async function enrollStudent(
  db: DbExecutor,
  actor: StaffAccess,
  input: { studentId: string; sessionId: string; levelId: string; enrolledOn?: string | null },
): Promise<{ enrollmentId: string }> {
  requirePermissions(actor, "enrollments.manage");
  return inStaffTransaction(db, actor, async (tx) => {
    const [student] = await tx
      .select({ id: students.id, status: students.status })
      .from(students)
      .where(eq(students.id, input.studentId))
      .for("update");
    if (!student) throw new AdminRuleError("not_found");
    if (!canBeEnrolled(student.status)) throw new AdminRuleError("not_enrollable");

    const [session] = await tx
      .select()
      .from(academicSessions)
      .where(eq(academicSessions.id, input.sessionId));
    if (!session) throw new AdminRuleError("session_unavailable");
    if (!sessionAcceptsEnrollment(session.status)) throw new AdminRuleError("session_closed");
    const [level] = await tx.select().from(levels).where(eq(levels.id, input.levelId));
    if (!level || !level.isActive) throw new AdminRuleError("level_unavailable");

    const existing = await tx
      .select({ sessionId: enrollments.sessionId, status: enrollments.status })
      .from(enrollments)
      .where(eq(enrollments.studentId, student.id));
    if (existing.some((e) => e.sessionId === session.id))
      throw new AdminRuleError("already_enrolled_in_session");
    if (existing.some((e) => e.status === "active"))
      throw new AdminRuleError("has_active_enrollment");

    const [enrollment] = await tx
      .insert(enrollments)
      .values({
        studentId: student.id,
        sessionId: session.id,
        levelId: level.id,
        enrolledOn: input.enrolledOn ?? todayInLagos(),
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
    return { enrollmentId: enrollment.id };
  });
}

/**
 * Correct the level of an active enrollment (placed in the wrong class). Refused once any
 * result sheet exists for the enrollment: from then on a change of class would rewrite
 * academic history, and belongs to promotion processing.
 */
export async function changeEnrollmentLevel(
  db: DbExecutor,
  actor: StaffAccess,
  input: { enrollmentId: string; levelId: string; reason: string },
): Promise<void> {
  requirePermissions(actor, "enrollments.manage");
  await inStaffTransaction(
    db,
    actor,
    async (tx) => {
      const [current] = await tx
        .select({
          id: enrollments.id,
          studentId: enrollments.studentId,
          status: enrollments.status,
          levelId: enrollments.levelId,
          sessionStatus: academicSessions.status,
          sessionLabel: academicSessions.label,
        })
        .from(enrollments)
        .innerJoin(academicSessions, eq(academicSessions.id, enrollments.sessionId))
        .where(eq(enrollments.id, input.enrollmentId))
        .for("update", { of: enrollments });
      if (!current) throw new AdminRuleError("not_found");
      if (current.status !== "active") throw new AdminRuleError("enrollment_not_active");
      if (!sessionAcceptsEnrollment(current.sessionStatus))
        throw new AdminRuleError("session_closed");
      if (current.levelId === input.levelId) throw new AdminRuleError("same_level");

      const [level] = await tx.select().from(levels).where(eq(levels.id, input.levelId));
      if (!level || !level.isActive) throw new AdminRuleError("level_unavailable");
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(termResults)
        .where(eq(termResults.enrollmentId, current.id));
      if (count > 0) throw new AdminRuleError("has_results");

      const [previous] = await tx
        .select({ code: levels.code })
        .from(levels)
        .where(eq(levels.id, current.levelId));
      await tx
        .update(enrollments)
        .set({ levelId: level.id })
        .where(and(eq(enrollments.id, current.id), eq(enrollments.status, "active")));
      await recordAudit(tx, {
        actor: staffActor(actor),
        action: "enrollment.level_changed",
        targetType: "student",
        targetId: current.studentId,
        metadata: {
          enrollmentId: current.id,
          session: current.sessionLabel,
          from: previous?.code ?? null,
          to: level.code,
          reason: input.reason,
        },
      });
    },
    input.reason,
  );
}
