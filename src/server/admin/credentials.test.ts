import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogs,
  guardians,
  roles,
  staffUsers,
  studentCredentials,
  studentGuardians,
  studentSessions,
  students,
  userRoles,
} from "@/db/schema";
import { createSession, createStudent, enroll } from "@/db/testing/fixtures";
import { createTestDatabase } from "@/db/testing/test-db";
import type { DbExecutor } from "@/db/types";
import { portalProfile, portalResults } from "../portal/queries";
import { AuthorizationError, type StaffAccess, loadAccess } from "../staff-auth/access";
import { isValidPin, isWeakPin } from "../student-auth/rules";
import {
  completeLegacyPinMigration,
  setStudentCredential,
  signInStudent,
} from "../student-auth/service";
import { findStudentSession } from "../student-auth/sessions";
import { generatePin, issueStudentPin, revokeStudentAccess } from "./credentials";

const AUTH_SECRET = "test-student-auth-secret-0123456789abcdef";
const T0 = new Date("2026-10-06T08:00:00Z");
const later = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

let db: DbExecutor;
let close: () => Promise<void>;
let registrar: StaffAccess;
let academic: StaffAccess;
let n = 0;

async function staff(roleKey: string): Promise<StaffAccess> {
  n += 1;
  const [row] = await db
    .insert(staffUsers)
    .values({
      authUserId: `c-${n}`,
      email: `c${n}@markaz.example`,
      fullName: `Staff ${n}`,
      status: "active",
    })
    .returning();
  const [role] = await db.select().from(roles).where(eq(roles.key, roleKey));
  await db.insert(userRoles).values({ userId: row.id, roleId: role.id });
  return loadAccess(db, row);
}

async function newStudent() {
  n += 1;
  const publicId = `MGIBT-2032-${String(n).padStart(3, "0")}`;
  return { ...(await createStudent(db, publicId, { fullName: `Pupil ${n}` })), publicId };
}

const signIn = (publicId: string, secret: string, now = T0) =>
  signInStudent(db, { studentId: publicId, secret, authSecret: AUTH_SECRET, now });
const issue = (actor: StaffAccess, studentId: string, now = T0) =>
  issueStudentPin(db, actor, { studentId, authSecret: AUTH_SECRET, now });
const liveCredentials = (studentId: string) =>
  db
    .select()
    .from(studentCredentials)
    .where(and(eq(studentCredentials.studentId, studentId), isNull(studentCredentials.revokedAt)));
const audits = (studentId: string) =>
  db.select().from(auditLogs).where(eq(auditLogs.targetId, studentId));

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
  registrar = await staff("registrar");
  academic = await staff("academic_admin");
});
afterAll(async () => close());

describe("generated PINs", () => {
  it("are six digits and never weak", () => {
    for (let i = 0; i < 3000; i++) {
      const pin = generatePin();
      expect(isValidPin(pin)).toBe(true);
      expect(isWeakPin(pin)).toBe(false);
    }
  });
});

describe("issuing a PIN", () => {
  it("requires student_credentials.reset on the server", async () => {
    const s = await newStudent();
    await expect(issue(academic, s.id)).rejects.toBeInstanceOf(AuthorizationError);
    expect(await liveCredentials(s.id)).toHaveLength(0);
  });

  it("stores only a hash, audits without the PIN, and forces the student to choose their own", async () => {
    const s = await newStudent();
    const { pin, reset } = await issue(registrar, s.id);
    expect(reset).toBe(false);
    const [credential] = await liveCredentials(s.id);
    expect(credential.secretHash).not.toContain(pin);
    expect(credential.secretHash.startsWith("$argon2id$")).toBe(true);
    expect(credential.createdById).toBe(registrar.staffId);
    const [entry] = await audits(s.id);
    expect(entry.action).toBe("student.pin_issued");
    expect(JSON.stringify(entry.metadata)).not.toContain(pin);

    const result = await signIn(s.publicId, pin);
    expect(result).toMatchObject({ status: "ok", mustSetPin: true });
    if (result.status !== "ok") throw new Error("sign-in failed");

    // The issued PIN cannot simply be kept.
    expect(
      await completeLegacyPinMigration(db, {
        token: result.token,
        newPin: pin,
        confirmPin: pin,
        authSecret: AUTH_SECRET,
        now: T0,
      }),
    ).toEqual({ status: "same_pin" });
    const own = pin === "583921" ? "583922" : "583921";
    const chosen = await completeLegacyPinMigration(db, {
      token: result.token,
      newPin: own,
      confirmPin: own,
      authSecret: AUTH_SECRET,
      now: T0,
    });
    expect(chosen.status).toBe("ok");
    expect((await audits(s.id)).map((a) => a.action)).toContain("student.pin_chosen");
    expect(await signIn(s.publicId, pin, later(1))).toEqual({ status: "invalid_credentials" });
    expect(await signIn(s.publicId, own, later(1))).toMatchObject({
      status: "ok",
      mustSetPin: false,
    });
  });

  it("refuses students who may not sign in", async () => {
    const s = await newStudent();
    await db.update(students).set({ status: "suspended" }).where(eq(students.id, s.id));
    await expect(issue(registrar, s.id)).rejects.toMatchObject({ code: "cannot_sign_in" });
  });
});

describe("resetting and revoking", () => {
  it("a reset replaces the PIN and any V1 password and ends every session", async () => {
    const s = await newStudent();
    await setStudentCredential(db, {
      studentId: s.id,
      kind: "pin",
      plain: "482913",
      authSecret: AUTH_SECRET,
      now: T0,
    });
    await setStudentCredential(db, {
      studentId: s.id,
      kind: "legacy_v1_password",
      plain: "abc",
      authSecret: AUTH_SECRET,
      now: T0,
    });
    const before = await signIn(s.publicId, "482913");
    if (before.status !== "ok") throw new Error("sign-in failed");

    const { pin, reset } = await issue(registrar, s.id, later(1));
    expect(reset).toBe(true);
    expect(await findStudentSession(db, before.token, later(2))).toBeNull();
    expect(await signIn(s.publicId, "482913", later(2))).toEqual({ status: "invalid_credentials" });
    const live = await liveCredentials(s.id);
    expect(live.map((c) => c.kind)).toEqual(["pin"]);
    expect(await signIn(s.publicId, pin, later(2))).toMatchObject({ status: "ok" });
    const entry = (await audits(s.id)).find((a) => a.action === "student.pin_reset");
    expect(entry?.metadata).toMatchObject({ sessionsEnded: 1 });
  });

  it("revoking disables every credential and session, with a reason and permission", async () => {
    const s = await newStudent();
    const { pin } = await issue(registrar, s.id);
    const session = await signIn(s.publicId, pin);
    if (session.status !== "ok") throw new Error("sign-in failed");

    await expect(
      revokeStudentAccess(db, academic, { studentId: s.id, reason: "Left the school" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await revokeStudentAccess(db, registrar, {
      studentId: s.id,
      reason: "Lost card",
      now: later(1),
    });
    expect(await liveCredentials(s.id)).toHaveLength(0);
    expect(await findStudentSession(db, session.token, later(2))).toBeNull();
    expect(await signIn(s.publicId, pin, later(2))).toEqual({ status: "invalid_credentials" });
    const entry = (await audits(s.id)).find((a) => a.action === "student.access_revoked");
    expect(entry?.metadata).toMatchObject({
      reason: "Lost card",
      revoked: ["pin"],
      sessionsEnded: 1,
    });
    await expect(
      revokeStudentAccess(db, registrar, { studentId: s.id, reason: "Again" }),
    ).rejects.toMatchObject({ code: "no_access_to_revoke" });
    const open = await db
      .select()
      .from(studentSessions)
      .where(and(eq(studentSessions.studentId, s.id), isNull(studentSessions.revokedAt)));
    expect(open).toHaveLength(0);
  });
});

describe("portal data isolation", () => {
  it("returns only the signed-in student's own records", async () => {
    const a = await newStudent();
    const b = await newStudent();
    const { session } = await createSession(db, 2090, "active");
    await enroll(db, a.id, session.id, "IBT");
    await enroll(db, b.id, session.id, "IDA");
    const [g] = await db
      .insert(guardians)
      .values({ fullName: "Guardian of A", phone: "+2348000000001" })
      .returning();
    await db
      .insert(studentGuardians)
      .values({ studentId: a.id, guardianId: g.id, relationship: "Mother" });

    const mine = await portalProfile(db, { student: { id: a.id } });
    const theirs = await portalProfile(db, { student: { id: b.id } });
    expect(mine?.student.publicId).toBe(a.publicId);
    expect(mine?.current?.levelCode).toBe("IBT");
    expect(mine?.guardians.map((x) => x.fullName)).toEqual(["Guardian of A"]);
    expect(theirs?.current?.levelCode).toBe("IDA");
    expect(theirs?.guardians).toEqual([]);
    // Staff-only fields never reach the portal model.
    expect(Object.keys(mine!.student)).not.toContain("notes");
    expect(await portalResults(db, { student: { id: a.id } })).toEqual([]);
  });
});
