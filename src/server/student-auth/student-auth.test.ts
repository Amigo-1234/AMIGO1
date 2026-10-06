import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogs,
  authThrottles,
  studentCredentials,
  studentIdentifiers,
  studentSessions,
  students,
  systemSettings,
} from "@/db/schema";
import { createStudent } from "@/db/testing/fixtures";
import { createTestDatabase } from "@/db/testing/test-db";
import type { DbExecutor } from "@/db/types";
import { sha256Hex } from "../auth/crypto";
import { classifySecret, isValidPin, isWeakPin } from "./rules";
import {
  LEGACY_LOGIN_SETTING,
  completeLegacyPinMigration,
  setStudentCredential,
  signInStudent,
  studentIdThrottleKey,
} from "./service";
import { findStudentSession, revokeStudentSession } from "./sessions";

const AUTH_SECRET = "test-student-auth-secret-0123456789abcdef";
const T0 = new Date("2026-10-06T08:00:00Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

let db: DbExecutor;
let close: () => Promise<void>;
let serial = 0;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
}, 120_000);

afterAll(async () => {
  await close?.();
});

/** A student with a 6-digit PIN (and optionally a legacy V1 password). */
async function studentWithPin(pin = "482913", { legacy }: { legacy?: string } = {}) {
  serial += 1;
  const publicId = `MGIBT-2031-${String(serial).padStart(3, "0")}`;
  const student = await createStudent(db, publicId, { fullName: `Student ${serial}` });
  if (pin)
    await setStudentCredential(db, {
      studentId: student.id,
      kind: "pin",
      plain: pin,
      authSecret: AUTH_SECRET,
      now: T0,
    });
  if (legacy) {
    await setStudentCredential(db, {
      studentId: student.id,
      kind: "legacy_v1_password",
      plain: legacy,
      authSecret: AUTH_SECRET,
      now: T0,
    });
  }
  return { ...student, publicId };
}

const signIn = (studentId: string, secret: string, now = T0, ipAddress: string | null = null) =>
  signInStudent(db, { studentId, secret, authSecret: AUTH_SECRET, now, ipAddress });

async function setLegacyLogin(enabled: boolean) {
  await db
    .update(systemSettings)
    .set({ value: enabled })
    .where(eq(systemSettings.key, LEGACY_LOGIN_SETTING));
}

describe("PIN rules", () => {
  it("accepts exactly six digits only", () => {
    expect(isValidPin("012345")).toBe(true);
    for (const bad of ["12345", "1234567", "12345a", "123 456", " 123456", "١٢٣٤٥٦", ""]) {
      expect(isValidPin(bad), bad).toBe(false);
    }
  });

  it("rejects predictable new PINs", () => {
    const weak = [
      // one digit repeated
      "000000",
      "111111",
      "777777",
      // steady runs up or down, including wrap-around
      "012345",
      "123456",
      "456789",
      "890123",
      "987654",
      "654321",
      "098765",
      // short repeated blocks
      "121212",
      "909090",
      "123123",
      "456456",
      // reads the same backwards
      "123321",
      "145541",
      "900009",
      // doubled steady runs
      "112233",
      "998877",
      "001122",
    ];
    for (const pin of weak) expect(isWeakPin(pin), pin).toBe(true);
  });

  it("accepts ordinary PINs", () => {
    for (const pin of ["482913", "583920", "102938", "750314", "111222", "135790", "246810"]) {
      expect(isWeakPin(pin), pin).toBe(false);
    }
    expect(isWeakPin("12345")).toBe(false); // not a PIN at all: reported as invalid, not weak
  });

  it("treats short secrets as V1 passwords only while legacy sign-in is enabled", () => {
    expect(classifySecret("abc", true)).toBe("legacy_v1_password");
    expect(classifySecret("abc", false)).toBeNull();
    expect(classifySecret("123456", false)).toBe("pin");
    expect(classifySecret("abcd", true)).toBeNull();
  });
});

describe("student sign-in", () => {
  it("signs in with the permanent ID and PIN, storing only a token hash", async () => {
    const s = await studentWithPin("482913");
    const result = await signIn(s.publicId, "482913");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.mustSetPin).toBe(false);
    expect(result.token.length).toBeGreaterThanOrEqual(43);

    const [row] = await db
      .select()
      .from(studentSessions)
      .where(eq(studentSessions.tokenHash, sha256Hex(result.token)));
    expect(row.studentId).toBe(s.id);
    const stored = JSON.stringify(await db.select().from(studentSessions));
    expect(stored).not.toContain(result.token);
  });

  it("accepts the ID in any case and with spaces", async () => {
    const s = await studentWithPin("558143");
    const typed = ` ${s.publicId.toLowerCase().replaceAll("-", " ")} `;
    expect((await signIn(typed, "558143")).status).toBe("ok");
  });

  it("rejects a wrong PIN and an unknown ID with the same result", async () => {
    const s = await studentWithPin("482913");
    expect(await signIn(s.publicId, "000000")).toEqual({ status: "invalid_credentials" });
    expect(await signIn("MGIBT-2099-999", "482913")).toEqual({ status: "invalid_credentials" });
  });

  it("rejects malformed PINs before checking anything", async () => {
    const s = await studentWithPin("482913");
    for (const bad of ["48291", "4829130", "48291a", "482 913", ""]) {
      expect(await signIn(s.publicId, bad), bad).toEqual({ status: "invalid_input" });
    }
    expect(await signIn("", "482913")).toEqual({ status: "invalid_input" });
    // Malformed input does not count towards throttling.
    const { key } = studentIdThrottleKey(AUTH_SECRET, s.publicId);
    expect(await db.select().from(authThrottles).where(eq(authThrottles.key, key))).toEqual([]);
  });

  it("resolves a registered V1 alias to the same student", async () => {
    const s = await studentWithPin("246810");
    await db.insert(studentIdentifiers).values({
      value: "MGIBT-2024-077",
      studentId: s.id,
      isPrimary: false,
      source: "v1_import",
      levelCode: "IBT",
      year: 2024,
      serial: 77,
    });
    const result = await signIn("MGIBT-2024-077", "246810");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const session = await findStudentSession(db, result.token, T0);
      expect(session?.student.publicId).toBe(s.publicId);
    }
  });

  it("refuses students who may not sign in, but only after correct credentials", async () => {
    const s = await studentWithPin("135790");
    await db.update(students).set({ status: "suspended" }).where(eq(students.id, s.id));
    expect(await signIn(s.publicId, "000000")).toEqual({ status: "invalid_credentials" });
    expect(await signIn(s.publicId, "135790")).toEqual({ status: "unavailable" });
  });

  it("ends existing sessions of a student who is disabled later", async () => {
    const s = await studentWithPin("118273");
    const result = await signIn(s.publicId, "118273");
    if (result.status !== "ok") throw new Error("sign-in failed");
    await db.update(students).set({ status: "archived" }).where(eq(students.id, s.id));
    expect(await findStudentSession(db, result.token, minutes(1))).toBeNull();
    await db.update(students).set({ status: "active" }).where(eq(students.id, s.id));
    expect(await findStudentSession(db, result.token, minutes(2))).toBeNull(); // revoked, not just hidden
  });
});

describe("throttling", () => {
  it("locks an ID temporarily after repeated failures, for real and unknown IDs alike", async () => {
    const s = await studentWithPin("999111");
    for (let i = 0; i < 5; i++)
      expect((await signIn(s.publicId, "000000", minutes(0))).status).toBe("invalid_credentials");
    // Locked: even the correct PIN is not checked.
    expect((await signIn(s.publicId, "999111", minutes(0))).status).toBe("throttled");
    // Unknown IDs are throttled identically.
    for (let i = 0; i < 5; i++) await signIn("MGIBT-2098-001", "000000", minutes(0));
    expect((await signIn("MGIBT-2098-001", "000000", minutes(0))).status).toBe("throttled");
    // The lock expires; it is never permanent.
    expect((await signIn(s.publicId, "999111", minutes(2))).status).toBe("ok");
  });

  it("escalates the pause for repeated failures", async () => {
    const s = await studentWithPin("777888");
    for (let i = 0; i < 5; i++) await signIn(s.publicId, "000000", minutes(0)); // 5 → 1 min
    // While locked, attempts are refused without being counted, so wait out each pause.
    await signIn(s.publicId, "000000", minutes(2)); // 6 → 1 min (until 3)
    await signIn(s.publicId, "000000", minutes(4)); // 7 → 1 min (until 5)
    await signIn(s.publicId, "000000", minutes(6)); // 8 → 5 min (until 11)
    const r = await signIn(s.publicId, "777888", minutes(8));
    expect(r.status).toBe("throttled");
    if (r.status === "throttled") expect(r.retryAfter.getTime()).toBe(minutes(11).getTime());
    expect((await signIn(s.publicId, "777888", minutes(12))).status).toBe("ok");
  });

  it("resets the ID's failure count after a successful sign-in", async () => {
    const s = await studentWithPin("305172");
    for (let i = 0; i < 4; i++) await signIn(s.publicId, "000000");
    expect((await signIn(s.publicId, "305172")).status).toBe("ok");
    for (let i = 0; i < 4; i++) await signIn(s.publicId, "000000");
    expect((await signIn(s.publicId, "305172")).status).toBe("ok"); // would be throttled without the reset
  });

  it("throttles one network address guessing across many IDs", async () => {
    const ip = "198.51.100.7";
    for (let i = 0; i < 50; i++)
      await signIn(`MGIBT-2097-${String(i + 1).padStart(3, "0")}`, "000000", T0, ip);
    const s = await studentWithPin("516283");
    expect((await signIn(s.publicId, "516283", T0, ip)).status).toBe("throttled");
    expect((await signIn(s.publicId, "516283", T0, "203.0.113.9")).status).toBe("ok");
  });

  it("stores only keyed hashes, never the raw ID or address", async () => {
    const keys = (await db.select({ key: authThrottles.key }).from(authThrottles)).map(
      (r) => r.key,
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toMatch(/^(student-id|ip):[0-9a-f]{64}$/);
    }
  });
});

describe("sessions", () => {
  it("expire after their lifetime", async () => {
    const s = await studentWithPin("427193");
    const r = await signIn(s.publicId, "427193");
    if (r.status !== "ok") throw new Error("sign-in failed");
    expect(await findStudentSession(db, r.token, minutes(60))).not.toBeNull();
    expect(await findStudentSession(db, r.token, new Date(r.expiresAt.getTime() + 1))).toBeNull();
  });

  it("are invalidated by sign-out and cannot be replayed", async () => {
    const s = await studentWithPin("619284");
    const r = await signIn(s.publicId, "619284");
    if (r.status !== "ok") throw new Error("sign-in failed");
    await revokeStudentSession(db, r.token, minutes(1));
    expect(await findStudentSession(db, r.token, minutes(1))).toBeNull();
  });

  it("issue a fresh token on every sign-in (no fixation)", async () => {
    const s = await studentWithPin("712946");
    const a = await signIn(s.publicId, "712946");
    const b = await signIn(s.publicId, "712946");
    if (a.status !== "ok" || b.status !== "ok") throw new Error("sign-in failed");
    expect(a.token).not.toBe(b.token);
  });

  it("reject garbage tokens", async () => {
    expect(await findStudentSession(db, "not-a-real-token", T0)).toBeNull();
    expect(await findStudentSession(db, "x".repeat(500), T0)).toBeNull();
    expect(await findStudentSession(db, undefined, T0)).toBeNull();
  });
});

describe("legacy V1 credentials", () => {
  it("are accepted while enabled and force a new PIN", async () => {
    await setLegacyLogin(true);
    const s = await studentWithPin("", { legacy: "Kqz" });
    const r = await signIn(s.publicId, "kQZ"); // V1 compared case-insensitively
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.mustSetPin).toBe(true);
    const session = await findStudentSession(db, r.token, T0);
    expect(session?.mustSetPin).toBe(true);
    expect(r.expiresAt.getTime() - T0.getTime()).toBeLessThanOrEqual(15 * 60_000);
  });

  it("are rejected when legacy sign-in is disabled globally", async () => {
    const s = await studentWithPin("", { legacy: "abc" });
    await setLegacyLogin(false);
    expect(await signIn(s.publicId, "abc")).toEqual({ status: "invalid_input" });
    await setLegacyLogin(true);
    expect((await signIn(s.publicId, "abc")).status).toBe("ok");
  });

  it("migrate to a PIN, after which the old password never works again", async () => {
    await setLegacyLogin(true);
    const s = await studentWithPin("", { legacy: "xyz" });
    const legacy = await signIn(s.publicId, "xyz");
    if (legacy.status !== "ok") throw new Error("legacy sign-in failed");

    expect(
      await completeLegacyPinMigration(db, {
        token: legacy.token,
        newPin: "12345",
        confirmPin: "12345",
        authSecret: AUTH_SECRET,
        now: T0,
      }),
    ).toEqual({ status: "invalid_pin" });
    expect(
      await completeLegacyPinMigration(db, {
        token: legacy.token,
        newPin: "123456",
        confirmPin: "123456",
        authSecret: AUTH_SECRET,
        now: T0,
      }),
    ).toEqual({ status: "weak_pin" });
    expect(
      await completeLegacyPinMigration(db, {
        token: legacy.token,
        newPin: "583920",
        confirmPin: "583921",
        authSecret: AUTH_SECRET,
        now: T0,
      }),
    ).toEqual({ status: "mismatch" });

    const done = await completeLegacyPinMigration(db, {
      token: legacy.token,
      newPin: "908172",
      confirmPin: "908172",
      authSecret: AUTH_SECRET,
      now: minutes(1),
    });
    expect(done.status).toBe("ok");
    if (done.status !== "ok") return;

    // The legacy session is gone; the new session is a normal one.
    expect(await findStudentSession(db, legacy.token, minutes(1))).toBeNull();
    expect((await findStudentSession(db, done.token, minutes(1)))?.mustSetPin).toBe(false);

    // Old password rejected, new PIN works.
    expect(await signIn(s.publicId, "xyz", minutes(2))).toEqual({ status: "invalid_credentials" });
    expect((await signIn(s.publicId, "908172", minutes(2))).status).toBe("ok");

    const [legacyRow] = await db
      .select()
      .from(studentCredentials)
      .where(
        and(
          eq(studentCredentials.studentId, s.id),
          eq(studentCredentials.kind, "legacy_v1_password"),
        ),
      );
    expect(legacyRow.revokedReason).toBe("migrated_to_pin");

    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.actorStudentId, s.id));
    expect(audit.action).toBe("student.pin_migrated");
    expect(JSON.stringify(audit)).not.toMatch(/908172|xyz|argon2/);
  });

  it("refuse PIN migration from a normal session or without a session", async () => {
    const s = await studentWithPin("653914");
    const r = await signIn(s.publicId, "653914");
    if (r.status !== "ok") throw new Error("sign-in failed");
    const input = { newPin: "111222", confirmPin: "111222", authSecret: AUTH_SECRET, now: T0 };
    expect(await completeLegacyPinMigration(db, { ...input, token: r.token })).toEqual({
      status: "session_invalid",
    });
    expect(await completeLegacyPinMigration(db, { ...input, token: null })).toEqual({
      status: "session_invalid",
    });
  });
});

describe("weak PINs", () => {
  it("cannot be issued, but an existing PIN still signs in", async () => {
    const s = await studentWithPin("482913");
    await expect(
      setStudentCredential(db, {
        studentId: s.id,
        kind: "pin",
        plain: "111111",
        authSecret: AUTH_SECRET,
        now: T0,
      }),
    ).rejects.toThrow("too easy to guess");
    expect((await signIn(s.publicId, "482913")).status).toBe("ok");
  });
});

describe("credential storage", () => {
  it("never stores PINs or legacy passwords in plaintext", async () => {
    const s = await studentWithPin("864209", { legacy: "pqr" });
    const rows = await db
      .select()
      .from(studentCredentials)
      .where(and(eq(studentCredentials.studentId, s.id), isNull(studentCredentials.revokedAt)));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.secretHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(row.secretHash).not.toContain("864209");
      expect(row.secretHash).not.toContain("pqr");
    }
  });

  it("produces hashes that do not verify without the server secret", async () => {
    const s = await studentWithPin("102938");
    const result = await signInStudent(db, {
      studentId: s.publicId,
      secret: "102938",
      authSecret: "a-different-secret-0123456789abcdef-xyz",
      now: T0,
    });
    expect(result.status).toBe("invalid_credentials");
  });
});
