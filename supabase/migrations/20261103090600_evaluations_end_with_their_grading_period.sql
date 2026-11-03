-- =============================================================================
-- An intervention ends when its grading period is finalized
-- =============================================================================
--
-- THE GAP
--   An intervention is scoped to a grading period. Nothing enforced that. A
--   plan written for Midterm stayed fully editable after the Midterm Rating was
--   finalized -- the student could still tick tasks, the instructor could still
--   verify them -- while the scores behind that rating were frozen and no grade
--   could move. Work that could no longer matter, accepted as though it could.
--
--   The owner's rule, 2026-11-03: "If in the midterm window the student
--   finished the evaluation, the prof can still change the grade. But if the
--   midterm rating is already finalized, the prof cannot change the grade."
--
-- WHAT THIS MIGRATION DOES
--   Only the lock and the vocabulary for recording a closure. It writes no
--   closure rows and sends no notifications -- those arrive in the next
--   migration. Installing this one changes behaviour without changing data,
--   which makes it reversible by dropping a trigger.
--
-- WHY A TRIGGER AND NOT FOUR GUARDS
--   Four RPCs can mutate an evaluation: set_advising_task_completion_with_evidence
--   (the student), verify_intervention_task and record_intervention_followup
--   (the instructor), and refer_student_evaluation_to_dean. Adding the same
--   check to each means four copies to keep in step, and a fifth writer added
--   later would simply not have it.
--
--   One BEFORE UPDATE trigger on the table catches all of them and anything
--   written next, and -- the part that matters after 2026-10-31 -- it does not
--   require re-declaring functions whose deployed bodies may differ from this
--   repo's source. 20261029040940 rewrites function bodies in place; reading a
--   migration file is not the same as reading the database.
--
-- THE SOURCE OF TRUTH IS SHARED
--   aspire_frozen_terms(class_record_id) already returns the terms behind every
--   finalized milestone, and is what trg_block_frozen_term_scores uses to
--   refuse a score edit. Using the same function means a grade and an
--   intervention can never disagree about whether a period is closed.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. How a closed evaluation is recorded.
--
--    NOT a fourth value on `status`. Its three values (draft, submitted,
--    acknowledged_by_student) are tested in RLS policies, RPC guards and client
--    filters; a fourth would drop closed evaluations out of every one of them
--    at once. That failure hides rows rather than raising, and reads on screen
--    as absence -- which is exactly how B-01, B-02, B-04 and B-11 presented.
-- -----------------------------------------------------------------------------
ALTER TABLE public.student_risk_evaluations
  ADD COLUMN IF NOT EXISTS closure_state TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by_event TEXT;

ALTER TABLE public.student_risk_evaluations
  DROP CONSTRAINT IF EXISTS student_risk_evaluations_closure_state_check;
ALTER TABLE public.student_risk_evaluations
  ADD CONSTRAINT student_risk_evaluations_closure_state_check
  CHECK (closure_state IS NULL OR closure_state IN ('unfinished', 'closed_tasks_verified'));

ALTER TABLE public.student_risk_evaluations
  DROP CONSTRAINT IF EXISTS student_risk_evaluations_closed_by_event_check;
ALTER TABLE public.student_risk_evaluations
  ADD CONSTRAINT student_risk_evaluations_closed_by_event_check
  CHECK (closed_by_event IS NULL OR closed_by_event IN ('milestone_finalized', 'term_rollover'));

-- A closure says when and why, or it is not a closure. Half a record is worse
-- than none: it would show as closed on screen with nothing explaining it.
ALTER TABLE public.student_risk_evaluations
  DROP CONSTRAINT IF EXISTS student_risk_evaluations_closure_complete_check;
ALTER TABLE public.student_risk_evaluations
  ADD CONSTRAINT student_risk_evaluations_closure_complete_check
  CHECK (
    (closure_state IS NULL AND closed_at IS NULL AND closed_by_event IS NULL)
    OR (closure_state IS NOT NULL AND closed_at IS NOT NULL AND closed_by_event IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS student_risk_evaluations_open_plans
  ON public.student_risk_evaluations (class_record_id, term)
  WHERE closure_state IS NULL;

COMMENT ON COLUMN public.student_risk_evaluations.closure_state IS
  'unfinished = tasks outstanding or unverified. closed_tasks_verified = the student did everything and it was verified, but no follow-up outcome was recorded. NULL = still open.';

-- -----------------------------------------------------------------------------
-- 2. Which closure a plan earns.
--
--    Two values, not one, because this label is shown to the STUDENT. Marking
--    a student "unfinished" when they completed every task and the instructor
--    simply never recorded the outcome would blame them for someone else's
--    omission.
--
--    A plan with no tasks is 'unfinished': nothing was asked, so nothing
--    evidences that the intervention did anything. The UI requires one to five
--    tasks, so this is a defensive branch rather than a common case.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_evaluation_closure_state(p_plan JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- SQL NULL first, and explicitly. jsonb_typeof(NULL) is NULL, so
    -- `jsonb_typeof(p_plan) <> 'array'` evaluates to NULL rather than TRUE and
    -- does not match -- then NOT EXISTS over jsonb_array_elements(NULL) finds
    -- no rows and is TRUE, so a missing plan was being reported as
    -- "the student completed everything". Caught by this migration's own
    -- verification before it ever wrote a row.
    WHEN p_plan IS NULL THEN 'unfinished'
    WHEN jsonb_typeof(p_plan) <> 'array' THEN 'unfinished'
    WHEN jsonb_array_length(p_plan) = 0 THEN 'unfinished'
    WHEN NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_plan) AS t(task)
      WHERE COALESCE(task->>'verification_status', '') <> 'verified'
    ) THEN 'closed_tasks_verified'
    ELSE 'unfinished'
  END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Refuse changes to an evaluation whose grading period is final.
--
--    Applies to student and instructor alike. The student can no longer tick a
--    task or attach evidence; the instructor can no longer verify, return,
--    record a follow-up or raise a referral. The row stays fully READABLE --
--    this blocks writes, not reads, so the record of what happened survives.
--
--    Deliberately narrow: it names the columns that mean something changed.
--    An updated_at-only touch, or the closure write itself, is not an edit of
--    the intervention and is left alone.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_block_frozen_period_evaluations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- The system closing a plan is not a user editing one. Same convention as
  -- aspire.grade_posting_context, which every other guard on the grading
  -- tables already honours.
  IF COALESCE(current_setting('aspire.evaluation_closure_context', TRUE), '') = 'closing' THEN
    RETURN NEW;
  END IF;

  IF OLD.term = ANY (public.aspire_frozen_terms(OLD.class_record_id)) THEN
    IF NEW.advising_plan IS DISTINCT FROM OLD.advising_plan
       OR NEW.followup_snapshot IS DISTINCT FROM OLD.followup_snapshot
       OR NEW.refer_to_dean IS DISTINCT FROM OLD.refer_to_dean
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.professor_notes IS DISTINCT FROM OLD.professor_notes
       OR NEW.shared_academic_feedback IS DISTINCT FROM OLD.shared_academic_feedback
    THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = format(
          'The %s grading period is final, so this action plan can no longer be changed. It stays on record as it was.',
          OLD.term
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_frozen_period_evaluations ON public.student_risk_evaluations;
CREATE TRIGGER trg_block_frozen_period_evaluations
  BEFORE UPDATE ON public.student_risk_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.aspire_block_frozen_period_evaluations();

-- -----------------------------------------------------------------------------
-- 4. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_risk_evaluations'
      AND column_name = 'closure_state'
  ) THEN
    RAISE EXCEPTION 'Verification failed: the closure columns were not added.';
  END IF;

  -- status must NOT have grown a fourth value. If a later migration adds one,
  -- every filter that lists the three will start hiding rows silently.
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid = 'public.student_risk_evaluations'::regclass
        AND conname LIKE '%status%' LIMIT 1) LIKE '%closed%' THEN
    RAISE EXCEPTION 'Verification failed: a closure value leaked into the status constraint.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_block_frozen_period_evaluations'
      AND tgrelid = 'public.student_risk_evaluations'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: a finalized period does not lock its evaluations.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'aspire_block_frozen_period_evaluations';

  -- The shared source of truth, not a second copy of the rule.
  IF position('aspire_frozen_terms' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the lock does not use aspire_frozen_terms, so a grade and its intervention could disagree.';
  END IF;

  -- The two closure values must be distinguishable, or a student who did
  -- everything is labelled the same as one who did nothing.
  IF public.aspire_evaluation_closure_state(
       '[{"task_id":"a","verification_status":"verified"}]'::JSONB
     ) <> 'closed_tasks_verified'
     OR public.aspire_evaluation_closure_state(
       '[{"task_id":"a","verification_status":"verified"},{"task_id":"b","completed":true}]'::JSONB
     ) <> 'unfinished'
     OR public.aspire_evaluation_closure_state('[]'::JSONB) <> 'unfinished'
     OR public.aspire_evaluation_closure_state(NULL) <> 'unfinished'
     OR public.aspire_evaluation_closure_state('null'::JSONB) <> 'unfinished'
     -- An unverified task among verified ones must still read as unfinished,
     -- whichever way the field is absent.
     OR public.aspire_evaluation_closure_state(
       '[{"task_id":"a","verification_status":"verified"},{"task_id":"b","verification_status":"returned"}]'::JSONB
     ) <> 'unfinished'
  THEN
    RAISE EXCEPTION 'Verification failed: the closure-state rule does not separate a completed plan from an unfinished one.';
  END IF;

  RAISE NOTICE 'Evaluations now end with their grading period. Nothing has been closed yet.';
END
$verify$;

COMMIT;
