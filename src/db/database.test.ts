import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setTransactionActor } from "./actor";
import {
  academicSessions,
  auditLogs,
  enrollments,
  feeCharges,
  gradeBands,
  gradingPolicies,
  payments,
  promotions,
  resultPublications,
  resultScoreRevisions,
  resultScores,
  studentCredentials,
  studentIdentifiers,
  students,
  subjects,
  termResults,
} from "./schema";
import { seedDatabase } from "./seed";
import { allocateStudentId } from "./student-ids";
import { createTestDatabase, expectDbError } from "./testing/test-db";
import { createSession, createStaff, createStudent, enroll } from "./testing/fixtures";
import type { DbExecutor } from "./types";

let db: DbExecutor;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
}, 120_000);

afterAll(async () => {
  await close?.();
});

// Each test that needs its own session takes the next unused start year.
let nextYear = 2050;
const freshYear = () => nextYear++;

const FAKE_HASH = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGhhc2hoYXNoaGFzaA";

async function subjectId(code: string) {
  const [row] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.code, code));
  return row.id;
}

describe("migrations and seed", () => {
  it("seeding again inserts nothing", async () => {
    const summary = await seedDatabase(db);
    expect(Object.values(summary).every((n) => n === 0)).toBe(true);
  });
});

describe("student identity", () => {
  it("rejects a student without a registered primary identifier at commit", async () => {
    await expectDbError(
      db.transaction(async (tx) => {
        await tx.insert(students).values({ publicId: "MGIBT-2020-001", fullName: "No Registry" });
      }),
      /students_public_id_registered|primary identifier/,
    );
  });

  it("never lets an ID (or alias) belong to two students", async () => {
    const first = await createStudent(db, "MGIBT-2020-002");
    await expectDbError(createStudent(db, "MGIBT-2020-002"), /duplicate key/);

    // A V1 alias for the first student cannot later become someone else's ID.
    await db.insert(studentIdentifiers).values({
      value: "MGIBT-2019-050",
      studentId: first.id,
      isPrimary: false,
      source: "v1_import",
      levelCode: "IBT",
      year: 2019,
      serial: 50,
    });
    await expectDbError(createStudent(db, "MGIBT-2019-050"), /duplicate key/);
  });

  it("keeps public IDs and identifiers immutable and students undeletable", async () => {
    const student = await createStudent(db, "MGIBT-2020-003");
    await expectDbError(
      db.update(students).set({ publicId: "MGIBT-2020-999" }).where(eq(students.id, student.id)),
      /public ID cannot change/,
    );
    await expectDbError(
      db
        .update(studentIdentifiers)
        .set({ isPrimary: false })
        .where(eq(studentIdentifiers.value, "MGIBT-2020-003")),
      /append-only/,
    );
    await expectDbError(
      db.delete(students).where(eq(students.id, student.id)),
      /cannot be deleted/,
    );
    await expectDbError(
      db.delete(studentIdentifiers).where(eq(studentIdentifiers.value, "MGIBT-2020-003")),
      /cannot be deleted/,
    );
  });

  it("requires the official format for V2 IDs but preserves imported V1 IDs as-is", async () => {
    await expectDbError(createStudent(db, "MG-IBT-2020-4"), /public_id_format|identifiers_format/);
    const imported = await createStudent(db, "MGIBT-2025-01", { source: "v1_import" });
    expect(imported.publicId).toBe("MGIBT-2025-01");
  });
});

describe("student ID allocation", () => {
  it("issues sequential IDs and skips past every registered ID, aliases included", async () => {
    const issue = async () =>
      db.transaction(async (tx) => {
        const id = await allocateStudentId(tx, { levelCode: "IDA", year: 2030 });
        return (await createStudentInTx(tx, id)).publicId;
      });

    expect(await issue()).toBe("MGIDA-2030-001");
    expect(await issue()).toBe("MGIDA-2030-002");

    // An imported V1 alias with a higher serial is never reissued.
    const holder = await createStudent(db, "MGIDA-2030-500", { source: "v1_import" });
    expect(holder.publicId).toBe("MGIDA-2030-500");
    expect(await issue()).toBe("MGIDA-2030-501");
  });

  it("does not consume a serial when the registration rolls back", async () => {
    await expectDbError(
      db.transaction(async (tx) => {
        await allocateStudentId(tx, { levelCode: "THA", year: 2031 });
        throw new Error("registration failed");
      }),
      /registration failed/,
    );
    const id = await db.transaction((tx) =>
      allocateStudentId(tx, { levelCode: "THA", year: 2031 }),
    );
    expect(id).toBe("MGTHA-2031-001");
  });
});

async function createStudentInTx(tx: DbExecutor, publicId: string) {
  const [student] = await tx
    .insert(students)
    .values({ publicId, fullName: "Allocated" })
    .returning();
  const [, levelCode, year, serial] = /^MG([A-Z]+)-(\d+)-(\d+)$/.exec(publicId)!;
  await tx.insert(studentIdentifiers).values({
    value: publicId,
    studentId: student.id,
    isPrimary: true,
    source: "v2",
    levelCode,
    year: Number(year),
    serial: Number(serial),
  });
  return student;
}

describe("sessions, terms and enrollments", () => {
  it("derives the session label and allows only one active session", async () => {
    const { session } = await createSession(db, 2040, "active");
    expect(session.label).toBe("2040/2041");
    await expectDbError(createSession(db, 2041, "active"), /academic_sessions_single_active/);
  });

  it("locks a grading policy once a session using it leaves planning", async () => {
    const [policy] = await db
      .insert(gradingPolicies)
      .values({ name: "Lock test policy", caMax: 40, examMax: 60 })
      .returning();
    await db
      .insert(gradeBands)
      .values({ policyId: policy.id, grade: "A", minScore: 0, maxScore: 100 });
    const [session] = await db
      .insert(academicSessions)
      .values({ startYear: freshYear(), gradingPolicyId: policy.id })
      .returning();

    // Still planned: the policy can be adjusted.
    await db.update(gradeBands).set({ minScore: 1 }).where(eq(gradeBands.policyId, policy.id));

    await db
      .update(academicSessions)
      .set({ status: "closed" })
      .where(eq(academicSessions.id, session.id));
    await expectDbError(
      db.update(gradeBands).set({ minScore: 0 }).where(eq(gradeBands.policyId, policy.id)),
      /locked grading policy/,
    );
    await expectDbError(
      db
        .update(gradingPolicies)
        .set({ caMax: 30, examMax: 70 })
        .where(eq(gradingPolicies.id, policy.id)),
      /locked/,
    );
  });

  it("allows one enrollment per session and one active enrollment per student", async () => {
    const a = await createSession(db, 2042);
    const b = await createSession(db, 2043);
    const student = await createStudent(db, "MGIBT-2042-001");
    await enroll(db, student.id, a.session.id);
    await expectDbError(enroll(db, student.id, a.session.id), /enrollments_student_session_unique/);
    await expectDbError(enroll(db, student.id, b.session.id), /enrollments_single_active/);
  });
});

describe("results", () => {
  async function sheet() {
    const year = freshYear();
    const { session, terms } = await createSession(db, year);
    const student = await createStudent(db, `MGIBT-${year}-001`);
    const enrollment = await enroll(db, student.id, session.id);
    const [termResult] = await db
      .insert(termResults)
      .values({ enrollmentId: enrollment.id, sessionId: session.id, termId: terms.first.id })
      .returning();
    return { session, terms, enrollment, termResult };
  }

  it("rejects a result sheet whose term belongs to another session", async () => {
    const { enrollment, session } = await sheet();
    const other = await createSession(db, freshYear());
    await expectDbError(
      db.insert(termResults).values({
        enrollmentId: enrollment.id,
        sessionId: session.id,
        termId: other.terms.first.id,
      }),
      /term_results_term_session_fk/,
    );
  });

  it("keeps blanks blank, computes totals and enforces policy maxima", async () => {
    const { termResult } = await sheet();
    const [blank] = await db
      .insert(resultScores)
      .values({ termResultId: termResult.id, subjectId: await subjectId("IBT-TAJWEED"), ca: 35 })
      .returning();
    expect(blank.exam).toBeNull();
    expect(blank.total).toBeNull();

    const [full] = await db
      .update(resultScores)
      .set({ exam: 40 })
      .where(eq(resultScores.id, blank.id))
      .returning();
    expect(full.total).toBe(75);

    await expectDbError(
      db.update(resultScores).set({ ca: 41 }).where(eq(resultScores.id, blank.id)),
      /CA score 41 exceeds the maximum of 40/,
    );
    await expectDbError(
      db.update(resultScores).set({ exam: 61 }).where(eq(resultScores.id, blank.id)),
      /Exam score 61 exceeds the maximum of 60/,
    );
    await expectDbError(
      db.update(resultScores).set({ ca: -1 }).where(eq(resultScores.id, blank.id)),
      /result_scores_ca_range/,
    );
    await expectDbError(
      db.delete(resultScores).where(eq(resultScores.id, blank.id)),
      /cannot be deleted/,
    );
  });

  it("records every change with the acting staff member and reason", async () => {
    const { termResult } = await sheet();
    const staff = await createStaff(db);
    // Resolve outside the transaction: PGlite has a single connection.
    const arabic = await subjectId("IBT-ARABIC");
    const score = await db.transaction(async (tx) => {
      await setTransactionActor(tx, { actorId: staff.id });
      const [row] = await tx
        .insert(resultScores)
        .values({
          termResultId: termResult.id,
          subjectId: arabic,
          ca: 30,
          exam: 50,
        })
        .returning();
      return row;
    });
    await db.transaction(async (tx) => {
      await setTransactionActor(tx, { actorId: staff.id, reason: "Marking error" });
      await tx.update(resultScores).set({ exam: 55 }).where(eq(resultScores.id, score.id));
    });

    const revisions = await db
      .select()
      .from(resultScoreRevisions)
      .where(eq(resultScoreRevisions.resultScoreId, score.id))
      .orderBy(resultScoreRevisions.id);
    expect(revisions).toHaveLength(2);
    expect(revisions[1]).toMatchObject({
      examBefore: 50,
      examAfter: 55,
      changedById: staff.id,
      reason: "Marking error",
    });
    await expectDbError(
      db
        .update(resultScoreRevisions)
        .set({ reason: "edited" })
        .where(eq(resultScoreRevisions.id, revisions[0].id)),
      /append-only/,
    );
  });

  it("locks scores on a finalized sheet", async () => {
    const { termResult } = await sheet();
    const [score] = await db
      .insert(resultScores)
      .values({
        termResultId: termResult.id,
        subjectId: await subjectId("IBT-FIQH"),
        ca: 20,
        exam: 30,
      })
      .returning();
    await db
      .update(termResults)
      .set({ status: "finalized", finalizedAt: new Date() })
      .where(eq(termResults.id, termResult.id));
    await expectDbError(
      db.update(resultScores).set({ ca: 25 }).where(eq(resultScores.id, score.id)),
      /finalized/,
    );
  });

  it("has exactly one school-wide publication switch per term", async () => {
    const { terms } = await sheet();
    await db.insert(resultPublications).values({ termId: terms.first.id });
    await expectDbError(
      db.insert(resultPublications).values({ termId: terms.first.id }),
      /result_publications_term_level_unique/,
    );
  });
});

describe("fee ledger", () => {
  async function ledger() {
    const year = freshYear();
    const { session } = await createSession(db, year);
    const student = await createStudent(db, `MGTHA-${year}-001`);
    const enrollment = await enroll(db, student.id, session.id, "THA");
    const staff = await createStaff(db);
    return { session, enrollment, staff };
  }

  it("computes balances from posted charges and payments in kobo", async () => {
    const { session, enrollment, staff } = await ledger();
    await db.insert(feeCharges).values({
      enrollmentId: enrollment.id,
      sessionId: session.id,
      description: "Session fee",
      amountKobo: 4_000_000,
      createdById: staff.id,
    });
    for (const [n, amount] of [1_000_000, 1_500_000, 1_500_000].entries()) {
      await db.insert(payments).values({
        receiptNumber: `TEST-${enrollment.id}-${n}`,
        enrollmentId: enrollment.id,
        sessionId: session.id,
        amountKobo: amount,
        paidOn: "2026-10-01",
        method: "cash",
        recordedById: staff.id,
      });
    }
    const [{ outstanding }] = await db
      .execute<{ outstanding: string }>(
        sql`
      SELECT (
        (SELECT coalesce(sum(amount_kobo), 0) FROM fee_charges WHERE enrollment_id = ${enrollment.id} AND status = 'posted')
        - (SELECT coalesce(sum(amount_kobo), 0) FROM payments WHERE enrollment_id = ${enrollment.id} AND status = 'posted')
      )::text AS outstanding`,
      )
      .then((r) => (r as unknown as { rows: { outstanding: string }[] }).rows);
    expect(outstanding).toBe("0");
  });

  it("rejects invalid amounts and incomplete V2 payments", async () => {
    const { session, enrollment, staff } = await ledger();
    const base = {
      enrollmentId: enrollment.id,
      sessionId: session.id,
      paidOn: "2026-10-01",
      method: "cash" as const,
      recordedById: staff.id,
    };
    await expectDbError(
      db.insert(payments).values({ ...base, receiptNumber: "R-ZERO", amountKobo: 0 }),
      /payments_amount_positive/,
    );
    await expectDbError(
      db.insert(payments).values({ ...base, receiptNumber: null, amountKobo: 100 }),
      /payments_v2_complete/,
    );
  });

  it("allows only voiding, with a reason, and never deletion", async () => {
    const { session, enrollment, staff } = await ledger();
    const [payment] = await db
      .insert(payments)
      .values({
        receiptNumber: `R-${enrollment.id}`,
        enrollmentId: enrollment.id,
        sessionId: session.id,
        amountKobo: 500_000,
        paidOn: "2026-10-02",
        method: "bank_transfer",
        recordedById: staff.id,
      })
      .returning();

    await expectDbError(
      db.update(payments).set({ amountKobo: 600_000 }).where(eq(payments.id, payment.id)),
      /cannot be edited/,
    );
    await expectDbError(
      db
        .update(payments)
        .set({ status: "voided", voidedAt: new Date() })
        .where(eq(payments.id, payment.id)),
      /payments_void_consistent/,
    );
    await expectDbError(
      db
        .update(payments)
        .set({ status: "voided", voidedAt: new Date(), voidReason: "x", amountKobo: 1 })
        .where(eq(payments.id, payment.id)),
      /cannot change its other values/,
    );
    await db
      .update(payments)
      .set({
        status: "voided",
        voidedAt: new Date(),
        voidedById: staff.id,
        voidReason: "Duplicate entry",
      })
      .where(eq(payments.id, payment.id));
    await expectDbError(
      db
        .update(payments)
        .set({ status: "posted", voidedAt: null, voidReason: null })
        .where(eq(payments.id, payment.id)),
      /is voided/,
    );
    await expectDbError(
      db.delete(payments).where(eq(payments.id, payment.id)),
      /cannot be deleted/,
    );
  });
});

describe("student credentials", () => {
  it("accepts only password-hash strings and one active credential per kind", async () => {
    const student = await createStudent(db, "MGIBT-2195-001");
    await expectDbError(
      db
        .insert(studentCredentials)
        .values({ studentId: student.id, kind: "pin", secretHash: "123456" }),
      /student_credentials_hash_format/,
    );
    const [pin] = await db
      .insert(studentCredentials)
      .values({ studentId: student.id, kind: "pin", secretHash: FAKE_HASH })
      .returning();
    await expectDbError(
      db
        .insert(studentCredentials)
        .values({ studentId: student.id, kind: "pin", secretHash: FAKE_HASH }),
      /student_credentials_one_active_per_kind/,
    );
    await expectDbError(
      db
        .update(studentCredentials)
        .set({ secretHash: `${FAKE_HASH}x` })
        .where(eq(studentCredentials.id, pin.id)),
      /cannot be edited/,
    );
    await db
      .update(studentCredentials)
      .set({ revokedAt: new Date(), revokedReason: "PIN reset" })
      .where(eq(studentCredentials.id, pin.id));
    await db
      .insert(studentCredentials)
      .values({ studentId: student.id, kind: "pin", secretHash: FAKE_HASH });
  });
});

describe("audit log and promotions", () => {
  it("is append-only and attributes every entry consistently", async () => {
    const staff = await createStaff(db);
    const [entry] = await db
      .insert(auditLogs)
      .values({
        actorType: "staff",
        actorUserId: staff.id,
        action: "student.registered",
        targetType: "student",
      })
      .returning();
    await expectDbError(
      db.update(auditLogs).set({ action: "student.edited" }).where(eq(auditLogs.id, entry.id)),
      /append-only/,
    );
    await expectDbError(
      db.delete(auditLogs).where(eq(auditLogs.id, entry.id)),
      /cannot be deleted/,
    );
    await expectDbError(
      db.insert(auditLogs).values({ actorType: "staff", action: "student.registered" }),
      /audit_logs_actor_consistent/,
    );
    await expectDbError(
      db.insert(auditLogs).values({ actorType: "system", action: "Student Registered" }),
      /audit_logs_action_format/,
    );
  });

  it("requires graduation to have no next enrollment and allows one decision per enrollment", async () => {
    const { session } = await createSession(db, 2196);
    const next = await createSession(db, 2197);
    const student = await createStudent(db, "MGTHA-2196-001");
    const from = await enroll(db, student.id, session.id, "THA");
    await db.update(enrollments).set({ status: "graduated" }).where(eq(enrollments.id, from.id));
    const to = await enroll(db, student.id, next.session.id, "THA");

    await expectDbError(
      db.insert(promotions).values({
        studentId: student.id,
        fromEnrollmentId: from.id,
        toEnrollmentId: to.id,
        outcome: "graduated",
      }),
      /promotions_target_matches_outcome/,
    );
    await db
      .insert(promotions)
      .values({ studentId: student.id, fromEnrollmentId: from.id, outcome: "graduated" });
    await expectDbError(
      db
        .insert(promotions)
        .values({ studentId: student.id, fromEnrollmentId: from.id, outcome: "graduated" }),
      /duplicate key/,
    );
  });
});
