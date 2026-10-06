import { eq } from "drizzle-orm";
import { parseStudentId } from "@/domain/student-id";
import {
  academicSessions,
  enrollments,
  gradingPolicies,
  levels,
  staffUsers,
  studentIdentifiers,
  students,
  terms,
} from "../schema";
import type { DbExecutor } from "../types";

let counter = 0;
const unique = () => ++counter;

export async function createStaff(db: DbExecutor) {
  const n = unique();
  const [row] = await db
    .insert(staffUsers)
    .values({ email: `staff${n}@example.org`, fullName: `Staff ${n}`, status: "active" })
    .returning();
  return row;
}

export async function levelId(db: DbExecutor, code: string) {
  const [row] = await db.select({ id: levels.id }).from(levels).where(eq(levels.code, code));
  return row.id;
}

export async function defaultPolicyId(db: DbExecutor) {
  const [row] = await db
    .select({ id: gradingPolicies.id })
    .from(gradingPolicies)
    .where(eq(gradingPolicies.isDefault, true));
  return row.id;
}

/** A session with First/Second/Third terms. */
export async function createSession(
  db: DbExecutor,
  startYear: number,
  status: "planned" | "active" | "closed" = "planned",
) {
  const [session] = await db
    .insert(academicSessions)
    .values({ startYear, status, gradingPolicyId: await defaultPolicyId(db) })
    .returning();
  const termRows = await db
    .insert(terms)
    .values(
      ["first", "second", "third"].map((termTypeCode) => ({ sessionId: session.id, termTypeCode })),
    )
    .returning();
  const byType = Object.fromEntries(termRows.map((t) => [t.termTypeCode, t]));
  return { session, terms: byType };
}

/** Register a student with a primary identifier (in one transaction, as the app will). */
export async function createStudent(
  db: DbExecutor,
  publicId: string,
  { source = "v2" as "v2" | "v1_import", fullName = "Test Student" } = {},
) {
  return db.transaction(async (tx) => {
    const [student] = await tx.insert(students).values({ publicId, fullName, source }).returning();
    const parts = parseStudentId(publicId);
    await tx.insert(studentIdentifiers).values({
      value: publicId,
      studentId: student.id,
      isPrimary: true,
      source,
      levelCode: parts?.levelCode ?? null,
      year: parts?.year ?? null,
      serial: parts?.serial ?? null,
    });
    return student;
  });
}

export async function enroll(
  db: DbExecutor,
  studentId: string,
  sessionId: string,
  levelCode = "IBT",
) {
  const [row] = await db
    .insert(enrollments)
    .values({ studentId, sessionId, levelId: await levelId(db, levelCode) })
    .returning();
  return row;
}
