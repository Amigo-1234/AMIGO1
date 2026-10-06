import { sql } from "drizzle-orm";
import { formatStudentId } from "@/domain/student-id";
import { studentIdCounters } from "./schema";
import type { DbExecutor } from "./types";

/**
 * Allocate the next public student ID for a level code and year, e.g. MGIBT-2026-004.
 *
 * The next serial is one above both the counter and the highest serial in the identifier
 * registry (which includes imported V1 IDs and aliases and is never deleted from), so an
 * ID can never be issued twice. The counter row is locked by the upsert until the
 * transaction ends, which serialises concurrent registrations for the same level/year.
 *
 * Call inside the transaction that also inserts the student and its identifier; if that
 * transaction rolls back, the counter rolls back with it and no serial is skipped.
 */
export async function allocateStudentId(
  tx: DbExecutor,
  { levelCode, year }: { levelCode: string; year: number },
): Promise<string> {
  const highestRegistered = sql`(
    SELECT coalesce(max(serial), 0) FROM student_identifiers
    WHERE level_code = ${levelCode} AND year = ${year}
  )`;

  const [row] = await tx
    .insert(studentIdCounters)
    .values({ levelCode, year, lastSerial: sql`1 + ${highestRegistered}` })
    .onConflictDoUpdate({
      target: [studentIdCounters.levelCode, studentIdCounters.year],
      set: { lastSerial: sql`1 + greatest(student_id_counters.last_serial, ${highestRegistered})` },
    })
    .returning({ lastSerial: studentIdCounters.lastSerial });

  return formatStudentId({ levelCode, year, serial: row.lastSerial });
}
