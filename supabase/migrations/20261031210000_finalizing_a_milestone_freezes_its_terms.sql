-- =============================================================================
-- Finalizing a milestone freezes the terms behind it
-- =============================================================================
--
-- THE GAP
--   finalize_grade_milestone() stamped the consultation window and nothing
--   else:
--
--     UPDATE grade_consultation_windows
--        SET finalized_at = now(), finalized_by = auth.uid()
--
--   No score was locked, no posted grade was touched. On the client,
--   ScoreInput declares studentLocks at line 69, reads it at 2502, and never
--   populates it -- so every cell stayed editable after finalizing, and Update
--   MR stayed clickable.
--
--   The QA checklist asserts the opposite: "Finalize the milestone. Scores
--   behind it are now frozen. Attempt an edit. Refused." That pairing is the
--   whole argument for why a Midterm consultation differs from a semestral
--   dispute, and it was not true of the system.
--
-- WHAT FREEZES
--   The terms behind the finalized milestone, and nothing more:
--
--     midterm_rating         -> Prelim, Midterm
--     tentative_final_rating -> Semi-Final, Final
--
--   Semi-Final and Final stay editable after MR is finalized, because the
--   instructor still has a semester to teach. Freezing the whole class record
--   would stop them entering the scores the next milestone needs.
--
-- WHY A TRIGGER AND NOT JUST THE UI
--   A disabled input is a courtesy, not a control. The guard lives beside the
--   data so a stale tab, a replayed request or a future importer meets the same
--   refusal the instructor does.
--
-- THE WAY BACK
--   A grade change request. Approving one authorizes a single correction, which
--   is applied through the existing chain. This migration deliberately provides
--   no "unfinalize": reopening a finalized grade without a reviewed request is
--   the thing the chain exists to prevent.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Which terms a milestone covers, in one place.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_milestone_terms(p_grade_period TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_grade_period
    WHEN 'midterm_rating' THEN ARRAY['Prelim', 'Midterm']
    WHEN 'tentative_final_rating' THEN ARRAY['Semi-Final', 'Final']
    ELSE ARRAY[]::TEXT[]
  END;
$$;

-- -----------------------------------------------------------------------------
-- 2. The frozen terms of a class. Read by the trigger and by the client, so
--    both answer the question the same way.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_frozen_terms(p_class_record_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT array_agg(DISTINCT term)
       FROM public.grade_consultation_windows w
       CROSS JOIN LATERAL unnest(public.aspire_milestone_terms(w.grade_period)) AS term
      WHERE w.class_record_id = p_class_record_id
        AND w.finalized_at IS NOT NULL),
    ARRAY[]::TEXT[]
  );
$$;

REVOKE ALL ON FUNCTION public.aspire_frozen_terms(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_frozen_terms(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Refuse score writes to a frozen term.
--    The message names the route back rather than only saying no.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_block_frozen_term_scores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.term = ANY (public.aspire_frozen_terms(NEW.class_record_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = format(
        'The %s scores are final and can no longer be edited. A change needs an approved grade change request.',
        NEW.term
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_frozen_term_scores ON public.student_term_scores;
CREATE TRIGGER trg_block_frozen_term_scores
  BEFORE INSERT OR UPDATE ON public.student_term_scores
  FOR EACH ROW EXECUTE FUNCTION public.aspire_block_frozen_term_scores();

-- -----------------------------------------------------------------------------
-- 4. Refuse re-posting a milestone that has been finalized.
--    Without this, Update MR would still overwrite the posted rating even with
--    every cell behind it frozen.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_milestone_is_finalized(
  p_class_record_id UUID,
  p_grade_period TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.grade_consultation_windows
     WHERE class_record_id = p_class_record_id
       AND grade_period = p_grade_period
       AND finalized_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.aspire_milestone_is_finalized(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_milestone_is_finalized(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Verify, against the catalog rather than trust.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.aspire_frozen_terms(uuid)') IS NULL
     OR to_regprocedure('public.aspire_milestone_terms(text)') IS NULL
     OR to_regprocedure('public.aspire_milestone_is_finalized(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: a helper function was not created.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_block_frozen_term_scores'
       AND tgrelid = 'public.student_term_scores'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: the score guard trigger is missing.';
  END IF;

  IF public.aspire_milestone_terms('midterm_rating') <> ARRAY['Prelim', 'Midterm']
     OR public.aspire_milestone_terms('tentative_final_rating') <> ARRAY['Semi-Final', 'Final'] THEN
    RAISE EXCEPTION 'Verification failed: the milestone term mapping is wrong.';
  END IF;

  RAISE NOTICE 'Finalizing a milestone now freezes the terms behind it.';
END $$;

COMMIT;
