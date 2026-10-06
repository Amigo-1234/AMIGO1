import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import { DEFAULT_CURRICULUM, DEFAULT_LEVELS, DEFAULT_TERM_TYPES } from "@/domain/curriculum";
import { DEFAULT_GRADING_POLICY } from "@/domain/grading";
import { ALL_PERMISSIONS, DEFAULT_ROLES } from "@/domain/permissions";
import { openScriptConnection, reportScriptError } from "./connection";

/**
 * Read-only verification of a live database against this repository:
 * migrations applied, every table/constraint/index from the Drizzle snapshot present, the
 * integrity triggers installed, seed data complete, and a few constraint probes.
 *
 * The probes run inside a transaction that is always rolled back, and each one is designed
 * to be rejected by a CHECK constraint, so nothing is ever written.
 */

const MIGRATIONS_DIR = "drizzle";

// Trigger names installed by drizzle/0001_integrity_safeguards.sql (keep in sync).
const UPDATED_AT_TABLES = [
  "levels",
  "subjects",
  "level_subjects",
  "grading_policies",
  "academic_sessions",
  "terms",
  "students",
  "student_id_counters",
  "guardians",
  "enrollments",
  "term_results",
  "result_scores",
  "result_publications",
  "fee_structures",
  "document_counters",
  "staff_users",
  "roles",
  "auth_throttles",
  "system_settings",
];
const NO_DELETE_TABLES = [
  "academic_sessions",
  "terms",
  "students",
  "student_identifiers",
  "enrollments",
  "term_results",
  "result_scores",
  "result_score_revisions",
  "result_publications",
  "fee_charges",
  "payments",
  "promotion_batches",
  "promotions",
  "student_credentials",
  "audit_logs",
  "migration_runs",
  "legacy_record_map",
  "migration_issues",
];
const APPEND_ONLY_TABLES = [
  "student_identifiers",
  "result_score_revisions",
  "promotions",
  "audit_logs",
  "legacy_record_map",
];
const NAMED_TRIGGERS = [
  "students_public_id_immutable",
  "students_primary_identifier_check",
  "student_identifiers_primary_check",
  "fee_charges_void_only",
  "payments_void_only",
  "student_credentials_restricted_update",
  "result_scores_rules",
  "result_scores_revision_on_insert",
  "result_scores_revision_on_update",
  "academic_sessions_lock_policy",
  "grading_policies_lock",
  "grade_bands_lock",
];
const EXPECTED_TRIGGERS = [
  ...UPDATED_AT_TABLES.map((t) => `${t}_set_updated_at`),
  ...NO_DELETE_TABLES.flatMap((t) => [`${t}_forbid_delete`, `${t}_forbid_truncate`]),
  ...APPEND_ONLY_TABLES.map((t) => `${t}_forbid_update`),
  ...NAMED_TRIGGERS,
];
const EXTRA_CONSTRAINTS = ["students_public_id_registered"];

type Snapshot = {
  tables: Record<
    string,
    {
      name: string;
      indexes: Record<string, unknown>;
      foreignKeys: Record<string, unknown>;
      compositePrimaryKeys: Record<string, unknown>;
      uniqueConstraints: Record<string, unknown>;
      checkConstraints: Record<string, unknown>;
    }
  >;
};

let failures = 0;
function report(ok: boolean, label: string, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`);
}

function latestSnapshot(): Snapshot {
  const files = readdirSync(path.join(MIGRATIONS_DIR, "meta"))
    .filter((f) => f.endsWith("_snapshot.json"))
    .sort();
  return JSON.parse(readFileSync(path.join(MIGRATIONS_DIR, "meta", files.at(-1)!), "utf8"));
}

async function names(client: PoolClient, query: string): Promise<Set<string>> {
  const { rows } = await client.query<{ name: string }>(query);
  return new Set(rows.map((r) => r.name));
}

function missing(expected: Iterable<string>, actual: Set<string>) {
  return [...expected].filter((n) => !actual.has(n));
}

async function verifyStructure(client: PoolClient) {
  const { rows: version } = await client.query<{ server_version: string }>("SHOW server_version");
  console.log(`PostgreSQL ${version[0].server_version}`);

  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
  );
  const { rows: applied } = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
  );
  report(
    Number(applied[0].count) === journal.entries.length,
    "Migrations applied",
    `${applied[0].count} of ${journal.entries.length}`,
  );

  const snapshot = latestSnapshot();
  const tables = Object.values(snapshot.tables);
  const expectedConstraints = tables.flatMap((t) => [
    `${t.name}_pkey`,
    ...Object.keys(t.foreignKeys),
    ...Object.keys(t.compositePrimaryKeys),
    ...Object.keys(t.uniqueConstraints),
    ...Object.keys(t.checkConstraints),
  ]);
  // Composite primary keys are named <table>_<cols>_pk by Drizzle; single ones <table>_pkey.
  const compositeTables = new Set(
    tables.filter((t) => Object.keys(t.compositePrimaryKeys).length).map((t) => t.name),
  );
  const expectedConstraintNames = expectedConstraints.filter(
    (n) => !(n.endsWith("_pkey") && compositeTables.has(n.slice(0, -5))),
  );

  const actualTables = await names(
    client,
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  const missingTables = missing(
    tables.map((t) => t.name),
    actualTables,
  );
  report(
    missingTables.length === 0,
    "Tables",
    missingTables.length ? `missing ${missingTables}` : `${tables.length} present`,
  );

  const actualConstraints = await names(
    client,
    "SELECT conname AS name FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'",
  );
  const missingConstraints = missing(
    [...expectedConstraintNames, ...EXTRA_CONSTRAINTS],
    actualConstraints,
  );
  report(
    missingConstraints.length === 0,
    "Constraints (PK, FK, unique, check)",
    missingConstraints.length
      ? `missing ${missingConstraints}`
      : `${expectedConstraintNames.length + EXTRA_CONSTRAINTS.length} present`,
  );

  const expectedIndexes = tables.flatMap((t) => Object.keys(t.indexes));
  const actualIndexes = await names(
    client,
    "SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'",
  );
  const missingIndexes = missing(expectedIndexes, actualIndexes);
  report(
    missingIndexes.length === 0,
    "Indexes",
    missingIndexes.length ? `missing ${missingIndexes}` : `${expectedIndexes.length} present`,
  );

  const actualTriggers = await names(
    client,
    "SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal",
  );
  const missingTriggers = missing(EXPECTED_TRIGGERS, actualTriggers);
  report(
    missingTriggers.length === 0,
    "Integrity triggers",
    missingTriggers.length ? `missing ${missingTriggers}` : `${EXPECTED_TRIGGERS.length} present`,
  );

  const { rows: deferred } = await client.query<{ deferrable: boolean; deferred: boolean }>(
    "SELECT condeferrable AS deferrable, condeferred AS deferred FROM pg_constraint WHERE conname = 'students_public_id_registered'",
  );
  report(
    deferred[0]?.deferrable === true && deferred[0]?.deferred === true,
    "Student ID registry link is deferred",
  );
}

async function count(client: PoolClient, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await client.query<{ n: string }>(sql, params);
  return Number(rows[0].n);
}

async function verifySeed(client: PoolClient) {
  report(
    (await count(client, "SELECT count(*) AS n FROM term_types WHERE code = ANY($1)", [
      DEFAULT_TERM_TYPES.map((t) => t.code),
    ])) === DEFAULT_TERM_TYPES.length,
    "Seed: term types (First, Second, Third, Legacy)",
  );

  const { rows: levelRows } = await client.query<{ code: string; next: string | null }>(
    "SELECT l.code, n.code AS next FROM levels l LEFT JOIN levels n ON n.id = l.next_level_id WHERE l.code = ANY($1)",
    [DEFAULT_LEVELS.map((l) => l.code)],
  );
  const levelChain = DEFAULT_LEVELS.every((l) =>
    levelRows.some((r) => r.code === l.code && r.next === l.nextLevelCode),
  );
  report(
    levelChain,
    "Seed: levels and promotion order",
    levelRows.map((r) => `${r.code}→${r.next ?? "graduate"}`).join(", "),
  );

  for (const [levelCode, subjects] of Object.entries(DEFAULT_CURRICULUM)) {
    const { rows } = await client.query<{ code: string }>(
      `SELECT s.code FROM level_subjects ls
       JOIN levels l ON l.id = ls.level_id JOIN subjects s ON s.id = ls.subject_id
       WHERE l.code = $1 ORDER BY ls.display_order`,
      [levelCode],
    );
    const ordered = rows.map((r) => r.code).join(",") === subjects.map((s) => s.code).join(",");
    report(ordered, `Seed: ${levelCode} curriculum in order`, `${rows.length} subjects`);
  }

  const { rows: bands } = await client.query<{
    grade: string;
    min_score: number;
    max_score: number;
    ca_max: number;
    exam_max: number;
  }>(
    `SELECT b.grade, b.min_score, b.max_score, p.ca_max, p.exam_max
     FROM grading_policies p JOIN grade_bands b ON b.policy_id = p.id
     WHERE p.is_default ORDER BY b.min_score DESC`,
  );
  const bandsMatch =
    bands.length === DEFAULT_GRADING_POLICY.bands.length &&
    bands.every(
      (b, i) =>
        b.grade === DEFAULT_GRADING_POLICY.bands[i].grade &&
        b.min_score === DEFAULT_GRADING_POLICY.bands[i].minScore &&
        b.max_score === DEFAULT_GRADING_POLICY.bands[i].maxScore &&
        b.ca_max === DEFAULT_GRADING_POLICY.caMax &&
        b.exam_max === DEFAULT_GRADING_POLICY.examMax,
    );
  report(bandsMatch, "Seed: default grading policy (CA 40 / Exam 60, A–F)");

  report(
    (await count(client, "SELECT count(*) AS n FROM permissions WHERE key = ANY($1)", [
      ALL_PERMISSIONS,
    ])) === ALL_PERMISSIONS.length,
    "Seed: permission catalogue",
    `${ALL_PERMISSIONS.length} permissions`,
  );
  for (const role of DEFAULT_ROLES) {
    const granted = await count(
      client,
      `SELECT count(*) AS n FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
       WHERE r.key = $1 AND rp.permission_key = ANY($2)`,
      [role.key, [...role.permissions]],
    );
    report(
      granted === role.permissions.length,
      `Seed: role ${role.key}`,
      `${granted}/${role.permissions.length} permissions`,
    );
  }
  report(
    (await count(
      client,
      "SELECT count(*) AS n FROM system_settings WHERE key = 'auth.legacy_v1_credentials_enabled'",
    )) === 1,
    "Seed: legacy credential setting",
  );
}

/** Each probe must be rejected by the named CHECK constraint. All inside one rolled-back transaction. */
const PROBES: Array<{ label: string; constraint: string; sql: string }> = [
  {
    label: "grading maxima must total 100",
    constraint: "grading_policies_maxima",
    sql: "INSERT INTO grading_policies (name, ca_max, exam_max) VALUES ('verify-probe', 50, 60)",
  },
  {
    label: "credentials reject plaintext",
    constraint: "student_credentials_hash_format",
    sql: "INSERT INTO student_credentials (student_id, kind, secret_hash) VALUES (gen_random_uuid(), 'pin', '123456')",
  },
  {
    label: "payments must be positive",
    constraint: "payments_amount_positive",
    sql: `INSERT INTO payments (enrollment_id, session_id, amount_kobo, source)
          VALUES (gen_random_uuid(), gen_random_uuid(), 0, 'v1_import')`,
  },
  {
    label: "scores cannot be negative",
    constraint: "result_scores_ca_range",
    sql: "INSERT INTO result_scores (term_result_id, subject_id, ca) VALUES (gen_random_uuid(), gen_random_uuid(), -1)",
  },
  {
    label: "V2 student IDs must match the official format",
    constraint: "student_identifiers_format",
    sql: "INSERT INTO student_identifiers (value, student_id, is_primary, source) VALUES ('BAD-ID', gen_random_uuid(), true, 'v2')",
  },
  {
    label: "audit entries need a consistent actor",
    constraint: "audit_logs_actor_consistent",
    sql: "INSERT INTO audit_logs (actor_type, action) VALUES ('staff', 'verify.probe')",
  },
];

async function verifyProbes(client: PoolClient) {
  await client.query("BEGIN");
  try {
    for (const probe of PROBES) {
      await client.query("SAVEPOINT probe");
      try {
        await client.query(probe.sql);
        report(false, `Probe: ${probe.label}`, "was accepted");
      } catch (error) {
        const e = error as { code?: string; constraint?: string };
        report(e.code === "23514" && e.constraint === probe.constraint, `Probe: ${probe.label}`);
      }
      await client.query("ROLLBACK TO SAVEPOINT probe");
    }
  } finally {
    await client.query("ROLLBACK");
  }
}

async function reportData(client: PoolClient) {
  const tables = [
    "students",
    "enrollments",
    "payments",
    "student_credentials",
    "staff_users",
    "audit_logs",
  ];
  const counts: string[] = [];
  for (const table of tables) {
    counts.push(`${table}=${await count(client, `SELECT count(*) AS n FROM ${table}`)}`);
  }
  console.log(`INFO  Record counts (read-only): ${counts.join(", ")}`);
}

async function main() {
  const { pool, close } = await openScriptConnection();
  const client = await pool.connect();
  try {
    await verifyStructure(client);
    await verifySeed(client);
    await verifyProbes(client);
    await reportData(client);
  } finally {
    client.release();
    await close();
  }
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => reportScriptError("Verification failed", error));
