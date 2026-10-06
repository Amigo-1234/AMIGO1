import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import type { Locale } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import { type StudentSession, findStudentSession } from "./sessions";

/**
 * The student session cookie. `__Host-` in production pins it to this exact host, HTTPS
 * and path `/`. HttpOnly keeps it away from JavaScript; SameSite=Lax blocks it on
 * cross-site POSTs. The value is an opaque random token (its hash is in the database).
 */
const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-mig_student" : "mig_student";

export async function readStudentToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_NAME)?.value;
}

export async function setStudentCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearStudentCookie(): Promise<void> {
  (await cookies()).delete({ name: COOKIE_NAME, path: "/" });
}

export const STUDENT_COOKIE_NAMES = ["__Host-mig_student", "mig_student"] as const;

/** The current student session, looked up once per request. */
export const getCurrentStudent = cache(async (): Promise<StudentSession | null> => {
  const token = await readStudentToken();
  if (!token) return null;
  return findStudentSession(getDb(), token, new Date());
});

/**
 * For portal pages: the signed-in student, or a redirect to the localized sign-in page.
 * A session created by a legacy V1 password may only reach the "set a new PIN" page.
 */
export async function requireStudent(
  locale: Locale,
  { pinSetup = false }: { pinSetup?: boolean } = {},
): Promise<StudentSession> {
  const session = await getCurrentStudent();
  if (!session) {
    const hadCookie = !!(await readStudentToken());
    redirect(localizedPath(locale, `/portal/login${hadCookie ? "?reason=expired" : ""}`));
  }
  if (session.mustSetPin && !pinSetup) redirect(localizedPath(locale, "/portal/set-pin"));
  if (!session.mustSetPin && pinSetup) redirect(localizedPath(locale, "/portal"));
  return session;
}
