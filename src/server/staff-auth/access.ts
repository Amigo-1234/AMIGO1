import { and, eq, inArray } from "drizzle-orm";
import type { Permission } from "@/domain/permissions";
import { resolvePermissions } from "@/domain/permissions";
import {
  rolePermissions,
  roles,
  staffUsers,
  userPermissionOverrides,
  userRoles,
} from "@/db/schema";
import type { DbExecutor } from "@/db/types";

/**
 * Authorization for staff. Authentication (Neon Auth) only proves who someone is; access
 * comes solely from an explicit `staff_users` row linked by `auth_user_id`, its status,
 * and the permissions of its roles plus individual grants/denials. Code checks permissions
 * (`payments.record`), never role names.
 */

/** The identity Neon Auth vouches for. */
export type StaffIdentity = { authUserId: string; email: string; name?: string | null };

export type StaffAccess = {
  staffId: string;
  authUserId: string;
  email: string;
  fullName: string;
  roles: ReadonlyArray<{ key: string; nameEn: string; nameAr: string }>;
  permissions: ReadonlySet<string>;
};

export type StaffAccessResult =
  | { kind: "ok"; access: StaffAccess }
  /** Authenticated, but no staff record is linked to this identity. */
  | { kind: "unmapped" }
  /** Linked staff record exists but is not active (invited, suspended, deactivated). */
  | { kind: "inactive" };

export async function resolveStaffAccess(
  db: DbExecutor,
  identity: StaffIdentity,
): Promise<StaffAccessResult> {
  const [staff] = await db
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.authUserId, identity.authUserId));
  if (!staff) return { kind: "unmapped" };
  if (staff.status !== "active") return { kind: "inactive" };
  return { kind: "ok", access: await loadAccess(db, staff) };
}

/** Access for a staff row (used after sign-in and for staff-management checks). */
export async function loadAccess(
  db: DbExecutor,
  staff: { id: string; authUserId: string | null; email: string; fullName: string },
): Promise<StaffAccess> {
  const heldRoles = await db
    .select({ id: roles.id, key: roles.key, nameEn: roles.nameEn, nameAr: roles.nameAr })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, staff.id))
    .orderBy(roles.key);

  const granted = heldRoles.length
    ? await db
        .select({ key: rolePermissions.permissionKey })
        .from(rolePermissions)
        .where(
          inArray(
            rolePermissions.roleId,
            heldRoles.map((r) => r.id),
          ),
        )
    : [];

  const overrides = await db
    .select({ key: userPermissionOverrides.permissionKey, effect: userPermissionOverrides.effect })
    .from(userPermissionOverrides)
    .where(eq(userPermissionOverrides.userId, staff.id));

  return {
    staffId: staff.id,
    authUserId: staff.authUserId ?? "",
    email: staff.email,
    fullName: staff.fullName,
    roles: heldRoles.map(({ key, nameEn, nameAr }) => ({ key, nameEn, nameAr })),
    permissions: resolvePermissions({
      rolePermissions: granted.map((g) => g.key),
      grants: overrides.filter((o) => o.effect === "grant").map((o) => o.key),
      denials: overrides.filter((o) => o.effect === "deny").map((o) => o.key),
    }),
  };
}

export function hasPermission(
  access: StaffAccess | null | undefined,
  permission: Permission,
): boolean {
  return !!access && access.permissions.has(permission);
}

/** Thrown when a signed-in staff member lacks a permission. Message is safe to show. */
export class AuthorizationError extends Error {
  constructor(readonly permission?: Permission) {
    super("You do not have permission to do that.");
    this.name = "AuthorizationError";
  }
}

export function assertPermission(access: StaffAccess, permission: Permission): void {
  if (!hasPermission(access, permission)) throw new AuthorizationError(permission);
}

/** Active staff count holding a role (used to protect the last Super Admin). */
export async function countActiveWithRole(db: DbExecutor, roleKey: string): Promise<number> {
  const rows = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .innerJoin(userRoles, eq(userRoles.userId, staffUsers.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(roles.key, roleKey), eq(staffUsers.status, "active")));
  return rows.length;
}
