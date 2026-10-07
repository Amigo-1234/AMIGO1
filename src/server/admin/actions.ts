"use server";

import {
  isUuid,
  parseDateRange,
  parseGuardian,
  parseGuardianDetails,
  parseGuardianLink,
  parseReason,
  parseSession,
  parseStudentDetails,
  parseStudentIntake,
} from "@/domain/admin-input";
import { isStudentStatus } from "@/domain/student-lifecycle";
import {
  activateSession,
  activateTerm,
  closeSession,
  closeTerm,
  createSession,
  updateSessionDates,
  updateTermDates,
} from "./academics";
import { type AdminFormState, runAdminAction } from "./action-support";
import { changeEnrollmentLevel, enrollStudent } from "./enrollments";
import {
  addGuardian,
  linkGuardian,
  unlinkGuardian,
  updateGuardian,
  updateGuardianLink,
} from "./guardians";
import {
  changeStudentStatus,
  registerStudent,
  restoreStudent,
  updateStudentDetails,
} from "./students";

/*
 * Admin Server Actions. Each one authenticates the staff member and checks its specific
 * permission on the server (runAdminAction), validates every field on the server, and
 * delegates to a service that checks the permission again and audits the change. Hidden
 * IDs from the browser are validated, never trusted for authorization.
 */

type Values = Record<string, string>;
const studentPath = (id: string, done: string) => `/admin/students/${id}?done=${done}`;
const sessionPath = (id: string, done: string) => `/admin/academics/sessions/${id}?done=${done}`;

function requireId(values: Values, field: string): string | null {
  return isUuid(values[field]) ? values[field] : null;
}

/* ------------------------------------------------------------------- students */

export async function registerStudentAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "students.create", async ({ db, actor, values }) => {
    const parsed = parseStudentIntake(values);
    if (!parsed.ok) return { error: "invalid", fieldErrors: parsed.errors };
    const { id } = await registerStudent(db, actor, parsed.data);
    return studentPath(id, "created");
  });
}

export async function updateStudentAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "students.update", async ({ db, actor, values }) => {
    const studentId = requireId(values, "studentId");
    if (!studentId) return { error: "not_found" };
    const parsed = parseStudentDetails(values);
    if (!parsed.ok) return { error: "invalid", fieldErrors: parsed.errors };
    const outcome = await updateStudentDetails(db, actor, studentId, parsed.data);
    return studentPath(studentId, outcome);
  });
}

export async function changeStatusAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "students.archive", async ({ db, actor, values }) => {
    const studentId = requireId(values, "studentId");
    if (!studentId) return { error: "not_found" };
    const to = values.to;
    const parsed = parseReason(values);
    // Report every problem at once: the choice, the reason and the confirmation.
    if (!isStudentStatus(to) || !parsed.ok)
      return {
        error: "invalid",
        fieldErrors: {
          ...(isStudentStatus(to) ? {} : { to: "required" as const }),
          ...(parsed.ok ? {} : parsed.errors),
        },
      };
    await changeStudentStatus(db, actor, { studentId, to, reason: parsed.data.reason });
    return studentPath(studentId, "status_changed");
  });
}

export async function restoreStudentAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "students.archive", async ({ db, actor, values }) => {
    const studentId = requireId(values, "studentId");
    if (!studentId) return { error: "not_found" };
    const parsed = parseReason(values);
    if (!parsed.ok) return { error: "invalid", fieldErrors: parsed.errors };
    await restoreStudent(db, actor, { studentId, reason: parsed.data.reason });
    return studentPath(studentId, "restored");
  });
}

/* ---------------------------------------------------------------- enrollments */

export async function enrollStudentAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "enrollments.manage", async ({ db, actor, values }) => {
    const studentId = requireId(values, "studentId");
    if (!studentId) return { error: "not_found" };
    const sessionId = requireId(values, "sessionId");
    const levelId = requireId(values, "levelId");
    const dates = parseDateRange({ startsOn: values.enrolledOn });
    if (!sessionId || !levelId || !dates.ok)
      return {
        error: "invalid",
        fieldErrors: {
          ...(sessionId ? {} : { sessionId: "required" as const }),
          ...(levelId ? {} : { levelId: "required" as const }),
          ...(dates.ok ? {} : { enrolledOn: "invalid" as const }),
        },
      };
    await enrollStudent(db, actor, {
      studentId,
      sessionId,
      levelId,
      enrolledOn: dates.data.startsOn,
    });
    return studentPath(studentId, "enrolled");
  });
}

export async function changeLevelAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "enrollments.manage", async ({ db, actor, values }) => {
    const studentId = requireId(values, "studentId");
    const enrollmentId = requireId(values, "enrollmentId");
    if (!studentId || !enrollmentId) return { error: "not_found" };
    const levelId = requireId(values, "levelId");
    const parsed = parseReason(values);
    if (!levelId || !parsed.ok)
      return {
        error: "invalid",
        fieldErrors: {
          ...(parsed.ok ? {} : parsed.errors),
          ...(levelId ? {} : { levelId: "required" as const }),
        },
      };
    await changeEnrollmentLevel(db, actor, { enrollmentId, levelId, reason: parsed.data.reason });
    return studentPath(studentId, "level_changed");
  });
}

/* ------------------------------------------------------------------ guardians */

export async function addGuardianAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "students.update", async ({ db, actor, values }) => {
    const studentId = requireId(values, "studentId");
    if (!studentId) return { error: "not_found" };
    const parsed = parseGuardian(values);
    if (!parsed.ok) return { error: "invalid", fieldErrors: parsed.errors };
    const { reused } = await addGuardian(db, actor, studentId, parsed.data);
    return studentPath(studentId, reused ? "guardian_reused" : "guardian_added");
  });
}

export async function linkGuardianAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "students.update", async ({ db, actor, values }) => {
    const studentId = requireId(values, "studentId");
    const guardianId = requireId(values, "guardianId");
    if (!studentId || !guardianId) return { error: "not_found" };
    const parsed = parseGuardianLink(values);
    if (!parsed.ok) return { error: "invalid", fieldErrors: parsed.errors };
    await linkGuardian(db, actor, { studentId, guardianId, link: parsed.data });
    return studentPath(studentId, "guardian_linked");
  });
}

/** Saves a guardian's shared details and this student's link (relationship, primary). */
export async function updateGuardianAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "students.update", async ({ db, actor, values }) => {
    const studentId = requireId(values, "studentId");
    const guardianId = requireId(values, "guardianId");
    if (!studentId || !guardianId) return { error: "not_found" };
    const details = parseGuardianDetails(values);
    const link = parseGuardianLink(values);
    if (!details.ok || !link.ok)
      return {
        error: "invalid",
        fieldErrors: { ...(details.ok ? {} : details.errors), ...(link.ok ? {} : link.errors) },
      };
    // Both changes commit together (the inner transactions become savepoints).
    const changed = await db.transaction(async (tx) => {
      const a = await updateGuardian(tx, actor, guardianId, details.data);
      const b = await updateGuardianLink(tx, actor, { studentId, guardianId, link: link.data });
      return a === "updated" || b === "updated";
    });
    return studentPath(studentId, changed ? "guardian_updated" : "unchanged");
  });
}

export async function unlinkGuardianAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "students.update", async ({ db, actor, values }) => {
    const studentId = requireId(values, "studentId");
    const guardianId = requireId(values, "guardianId");
    if (!studentId || !guardianId) return { error: "not_found" };
    const parsed = parseReason(values);
    if (!parsed.ok) return { error: "invalid", fieldErrors: parsed.errors };
    await unlinkGuardian(db, actor, { studentId, guardianId, reason: parsed.data.reason });
    return studentPath(studentId, "guardian_unlinked");
  });
}

/* --------------------------------------------------------- sessions and terms */

export async function createSessionAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "sessions.manage", async ({ db, actor, values }) => {
    const parsed = parseSession(values);
    if (!parsed.ok) return { error: "invalid", fieldErrors: parsed.errors };
    const { id } = await createSession(db, actor, parsed.data);
    return sessionPath(id, "session_created");
  });
}

export async function updateSessionDatesAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "sessions.manage", async ({ db, actor, values }) => {
    const sessionId = requireId(values, "sessionId");
    if (!sessionId) return { error: "not_found" };
    const parsed = parseDateRange(values);
    if (!parsed.ok) return { error: "invalid", fieldErrors: parsed.errors };
    const outcome = await updateSessionDates(db, actor, { sessionId, ...parsed.data });
    return sessionPath(sessionId, outcome === "updated" ? "session_updated" : "unchanged");
  });
}

export async function updateTermDatesAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "sessions.manage", async ({ db, actor, values }) => {
    const sessionId = requireId(values, "sessionId");
    const termId = requireId(values, "termId");
    if (!sessionId || !termId) return { error: "not_found" };
    const parsed = parseDateRange(values);
    if (!parsed.ok) return { error: "invalid", fieldErrors: parsed.errors };
    const outcome = await updateTermDates(db, actor, { termId, ...parsed.data });
    return sessionPath(sessionId, outcome === "updated" ? "term_updated" : "unchanged");
  });
}

/** Activate or close a session or term. Each requires an explicit confirmation tick. */
export async function calendarTransitionAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "sessions.manage", async ({ db, actor, values }) => {
    const sessionId = requireId(values, "sessionId");
    if (!sessionId) return { error: "not_found" };
    if (values.confirm !== "on") return { error: "invalid", fieldErrors: { confirm: "required" } };
    const termId = requireId(values, "termId");
    switch (values.transition) {
      case "activate_session":
        await activateSession(db, actor, sessionId);
        return sessionPath(sessionId, "session_activated");
      case "close_session":
        await closeSession(db, actor, sessionId);
        return sessionPath(sessionId, "session_closed");
      case "activate_term":
        if (!termId) return { error: "not_found" };
        await activateTerm(db, actor, termId);
        return sessionPath(sessionId, "term_activated");
      case "close_term":
        if (!termId) return { error: "not_found" };
        await closeTerm(db, actor, termId);
        return sessionPath(sessionId, "term_closed");
      default:
        return { error: "invalid" };
    }
  });
}
