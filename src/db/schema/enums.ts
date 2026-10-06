import { pgEnum } from "drizzle-orm/pg-core";

/** Where a row came from: created in V2, or imported from the V1 Firebase app. */
export const recordSource = pgEnum("record_source", ["v2", "v1_import"]);

export const studentStatus = pgEnum("student_status", [
  "active",
  "graduated",
  "withdrawn",
  "suspended",
  "archived",
]);

export const gender = pgEnum("gender", ["female", "male"]);

/** active → exactly one of promoted / repeated / graduated / withdrawn when the session ends. */
export const enrollmentStatus = pgEnum("enrollment_status", [
  "active",
  "promoted",
  "repeated",
  "graduated",
  "withdrawn",
]);

export const sessionStatus = pgEnum("session_status", ["planned", "active", "closed", "archived"]);
export const termStatus = pgEnum("term_status", ["planned", "active", "closed"]);

export const termResultStatus = pgEnum("term_result_status", ["draft", "finalized"]);

/** Ledger rows are never edited or deleted; a mistake is voided and re-entered. */
export const ledgerStatus = pgEnum("ledger_status", ["posted", "voided"]);
export const paymentMethod = pgEnum("payment_method", ["cash", "bank_transfer", "pos", "other"]);

export const promotionOutcome = pgEnum("promotion_outcome", ["promoted", "repeated", "graduated"]);

export const staffStatus = pgEnum("staff_status", [
  "invited",
  "active",
  "suspended",
  "deactivated",
]);
export const permissionEffect = pgEnum("permission_effect", ["grant", "deny"]);

export const credentialKind = pgEnum("credential_kind", ["pin", "legacy_v1_password"]);

export const actorType = pgEnum("actor_type", ["staff", "student", "system"]);

export const migrationRunStatus = pgEnum("migration_run_status", [
  "running",
  "succeeded",
  "failed",
]);
export const issueSeverity = pgEnum("issue_severity", ["info", "warning", "error"]);
