import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StudentIntake } from "@/domain/admin-input";
import {
  academicSessions,
  auditLogs,
  enrollments,
  guardians,
  roles,
  staffUsers,
  studentGuardians,
  studentIdentifiers,
  studentSessions,
  students,
  termResults,
  terms,
  userRoles,
} from "@/db/schema";
import { createTestDatabase } from "@/db/testing/test-db";
import { levelId } from "@/db/testing/fixtures";
import type { DbExecutor } from "@/db/types";
import { AuthorizationError, type StaffAccess, loadAccess } from "../staff-auth/access";
import {
  activateSession,
  activateTerm,
  closeSession,
  closeTerm,
  createSession,
  updateSessionDates,
  updateTermDates,
} from "./academics";
import { AdminRuleError } from "./common";
import { changeEnrollmentLevel, enrollStudent } from "./enrollments";
import {
  addGuardian,
  linkGuardian,
  unlinkGuardian,
  updateGuardian,
  updateGuardianLink,
} from "./guardians";
import { getDashboard, getStudentProfile, listStudents, searchGuardians } from "./queries";
import {
  changeStudentStatus,
  registerStudent,
  restoreStudent,
  updateStudentDetails,
} from "./students";

let db: DbExecutor;
let close: () => Promise<void>;
let admin: StaffAccess;
let registrar: StaffAccess;
let academic: StaffAccess;
let finance: StaffAccess;
let n = 0;

async function staffWith(roleKeys: string[]): Promise<StaffAccess> {
  n += 1;
  const [staff] = await db
    .insert(staffUsers)
    .values({
      authUserId: `neon-${n}`,
      email: `s${n}@markaz.example`,
      fullName: `Staff ${n}`,
      status: "active",
    })
    .returning();
  for (const key of roleKeys) {
    const [role] = await db.select().from(roles).where(eq(roles.key, key));
    await db.insert(userRoles).values({ userId: staff.id, roleId: role.id });
  }
  return loadAccess(db, staff);
}

const ruleError = (code: string) =>
  expect.objectContaining({ name: "AdminRuleError", code }) as unknown as AdminRuleError;

async function auditFor(targetId: string) {
  return (
    await db.select().from(auditLogs).where(eq(auditLogs.targetId, targetId)).orderBy(auditLogs.id)
  ).map((a) => a.action);
}

let year = 2030;
async function newSession(status: "planned" | "active" = "planned") {
  const session = await createSession(db, admin, {
    startYear: year++,
    startsOn: null,
    endsOn: null,
  });
  if (status === "active") {
    await db
      .update(academicSessions)
      .set({ status: "closed" })
      .where(eq(academicSessions.status, "active"));
    await activateSession(db, admin, session.id);
  }
  return session;
}

async function intake(
  sessionId: string,
  overrides: Partial<StudentIntake> = {},
): Promise<StudentIntake> {
  return {
    student: {
      fullName: `Student ${++n}`,
      gender: null,
      dateOfBirth: null,
      phone: null,
      address: null,
      notes: null,
      admittedOn: null,
    },
    levelId: await levelId(db, "IBT"),
    sessionId,
    enrollNow: true,
    guardian: null,
    ...overrides,
  };
}

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
  admin = await staffWith(["super_admin"]);
  registrar = await staffWith(["registrar"]);
  academic = await staffWith(["academic_admin"]);
  finance = await staffWith(["finance_admin"]);
}, 120_000);

afterAll(async () => {
  await close?.();
});

describe("student registration", () => {
  it("allocates the permanent ID from admission level and session year, atomically and audited", async () => {
    const session = await newSession();
    const first = await registerStudent(db, registrar, await intake(session.id));
    const second = await registerStudent(db, registrar, await intake(session.id));
    expect(first.publicId).toBe(`MGIBT-${year - 1}-001`);
    expect(second.publicId).toBe(`MGIBT-${year - 1}-002`);

    const [identifier] = await db
      .select()
      .from(studentIdentifiers)
      .where(eq(studentIdentifiers.studentId, first.id));
    expect(identifier).toMatchObject({ value: first.publicId, isPrimary: true, source: "v2" });
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.studentId, first.id));
    expect(enrollment).toMatchObject({ sessionId: session.id, status: "active" });
    expect(await auditFor(first.id)).toEqual(["student.created", "enrollment.created"]);
  });

  it("checks permissions: creating needs students.create, placing also needs enrollments.manage", async () => {
    const session = await newSession();
    await expect(registerStudent(db, academic, await intake(session.id))).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(registerStudent(db, finance, await intake(session.id))).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("rolls everything back on a refused registration, without consuming an ID", async () => {
    const session = await newSession();
    await db
      .update(academicSessions)
      .set({ status: "closed" })
      .where(eq(academicSessions.id, session.id));
    const before = (await db.select().from(students)).length;
    await expect(registerStudent(db, registrar, await intake(session.id))).rejects.toEqual(
      ruleError("session_closed"),
    );
    expect((await db.select().from(students)).length).toBe(before);

    // Without placement the closed session still defines the ID, and the serial starts at 001.
    const created = await registerStudent(
      db,
      registrar,
      await intake(session.id, { enrollNow: false }),
    );
    expect(created.publicId).toBe(`MGIBT-${year - 1}-001`);
  });

  it("adds a guardian, reusing an existing guardian only when name and phone both match", async () => {
    const session = await newSession();
    const guardian = {
      fullName: "Musa Bello",
      phone: "08031234567",
      email: null,
      address: null,
      notes: null,
      relationship: "Father",
      isPrimaryContact: true,
    };
    const a = await registerStudent(db, registrar, await intake(session.id, { guardian }));
    const b = await registerStudent(
      db,
      registrar,
      await intake(session.id, { guardian: { ...guardian, fullName: "MUSA BELLO" } }),
    );
    const c = await registerStudent(
      db,
      registrar,
      await intake(session.id, { guardian: { ...guardian, fullName: "Musa Bello Jr" } }),
    );
    const links = await db.select().from(studentGuardians);
    const guardianOf = (id: string) => links.find((l) => l.studentId === id)!.guardianId;
    expect(guardianOf(a.id)).toBe(guardianOf(b.id));
    expect(guardianOf(c.id)).not.toBe(guardianOf(a.id));
    expect(await auditFor(b.id)).toEqual([
      "student.created",
      "enrollment.created",
      "guardian.linked",
    ]);
  });
});

describe("editing and lifecycle", () => {
  it("audits changed fields only and keeps archived records read-only", async () => {
    const session = await newSession();
    const { id } = await registerStudent(db, registrar, await intake(session.id));
    const [row] = await db.select().from(students).where(eq(students.id, id));
    const details = {
      fullName: row.fullName,
      gender: "female" as const,
      dateOfBirth: "2015-03-02",
      phone: null,
      address: null,
      notes: null,
      admittedOn: null,
    };
    expect(await updateStudentDetails(db, registrar, id, details)).toBe("updated");
    expect(await updateStudentDetails(db, registrar, id, details)).toBe("unchanged");
    const [entry] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.targetId, id), eq(auditLogs.action, "student.updated")));
    expect(entry.metadata).toEqual({
      changes: {
        gender: { from: null, to: "female" },
        dateOfBirth: { from: null, to: "2015-03-02" },
      },
    });
    await expect(updateStudentDetails(db, academic, id, details)).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    await changeStudentStatus(db, registrar, {
      studentId: id,
      to: "archived",
      reason: "Duplicate record",
    });
    await expect(updateStudentDetails(db, registrar, id, details)).rejects.toEqual(
      ruleError("archived_read_only"),
    );
  });

  it("suspends without ending the enrollment, and ends it as withdrawn when the student leaves", async () => {
    const session = await newSession();
    const { id } = await registerStudent(db, registrar, await intake(session.id));
    await db.insert(studentSessions).values({
      studentId: id,
      tokenHash: "a".repeat(64),
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    await changeStudentStatus(db, registrar, {
      studentId: id,
      to: "suspended",
      reason: "Fees review",
    });
    let [enrollment] = await db.select().from(enrollments).where(eq(enrollments.studentId, id));
    expect(enrollment.status).toBe("active");
    const [portal] = await db
      .select()
      .from(studentSessions)
      .where(eq(studentSessions.studentId, id));
    expect(portal.revokedAt).not.toBeNull();

    await changeStudentStatus(db, registrar, {
      studentId: id,
      to: "withdrawn",
      reason: "Moved to another city",
      now: new Date("2026-10-06T23:30:00Z"),
    });
    [enrollment] = await db.select().from(enrollments).where(eq(enrollments.studentId, id));
    expect(enrollment).toMatchObject({ status: "withdrawn", endedOn: "2026-10-07" });

    await expect(
      changeStudentStatus(db, registrar, { studentId: id, to: "graduated", reason: "Not by hand" }),
    ).rejects.toEqual(ruleError("status_change_not_allowed"));
    await expect(
      changeStudentStatus(db, academic, { studentId: id, to: "active", reason: "Readmitted" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await changeStudentStatus(db, registrar, { studentId: id, to: "active", reason: "Readmitted" });
    const [student] = await db.select().from(students).where(eq(students.id, id));
    expect(student.status).toBe("active");
  });

  it("archives and restores to the previous status, never deleting the record", async () => {
    const session = await newSession();
    const { id } = await registerStudent(db, registrar, await intake(session.id));
    await changeStudentStatus(db, registrar, { studentId: id, to: "suspended", reason: "Pause" });
    await changeStudentStatus(db, registrar, {
      studentId: id,
      to: "archived",
      reason: "Old record",
    });
    let [student] = await db.select().from(students).where(eq(students.id, id));
    expect(student.status).toBe("archived");
    expect(student.archivedAt).not.toBeNull();
    await expect(
      restoreStudent(db, finance, { studentId: id, reason: "Mistake" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(
      await restoreStudent(db, registrar, { studentId: id, reason: "Archived by mistake" }),
    ).toBe("suspended");
    [student] = await db.select().from(students).where(eq(students.id, id));
    expect(student).toMatchObject({ status: "suspended", archivedAt: null });
    await expect(restoreStudent(db, registrar, { studentId: id, reason: "Again" })).rejects.toEqual(
      ruleError("not_archived"),
    );
  });
});

describe("enrollment", () => {
  it("places a student once per session, never twice active, and only while at school", async () => {
    const current = await newSession("active");
    const next = await newSession();
    const { id } = await registerStudent(
      db,
      registrar,
      await intake(current.id, { enrollNow: false }),
    );

    await expect(
      enrollStudent(db, finance, {
        studentId: id,
        sessionId: current.id,
        levelId: await levelId(db, "IDA"),
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await enrollStudent(db, registrar, {
      studentId: id,
      sessionId: current.id,
      levelId: await levelId(db, "IDA"),
    });
    await expect(
      enrollStudent(db, registrar, {
        studentId: id,
        sessionId: current.id,
        levelId: await levelId(db, "IDA"),
      }),
    ).rejects.toEqual(ruleError("already_enrolled_in_session"));
    await expect(
      enrollStudent(db, registrar, {
        studentId: id,
        sessionId: next.id,
        levelId: await levelId(db, "THA"),
      }),
    ).rejects.toEqual(ruleError("has_active_enrollment"));

    const other = await registerStudent(
      db,
      registrar,
      await intake(current.id, { enrollNow: false }),
    );
    await changeStudentStatus(db, registrar, {
      studentId: other.id,
      to: "suspended",
      reason: "Pause",
    });
    await expect(
      enrollStudent(db, registrar, {
        studentId: other.id,
        sessionId: current.id,
        levelId: await levelId(db, "IBT"),
      }),
    ).rejects.toEqual(ruleError("not_enrollable"));
  });

  it("corrects a placement until results exist, recording the reason", async () => {
    const session = await newSession("active");
    const { id } = await registerStudent(db, registrar, await intake(session.id));
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.studentId, id));
    await expect(
      changeEnrollmentLevel(db, registrar, {
        enrollmentId: enrollment.id,
        levelId: enrollment.levelId,
        reason: "x",
      }),
    ).rejects.toEqual(ruleError("same_level"));
    await changeEnrollmentLevel(db, registrar, {
      enrollmentId: enrollment.id,
      levelId: await levelId(db, "IDA"),
      reason: "Placement test result",
    });
    const [entry] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.targetId, id), eq(auditLogs.action, "enrollment.level_changed")));
    expect(entry.metadata).toMatchObject({
      from: "IBT",
      to: "IDA",
      reason: "Placement test result",
    });

    const [term] = await db.select().from(terms).where(eq(terms.sessionId, session.id)).limit(1);
    await db
      .insert(termResults)
      .values({ enrollmentId: enrollment.id, sessionId: session.id, termId: term.id });
    await expect(
      changeEnrollmentLevel(db, registrar, {
        enrollmentId: enrollment.id,
        levelId: await levelId(db, "THA"),
        reason: "Too late",
      }),
    ).rejects.toEqual(ruleError("has_results"));
  });
});

describe("guardians", () => {
  it("links, updates, sets one primary contact and unlinks with an audit trail", async () => {
    const session = await newSession();
    const a = await registerStudent(db, registrar, await intake(session.id));
    const b = await registerStudent(db, registrar, await intake(session.id));
    const details = {
      fullName: "Hauwa Sani",
      phone: "08099990000",
      email: null,
      address: null,
      notes: null,
    };
    const { guardianId } = await addGuardian(db, registrar, a.id, {
      ...details,
      relationship: "Mother",
      isPrimaryContact: true,
    });
    await expect(
      linkGuardian(db, registrar, {
        studentId: a.id,
        guardianId,
        link: { relationship: null, isPrimaryContact: false },
      }),
    ).rejects.toEqual(ruleError("guardian_already_linked"));
    await linkGuardian(db, registrar, {
      studentId: b.id,
      guardianId,
      link: { relationship: "Aunt", isPrimaryContact: false },
    });

    const second = await addGuardian(db, registrar, a.id, {
      fullName: "Yusuf Sani",
      phone: null,
      email: null,
      address: null,
      notes: null,
      relationship: "Father",
      isPrimaryContact: true,
    });
    const linksA = await db
      .select()
      .from(studentGuardians)
      .where(eq(studentGuardians.studentId, a.id));
    expect(linksA.filter((l) => l.isPrimaryContact).map((l) => l.guardianId)).toEqual([
      second.guardianId,
    ]);

    expect(
      await updateGuardian(db, registrar, guardianId, { ...details, email: "hauwa@example.org" }),
    ).toBe("updated");
    expect(
      await updateGuardianLink(db, registrar, {
        studentId: b.id,
        guardianId,
        link: { relationship: "Mother", isPrimaryContact: true },
      }),
    ).toBe("updated");

    await unlinkGuardian(db, registrar, {
      studentId: b.id,
      guardianId,
      reason: "Linked by mistake",
    });
    expect(await db.select().from(guardians).where(eq(guardians.id, guardianId))).toHaveLength(1);
    expect(await auditFor(b.id)).toContain("guardian.unlinked");
    await expect(
      unlinkGuardian(db, registrar, { studentId: b.id, guardianId, reason: "Again" }),
    ).rejects.toEqual(ruleError("guardian_not_linked"));
    await expect(updateGuardian(db, academic, guardianId, details)).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    const found = await searchGuardians(db, "hauwa", a.id);
    expect(found).toEqual([
      expect.objectContaining({ id: guardianId, alreadyLinked: true, linkedStudents: 1 }),
    ]);
    expect(await searchGuardians(db, "0999")).toEqual([
      expect.objectContaining({ id: guardianId }),
    ]);
  });
});

describe("sessions and terms", () => {
  it("creates a session with its three regular terms, once per year", async () => {
    const created = await createSession(db, admin, {
      startYear: 2100,
      startsOn: "2100-09-01",
      endsOn: "2101-07-31",
    });
    expect(created.label).toBe("2100/2101");
    const sessionTerms = await db.select().from(terms).where(eq(terms.sessionId, created.id));
    expect(sessionTerms.map((t) => [t.termTypeCode, t.status]).sort()).toEqual([
      ["first", "planned"],
      ["second", "planned"],
      ["third", "planned"],
    ]);
    await expect(
      createSession(db, admin, { startYear: 2100, startsOn: null, endsOn: null }),
    ).rejects.toEqual(ruleError("duplicate_session"));
    await expect(
      createSession(db, registrar, { startYear: 2101, startsOn: null, endsOn: null }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(await auditFor(created.id)).toEqual(["session.created"]);
  });

  it("keeps one active session and one active term, and closes only an empty session", async () => {
    await db
      .update(academicSessions)
      .set({ status: "closed" })
      .where(eq(academicSessions.status, "active"));
    const a = await createSession(db, admin, {
      startYear: 2110,
      startsOn: "2110-09-01",
      endsOn: "2111-07-31",
    });
    const b = await createSession(db, admin, { startYear: 2111, startsOn: null, endsOn: null });
    await activateSession(db, admin, a.id);
    await expect(activateSession(db, admin, b.id)).rejects.toEqual(
      ruleError("another_session_active"),
    );
    await expect(activateSession(db, admin, a.id)).rejects.toEqual(
      ruleError("session_not_planned"),
    );

    const [first, second] = (await db.select().from(terms).where(eq(terms.sessionId, a.id))).sort(
      (x, y) => x.termTypeCode.localeCompare(y.termTypeCode),
    );
    await activateTerm(db, admin, first.id);
    await activateTerm(db, admin, second.id);
    const statuses = await db
      .select({ code: terms.termTypeCode, status: terms.status })
      .from(terms)
      .where(eq(terms.sessionId, a.id));
    expect(Object.fromEntries(statuses.map((s) => [s.code, s.status]))).toEqual({
      first: "closed",
      second: "active",
      third: "planned",
    });
    const bTerms = await db.select().from(terms).where(eq(terms.sessionId, b.id));
    await expect(activateTerm(db, admin, bTerms[0].id)).rejects.toEqual(
      ruleError("session_not_active"),
    );

    await expect(
      updateTermDates(db, admin, {
        termId: second.id,
        startsOn: "2110-08-01",
        endsOn: "2110-12-01",
      }),
    ).rejects.toEqual(ruleError("dates_outside_session"));
    expect(
      await updateTermDates(db, admin, {
        termId: second.id,
        startsOn: "2111-01-05",
        endsOn: "2111-04-01",
      }),
    ).toBe("updated");
    await expect(
      updateSessionDates(db, admin, {
        sessionId: a.id,
        startsOn: "2110-09-01",
        endsOn: "2111-03-01",
      }),
    ).rejects.toEqual(ruleError("dates_outside_session"));

    const student = await registerStudent(db, registrar, await intake(a.id));
    await expect(closeSession(db, admin, a.id)).rejects.toEqual(
      ruleError("session_has_active_enrollments"),
    );
    await changeStudentStatus(db, registrar, {
      studentId: student.id,
      to: "withdrawn",
      reason: "Left",
    });
    await closeSession(db, admin, a.id);
    const [closedSession] = await db
      .select()
      .from(academicSessions)
      .where(eq(academicSessions.id, a.id));
    expect(closedSession.status).toBe("closed");
    const [secondAfter] = await db.select().from(terms).where(eq(terms.id, second.id));
    expect(secondAfter.status).toBe("closed");
    await expect(closeTerm(db, admin, second.id)).rejects.toEqual(ruleError("term_not_active"));
  });
});

describe("read models", () => {
  it("searches by name and any registered ID, filters by status and level, and paginates", async () => {
    const session = await newSession("active");
    const ibt = await levelId(db, "IBT");
    const zainab = await registerStudent(db, registrar, {
      ...(await intake(session.id)),
      student: { ...(await intake(session.id)).student, fullName: "Zainab Qadri" },
    });
    await db.insert(studentIdentifiers).values({
      value: "OLD/V1-77",
      studentId: zainab.id,
      isPrimary: false,
      source: "v1_import",
    });

    const byName = await listStudents(db, {
      q: "qadri",
      status: "current",
      levelId: null,
      page: 1,
    });
    expect(byName.rows.map((r) => r.id)).toEqual([zainab.id]);
    expect(byName.rows[0]).toMatchObject({ levelCode: "IBT", sessionLabel: `${year - 1}/${year}` });
    const byId = await listStudents(db, {
      q: zainab.publicId.toLowerCase(),
      status: "all",
      levelId: null,
      page: 1,
    });
    expect(byId.rows.map((r) => r.id)).toEqual([zainab.id]);
    const byAlias = await listStudents(db, { q: "old/v1", status: "all", levelId: null, page: 1 });
    expect(byAlias.rows.map((r) => r.id)).toEqual([zainab.id]);
    const wildcard = await listStudents(db, { q: "%", status: "all", levelId: null, page: 1 });
    expect(wildcard.total).toBe(0);

    await changeStudentStatus(db, registrar, {
      studentId: zainab.id,
      to: "archived",
      reason: "Test",
    });
    expect(
      (await listStudents(db, { q: "qadri", status: "current", levelId: null, page: 1 })).total,
    ).toBe(0);
    expect(
      (await listStudents(db, { q: "qadri", status: "archived", levelId: null, page: 1 })).total,
    ).toBe(1);

    const atLevel = await listStudents(db, { q: null, status: "all", levelId: ibt, page: 1 });
    expect(atLevel.rows.every((r) => r.levelCode === "IBT")).toBe(true);
    for (let i = 0; i < 26; i++) await registerStudent(db, registrar, await intake(session.id));
    const page2 = await listStudents(db, { q: null, status: "current", levelId: null, page: 2 });
    expect(page2.rows.length).toBeGreaterThan(0);
    expect(page2.rows.length).toBeLessThanOrEqual(25);
    const beyond = await listStudents(db, {
      q: null,
      status: "current",
      levelId: null,
      page: 9999,
    });
    expect(beyond.page).toBe(beyond.pages);
  });

  it("builds the dashboard from real counts", async () => {
    const dashboard = await getDashboard(db);
    const [{ total }] = await db
      .select({ total: db.$count(students) })
      .from(students)
      .limit(1);
    expect(dashboard.total).toBe(total);
    expect(dashboard.session?.status).toBe("active");
    expect(dashboard.byLevel.map((l) => l.code)).toEqual(["IBT", "IDA", "THA"]);
    expect(dashboard.enrolled).toBe(dashboard.byLevel.reduce((sum, l) => sum + l.count, 0));
  });

  it("describes sign-in state without ever returning hashes or tokens", async () => {
    const session = await newSession();
    const { id } = await registerStudent(db, registrar, await intake(session.id));
    await db.insert(studentSessions).values({
      studentId: id,
      tokenHash: "b".repeat(64),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const profile = await getStudentProfile(db, id);
    expect(profile?.signIn).toEqual({ pin: null, legacy: null, openSessions: 1 });
    const json = JSON.stringify(profile);
    expect(json).not.toContain("b".repeat(64));
    expect(json).not.toMatch(/secretHash|tokenHash|\$argon2/);
  });
});
