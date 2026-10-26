-- Four recorded absences create an FDA recommendation, not an automatic grade.
-- The score projection remains authoritative for Passed/Failed. An official FDA
-- is accepted only through post_grade_milestone_v3 after the assigned faculty
-- explicitly selects it and supplies a reason.

BEGIN;

CREATE OR REPLACE FUNCTION public.aspire_calculate_student_grade(
  p_class_record_id UUID,
  p_student_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class public.class_records%ROWTYPE;
  v_prelim JSONB; v_midterm JSONB; v_semi_final JSONB; v_final JSONB;
  v_p NUMERIC; v_m NUMERIC; v_sf NUMERIC; v_f NUMERIC;
  v_mr NUMERIC; v_tfr NUMERIC; v_sg NUMERIC; v_gwa NUMERIC;
  v_is_summer BOOLEAN;
  v_midterm_complete BOOLEAN; v_tfr_complete BOOLEAN; v_sg_complete BOOLEAN;
  v_absences INTEGER;
  v_fda_recommended BOOLEAN := FALSE;
  v_fda_selected BOOLEAN := FALSE;
  v_remark TEXT;
BEGIN
  SELECT * INTO v_class FROM public.class_records WHERE class_record_id = p_class_record_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Class record not found.');
  END IF;
  IF v_class.grading_formula_snapshot IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This class has no frozen grading formula snapshot.');
  END IF;
  IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_class.grading_formula_snapshot->'components') component
      WHERE NULLIF(BTRIM(component->>'name'), '') IS NULL
        OR NULLIF(component->>'weight', '')::NUMERIC <= 0
        OR NULLIF(component->>'maxScore', '')::NUMERIC <= 0
    )
    OR ABS(COALESCE((
      SELECT SUM(NULLIF(component->>'weight', '')::NUMERIC)
      FROM jsonb_array_elements(v_class.grading_formula_snapshot->'components') component
    ), 0) - 100) > 0.01
  THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'The frozen grading formula is invalid or its component weights do not total 100%.');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments enrollment
    WHERE enrollment.student_id = p_student_id
      AND enrollment.section_id = v_class.section_id
      AND enrollment.subject_id = v_class.subject_id
      AND COALESCE(enrollment.status::TEXT, 'active') = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Student is not actively enrolled in this class.');
  END IF;

  v_is_summer := lower(COALESCE(v_class.semester::TEXT, '')) LIKE '%summer%';

  v_prelim := public.aspire_calculate_term_rating(p_class_record_id, p_student_id, 'Prelim', v_class.grading_formula_snapshot);
  v_midterm := public.aspire_calculate_term_rating(p_class_record_id, p_student_id, 'Midterm', v_class.grading_formula_snapshot);
  v_semi_final := public.aspire_calculate_term_rating(p_class_record_id, p_student_id, 'Semi-Final', v_class.grading_formula_snapshot);
  v_final := public.aspire_calculate_term_rating(p_class_record_id, p_student_id, 'Final', v_class.grading_formula_snapshot);

  IF (v_is_summer AND (
      NOT COALESCE((v_midterm->>'ok')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_final->>'ok')::BOOLEAN, FALSE)
    )) OR (NOT v_is_summer AND (
      NOT COALESCE((v_prelim->>'ok')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_midterm->>'ok')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_semi_final->>'ok')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_final->>'ok')::BOOLEAN, FALSE)
    ))
  THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'error', CASE WHEN v_is_summer
        THEN COALESCE(v_midterm->>'error', v_final->>'error', 'Grade calculation failed.')
        ELSE COALESCE(v_prelim->>'error', v_midterm->>'error', v_semi_final->>'error', v_final->>'error', 'Grade calculation failed.')
      END,
      'terms', jsonb_build_object('Prelim', v_prelim, 'Midterm', v_midterm, 'Semi-Final', v_semi_final, 'Final', v_final)
    );
  END IF;

  v_p := NULLIF(v_prelim->>'rating', '')::NUMERIC;
  v_m := NULLIF(v_midterm->>'rating', '')::NUMERIC;
  v_sf := NULLIF(v_semi_final->>'rating', '')::NUMERIC;
  v_f := NULLIF(v_final->>'rating', '')::NUMERIC;
  IF v_is_summer THEN
    v_mr := CASE WHEN v_m IS NULL THEN NULL ELSE ROUND(v_m) END;
    v_tfr := CASE WHEN v_f IS NULL THEN NULL ELSE ROUND(v_f) END;
    v_sg := CASE
      WHEN v_mr IS NOT NULL AND v_tfr IS NOT NULL THEN ROUND((v_mr + v_tfr) / 2)
      ELSE COALESCE(v_tfr, v_mr)
    END;
    v_midterm_complete := COALESCE((v_midterm->>'isComplete')::BOOLEAN, FALSE);
    v_tfr_complete := COALESCE((v_final->>'isComplete')::BOOLEAN, FALSE);
    v_sg_complete := v_midterm_complete AND v_tfr_complete;
  ELSE
    v_mr := CASE
      WHEN v_p IS NOT NULL AND v_m IS NOT NULL THEN ROUND((v_p + v_m) / 2)
      ELSE COALESCE(v_m, v_p)
    END;
    v_tfr := CASE
      WHEN v_sf IS NOT NULL AND v_f IS NOT NULL THEN ROUND((v_sf + v_f) / 2)
      ELSE COALESCE(v_f, v_sf)
    END;
    v_sg := CASE
      WHEN v_mr IS NOT NULL AND v_tfr IS NOT NULL THEN ROUND((v_mr + v_tfr) / 2)
      ELSE COALESCE(v_tfr, v_mr)
    END;
    v_midterm_complete := COALESCE((v_prelim->>'isComplete')::BOOLEAN, FALSE)
      AND COALESCE((v_midterm->>'isComplete')::BOOLEAN, FALSE);
    v_tfr_complete := COALESCE((v_semi_final->>'isComplete')::BOOLEAN, FALSE)
      AND COALESCE((v_final->>'isComplete')::BOOLEAN, FALSE);
    v_sg_complete := v_midterm_complete AND v_tfr_complete;
  END IF;

  v_gwa := public.aspire_transmute_grade(v_sg);
  SELECT COUNT(*)::INTEGER INTO v_absences
  FROM public.attendance_records attendance
  WHERE attendance.class_record_id = p_class_record_id
    AND attendance.student_id = p_student_id
    AND lower(attendance.status::TEXT) = 'absent';

  v_fda_recommended := v_absences >= 4;
  v_fda_selected := COALESCE((
    COALESCE(NULLIF(current_setting('aspire.fda_decisions', TRUE), ''), '{}')::JSONB
      ->> p_student_id::TEXT
  )::BOOLEAN, FALSE);

  v_remark := CASE
    WHEN NOT v_sg_complete THEN 'incomplete'
    WHEN v_fda_selected AND v_fda_recommended THEN 'fda'
    WHEN v_gwa <= 3 THEN 'passed'
    ELSE 'failed'
  END;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'class_record_id', p_class_record_id,
    'student_id', p_student_id,
    'is_summer', v_is_summer,
    'terms', jsonb_build_object('Prelim', v_prelim, 'Midterm', v_midterm, 'Semi-Final', v_semi_final, 'Final', v_final),
    'mr', v_mr,
    'tfr', v_tfr,
    'sg', v_sg,
    'effective_grade', CASE WHEN v_remark = 'fda' THEN 5.00 ELSE v_gwa END,
    'remarks', v_remark,
    'absences', v_absences,
    'fda_recommended', v_fda_recommended,
    'fda_selected', v_fda_selected,
    'midterm_complete', v_midterm_complete,
    'tfr_complete', v_tfr_complete,
    'sg_complete', v_sg_complete,
    'input_snapshot_hash', public.aspire_grade_input_hash(p_class_record_id, p_student_id),
    'calculation_engine_version', 'server-v2-faculty-fda'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_grade_milestone_v3(
  p_operation_id UUID,
  p_class_record_id UUID,
  p_grade_period TEXT,
  p_term_score_rows JSONB DEFAULT '[]'::JSONB,
  p_activity_score_rows JSONB DEFAULT '[]'::JSONB,
  p_posted_grade_rows JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_item JSONB;
  v_student_id UUID;
  v_absences INTEGER;
  v_note TEXT;
  v_fda_decisions JSONB := '{}'::JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required to post grades.';
  END IF;
  IF jsonb_typeof(COALESCE(p_posted_grade_rows, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Grade posting payloads must be JSON arrays.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.class_records class_record
    JOIN public.users actor ON actor.user_id = v_actor
    WHERE class_record.class_record_id = p_class_record_id
      AND class_record.faculty_id = v_actor
      AND actor.role::TEXT = 'faculty'
      AND actor.status::TEXT = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the active faculty assigned to this class can post its grades.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_posted_grade_rows, '[]'::JSONB))
  LOOP
    IF lower(COALESCE(v_item->>'remarks', '')) = 'fda' THEN
      IF p_grade_period <> 'semestral_grade' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'FDA may only be selected for the official semestral grade.';
      END IF;
      v_student_id := NULLIF(v_item->>'student_id', '')::UUID;
      v_note := NULLIF(BTRIM(COALESCE(v_item->>'remarks_note', '')), '');
      IF v_student_id IS NULL OR v_note IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An FDA decision requires a student and a written faculty reason.';
      END IF;

      SELECT COUNT(*)::INTEGER INTO v_absences
      FROM public.attendance_records attendance
      WHERE attendance.class_record_id = p_class_record_id
        AND attendance.student_id = v_student_id
        AND lower(attendance.status::TEXT) = 'absent';
      IF v_absences < 4 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
          'FDA cannot be selected for student %s because only %s absence(s) are recorded.',
          v_student_id,
          v_absences
        );
      END IF;

      v_fda_decisions := v_fda_decisions || jsonb_build_object(v_student_id::TEXT, TRUE);
    END IF;
  END LOOP;

  -- Transaction-local context lets the existing authoritative posting function
  -- distinguish a validated faculty decision from an attendance recommendation.
  PERFORM set_config('aspire.fda_decisions', v_fda_decisions::TEXT, TRUE);
  RETURN public.post_grade_milestone_v2(
    p_operation_id,
    p_class_record_id,
    p_grade_period,
    p_term_score_rows,
    p_activity_score_rows,
    p_posted_grade_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_grade_milestone_v3(UUID, UUID, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_grade_milestone_v3(UUID, UUID, TEXT, JSONB, JSONB, JSONB) TO authenticated;

COMMENT ON FUNCTION public.post_grade_milestone_v3(UUID, UUID, TEXT, JSONB, JSONB, JSONB) IS
  'Posts authoritative milestones. Four absences recommend FDA; only the assigned faculty may explicitly select FDA with a written reason.';

COMMIT;
