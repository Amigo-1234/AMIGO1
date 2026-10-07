import { describe, expect, it } from "vitest";
import {
  canActivateSession,
  canActivateTerm,
  canCloseSession,
  sessionAcceptsEnrollment,
  termFitsSession,
} from "./academic-calendar";
import {
  normalizePhone,
  parseDirectoryQuery,
  parseReason,
  parseSession,
  parseStudentDetails,
  parseStudentIntake,
  todayInLagos,
} from "./admin-input";
import {
  allowedStatusChanges,
  canBeEnrolled,
  canChangeStatus,
  endsActiveEnrollment,
  restoreTarget,
} from "./student-lifecycle";

const LEVEL = "6f1c2b9e-5d4a-4c3b-9a8e-7f6d5c4b3a21";
const SESSION = "0e9d8c7b-6a5f-4e3d-8c2b-1a0f9e8d7c6b";

describe("student lifecycle", () => {
  it("allows only the documented manual status changes", () => {
    expect(allowedStatusChanges("active")).toEqual(["suspended", "withdrawn", "archived"]);
    expect(canChangeStatus("suspended", "active")).toBe(true);
    expect(canChangeStatus("withdrawn", "active")).toBe(true);
    expect(canChangeStatus("graduated", "archived")).toBe(true);
    // Graduation happens only through promotion processing.
    expect(canChangeStatus("active", "graduated")).toBe(false);
    expect(canChangeStatus("graduated", "active")).toBe(false);
    // Archived students are restored, never changed directly.
    expect(allowedStatusChanges("archived")).toEqual([]);
    expect(canChangeStatus("active", "active")).toBe(false);
  });

  it("restores archived students to their previous status, defaulting to withdrawn", () => {
    expect(restoreTarget("graduated")).toBe("graduated");
    expect(restoreTarget("active")).toBe("active");
    expect(restoreTarget(null)).toBe("withdrawn");
    expect(restoreTarget("archived")).toBe("withdrawn");
    expect(restoreTarget("nonsense")).toBe("withdrawn");
  });

  it("ends the active enrollment only when the student leaves", () => {
    expect(endsActiveEnrollment("withdrawn")).toBe(true);
    expect(endsActiveEnrollment("archived")).toBe(true);
    expect(endsActiveEnrollment("suspended")).toBe(false);
    expect(canBeEnrolled("active")).toBe(true);
    expect(canBeEnrolled("suspended")).toBe(false);
  });
});

describe("academic calendar", () => {
  it("moves sessions planned → active → closed, closing only when nobody is still enrolled", () => {
    expect(canActivateSession("planned")).toBe(true);
    expect(canActivateSession("closed")).toBe(false);
    expect(canCloseSession("active", 0)).toBe(true);
    expect(canCloseSession("active", 3)).toBe(false);
    expect(sessionAcceptsEnrollment("planned")).toBe(true);
    expect(sessionAcceptsEnrollment("closed")).toBe(false);
  });

  it("activates terms only inside the active session and keeps term dates inside the session", () => {
    expect(canActivateTerm("planned", "active")).toBe(true);
    expect(canActivateTerm("planned", "planned")).toBe(false);
    expect(canActivateTerm("closed", "active")).toBe(false);
    const session = { startsOn: "2026-09-01", endsOn: "2027-07-31" };
    expect(termFitsSession({ startsOn: "2026-09-08", endsOn: "2026-12-18" }, session)).toBe(true);
    expect(termFitsSession({ startsOn: "2026-08-01", endsOn: "2026-12-18" }, session)).toBe(false);
    expect(termFitsSession({ startsOn: "2026-12-18", endsOn: "2026-09-08" }, session)).toBe(false);
    expect(termFitsSession({ startsOn: null, endsOn: null }, session)).toBe(true);
  });
});

describe("admin input", () => {
  const today = "2026-10-07";

  it("requires a name and rejects future or malformed dates", () => {
    const result = parseStudentDetails(
      { fullName: " ", dateOfBirth: "2030-01-01", admittedOn: "2026-02-30" },
      today,
    );
    expect(result).toEqual({
      ok: false,
      errors: { fullName: "required", dateOfBirth: "future", admittedOn: "invalid" },
    });
  });

  it("cleans text and normalises phone numbers", () => {
    const result = parseStudentDetails(
      {
        fullName: "  Aisha   Bello ",
        phone: "0803 123 4567",
        gender: "female",
        notes: "a\n\n\n\nb",
      },
      today,
    );
    expect(result.ok && result.data).toMatchObject({
      fullName: "Aisha Bello",
      phone: "08031234567",
      gender: "female",
      notes: "a\n\nb",
      dateOfBirth: null,
    });
    expect(normalizePhone("+234 (803) 123-4567")).toBe("+2348031234567");
    expect(normalizePhone("12")).toBeNull();
  });

  it("makes the guardian optional, but needs a name once any guardian field is filled", () => {
    const base = { fullName: "Aisha Bello", levelId: LEVEL, sessionId: SESSION, enrollNow: "on" };
    const without = parseStudentIntake(base, today);
    expect(without.ok && without.data.guardian).toBeNull();
    expect(without.ok && without.data.enrollNow).toBe(true);

    const partial = parseStudentIntake({ ...base, "guardian.phone": "08031234567" }, today);
    expect(partial).toEqual({ ok: false, errors: { "guardian.fullName": "required" } });

    const full = parseStudentIntake(
      {
        ...base,
        "guardian.fullName": "Musa Bello",
        "guardian.email": "MUSA@Example.com",
        "guardian.isPrimaryContact": "on",
      },
      today,
    );
    expect(full.ok && full.data.guardian).toMatchObject({
      fullName: "Musa Bello",
      email: "musa@example.com",
      isPrimaryContact: true,
    });
  });

  it("rejects intake without a valid level and session", () => {
    expect(parseStudentIntake({ fullName: "Aisha", levelId: "x" }, today)).toEqual({
      ok: false,
      errors: { levelId: "invalid", sessionId: "required" },
    });
  });

  it("requires a reason and explicit confirmation for status changes", () => {
    expect(parseReason({ reason: "", confirm: undefined })).toEqual({
      ok: false,
      errors: { reason: "required", confirm: "required" },
    });
    expect(parseReason({ reason: "Family moved away", confirm: "on" })).toEqual({
      ok: true,
      data: { reason: "Family moved away" },
    });
  });

  it("validates session years and date order", () => {
    expect(
      parseSession({ startYear: "2026", startsOn: "2026-09-01", endsOn: "2027-07-31" }),
    ).toEqual({
      ok: true,
      data: { startYear: 2026, startsOn: "2026-09-01", endsOn: "2027-07-31" },
    });
    expect(parseSession({ startYear: "26" })).toEqual({
      ok: false,
      errors: { startYear: "invalid" },
    });
    expect(
      parseSession({ startYear: "2026", startsOn: "2027-01-01", endsOn: "2026-01-01" }),
    ).toEqual({
      ok: false,
      errors: { endsOn: "invalid" },
    });
  });

  it("reads directory filters safely from the URL", () => {
    expect(parseDirectoryQuery({})).toEqual({ q: null, status: "current", levelId: null, page: 1 });
    expect(
      parseDirectoryQuery({ q: "  ali ", status: "archived", level: LEVEL, page: "3" }),
    ).toEqual({
      q: "ali",
      status: "archived",
      levelId: LEVEL,
      page: 3,
    });
    expect(parseDirectoryQuery({ status: "drop table", level: "1 or 1=1", page: "-4" })).toEqual({
      q: null,
      status: "current",
      levelId: null,
      page: 1,
    });
  });

  it("uses the school's time zone for today", () => {
    // 23:30 UTC on 6 Oct is already 7 Oct in Lagos (UTC+1).
    expect(todayInLagos(new Date("2026-10-06T23:30:00Z"))).toBe("2026-10-07");
  });
});
