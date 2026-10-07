import { randomInt } from "node:crypto";
import { and, eq, isNull, like, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { chromium, type Page } from "playwright";
import * as schema from "@/db/schema";
import {
  auditLogs,
  authThrottles,
  roles,
  staffUsers,
  studentCredentials,
  studentIdentifiers,
  studentSessions,
  students,
  systemSettings,
  userRoles,
} from "@/db/schema";
import { allocateStudentId } from "@/db/student-ids";
import type { DbExecutor } from "@/db/types";
import { recordAudit } from "@/server/audit";
import { isWeakPin } from "@/server/student-auth/rules";
import { setStudentCredential, studentIdThrottleKey } from "@/server/student-auth/service";
import { BOOTSTRAP_SETTING } from "@/server/staff-auth/bootstrap";
import { openScriptConnection, reportScriptError } from "@/db/scripts/connection";

/**
 * Production authentication checkpoint, run by a manual GitHub Actions workflow.
 *
 *   BASE_URL=https://...                  site to check (required)
 *   EXPECT_SETUP=open|closed              whether /en/staff/setup should be reachable
 *   CHECK_STAFF_DB=1                      read-only check of the first Super Admin bootstrap
 *   RUN_STUDENT_TEST=1                    live student sign-in test (needs STUDENT_AUTH_SECRET)
 *
 * The student test creates ONE clearly labelled temporary student with a TEST level code
 * (e.g. MGTEST-2026-001, which can never collide with real IBT/IDA/THA IDs), a random
 * non-trivial PIN that is masked in the log, and no enrollment or financial records. It
 * always cleans up: the student is archived (rows cannot be deleted by design), its
 * credentials and sessions are revoked, its throttle row removed, and both steps audited.
 * Nothing secret is printed.
 */

const BASE_URL = (process.env.BASE_URL ?? "").replace(/\/+$/, "");
const TEST_LEVEL_CODE = "TEST";
const TEST_NAME = "Automated Auth Check (temporary)";

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`);
}
const path = (page: Page) => {
  const url = new URL(page.url());
  return url.pathname + url.search;
};

async function checkRoutes(page: Page) {
  let response = await page.goto(`${BASE_URL}/en/staff/login`);
  check(response?.status() === 200, "/en/staff/login loads", String(response?.status()));
  check(
    (await page.getAttribute("html", "dir")) === "ltr" &&
      (await page.getAttribute("html", "lang")) === "en",
    "English is LTR",
  );
  check(
    (await page.locator("#staff-email").count()) === 1,
    "Staff sign-in form is active (Neon Auth configured)",
  );

  response = await page.goto(`${BASE_URL}/ar/staff/login`);
  check(response?.status() === 200, "/ar/staff/login loads", String(response?.status()));
  check(
    (await page.getAttribute("html", "dir")) === "rtl" &&
      (await page.getAttribute("html", "lang")) === "ar",
    "Arabic is RTL",
  );

  const expectSetup = process.env.EXPECT_SETUP ?? "closed";
  response = await page.goto(`${BASE_URL}/en/staff/setup`);
  const status = response?.status();
  check(
    expectSetup === "open"
      ? status === 200 && (await page.locator("#setup-code").count()) === 1
      : status === 404,
    `/en/staff/setup is ${expectSetup}`,
    String(status),
  );

  for (const locale of ["en", "ar"]) {
    await page.goto(`${BASE_URL}/${locale}/admin`);
    check(
      path(page).startsWith(`/${locale}/staff/login`),
      `Signed-out /${locale}/admin redirects to sign-in`,
      path(page),
    );
    await page.goto(`${BASE_URL}/${locale}/portal`);
    check(
      path(page).startsWith(`/${locale}/portal/login`),
      `Signed-out /${locale}/portal redirects to sign-in`,
      path(page),
    );
  }

  response = await page.goto(`${BASE_URL}/en`);
  const headers = response?.headers() ?? {};
  check(
    headers["x-frame-options"] === "DENY" &&
      !!headers["strict-transport-security"] &&
      !headers["x-powered-by"],
    "Security headers present",
  );
}

async function checkStaffBootstrap(db: DbExecutor) {
  const [marker] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, BOOTSTRAP_SETTING));
  check(!!marker, "Bootstrap completion marker exists");

  const admins = await db
    .select({
      id: staffUsers.id,
      email: staffUsers.email,
      status: staffUsers.status,
      authUserId: staffUsers.authUserId,
    })
    .from(staffUsers)
    .innerJoin(userRoles, eq(userRoles.userId, staffUsers.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.key, "super_admin"));
  const active = admins.filter((a) => a.status === "active" && a.authUserId);
  const masked = active.map((a) => a.email.replace(/^(.).*(@.*)$/, "$1***$2"));
  check(active.length >= 1, "Active Super Admin linked to a Neon Auth identity", masked.join(", "));

  const [audit] = await db
    .select({ actor: auditLogs.actorUserId, at: auditLogs.occurredAt })
    .from(auditLogs)
    .where(eq(auditLogs.action, "staff.bootstrapped"));
  check(
    !!audit && active.some((a) => a.id === audit.actor),
    "staff.bootstrapped audit entry by that Super Admin",
    audit?.at.toISOString() ?? "missing",
  );

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(staffUsers);
  console.log(`INFO  Staff records: ${count}`);

  // Display-name diagnosis without printing any name (Actions logs may be public): where
  // did the stored staff name come from?
  for (const admin of active) {
    const [row] = await db
      .select({ fullName: staffUsers.fullName })
      .from(staffUsers)
      .where(eq(staffUsers.id, admin.id));
    const name = row?.fullName ?? "";
    let authName: string | null = null;
    try {
      const result = await db.execute(
        sql`SELECT name FROM neon_auth."user" WHERE id::text = ${admin.authUserId} LIMIT 1`,
      );
      authName = ((result as unknown as { rows: { name: string | null }[] }).rows[0]?.name ??
        null) as string | null;
    } catch {
      console.log("INFO  Neon Auth user table not readable from the app database");
    }
    console.log(
      `INFO  Super Admin name: ${name.trim().split(/\s+/).length} word(s), ` +
        `equals "amigo" (any case): ${name.trim().toLowerCase() === "amigo"}, ` +
        `matches Neon Auth sign-up name: ${authName === null ? "unknown" : authName === name}`,
    );
  }
}

function randomStrongPin(): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (!isWeakPin(pin)) return pin;
  }
}

async function runStudentTest(db: DbExecutor, page: Page) {
  const authSecret = process.env.STUDENT_AUTH_SECRET;
  if (!authSecret) {
    check(false, "Student test needs STUDENT_AUTH_SECRET");
    return;
  }
  const pin = randomStrongPin();
  let wrong = randomStrongPin();
  while (wrong === pin) wrong = randomStrongPin();
  // Masks the PINs everywhere in the GitHub Actions log.
  console.log(`::add-mask::${pin}`);
  console.log(`::add-mask::${wrong}`);

  const now = new Date();
  const created = await db.transaction(async (tx) => {
    const publicId = await allocateStudentId(tx, {
      levelCode: TEST_LEVEL_CODE,
      year: now.getUTCFullYear(),
    });
    const [student] = await tx
      .insert(students)
      .values({
        publicId,
        fullName: TEST_NAME,
        notes: "Created by the production auth checkpoint; archived automatically.",
      })
      .returning();
    const [, , year, serial] = /^MG([A-Z]+)-(\d+)-(\d+)$/.exec(publicId)!;
    await tx.insert(studentIdentifiers).values({
      value: publicId,
      studentId: student.id,
      isPrimary: true,
      source: "v2",
      levelCode: TEST_LEVEL_CODE,
      year: Number(year),
      serial: Number(serial),
    });
    await recordAudit(tx, {
      actor: { type: "system", label: "production-auth-check" },
      action: "student.test_created",
      targetType: "student",
      targetId: student.id,
      metadata: { publicId, purpose: "authentication checkpoint" },
    });
    return { id: student.id, publicId };
  });
  console.log(`INFO  Temporary test student: ${created.publicId}`);

  try {
    await setStudentCredential(db, {
      studentId: created.id,
      kind: "pin",
      plain: pin,
      authSecret,
      now,
    });

    const signIn = async (locale: string, secret: string) => {
      await page.goto(`${BASE_URL}/${locale}/portal/login`);
      await page.fill("#student-id", created.publicId);
      await page.fill("#student-pin", secret);
      await page.click('button[type="submit"]');
    };

    await signIn("en", wrong);
    await page.waitForSelector('[role="alert"]:has-text("incorrect")', { timeout: 15_000 });
    check(true, "Wrong PIN is rejected with the generic message");

    await signIn("en", pin);
    await page.waitForURL(`**/en/portal`, { timeout: 15_000 });
    check(
      (await page.locator("dd").textContent())?.trim() === created.publicId,
      "Correct PIN opens the portal with the permanent ID",
    );
    const cookie = (await page.context().cookies()).find((c) => c.name.includes("mig_student"));
    check(
      !!cookie &&
        cookie.httpOnly &&
        cookie.secure &&
        cookie.sameSite === "Lax" &&
        cookie.name.startsWith("__Host-"),
      "Session cookie is __Host-, HttpOnly, Secure, SameSite=Lax",
    );

    await page.goto(`${BASE_URL}/ar/portal`);
    check(
      (await page.getAttribute("html", "dir")) === "rtl" && path(page) === "/ar/portal",
      "Arabic portal renders RTL with the same session",
    );

    await page.click('button[type="submit"]');
    await page.waitForURL(`**/ar/portal/login?reason=signed_out`, { timeout: 15_000 });
    check(true, "Sign-out returns to the Arabic sign-in page");

    if (cookie) await page.context().addCookies([cookie]);
    await page.goto(`${BASE_URL}/en/portal`);
    check(
      path(page).startsWith("/en/portal/login"),
      "Old session token no longer opens the portal",
      path(page),
    );
  } finally {
    const end = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(students)
        .set({ status: "archived", archivedAt: end })
        .where(eq(students.id, created.id));
      await tx
        .update(studentCredentials)
        .set({ revokedAt: end, revokedReason: "test_complete" })
        .where(
          and(eq(studentCredentials.studentId, created.id), isNull(studentCredentials.revokedAt)),
        );
      await tx
        .update(studentSessions)
        .set({ revokedAt: end })
        .where(and(eq(studentSessions.studentId, created.id), isNull(studentSessions.revokedAt)));
      await tx
        .delete(authThrottles)
        .where(eq(authThrottles.key, studentIdThrottleKey(authSecret, created.publicId).key));
      await recordAudit(tx, {
        actor: { type: "system", label: "production-auth-check" },
        action: "student.test_archived",
        targetType: "student",
        targetId: created.id,
        metadata: { publicId: created.publicId },
      });
    });
  }

  const [liveTest] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(students)
    .where(and(like(students.publicId, `MG${TEST_LEVEL_CODE}-%`), ne(students.status, "archived")));
  const [liveCredentials] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(studentCredentials)
    .innerJoin(students, eq(students.id, studentCredentials.studentId))
    .where(
      and(like(students.publicId, `MG${TEST_LEVEL_CODE}-%`), isNull(studentCredentials.revokedAt)),
    );
  const [liveSessions] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(studentSessions)
    .innerJoin(students, eq(students.id, studentSessions.studentId))
    .where(
      and(like(students.publicId, `MG${TEST_LEVEL_CODE}-%`), isNull(studentSessions.revokedAt)),
    );
  check(
    liveTest.n === 0 && liveCredentials.n === 0 && liveSessions.n === 0,
    "Cleanup: no active test student, credential or session remains",
  );
}

async function main() {
  if (!/^(https:\/\/[^/]+|http:\/\/localhost:\d+)$/.test(BASE_URL))
    throw new Error("Set BASE_URL to the site origin, e.g. https://example.com");
  console.log(`Checking ${BASE_URL}`);

  const needsDb = process.env.CHECK_STAFF_DB === "1" || process.env.RUN_STUDENT_TEST === "1";
  const connection = needsDb ? await openScriptConnection() : null;
  const db = connection
    ? (drizzle(connection.pool, { schema, casing: "snake_case" }) as unknown as DbExecutor)
    : null;
  // CI installs the matching browser; elsewhere an existing Chromium can be supplied.
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await (
      await browser.newContext({ viewport: { width: 390, height: 844 } })
    ).newPage();
    await checkRoutes(page);
    if (db && process.env.CHECK_STAFF_DB === "1") await checkStaffBootstrap(db);
    if (db && process.env.RUN_STUDENT_TEST === "1") await runStudentTest(db, page);
  } finally {
    await browser.close();
    await connection?.close();
  }
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => reportScriptError("Production auth check failed", error));
