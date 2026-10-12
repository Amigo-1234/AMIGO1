import type { DbExecutor } from "@/db/types";
import type { StaffAccess } from "../staff-auth/access";
import { requirePermissions } from "../admin/common";
import { classResults, studentSheets, subjectRoster, termOverview } from "./queries";

/**
 * Entry points for reading results. Staff reads require `results.read` here, at the data
 * layer, in addition to the page check. Students read only through `publishedSheetsFor`,
 * which takes the student from their verified session, never from a URL.
 */
export function readTermOverview(db: DbExecutor, actor: StaffAccess, termId: string) {
  requirePermissions(actor, "results.read");
  return termOverview(db, termId);
}

export function readClassResults(
  db: DbExecutor,
  actor: StaffAccess,
  termId: string,
  levelId: string,
) {
  requirePermissions(actor, "results.read");
  return classResults(db, termId, levelId);
}

export function readSubjectRoster(
  db: DbExecutor,
  actor: StaffAccess,
  termId: string,
  levelId: string,
  subjectId: string,
) {
  requirePermissions(actor, "results.read");
  return subjectRoster(db, termId, levelId, subjectId);
}

/** Every sheet of a student (drafts included), for staff. */
export function readStudentSheets(db: DbExecutor, actor: StaffAccess, studentId: string) {
  requirePermissions(actor, "results.read");
  return studentSheets(db, studentId, { visibleToStudent: false });
}

/** What a signed-in student may see: their own finalized sheets in published classes. */
export function publishedSheetsFor(db: DbExecutor, session: { student: { id: string } }) {
  return studentSheets(db, session.student.id, { visibleToStudent: true });
}
