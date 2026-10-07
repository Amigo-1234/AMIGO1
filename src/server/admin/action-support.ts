import "server-only";
import { redirect } from "next/navigation";
import type { FieldErrors } from "@/domain/admin-input";
import type { Permission } from "@/domain/permissions";
import { getDb } from "@/db/client";
import type { DbExecutor } from "@/db/types";
import { isLocale, type Locale } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import { AuthorizationError, type StaffAccess } from "../staff-auth/access";
import { authorizeStaffAction } from "../staff-auth/current";
import { StaffAuthenticationError } from "../staff-auth/state";
import { AdminRuleError } from "./common";

/** What an admin form shows after a refused submission. Never contains secrets. */
export type AdminFormState = {
  /** A translated message key: an AdminErrorCode, "forbidden", "invalid" or "server". */
  error?: string;
  fieldErrors?: FieldErrors;
  /** The submitted text values, to refill the form. */
  values?: Record<string, string>;
};

export function formLocale(formData: FormData): Locale {
  const value = formData.get("locale");
  return typeof value === "string" && isLocale(value) ? value : "en";
}

/** Plain text fields of a form (files and the framework's own fields are ignored). */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) values[key] = value.slice(0, 2000);
  }
  return values;
}

/**
 * The common shape of every admin Server Action:
 * 1. re-verify the staff session and the specific permission on the server (signed-out
 *    callers go to sign-in; missing permission is refused),
 * 2. run the work, translating business-rule refusals into a message key,
 * 3. on success, redirect to `success` (outside the try, as Next.js requires).
 */
export async function runAdminAction(
  formData: FormData,
  permission: Permission,
  work: (ctx: {
    db: DbExecutor;
    actor: StaffAccess;
    values: Record<string, string>;
  }) => Promise<AdminFormState | string>,
): Promise<AdminFormState> {
  const locale = formLocale(formData);
  const values = formValues(formData);

  let actor: StaffAccess;
  try {
    actor = await authorizeStaffAction(permission);
  } catch (error) {
    if (error instanceof StaffAuthenticationError)
      redirect(localizedPath(locale, "/staff/login?reason=expired"));
    return { error: error instanceof AuthorizationError ? "forbidden" : "server", values };
  }

  let destination: string;
  try {
    const outcome = await work({ db: getDb(), actor, values });
    if (typeof outcome !== "string") return { ...outcome, values };
    destination = outcome;
  } catch (error) {
    if (error instanceof AdminRuleError) return { error: error.code, values };
    if (error instanceof AuthorizationError) return { error: "forbidden", values };
    console.error("Admin action failed:", error instanceof Error ? error.name : "unknown");
    return { error: "server", values };
  }
  redirect(localizedPath(locale, destination));
}
