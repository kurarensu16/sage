-- =============================================================================
-- A returned SG reopens its scores until the instructor resubmits it
-- =============================================================================
--
-- THE GAP
--   20261118153739 lets the Dean return a submitted Semestral Grade with a
--   reason, and lets the instructor re-post it while it is returned. But only
--   the REMARKS could change. Every score of the class stayed locked:
--
--     - aspire_assert_grade_basis_mutable refuses any score or attendance
--       write once SG rows exist, and returning the SG does not remove them;
--     - aspire_block_frozen_term_scores refuses the terms behind a finalized
--       MR or TFR consultation;
--     - an SG correction request is refused until the SG is approved
--       (trg_block_requests_on_unreleased_sg), and an MR/TFR correction writes
--       its scores outside any posting context, so the SG lock refuses it too.
--
--   So a Dean who returned an SG because a SCORE was wrong sent it back to an
--   instructor who could not change that score. Resubmitting produced the same
--   grade.
--
-- THE RULE (decided 2026-11-18)
--   While the class's SG is RETURNED, the instructor may edit its scores and
--   attendance again, then resubmit. The resubmission goes back to the Dean.
--   This repeats until the Dean approves. Once approved, the scores lock again
--   and any later change follows the existing correction flow (the student's
--   grade change request, or the instructor's SG correction request).
--
--   Submitted (waiting for the Dean) and approved SGs stay exactly as locked as
--   before. Class configuration (activity columns, maximum scores, grading
--   columns) stays locked in every state: the Dean returns a grade, not a
--   grading scheme.
--
-- WHAT THIS CHANGES
--   1. aspire_assert_grade_basis_mutable  also returns early when the class's
--                                         SG is returned. Covers term scores,
--                                         activity scores and attendance.
--   2. aspire_block_frozen_term_scores    also returns early when the class's
--                                         SG is returned, so a score behind a
--                                         finalized MR or TFR can be fixed.
--   3. MR and TFR follow the scores. Editing a Prelim or Midterm score changes
--      the MR the student already saw. The posted MR and TFR rows are brought
--      in line with the corrected scores WHEN THE DEAN APPROVES the resubmitted
--      SG, not while it is still under review, so a student sees MR, TFR and SG
--      change together, once, after approval. Each student whose MR or TFR
--      changed gets a "Progress Grade Updated" notice (and its email).
--      This runs only for a RESUBMITTED SG (submission_count > 1); a first-time
--      approval never rewrites MR or TFR.
--
-- NO TABLE IS CHANGED. Two functions are replaced; one function and one
-- trigger are added. Safe to re-run.
-- Plan: docs/02-thesis/defense/REGISTRAR_REVISIONS_PLAN_2026-11-18.md.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.aspire_sg_is_returned(uuid)') IS NULL
     OR to_regclass('public.sg_approvals') IS NULL THEN
    RAISE EXCEPTION 'Run 20261118153739_sg_approval_by_the_dean.sql first.';
  END IF;
  IF to_regprocedure('public.aspire_calculate_student_grade(uuid,uuid)') IS NULL
     OR to_regprocedure('public.aspire_transmute_grade(numeric)') IS NULL
     OR to_regprocedure('public.aspire_frozen_terms(uuid)') IS NULL THEN
    RAISE EXCEPTION 'A required grading helper is missing (aspire_calculate_student_grade, aspire_transmute_grade, aspire_frozen_terms).';
  END IF;
END
$pre$;

-- -----------------------------------------------------------------------------
-- 1. The SG score lock opens while the SG is returned.
--    Body as deployed by 20261023073500_enforce_sg_basis_lock.sql, plus the
--    returned check.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_assert_grade_basis_mutable(
  p_class_record_id UUID,
  p_student_id UUID,
  p_term TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('aspire.grade_posting_context', TRUE) IN ('posting', 'correction') THEN
    RETURN;
  END IF;

  -- The Dean returned this class's SG: its scores are open for the instructor
  -- to fix before resubmitting (20261118192713). Who may write is still decided
  -- by the score tables' own policies (the assigned faculty).
  IF public.aspire_sg_is_returned(p_class_record_id) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.posted_grades grade
    WHERE grade.class_record_id = p_class_record_id
      AND grade.student_id = p_student_id
      AND grade.grade_period::TEXT = 'semestral_grade'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'This student''s official SG basis is locked. Use the approved SG correction workflow.';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. The finalized-term freeze opens while the SG is returned.
--    Body as deployed by 20261102131349, plus the returned check.
-- -----------------------------------------------------------------------------
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

  -- The Dean returned this class's SG for correction (20261118192713). The
  -- posted MR and TFR are brought in line when the Dean approves it.
  IF public.aspire_sg_is_returned(NEW.class_record_id) THEN
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
-- 3. On approval of a RESUBMITTED SG, MR and TFR follow the corrected scores.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_sync_progress_ratings(p_class_record_id UUID, p_round INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev_context TEXT := COALESCE(current_setting('aspire.grade_posting_context', TRUE), '');
  v_row public.posted_grades%ROWTYPE;
  v_calc JSONB;
  v_rating NUMERIC;
  v_remark TEXT;
  v_label TEXT;
  v_name TEXT;
  v_changed INTEGER := 0;
BEGIN
  SELECT COALESCE(sub.code || ' - ' || sub.name, sub.code, sub.name, 'your class')
    INTO v_label
  FROM public.class_records c
  LEFT JOIN public.subjects sub ON sub.subject_id = c.subject_id
  WHERE c.class_record_id = p_class_record_id;

  -- Same context the posting function uses, so the revision guard on
  -- posted_grades accepts the new values. Restored before returning.
  PERFORM set_config('aspire.grade_posting_context', 'posting', TRUE);

  FOR v_row IN
    SELECT pg.* FROM public.posted_grades pg
    WHERE pg.class_record_id = p_class_record_id
      AND pg.grade_period::TEXT IN ('midterm_rating', 'tentative_final_rating')
    ORDER BY pg.student_id, pg.grade_period
    FOR UPDATE
  LOOP
    v_calc := public.aspire_calculate_student_grade(p_class_record_id, v_row.student_id);
    IF NOT COALESCE((v_calc->>'ok')::BOOLEAN, FALSE) THEN
      CONTINUE;
    END IF;

    v_rating := CASE v_row.grade_period::TEXT
      WHEN 'midterm_rating' THEN NULLIF(v_calc->>'mr', '')::NUMERIC
      ELSE NULLIF(v_calc->>'tfr', '')::NUMERIC
    END;
    IF v_rating IS NULL OR v_rating IS NOT DISTINCT FROM v_row.computed_grade THEN
      CONTINUE;
    END IF;

    -- Derived as post_grade_milestone_v2 derives a milestone remark. An
    -- exceptional remark the instructor set (INC, Dropped, FDA) is kept.
    v_remark := CASE
      WHEN v_row.remarks::TEXT IN ('passed', 'failed') OR v_row.remarks IS NULL THEN
        CASE WHEN public.aspire_transmute_grade(v_rating) <= 3.00 THEN 'passed' ELSE 'failed' END
      ELSE v_row.remarks::TEXT
    END;

    UPDATE public.posted_grades pg SET
      computed_grade = v_rating,
      remarks = v_remark::public.grade_remarks,
      posted_at = CURRENT_TIMESTAMP,
      calculation_engine_version = COALESCE(v_calc->>'calculation_engine_version', pg.calculation_engine_version),
      input_snapshot_hash = COALESCE(v_calc->>'input_snapshot_hash', pg.input_snapshot_hash)
    WHERE pg.posted_grade_id = v_row.posted_grade_id;

    v_name := CASE v_row.grade_period::TEXT
      WHEN 'midterm_rating' THEN 'Midterm Rating (MR)'
      ELSE 'Tentative Final Rating (TFR)'
    END;

    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      v_row.student_id, 'grade_changed', 'Progress Grade Updated', '/student/grades', 'info',
      format('Your %s for %s was corrected from %s to %s, together with your Semestral Grade.',
             v_name, v_label, v_row.computed_grade, v_rating),
      jsonb_build_object(
        'class_record_id', p_class_record_id, 'grade_period', v_row.grade_period::TEXT,
        'computed_grade', v_rating, 'effective_grade', NULL, 'remarks', v_remark,
        'previous_grade', v_row.computed_grade, 'sg_resubmission', p_round,
        -- The email templates' names (see 20261118060222).
        'subject_code', (SELECT s.code FROM public.subjects s JOIN public.class_records c ON c.subject_id = s.subject_id WHERE c.class_record_id = p_class_record_id),
        'subject_name', (SELECT s.name FROM public.subjects s JOIN public.class_records c ON c.subject_id = s.subject_id WHERE c.class_record_id = p_class_record_id),
        'term', CASE v_row.grade_period::TEXT WHEN 'midterm_rating' THEN 'Midterm' ELSE 'Tentative Final' END,
        'rating', v_rating, 'gwa', NULL, 'remark', v_remark,
        'student_name', (SELECT NULLIF(BTRIM(COALESCE(u.last_name, '') || ', ' || COALESCE(u.first_name, '')), ',') FROM public.users u WHERE u.user_id = v_row.student_id)
      ),
      format('sg_resync:%s:%s:%s:%s', p_class_record_id, v_row.grade_period, v_row.student_id, p_round),
      FALSE
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    v_changed := v_changed + 1;
  END LOOP;

  PERFORM set_config('aspire.grade_posting_context', v_prev_context, TRUE);
  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_sync_progress_ratings(UUID, INTEGER) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.aspire_sync_progress_ratings_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.aspire_sync_progress_ratings(NEW.class_record_id, NEW.submission_count);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_sync_progress_ratings_on_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_progress_ratings_on_approval ON public.sg_approvals;
CREATE TRIGGER trg_sync_progress_ratings_on_approval
  AFTER UPDATE OF status ON public.sg_approvals
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND OLD.status = 'submitted' AND NEW.submission_count > 1)
  EXECUTE FUNCTION public.aspire_sync_progress_ratings_on_approval();

-- -----------------------------------------------------------------------------
-- 4. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef('public.aspire_assert_grade_basis_mutable(uuid,uuid,text)'::regprocedure) INTO v_def;
  IF position('aspire_sg_is_returned' IN v_def) = 0 OR position('official SG basis is locked' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the SG score lock does not open for a returned SG, or lost its refusal.';
  END IF;

  SELECT pg_get_functiondef('public.aspire_block_frozen_term_scores()'::regprocedure) INTO v_def;
  IF position('aspire_sg_is_returned' IN v_def) = 0
     OR position('aspire_frozen_terms' IN v_def) = 0
     OR position('''posting''' IN v_def) > 0 THEN
    RAISE EXCEPTION 'Verification failed: the frozen-term guard is not in the expected shape.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_sync_progress_ratings_on_approval'
      AND tgrelid = 'public.sg_approvals'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: approving a resubmitted SG would leave MR and TFR behind.';
  END IF;

  RAISE NOTICE 'A returned SG now reopens its scores; MR and TFR follow them on approval.';
END
$verify$;

COMMIT;
