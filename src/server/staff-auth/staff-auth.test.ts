import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALL_PERMISSIONS } from "@/domain/permissions";
import {
  auditLogs,
  roles,
  staffUsers,
  systemSettings,
  userPermissionOverrides,
  userRoles,
} from "@/db/schema";
import { createTestDatabase, errorText } from "@/db/testing/test-db";
import type { DbExecutor } from "@/db/types";
import { AuthorizationError, type StaffIdentity } from "./access";
import {
  BOOTSTRAP_SETTING,
  BootstrapUnavailableError,
  bootstrapSuperAdmin,
  isBootstrapAvailable,
} from "./bootstrap";
import { grantRole, revokeRole, setStaffStatus } from "./management";
import {
  StaffAuthenticationError,
  type StaffAuthState,
  assertStaff,
  assertStaffPermission,
  evaluateStaffSession,
} from "./state";

let db: DbExecutor;
let close: () => Promise<void>;
const now = new Date("2026-10-06T09:00:00Z");
let n = 0;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
}, 120_000);

afterAll(async () => {
  await close?.();
});

const identity = (): StaffIdentity => {
  n += 1;
  return { authUserId: `neon-user-${n}`, email: `staff${n}@markaz.example` };
};
const snapshot = (id: StaffIdentity | null, hadSessionCookie = !!id) => ({
  configured: true,
  identity: id,
  hadSessionCookie,
});

async function staffWithRoles(
  roleKeys: string[],
  status: "active" | "suspended" | "invited" = "active",
) {
  const id = identity();
  const [staff] = await db
    .insert(staffUsers)
    .values({ authUserId: id.authUserId, email: id.email, fullName: `Staff ${n}`, status })
    .returning();
  for (const key of roleKeys) {
    const [role] = await db.select().from(roles).where(eq(roles.key, key));
    await db.insert(userRoles).values({ userId: staff.id, roleId: role.id });
  }
  return { staff, identity: id };
}

async function stateFor(id: StaffIdentity | null, hadSessionCookie?: boolean) {
  return evaluateStaffSession(db, snapshot(id, hadSessionCookie));
}

describe("first Super Admin bootstrap", () => {
  it("is available on an empty system, links one identity and audits it", async () => {
    expect(await isBootstrapAvailable(db)).toBe(true);
    const id = identity();
    const { staffId } = await bootstrapSuperAdmin(db, {
      identity: id,
      fullName: "First Admin",
      now,
    });

    const state = await stateFor(id);
    expect(state.status).toBe("ok");
    if (state.status === "ok") {
      expect(state.access.staffId).toBe(staffId);
      expect(state.access.roles.map((r) => r.key)).toEqual(["super_admin"]);
      expect([...state.access.permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
    }
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "staff.bootstrapped"));
    expect(audit.actorUserId).toBe(staffId);
    const [marker] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, BOOTSTRAP_SETTING));
    expect(marker).toBeDefined();
  });

  it("can never run again", async () => {
    expect(await isBootstrapAvailable(db)).toBe(false);
    await expect(
      bootstrapSuperAdmin(db, { identity: identity(), fullName: "Second", now }),
    ).rejects.toBeInstanceOf(BootstrapUnavailableError);
  });
});

describe("staff session evaluation", () => {
  it("reports an unconfigured system", async () => {
    expect(
      await evaluateStaffSession(db, {
        configured: false,
        identity: null,
        hadSessionCookie: false,
      }),
    ).toEqual({
      status: "not_configured",
    });
  });

  it("treats a request without a session as signed out", async () => {
    expect(await stateFor(null, false)).toEqual({ status: "signed_out", expired: false });
  });

  it("treats a session cookie without a valid session as expired", async () => {
    expect(await stateFor(null, true)).toEqual({ status: "signed_out", expired: true });
  });

  it("does not grant access to an authenticated identity with no staff record", async () => {
    expect(await stateFor(identity())).toEqual({ status: "unmapped" });
  });

  it("does not match staff by email: only the explicit identity link counts", async () => {
    const { staff } = await staffWithRoles(["registrar"]);
    expect(await stateFor({ authUserId: "someone-else", email: staff.email })).toEqual({
      status: "unmapped",
    });
  });

  it("refuses inactive staff", async () => {
    const suspended = await staffWithRoles(["registrar"], "suspended");
    const invited = await staffWithRoles(["registrar"], "invited");
    expect(await stateFor(suspended.identity)).toEqual({ status: "inactive" });
    expect(await stateFor(invited.identity)).toEqual({ status: "inactive" });
  });
});

describe("permission enforcement", () => {
  it("allows staff with the permission and refuses staff without it", async () => {
    const finance = await stateFor((await staffWithRoles(["finance_admin"])).identity);
    expect(assertStaffPermission(finance, "payments.record").email).toBeDefined();
    expect(() => assertStaffPermission(finance, "results.publish")).toThrow(AuthorizationError);
  });

  it("combines several roles and applies individual grants and denials", async () => {
    const { staff, identity: id } = await staffWithRoles(["registrar", "academic_admin"]);
    let state = await stateFor(id);
    expect(() => assertStaffPermission(state, "students.create")).not.toThrow();
    expect(() => assertStaffPermission(state, "results.publish")).not.toThrow();

    await db.insert(userPermissionOverrides).values([
      { userId: staff.id, permissionKey: "results.publish", effect: "deny" },
      { userId: staff.id, permissionKey: "fees.read", effect: "grant" },
    ]);
    state = await stateFor(id);
    expect(() => assertStaffPermission(state, "results.publish")).toThrow(AuthorizationError);
    expect(() => assertStaffPermission(state, "fees.read")).not.toThrow();
  });

  it("gives Super Admin every permission through its role, not a name check", async () => {
    const state = await stateFor((await staffWithRoles(["super_admin"])).identity);
    for (const permission of ALL_PERMISSIONS)
      expect(() => assertStaffPermission(state, permission)).not.toThrow();
  });

  it("rejects direct server calls without a valid staff session", async () => {
    const states: StaffAuthState[] = [
      { status: "not_configured" },
      { status: "signed_out", expired: false },
      { status: "signed_out", expired: true },
      { status: "unmapped" },
      { status: "inactive" },
    ];
    for (const state of states) {
      expect(() => assertStaff(state)).toThrow(StaffAuthenticationError);
      expect(() => assertStaffPermission(state, "students.read")).toThrow(StaffAuthenticationError);
    }
  });

  it("keeps error messages free of identities and secrets", async () => {
    const id = (await staffWithRoles(["finance_admin"])).identity;
    const state = await stateFor(id);
    try {
      assertStaffPermission(state, "staff.manage");
    } catch (error) {
      const text = errorText(error);
      expect(text).not.toContain(id.email);
      expect(text).not.toContain(id.authUserId);
      expect(text).toBe("You do not have permission to do that.");
    }
  });
});

describe("staff management", () => {
  async function superAdmin() {
    const s = await stateFor((await staffWithRoles(["super_admin"])).identity);
    if (s.status !== "ok") throw new Error("expected access");
    return s.access;
  }

  it("requires staff.manage", async () => {
    const registrar = await stateFor((await staffWithRoles(["registrar"])).identity);
    if (registrar.status !== "ok") throw new Error("expected access");
    const target = await staffWithRoles([]);
    await expect(
      setStaffStatus(db, registrar.access, { staffId: target.staff.id, status: "suspended" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("disables and re-enables staff with audit entries, effective immediately", async () => {
    const admin = await superAdmin();
    const target = await staffWithRoles(["registrar"]);
    await setStaffStatus(db, admin, {
      staffId: target.staff.id,
      status: "suspended",
      reason: "left the school",
    });
    expect(await stateFor(target.identity)).toEqual({ status: "inactive" });
    await setStaffStatus(db, admin, { staffId: target.staff.id, status: "active" });
    expect((await stateFor(target.identity)).status).toBe("ok");

    const actions = (
      await db.select().from(auditLogs).where(eq(auditLogs.targetId, target.staff.id))
    ).map((a) => a.action);
    expect(actions).toEqual(["staff.disabled", "staff.enabled"]);
  });

  it("prevents changing your own status and removing the last active Super Admin", async () => {
    const admin = await superAdmin();
    await expect(
      setStaffStatus(db, admin, { staffId: admin.staffId, status: "suspended" }),
    ).rejects.toMatchObject({
      code: "self_change",
    });
    await expect(
      revokeRole(db, admin, { staffId: admin.staffId, roleKey: "super_admin" }),
    ).rejects.toMatchObject({
      code: "self_change",
    });

    // Leave exactly one active Super Admin (this admin).
    const superAdmins = await db
      .select({ id: staffUsers.id, status: staffUsers.status })
      .from(staffUsers)
      .innerJoin(userRoles, eq(userRoles.userId, staffUsers.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(roles.key, "super_admin"));
    for (const other of superAdmins.filter(
      (s) => s.id !== admin.staffId && s.status === "active",
    )) {
      await setStaffStatus(db, admin, { staffId: other.id, status: "suspended" });
    }

    // A non-Super-Admin staff manager cannot remove the last one.
    const manager = await staffWithRoles(["registrar"]);
    await db
      .insert(userPermissionOverrides)
      .values({ userId: manager.staff.id, permissionKey: "staff.manage", effect: "grant" });
    const managerState = await stateFor(manager.identity);
    if (managerState.status !== "ok") throw new Error("expected access");
    await expect(
      setStaffStatus(db, managerState.access, { staffId: admin.staffId, status: "suspended" }),
    ).rejects.toMatchObject({
      code: "last_super_admin",
    });
    await expect(
      revokeRole(db, managerState.access, { staffId: admin.staffId, roleKey: "super_admin" }),
    ).rejects.toMatchObject({
      code: "last_super_admin",
    });
  });

  it("grants and revokes roles with audit entries and blocks privilege escalation", async () => {
    const admin = await superAdmin();
    const target = await staffWithRoles([]);
    await grantRole(db, admin, { staffId: target.staff.id, roleKey: "finance_admin" });
    let state = await stateFor(target.identity);
    expect(() => assertStaffPermission(state, "payments.record")).not.toThrow();

    await revokeRole(db, admin, { staffId: target.staff.id, roleKey: "finance_admin" });
    state = await stateFor(target.identity);
    expect(() => assertStaffPermission(state, "payments.record")).toThrow(AuthorizationError);

    const actions = (
      await db.select().from(auditLogs).where(eq(auditLogs.targetId, target.staff.id))
    ).map((a) => a.action);
    expect(actions).toEqual(["staff.role_granted", "staff.role_revoked"]);

    // A staff manager without finance permissions cannot hand out the finance role.
    const manager = await staffWithRoles(["registrar"]);
    await db
      .insert(userPermissionOverrides)
      .values({ userId: manager.staff.id, permissionKey: "staff.manage", effect: "grant" });
    const managerState = await stateFor(manager.identity);
    if (managerState.status !== "ok") throw new Error("expected access");
    await expect(
      grantRole(db, managerState.access, { staffId: target.staff.id, roleKey: "finance_admin" }),
    ).rejects.toMatchObject({
      code: "escalation",
    });
  });
});
