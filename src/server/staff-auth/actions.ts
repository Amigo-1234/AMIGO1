"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { staffUsers } from "@/db/schema";
import { isLocale, type Locale } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import { getServerEnv } from "@/lib/env";
import { keyedHash, safeEqual } from "../auth/crypto";
import {
  IDENTITY_POLICY,
  NETWORK_POLICY,
  type ThrottleKey,
  clearThrottle,
  lockedUntil,
  recordFailures,
} from "../auth/throttle";
import { getClientAddress } from "../request";
import { resolveStaffAccess } from "./access";
import { BootstrapUnavailableError, bootstrapSuperAdmin, isBootstrapAvailable } from "./bootstrap";
import { authorizeStaffAction } from "./current";
import { normalizeStaffName, updateOwnName } from "./management";
import { getNeonAuth } from "./neon-config";

/*
 * Staff Server Actions. Credentials go from this server to Neon Auth (never handled by
 * client-side code); Neon Auth sets its own secure session cookies. Authentication alone
 * grants nothing: access requires an active staff record linked to the Neon identity.
 */

function formLocale(formData: FormData): Locale {
  const value = formData.get("locale");
  return typeof value === "string" && isLocale(value) ? value : "en";
}

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
});

type NeonError = { status?: number; code?: string } | null | undefined;

/** Classify a Neon Auth error without exposing its details. */
function classify(error: NeonError): "invalid_credentials" | "throttled" | "server" {
  const status = error?.status ?? 500;
  if (status === 429) return "throttled";
  if (status >= 500 || status === 0) return "server";
  return "invalid_credentials";
}

function throttleKeys(
  secret: string | undefined,
  label: string,
  identity: string,
  ip: string | null,
) {
  if (!secret) return [] as ThrottleKey[];
  const keys: ThrottleKey[] = [
    { key: `${label}:${keyedHash(secret, label, identity)}`, policy: IDENTITY_POLICY },
  ];
  if (ip) keys.push({ key: `ip:${keyedHash(secret, "ip", ip)}`, policy: NETWORK_POLICY });
  return keys;
}

export type StaffSignInState = {
  error?:
    | "invalid_input"
    | "invalid_credentials"
    | "throttled"
    | "unmapped"
    | "inactive"
    | "not_configured"
    | "server";
  email?: string;
};

export async function staffSignInAction(
  _previous: StaffSignInState,
  formData: FormData,
): Promise<StaffSignInState> {
  const locale = formLocale(formData);
  const auth = getNeonAuth();
  const rawEmail = String(formData.get("email") ?? "").slice(0, 254);
  if (!auth) return { error: "not_configured", email: rawEmail };

  const parsed = credentialsSchema.safeParse({
    email: rawEmail.trim().toLowerCase(),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "invalid_input", email: rawEmail };
  const { email, password } = parsed.data;

  try {
    const db = getDb();
    const now = new Date();
    const keys = throttleKeys(
      getServerEnv().STUDENT_AUTH_SECRET,
      "staff-email",
      email,
      await getClientAddress(),
    );
    if (await lockedUntil(db, keys, now)) return { error: "throttled", email };

    const { data, error } = await auth.signIn.email({ email, password });
    const user = data?.user;
    if (error || !user?.id) {
      const kind = classify(error);
      if (kind === "invalid_credentials") await recordFailures(db, keys, now);
      return { error: kind, email };
    }

    const access = await resolveStaffAccess(db, {
      authUserId: user.id,
      email: user.email ?? email,
    });
    if (access.kind !== "ok") {
      await auth.signOut();
      return { error: access.kind, email };
    }
    if (keys[0]) await clearThrottle(db, keys[0].key);
    await db
      .update(staffUsers)
      .set({ lastSignInAt: now })
      .where(eq(staffUsers.id, access.access.staffId));
  } catch {
    return { error: "server", email };
  }
  redirect(localizedPath(locale, "/admin"));
}

export async function staffSignOutAction(formData: FormData): Promise<void> {
  const locale = formLocale(formData);
  try {
    await getNeonAuth()?.signOut();
  } catch {
    // The local cookies are cleared by Neon Auth's response; nothing else to do.
  }
  redirect(localizedPath(locale, "/staff/login?reason=signed_out"));
}

const setupSchema = z.object({
  code: z.string().min(1).max(512),
  fullName: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});

export type SetupState = {
  error?:
    | "invalid_input"
    | "invalid_code"
    | "verify_email"
    | "account_error"
    | "throttled"
    | "closed"
    | "server";
  fullName?: string;
  email?: string;
};

/**
 * One-time first Super Admin setup. Requires the STAFF_BOOTSTRAP_TOKEN code, creates (or
 * signs in to) the Neon Auth account, then links it as Super Admin in one locked
 * transaction. Closed for good once any staff record exists.
 */
export async function setupFirstAdminAction(
  _previous: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const locale = formLocale(formData);
  const auth = getNeonAuth();
  const env = getServerEnv();
  const fullName = String(formData.get("fullName") ?? "").slice(0, 120);
  const rawEmail = String(formData.get("email") ?? "").slice(0, 254);
  if (!auth || !env.STAFF_BOOTSTRAP_TOKEN) return { error: "closed" };

  const parsed = setupSchema.safeParse({
    code: formData.get("code"),
    fullName,
    email: rawEmail.trim().toLowerCase(),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "invalid_input", fullName, email: rawEmail };
  const input = parsed.data;

  try {
    const db = getDb();
    const now = new Date();
    if (!(await isBootstrapAvailable(db))) return { error: "closed" };

    const keys = throttleKeys(
      env.STUDENT_AUTH_SECRET,
      "bootstrap",
      "setup",
      await getClientAddress(),
    );
    if (await lockedUntil(db, keys, now))
      return { error: "throttled", fullName, email: input.email };
    if (!safeEqual(input.code, env.STAFF_BOOTSTRAP_TOKEN)) {
      await recordFailures(db, keys, now);
      return { error: "invalid_code", fullName, email: input.email };
    }

    // Create the Neon Auth account, or sign in if it already exists.
    const signUp = await auth.signUp.email({
      email: input.email,
      password: input.password,
      name: input.fullName,
    });
    let user = signUp.data?.token ? signUp.data.user : null;
    if (!user) {
      const signIn = await auth.signIn.email({ email: input.email, password: input.password });
      if (signIn.error?.code === "EMAIL_NOT_VERIFIED" || (!signUp.error && !signIn.data)) {
        return { error: "verify_email", fullName, email: input.email };
      }
      if (signIn.error || !signIn.data?.user) {
        return {
          error: classify(signIn.error) === "server" ? "server" : "account_error",
          fullName,
          email: input.email,
        };
      }
      user = signIn.data.user;
    }

    try {
      await bootstrapSuperAdmin(db, {
        identity: { authUserId: user.id, email: user.email ?? input.email },
        fullName: input.fullName,
        now,
      });
    } catch (error) {
      await auth.signOut();
      if (error instanceof BootstrapUnavailableError) return { error: "closed" };
      throw error;
    }
  } catch {
    return { error: "server", fullName, email: input.email };
  }
  redirect(localizedPath(locale, "/admin"));
}

export type ProfileNameState = { error?: "invalid_input" | "server"; fullName?: string };

/** The signed-in staff member corrects their own display name (re-verified server-side). */
export async function updateOwnNameAction(
  _previous: ProfileNameState,
  formData: FormData,
): Promise<ProfileNameState> {
  const locale = formLocale(formData);
  const fullName = String(formData.get("fullName") ?? "").slice(0, 200);
  let access;
  try {
    access = await authorizeStaffAction();
  } catch {
    redirect(localizedPath(locale, "/staff/login?reason=expired"));
  }
  const name = normalizeStaffName(fullName);
  if (!name) return { error: "invalid_input", fullName };
  try {
    await updateOwnName(getDb(), access, name);
  } catch {
    return { error: "server", fullName };
  }
  redirect(localizedPath(locale, "/admin?name=saved"));
}
