-- =============================================================================
-- An instructor can correct their own finalized Midterm or Tentative Final
-- =============================================================================
--
-- THE GAP
--   A student may dispute a finalized Midterm Rating, Tentative Final Rating
--   or Semestral Grade. An instructor may raise a correction for the Semestral
--   Grade only. So a mistyped Midterm score, finalized and then noticed by the
--   instructor who typed it, had NO path at all: the consultation log says it
--   plainly -- "Finalize closes the record and locks them -- after that, a
--   change needs a request from the student" -- and a student who does not
--   know the score is wrong will never raise one.
--
--   The correction then depended on the one person least able to detect it.
--
-- WHAT ALREADY EXISTED
--   Everything except the first step. milestone_correction_targets,
--   preview_milestone_correction and apply_approved_milestone_correction are
--   already milestone-aware and were built for the student's MR/TFR dispute.
--   apply_approved_milestone_correction gates on being the assigned
--   instructor, on status = 'approved', and on the period not being semestral
--   -- it never asks WHO raised the request. So an instructor-raised MR/TFR
--   correction can be applied through the existing path unchanged, and this
--   migration adds only the missing way to raise one.
--
-- WHERE IT DIFFERS FROM THE STUDENT'S REQUEST, AND WHY
--
--   1. IT STARTS AT THE DEAN, NOT AT THE INSTRUCTOR.
--      The instructor's step in the student chain is a validation gate: is
--      this dispute even applicable. When the instructor is the requester
--      there is nothing to validate, exactly as the faculty-raised semestral
--      flow already works. Filing at pending_faculty_review would park the
--      request on the desk of the person who just filed it.
--
--   2. SEMESTRAL GRADE IS REFUSED HERE.
--      It keeps submit_sg_correction_request_v2, which carries a proposed
--      remark and cascades MR -> TFR -> SG. This path deliberately does not
--      cascade, matching apply_approved_milestone_correction's own guard. Two
--      ways to raise the same semestral correction would be two ways to
--      disagree about it.
--
--   3. THE DISPUTE WINDOW DOES NOT BLOCK IT.
--      The student path refuses once the window closes, because a student
--      should not reopen a settled term indefinitely. Applying that here would
--      restore the very gap this closes: an instructor who finds their own
--      error late would again have nowhere to go. Instead the request is
--      allowed through and dean_review_grade_change_request does what it
--      already does for anything outliving the window -- routes it to
--      pending_registrar_review, so the Registrar authorises reopening a
--      closed term. Late is handled, not forbidden.
--
--   4. EVIDENCE IS REQUIRED, one to three files, same as both other paths.
--
-- NO TABLE IS CHANGED. One new function, and nothing else.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_milestone_correction_request(
  p_posted_grade_id UUID,
  p_reason_type TEXT,
  p_reason_detail TEXT,
  p_evidence_keys TEXT[],
  p_evidence_storage TEXT DEFAULT 'supabase'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_grade RECORD;
  v_request_id UUID;
  v_key TEXT;
  v_count INTEGER;
  v_parts RECORD;
  v_subject TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to raise a correction.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = v_actor AND u.role::TEXT = 'faculty'
      AND COALESCE(u.status::TEXT, 'active') = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an instructor can raise a correction for a grade they posted.';
  END IF;

  SELECT pg.posted_grade_id, pg.class_record_id, pg.student_id, pg.grade_period,
         pg.computed_grade, pg.effective_grade, pg.remarks
    INTO v_grade
  FROM public.posted_grades pg
  WHERE pg.posted_grade_id = p_posted_grade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That grade could not be found.';
  END IF;

  -- The same check the apply step makes, asked at the start rather than at the
  -- end: an instructor may only correct a class that is theirs.
  IF NOT public.is_assigned_faculty(v_grade.class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'You can only raise a correction for a class you teach.';
  END IF;

  -- Semestral belongs to the other path; anything without milestone terms is
  -- not a rating this can correct. Mirrors the guard in
  -- apply_approved_milestone_correction so the two cannot disagree.
  IF v_grade.grade_period::TEXT = 'semestral_grade'
     OR array_length(public.aspire_milestone_terms(v_grade.grade_period::TEXT), 1) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Use the semestral grade correction for a Semestral Grade. This is for a Midterm or Tentative Final Rating.';
  END IF;

  -- Before finalizing, the scores are still open and the instructor can simply
  -- fix them. A request would be slower and would need a Dean for no reason.
  IF NOT public.milestone_edits_frozen(v_grade.class_record_id, v_grade.grade_period::TEXT) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This rating is not final yet, so you can still correct the scores directly -- no request is needed.';
  END IF;

  IF p_reason_type IS NULL
     OR p_reason_type NOT IN ('computation_error', 'missing_or_incorrect_score', 'technical_issue', 'other') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Choose what the problem is.';
  END IF;

  IF length(BTRIM(COALESCE(p_reason_detail, ''))) < 20 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Explain what went wrong in a little more detail. The Dean reads this when deciding.';
  END IF;

  v_count := COALESCE(array_length(p_evidence_keys, 1), 0);
  IF v_count < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Attach at least one photo or file showing what the rating should be.';
  END IF;
  IF v_count > 3 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'You can attach up to three files.';
  END IF;

  FOREACH v_key IN ARRAY p_evidence_keys LOOP
    IF split_part(v_key, '/', 1) <> v_actor::TEXT THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'One of those files was not uploaded by you.';
    END IF;
  END LOOP;

  -- ANY open request on this grade blocks, not just another instructor's. A
  -- student dispute and an instructor correction running at once would have
  -- the Dean deciding twice about one rating, and whichever applied second
  -- would overwrite the first.
  IF EXISTS (
    SELECT 1 FROM public.remark_override_requests r
    WHERE r.posted_grade_id = p_posted_grade_id
      AND r.status IN ('pending', 'pending_faculty_review', 'pending_dean_review',
                       'pending_registrar_review', 'approved')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'There is already an open request for this grade. It has to be resolved before another is raised.';
  END IF;

  INSERT INTO public.remark_override_requests (
    class_record_id, student_id, requested_by, requested_at,
    posted_grade_id, grade_period, reason_type, reason_detail,
    submitted_by_role, status, correction_scope,
    original_computed_grade, original_effective_grade, original_remark
  ) VALUES (
    v_grade.class_record_id, v_grade.student_id, v_actor, CURRENT_TIMESTAMP,
    p_posted_grade_id, v_grade.grade_period::TEXT, p_reason_type, BTRIM(p_reason_detail),
    -- 'faculty' is what every screen reads to know this did not come from the
    -- student, and what keeps the instructor-review step off its chain.
    'faculty',
    -- Straight to the Dean: see note 1 at the top.
    'pending_dean_review',
    -- The gradebook's correction editor only opens for this scope.
    'student_score_row',
    v_grade.computed_grade, v_grade.effective_grade, v_grade.remarks::TEXT
  )
  RETURNING request_id INTO v_request_id;

  FOREACH v_key IN ARRAY p_evidence_keys LOOP
    INSERT INTO public.grade_change_evidence (request_id, object_key, storage, uploaded_by)
    VALUES (v_request_id, v_key, COALESCE(p_evidence_storage, 'supabase'), v_actor)
    ON CONFLICT (request_id, object_key) DO NOTHING;
  END LOOP;

  SELECT s.code INTO v_subject
  FROM public.class_records c
  LEFT JOIN public.subjects s ON s.subject_id = c.subject_id
  WHERE c.class_record_id = v_grade.class_record_id;

  SELECT * INTO v_parts FROM public.aspire_request_participants(v_request_id);

  PERFORM public.aspire_notify_request_step(
    v_request_id, v_parts.dean_id,
    'An instructor has asked to correct a finalized rating',
    format('An instructor reports an error in a finalized %s in %s and has asked to correct it.',
           REPLACE(v_grade.grade_period::TEXT, '_', ' '),
           COALESCE(v_subject, 'one of their classes')),
    '/dean/graderequests', 'warning'
  );

  -- The student is told at the DECISION, not here. Nothing has changed about
  -- their grade yet, and telling them an instructor thinks it is wrong before
  -- anyone has decided would worry them over something that may be refused.

  RETURN jsonb_build_object('request_id', v_request_id, 'status', 'pending_dean_review');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_milestone_correction_request(UUID, TEXT, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_milestone_correction_request(UUID, TEXT, TEXT, TEXT[], TEXT) TO authenticated;

COMMENT ON FUNCTION public.submit_milestone_correction_request(UUID, TEXT, TEXT, TEXT[], TEXT) IS
  'Lets the assigned instructor raise a correction to their own finalized '
  'Midterm or Tentative Final Rating. Files at pending_dean_review, because '
  'the instructor is the requester and has nothing to validate. Semestral '
  'grade is refused: it keeps submit_sg_correction_request_v2.';

-- -----------------------------------------------------------------------------
-- Post-conditions
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'submit_milestone_correction_request';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the instructor milestone correction path is missing.';
  END IF;

  -- The dependencies this leans on. If any is renamed, the function would
  -- still create fine and fail only when an instructor tried to use it.
  IF to_regprocedure('public.is_assigned_faculty(uuid)') IS NULL
    OR to_regprocedure('public.milestone_edits_frozen(uuid,text)') IS NULL
    OR to_regprocedure('public.aspire_milestone_terms(text)') IS NULL
  THEN
    RAISE EXCEPTION 'Verification failed: a function this one depends on is missing.';
  END IF;

  -- It must reach the Dean directly. Filing at pending_faculty_review would
  -- leave the request waiting on the instructor who raised it.
  IF position('''pending_dean_review''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: an instructor-raised correction no longer goes straight to the Dean.';
  END IF;

  -- Applying it must stay possible through the path that already exists.
  IF to_regprocedure('public.apply_approved_milestone_correction(uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: nothing can apply an approved milestone correction.';
  END IF;

  RAISE NOTICE 'An instructor can now raise a correction to their own finalized Midterm or Tentative Final Rating.';
END
$verify$;

COMMIT;
