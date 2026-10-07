import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DIRECTORY_PAGE_SIZE, type DirectoryQuery } from "@/domain/admin-input";
import { normalizeStudentIdInput } from "@/domain/student-id";
import {
  academicSessions,
  auditLogs,
  enrollments,
  guardians,
  levelSubjects,
  levels,
  staffUsers,
  studentCredentials,
  studentGuardians,
  studentIdentifiers,
  studentSessions,
  students,
  termTypes,
  terms,
} from "@/db/schema";
import type { DbExecutor } from "@/db/types";

/**
 * Read models for the admin screens. Callers (pages) check the read permission first.
 * Nothing here returns credential hashes, session tokens or secrets: sign-in state is
 * reduced to facts (has a PIN, when it was set or last used, open sessions).
 */

/** Escape LIKE wildcards in user input. */
const likeSafe = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/* ---------------------------------------------------------------- reference */

export async function listLevels(db: DbExecutor, { activeOnly = false } = {}) {
  return db
    .select({
      id: levels.id,
      code: levels.code,
      nameEn: levels.nameEn,
      nameAr: levels.nameAr,
      stageEn: levels.stageEn,
      stageAr: levels.stageAr,
      sortOrder: levels.sortOrder,
      isActive: levels.isActive,
      nextLevelId: levels.nextLevelId,
    })
    .from(levels)
    .where(activeOnly ? eq(levels.isActive, true) : undefined)
    .orderBy(asc(levels.sortOrder));
}

/** Sessions newest first, with their terms in order. */
export async function listSessions(db: DbExecutor) {
  const sessionRows = await db
    .select()
    .from(academicSessions)
    .orderBy(desc(academicSessions.startYear));
  if (!sessionRows.length) return [];
  const termRows = await db
    .select({
      id: terms.id,
      sessionId: terms.sessionId,
      code: terms.termTypeCode,
      status: terms.status,
      startsOn: terms.startsOn,
      endsOn: terms.endsOn,
      nameEn: termTypes.nameEn,
      nameAr: termTypes.nameAr,
      sequence: termTypes.sequence,
    })
    .from(terms)
    .innerJoin(termTypes, eq(termTypes.code, terms.termTypeCode))
    .where(
      inArray(
        terms.sessionId,
        sessionRows.map((s) => s.id),
      ),
    )
    .orderBy(asc(termTypes.sequence));
  const enrollmentCounts = await db
    .select({
      sessionId: enrollments.sessionId,
      active: sql<number>`count(*) filter (where ${enrollments.status} = 'active')::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(enrollments)
    .groupBy(enrollments.sessionId);
  const countsBySession = new Map(enrollmentCounts.map((c) => [c.sessionId, c]));
  return sessionRows.map((session) => ({
    ...session,
    terms: termRows.filter((t) => t.sessionId === session.id),
    activeEnrollments: countsBySession.get(session.id)?.active ?? 0,
    totalEnrollments: countsBySession.get(session.id)?.total ?? 0,
  }));
}

export type SessionWithTerms = Awaited<ReturnType<typeof listSessions>>[number];

export async function getSession(db: DbExecutor, sessionId: string) {
  return (await listSessions(db)).find((s) => s.id === sessionId) ?? null;
}

/** Sessions students can be placed in (planned or active), current first. */
export async function sessionsAcceptingEnrollment(db: DbExecutor) {
  const rows = await db
    .select({
      id: academicSessions.id,
      label: academicSessions.label,
      status: academicSessions.status,
      startYear: academicSessions.startYear,
    })
    .from(academicSessions)
    .where(inArray(academicSessions.status, ["planned", "active"]))
    .orderBy(desc(academicSessions.startYear));
  return rows.sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));
}

/* ---------------------------------------------------------------- dashboard */

export async function getDashboard(db: DbExecutor) {
  const statusRows = await db
    .select({ status: students.status, count: count() })
    .from(students)
    .groupBy(students.status);
  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, r.count])) as Record<
    string,
    number
  >;
  const total = statusRows.reduce((sum, r) => sum + r.count, 0);

  const [current] = await db
    .select()
    .from(academicSessions)
    .where(eq(academicSessions.status, "active"))
    .limit(1);
  const [upcoming] = current
    ? []
    : await db
        .select()
        .from(academicSessions)
        .where(eq(academicSessions.status, "planned"))
        .orderBy(asc(academicSessions.startYear))
        .limit(1);
  const focus = current ?? upcoming ?? null;

  const [currentTerm] = await db
    .select({
      id: terms.id,
      nameEn: termTypes.nameEn,
      nameAr: termTypes.nameAr,
      sessionId: terms.sessionId,
    })
    .from(terms)
    .innerJoin(termTypes, eq(termTypes.code, terms.termTypeCode))
    .where(eq(terms.status, "active"))
    .limit(1);

  const levelRows = await listLevels(db);
  const levelCounts = focus
    ? await db
        .select({ levelId: enrollments.levelId, count: count() })
        .from(enrollments)
        .where(and(eq(enrollments.sessionId, focus.id), eq(enrollments.status, "active")))
        .groupBy(enrollments.levelId)
    : [];
  const countByLevel = new Map(levelCounts.map((r) => [r.levelId, r.count]));
  const enrolled = levelCounts.reduce((sum, r) => sum + r.count, 0);

  const [{ notEnrolled }] = await db
    .select({
      notEnrolled: sql<number>`count(*)::int`,
    })
    .from(students)
    .where(
      and(
        eq(students.status, "active"),
        sql`not exists (select 1 from ${enrollments} e where e.student_id = ${students.id} and e.status = 'active')`,
      ),
    );

  const recent = await db
    .select({
      id: students.id,
      publicId: students.publicId,
      fullName: students.fullName,
      status: students.status,
      createdAt: students.createdAt,
    })
    .from(students)
    .orderBy(desc(students.createdAt))
    .limit(5);

  return {
    total,
    byStatus,
    session: focus
      ? {
          id: focus.id,
          label: focus.label,
          status: focus.status,
          startsOn: focus.startsOn,
          endsOn: focus.endsOn,
        }
      : null,
    currentTerm: currentTerm ?? null,
    enrolled,
    notEnrolled,
    byLevel: levelRows.map((l) => ({ ...l, count: countByLevel.get(l.id) ?? 0 })),
    recent,
  };
}

/* ---------------------------------------------------------------- directory */

const currentEnrollment = alias(enrollments, "current_enrollment");
const currentLevel = alias(levels, "current_level");
const currentSession = alias(academicSessions, "current_session");

/**
 * One page of the student directory, filtered and searched in the database. Search
 * matches names (contains) and any registered ID or alias (prefix), so an old V1 ID finds
 * the student too. "Level" means the level of the student's active enrollment.
 */
export async function listStudents(db: DbExecutor, query: DirectoryQuery) {
  const conditions: SQL[] = [];
  if (query.status === "current")
    conditions.push(inArray(students.status, ["active", "suspended"]));
  else if (query.status !== "all") conditions.push(eq(students.status, query.status));
  if (query.levelId) conditions.push(eq(currentEnrollment.levelId, query.levelId));
  if (query.q) {
    const name = `%${likeSafe(query.q.toLowerCase())}%`;
    const id = `${likeSafe(normalizeStudentIdInput(query.q))}%`;
    conditions.push(
      or(
        sql`lower(${students.fullName}) like ${name}`,
        sql`exists (select 1 from ${studentIdentifiers} si where si.student_id = ${students.id} and si.value like ${id})`,
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const joinActive = and(
    eq(currentEnrollment.studentId, students.id),
    eq(currentEnrollment.status, "active"),
  );

  const [{ total }] = await db
    .select({ total: count() })
    .from(students)
    .leftJoin(currentEnrollment, joinActive)
    .where(where);
  const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
  const page = Math.min(query.page, pages);

  const rows = await db
    .select({
      id: students.id,
      publicId: students.publicId,
      fullName: students.fullName,
      status: students.status,
      gender: students.gender,
      levelCode: currentLevel.code,
      levelNameEn: currentLevel.nameEn,
      levelNameAr: currentLevel.nameAr,
      sessionLabel: currentSession.label,
    })
    .from(students)
    .leftJoin(currentEnrollment, joinActive)
    .leftJoin(currentLevel, eq(currentLevel.id, currentEnrollment.levelId))
    .leftJoin(currentSession, eq(currentSession.id, currentEnrollment.sessionId))
    .where(where)
    .orderBy(asc(sql`lower(${students.fullName})`), asc(students.publicId))
    .limit(DIRECTORY_PAGE_SIZE)
    .offset((page - 1) * DIRECTORY_PAGE_SIZE);

  return { rows, total, page, pages, pageSize: DIRECTORY_PAGE_SIZE };
}

/* ------------------------------------------------------------------ profile */

export async function getStudentProfile(db: DbExecutor, studentId: string, now = new Date()) {
  const [student] = await db
    .select({
      id: students.id,
      publicId: students.publicId,
      fullName: students.fullName,
      status: students.status,
      gender: students.gender,
      dateOfBirth: students.dateOfBirth,
      phone: students.phone,
      address: students.address,
      notes: students.notes,
      admittedOn: students.admittedOn,
      source: students.source,
      createdAt: students.createdAt,
      updatedAt: students.updatedAt,
      archivedAt: students.archivedAt,
      createdByName: staffUsers.fullName,
    })
    .from(students)
    .leftJoin(staffUsers, eq(staffUsers.id, students.createdById))
    .where(eq(students.id, studentId));
  if (!student) return null;

  const identifiers = await db
    .select({
      value: studentIdentifiers.value,
      isPrimary: studentIdentifiers.isPrimary,
      source: studentIdentifiers.source,
    })
    .from(studentIdentifiers)
    .where(eq(studentIdentifiers.studentId, student.id))
    .orderBy(desc(studentIdentifiers.isPrimary), asc(studentIdentifiers.createdAt));

  const enrollmentRows = await db
    .select({
      id: enrollments.id,
      status: enrollments.status,
      enrolledOn: enrollments.enrolledOn,
      endedOn: enrollments.endedOn,
      source: enrollments.source,
      sessionId: academicSessions.id,
      sessionLabel: academicSessions.label,
      sessionStatus: academicSessions.status,
      levelId: levels.id,
      levelCode: levels.code,
      levelNameEn: levels.nameEn,
      levelNameAr: levels.nameAr,
    })
    .from(enrollments)
    .innerJoin(academicSessions, eq(academicSessions.id, enrollments.sessionId))
    .innerJoin(levels, eq(levels.id, enrollments.levelId))
    .where(eq(enrollments.studentId, student.id))
    .orderBy(desc(academicSessions.startYear));

  const guardianRows = await db
    .select({
      id: guardians.id,
      fullName: guardians.fullName,
      phone: guardians.phone,
      email: guardians.email,
      address: guardians.address,
      notes: guardians.notes,
      relationship: studentGuardians.relationship,
      isPrimaryContact: studentGuardians.isPrimaryContact,
      linkedStudents: sql<number>`(select count(*)::int from ${studentGuardians} sg where sg.guardian_id = ${guardians.id})`,
    })
    .from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .where(eq(studentGuardians.studentId, student.id))
    .orderBy(desc(studentGuardians.isPrimaryContact), asc(guardians.fullName));

  // Sign-in state as facts only: never the hash, never a token.
  const credentials = await db
    .select({
      kind: studentCredentials.kind,
      createdAt: studentCredentials.createdAt,
      lastUsedAt: studentCredentials.lastUsedAt,
    })
    .from(studentCredentials)
    .where(and(eq(studentCredentials.studentId, student.id), isNull(studentCredentials.revokedAt)));
  const [{ openSessions }] = await db
    .select({ openSessions: count() })
    .from(studentSessions)
    .where(
      and(
        eq(studentSessions.studentId, student.id),
        isNull(studentSessions.revokedAt),
        gt(studentSessions.expiresAt, now),
      ),
    );

  return {
    student,
    identifiers,
    enrollments: enrollmentRows,
    activeEnrollment: enrollmentRows.find((e) => e.status === "active") ?? null,
    guardians: guardianRows,
    signIn: {
      pin: credentials.find((c) => c.kind === "pin") ?? null,
      legacy: credentials.find((c) => c.kind === "legacy_v1_password") ?? null,
      openSessions,
    },
  };
}

export type StudentProfile = NonNullable<Awaited<ReturnType<typeof getStudentProfile>>>;

/** Recent audit entries about a student (shown to staff with audit.read). */
export async function studentActivity(db: DbExecutor, studentId: string, limit = 12) {
  return db
    .select({
      id: auditLogs.id,
      occurredAt: auditLogs.occurredAt,
      action: auditLogs.action,
      actorLabel: auditLogs.actorLabel,
      actorName: staffUsers.fullName,
      metadata: auditLogs.metadata,
    })
    .from(auditLogs)
    .leftJoin(staffUsers, eq(staffUsers.id, auditLogs.actorUserId))
    .where(and(eq(auditLogs.targetType, "student"), eq(auditLogs.targetId, studentId)))
    .orderBy(desc(auditLogs.id))
    .limit(limit);
}

export async function getGuardian(db: DbExecutor, guardianId: string) {
  const [guardian] = await db.select().from(guardians).where(eq(guardians.id, guardianId));
  if (!guardian) return null;
  const linked = await db
    .select({
      studentId: students.id,
      publicId: students.publicId,
      fullName: students.fullName,
      relationship: studentGuardians.relationship,
      isPrimaryContact: studentGuardians.isPrimaryContact,
    })
    .from(studentGuardians)
    .innerJoin(students, eq(students.id, studentGuardians.studentId))
    .where(eq(studentGuardians.guardianId, guardian.id))
    .orderBy(asc(students.fullName));
  return { guardian, linked };
}

/** Guardians matching a name, phone or email, for linking an existing guardian. */
export async function searchGuardians(db: DbExecutor, q: string, excludeStudentId?: string) {
  const text = q.trim().slice(0, 80);
  if (text.length < 2) return [];
  const pattern = `%${likeSafe(text)}%`;
  const digits = text.replace(/[^0-9]/g, "");
  return db
    .select({
      id: guardians.id,
      fullName: guardians.fullName,
      phone: guardians.phone,
      email: guardians.email,
      linkedStudents: sql<number>`(select count(*)::int from ${studentGuardians} sg where sg.guardian_id = ${guardians.id})`,
      alreadyLinked: excludeStudentId
        ? sql<boolean>`exists (select 1 from ${studentGuardians} sg where sg.guardian_id = ${guardians.id} and sg.student_id = ${excludeStudentId})`
        : sql<boolean>`false`,
    })
    .from(guardians)
    .where(
      or(
        ilike(guardians.fullName, pattern),
        ilike(guardians.email, pattern),
        digits.length >= 4 ? sql`${guardians.phone} like ${`%${digits}%`}` : undefined,
      ),
    )
    .orderBy(asc(guardians.fullName))
    .limit(10);
}

/** Levels with their curriculum size and current (active session) enrollment. */
export async function levelOverview(db: DbExecutor) {
  const levelRows = await listLevels(db);
  const subjectCounts = await db
    .select({ levelId: levelSubjects.levelId, count: count() })
    .from(levelSubjects)
    .where(eq(levelSubjects.isActive, true))
    .groupBy(levelSubjects.levelId);
  const active = await db
    .select({ levelId: enrollments.levelId, count: count() })
    .from(enrollments)
    .where(eq(enrollments.status, "active"))
    .groupBy(enrollments.levelId);
  const subjects = new Map(subjectCounts.map((r) => [r.levelId, r.count]));
  const enrolled = new Map(active.map((r) => [r.levelId, r.count]));
  const codeById = new Map(levelRows.map((l) => [l.id, l.code]));
  return levelRows.map((l) => ({
    ...l,
    nextLevelCode: l.nextLevelId ? (codeById.get(l.nextLevelId) ?? null) : null,
    subjects: subjects.get(l.id) ?? 0,
    activeEnrollments: enrolled.get(l.id) ?? 0,
  }));
}
