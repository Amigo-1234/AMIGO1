import { and, eq, isNull, sql } from "drizzle-orm";
import { normalizeStudentIdInput } from "@/domain/student-id";
import { studentCredentials, studentIdentifiers, students, systemSettings } from "@/db/schema";
import type { DbExecutor } from "@/db/types";
import { recordAudit } from "../audit";
import { hashCredential, keyedHash, verifyAgainstDummy, verifyCredential } from "../auth/crypto";
import {
  IDENTITY_POLICY,
  NETWORK_POLICY,
  type ThrottleKey,
  clearThrottle,
  lockedUntil,
  recordFailures,
} from "../auth/throttle";
import {
  type SecretKind,
  canSignIn,
  classifySecret,
  isValidPin,
  isWeakPin,
  normalizeLegacyPassword,
} from "./rules";
import { createStudentSession, findStudentSession, revokeAllStudentSessions } from "./sessions";

/**
 * Student / parent authentication: Student ID (permanent ID or a registered V1 alias)
 * plus a 6-digit PIN, or, while enabled, a migrated V1 password that must immediately be
 * replaced by a PIN. Everything here runs on the server; the browser never sees a hash.
 */

export const LEGACY_LOGIN_SETTING = "auth.legacy_v1_credentials_enabled";

export async function isLegacyLoginEnabled(db: DbExecutor): Promise<boolean> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, LEGACY_LOGIN_SETTING));
  return row?.value === true;
}

export function studentIdThrottleKey(secret: string, normalizedId: string): ThrottleKey {
  return {
    key: `student-id:${keyedHash(secret, "student-id", normalizedId)}`,
    policy: IDENTITY_POLICY,
  };
}

export function networkThrottleKey(secret: string, ipAddress: string): ThrottleKey {
  return { key: `ip:${keyedHash(secret, "ip", ipAddress)}`, policy: NETWORK_POLICY };
}

export type StudentSignInResult =
  | { status: "ok"; token: string; expiresAt: Date; mustSetPin: boolean }
  /** Missing ID, or a secret that is neither a 6-digit PIN nor (when enabled) a V1 password. */
  | { status: "invalid_input" }
  /** Wrong ID or wrong secret: deliberately indistinguishable. */
  | { status: "invalid_credentials" }
  | { status: "throttled"; retryAfter: Date }
  /** Correct credentials, but the student may not sign in (e.g. suspended or archived). */
  | { status: "unavailable" };

export async function signInStudent(
  db: DbExecutor,
  input: {
    studentId: string;
    secret: string;
    authSecret: string;
    now: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<StudentSignInResult> {
  const normalizedId = normalizeStudentIdInput(input.studentId ?? "");
  if (!normalizedId || normalizedId.length > 40) return { status: "invalid_input" };

  const legacyEnabled = await isLegacyLoginEnabled(db);
  const kind = classifySecret(input.secret ?? "", legacyEnabled);
  if (!kind) return { status: "invalid_input" };

  const keys = [studentIdThrottleKey(input.authSecret, normalizedId)];
  if (input.ipAddress) keys.push(networkThrottleKey(input.authSecret, input.ipAddress));

  const locked = await lockedUntil(db, keys, input.now);
  if (locked) return { status: "throttled", retryAfter: locked };

  const plain = kind === "pin" ? input.secret : normalizeLegacyPassword(input.secret);
  const candidate = await findCredential(db, normalizedId, kind);
  const verified = candidate
    ? await verifyCredential(candidate.secretHash, plain, input.authSecret)
    : await verifyAgainstDummy(plain, input.authSecret);

  if (!candidate || !verified) {
    await recordFailures(db, keys, input.now);
    return { status: "invalid_credentials" };
  }

  await clearThrottle(db, keys[0].key);
  if (!canSignIn(candidate.studentStatus)) return { status: "unavailable" };

  await db
    .update(studentCredentials)
    .set({ lastUsedAt: input.now })
    .where(eq(studentCredentials.id, candidate.credentialId));

  // A V1 password, or a PIN staff issued, must be replaced by the student's own PIN.
  const mustSetPin = kind === "legacy_v1_password" || candidate.issuedByStaff;
  const session = await createStudentSession(db, {
    studentId: candidate.studentId,
    mustSetPin,
    now: input.now,
    ipHash: input.ipAddress ? keyedHash(input.authSecret, "ip", input.ipAddress) : null,
    userAgent: input.userAgent,
  });
  return { status: "ok", ...session, mustSetPin };
}

/** Resolve any registered ID (primary or alias) to the student's live credential of a kind. */
async function findCredential(db: DbExecutor, normalizedId: string, kind: SecretKind) {
  const [row] = await db
    .select({
      studentId: students.id,
      studentStatus: students.status,
      credentialId: studentCredentials.id,
      secretHash: studentCredentials.secretHash,
      issuedByStaff: sql<boolean>`${studentCredentials.createdById} IS NOT NULL`,
    })
    .from(studentIdentifiers)
    .innerJoin(students, eq(students.id, studentIdentifiers.studentId))
    .innerJoin(
      studentCredentials,
      and(
        eq(studentCredentials.studentId, students.id),
        eq(studentCredentials.kind, kind),
        isNull(studentCredentials.revokedAt),
      ),
    )
    .where(eq(studentIdentifiers.value, normalizedId));
  return row ?? null;
}

export type PinChangeResult =
  | { status: "ok"; token: string; expiresAt: Date }
  | { status: "session_invalid" }
  | { status: "invalid_pin" }
  /** Six digits, but too predictable (see isWeakPin). */
  | { status: "weak_pin" }
  /** The same PIN staff issued: it must be one only the student knows. */
  | { status: "same_pin" }
  | { status: "mismatch" };

/**
 * Replace a migrated V1 password, or a PIN issued by staff, with the student's own 6-digit
 * PIN. Only allowed from the short session created by such a sign-in. In one transaction:
 * store the new PIN hash, revoke the old credentials (they can never be used again), end
 * every session of the student, open a normal session and audit the change.
 */
export async function completeLegacyPinMigration(
  db: DbExecutor,
  input: {
    token: string | null | undefined;
    newPin: string;
    confirmPin: string;
    authSecret: string;
    now: Date;
  },
): Promise<PinChangeResult> {
  const session = await findStudentSession(db, input.token, input.now);
  if (!session || !session.mustSetPin) return { status: "session_invalid" };
  if (!isValidPin(input.newPin)) return { status: "invalid_pin" };
  if (isWeakPin(input.newPin)) return { status: "weak_pin" };
  if (input.newPin !== input.confirmPin) return { status: "mismatch" };
  const [issued] = await db
    .select({ secretHash: studentCredentials.secretHash })
    .from(studentCredentials)
    .where(
      and(
        eq(studentCredentials.studentId, session.student.id),
        eq(studentCredentials.kind, "pin"),
        isNull(studentCredentials.revokedAt),
      ),
    );
  if (issued && (await verifyCredential(issued.secretHash, input.newPin, input.authSecret)))
    return { status: "same_pin" };

  const secretHash = await hashCredential(input.newPin, input.authSecret);
  const studentId = session.student.id;

  return db.transaction(async (tx) => {
    await tx
      .update(studentCredentials)
      .set({ revokedAt: input.now, revokedReason: "replaced_by_new_pin" })
      .where(
        and(
          eq(studentCredentials.studentId, studentId),
          eq(studentCredentials.kind, "pin"),
          isNull(studentCredentials.revokedAt),
        ),
      );
    const migrated = await tx
      .update(studentCredentials)
      .set({ revokedAt: input.now, revokedReason: "migrated_to_pin" })
      .where(
        and(
          eq(studentCredentials.studentId, studentId),
          eq(studentCredentials.kind, "legacy_v1_password"),
          isNull(studentCredentials.revokedAt),
        ),
      )
      .returning({ id: studentCredentials.id });
    await tx
      .insert(studentCredentials)
      .values({ studentId, kind: "pin", secretHash, createdAt: input.now });
    await revokeAllStudentSessions(tx, studentId, input.now);
    const next = await createStudentSession(tx, { studentId, mustSetPin: false, now: input.now });
    await recordAudit(tx, {
      actor: { type: "student", studentId, label: session.student.publicId },
      action: migrated.length ? "student.pin_migrated" : "student.pin_chosen",
      targetType: "student",
      targetId: studentId,
      metadata: { from: migrated.length ? "legacy_v1_password" : "issued_pin", to: "pin" },
    });
    return { status: "ok" as const, ...next };
  });
}

/**
 * Store a new credential for a student, revoking any live one of the same kind. Used by
 * staff PIN resets (later phases), the V1 import (legacy passwords) and tests. The plain
 * value is hashed here and never stored or logged.
 */
export async function setStudentCredential(
  db: DbExecutor,
  input: {
    studentId: string;
    kind: SecretKind;
    plain: string;
    authSecret: string;
    now: Date;
    createdById?: string | null;
  },
): Promise<void> {
  if (input.kind === "pin" && isWeakPin(input.plain))
    throw new Error("This PIN is too easy to guess");
  if (input.kind === "pin" && !isValidPin(input.plain))
    throw new Error("A PIN must be exactly 6 digits");
  const plain = input.kind === "pin" ? input.plain : normalizeLegacyPassword(input.plain);
  const secretHash = await hashCredential(plain, input.authSecret);
  await db.transaction(async (tx) => {
    await tx
      .update(studentCredentials)
      .set({ revokedAt: input.now, revokedReason: "replaced" })
      .where(
        and(
          eq(studentCredentials.studentId, input.studentId),
          eq(studentCredentials.kind, input.kind),
          isNull(studentCredentials.revokedAt),
        ),
      );
    await tx.insert(studentCredentials).values({
      studentId: input.studentId,
      kind: input.kind,
      secretHash,
      createdById: input.createdById ?? null,
      createdAt: input.now,
    });
  });
}
