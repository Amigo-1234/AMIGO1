/**
 * Academic sessions and terms: allowed status changes and date rules.
 *
 * Sessions: planned → active → closed. At most one session is active (also enforced by
 * the database). A session can be closed only when none of its enrollments is still
 * active: ending enrollments is the job of promotion processing (a later phase), so a
 * session in use stays open until then.
 *
 * Terms: planned → active → closed, only inside the active session. At most one term is
 * active; activating a term closes the term that was active before it.
 */
export type SessionStatus = "planned" | "active" | "closed" | "archived";
export type TermStatus = "planned" | "active" | "closed";

export const MIN_START_YEAR = 2000;
export const MAX_START_YEAR = 2200;

export function canActivateSession(status: SessionStatus): boolean {
  return status === "planned";
}

export function canCloseSession(status: SessionStatus, activeEnrollments: number): boolean {
  return status === "active" && activeEnrollments === 0;
}

/** Students may be placed in planned (upcoming) and active sessions, never closed ones. */
export function sessionAcceptsEnrollment(status: SessionStatus): boolean {
  return status === "planned" || status === "active";
}

export function canActivateTerm(term: TermStatus, session: SessionStatus): boolean {
  return term === "planned" && session === "active";
}

export function canCloseTerm(term: TermStatus): boolean {
  return term === "active";
}

/** ISO calendar dates (YYYY-MM-DD) compare correctly as strings. */
export type DateRange = { startsOn: string | null; endsOn: string | null };

export function isValidRange({ startsOn, endsOn }: DateRange): boolean {
  return !startsOn || !endsOn || endsOn > startsOn;
}

/** A term's dates must be in order and, where the session has dates, inside them. */
export function termFitsSession(term: DateRange, session: DateRange): boolean {
  if (!isValidRange(term)) return false;
  if (session.startsOn && term.startsOn && term.startsOn < session.startsOn) return false;
  if (session.endsOn && term.endsOn && term.endsOn > session.endsOn) return false;
  return true;
}
