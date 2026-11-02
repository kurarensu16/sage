-- =============================================================================
-- The frozen-term guard was blocking the one route it tells you to use
-- =============================================================================
--
-- THE BUG
--   Faculty -> Posted Grades & Corrections -> apply a correction the Dean has
--   already approved:
--
--     403 · 42501
--     "The Prelim scores are final and can no longer be edited.
--      A change needs an approved grade change request."
--
--   The request HAD been approved. That message is raised by
--   aspire_block_frozen_term_scores(), added 2026-10-31 in
--   20261031210000_finalizing_a_milestone_freezes_its_terms.sql, and it names
--   the grade change request as the way forward while refusing the grade change
--   request itself. A guard whose advice it does not accept.
--
-- WHY IT FIRES ON A PREVIEW
--   preview_sg_correction_request() does not simulate. It applies the proposed
--   scores for real, computes the result, and then throws a sentinel to roll
--   the whole thing back (20261023211000:305-313):
--
--     PERFORM set_config('aspire.grade_posting_context', 'correction', TRUE);
--     v_canonical := public.aspire_apply_sg_score_changes(...);
--     v_projection := public.aspire_calculate_student_grade(...);
--     RAISE EXCEPTION ... 'ASPIRE_SCORE_PREVIEW_ROLLBACK';
--
--   The handler re-raises anything that is not that sentinel. My 42501 is not,
--   so the preview surfaced it -- which is correct behaviour by the preview and
--   a defect in the guard.
--
-- WHAT I MISSED
--   aspire.grade_posting_context is the established convention on this table,
--   and every other guard on student_term_scores already honours it:
--
--     protect_locked_sg_term_scores   IN ('posting', 'correction')
--     enforce_sg_basis_lock           IN ('posting', 'correction')
--     the P0 foundation checks        NOT IN ('posting','correction','admin_override')
--
--   Mine was written without checking, and became the only guard on the table
--   that refuses a server-authored, authorised write. The repo already had the
--   answer; I did not look for it.
--
-- WHY 'posting' IS DELIBERATELY NOT EXEMPT HERE
--   The other guards admit it because they protect the BASIS of a locked SG,
--   and a posting is how that basis legitimately arrives. This guard protects
--   something narrower: a milestone an instructor has declared final.
--
--   'correction' and 'admin_override' each require a second person -- an
--   approved request, or the Registrar. 'posting' is one instructor acting
--   alone, so exempting it would let them re-post past their own finalization,
--   which is the exact thing this trigger exists to prevent.
--
--   A normal posting does not need the exemption: post_grade_milestone_v2
--   receives term rows only for blanks being converted to zero, and a milestone
--   cannot be finalized with blanks behind it. If that ever stops being true it
--   fails loudly here rather than silently somewhere else.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.aspire_block_frozen_term_scores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- An authorised correction has already been through the chain: the student
  -- raised it, the instructor validated it, the Dean approved it. Refusing it
  -- here would leave an approved correction with no way to be applied at all.
  IF COALESCE(current_setting('aspire.grade_posting_context', TRUE), '')
     IN ('correction', 'admin_override') THEN
    RETURN NEW;
  END IF;

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

-- -----------------------------------------------------------------------------
-- Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'aspire_block_frozen_term_scores';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the frozen-term guard is missing.';
  END IF;

  IF position('grade_posting_context' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the guard still refuses an approved correction.';
  END IF;

  -- The guard must still guard. Losing the refusal would silently reopen every
  -- finalized milestone, which no screen would report as wrong.
  IF position('aspire_frozen_terms' IN v_def) = 0
     OR position('can no longer be edited' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the frozen-term refusal itself was lost.';
  END IF;

  -- A single instructor acting alone must not be able to post past their own
  -- finalization, so 'posting' must NOT appear in the exemption.
  IF position('''posting''' IN v_def) > 0 THEN
    RAISE EXCEPTION 'Verification failed: a plain posting is exempt from the freeze.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_block_frozen_term_scores'
      AND tgrelid = 'public.student_term_scores'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: the guard trigger is no longer attached.';
  END IF;

  RAISE NOTICE 'An approved correction can now be previewed and applied. Ordinary edits are still refused.';
END
$verify$;

COMMIT;
