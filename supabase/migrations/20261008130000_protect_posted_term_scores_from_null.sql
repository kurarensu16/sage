-- =============================================================================
-- ASPIRE: PREVENT POSTED-TERM SCORES FROM BEING CLEARED
-- =============================================================================
-- Faculty may replace a score after a milestone is posted, then repost the
-- milestone. They may not clear a previously recorded score back to NULL (or
-- delete its granular score row), because that silently invalidates the basis
-- of the posted grade.

BEGIN;

CREATE OR REPLACE FUNCTION public.aspire_term_has_posted_milestone(
  p_class_record_id UUID,
  p_student_id UUID,
  p_term TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.posted_grades pg
    WHERE pg.class_record_id = p_class_record_id
      AND pg.student_id = p_student_id
      AND (
        lower(pg.grade_period::TEXT) IN ('semestral_grade', 'sg')
        OR (
          lower(replace(p_term, '-', '_')) IN ('prelim', 'midterm')
          AND lower(pg.grade_period::TEXT) IN ('midterm_rating', 'midterm', 'mr', 'final')
        )
        OR (
          lower(replace(p_term, '-', '_')) IN ('semi_final', 'final')
          AND lower(pg.grade_period::TEXT) IN ('tentative_final_rating', 'tfr', 'final')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_posted_term_score_clearing()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_posted BOOLEAN;
BEGIN
  v_is_posted := public.aspire_term_has_posted_milestone(
    OLD.class_record_id,
    OLD.student_id,
    OLD.term
  );

  IF NOT v_is_posted THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('%s scores cannot be deleted because the term is already posted.', OLD.term);
  END IF;

  IF (OLD.act1 IS NOT NULL AND NEW.act1 IS NULL)
    OR (OLD.act2 IS NOT NULL AND NEW.act2 IS NULL)
    OR (OLD.act3 IS NOT NULL AND NEW.act3 IS NULL)
    OR (OLD.act4 IS NOT NULL AND NEW.act4 IS NULL)
    OR (OLD.act5 IS NOT NULL AND NEW.act5 IS NULL)
    OR (OLD.act6 IS NOT NULL AND NEW.act6 IS NULL)
    OR (OLD.char_rating IS NOT NULL AND NEW.char_rating IS NULL)
    OR (OLD.exam IS NOT NULL AND NEW.exam IS NULL)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('%s contains a posted score that cannot be cleared. Enter a numeric replacement instead.', OLD.term);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_posted_term_score_clearing
  ON public.student_term_scores;
CREATE TRIGGER trg_prevent_posted_term_score_clearing
BEFORE UPDATE OR DELETE ON public.student_term_scores
FOR EACH ROW
EXECUTE FUNCTION public.prevent_posted_term_score_clearing();

CREATE OR REPLACE FUNCTION public.prevent_posted_activity_score_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_class_record_id UUID;
  v_term TEXT;
BEGIN
  SELECT activity.class_record_id, activity.term
  INTO v_class_record_id, v_term
  FROM public.class_activities activity
  WHERE activity.activity_id = OLD.activity_id;

  IF public.aspire_term_has_posted_milestone(v_class_record_id, OLD.student_id, v_term) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('%s activity scores cannot be cleared because the term is already posted. Enter a numeric replacement instead.', v_term);
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_posted_activity_score_deletion
  ON public.student_activity_scores;
CREATE TRIGGER trg_prevent_posted_activity_score_deletion
BEFORE DELETE ON public.student_activity_scores
FOR EACH ROW
EXECUTE FUNCTION public.prevent_posted_activity_score_deletion();

COMMIT;
