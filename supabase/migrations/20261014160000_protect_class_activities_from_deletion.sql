-- Phase 1.1 — Stop a grading column from being deleted once it holds student scores.
--
-- student_activity_scores.activity_id is ON DELETE CASCADE
-- (20260819000000_dynamic_grading_schema.sql:53), so deleting one class_activities row
-- silently removes every student's recorded score for that column. Faculty and admin
-- credentials already carry DELETE on class_activities through the
-- class_activities_faculty_mutation policy (FOR ALL) and an explicit GRANT
-- (20261008180000_grading_authorization_hardening.sql), and unlike student_term_scores
-- and student_activity_scores, class_activities never received a delete guard.
--
-- The only existing protection, prevent_posted_activity_score_deletion
-- (20261008130000), fires on the cascade and blocks it only when the term has already
-- been officially posted. It does not stop a column with real, unposted scores from
-- being destroyed. This trigger closes that gap, and it runs before the cascade.
--
-- "No score recorded" is the absence of a student_activity_scores row: score is
-- NOT NULL DEFAULT 0 CHECK (score >= 0), so a stored 0 is a real, deliberate zero and
-- must block deletion exactly like any other value.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_class_activity_deletion_with_scores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_score_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_score_count
  FROM public.student_activity_scores
  WHERE activity_id = OLD.activity_id;

  IF v_score_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'Cannot delete "%s": %s student score(s) are already recorded in this column. Clear the scores first, or keep the column.',
        COALESCE(OLD.name, OLD.title, 'this column'),
        v_score_count
      );
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_class_activity_deletion_with_scores ON public.class_activities;
CREATE TRIGGER trg_prevent_class_activity_deletion_with_scores
  BEFORE DELETE ON public.class_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_class_activity_deletion_with_scores();

COMMIT;
