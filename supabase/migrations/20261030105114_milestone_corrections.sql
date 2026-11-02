-- =============================================================================
-- Phase 6b — Applying a midterm or tentative-final correction
-- =============================================================================
-- Date: 2026-10-30
--
-- Separate from 6a on purpose. 6a moves a request through people; this writes
-- grades. Those deserve separate readings.
--
-- THE RULE THIS ENFORCES
-- A midterm or tentative-final correction is ISOLATED. Correcting a midterm
-- recalculates the midterm rating and nothing else -- not the tentative final,
-- not the semestral grade. If a later milestone also needs correcting, that is
-- its own request, raised and approved on its own evidence. A semestral
-- correction is the opposite and cascades through everything, which is why it
-- stays on apply_approved_sg_correction_v2 and is refused here by name.
--
-- WHY THE PREVIEW WRITES AND THEN UNDOES
-- aspire_calculate_student_grade() reads scores from the database; it has no
-- parameter for hypothetical ones. Rather than reimplement weighting and
-- transmutation in a second place -- where it would eventually disagree with
-- the first -- the preview applies the scores inside a sub-block, asks the real
-- calculator, and raises to roll the whole thing back. The figure an instructor
-- approves is therefore produced by exactly the code that will produce the
-- real one.
--
-- MIRRORING, NOT REINVENTING
-- The remark is derived the same way post_grade_milestone_v2 derives it for a
-- milestone: aspire_transmute_grade(rating) one-argument, passed when the
-- result is 3.00 or better. Using the two-argument form here would hand a
-- different remark than the original posting produced for the same number --
-- the correction has to agree with the thing it is correcting.
-- =============================================================================

BEGIN;

-- Which terms feed which milestone. Stated once; every function below asks it,
-- and it mirrors the guard inside post_grade_milestone_v2.
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
-- 1. What can be edited
-- -----------------------------------------------------------------------------
-- Only the activities belonging to the terms that feed this rating. Showing the
-- whole row, as the semestral editor does, would invite an instructor to change
-- a score that this correction has no authority over.
CREATE OR REPLACE FUNCTION public.milestone_correction_targets(p_request_id UUID)
RETURNS TABLE (
  target_key TEXT,
  target_type TEXT,
  activity_id UUID,
  term TEXT,
  field TEXT,
  label TEXT,
  original_score NUMERIC,
  max_score NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
BEGIN
  SELECT r.request_id, r.class_record_id, r.student_id, r.grade_period, r.status
    INTO v_req
  FROM public.remark_override_requests r
  WHERE r.request_id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That request could not be found.';
  END IF;

  IF NOT public.is_assigned_faculty(v_req.class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the instructor assigned to this class can open this correction.';
  END IF;

  IF array_length(public.aspire_milestone_terms(v_req.grade_period::TEXT), 1) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'A semestral grade is corrected from the class record, not here.';
  END IF;

  RETURN QUERY
  SELECT
    'activity:' || a.activity_id::TEXT,
    'activity'::TEXT,
    a.activity_id,
    a.term::TEXT,
    NULL::TEXT,
    a.name::TEXT,
    s.score,
    a.max_score
  FROM public.class_activities a
  LEFT JOIN public.student_activity_scores s
    ON s.activity_id = a.activity_id AND s.student_id = v_req.student_id
  WHERE a.class_record_id = v_req.class_record_id
    AND a.term::TEXT = ANY (public.aspire_milestone_terms(v_req.grade_period::TEXT))
  ORDER BY a.term, a.name;
END;
$$;

REVOKE ALL ON FUNCTION public.milestone_correction_targets(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.milestone_correction_targets(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Writing the scores — shared by the preview and the real thing
-- -----------------------------------------------------------------------------
-- Private: it writes without any of the checks around it, so nothing outside
-- this file may call it.
CREATE OR REPLACE FUNCTION public.aspire_write_milestone_scores(
  p_class_record_id UUID,
  p_student_id UUID,
  p_grade_period TEXT,
  p_score_changes JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_change JSONB;
  v_activity UUID;
  v_score NUMERIC;
  v_max NUMERIC;
  v_term TEXT;
  v_count INTEGER := 0;
BEGIN
  FOR v_change IN SELECT value FROM jsonb_array_elements(COALESCE(p_score_changes, '[]'::JSONB))
  LOOP
    v_activity := NULLIF(v_change->>'activity_id', '')::UUID;
    v_score := NULLIF(v_change->>'new_score', '')::NUMERIC;

    IF v_activity IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A correction row is missing the activity it refers to.';
    END IF;

    -- The activity must belong to this class AND to a term that feeds this
    -- milestone. Without this, an approved midterm correction could be used to
    -- edit a final-term score it was never approved for.
    SELECT a.max_score, a.term::TEXT INTO v_max, v_term
    FROM public.class_activities a
    WHERE a.activity_id = v_activity AND a.class_record_id = p_class_record_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A corrected score does not belong to this class.';
    END IF;

    IF NOT (v_term = ANY (public.aspire_milestone_terms(p_grade_period))) THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = FORMAT('This correction covers %s only, so a %s score cannot be changed here.',
          array_to_string(public.aspire_milestone_terms(p_grade_period), ' and '), v_term);
    END IF;

    IF v_score IS NULL OR v_score < 0 OR v_score > v_max THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = FORMAT('A corrected score must be between 0 and %s.', v_max);
    END IF;

    INSERT INTO public.student_activity_scores (student_id, activity_id, score, updated_at)
    VALUES (p_student_id, v_activity, v_score, CURRENT_TIMESTAMP)
    ON CONFLICT (student_id, activity_id)
    DO UPDATE SET score = EXCLUDED.score, updated_at = CURRENT_TIMESTAMP;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_write_milestone_scores(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. The preview
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_milestone_correction(
  p_request_id UUID,
  p_score_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_calc JSONB;
  v_rating NUMERIC;
  v_original NUMERIC;
  v_result JSONB;
BEGIN
  SELECT r.request_id, r.class_record_id, r.student_id, r.grade_period, r.status,
         r.original_computed_grade
    INTO v_req
  FROM public.remark_override_requests r
  WHERE r.request_id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That request could not be found.';
  END IF;

  IF NOT public.is_assigned_faculty(v_req.class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the instructor assigned to this class can check this correction.';
  END IF;

  IF array_length(public.aspire_milestone_terms(v_req.grade_period::TEXT), 1) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'A semestral grade is corrected from the class record, not here.';
  END IF;

  SELECT pg.computed_grade INTO v_original
  FROM public.posted_grades pg
  WHERE pg.class_record_id = v_req.class_record_id
    AND pg.student_id = v_req.student_id
    AND pg.grade_period::TEXT = v_req.grade_period::TEXT;

  -- Write, ask the real calculator, then undo. A block with an EXCEPTION clause
  -- gets its own subtransaction, so raising below discards every score written
  -- here. Nothing survives this except the answer.
  BEGIN
    PERFORM public.aspire_write_milestone_scores(
      v_req.class_record_id, v_req.student_id, v_req.grade_period::TEXT, p_score_changes
    );

    v_calc := public.aspire_calculate_student_grade(v_req.class_record_id, v_req.student_id);

    IF NOT COALESCE((v_calc->>'ok')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = COALESCE(v_calc->>'error', 'The corrected scores do not produce a complete rating.');
    END IF;

    v_rating := CASE v_req.grade_period::TEXT
      WHEN 'midterm_rating' THEN NULLIF(v_calc->>'mr', '')::NUMERIC
      ELSE NULLIF(v_calc->>'tfr', '')::NUMERIC
    END;

    v_result := jsonb_build_object(
      'ok', TRUE,
      'grade_period', v_req.grade_period::TEXT,
      'original_rating', v_original,
      'proposed_rating', v_rating,
      -- Shown so an instructor can see the remark this would produce, derived
      -- exactly as the posting function derives it.
      'proposed_remark', CASE
        WHEN v_rating IS NULL THEN NULL
        WHEN public.aspire_transmute_grade(v_rating) <= 3.00 THEN 'passed'
        ELSE 'failed'
      END,
      'terms', v_calc->'terms'
    );

    RAISE EXCEPTION USING ERRCODE = 'ASPPV', MESSAGE = v_result::TEXT;
  EXCEPTION
    WHEN SQLSTATE 'ASPPV' THEN
      -- The preview completed and has been rolled back. The message is the one
      -- channel certain to survive that rollback.
      v_result := SQLERRM::JSONB;
  END;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_milestone_correction(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_milestone_correction(UUID, JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Applying it
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_approved_milestone_correction(
  p_operation_id UUID,
  p_request_id UUID,
  p_score_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_calc JSONB;
  v_rating NUMERIC;
  v_original NUMERIC;
  v_remark TEXT;
  v_written INTEGER;
  v_parts RECORD;
  v_subject TEXT;
BEGIN
  SELECT r.* INTO v_req
  FROM public.remark_override_requests r
  WHERE r.request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That request could not be found.';
  END IF;

  IF NOT public.is_assigned_faculty(v_req.class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the instructor assigned to this class can make this correction.';
  END IF;

  -- THE GUARD THE PLAN ASKED FOR BY NAME. A semestral correction cascades
  -- through midterm and tentative final; this function does not and must never
  -- be used for one by mistake.
  IF v_req.grade_period::TEXT = 'semestral_grade'
     OR array_length(public.aspire_milestone_terms(v_req.grade_period::TEXT), 1) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'A semestral grade correction recalculates the whole term and is made from the class record, not here.';
  END IF;

  IF v_req.status <> 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Only an approved request can be applied. This one is ' || v_req.status || '.';
  END IF;

  IF COALESCE(jsonb_array_length(p_score_changes), 0) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'No score was changed, so there is nothing to apply.';
  END IF;

  SELECT pg.computed_grade INTO v_original
  FROM public.posted_grades pg
  WHERE pg.class_record_id = v_req.class_record_id
    AND pg.student_id = v_req.student_id
    AND pg.grade_period::TEXT = v_req.grade_period::TEXT;

  v_written := public.aspire_write_milestone_scores(
    v_req.class_record_id, v_req.student_id, v_req.grade_period::TEXT, p_score_changes
  );

  v_calc := public.aspire_calculate_student_grade(v_req.class_record_id, v_req.student_id);
  IF NOT COALESCE((v_calc->>'ok')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = COALESCE(v_calc->>'error', 'The corrected scores do not produce a complete rating.');
  END IF;

  v_rating := CASE v_req.grade_period::TEXT
    WHEN 'midterm_rating' THEN NULLIF(v_calc->>'mr', '')::NUMERIC
    ELSE NULLIF(v_calc->>'tfr', '')::NUMERIC
  END;

  IF v_rating IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected scores do not produce a rating.';
  END IF;

  -- Derived exactly as post_grade_milestone_v2 derives a milestone remark:
  -- one-argument transmutation, passed at 3.00 or better, effective_grade left
  -- null because a milestone has no GWA of its own.
  v_remark := CASE WHEN public.aspire_transmute_grade(v_rating) <= 3.00 THEN 'passed' ELSE 'failed' END;

  -- ONLY this milestone's row. The isolation rule lives in this WHERE clause.
  UPDATE public.posted_grades pg
  SET computed_grade = v_rating,
      effective_grade = NULL,
      remarks = v_remark::public.grade_remarks,
      official_source = 'dean_correction',
      last_correction_request_id = p_request_id,
      posted_at = CURRENT_TIMESTAMP,
      posted_by = auth.uid()
  WHERE pg.class_record_id = v_req.class_record_id
    AND pg.student_id = v_req.student_id
    AND pg.grade_period::TEXT = v_req.grade_period::TEXT;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'The posted grade this request refers to no longer exists.';
  END IF;

  UPDATE public.remark_override_requests
  SET status = 'applied',
      resolved_at = CURRENT_TIMESTAMP,
      resolved_by = auth.uid(),
      applied_posted_grade_id = v_req.posted_grade_id,
      proposed_computed_grade = v_rating,
      final_remark = v_remark
  WHERE request_id = p_request_id;

  SELECT * INTO v_parts FROM public.aspire_request_participants(p_request_id);
  SELECT COALESCE(s.code::TEXT, 'your class') INTO v_subject
  FROM public.class_records c
  LEFT JOIN public.subjects s ON s.subject_id = c.subject_id
  WHERE c.class_record_id = v_req.class_record_id;

  PERFORM public.aspire_notify_request_step(
    p_request_id, v_parts.student_id,
    'Your grade has been corrected',
    FORMAT('Your %s for %s has been corrected to %s. Only this rating changed.',
      REPLACE(v_req.grade_period::TEXT, '_', ' '), v_subject, v_rating),
    '/student/graderequests', 'info'
  );
  PERFORM public.aspire_notify_request_step(
    p_request_id, v_parts.dean_id,
    'Approved grade change applied',
    FORMAT('A correction you approved for %s has been applied by the instructor.', v_subject),
    '/dean/graderequests', 'info'
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'grade_period', v_req.grade_period::TEXT,
    'original_rating', v_original,
    'proposed_rating', v_rating,
    'remarks', v_remark,
    'scores_changed', v_written,
    'operation_id', p_operation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_approved_milestone_correction(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_approved_milestone_correction(UUID, UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.apply_approved_milestone_correction(UUID, UUID, JSONB) IS
  'Applies an approved midterm or tentative-final correction. Isolated: it '
  'recalculates only that milestone and never cascades. Refuses a semestral '
  'grade, which belongs to apply_approved_sg_correction_v2.';

-- -----------------------------------------------------------------------------
-- 5. Evidence retention
-- -----------------------------------------------------------------------------
-- Owner's decision, 2026-10-30: evidence clears at the rollover AFTER the term
-- it belongs to, and only for requests that are resolved. That spans the whole
-- dispute window and any Registrar review, so a live case never loses the proof
-- it depends on, while storage stays flat year on year.
--
-- This removes the database rows. The files themselves are removed through the
-- Storage API by whoever runs the cleanup -- deleting storage.objects rows here
-- would leave the bytes in the bucket forever.
CREATE OR REPLACE FUNCTION public.aspire_expired_evidence(p_limit INTEGER DEFAULT 200)
RETURNS TABLE (evidence_id UUID, object_key TEXT, storage TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT (public.is_active_admin() OR public.is_active_registrar()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an administrator or the Registrar can review expired evidence.';
  END IF;

  RETURN QUERY
  SELECT e.id, e.object_key, e.storage
  FROM public.grade_change_evidence e
  JOIN public.remark_override_requests r ON r.request_id = e.request_id
  JOIN public.class_records c ON c.class_record_id = r.class_record_id
  LEFT JOIN public.academic_terms t
    ON t.term_id = c.term_id
    OR (c.term_id IS NULL AND t.school_year = c.school_year AND t.semester::TEXT = c.semester::TEXT)
  WHERE r.status IN ('applied', 'rejected', 'cancelled')
    AND t.ended_at IS NOT NULL
    -- Not this term's rollover, but the one after it.
    AND EXISTS (
      SELECT 1 FROM public.academic_terms later
      WHERE later.ended_at IS NOT NULL AND later.ended_at > t.ended_at
    )
  ORDER BY e.uploaded_at
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_expired_evidence(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_expired_evidence(INTEGER) TO authenticated;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
DO $verify$
BEGIN
  IF to_regprocedure('public.milestone_correction_targets(uuid)') IS NULL
     OR to_regprocedure('public.preview_milestone_correction(uuid,jsonb)') IS NULL
     OR to_regprocedure('public.apply_approved_milestone_correction(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.aspire_milestone_terms(text)') IS NULL
     OR to_regprocedure('public.aspire_expired_evidence(integer)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: one or more correction functions are missing.';
  END IF;

  -- The term mapping is the whole isolation rule. If it ever returned all four
  -- terms, a midterm correction could silently rewrite the final.
  IF public.aspire_milestone_terms('midterm_rating') <> ARRAY['Prelim', 'Midterm'] THEN
    RAISE EXCEPTION 'Verification failed: midterm rating does not map to Prelim and Midterm.';
  END IF;
  IF public.aspire_milestone_terms('tentative_final_rating') <> ARRAY['Semi-Final', 'Final'] THEN
    RAISE EXCEPTION 'Verification failed: tentative final does not map to Semi-Final and Final.';
  END IF;
  IF array_length(public.aspire_milestone_terms('semestral_grade'), 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Verification failed: semestral grade must have no milestone terms, or it could be corrected here.';
  END IF;

  -- The apply function must still refuse a semestral grade by name. This is the
  -- single most important line in the file: without it, an approved semestral
  -- request applied here would skip the cascade and leave MR, TFR and SG
  -- disagreeing with each other.
  IF position('semestral_grade' IN
       pg_get_functiondef('public.apply_approved_milestone_correction(uuid,uuid,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the semestral-grade guard is missing from the apply function.';
  END IF;

  -- The isolation itself: the update must be scoped to one grade period.
  IF position('pg.grade_period::TEXT = v_req.grade_period::TEXT' IN
       pg_get_functiondef('public.apply_approved_milestone_correction(uuid,uuid,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the correction is not scoped to a single milestone.';
  END IF;

  RAISE NOTICE 'Phase 6b installed. Midterm and tentative-final corrections are isolated; semestral is refused.';
END
$verify$;
