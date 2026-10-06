import type { Permission } from "@/domain/permissions";
import type { DbExecutor } from "@/db/types";
import {
  AuthorizationError,
  type StaffAccess,
  type StaffIdentity,
  hasPermission,
  resolveStaffAccess,
} from "./access";

/**
 * Turns "what Neon Auth says about this request" into an authorization state. Kept free
 * of Next.js so every branch is unit-tested; src/server/staff-auth/current.ts feeds it the
 * real Neon Auth session.
 */
export type NeonSessionSnapshot = {
  /** Neon Auth environment variables are present. */
  configured: boolean;
  /** The identity from a valid Neon Auth session, or null. */
  identity: StaffIdentity | null;
  /** The browser sent a Neon Auth session cookie (so a missing identity means it expired). */
  hadSessionCookie: boolean;
};

export type StaffAuthState =
  | { status: "not_configured" }
  | { status: "signed_out"; expired: boolean }
  | { status: "unmapped" }
  | { status: "inactive" }
  | { status: "ok"; access: StaffAccess };

export async function evaluateStaffSession(
  db: DbExecutor,
  snapshot: NeonSessionSnapshot,
): Promise<StaffAuthState> {
  if (!snapshot.configured) return { status: "not_configured" };
  if (!snapshot.identity) return { status: "signed_out", expired: snapshot.hadSessionCookie };
  const result = await resolveStaffAccess(db, snapshot.identity);
  if (result.kind === "ok") return { status: "ok", access: result.access };
  return { status: result.kind };
}

/** Thrown when a request has no active, mapped staff session. */
export class StaffAuthenticationError extends Error {
  constructor(readonly reason: Exclude<StaffAuthState["status"], "ok">) {
    super("Staff sign-in required.");
    this.name = "StaffAuthenticationError";
  }
}

/** Server-side gate for server actions and other non-page entry points. */
export function assertStaff(state: StaffAuthState): StaffAccess {
  if (state.status !== "ok") throw new StaffAuthenticationError(state.status);
  return state.access;
}

export function assertStaffPermission(state: StaffAuthState, permission: Permission): StaffAccess {
  const access = assertStaff(state);
  if (!hasPermission(access, permission)) throw new AuthorizationError(permission);
  return access;
}
