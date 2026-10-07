import { z } from "zod";

/**
 * Validation for admin forms. Pure (no server imports): the server is the authority and
 * re-validates every submission; the same rules can give the browser instant feedback.
 *
 * Errors are short codes (`required`, `too_long`, `invalid`, `future`), translated by the
 * page, so messages exist in both languages.
 */
export type FieldErrorCode = "required" | "too_long" | "invalid" | "future" | "too_early";
export type FieldErrors<K extends string = string> = Partial<Record<K, FieldErrorCode>>;
export type Parsed<T, K extends string = string> =
  { ok: true; data: T } | { ok: false; errors: FieldErrors<K> };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Collapse inner whitespace and trim; empty becomes null. */
export function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

/** Like cleanText but keeps line breaks (addresses, notes). */
export function cleanMultiline(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text : null;
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Nigerian and international numbers: digits with optional leading +, 7–15 digits. */
export function normalizePhone(value: string): string | null {
  const compact = value.replace(/[\s().-]/g, "");
  return /^\+?[0-9]{7,15}$/.test(compact) ? compact : null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Today's date in the school's time zone (Africa/Lagos), as YYYY-MM-DD. */
export function todayInLagos(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(now);
}

type Input = Record<string, unknown>;

class Collector<K extends string> {
  errors: FieldErrors<K> = {};
  fail(field: K, code: FieldErrorCode) {
    this.errors[field] ??= code;
    return null;
  }
  text(input: Input, field: K, { required = false, max = 120, min = 1 } = {}): string | null {
    const value = cleanText(input[field]);
    if (!value) return required ? this.fail(field, "required") : null;
    if (value.length > max) return this.fail(field, "too_long");
    if (value.length < min) return this.fail(field, "invalid");
    return value;
  }
  multiline(input: Input, field: K, max: number): string | null {
    const value = cleanMultiline(input[field]);
    if (value && value.length > max) return this.fail(field, "too_long");
    return value;
  }
  date(
    input: Input,
    field: K,
    { required = false, notFuture = false, today = todayInLagos() } = {},
  ) {
    const value = cleanText(input[field]);
    if (!value) return required ? this.fail(field, "required") : null;
    if (!isValidIsoDate(value)) return this.fail(field, "invalid");
    if (value < "1900-01-01") return this.fail(field, "too_early");
    if (notFuture && value > today) return this.fail(field, "future");
    return value;
  }
  phone(input: Input, field: K): string | null {
    const value = cleanText(input[field]);
    if (!value) return null;
    return normalizePhone(value) ?? this.fail(field, "invalid");
  }
  email(input: Input, field: K): string | null {
    const value = cleanText(input[field])?.toLowerCase() ?? null;
    if (!value) return null;
    if (value.length > 254) return this.fail(field, "too_long");
    return z.email().safeParse(value).success ? value : this.fail(field, "invalid");
  }
  uuid(input: Input, field: K, { required = true } = {}): string | null {
    const value = cleanText(input[field]);
    if (!value) return required ? this.fail(field, "required") : null;
    return isUuid(value) ? value : this.fail(field, "invalid");
  }
  oneOf<T extends string>(
    input: Input,
    field: K,
    options: readonly T[],
    { required = false } = {},
  ) {
    const value = cleanText(input[field]);
    if (!value) return required ? this.fail(field, "required") : null;
    return (options as readonly string[]).includes(value)
      ? (value as T)
      : this.fail(field, "invalid");
  }
  result<T>(data: T): Parsed<T, K> {
    return Object.keys(this.errors).length
      ? { ok: false, errors: this.errors }
      : { ok: true, data };
  }
}

export const GENDERS = ["female", "male"] as const;
export type Gender = (typeof GENDERS)[number];

/* ------------------------------------------------------------------ students */

export type StudentDetails = {
  fullName: string;
  gender: Gender | null;
  dateOfBirth: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  admittedOn: string | null;
};
type StudentDetailsField = keyof StudentDetails;

function studentDetails(c: Collector<string>, input: Input, today: string): StudentDetails {
  return {
    fullName: c.text(input, "fullName", { required: true, max: 120, min: 2 }) ?? "",
    gender: c.oneOf(input, "gender", GENDERS),
    dateOfBirth: c.date(input, "dateOfBirth", { notFuture: true, today }),
    phone: c.phone(input, "phone"),
    address: c.multiline(input, "address", 300),
    notes: c.multiline(input, "notes", 1000),
    admittedOn: c.date(input, "admittedOn", { notFuture: true, today }),
  };
}

export function parseStudentDetails(
  input: Input,
  today = todayInLagos(),
): Parsed<StudentDetails, StudentDetailsField> {
  const c = new Collector<string>();
  const data = studentDetails(c, input, today);
  return c.result(data) as Parsed<StudentDetails, StudentDetailsField>;
}

export type GuardianDetails = {
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};
export type GuardianLink = { relationship: string | null; isPrimaryContact: boolean };

function guardianDetails(c: Collector<string>, input: Input, prefix = ""): GuardianDetails {
  const f = (name: string) => `${prefix}${name}`;
  return {
    fullName: c.text(input, f("fullName"), { required: true, max: 120, min: 2 }) ?? "",
    phone: c.phone(input, f("phone")),
    email: c.email(input, f("email")),
    address: c.multiline(input, f("address"), 300),
    notes: c.multiline(input, f("notes"), 1000),
  };
}

function guardianLink(c: Collector<string>, input: Input, prefix = ""): GuardianLink {
  return {
    relationship: c.text(input, `${prefix}relationship`, { max: 40 }),
    isPrimaryContact:
      input[`${prefix}isPrimaryContact`] === "on" || input[`${prefix}isPrimaryContact`] === true,
  };
}

export type StudentIntake = {
  student: StudentDetails;
  levelId: string;
  sessionId: string;
  /** Also place the student in that session and level now. */
  enrollNow: boolean;
  guardian: (GuardianDetails & GuardianLink) | null;
};

/**
 * New-student form. The admission level and session decide the permanent ID
 * (MG{LEVEL}-{SESSION START YEAR}-{SERIAL}); a guardian is optional, but when any guardian
 * field is filled the guardian's name becomes required.
 */
export function parseStudentIntake(input: Input, today = todayInLagos()): Parsed<StudentIntake> {
  const c = new Collector<string>();
  const student = studentDetails(c, input, today);
  const levelId = c.uuid(input, "levelId") ?? "";
  const sessionId = c.uuid(input, "sessionId") ?? "";
  const enrollNow = input.enrollNow === "on" || input.enrollNow === true;

  const guardianFields = ["fullName", "phone", "email", "relationship", "address"];
  const wantsGuardian = guardianFields.some((name) => cleanText(input[`guardian.${name}`]));
  const guardian = wantsGuardian
    ? { ...guardianDetails(c, input, "guardian."), ...guardianLink(c, input, "guardian.") }
    : null;
  return c.result({ student, levelId, sessionId, enrollNow, guardian });
}

export function parseGuardian(input: Input): Parsed<GuardianDetails & GuardianLink> {
  const c = new Collector<string>();
  const data = { ...guardianDetails(c, input), ...guardianLink(c, input) };
  return c.result(data);
}

export function parseGuardianDetails(input: Input): Parsed<GuardianDetails> {
  const c = new Collector<string>();
  return c.result(guardianDetails(c, input));
}

export function parseGuardianLink(input: Input): Parsed<GuardianLink> {
  const c = new Collector<string>();
  return c.result(guardianLink(c, input));
}

/* ----------------------------------------------------------------- lifecycle */

/** Every manual status change records why. */
export function parseReason(input: Input): Parsed<{ reason: string }> {
  const c = new Collector<string>();
  const reason = c.text(input, "reason", { required: true, max: 500, min: 3 });
  if (input.confirm !== "on" && input.confirm !== true) c.fail("confirm", "required");
  return c.result({ reason: reason ?? "" });
}

/* -------------------------------------------------------- sessions and terms */

export type SessionInput = { startYear: number; startsOn: string | null; endsOn: string | null };

export function parseSession(input: Input, { min = 2000, max = 2200 } = {}): Parsed<SessionInput> {
  const c = new Collector<string>();
  const raw = cleanText(input.startYear);
  let startYear = 0;
  if (!raw) c.fail("startYear", "required");
  else if (!/^\d{4}$/.test(raw) || Number(raw) < min || Number(raw) > max)
    c.fail("startYear", "invalid");
  else startYear = Number(raw);
  const startsOn = c.date(input, "startsOn");
  const endsOn = c.date(input, "endsOn");
  if (startsOn && endsOn && endsOn <= startsOn) c.fail("endsOn", "invalid");
  return c.result({ startYear, startsOn, endsOn });
}

export function parseDateRange(
  input: Input,
): Parsed<{ startsOn: string | null; endsOn: string | null }> {
  const c = new Collector<string>();
  const startsOn = c.date(input, "startsOn");
  const endsOn = c.date(input, "endsOn");
  if (startsOn && endsOn && endsOn <= startsOn) c.fail("endsOn", "invalid");
  return c.result({ startsOn, endsOn });
}

/* ------------------------------------------------------------------ directory */

export const DIRECTORY_PAGE_SIZE = 25;

export type DirectoryQuery = {
  q: string | null;
  status: "active" | "suspended" | "withdrawn" | "graduated" | "archived" | "current" | "all";
  levelId: string | null;
  page: number;
};

/**
 * Directory filters from the URL. Default view: students currently at school (active and
 * suspended); archived students appear only when asked for.
 */
export function parseDirectoryQuery(
  params: Record<string, string | string[] | undefined>,
): DirectoryQuery {
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const q = cleanText(one("q"))?.slice(0, 80) ?? null;
  const statuses = [
    "active",
    "suspended",
    "withdrawn",
    "graduated",
    "archived",
    "current",
    "all",
  ] as const;
  const rawStatus = one("status");
  const status = (statuses as readonly string[]).includes(rawStatus ?? "")
    ? (rawStatus as DirectoryQuery["status"])
    : "current";
  const level = one("level");
  const page = Math.min(Math.max(Number.parseInt(one("page") ?? "1", 10) || 1, 1), 10_000);
  return { q, status, levelId: isUuid(level) ? level : null, page };
}
