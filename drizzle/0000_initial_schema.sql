CREATE TYPE "public"."actor_type" AS ENUM('staff', 'student', 'system');--> statement-breakpoint
CREATE TYPE "public"."credential_kind" AS ENUM('pin', 'legacy_v1_password');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'promoted', 'repeated', 'graduated', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('female', 'male');--> statement-breakpoint
CREATE TYPE "public"."issue_severity" AS ENUM('info', 'warning', 'error');--> statement-breakpoint
CREATE TYPE "public"."ledger_status" AS ENUM('posted', 'voided');--> statement-breakpoint
CREATE TYPE "public"."migration_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bank_transfer', 'pos', 'other');--> statement-breakpoint
CREATE TYPE "public"."permission_effect" AS ENUM('grant', 'deny');--> statement-breakpoint
CREATE TYPE "public"."promotion_outcome" AS ENUM('promoted', 'repeated', 'graduated');--> statement-breakpoint
CREATE TYPE "public"."record_source" AS ENUM('v2', 'v1_import');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('planned', 'active', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."staff_status" AS ENUM('invited', 'active', 'suspended', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'graduated', 'withdrawn', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."term_result_status" AS ENUM('draft', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."term_status" AS ENUM('planned', 'active', 'closed');--> statement-breakpoint
CREATE TABLE "academic_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"start_year" integer NOT NULL,
	"label" text GENERATED ALWAYS AS (start_year::text || '/' || (start_year + 1)::text) STORED NOT NULL,
	"status" "session_status" DEFAULT 'planned' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"grading_policy_id" uuid NOT NULL,
	"activated_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_sessions_startYear_unique" UNIQUE("start_year"),
	CONSTRAINT "academic_sessions_year_range" CHECK (start_year BETWEEN 2000 AND 2200),
	CONSTRAINT "academic_sessions_dates" CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on > starts_on)
);
--> statement-breakpoint
CREATE TABLE "grade_bands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_id" uuid NOT NULL,
	"grade" text NOT NULL,
	"min_score" smallint NOT NULL,
	"max_score" smallint NOT NULL,
	"remark_en" text,
	"remark_ar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grade_bands_policy_grade_unique" UNIQUE("policy_id","grade"),
	CONSTRAINT "grade_bands_grade_format" CHECK (grade ~ '^[A-Z][+-]?$'),
	CONSTRAINT "grade_bands_range" CHECK (min_score >= 0 AND min_score <= max_score AND max_score <= 100)
);
--> statement-breakpoint
CREATE TABLE "grading_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ca_max" smallint DEFAULT 40 NOT NULL,
	"exam_max" smallint DEFAULT 60 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grading_policies_name_unique" UNIQUE("name"),
	CONSTRAINT "grading_policies_maxima" CHECK (ca_max > 0 AND exam_max > 0 AND ca_max + exam_max = 100)
);
--> statement-breakpoint
CREATE TABLE "level_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"display_order" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_subjects_level_subject_unique" UNIQUE("level_id","subject_id"),
	CONSTRAINT "level_subjects_order_positive" CHECK (display_order > 0)
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"stage_en" text,
	"stage_ar" text,
	"sort_order" smallint NOT NULL,
	"next_level_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "levels_code_unique" UNIQUE("code"),
	CONSTRAINT "levels_sortOrder_unique" UNIQUE("sort_order"),
	CONSTRAINT "levels_code_format" CHECK (code ~ '^[A-Z]{2,5}$'),
	CONSTRAINT "levels_not_own_next" CHECK (next_level_id IS DISTINCT FROM id)
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source" "record_source" DEFAULT 'v2' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_code_unique" UNIQUE("code"),
	CONSTRAINT "subjects_code_format" CHECK (code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "term_types" (
	"code" text PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"sequence" smallint NOT NULL,
	"is_legacy" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "term_types_sequence_unique" UNIQUE("sequence"),
	CONSTRAINT "term_types_code_format" CHECK (code ~ '^[a-z_]+$')
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"term_type_code" text NOT NULL,
	"status" "term_status" DEFAULT 'planned' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_session_type_unique" UNIQUE("session_id","term_type_code"),
	CONSTRAINT "terms_id_session_unique" UNIQUE("id","session_id"),
	CONSTRAINT "terms_dates" CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on > starts_on)
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"enrolled_on" date,
	"ended_on" date,
	"source" "record_source" DEFAULT 'v2' NOT NULL,
	"legacy_student_id" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_student_session_unique" UNIQUE("student_id","session_id"),
	CONSTRAINT "enrollments_id_session_unique" UNIQUE("id","session_id"),
	CONSTRAINT "enrollments_dates" CHECK (ended_on IS NULL OR enrolled_on IS NULL OR ended_on >= enrolled_on),
	CONSTRAINT "enrollments_legacy_only_imported" CHECK (legacy_student_id IS NULL OR source = 'v1_import')
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relationship" text,
	"is_primary_contact" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_guardians_student_id_guardian_id_pk" PRIMARY KEY("student_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "student_id_counters" (
	"level_code" text NOT NULL,
	"year" integer NOT NULL,
	"last_serial" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_id_counters_level_code_year_pk" PRIMARY KEY("level_code","year"),
	CONSTRAINT "student_id_counters_serial" CHECK (last_serial >= 0)
);
--> statement-breakpoint
CREATE TABLE "student_identifiers" (
	"value" text PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"is_primary" boolean NOT NULL,
	"source" "record_source" NOT NULL,
	"level_code" text,
	"year" integer,
	"serial" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_identifiers_value_student_unique" UNIQUE("value","student_id"),
	CONSTRAINT "student_identifiers_format" CHECK (source = 'v1_import' OR value ~ '^MG[A-Z]{2,5}-[0-9]{4}-[0-9]{3,}$'),
	CONSTRAINT "student_identifiers_parts" CHECK ((level_code IS NULL AND year IS NULL AND serial IS NULL)
        OR (level_code IS NOT NULL AND year IS NOT NULL AND serial > 0))
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"full_name" text NOT NULL,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"gender" "gender",
	"date_of_birth" date,
	"phone" text,
	"address" text,
	"notes" text,
	"admitted_on" date,
	"source" "record_source" DEFAULT 'v2' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "students_publicId_unique" UNIQUE("public_id"),
	CONSTRAINT "students_full_name_present" CHECK (length(btrim(full_name)) > 0),
	CONSTRAINT "students_public_id_format" CHECK (source = 'v1_import' OR public_id ~ '^MG[A-Z]{2,5}-[0-9]{4}-[0-9]{3,}$')
);
--> statement-breakpoint
CREATE TABLE "result_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term_id" uuid NOT NULL,
	"level_id" uuid,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"changed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_publications_term_level_unique" UNIQUE NULLS NOT DISTINCT("term_id","level_id"),
	CONSTRAINT "result_publications_published_at" CHECK (NOT is_published OR published_at IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "result_score_revisions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "result_score_revisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"result_score_id" uuid NOT NULL,
	"ca_before" smallint,
	"exam_before" smallint,
	"ca_after" smallint,
	"exam_after" smallint,
	"changed_by_id" uuid,
	"reason" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "result_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term_result_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"ca" smallint,
	"exam" smallint,
	"total" smallint GENERATED ALWAYS AS (CASE WHEN ca IS NOT NULL AND exam IS NOT NULL THEN ca + exam END) STORED,
	"source" "record_source" DEFAULT 'v2' NOT NULL,
	"entered_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_scores_sheet_subject_unique" UNIQUE("term_result_id","subject_id"),
	CONSTRAINT "result_scores_ca_range" CHECK (ca IS NULL OR ca BETWEEN 0 AND 100),
	CONSTRAINT "result_scores_exam_range" CHECK (exam IS NULL OR exam BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "term_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"status" "term_result_status" DEFAULT 'draft' NOT NULL,
	"source" "record_source" DEFAULT 'v2' NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalized_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "term_results_enrollment_term_unique" UNIQUE("enrollment_id","term_id"),
	CONSTRAINT "term_results_finalized_consistent" CHECK ((status = 'finalized') = (finalized_at IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"scope" text NOT NULL,
	"year" integer NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_counters_scope_year_pk" PRIMARY KEY("scope","year"),
	CONSTRAINT "document_counters_value" CHECK (last_value >= 0)
);
--> statement-breakpoint
CREATE TABLE "fee_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"term_id" uuid,
	"fee_structure_id" uuid,
	"description" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"status" "ledger_status" DEFAULT 'posted' NOT NULL,
	"source" "record_source" DEFAULT 'v2' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by_id" uuid,
	"void_reason" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_charges_amount_positive" CHECK (amount_kobo > 0),
	CONSTRAINT "fee_charges_void_consistent" CHECK ((status = 'voided') = (voided_at IS NOT NULL AND void_reason IS NOT NULL)),
	CONSTRAINT "fee_charges_creator" CHECK (created_by_id IS NOT NULL OR source = 'v1_import')
);
--> statement-breakpoint
CREATE TABLE "fee_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"term_id" uuid,
	"description" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_structures_amount_positive" CHECK (amount_kobo > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_number" text,
	"enrollment_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"term_id" uuid,
	"amount_kobo" bigint NOT NULL,
	"paid_on" date,
	"method" "payment_method",
	"reference" text,
	"notes" text,
	"status" "ledger_status" DEFAULT 'posted' NOT NULL,
	"source" "record_source" DEFAULT 'v2' NOT NULL,
	"replaces_payment_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by_id" uuid,
	"void_reason" text,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_receiptNumber_unique" UNIQUE("receipt_number"),
	CONSTRAINT "payments_amount_positive" CHECK (amount_kobo > 0),
	CONSTRAINT "payments_void_consistent" CHECK ((status = 'voided') = (voided_at IS NOT NULL AND void_reason IS NOT NULL)),
	CONSTRAINT "payments_v2_complete" CHECK (source = 'v1_import' OR (receipt_number IS NOT NULL AND paid_on IS NOT NULL AND method IS NOT NULL AND recorded_by_id IS NOT NULL)),
	CONSTRAINT "payments_not_self_replacing" CHECK (replaces_payment_id IS DISTINCT FROM id)
);
--> statement-breakpoint
CREATE TABLE "promotion_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_session_id" uuid NOT NULL,
	"to_session_id" uuid,
	"level_id" uuid,
	"note" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid,
	"student_id" uuid NOT NULL,
	"from_enrollment_id" uuid NOT NULL,
	"to_enrollment_id" uuid,
	"outcome" "promotion_outcome" NOT NULL,
	"decided_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_fromEnrollmentId_unique" UNIQUE("from_enrollment_id"),
	CONSTRAINT "promotions_toEnrollmentId_unique" UNIQUE("to_enrollment_id"),
	CONSTRAINT "promotions_target_matches_outcome" CHECK ((outcome = 'graduated') = (to_enrollment_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_format" CHECK (key ~ '^[a-z_]+\.[a-z_]+$')
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key"),
	CONSTRAINT "roles_key_format" CHECK (key ~ '^[a-z_]+$')
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"status" "staff_status" DEFAULT 'invited' NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_authUserId_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "staff_users_email_format" CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
--> statement-breakpoint
CREATE TABLE "user_permission_overrides" (
	"user_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"effect" "permission_effect" NOT NULL,
	"reason" text,
	"granted_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_permission_overrides_user_id_permission_key_pk" PRIMARY KEY("user_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "auth_throttles" (
	"key" text PRIMARY KEY NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_throttles_failures" CHECK (failure_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "student_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "credential_kind" NOT NULL,
	"secret_hash" text NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "student_credentials_hash_format" CHECK (secret_hash ~ '^\$[a-z0-9-]+\$' AND length(secret_hash) >= 40)
);
--> statement-breakpoint
CREATE TABLE "student_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"must_set_pin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent" text,
	CONSTRAINT "student_sessions_tokenHash_unique" UNIQUE("token_hash"),
	CONSTRAINT "student_sessions_token_hash_format" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "student_sessions_expiry" CHECK (expires_at > created_at)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" uuid,
	"actor_student_id" uuid,
	"actor_label" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"request_id" text,
	CONSTRAINT "audit_logs_action_format" CHECK (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
	CONSTRAINT "audit_logs_actor_consistent" CHECK ((actor_type = 'staff' AND actor_user_id IS NOT NULL AND actor_student_id IS NULL)
        OR (actor_type = 'student' AND actor_student_id IS NOT NULL AND actor_user_id IS NULL)
        OR (actor_type = 'system' AND actor_user_id IS NULL AND actor_student_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" uuid,
	CONSTRAINT "system_settings_key_format" CHECK (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$')
);
--> statement-breakpoint
CREATE TABLE "legacy_record_map" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "legacy_record_map_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" uuid NOT NULL,
	"source_path" text NOT NULL,
	"target_table" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_record_map_source_target_unique" UNIQUE("source_path","target_table")
);
--> statement-breakpoint
CREATE TABLE "migration_issues" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "migration_issues_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" uuid NOT NULL,
	"severity" "issue_severity" NOT NULL,
	"code" text NOT NULL,
	"source_path" text,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"dry_run" boolean NOT NULL,
	"status" "migration_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_by_id" uuid
);
--> statement-breakpoint
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_grading_policy_id_grading_policies_id_fk" FOREIGN KEY ("grading_policy_id") REFERENCES "public"."grading_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_created_by_id_staff_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_policy_id_grading_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."grading_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_policies" ADD CONSTRAINT "grading_policies_created_by_id_staff_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_subjects" ADD CONSTRAINT "level_subjects_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_subjects" ADD CONSTRAINT "level_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_next_level_id_levels_id_fk" FOREIGN KEY ("next_level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_session_id_academic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_term_type_code_term_types_code_fk" FOREIGN KEY ("term_type_code") REFERENCES "public"."term_types"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_session_id_academic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_created_by_id_staff_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_legacy_student_id_fk" FOREIGN KEY ("legacy_student_id","student_id") REFERENCES "public"."student_identifiers"("value","student_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_identifiers" ADD CONSTRAINT "student_identifiers_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_created_by_id_staff_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_changed_by_id_staff_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_score_revisions" ADD CONSTRAINT "result_score_revisions_result_score_id_result_scores_id_fk" FOREIGN KEY ("result_score_id") REFERENCES "public"."result_scores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_score_revisions" ADD CONSTRAINT "result_score_revisions_changed_by_id_staff_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_scores" ADD CONSTRAINT "result_scores_term_result_id_term_results_id_fk" FOREIGN KEY ("term_result_id") REFERENCES "public"."term_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_scores" ADD CONSTRAINT "result_scores_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_scores" ADD CONSTRAINT "result_scores_entered_by_id_staff_users_id_fk" FOREIGN KEY ("entered_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_results" ADD CONSTRAINT "term_results_session_id_academic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_results" ADD CONSTRAINT "term_results_finalized_by_id_staff_users_id_fk" FOREIGN KEY ("finalized_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_results" ADD CONSTRAINT "term_results_enrollment_session_fk" FOREIGN KEY ("enrollment_id","session_id") REFERENCES "public"."enrollments"("id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_results" ADD CONSTRAINT "term_results_term_session_fk" FOREIGN KEY ("term_id","session_id") REFERENCES "public"."terms"("id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_session_id_academic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_fee_structure_id_fee_structures_id_fk" FOREIGN KEY ("fee_structure_id") REFERENCES "public"."fee_structures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_voided_by_id_staff_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_created_by_id_staff_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_enrollment_session_fk" FOREIGN KEY ("enrollment_id","session_id") REFERENCES "public"."enrollments"("id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_term_session_fk" FOREIGN KEY ("term_id","session_id") REFERENCES "public"."terms"("id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_session_id_academic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_created_by_id_staff_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_term_session_fk" FOREIGN KEY ("term_id","session_id") REFERENCES "public"."terms"("id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_academic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_replaces_payment_id_payments_id_fk" FOREIGN KEY ("replaces_payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_id_staff_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_staff_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_enrollment_session_fk" FOREIGN KEY ("enrollment_id","session_id") REFERENCES "public"."enrollments"("id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_term_session_fk" FOREIGN KEY ("term_id","session_id") REFERENCES "public"."terms"("id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_from_session_id_academic_sessions_id_fk" FOREIGN KEY ("from_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_to_session_id_academic_sessions_id_fk" FOREIGN KEY ("to_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_created_by_id_staff_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_batch_id_promotion_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."promotion_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_from_enrollment_id_enrollments_id_fk" FOREIGN KEY ("from_enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_to_enrollment_id_enrollments_id_fk" FOREIGN KEY ("to_enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_decided_by_id_staff_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_created_by_id_staff_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_staff_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_granted_by_id_staff_users_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_staff_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_id_staff_users_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_credentials" ADD CONSTRAINT "student_credentials_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_credentials" ADD CONSTRAINT "student_credentials_created_by_id_staff_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_staff_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_student_id_students_id_fk" FOREIGN KEY ("actor_student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_id_staff_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_record_map" ADD CONSTRAINT "legacy_record_map_run_id_migration_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."migration_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_issues" ADD CONSTRAINT "migration_issues_run_id_migration_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."migration_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_runs" ADD CONSTRAINT "migration_runs_started_by_id_staff_users_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_sessions_single_active" ON "academic_sessions" USING btree ("status") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "grading_policies_single_default" ON "grading_policies" USING btree ("is_default") WHERE is_default;--> statement-breakpoint
CREATE INDEX "level_subjects_level_order_idx" ON "level_subjects" USING btree ("level_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_single_active" ON "terms" USING btree ("status") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_single_active" ON "enrollments" USING btree ("student_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "enrollments_class_list_idx" ON "enrollments" USING btree ("session_id","level_id","status");--> statement-breakpoint
CREATE INDEX "student_guardians_guardian_idx" ON "student_guardians" USING btree ("guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_identifiers_one_primary" ON "student_identifiers" USING btree ("student_id") WHERE is_primary;--> statement-breakpoint
CREATE INDEX "student_identifiers_student_idx" ON "student_identifiers" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_identifiers_allocation_idx" ON "student_identifiers" USING btree ("level_code","year","serial");--> statement-breakpoint
CREATE INDEX "students_status_idx" ON "students" USING btree ("status");--> statement-breakpoint
CREATE INDEX "students_full_name_idx" ON "students" USING btree (lower(full_name));--> statement-breakpoint
CREATE INDEX "result_score_revisions_score_idx" ON "result_score_revisions" USING btree ("result_score_id","changed_at");--> statement-breakpoint
CREATE INDEX "result_scores_subject_idx" ON "result_scores" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "term_results_term_idx" ON "term_results" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "fee_charges_enrollment_idx" ON "fee_charges" USING btree ("enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_structures_active_unique" ON "fee_structures" USING btree ("session_id","level_id",coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_active;--> statement-breakpoint
CREATE INDEX "payments_enrollment_idx" ON "payments" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "payments_recent_idx" ON "payments" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payments_paid_on_idx" ON "payments" USING btree ("paid_on");--> statement-breakpoint
CREATE INDEX "promotions_student_idx" ON "promotions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "promotions_batch_idx" ON "promotions" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_email_unique" ON "staff_users" USING btree (lower(email));--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "auth_throttles_locked_idx" ON "auth_throttles" USING btree ("locked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "student_credentials_one_active_per_kind" ON "student_credentials" USING btree ("student_id","kind") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "student_sessions_student_idx" ON "student_sessions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_sessions_expiry_idx" ON "student_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "audit_logs_occurred_idx" ON "audit_logs" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "legacy_record_map_target_idx" ON "legacy_record_map" USING btree ("target_table","target_id");--> statement-breakpoint
CREATE INDEX "migration_issues_run_idx" ON "migration_issues" USING btree ("run_id","severity");--> statement-breakpoint
CREATE INDEX "migration_issues_code_idx" ON "migration_issues" USING btree ("code");