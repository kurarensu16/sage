-- =============================================================================
-- The rollover closes whatever the finalizations missed
-- =============================================================================
--
-- WHY A BACKSTOP IS NEEDED
--   20261103091500 closes a plan when its milestone is finalized. Not every
--   milestone gets finalized. A class can be posted to MR and left there, or
--   posted to MR and TFR with neither consultation window ever closed -- which
--   is exactly the shape Pass B is being set up with, deliberately, so the
--   grace period and the unresolved-work checks have something to test.
--
--   Those plans would otherwise stay open forever: editable in a term that no
--   longer exists, attached to a class whose status is 'archived'.
--
-- WHY IT IS NOT JUST "CLOSE EVERYTHING"
--   It reuses aspire_close_period_evaluations(), so a plan closed here is
--   recorded by the same rule, earns the same two outcomes, closes its referral
--   the same way, and notifies the same three people. One closure path, two
--   triggers -- rather than a second implementation that could drift from the
--   first.
--
--   The only difference is closed_by_event = 'term_rollover', so a report can
--   tell "the instructor finalized and it lapsed" from "the term ended and
--   nobody finalized at all". Those are different stories about the same class.
--
-- ORDER WITHIN THE ROLLOVER
--   perform_semester_transition() sets class_records.status = 'archived' and
--   then stamps academic_terms.ended_at. This fires on the ended_at UPDATE, so
--   the classes are already archived by the time it runs -- which is why it
--   selects on term membership rather than on class status.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.aspire_close_plans_on_rollover()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class  RECORD;
  v_period TEXT;
  v_total  INTEGER := 0;
BEGIN
  IF NEW.ended_at IS NULL OR OLD.ended_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  FOR v_class IN
    SELECT DISTINCT e.class_record_id
    FROM public.student_risk_evaluations e
    JOIN public.class_records c ON c.class_record_id = e.class_record_id
    WHERE e.closure_state IS NULL
      AND e.status IN ('submitted', 'acknowledged_by_student')
      AND e.published_to_student_at IS NOT NULL
      -- Matches the term either by id or by the school_year/semester pair,
      -- because class_records.term_id is still NULL on rows that predate
      -- 20261011130000's backfill.
      AND (
        c.term_id = NEW.term_id
        OR (c.term_id IS NULL
            AND c.school_year = NEW.school_year
            AND c.semester::TEXT = NEW.semester::TEXT)
      )
  LOOP
    -- Both milestones, because a plan may sit behind either and the worker
    -- only touches the terms its own milestone covers.
    FOREACH v_period IN ARRAY ARRAY['midterm_rating', 'tentative_final_rating'] LOOP
      v_total := v_total + public.aspire_close_period_evaluations(
        v_class.class_record_id, v_period, 'term_rollover'
      );
    END LOOP;
  END LOOP;

  IF v_total > 0 THEN
    RAISE NOTICE 'Rollover closed % action plan(s) that were never finalized.', v_total;
  END IF;

  RETURN NEW;
END;
$$;

-- Plain AFTER UPDATE rather than UPDATE OF ended_at: the guard above makes it
-- idempotent, and naming the column would miss a rewrite that sets it through
-- a different statement. Same shape as trg_archive_tutor_plans_on_rollover.
DROP TRIGGER IF EXISTS trg_close_plans_on_rollover ON public.academic_terms;
CREATE TRIGGER trg_close_plans_on_rollover
  AFTER UPDATE ON public.academic_terms
  FOR EACH ROW EXECUTE FUNCTION public.aspire_close_plans_on_rollover();

-- -----------------------------------------------------------------------------
-- Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE v_def TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_close_plans_on_rollover'
      AND tgrelid = 'public.academic_terms'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: the rollover does not close unfinalized plans.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'aspire_close_plans_on_rollover';

  -- One closure path. A second implementation here would drift from the
  -- finalization one and start producing different outcomes for the same facts.
  IF position('aspire_close_period_evaluations' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the backstop does not reuse the shared closure worker.';
  END IF;

  IF position('term_rollover' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a rollover closure would be indistinguishable from a finalization one.';
  END IF;

  IF to_regprocedure('public.aspire_close_period_evaluations(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: run 20261103091500 first — this trigger calls the worker it creates.';
  END IF;

  -- The tutor-plan archiver must survive: both hang off academic_terms, and a
  -- careless DROP TRIGGER here would have taken it with it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_archive_tutor_plans_on_rollover'
      AND tgrelid = 'public.academic_terms'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: trg_archive_tutor_plans_on_rollover is gone.';
  END IF;

  RAISE NOTICE 'The rollover now closes any plan the finalizations never reached.';
END
$verify$;

COMMIT;
