import { bigint, boolean, index, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz } from "./_shared";
import { issueSeverity, migrationRunStatus } from "./enums";
import { staffUsers } from "./staff";

/** One execution of the V1 → V2 import (dry runs included). */
export const migrationRuns = pgTable("migration_runs", {
  id: uuid().primaryKey().defaultRandom(),
  source: text().notNull(),
  dryRun: boolean().notNull(),
  status: migrationRunStatus().notNull().default("running"),
  startedAt: createdAt(),
  finishedAt: timestamptz(),
  summary: jsonb().notNull().default({}),
  startedById: uuid().references(() => staffUsers.id, { onDelete: "restrict" }),
});

/**
 * Maps each imported V1 document (by Firestore path) to the V2 row it became, so the
 * import can be re-run safely without duplicating anything.
 */
export const legacyRecordMap = pgTable(
  "legacy_record_map",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    runId: uuid()
      .notNull()
      .references(() => migrationRuns.id, { onDelete: "restrict" }),
    sourcePath: text().notNull(),
    targetTable: text().notNull(),
    targetId: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("legacy_record_map_source_target_unique").on(t.sourcePath, t.targetTable),
    index("legacy_record_map_target_idx").on(t.targetTable, t.targetId),
  ],
);

/** Data-quality findings reported by an import run. */
export const migrationIssues = pgTable(
  "migration_issues",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    runId: uuid()
      .notNull()
      .references(() => migrationRuns.id, { onDelete: "restrict" }),
    severity: issueSeverity().notNull(),
    code: text().notNull(),
    sourcePath: text(),
    message: text().notNull(),
    details: jsonb().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("migration_issues_run_idx").on(t.runId, t.severity),
    index("migration_issues_code_idx").on(t.code),
  ],
);
