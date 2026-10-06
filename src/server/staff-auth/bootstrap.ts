import { eq, sql } from "drizzle-orm";
import { roles, staffUsers, systemSettings, userRoles } from "@/db/schema";
import type { DbExecutor } from "@/db/types";
import { recordAudit } from "../audit";
import type { StaffIdentity } from "./access";

/**
 * One-time creation of the first Super Admin.
 *
 * Available only while no staff record exists and the completion marker is absent; it
 * links one specific Neon Auth identity to a new active staff record with the Super Admin
 * role, writes the completion marker and an audit entry, all in one transaction guarded by
 * an advisory lock, so two simultaneous attempts cannot both succeed. Afterwards it can
 * never run again: further staff are added by a Super Admin inside the application.
 */
export const BOOTSTRAP_SETTING = "auth.staff_bootstrap";
const BOOTSTRAP_LOCK = 742_016_001;

export class BootstrapUnavailableError extends Error {
  constructor() {
    super("First administrator setup has already been completed.");
    this.name = "BootstrapUnavailableError";
  }
}

export async function isBootstrapAvailable(db: DbExecutor): Promise<boolean> {
  const [marker] = await db
    .select({ key: systemSettings.key })
    .from(systemSettings)
    .where(eq(systemSettings.key, BOOTSTRAP_SETTING));
  if (marker) return false;
  const [anyStaff] = await db.select({ id: staffUsers.id }).from(staffUsers).limit(1);
  return !anyStaff;
}

export async function bootstrapSuperAdmin(
  db: DbExecutor,
  input: { identity: StaffIdentity; fullName: string; now: Date },
): Promise<{ staffId: string }> {
  const email = input.identity.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("A name is required");

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`);
    if (!(await isBootstrapAvailable(tx))) throw new BootstrapUnavailableError();

    const [superAdmin] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, "super_admin"));
    if (!superAdmin)
      throw new Error("The super_admin role is missing; run the database seed first.");

    const [staff] = await tx
      .insert(staffUsers)
      .values({
        authUserId: input.identity.authUserId,
        email,
        fullName,
        status: "active",
        lastSignInAt: input.now,
      })
      .returning({ id: staffUsers.id });
    await tx
      .insert(userRoles)
      .values({ userId: staff.id, roleId: superAdmin.id, grantedAt: input.now });
    await tx.insert(systemSettings).values({
      key: BOOTSTRAP_SETTING,
      value: { completedAt: input.now.toISOString(), staffId: staff.id },
      description: "First Super Admin setup is complete; the setup page is permanently disabled.",
    });
    await recordAudit(tx, {
      actor: { type: "staff", userId: staff.id, label: email },
      action: "staff.bootstrapped",
      targetType: "staff_user",
      targetId: staff.id,
      metadata: { role: "super_admin" },
    });
    return { staffId: staff.id };
  });
}
