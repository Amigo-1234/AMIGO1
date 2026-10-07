import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import type { Permission } from "@/domain/permissions";
import type { Locale } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import { type StaffAccess, type StaffIdentity, hasPermission } from "./access";
import { NEON_SESSION_COOKIE, getNeonAuth } from "./neon-config";
import {
  type NeonSessionSnapshot,
  type StaffAuthState,
  assertStaff,
  assertStaffPermission,
  evaluateStaffSession,
} from "./state";

/** What Neon Auth says about the current request (server-verified, never client state). */
export async function readNeonSession(): Promise<NeonSessionSnapshot> {
  const auth = getNeonAuth();
  if (!auth) return { configured: false, identity: null, hadSessionCookie: false };
  const hadSessionCookie = (await cookies()).has(NEON_SESSION_COOKIE);
  if (!hadSessionCookie) return { configured: true, identity: null, hadSessionCookie };

  let result;
  try {
    result = await auth.getSession();
  } catch {
    // A session refresh can try to write cookies during rendering; the proxy has already
    // refreshed it, so one retry reads the refreshed session.
    result = await auth.getSession().catch(() => null);
  }
  const user = result?.data?.user;
  const identity: StaffIdentity | null =
    user?.id && user.email ? { authUserId: user.id, email: user.email, name: user.name } : null;
  return { configured: true, identity, hadSessionCookie };
}

/** The current staff authorization state, computed once per request. */
export const getCurrentStaff = cache(async (): Promise<StaffAuthState> =>
  evaluateStaffSession(getDb, await readNeonSession()),
);

/** For pages: the active staff member, or a redirect to the localized sign-in page. */
export async function requireStaff(locale: Locale): Promise<StaffAccess> {
  const state = await getCurrentStaff();
  if (state.status === "ok") return state.access;
  const reason = state.status === "signed_out" ? (state.expired ? "expired" : null) : state.status;
  redirect(localizedPath(locale, `/staff/login${reason ? `?reason=${reason}` : ""}`));
}

/** For pages: require a permission, sending staff without it to the staff home. */
export async function requireStaffPermission(
  locale: Locale,
  permission: Permission,
): Promise<StaffAccess> {
  const access = await requireStaff(locale);
  if (!hasPermission(access, permission)) redirect(localizedPath(locale, "/admin?denied=1"));
  return access;
}

/**
 * For server actions and route handlers: re-verify the session and permission on every
 * call. Throws (never trusts the caller), so calling an action directly is rejected too.
 */
export async function authorizeStaffAction(permission?: Permission): Promise<StaffAccess> {
  const state = await getCurrentStaff();
  return permission ? assertStaffPermission(state, permission) : assertStaff(state);
}
