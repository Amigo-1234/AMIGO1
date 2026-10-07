import { and, eq, ne, sql } from "drizzle-orm";
import type { GuardianDetails, GuardianLink } from "@/domain/admin-input";
import { guardians, studentGuardians, students } from "@/db/schema";
import type { DbExecutor } from "@/db/types";
import { recordAudit } from "../audit";
import type { StaffAccess } from "../staff-auth/access";
import { AdminRuleError, diff, inStaffTransaction, requirePermissions, staffActor } from "./common";

/**
 * Guardians are optional contacts. One guardian can be linked to several students (e.g.
 * siblings): details live once on the guardian, while the relationship and "primary
 * contact" flag belong to each link. Changing a guardian's details changes them for every
 * linked student, which the screens make clear.
 *
 * Duplicates are avoided conservatively: a new guardian whose name and phone number both
 * match an existing guardian reuses that record. Anything less certain creates a new
 * guardian (staff can link an existing one by searching instead).
 */

async function assertStudentEditable(tx: DbExecutor, studentId: string) {
  const [student] = await tx
    .select({ status: students.status })
    .from(students)
    .where(eq(students.id, studentId))
    .for("update");
  if (!student) throw new AdminRuleError("not_found");
  if (student.status === "archived") throw new AdminRuleError("archived_read_only");
}

async function setPrimaryContact(tx: DbExecutor, studentId: string, guardianId: string) {
  await tx
    .update(studentGuardians)
    .set({ isPrimaryContact: false })
    .where(
      and(eq(studentGuardians.studentId, studentId), ne(studentGuardians.guardianId, guardianId)),
    );
}

/** Find a guardian that is certainly the same person: same name (any case) and phone. */
async function findSameGuardian(tx: DbExecutor, details: GuardianDetails) {
  if (!details.phone) return null;
  const [match] = await tx
    .select({ id: guardians.id })
    .from(guardians)
    .where(
      and(
        eq(guardians.phone, details.phone),
        sql`lower(${guardians.fullName}) = lower(${details.fullName})`,
      ),
    )
    .limit(1);
  return match ?? null;
}

async function insertLink(
  tx: DbExecutor,
  actor: StaffAccess,
  studentId: string,
  guardianId: string,
  link: GuardianLink,
  reused: boolean,
) {
  const [existing] = await tx
    .select({ guardianId: studentGuardians.guardianId })
    .from(studentGuardians)
    .where(
      and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, guardianId)),
    );
  if (existing) throw new AdminRuleError("guardian_already_linked");
  if (link.isPrimaryContact) await setPrimaryContact(tx, studentId, guardianId);
  await tx.insert(studentGuardians).values({ studentId, guardianId, ...link });
  await recordAudit(tx, {
    actor: staffActor(actor),
    action: "guardian.linked",
    targetType: "student",
    targetId: studentId,
    metadata: { guardianId, ...link, reusedExisting: reused },
  });
}

/**
 * Add a guardian to a student inside an existing transaction (used by registration and
 * by the "add guardian" screen): reuse the same person if certain, otherwise create.
 */
export async function attachGuardian(
  tx: DbExecutor,
  actor: StaffAccess,
  studentId: string,
  guardian: GuardianDetails & GuardianLink,
): Promise<{ guardianId: string; reused: boolean }> {
  const { relationship, isPrimaryContact, ...details } = guardian;
  const same = await findSameGuardian(tx, details);
  let guardianId = same?.id;
  if (!guardianId) {
    const [created] = await tx.insert(guardians).values(details).returning({ id: guardians.id });
    guardianId = created.id;
    await recordAudit(tx, {
      actor: staffActor(actor),
      action: "guardian.created",
      targetType: "guardian",
      targetId: guardianId,
      metadata: { fullName: details.fullName },
    });
  }
  await insertLink(tx, actor, studentId, guardianId, { relationship, isPrimaryContact }, !!same);
  return { guardianId, reused: !!same };
}

export async function addGuardian(
  db: DbExecutor,
  actor: StaffAccess,
  studentId: string,
  guardian: GuardianDetails & GuardianLink,
) {
  requirePermissions(actor, "students.update");
  return inStaffTransaction(db, actor, async (tx) => {
    await assertStudentEditable(tx, studentId);
    return attachGuardian(tx, actor, studentId, guardian);
  });
}

/** Link an existing guardian (e.g. a sibling's parent) to a student. */
export async function linkGuardian(
  db: DbExecutor,
  actor: StaffAccess,
  input: { studentId: string; guardianId: string; link: GuardianLink },
) {
  requirePermissions(actor, "students.update");
  return inStaffTransaction(db, actor, async (tx) => {
    await assertStudentEditable(tx, input.studentId);
    const [guardian] = await tx
      .select({ id: guardians.id })
      .from(guardians)
      .where(eq(guardians.id, input.guardianId));
    if (!guardian) throw new AdminRuleError("not_found");
    await insertLink(tx, actor, input.studentId, guardian.id, input.link, true);
  });
}

/** Edit a guardian's own details (shared by every linked student). */
export async function updateGuardian(
  db: DbExecutor,
  actor: StaffAccess,
  guardianId: string,
  details: GuardianDetails,
): Promise<"updated" | "unchanged"> {
  requirePermissions(actor, "students.update");
  return inStaffTransaction(db, actor, async (tx) => {
    const [current] = await tx
      .select()
      .from(guardians)
      .where(eq(guardians.id, guardianId))
      .for("update");
    if (!current) throw new AdminRuleError("not_found");
    const changes = diff(current, details);
    if (!Object.keys(changes).length) return "unchanged";
    await tx.update(guardians).set(details).where(eq(guardians.id, guardianId));
    await recordAudit(tx, {
      actor: staffActor(actor),
      action: "guardian.updated",
      targetType: "guardian",
      targetId: guardianId,
      metadata: { changes },
    });
    return "updated";
  });
}

/** Change how a guardian relates to one student (relationship, primary contact). */
export async function updateGuardianLink(
  db: DbExecutor,
  actor: StaffAccess,
  input: { studentId: string; guardianId: string; link: GuardianLink },
) {
  requirePermissions(actor, "students.update");
  return inStaffTransaction(db, actor, async (tx) => {
    await assertStudentEditable(tx, input.studentId);
    const where = and(
      eq(studentGuardians.studentId, input.studentId),
      eq(studentGuardians.guardianId, input.guardianId),
    );
    const [current] = await tx.select().from(studentGuardians).where(where);
    if (!current) throw new AdminRuleError("guardian_not_linked");
    const changes = diff(current, input.link);
    if (!Object.keys(changes).length) return "unchanged" as const;
    if (input.link.isPrimaryContact) await setPrimaryContact(tx, input.studentId, input.guardianId);
    await tx.update(studentGuardians).set(input.link).where(where);
    await recordAudit(tx, {
      actor: staffActor(actor),
      action: "guardian.link_updated",
      targetType: "student",
      targetId: input.studentId,
      metadata: { guardianId: input.guardianId, changes },
    });
    return "updated" as const;
  });
}

/**
 * Remove a guardian from one student (e.g. linked by mistake). The guardian record and
 * links to other students stay; the audit entry keeps what the link was.
 */
export async function unlinkGuardian(
  db: DbExecutor,
  actor: StaffAccess,
  input: { studentId: string; guardianId: string; reason: string },
) {
  requirePermissions(actor, "students.update");
  return inStaffTransaction(
    db,
    actor,
    async (tx) => {
      await assertStudentEditable(tx, input.studentId);
      const [removed] = await tx
        .delete(studentGuardians)
        .where(
          and(
            eq(studentGuardians.studentId, input.studentId),
            eq(studentGuardians.guardianId, input.guardianId),
          ),
        )
        .returning();
      if (!removed) throw new AdminRuleError("guardian_not_linked");
      await recordAudit(tx, {
        actor: staffActor(actor),
        action: "guardian.unlinked",
        targetType: "student",
        targetId: input.studentId,
        metadata: {
          guardianId: input.guardianId,
          relationship: removed.relationship,
          wasPrimaryContact: removed.isPrimaryContact,
          reason: input.reason,
        },
      });
    },
    input.reason,
  );
}
