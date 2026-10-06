import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, timestamptz, updatedAt } from "./_shared";
import { credentialKind } from "./enums";
import { staffUsers } from "./staff";
import { students } from "./students";

/**
 * Student / parent sign-in secrets. Only password hashes in PHC string format
 * (e.g. "$argon2id$v=19$...") are accepted, never plaintext.
 * - `pin`: the 6-digit PIN used from V2 onward.
 * - `legacy_v1_password`: a hashed V1 3-letter password, kept temporarily so migrated
 *   families are not locked out. Signing in with it forces the family to set a PIN, after
 *   which it is revoked. All legacy credentials can be switched off with the
 *   `auth.legacy_v1_credentials_enabled` setting and revoked in bulk.
 * At most one unrevoked credential of each kind per student.
 */
export const studentCredentials = pgTable(
  "student_credentials",
  {
    id: uuid().primaryKey().defaultRandom(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    kind: credentialKind().notNull(),
    secretHash: text().notNull(),
    createdById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    lastUsedAt: timestamptz(),
    revokedAt: timestamptz(),
    revokedReason: text(),
  },
  (t) => [
    uniqueIndex("student_credentials_one_active_per_kind")
      .on(t.studentId, t.kind)
      .where(sql`revoked_at IS NULL`),
    check(
      "student_credentials_hash_format",
      sql`secret_hash ~ '^\\$[a-z0-9-]+\\$' AND length(secret_hash) >= 40`,
    ),
  ],
);

/** Server-side student sessions. Only a SHA-256 hash of the cookie token is stored. */
export const studentSessions = pgTable(
  "student_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    tokenHash: text().notNull().unique(),
    /** True when signed in with a legacy credential: the session may only set a new PIN. */
    mustSetPin: boolean().notNull().default(false),
    createdAt: createdAt(),
    expiresAt: timestamptz().notNull(),
    lastSeenAt: timestamptz(),
    revokedAt: timestamptz(),
    ipHash: text(),
    userAgent: text(),
  },
  (t) => [
    check("student_sessions_token_hash_format", sql`token_hash ~ '^[0-9a-f]{64}$'`),
    check("student_sessions_expiry", sql`expires_at > created_at`),
    index("student_sessions_student_idx").on(t.studentId),
    index("student_sessions_expiry_idx").on(t.expiresAt),
  ],
);

/**
 * Failed sign-in throttling, keyed by e.g. a hashed student ID or a hashed IP address.
 * Keys never contain raw identifiers or addresses.
 */
export const authThrottles = pgTable(
  "auth_throttles",
  {
    key: text().primaryKey(),
    failureCount: integer().notNull().default(0),
    windowStartedAt: timestamptz().notNull().defaultNow(),
    lockedUntil: timestamptz(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("auth_throttles_failures", sql`failure_count >= 0`),
    index("auth_throttles_locked_idx").on(t.lockedUntil),
  ],
);
