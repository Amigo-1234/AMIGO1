import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  type DateRange,
  canActivateSession,
  canActivateTerm,
  canCloseSession,
  canCloseTerm,
  isValidRange,
  termFitsSession,
} from "@/domain/academic-calendar";
import type { SessionInput } from "@/domain/admin-input";
import { academicSessions, enrollments, gradingPolicies, termTypes, terms } from "@/db/schema";
import type { DbExecutor } from "@/db/types";
import { recordAudit } from "../audit";
import type { StaffAccess } from "../staff-auth/access";
import { AdminRuleError, diff, inStaffTransaction, requirePermissions, staffActor } from "./common";

/**
 * Academic sessions and terms. A new session gets the regular terms (First, Second,
 * Third; never the Legacy term, which exists only for imported V1 results) and uses the
 * default grading policy, which locks once the session is activated (database trigger).
 */
export async function createSession(
  db: DbExecutor,
  actor: StaffAccess,
  input: SessionInput,
): Promise<{ id: string; label: string }> {
  requirePermissions(actor, "sessions.manage");
  if (!isValidRange(input)) throw new AdminRuleError("dates_outside_session");
  return inStaffTransaction(db, actor, async (tx) => {
    const [duplicate] = await tx
      .select({ id: academicSessions.id })
      .from(academicSessions)
      .where(eq(academicSessions.startYear, input.startYear));
    if (duplicate) throw new AdminRuleError("duplicate_session");
    const [policy] = await tx
      .select({ id: gradingPolicies.id })
      .from(gradingPolicies)
      .where(eq(gradingPolicies.isDefault, true));
    if (!policy) throw new Error("No default grading policy; run the database seed.");

    const [session] = await tx
      .insert(academicSessions)
      .values({ ...input, gradingPolicyId: policy.id, createdById: actor.staffId })
      .returning({ id: academicSessions.id, label: academicSessions.label });
    const regular = await tx
      .select({ code: termTypes.code })
      .from(termTypes)
      .where(eq(termTypes.isLegacy, false))
      .orderBy(asc(termTypes.sequence));
    await tx
      .insert(terms)
      .values(regular.map((t) => ({ sessionId: session.id, termTypeCode: t.code })));
    await recordAudit(tx, {
      actor: staffActor(actor),
      action: "session.created",
      targetType: "academic_session",
      targetId: session.id,
      metadata: { label: session.label, ...input, terms: regular.map((t) => t.code) },
    });
    return session;
  });
}

async function lockSession(tx: DbExecutor, sessionId: string) {
  const [session] = await tx
    .select()
    .from(academicSessions)
    .where(eq(academicSessions.id, sessionId))
    .for("update");
  if (!session) throw new AdminRuleError("not_found");
  return session;
}

export async function updateSessionDates(
  db: DbExecutor,
  actor: StaffAccess,
  input: { sessionId: string } & DateRange,
): Promise<"updated" | "unchanged"> {
  requirePermissions(actor, "sessions.manage");
  return inStaffTransaction(db, actor, async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    if (session.status === "closed" || session.status === "archived")
      throw new AdminRuleError("session_closed");
    const range = { startsOn: input.startsOn, endsOn: input.endsOn };
    if (!isValidRange(range)) throw new AdminRuleError("dates_outside_session");
    const sessionTerms = await tx
      .select({ startsOn: terms.startsOn, endsOn: terms.endsOn })
      .from(terms)
      .where(eq(terms.sessionId, session.id));
    if (!sessionTerms.every((t) => termFitsSession(t, range)))
      throw new AdminRuleError("dates_outside_session");

    const changes = diff(session, range);
    if (!Object.keys(changes).length) return "unchanged";
    await tx.update(academicSessions).set(range).where(eq(academicSessions.id, session.id));
    await recordAudit(tx, {
      actor: staffActor(actor),
      action: "session.updated",
      targetType: "academic_session",
      targetId: session.id,
      metadata: { label: session.label, changes },
    });
    return "updated";
  });
}

/** Make a planned session the current one. Only one session can be active. */
export async function activateSession(db: DbExecutor, actor: StaffAccess, sessionId: string) {
  requirePermissions(actor, "sessions.manage");
  await inStaffTransaction(db, actor, async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!canActivateSession(session.status)) throw new AdminRuleError("session_not_planned");
    const [other] = await tx
      .select({ id: academicSessions.id })
      .from(academicSessions)
      .where(and(eq(academicSessions.status, "active"), ne(academicSessions.id, session.id)));
    if (other) throw new AdminRuleError("another_session_active");
    await tx
      .update(academicSessions)
      .set({ status: "active", activatedAt: new Date() })
      .where(eq(academicSessions.id, session.id));
    await recordAudit(tx, {
      actor: staffActor(actor),
      action: "session.activated",
      targetType: "academic_session",
      targetId: session.id,
      metadata: { label: session.label },
    });
  });
}

/**
 * Close the current session. Refused while any of its enrollments is still active: each
 * must first be promoted, repeated, graduated or withdrawn. Its active term is closed too.
 */
export async function closeSession(db: DbExecutor, actor: StaffAccess, sessionId: string) {
  requirePermissions(actor, "sessions.manage");
  await inStaffTransaction(db, actor, async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (session.status !== "active") throw new AdminRuleError("session_not_active");
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(and(eq(enrollments.sessionId, session.id), eq(enrollments.status, "active")));
    if (!canCloseSession(session.status, count))
      throw new AdminRuleError("session_has_active_enrollments");
    const closedTerms = await tx
      .update(terms)
      .set({ status: "closed" })
      .where(and(eq(terms.sessionId, session.id), eq(terms.status, "active")))
      .returning({ code: terms.termTypeCode });
    await tx
      .update(academicSessions)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(academicSessions.id, session.id));
    await recordAudit(tx, {
      actor: staffActor(actor),
      action: "session.closed",
      targetType: "academic_session",
      targetId: session.id,
      metadata: { label: session.label, closedTerms: closedTerms.map((t) => t.code) },
    });
  });
}

async function lockTerm(tx: DbExecutor, termId: string) {
  const [term] = await tx
    .select({
      id: terms.id,
      status: terms.status,
      code: terms.termTypeCode,
      startsOn: terms.startsOn,
      endsOn: terms.endsOn,
      sessionId: terms.sessionId,
      sessionStatus: academicSessions.status,
      sessionLabel: academicSessions.label,
      sessionStartsOn: academicSessions.startsOn,
      sessionEndsOn: academicSessions.endsOn,
    })
    .from(terms)
    .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
    .where(eq(terms.id, termId))
    .for("update", { of: terms });
  if (!term) throw new AdminRuleError("not_found");
  return term;
}

/** Make a term current; the previously active term (if any) is closed in the same step. */
export async function activateTerm(db: DbExecutor, actor: StaffAccess, termId: string) {
  requirePermissions(actor, "sessions.manage");
  await inStaffTransaction(db, actor, async (tx) => {
    const term = await lockTerm(tx, termId);
    if (term.sessionStatus !== "active") throw new AdminRuleError("session_not_active");
    if (!canActivateTerm(term.status, term.sessionStatus))
      throw new AdminRuleError("term_not_planned");
    const closed = await tx
      .update(terms)
      .set({ status: "closed" })
      .where(and(eq(terms.status, "active"), ne(terms.id, term.id)))
      .returning({ id: terms.id, code: terms.termTypeCode });
    await tx.update(terms).set({ status: "active" }).where(eq(terms.id, term.id));
    await recordAudit(tx, {
      actor: staffActor(actor),
      action: "term.activated",
      targetType: "term",
      targetId: term.id,
      metadata: { session: term.sessionLabel, term: term.code, closed: closed.map((t) => t.code) },
    });
  });
}

export async function closeTerm(db: DbExecutor, actor: StaffAccess, termId: string) {
  requirePermissions(actor, "sessions.manage");
  await inStaffTransaction(db, actor, async (tx) => {
    const term = await lockTerm(tx, termId);
    if (!canCloseTerm(term.status)) throw new AdminRuleError("term_not_active");
    await tx.update(terms).set({ status: "closed" }).where(eq(terms.id, term.id));
    await recordAudit(tx, {
      actor: staffActor(actor),
      action: "term.closed",
      targetType: "term",
      targetId: term.id,
      metadata: { session: term.sessionLabel, term: term.code },
    });
  });
}

export async function updateTermDates(
  db: DbExecutor,
  actor: StaffAccess,
  input: { termId: string } & DateRange,
): Promise<"updated" | "unchanged"> {
  requirePermissions(actor, "sessions.manage");
  return inStaffTransaction(db, actor, async (tx) => {
    const term = await lockTerm(tx, input.termId);
    if (term.sessionStatus === "closed" || term.sessionStatus === "archived")
      throw new AdminRuleError("session_closed");
    const range = { startsOn: input.startsOn, endsOn: input.endsOn };
    if (!termFitsSession(range, { startsOn: term.sessionStartsOn, endsOn: term.sessionEndsOn }))
      throw new AdminRuleError("dates_outside_session");
    const changes = diff(term, range);
    if (!Object.keys(changes).length) return "unchanged";
    await tx.update(terms).set(range).where(eq(terms.id, term.id));
    await recordAudit(tx, {
      actor: staffActor(actor),
      action: "term.updated",
      targetType: "term",
      targetId: term.id,
      metadata: { session: term.sessionLabel, term: term.code, changes },
    });
    return "updated";
  });
}
