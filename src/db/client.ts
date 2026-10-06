import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { migPool?: Pool };

/**
 * The application's database handle (Neon pooled connection via node-postgres).
 * Created lazily so builds and pages that never touch the database need no credentials.
 * The pool is cached on globalThis so dev-server reloads and warm serverless
 * instances reuse connections instead of opening new ones.
 */
let db: Database | undefined;

export function getDb(): Database {
  if (!db) {
    globalForDb.migPool ??= new Pool({
      connectionString: requireEnv("DATABASE_URL"),
      max: 5,
      idleTimeoutMillis: 10_000,
    });
    db = drizzle(globalForDb.migPool, { schema, casing: "snake_case" });
  }
  return db;
}
