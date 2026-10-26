-- Reconstruct missing MR/TFR rows only for the known legacy ITC113 / BSIT-1A
-- posting anomaly.
--
-- This is an administrative reconstruction from each student's current,
-- complete score basis. It does not claim that MR/TFR were historically
-- released by the faculty, and it intentionally leaves every existing SG
-- unchanged. The original SG remains subject to faculty/Dean review because
-- the earlier audit found that it differs from the current score-derived SG.

BEGIN;

DO $$
DECLARE
  v_class_id CONSTANT UUID := '45187317-3a8a-486a-99e1-dbcad7352ac9';
  v_expected_sg_students CONSTANT INTEGER := 10;
  v_class public.class_records%ROWTYPE;
  v_sg public.posted_grades%ROWTYPE;
  v_existing_mr public.posted_grades%ROWTYPE;
  v_existing_tfr public.posted_grades%ROWTYPE;
  v_projection JSONB;
  v_actor UUID;
  v_mr NUMERIC;
  v_tfr NUMERIC;
  v_projection_hash TEXT;
  v_subject_code TEXT;
  v_section_name TEXT;
  v_sg_count INTEGER;
  v_complete_count INTEGER;
  v_inserted_mr INTEGER := 0;
  v_inserted_tfr INTEGER := 0;
  v_row_count INTEGER;
BEGIN
  SELECT * INTO v_class
  FROM public.class_records class_record
  WHERE class_record.class_record_id = v_class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'Targeted ITC113 / BSIT-1A class record was not found; no reconstruction was performed.';
  END IF;

  SELECT subject.code, section.name
  INTO v_subject_code, v_section_name
  FROM public.subjects subject
  JOIN public.sections section ON section.section_id = v_class.section_id
  WHERE subject.subject_id = v_class.subject_id;

  IF v_subject_code IS DISTINCT FROM 'ITC113'
    OR v_section_name IS DISTINCT FROM 'BSIT-1A'
    OR v_class.school_year::TEXT IS DISTINCT FROM '2026-2027'
    OR v_class.semester::TEXT IS DISTINCT FROM '1st'
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'The targeted class identity no longer matches ITC113 / BSIT-1A / 2026-2027 / 1st semester.';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_sg_count
  FROM public.posted_grades grade
  WHERE grade.class_record_id = v_class_id
    AND grade.grade_period::TEXT = 'semestral_grade';

  IF v_sg_count <> v_expected_sg_students THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
      'Expected %s ITC113 SG rows but found %s; no reconstruction was performed.',
      v_expected_sg_students,
      v_sg_count
    );
  END IF;

  FOR v_sg IN
    SELECT grade.*
    FROM public.posted_grades grade
    WHERE grade.class_record_id = v_class_id
      AND grade.grade_period::TEXT = 'semestral_grade'
    ORDER BY grade.student_id
    FOR UPDATE
  LOOP
    v_projection := public.aspire_calculate_student_grade(v_class_id, v_sg.student_id);

    IF NOT COALESCE((v_projection->>'ok')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_projection->>'midterm_complete')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_projection->>'tfr_complete')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_projection->>'sg_complete')::BOOLEAN, FALSE)
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
        'Student %s does not have a complete calculable MR/TFR/SG basis; the transaction was rolled back.',
        v_sg.student_id
      );
    END IF;

    v_mr := NULLIF(v_projection->>'mr', '')::NUMERIC;
    v_tfr := NULLIF(v_projection->>'tfr', '')::NUMERIC;
    v_projection_hash := NULLIF(v_projection->>'input_snapshot_hash', '');
    v_actor := COALESCE(v_sg.posted_by, v_sg.remarks_set_by, v_class.faculty_id);

    IF v_mr IS NULL OR v_tfr IS NULL OR v_projection_hash IS NULL OR v_actor IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
        'Student %s is missing required reconstruction evidence or actor attribution; the transaction was rolled back.',
        v_sg.student_id
      );
    END IF;

    SELECT * INTO v_existing_mr
    FROM public.posted_grades grade
    WHERE grade.class_record_id = v_class_id
      AND grade.student_id = v_sg.student_id
      AND grade.grade_period::TEXT = 'midterm_rating';

    IF FOUND AND (
      v_existing_mr.computed_grade IS DISTINCT FROM v_mr
      OR v_existing_mr.input_snapshot_hash IS DISTINCT FROM v_projection_hash
      OR v_existing_mr.grading_formula_snapshot IS DISTINCT FROM v_class.grading_formula_snapshot
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
        'Student %s already has a conflicting MR row; the transaction was rolled back.',
        v_sg.student_id
      );
    END IF;

    INSERT INTO public.posted_grades (
      posted_grade_id, class_record_id, student_id, grade_period,
      computed_grade, effective_grade, remarks, remarks_note,
      remarks_set_by, remarks_set_at, posted_by, posted_at, is_locked,
      locked_milestones, grading_formula_snapshot, official_source,
      calculation_engine_version, input_snapshot_hash
    ) VALUES (
      gen_random_uuid(), v_class_id, v_sg.student_id, 'midterm_rating',
      v_mr, NULL,
      CASE WHEN public.aspire_transmute_grade(v_mr) <= 3.00
        THEN 'passed' ELSE 'failed' END::public.grade_remarks,
      'Authorized administrative reconstruction from the current complete score basis; the existing legacy SG was not changed.',
      v_actor, CURRENT_TIMESTAMP, v_actor, CURRENT_TIMESTAMP, TRUE,
      ARRAY['Prelim', 'Midterm', 'Midterm Rating']::VARCHAR[],
      v_class.grading_formula_snapshot, 'system_backfill',
      v_projection->>'calculation_engine_version', v_projection_hash
    ) ON CONFLICT (class_record_id, grade_period, student_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted_mr := v_inserted_mr + v_row_count;

    SELECT * INTO v_existing_tfr
    FROM public.posted_grades grade
    WHERE grade.class_record_id = v_class_id
      AND grade.student_id = v_sg.student_id
      AND grade.grade_period::TEXT = 'tentative_final_rating';

    IF FOUND AND (
      v_existing_tfr.computed_grade IS DISTINCT FROM v_tfr
      OR v_existing_tfr.input_snapshot_hash IS DISTINCT FROM v_projection_hash
      OR v_existing_tfr.grading_formula_snapshot IS DISTINCT FROM v_class.grading_formula_snapshot
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
        'Student %s already has a conflicting TFR row; the transaction was rolled back.',
        v_sg.student_id
      );
    END IF;

    INSERT INTO public.posted_grades (
      posted_grade_id, class_record_id, student_id, grade_period,
      computed_grade, effective_grade, remarks, remarks_note,
      remarks_set_by, remarks_set_at, posted_by, posted_at, is_locked,
      locked_milestones, grading_formula_snapshot, official_source,
      calculation_engine_version, input_snapshot_hash
    ) VALUES (
      gen_random_uuid(), v_class_id, v_sg.student_id, 'tentative_final_rating',
      v_tfr, NULL,
      CASE WHEN public.aspire_transmute_grade(v_tfr) <= 3.00
        THEN 'passed' ELSE 'failed' END::public.grade_remarks,
      'Authorized administrative reconstruction from the current complete score basis; the existing legacy SG was not changed.',
      v_actor, CURRENT_TIMESTAMP, v_actor, CURRENT_TIMESTAMP, TRUE,
      ARRAY['Semi-Final', 'Final', 'Tentative Final Rating']::VARCHAR[],
      v_class.grading_formula_snapshot, 'system_backfill',
      v_projection->>'calculation_engine_version', v_projection_hash
    ) ON CONFLICT (class_record_id, grade_period, student_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted_tfr := v_inserted_tfr + v_row_count;
  END LOOP;

  SELECT COUNT(*)::INTEGER INTO v_complete_count
  FROM public.posted_grades sg
  WHERE sg.class_record_id = v_class_id
    AND sg.grade_period::TEXT = 'semestral_grade'
    AND EXISTS (
      SELECT 1 FROM public.posted_grades mr
      WHERE mr.class_record_id = sg.class_record_id
        AND mr.student_id = sg.student_id
        AND mr.grade_period::TEXT = 'midterm_rating'
    )
    AND EXISTS (
      SELECT 1 FROM public.posted_grades tfr
      WHERE tfr.class_record_id = sg.class_record_id
        AND tfr.student_id = sg.student_id
        AND tfr.grade_period::TEXT = 'tentative_final_rating'
    );

  IF v_complete_count <> v_expected_sg_students THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
      'ITC113 reconstruction produced only %s complete sequences out of %s; the transaction was rolled back.',
      v_complete_count,
      v_expected_sg_students
    );
  END IF;

  RAISE NOTICE 'Targeted ITC113 / BSIT-1A reconstruction complete. MR inserted: %; TFR inserted: %; complete students: %.',
    v_inserted_mr, v_inserted_tfr, v_complete_count;
END;
$$;

COMMIT;

-- Verification: all ten SG students must have an MR and TFR after the repair.
-- The comparison columns deliberately expose any difference between the
-- unchanged official SG and the current score-derived SG for later review.
SELECT
  grade.student_id,
  mr.computed_grade AS reconstructed_mr,
  tfr.computed_grade AS reconstructed_tfr,
  grade.computed_grade AS unchanged_official_sg,
  NULLIF(projection.value->>'sg', '')::NUMERIC AS current_score_derived_sg,
  grade.computed_grade IS DISTINCT FROM NULLIF(projection.value->>'sg', '')::NUMERIC AS sg_requires_review,
  mr.official_source AS mr_source,
  tfr.official_source AS tfr_source
FROM public.posted_grades grade
CROSS JOIN LATERAL (
  SELECT public.aspire_calculate_student_grade(grade.class_record_id, grade.student_id) AS value
) projection
LEFT JOIN public.posted_grades mr
  ON mr.class_record_id = grade.class_record_id
 AND mr.student_id = grade.student_id
 AND mr.grade_period::TEXT = 'midterm_rating'
LEFT JOIN public.posted_grades tfr
  ON tfr.class_record_id = grade.class_record_id
 AND tfr.student_id = grade.student_id
 AND tfr.grade_period::TEXT = 'tentative_final_rating'
WHERE grade.class_record_id = '45187317-3a8a-486a-99e1-dbcad7352ac9'::UUID
  AND grade.grade_period::TEXT = 'semestral_grade'
ORDER BY grade.student_id;
