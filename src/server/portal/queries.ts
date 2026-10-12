import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  academicSessions,
  enrollments,
  guardians,
  levels,
  studentGuardians,
  studentIdentifiers,
  students,
  termTypes,
  terms,
} from "@/db/schema";
import type { DbExecutor } from "@/db/types";
import { publishedSheetsFor } from "../results/read";

/**
 * Read models for the student portal. Every query takes the student from the verified
 * session (`session.student.id`), never from a URL or form, and selects only what a
 * student may see: no staff notes, no audit data, no credentials.
 */
type PortalSession = { student: { id: string } };

export async function portalProfile(db: DbExecutor, session: PortalSession) {
  const studentId = session.student.id;
  const [student] = await db
    .select({
      publicId: students.publicId,
      fullName: students.fullName,
      status: students.status,
      gender: students.gender,
      dateOfBirth: students.dateOfBirth,
      phone: students.phone,
      address: students.address,
      admittedOn: students.admittedOn,
    })
    .from(students)
    .where(eq(students.id, studentId));
  if (!student) return null;

  const identifiers = await db
    .select({ value: studentIdentifiers.value, isPrimary: studentIdentifiers.isPrimary })
    .from(studentIdentifiers)
    .where(eq(studentIdentifiers.studentId, studentId))
    .orderBy(desc(studentIdentifiers.isPrimary), asc(studentIdentifiers.createdAt));

  const history = await db
    .select({
      id: enrollments.id,
      status: enrollments.status,
      enrolledOn: enrollments.enrolledOn,
      endedOn: enrollments.endedOn,
      sessionId: academicSessions.id,
      sessionLabel: academicSessions.label,
      sessionStatus: academicSessions.status,
      levelCode: levels.code,
      levelNameEn: levels.nameEn,
      levelNameAr: levels.nameAr,
    })
    .from(enrollments)
    .innerJoin(academicSessions, eq(academicSessions.id, enrollments.sessionId))
    .innerJoin(levels, eq(levels.id, enrollments.levelId))
    .where(eq(enrollments.studentId, studentId))
    .orderBy(desc(academicSessions.startYear));

  const current = history.find((e) => e.status === "active") ?? null;
  const [currentTerm] = current
    ? await db
        .select({ nameEn: termTypes.nameEn, nameAr: termTypes.nameAr })
        .from(terms)
        .innerJoin(termTypes, eq(termTypes.code, terms.termTypeCode))
        .where(and(eq(terms.sessionId, current.sessionId), eq(terms.status, "active")))
    : [];

  const family = await db
    .select({
      id: guardians.id,
      fullName: guardians.fullName,
      phone: guardians.phone,
      email: guardians.email,
      relationship: studentGuardians.relationship,
      isPrimaryContact: studentGuardians.isPrimaryContact,
    })
    .from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .where(eq(studentGuardians.studentId, studentId))
    .orderBy(desc(studentGuardians.isPrimaryContact), asc(guardians.fullName));

  return {
    student,
    identifiers,
    history,
    current,
    currentTerm: currentTerm ?? null,
    guardians: family,
  };
}

/** The student's own published sheets (finalized, both publication switches on). */
export function portalResults(db: DbExecutor, session: PortalSession) {
  return publishedSheetsFor(db, session);
}
