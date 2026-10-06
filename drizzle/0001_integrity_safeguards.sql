-- Database-level safeguards that Drizzle's schema builder cannot express.
-- These rules hold no matter which code path (or person with SQL access) writes data.
-- See docs/database.md → "Integrity safeguards".

-- ---------------------------------------------------------------------------
-- 1. updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'levels', 'subjects', 'level_subjects', 'grading_policies', 'academic_sessions', 'terms',
    'students', 'student_id_counters', 'guardians', 'enrollments', 'term_results',
    'result_scores', 'result_publications', 'fee_structures', 'document_counters',
    'staff_users', 'roles', 'auth_throttles', 'system_settings'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. No silent disappearance: protected rows cannot be deleted or truncated
-- ---------------------------------------------------------------------------
CREATE FUNCTION forbid_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be deleted; archive, void or revoke them instead', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academic_sessions', 'terms', 'students', 'student_identifiers', 'enrollments',
    'term_results', 'result_scores', 'result_score_revisions', 'result_publications',
    'fee_charges', 'payments', 'promotion_batches', 'promotions', 'student_credentials',
    'audit_logs', 'migration_runs', 'legacy_record_map', 'migration_issues'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_delete()',
      t || '_forbid_delete', t
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION forbid_delete()',
      t || '_forbid_truncate', t
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Append-only tables: rows can be added, never changed
-- ---------------------------------------------------------------------------
CREATE FUNCTION forbid_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only and cannot be changed', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'student_identifiers', 'result_score_revisions', 'promotions', 'audit_logs', 'legacy_record_map'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_update()',
      t || '_forbid_update', t
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Student identity: the public ID is permanent and must be the student's
--    primary entry in the identifier registry (checked at commit time, so the
--    student row and its identifier can be inserted in either order).
-- ---------------------------------------------------------------------------
CREATE FUNCTION forbid_public_id_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_id IS DISTINCT FROM OLD.public_id THEN
    RAISE EXCEPTION 'A student''s public ID cannot change (% → %)', OLD.public_id, NEW.public_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER students_public_id_immutable
  BEFORE UPDATE OF public_id ON students
  FOR EACH ROW EXECUTE FUNCTION forbid_public_id_change();
--> statement-breakpoint
ALTER TABLE students
  ADD CONSTRAINT students_public_id_registered
  FOREIGN KEY (public_id, id) REFERENCES student_identifiers (value, student_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE FUNCTION check_student_primary_identifier() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'students' THEN
    IF NOT EXISTS (
      SELECT 1 FROM student_identifiers
      WHERE value = NEW.public_id AND student_id = NEW.id AND is_primary
    ) THEN
      RAISE EXCEPTION 'Student % must have % registered as its primary identifier', NEW.id, NEW.public_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF NEW.is_primary AND NOT EXISTS (
    SELECT 1 FROM students WHERE id = NEW.student_id AND public_id = NEW.value
  ) THEN
    RAISE EXCEPTION 'Primary identifier % does not match the student''s public ID', NEW.value
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER students_primary_identifier_check
  AFTER INSERT ON students
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_student_primary_identifier();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER student_identifiers_primary_check
  AFTER INSERT ON student_identifiers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_student_primary_identifier();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. Ledgers (fee_charges, payments): the only permitted change is voiding a
--    posted row, with a reason. Corrections are new rows.
-- ---------------------------------------------------------------------------
CREATE FUNCTION enforce_void_only_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  void_columns text[] := ARRAY['status', 'voided_at', 'voided_by_id', 'void_reason'];
BEGIN
  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION '% row % is voided and cannot change', TG_TABLE_NAME, OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status <> 'voided' THEN
    RAISE EXCEPTION '% rows cannot be edited; void the row and record a corrected one', TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - void_columns) IS DISTINCT FROM (to_jsonb(OLD) - void_columns) THEN
    RAISE EXCEPTION 'Voiding a % row cannot change its other values', TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER fee_charges_void_only
  BEFORE UPDATE ON fee_charges
  FOR EACH ROW EXECUTE FUNCTION enforce_void_only_update();
--> statement-breakpoint
CREATE TRIGGER payments_void_only
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION enforce_void_only_update();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 6. Student credentials: hashes never change; a credential can only record
--    its last use and be revoked (once).
-- ---------------------------------------------------------------------------
CREATE FUNCTION enforce_credential_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  mutable_columns text[] := ARRAY['last_used_at', 'revoked_at', 'revoked_reason'];
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Revoked credentials cannot change' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - mutable_columns) IS DISTINCT FROM (to_jsonb(OLD) - mutable_columns) THEN
    RAISE EXCEPTION 'Credentials cannot be edited; revoke and issue a new one'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER student_credentials_restricted_update
  BEFORE UPDATE ON student_credentials
  FOR EACH ROW EXECUTE FUNCTION enforce_credential_update();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 7. Scores: maximums come from the session's grading policy; finalized
--    sheets are locked; every write is copied to result_score_revisions with
--    the acting staff member taken from the transaction setting app.actor_id
--    (and an optional app.change_reason).
-- ---------------------------------------------------------------------------
CREATE FUNCTION enforce_result_score_rules() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_ca_max smallint;
  v_exam_max smallint;
  v_sheet_status term_result_status;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.term_result_id <> OLD.term_result_id OR NEW.subject_id <> OLD.subject_id) THEN
    RAISE EXCEPTION 'A score cannot be moved to another result sheet or subject'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT gp.ca_max, gp.exam_max, tr.status
    INTO v_ca_max, v_exam_max, v_sheet_status
  FROM term_results tr
  JOIN academic_sessions s ON s.id = tr.session_id
  JOIN grading_policies gp ON gp.id = s.grading_policy_id
  WHERE tr.id = NEW.term_result_id;

  IF v_sheet_status = 'finalized' THEN
    RAISE EXCEPTION 'Result sheet % is finalized; reopen it before changing scores', NEW.term_result_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.ca IS NOT NULL AND NEW.ca > v_ca_max THEN
    RAISE EXCEPTION 'CA score % exceeds the maximum of %', NEW.ca, v_ca_max
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.exam IS NOT NULL AND NEW.exam > v_exam_max THEN
    RAISE EXCEPTION 'Exam score % exceeds the maximum of %', NEW.exam, v_exam_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER result_scores_rules
  BEFORE INSERT OR UPDATE ON result_scores
  FOR EACH ROW EXECUTE FUNCTION enforce_result_score_rules();
--> statement-breakpoint
CREATE FUNCTION record_result_score_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO result_score_revisions
    (result_score_id, ca_before, exam_before, ca_after, exam_after, changed_by_id, reason)
  VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.ca END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.exam END,
    NEW.ca,
    NEW.exam,
    nullif(current_setting('app.actor_id', true), '')::uuid,
    nullif(current_setting('app.change_reason', true), '')
  );
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER result_scores_revision_on_insert
  AFTER INSERT ON result_scores
  FOR EACH ROW EXECUTE FUNCTION record_result_score_revision();
--> statement-breakpoint
CREATE TRIGGER result_scores_revision_on_update
  AFTER UPDATE OF ca, exam ON result_scores
  FOR EACH ROW
  WHEN (OLD.ca IS DISTINCT FROM NEW.ca OR OLD.exam IS DISTINCT FROM NEW.exam)
  EXECUTE FUNCTION record_result_score_revision();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 8. Grading policies: once a session using a policy is active (or later),
--    the policy is locked so historical grades cannot shift.
-- ---------------------------------------------------------------------------
CREATE FUNCTION lock_grading_policy_in_use() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'planned' THEN
    UPDATE grading_policies SET locked_at = now()
    WHERE id = NEW.grading_policy_id AND locked_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER academic_sessions_lock_policy
  AFTER INSERT OR UPDATE OF status, grading_policy_id ON academic_sessions
  FOR EACH ROW EXECUTE FUNCTION lock_grading_policy_in_use();
--> statement-breakpoint
CREATE FUNCTION enforce_grading_policy_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_policy_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'grading_policies' THEN
    IF OLD.locked_at IS NOT NULL AND (
      NEW.ca_max IS DISTINCT FROM OLD.ca_max
      OR NEW.exam_max IS DISTINCT FROM OLD.exam_max
      OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
    ) THEN
      RAISE EXCEPTION 'Grading policy % is in use and locked; create a new policy instead', OLD.name
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  v_policy_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.policy_id ELSE NEW.policy_id END;
  IF EXISTS (SELECT 1 FROM grading_policies WHERE id = v_policy_id AND locked_at IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND EXISTS (
       SELECT 1 FROM grading_policies WHERE id = OLD.policy_id AND locked_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Grade bands of a locked grading policy cannot change'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER grading_policies_lock
  BEFORE UPDATE ON grading_policies
  FOR EACH ROW EXECUTE FUNCTION enforce_grading_policy_lock();
--> statement-breakpoint
CREATE TRIGGER grade_bands_lock
  BEFORE INSERT OR UPDATE OR DELETE ON grade_bands
  FOR EACH ROW EXECUTE FUNCTION enforce_grading_policy_lock();
