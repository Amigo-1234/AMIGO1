import { and, eq, gt, inArray } from "drizzle-orm";
import { authThrottles } from "@/db/schema";
import type { DbExecutor } from "@/db/types";

/**
 * Failed sign-in throttling backed by `auth_throttles`.
 *
 * Keys are keyed hashes (never raw IDs, emails or IP addresses). A key accumulates failures
 * inside a rolling window; once the count reaches a step's threshold, the key is locked for
 * that step's duration. Locks are always temporary, so a family that mistypes is never
 * locked out for good. Checks happen on the server before any credential is verified, and
 * the same lock applies whether or not the account exists, so lockouts reveal nothing.
 */
export type ThrottlePolicy = {
  windowMs: number;
  steps: ReadonlyArray<{ failures: number; lockMs: number }>;
};

const MINUTE = 60_000;

/** Per student ID or staff email: 5 tries free, then 1, 5, and at most 15 minute pauses. */
export const IDENTITY_POLICY: ThrottlePolicy = {
  windowMs: 60 * MINUTE,
  steps: [
    { failures: 5, lockMs: 1 * MINUTE },
    { failures: 8, lockMs: 5 * MINUTE },
    { failures: 10, lockMs: 15 * MINUTE },
  ],
};

/**
 * Per network address: generous, because a whole school or family network can share one
 * address, but enough to stop one source from guessing across many IDs.
 */
export const NETWORK_POLICY: ThrottlePolicy = {
  windowMs: 15 * MINUTE,
  steps: [{ failures: 50, lockMs: 15 * MINUTE }],
};

/** Lock duration after `failures` failures in the window (0 = not locked). */
export function lockDurationFor(policy: ThrottlePolicy, failures: number): number {
  let lockMs = 0;
  for (const step of policy.steps) if (failures >= step.failures) lockMs = step.lockMs;
  return lockMs;
}

export type ThrottleKey = { key: string; policy: ThrottlePolicy };

/** The latest lock expiry among the keys, or null when none is locked. */
export async function lockedUntil(
  db: DbExecutor,
  keys: ThrottleKey[],
  now: Date,
): Promise<Date | null> {
  if (keys.length === 0) return null;
  const rows = await db
    .select({ lockedUntil: authThrottles.lockedUntil })
    .from(authThrottles)
    .where(
      and(
        inArray(
          authThrottles.key,
          keys.map((k) => k.key),
        ),
        gt(authThrottles.lockedUntil, now),
      ),
    );
  const times = rows.map((r) => r.lockedUntil!.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

/** Count one failure against each key and apply its policy. */
export async function recordFailures(
  db: DbExecutor,
  keys: ThrottleKey[],
  now: Date,
): Promise<void> {
  for (const { key, policy } of keys) {
    await db.transaction(async (tx) => {
      await tx
        .insert(authThrottles)
        .values({ key, failureCount: 0, windowStartedAt: now })
        .onConflictDoNothing();
      const [row] = await tx
        .select()
        .from(authThrottles)
        .where(eq(authThrottles.key, key))
        .for("update");
      const windowExpired = now.getTime() - row.windowStartedAt.getTime() > policy.windowMs;
      const failures = windowExpired ? 1 : row.failureCount + 1;
      const lockMs = lockDurationFor(policy, failures);
      await tx
        .update(authThrottles)
        .set({
          failureCount: failures,
          windowStartedAt: windowExpired ? now : row.windowStartedAt,
          lockedUntil: lockMs ? new Date(now.getTime() + lockMs) : null,
        })
        .where(eq(authThrottles.key, key));
    });
  }
}

/** Forget failures for a key (after a successful sign-in for that identity). */
export async function clearThrottle(db: DbExecutor, key: string): Promise<void> {
  await db.delete(authThrottles).where(eq(authThrottles.key, key));
}
