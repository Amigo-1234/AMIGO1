import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  academicSessions,
  auditLogs,
  enrollments,
  levelSubjects,
  levels,
  resultScoreRevisions,
  resultScores,
  roles,
  staffUsers,
  subjects,
  termResults,
  terms,
  userPermissionOverrides,
  userRoles,
} from "@/db/schema";
import { createTestDatabase } from "@/db/testing/test-db";
import type { DbExecutor } from "@/db/types";
import { activateSession, activateTerm, createSession } from "../admin/academics";
import { AdminRuleError } from "../admin/common";
import { enrollStudent } from "../admin/enrollments";
import { registerStudent } from "../admin/students";
import { AuthorizationError, type StaffAccess, loadAccess } from "../staff-auth/access";
import { publishedSheetsFor, readClassResults, readStudentSheets, readSubjectRoster } from "./read";
import {
  ScoreRowsError,
  finalizeClass,
  reopenSheet,
  saveSubjectScores,
  setPublication,
} from "./services";

let db: DbExecutor;
let close: () => Promise<void>;
let admin: StaffAccess;
let academic: StaffAccess;
let registrar: StaffAccess;
let enterOnly: StaffAccess;
let n = 0;

async function staff(roleKeys: string[], grants: string[] = []): Promise<StaffAccess> {
  n += 1;
  const [row] = await db
    .insert(staffUsers)
    .values({
      authUserId: `r-${n}`,
      email: `r${n}@markaz.example`,
      fullName: `Staff ${n}`,
      status: "active",
    })
    .returning();
  for (const key of roleKeys) {
    const [role] = await db.select().from(roles).where(eq(roles.key, key));
    await db.insert(userRoles).values({ userId: row.id, roleId: role.id });
  }
  for (const permissionKey of grants)
    await db
      .insert(userPermissionOverrides)
      .values({ userId: row.id, permissionKey, effect: "grant" });
  return loadAccess(db, row);
}

const levelIdOf = async (code: string) =>
  (await db.select().from(levels).where(eq(levels.code, code)))[0].id;
const subjectsOf = async (levelCode: string) =>
  db
    .select({ id: subjects.id, code: subjects.code })
    .from(levelSubjects)
    .innerJoin(subjects, eq(subjects.id, levelSubjects.subjectId))
    .where(eq(levelSubjects.levelId, await levelIdOf(levelCode)))
    .orderBy(levelSubjects.displayOrder);

const ruleError = (code: string) => expect.objectContaining({ code });

type Class = Awaited<ReturnType<typeof setUpClass>>;
let year = 2060;

/** A current session with its first term current, and `size` IBT students. */
async function setUpClass(size = 3) {
  const session = await createSession(db, admin, {
    startYear: year++,
    startsOn: null,
    endsOn: null,
  });
  // Earlier test classes stay as closed sessions (their results remain valid there).
  await db
    .update(academicSessions)
    .set({ status: "closed" })
    .where(eq(academicSessions.status, "active"));
  await activateSession(db, admin, session.id);
  const [first] = await db
    .select()
    .from(terms)
    .where(and(eq(terms.sessionId, session.id), eq(terms.termTypeCode, "first")));
  await activateTerm(db, admin, first.id);
  const ibt = await levelIdOf("IBT");
  const students = [];
  for (let i = 0; i < size; i++) {
    const s = await registerStudent(db, admin, {
      student: {
        fullName: `Pupil ${++n}`,
        gender: null,
        dateOfBirth: null,
        phone: null,
        address: null,
        notes: null,
        admittedOn: null,
      },
      levelId: ibt,
      sessionId: session.id,
      enrollNow: true,
      guardian: null,
    });
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.studentId, s.id));
    students.push({ ...s, enrollmentId: enrollment.id });
  }
  return { session, termId: first.id, levelId: ibt, subjects: await subjectsOf("IBT"), students };
}

/** Enter the same (ca, exam) per student for every subject of the class. */
async function fillClass(cls: Class, scores: [number, number][], actor = academic) {
  for (const subject of cls.subjects) {
    const roster = await readSubjectRoster(db, actor, cls.termId, cls.levelId, subject.id);
    await saveSubjectScores(db, actor, {
      termId: cls.termId,
      levelId: cls.levelId,
      subjectId: subject.id,
      rows: cls.students.map((s, i) => ({
        enrollmentId: s.enrollmentId,
        ca: scores[i][0],
        exam: scores[i][1],
        version: roster.rows.find((r) => r.enrollmentId === s.enrollmentId)!.version,
      })),
    });
  }
}

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
  admin = await staff(["super_admin"]);
  academic = await staff(["academic_admin"]);
  registrar = await staff(["registrar"]);
  enterOnly = await staff([], ["results.read", "results.enter"]);
}, 120_000);

afterAll(async () => {
  await close?.();
});

describe("score entry", () => {
  it("saves a subject roster, records revisions with the actor, and audits the change", async () => {
    const cls = await setUpClass(2);
    const subject = cls.subjects[0];
    await saveSubjectScores(db, academic, {
      termId: cls.termId,
      levelId: cls.levelId,
      subjectId: subject.id,
      rows: [
        { enrollmentId: cls.students[0].enrollmentId, ca: 35, exam: 50, version: null },
        { enrollmentId: cls.students[1].enrollmentId, ca: 20, exam: null, version: null },
      ],
    });
    const roster = await readSubjectRoster(db, academic, cls.termId, cls.levelId, subject.id);
    expect(roster.rows.map((r) => [r.ca, r.exam])).toEqual([
      [35, 50],
      [20, null],
    ]);
    const [score] = await db.select().from(resultScores).where(eq(resultScores.ca, 35));
    expect(score.total).toBe(85);
    const [revision] = await db
      .select()
      .from(resultScoreRevisions)
      .where(eq(resultScoreRevisions.resultScoreId, score.id));
    expect(revision).toMatchObject({ caAfter: 35, examAfter: 50, changedById: academic.staffId });
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "result.scores_saved"));
    expect(audit.metadata).toMatchObject({
      level: "IBT",
      subject: subject.code,
      changes: expect.any(Array),
    });
  });

  it("refuses scores above the policy maximum or below zero, saving nothing", async () => {
    const cls = await setUpClass(2);
    const attempt = (ca: number | null, exam: number | null) =>
      saveSubjectScores(db, academic, {
        termId: cls.termId,
        levelId: cls.levelId,
        subjectId: cls.subjects[0].id,
        rows: [
          { enrollmentId: cls.students[0].enrollmentId, ca: 10, exam: 10, version: null },
          { enrollmentId: cls.students[1].enrollmentId, ca, exam, version: null },
        ],
      });
    await expect(attempt(41, 10)).rejects.toMatchObject({
      code: "score_out_of_range",
      problems: [
        { enrollmentId: cls.students[1].enrollmentId, field: "ca", code: "score_out_of_range" },
      ],
    });
    await expect(attempt(10, 61)).rejects.toBeInstanceOf(ScoreRowsError);
    await expect(attempt(-1, 10)).rejects.toMatchObject({ code: "score_out_of_range" });
    await expect(attempt(2.5, 10)).rejects.toMatchObject({ code: "score_out_of_range" });
    expect(await db.select().from(termResults).where(eq(termResults.termId, cls.termId))).toEqual(
      [],
    );
  });

  it("refuses students outside the class and subjects outside the level", async () => {
    const cls = await setUpClass(1);
    const ida = await levelIdOf("IDA");
    const outsider = await registerStudent(db, admin, {
      student: {
        fullName: "Other Level",
        gender: null,
        dateOfBirth: null,
        phone: null,
        address: null,
        notes: null,
        admittedOn: null,
      },
      levelId: ida,
      sessionId: cls.session.id,
      enrollNow: true,
      guardian: null,
    });
    const [other] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.studentId, outsider.id));
    await expect(
      saveSubjectScores(db, academic, {
        termId: cls.termId,
        levelId: cls.levelId,
        subjectId: cls.subjects[0].id,
        rows: [{ enrollmentId: other.id, ca: 10, exam: 10, version: null }],
      }),
    ).rejects.toMatchObject({ code: "enrollment_not_in_class" });
    const idaSubject = (await subjectsOf("IDA"))[0];
    await expect(
      saveSubjectScores(db, academic, {
        termId: cls.termId,
        levelId: cls.levelId,
        subjectId: idaSubject.id,
        rows: [{ enrollmentId: cls.students[0].enrollmentId, ca: 10, exam: 10, version: null }],
      }),
    ).rejects.toEqual(ruleError("subject_not_in_level"));
  });

  it("refuses staff without results.enter, and reading without results.read", async () => {
    const cls = await setUpClass(1);
    await expect(
      saveSubjectScores(db, registrar, {
        termId: cls.termId,
        levelId: cls.levelId,
        subjectId: cls.subjects[0].id,
        rows: [{ enrollmentId: cls.students[0].enrollmentId, ca: 10, exam: 10, version: null }],
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(() => readClassResults(db, registrar, cls.termId, cls.levelId)).toThrow(
      AuthorizationError,
    );
    expect(() => readStudentSheets(db, registrar, cls.students[0].id)).toThrow(AuthorizationError);
  });

  it("detects a concurrent edit instead of silently overwriting it", async () => {
    const cls = await setUpClass(1);
    const subjectId = cls.subjects[0].id;
    const row = (ca: number, version: string | null) => ({
      termId: cls.termId,
      levelId: cls.levelId,
      subjectId,
      rows: [{ enrollmentId: cls.students[0].enrollmentId, ca, exam: 30, version }],
    });
    // Both editors loaded the empty roster (version null). The first save wins.
    await saveSubjectScores(db, academic, row(25, null));
    await expect(saveSubjectScores(db, admin, row(30, null))).rejects.toMatchObject({
      code: "score_conflict",
    });
    // Reloading gives the current version; then the second editor can save.
    const roster = await readSubjectRoster(db, admin, cls.termId, cls.levelId, subjectId);
    const result = await saveSubjectScores(db, admin, row(30, roster.rows[0].version));
    expect(result.saved).toBe(1);
    expect(
      await db.select().from(termResults).where(eq(termResults.termId, cls.termId)),
    ).toHaveLength(1);
  });

  it("does not accept results for the Legacy term or a planned term", async () => {
    const cls = await setUpClass(1);
    const [second] = await db
      .select()
      .from(terms)
      .where(and(eq(terms.sessionId, cls.session.id), eq(terms.termTypeCode, "second")));
    await expect(
      saveSubjectScores(db, academic, {
        termId: second.id,
        levelId: cls.levelId,
        subjectId: cls.subjects[0].id,
        rows: [{ enrollmentId: cls.students[0].enrollmentId, ca: 1, exam: 1, version: null }],
      }),
    ).rejects.toEqual(ruleError("term_not_open"));
  });
});

describe("review, finalization and publication", () => {
  it("computes totals, grades, averages and tied positions on the server", async () => {
    const cls = await setUpClass(4);
    await fillClass(cls, [
      [30, 40],
      [35, 50],
      [30, 40],
      [10, 20],
    ]);
    await finalizeClass(db, academic, {
      termId: cls.termId,
      levelId: cls.levelId,
      includeIncomplete: false,
    });
    const result = await readClassResults(db, academic, cls.termId, cls.levelId);
    const byId = new Map(result.students.map((s) => [s.enrollmentId, s]));
    const [a, b, c, d] = cls.students.map((s) => byId.get(s.enrollmentId)!);
    expect(a.outcomes[0]).toMatchObject({
      total: 70,
      band: { grade: "A", remarkEn: "Excellent" },
      passed: true,
    });
    expect(d.outcomes[0]).toMatchObject({ total: 30, band: { grade: "F" }, passed: false });
    expect(a.summary).toMatchObject({ complete: true, average: 70, passed: true });
    expect([b.position, a.position, c.position, d.position]).toEqual([1, 2, 2, 4]);
    expect(result.ranked).toBe(4);
  });

  it("finalizes complete sheets, leaves incomplete ones unless confirmed, and locks finalized sheets", async () => {
    const cls = await setUpClass(2);
    // Student 0 complete in every subject; student 1 has only one subject.
    await fillClass({ ...cls, students: [cls.students[0]] }, [[30, 40]]);
    await saveSubjectScores(db, academic, {
      termId: cls.termId,
      levelId: cls.levelId,
      subjectId: cls.subjects[0].id,
      rows: [{ enrollmentId: cls.students[1].enrollmentId, ca: 10, exam: 10, version: null }],
    });
    expect(
      await finalizeClass(db, academic, {
        termId: cls.termId,
        levelId: cls.levelId,
        includeIncomplete: false,
      }),
    ).toEqual({
      finalized: 1,
      skippedIncomplete: 1,
    });
    const roster = await readSubjectRoster(
      db,
      academic,
      cls.termId,
      cls.levelId,
      cls.subjects[0].id,
    );
    await expect(
      saveSubjectScores(db, academic, {
        termId: cls.termId,
        levelId: cls.levelId,
        subjectId: cls.subjects[0].id,
        rows: [
          {
            enrollmentId: cls.students[0].enrollmentId,
            ca: 1,
            exam: 1,
            version: roster.rows[0].version,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "sheet_finalized" });
    expect(
      await finalizeClass(db, academic, {
        termId: cls.termId,
        levelId: cls.levelId,
        includeIncomplete: true,
      }),
    ).toEqual({
      finalized: 1,
      skippedIncomplete: 0,
    });
  });

  it("warns before publishing an incomplete class and needs results.publish", async () => {
    const cls = await setUpClass(2);
    await fillClass({ ...cls, students: [cls.students[0]] }, [[30, 40]]);
    await finalizeClass(db, academic, {
      termId: cls.termId,
      levelId: cls.levelId,
      includeIncomplete: false,
    });
    await expect(
      setPublication(db, enterOnly, { termId: cls.termId, levelId: cls.levelId, publish: true }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      setPublication(db, academic, { termId: cls.termId, levelId: cls.levelId, publish: true }),
    ).rejects.toEqual(ruleError("publication_incomplete"));
    await setPublication(db, academic, {
      termId: cls.termId,
      levelId: cls.levelId,
      publish: true,
      acknowledgeIncomplete: true,
    });
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "result.published"), eq(auditLogs.targetId, cls.termId)));
    expect(audit.metadata).toMatchObject({
      scope: "level",
      level: "IBT",
      acknowledgedIncomplete: true,
      readiness: { enrolled: 2, finalizedComplete: 1, noResults: 1 },
    });
    await expect(
      setPublication(db, academic, { termId: cls.termId, levelId: cls.levelId, publish: false }),
    ).rejects.toEqual(ruleError("reason_required"));
    await setPublication(db, academic, {
      termId: cls.termId,
      levelId: cls.levelId,
      publish: false,
      reason: "Correction pending",
    });
  });
});

describe("what students see", () => {
  it("shows only the student's own finalized sheets, once both switches are published", async () => {
    const cls = await setUpClass(2);
    await fillClass(cls, [
      [30, 40],
      [20, 30],
    ]);
    const me = { student: { id: cls.students[0].id } };
    // Draft: hidden.
    expect(await publishedSheetsFor(db, me)).toEqual([]);
    await finalizeClass(db, academic, {
      termId: cls.termId,
      levelId: cls.levelId,
      includeIncomplete: false,
    });
    // Finalized but not published: hidden.
    expect(await publishedSheetsFor(db, me)).toEqual([]);
    await setPublication(db, academic, { termId: cls.termId, levelId: cls.levelId, publish: true });
    // Level switch on, school-wide switch off: still hidden.
    expect(await publishedSheetsFor(db, me)).toEqual([]);
    await setPublication(db, academic, { termId: cls.termId, levelId: null, publish: true });
    const visible = await publishedSheetsFor(db, me);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ levelCode: "IBT", position: 1, ranked: 2 });
    expect(visible[0].lines[0].outcome).toMatchObject({ ca: 30, exam: 40, total: 70 });
    // Never another student's sheet.
    const other = await publishedSheetsFor(db, { student: { id: cls.students[1].id } });
    expect(other.map((s) => s.enrollmentId)).toEqual([cls.students[1].enrollmentId]);

    // Correction in place: reopening hides the sheet until it is finalized again.
    await expect(
      reopenSheet(db, enterOnly, {
        termId: cls.termId,
        levelId: cls.levelId,
        enrollmentId: cls.students[0].enrollmentId,
        reason: "Exam script re-marked",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      reopenSheet(db, academic, {
        termId: cls.termId,
        levelId: cls.levelId,
        enrollmentId: cls.students[0].enrollmentId,
        reason: "",
      }),
    ).rejects.toEqual(ruleError("reason_required"));
    await reopenSheet(db, academic, {
      termId: cls.termId,
      levelId: cls.levelId,
      enrollmentId: cls.students[0].enrollmentId,
      reason: "Exam script re-marked",
    });
    expect(await publishedSheetsFor(db, me)).toEqual([]);
    const [reopened] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "result.sheet_reopened"));
    expect(reopened.metadata).toMatchObject({
      publishedAtTheTime: true,
      reason: "Exam script re-marked",
    });
  });

  it("keeps an old sheet in the level it was earned in after the student moves on", async () => {
    const cls = await setUpClass(1);
    await fillClass(cls, [[30, 40]]);
    await finalizeClass(db, academic, {
      termId: cls.termId,
      levelId: cls.levelId,
      includeIncomplete: false,
    });
    // The student is later placed in IDA in a new session (manual stand-in for promotion).
    await db
      .update(enrollments)
      .set({ status: "promoted" })
      .where(eq(enrollments.id, cls.students[0].enrollmentId));
    const next = await createSession(db, admin, {
      startYear: year++,
      startsOn: null,
      endsOn: null,
    });
    await enrollStudent(db, admin, {
      studentId: cls.students[0].id,
      sessionId: next.id,
      levelId: await levelIdOf("IDA"),
    });
    const sheets = await readStudentSheets(db, academic, cls.students[0].id);
    expect(sheets.map((s) => [s.sessionLabel, s.levelCode])).toEqual([[cls.session.label, "IBT"]]);
  });
});

describe("rule errors", () => {
  it("are AdminRuleErrors carrying only a code", () => {
    const error = new ScoreRowsError("score_conflict", []);
    expect(error).toBeInstanceOf(AdminRuleError);
    expect(error.message).toBe("score_conflict");
  });
});
