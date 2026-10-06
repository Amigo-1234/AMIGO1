import { and, eq } from "drizzle-orm";
import { rolePermissions, roles, staffUsers, userRoles } from "@/db/schema";
import type { DbExecutor } from "@/db/types";
import { recordAudit } from "../audit";
import {
  AuthorizationError,
  type StaffAccess,
  assertPermission,
  countActiveWithRole,
} from "./access";

/**
 * Security-relevant staff changes, each permission-checked on the server and audited.
 * (The screens that call these arrive with the admin dashboard; the rules live here now.)
 */
export class StaffManagementError extends Error {
  constructor(readonly code: "self_change" | "last_super_admin" | "not_found" | "escalation") {
    super(code);
    this.name = "StaffManagementError";
  }
}

const SUPER_ADMIN = "super_admin";

async function holdsRole(db: DbExecutor, staffId: string, roleKey: string) {
  const [row] = await db
    .select({ id: roles.id })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, staffId), eq(roles.key, roleKey)));
  return !!row;
}

export async function setStaffStatus(
  db: DbExecutor,
  actor: StaffAccess,
  input: { staffId: string; status: "active" | "suspended" | "deactivated"; reason?: string },
): Promise<void> {
  assertPermission(actor, "staff.manage");
  if (input.staffId === actor.staffId) throw new StaffManagementError("self_change");

  await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(staffUsers)
      .where(eq(staffUsers.id, input.staffId))
      .for("update");
    if (!target) throw new StaffManagementError("not_found");
    if (target.status === input.status) return;
    if (
      target.status === "active" &&
      input.status !== "active" &&
      (await holdsRole(tx, target.id, SUPER_ADMIN)) &&
      (await countActiveWithRole(tx, SUPER_ADMIN)) <= 1
    ) {
      throw new StaffManagementError("last_super_admin");
    }
    await tx.update(staffUsers).set({ status: input.status }).where(eq(staffUsers.id, target.id));
    await recordAudit(tx, {
      actor: { type: "staff", userId: actor.staffId, label: actor.email },
      action: input.status === "active" ? "staff.enabled" : "staff.disabled",
      targetType: "staff_user",
      targetId: target.id,
      metadata: { from: target.status, to: input.status, reason: input.reason ?? null },
    });
  });
}

/** Grant a role. Nobody can grant a role carrying permissions they do not hold themselves. */
export async function grantRole(
  db: DbExecutor,
  actor: StaffAccess,
  input: { staffId: string; roleKey: string },
): Promise<void> {
  assertPermission(actor, "staff.manage");
  await db.transaction(async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.key, input.roleKey));
    const [target] = await tx
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(eq(staffUsers.id, input.staffId));
    if (!role || !target) throw new StaffManagementError("not_found");
    const carried = await tx
      .select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, role.id));
    if (carried.some((p) => !actor.permissions.has(p.key)))
      throw new StaffManagementError("escalation");

    const inserted = await tx
      .insert(userRoles)
      .values({ userId: target.id, roleId: role.id, grantedById: actor.staffId })
      .onConflictDoNothing()
      .returning();
    if (inserted.length) {
      await recordAudit(tx, {
        actor: { type: "staff", userId: actor.staffId, label: actor.email },
        action: "staff.role_granted",
        targetType: "staff_user",
        targetId: target.id,
        metadata: { role: role.key },
      });
    }
  });
}

export async function revokeRole(
  db: DbExecutor,
  actor: StaffAccess,
  input: { staffId: string; roleKey: string },
): Promise<void> {
  assertPermission(actor, "staff.manage");
  if (input.roleKey === SUPER_ADMIN && input.staffId === actor.staffId) {
    throw new StaffManagementError("self_change");
  }
  await db.transaction(async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.key, input.roleKey));
    if (!role) throw new StaffManagementError("not_found");
    if (!(await holdsRole(tx, input.staffId, role.key))) return;
    if (role.key === SUPER_ADMIN && (await countActiveWithRole(tx, SUPER_ADMIN)) <= 1) {
      throw new StaffManagementError("last_super_admin");
    }
    await tx
      .delete(userRoles)
      .where(and(eq(userRoles.userId, input.staffId), eq(userRoles.roleId, role.id)));
    await recordAudit(tx, {
      actor: { type: "staff", userId: actor.staffId, label: actor.email },
      action: "staff.role_revoked",
      targetType: "staff_user",
      targetId: input.staffId,
      metadata: { role: role.key },
    });
  });
}

export { AuthorizationError };
