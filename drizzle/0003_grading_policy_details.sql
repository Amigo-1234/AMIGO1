-- Grading policy details for results (Phase 5).
--
-- 1. A locked policy (one used by a session that has left planning) still cannot change
--    its maximums or grade boundaries. Two details may be completed once, never changed:
--      - the pass mark, if it was never set (NULL -> value);
--      - a grade band's English/Arabic remark, if it was never set (NULL -> text).
--    Inserting or deleting bands of a locked policy stays forbidden.
-- 2. The standard policy receives the school's decisions: pass mark 50 and the remark
--    wording below. Only empty values are filled; nothing already set is overwritten.

CREATE OR REPLACE FUNCTION enforce_grading_policy_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_locked boolean;
BEGIN
  IF TG_TABLE_NAME = 'grading_policies' THEN
    IF OLD.locked_at IS NOT NULL AND (
      NEW.ca_max IS DISTINCT FROM OLD.ca_max
      OR NEW.exam_max IS DISTINCT FROM OLD.exam_max
      OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
      OR (OLD.pass_mark IS NOT NULL AND NEW.pass_mark IS DISTINCT FROM OLD.pass_mark)
    ) THEN
      RAISE EXCEPTION 'Grading policy % is in use and locked; create a new policy instead', OLD.name
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM grading_policies
    WHERE locked_at IS NOT NULL
      AND id IN (
        CASE WHEN TG_OP = 'INSERT' THEN NEW.policy_id ELSE OLD.policy_id END,
        CASE WHEN TG_OP = 'UPDATE' THEN NEW.policy_id ELSE NULL END
      )
  ) INTO v_locked;

  IF v_locked THEN
    -- Allowed on a locked policy: filling in a remark that was never set.
    IF TG_OP = 'UPDATE'
       AND NEW.policy_id = OLD.policy_id
       AND NEW.grade = OLD.grade
       AND NEW.min_score = OLD.min_score
       AND NEW.max_score = OLD.max_score
       AND (OLD.remark_en IS NULL OR NEW.remark_en IS NOT DISTINCT FROM OLD.remark_en)
       AND (OLD.remark_ar IS NULL OR NEW.remark_ar IS NOT DISTINCT FROM OLD.remark_ar) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Grade bands of a locked grading policy cannot change'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
UPDATE grading_policies SET pass_mark = 50
WHERE name = 'Standard (CA 40 / Exam 60)' AND pass_mark IS NULL;
--> statement-breakpoint
UPDATE grade_bands AS b SET
  remark_en = coalesce(b.remark_en, w.remark_en),
  remark_ar = coalesce(b.remark_ar, w.remark_ar)
FROM grading_policies AS p,
  (VALUES
    ('A', 'Excellent', 'ممتاز'),
    ('B', 'Very good', 'جيد جدًا'),
    ('C', 'Good', 'جيد'),
    ('D', 'Fair', 'مقبول'),
    ('E', 'Weak', 'ضعيف'),
    ('F', 'Fail', 'راسب')
  ) AS w(grade, remark_en, remark_ar)
WHERE b.policy_id = p.id
  AND p.name = 'Standard (CA 40 / Exam 60)'
  AND b.grade = w.grade
  AND (b.remark_en IS NULL OR b.remark_ar IS NULL);
