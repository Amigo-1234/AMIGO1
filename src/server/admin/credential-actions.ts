"use server";

import { redirect } from "next/navigation";
import { isUuid, parseReason } from "@/domain/admin-input";
import { getDb } from "@/db/client";
import { localizedPath } from "@/i18n/paths";
import { getServerEnv } from "@/lib/env";
import { AuthorizationError } from "../staff-auth/access";
import { authorizeStaffAction } from "../staff-auth/current";
import { StaffAuthenticationError } from "../staff-auth/state";
import { type AdminFormState, formLocale, runAdminAction } from "./action-support";
import { AdminRuleError } from "./common";
import { issueStudentPin, revokeStudentAccess } from "./credentials";

/**
 * Portal access actions (`student_credentials.reset`). The issued PIN is returned in this
 * action's response only, so the browser can show it once; it is never stored, logged or
 * put in a URL, and the form clears it as soon as the page is left.
 */

export type IssuePinState = AdminFormState & { pin?: string; reset?: boolean };

export async function issuePinAction(
  _previous: IssuePinState,
  formData: FormData,
): Promise<IssuePinState> {
  const locale = formLocale(formData);
  let actor;
  try {
    actor = await authorizeStaffAction("student_credentials.reset");
  } catch (error) {
    if (error instanceof StaffAuthenticationError)
      redirect(localizedPath(locale, "/staff/login?reason=expired"));
    return { error: error instanceof AuthorizationError ? "forbidden" : "server" };
  }
  const studentId = formData.get("studentId");
  if (!isUuid(studentId)) return { error: "not_found" };
  if (formData.get("confirm") !== "on")
    return { error: "invalid", fieldErrors: { confirm: "required" } };
  const authSecret = getServerEnv().STUDENT_AUTH_SECRET;
  if (!authSecret) return { error: "server" };
  try {
    return await issueStudentPin(getDb(), actor, { studentId, authSecret });
  } catch (error) {
    if (error instanceof AdminRuleError) return { error: error.code };
    if (error instanceof AuthorizationError) return { error: "forbidden" };
    console.error("PIN issue failed:", error instanceof Error ? error.name : "unknown");
    return { error: "server" };
  }
}

export async function revokeAccessAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "student_credentials.reset", async ({ db, actor, values }) => {
    if (!isUuid(values.studentId)) return { error: "not_found" };
    const parsed = parseReason(values);
    if (!parsed.ok) return { error: "invalid", fieldErrors: parsed.errors };
    await revokeStudentAccess(db, actor, {
      studentId: values.studentId,
      reason: parsed.data.reason,
    });
    return `/admin/students/${values.studentId}?done=access_revoked`;
  });
}
