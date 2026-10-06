import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * Any Drizzle PostgreSQL handle with this schema: the app's node-postgres client, a
 * transaction, or PGlite in tests. Database utilities accept this so they run unchanged
 * inside or outside a transaction.
 */
export type DbExecutor = PgDatabase<PgQueryResultHKT, typeof schema>;
