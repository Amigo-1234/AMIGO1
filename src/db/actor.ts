import { sql } from "drizzle-orm";
import type { DbExecutor } from "./types";

/**
 * Record who is acting (and optionally why) for the current transaction. Database
 * triggers read these settings, e.g. to attribute score revisions.
 *
 * Must be called inside `db.transaction(...)`: the settings are transaction-local and
 * disappear at commit, so they can never leak to another request on a pooled connection.
 */
export async function setTransactionActor(
  tx: DbExecutor,
  { actorId, reason }: { actorId: string | null; reason?: string | null },
): Promise<void> {
  await tx.execute(
    sql`SELECT set_config('app.actor_id', ${actorId ?? ""}, true), set_config('app.change_reason', ${reason ?? ""}, true)`,
  );
}
