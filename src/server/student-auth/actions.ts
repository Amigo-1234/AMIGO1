"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { isLocale, type Locale } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import { getServerEnv } from "@/lib/env";
import { getClientAddress, getUserAgent } from "../request";
import { clearStudentCookie, readStudentToken, setStudentCookie } from "./current";
import { completeLegacyPinMigration, signInStudent } from "./service";
import { revokeStudentSession } from "./sessions";

/*
 * Server Actions for the student / parent portal. Next.js only accepts them as same-origin
 * POSTs (it compares Origin with Host), and the session cookie is SameSite=Lax, which
 * together protect against cross-site request forgery. Results carry coarse error codes
 * only; the browser never receives hashes, tokens or account details.
 */

export type StudentSignInState = {
  error?:
    | "invalid_input"
    | "invalid_credentials"
    | "throttled"
    | "unavailable"
    | "not_configured"
    | "server";
  studentId?: string;
};

function formLocale(formData: FormData): Locale {
  const value = formData.get("locale");
  return typeof value === "string" && isLocale(value) ? value : "en";
}

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, 200) : "";
};

export async function studentSignInAction(
  _previous: StudentSignInState,
  formData: FormData,
): Promise<StudentSignInState> {
  const locale = formLocale(formData);
  const studentId = field(formData, "studentId");
  const authSecret = getServerEnv().STUDENT_AUTH_SECRET;
  if (!authSecret) return { error: "not_configured", studentId };

  let destination: string;
  try {
    const result = await signInStudent(getDb(), {
      studentId,
      secret: field(formData, "pin"),
      authSecret,
      now: new Date(),
      ipAddress: await getClientAddress(),
      userAgent: await getUserAgent(),
    });
    if (result.status !== "ok") return { error: result.status, studentId };
    await setStudentCookie(result.token, result.expiresAt);
    destination = localizedPath(locale, result.mustSetPin ? "/portal/set-pin" : "/portal");
  } catch {
    return { error: "server", studentId };
  }
  redirect(destination);
}

export type SetPinState = {
  error?: "invalid_pin" | "mismatch" | "session_invalid" | "not_configured" | "server";
};

export async function setNewPinAction(
  _previous: SetPinState,
  formData: FormData,
): Promise<SetPinState> {
  const locale = formLocale(formData);
  const authSecret = getServerEnv().STUDENT_AUTH_SECRET;
  if (!authSecret) return { error: "not_configured" };

  try {
    const result = await completeLegacyPinMigration(getDb(), {
      token: await readStudentToken(),
      newPin: field(formData, "newPin"),
      confirmPin: field(formData, "confirmPin"),
      authSecret,
      now: new Date(),
    });
    if (result.status !== "ok") return { error: result.status };
    await setStudentCookie(result.token, result.expiresAt);
  } catch {
    return { error: "server" };
  }
  redirect(localizedPath(locale, "/portal?pin=saved"));
}

export async function studentSignOutAction(formData: FormData): Promise<void> {
  const locale = formLocale(formData);
  try {
    await revokeStudentSession(getDb(), await readStudentToken(), new Date());
  } finally {
    await clearStudentCookie();
  }
  redirect(localizedPath(locale, "/portal/login?reason=signed_out"));
}
