/**
 * Public student IDs ("Markaz IDs"): MG{LEVEL_CODE}-{YEAR}-{SERIAL}, e.g. MGIBT-2025-001.
 *
 * - LEVEL_CODE is the code of the level the student was admitted into. It never changes
 *   afterwards: from V2 onward promotion does not change a student's public ID.
 * - YEAR is the start year of the academic session of admission (2025 → 2025/2026).
 * - SERIAL is at least three digits, zero-padded; it grows past 999 if ever needed.
 *
 * IDs are allocated by the database (see src/db/student-ids.ts) and never reissued.
 */
export const STUDENT_ID_PATTERN = /^MG([A-Z]{2,5})-(\d{4})-(\d{3,})$/;

/** Same rule as STUDENT_ID_PATTERN, in PostgreSQL regex syntax (used in CHECK constraints). */
export const STUDENT_ID_SQL_PATTERN = "^MG[A-Z]{2,5}-[0-9]{4}-[0-9]{3,}$";

export type StudentIdParts = { levelCode: string; year: number; serial: number };

export function formatStudentId({ levelCode, year, serial }: StudentIdParts): string {
  if (!/^[A-Z]{2,5}$/.test(levelCode)) throw new Error(`Invalid level code: ${levelCode}`);
  if (!Number.isInteger(year) || year < 1000 || year > 9999)
    throw new Error(`Invalid year: ${year}`);
  if (!Number.isInteger(serial) || serial < 1) throw new Error(`Invalid serial: ${serial}`);
  return `MG${levelCode}-${year}-${String(serial).padStart(3, "0")}`;
}

export function parseStudentId(value: string): StudentIdParts | null {
  const match = STUDENT_ID_PATTERN.exec(value);
  if (!match) return null;
  const serial = Number.parseInt(match[3], 10);
  if (serial < 1) return null;
  return { levelCode: match[1], year: Number.parseInt(match[2], 10), serial };
}

/**
 * Normalise what a person typed into a student ID field: trim, uppercase, and accept
 * common separators. Returns the value unchanged in shape if it still is not an ID.
 */
export function normalizeStudentIdInput(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s_–—]+/g, "-")
    .replace(/-+/g, "-");
}
