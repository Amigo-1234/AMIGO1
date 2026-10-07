import "server-only";
import { notFound } from "next/navigation";
import { isUuid } from "@/domain/admin-input";
import type { Permission } from "@/domain/permissions";
import { getDb } from "@/db/client";
import { getDictionary } from "@/i18n/server";
import { requireStaffPermission } from "../staff-auth/current";
import { getStudentProfile } from "./queries";

/** Shared start of every student sub-page: locale, permission check, and the student. */
export async function loadStudentPage(rawId: string, permission: Permission) {
  const { locale, t } = await getDictionary();
  const access = await requireStaffPermission(locale, permission);
  if (!isUuid(rawId)) notFound();
  const db = getDb();
  const profile = await getStudentProfile(db, rawId);
  if (!profile) notFound();
  return { locale, t, access, db, profile };
}
