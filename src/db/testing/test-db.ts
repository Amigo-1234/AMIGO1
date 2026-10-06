import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../schema";
import { seedDatabase } from "../seed";
import type { DbExecutor } from "../types";

/**
 * A throwaway in-memory PostgreSQL (PGlite) with every real migration applied and the
 * default seed loaded. Used by integration tests; needs no server or credentials.
 */
export async function createTestDatabase() {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "drizzle" });
  await seedDatabase(db as unknown as DbExecutor);
  return { db: db as unknown as DbExecutor, close: () => client.close() };
}

/** Message of a failed query including the PostgreSQL cause (Drizzle wraps driver errors). */
export function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    parts.push(current.message);
    current = (current as Error & { cause?: unknown }).cause;
  }
  return parts.join(" | ");
}

export async function expectDbError(work: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await work;
  } catch (error) {
    const text = errorText(error);
    if (!pattern.test(text)) throw new Error(`Expected error matching ${pattern}, got: ${text}`);
    return;
  }
  throw new Error(`Expected the database to reject the operation (${pattern})`);
}
