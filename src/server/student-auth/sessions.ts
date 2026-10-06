import { and, eq, isNull, ne } from "drizzle-orm";
import { studentSessions, students } from "@/db/schema";
import type { DbExecutor } from "@/db/types";
import { generateToken, sha256Hex } from "../auth/crypto";
import {
  PIN_SETUP_SESSION_TTL_MS,
  SESSION_TOUCH_INTERVAL_MS,
  STUDENT_SESSION_TTL_MS,
  canSignIn,
} from "./rules";

/**
 * Server-managed student sessions. The browser holds only a random 256-bit token in an
 * HttpOnly cookie; the database stores its SHA-256 hash, so a database leak does not
 * reveal usable tokens. Every request looks the session up, so revocation is immediate.
 */
export type StudentSession = {
  sessionId: string;
  mustSetPin: boolean;
  expiresAt: Date;
  student: { id: string; publicId: string; fullName: string; status: string };
};

export async function createStudentSession(
  db: DbExecutor,
  input: {
    studentId: string;
    mustSetPin: boolean;
    now: Date;
    ipHash?: string | null;
    userAgent?: string | null;
  },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const ttl = input.mustSetPin ? PIN_SETUP_SESSION_TTL_MS : STUDENT_SESSION_TTL_MS;
  const expiresAt = new Date(input.now.getTime() + ttl);
  await db.insert(studentSessions).values({
    studentId: input.studentId,
    tokenHash: sha256Hex(token),
    mustSetPin: input.mustSetPin,
    createdAt: input.now,
    expiresAt,
    lastSeenAt: input.now,
    ipHash: input.ipHash ?? null,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

/**
 * The live session for a token, or null if it is unknown, expired, revoked, or belongs to
 * a student who may no longer sign in (in which case it is revoked now).
 */
export async function findStudentSession(
  db: DbExecutor,
  token: string | undefined | null,
  now: Date,
): Promise<StudentSession | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db
    .select({
      sessionId: studentSessions.id,
      mustSetPin: studentSessions.mustSetPin,
      expiresAt: studentSessions.expiresAt,
      revokedAt: studentSessions.revokedAt,
      lastSeenAt: studentSessions.lastSeenAt,
      studentId: students.id,
      publicId: students.publicId,
      fullName: students.fullName,
      status: students.status,
    })
    .from(studentSessions)
    .innerJoin(students, eq(students.id, studentSessions.studentId))
    .where(eq(studentSessions.tokenHash, sha256Hex(token)));

  if (!row || row.revokedAt || row.expiresAt <= now) return null;
  if (!canSignIn(row.status)) {
    await revokeSessionById(db, row.sessionId, now);
    return null;
  }
  if (!row.lastSeenAt || now.getTime() - row.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    await db
      .update(studentSessions)
      .set({ lastSeenAt: now })
      .where(eq(studentSessions.id, row.sessionId));
  }
  return {
    sessionId: row.sessionId,
    mustSetPin: row.mustSetPin,
    expiresAt: row.expiresAt,
    student: {
      id: row.studentId,
      publicId: row.publicId,
      fullName: row.fullName,
      status: row.status,
    },
  };
}

async function revokeSessionById(db: DbExecutor, sessionId: string, now: Date) {
  await db
    .update(studentSessions)
    .set({ revokedAt: now })
    .where(and(eq(studentSessions.id, sessionId), isNull(studentSessions.revokedAt)));
}

/** Sign out: revoke the session behind a token (no-op if unknown). */
export async function revokeStudentSession(
  db: DbExecutor,
  token: string | undefined | null,
  now: Date,
): Promise<void> {
  if (!token || token.length > 200) return;
  await db
    .update(studentSessions)
    .set({ revokedAt: now })
    .where(and(eq(studentSessions.tokenHash, sha256Hex(token)), isNull(studentSessions.revokedAt)));
}

/** Revoke every live session of a student, optionally keeping one. */
export async function revokeAllStudentSessions(
  db: DbExecutor,
  studentId: string,
  now: Date,
  exceptSessionId?: string,
): Promise<void> {
  const conditions = [eq(studentSessions.studentId, studentId), isNull(studentSessions.revokedAt)];
  if (exceptSessionId) conditions.push(ne(studentSessions.id, exceptSessionId));
  await db
    .update(studentSessions)
    .set({ revokedAt: now })
    .where(and(...conditions));
}
