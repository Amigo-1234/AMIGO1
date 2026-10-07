/**
 * Student lifecycle: which status changes staff may make by hand, and what they imply.
 *
 * - `graduated` is reached only through promotion processing (a later phase), never by hand.
 * - Archiving keeps the record (rows are never deleted); restoring returns the student to
 *   the status they had before archiving.
 * - Leaving the school (withdrawn, archived) ends the active enrollment as `withdrawn`.
 *   Suspension is temporary, so the enrollment stays active. Coming back (readmission or
 *   restore) reopens that enrollment if its session is still open.
 */
export const STUDENT_STATUSES = [
  "active",
  "suspended",
  "withdrawn",
  "graduated",
  "archived",
] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

const MANUAL_TRANSITIONS: Record<StudentStatus, readonly StudentStatus[]> = {
  active: ["suspended", "withdrawn", "archived"],
  suspended: ["active", "withdrawn", "archived"],
  withdrawn: ["active", "archived"],
  graduated: ["archived"],
  // Restoring is handled by restoreTarget(): back to the pre-archive status.
  archived: [],
};

export function isStudentStatus(value: unknown): value is StudentStatus {
  return typeof value === "string" && (STUDENT_STATUSES as readonly string[]).includes(value);
}

/** Status changes staff may choose for a student currently in `from`. */
export function allowedStatusChanges(from: StudentStatus): readonly StudentStatus[] {
  return MANUAL_TRANSITIONS[from];
}

export function canChangeStatus(from: StudentStatus, to: StudentStatus): boolean {
  return MANUAL_TRANSITIONS[from].includes(to);
}

/**
 * Where an archived student returns to: the status recorded when they were archived.
 * Unknown history (e.g. imported as archived) restores to `withdrawn`, the safe choice:
 * they can then be readmitted explicitly.
 */
export function restoreTarget(statusBeforeArchive: string | null | undefined): StudentStatus {
  return isStudentStatus(statusBeforeArchive) && statusBeforeArchive !== "archived"
    ? statusBeforeArchive
    : "withdrawn";
}

/** Whether moving to `to` ends the student's active enrollment (as `withdrawn`). */
export function endsActiveEnrollment(to: StudentStatus): boolean {
  return to === "withdrawn" || to === "archived";
}

/**
 * Whether returning to `to` from `from` reopens the class placement the student left. A
 * student who leaves and comes back within the same session returns to their place in that
 * session (one enrollment per student per session), provided the session is still open.
 */
export function reopensEnrollment(from: StudentStatus, to: StudentStatus): boolean {
  return (from === "withdrawn" || from === "archived") && (to === "active" || to === "suspended");
}

/** Only students currently at school can be placed in a class. */
export function canBeEnrolled(status: StudentStatus): boolean {
  return status === "active";
}

/** Visual tone for a status badge (meaning is always also in the text). */
export function statusTone(
  status: StudentStatus,
): "success" | "warning" | "danger" | "neutral" | "accent" {
  switch (status) {
    case "active":
      return "success";
    case "graduated":
      return "accent";
    case "suspended":
      return "warning";
    case "withdrawn":
      return "danger";
    default:
      return "neutral";
  }
}
