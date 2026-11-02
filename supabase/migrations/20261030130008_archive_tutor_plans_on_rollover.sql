-- Phase 7 — Archive study plans when a term rolls over
-- =============================================================================
-- 2026-10-30. The last piece of the owner's retention decision: when a term
-- ends, an unfinished plan is ARCHIVED rather than deleted, and the student's
-- list starts clean for the new term.
--
-- WHY A TRIGGER ON academic_terms, NOT AN EDIT TO perform_semester_transition
-- The transition function is live registrar machinery that moves grades and
-- enrolments. Adding a tutor concern to it would mean a bug in a study-plan
-- update could abort a semester rollover -- a catastrophic trade for a feature
-- this small.
--
-- Hooking the table instead is also simply more correct. perform_semester_
-- transition sets academic_terms.ended_at (20261011130000, line 379), but so
-- would a correction made by hand in the SQL editor. Watching the column means
-- every way a term can end is covered, now and later.
--
-- SAFETY
-- This fires DURING a semester rollover. The body is wrapped so that a problem
-- archiving a plan can never abort the transition -- a plan left showing as
-- active is a cosmetic fault; a half-finished rollover is not.
--
-- THE CAP DOES NOT DEPEND ON THIS
-- idx_one_active_plan_per_scope already includes term_id, so a new term is
-- never blocked by last term's plan even if this never ran. Archiving is for
-- the student's list reading honestly, not for correctness.

BEGIN;

CREATE OR REPLACE FUNCTION public.aspire_archive_tutor_plans_on_rollover()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    -- Only on the transition into "ended". A term that was already ended, or
    -- one being edited for some other reason, changes nothing.
    IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
      UPDATE public.student_tutor_plans p
      SET status = CASE
            -- A plan whose every item was ticked is finished, not merely old.
            -- Labelling it "Past term" would misreport what the student did.
            WHEN jsonb_typeof(p.items) = 'array'
             AND jsonb_array_length(p.items) > 0
             AND NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements(p.items) e
               WHERE COALESCE((e->>'done')::BOOLEAN, FALSE) = FALSE
             )
            THEN 'completed'
            ELSE 'archived'
          END,
          updated_at = now()
      WHERE p.status = 'active'
        AND (
          p.term_id = NEW.term_id
          -- Plans made while no term was active have no term to match. One
          -- created before this term ended belongs to the period just closed,
          -- so it goes with it; a later one is left alone.
          OR (p.term_id IS NULL AND p.created_at < NEW.ended_at)
        );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Never let tidying a study plan abort a semester rollover.
    NULL;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_archive_tutor_plans_on_rollover() FROM PUBLIC, anon, authenticated;

-- Plain AFTER UPDATE rather than UPDATE OF ended_at: the guard above makes it
-- cheap, academic_terms holds a handful of rows, and this cannot be missed by a
-- statement that happens to write the column in an unexpected way.
DROP TRIGGER IF EXISTS trg_archive_tutor_plans_on_rollover ON public.academic_terms;
CREATE TRIGGER trg_archive_tutor_plans_on_rollover
  AFTER UPDATE ON public.academic_terms
  FOR EACH ROW EXECUTE FUNCTION public.aspire_archive_tutor_plans_on_rollover();

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
DO $verify$
BEGIN
  IF to_regclass('public.student_tutor_plans') IS NULL THEN
    RAISE EXCEPTION 'Phase 7 rollover aborted: student_tutor_plans is missing. Apply 20261030121641 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE NOT tgisinternal AND tgname = 'trg_archive_tutor_plans_on_rollover'
  ) THEN
    RAISE EXCEPTION 'Verification failed: the rollover archive trigger was not installed.';
  END IF;

  -- 'archived' must be an allowed status, or every rollover would silently
  -- fail inside the exception handler and nothing would ever be archived.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.student_tutor_plans'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%archived%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: student_tutor_plans does not allow the archived status.';
  END IF;

  RAISE NOTICE 'Rollover archiving installed. Unfinished plans archive when a term ends; completed ones are recorded as finished.';
END;
$verify$;

COMMIT;
