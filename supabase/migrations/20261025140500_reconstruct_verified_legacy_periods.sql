-- Reconstruct missing MR/TFR rows for the verified legacy NAV113 posting only.
--
-- Evidence collected on 2026-10-25 showed that all nine affected NAV113 SG
-- rows have a complete, locked score basis and that the current server
-- calculation reproduces each stored SG exactly. The ten ITC113 anomalies are
-- intentionally excluded because their stored SG values do not match the
-- current score basis; those records require faculty/Dean review.

BEGIN;

DO $$
DECLARE
  v_class_id CONSTANT UUID := 'a44d7775-a0a2-429b-a5db-b3acd6440299';
  v_student_ids CONSTANT UUID[] := ARRAY[
    '132fe169-5522-40c9-9037-eb10ddfd1d37'::UUID,
    '109b6bc1-b6f2-4a5d-859a-2bc1443dcbec'::UUID,
    '2dd29f8e-c79a-47f1-a900-b309d3ce0296'::UUID,
    '481ac12b-4137-4cc0-91aa-dbe7567b720e'::UUID,
    '1f55ed95-5ee9-4577-9835-be248c50d854'::UUID,
    '757cf483-d6bf-48d3-94e2-e2256f4c68f1'::UUID,
    'cf2f18ac-86cb-4fac-a708-da4246a1359a'::UUID,
    '4e51dd75-de3d-4830-ad8d-18fc72c5bd4f'::UUID,
    'ccd6c1c6-68d7-438c-b14d-796ff42f204f'::UUID
  ];
  v_class public.class_records%ROWTYPE;
  v_sg public.posted_grades%ROWTYPE;
  v_existing_mr public.posted_grades%ROWTYPE;
  v_existing_tfr public.posted_grades%ROWTYPE;
  v_projection JSONB;
  v_student_id UUID;
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
      MESSAGE = 'Verified NAV113 class record was not found; no reconstruction was performed.';
  END IF;

  SELECT subject.code, section.name
  INTO v_subject_code, v_section_name
  FROM public.subjects subject
  JOIN public.sections section ON section.section_id = v_class.section_id
  WHERE subject.subject_id = v_class.subject_id;

  IF v_subject_code IS DISTINCT FROM 'NAV113'
    OR v_section_name IS DISTINCT FROM 'BSMARE-1B'
    OR v_class.school_year::TEXT IS DISTINCT FROM '2026-2027'
    OR v_class.semester::TEXT IS DISTINCT FROM '1st'
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'The targeted class identity no longer matches NAV113 / BSMARE-1B / 2026-2027 / 1st semester.';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_sg_count
  FROM public.posted_grades grade
  WHERE grade.class_record_id = v_class_id
    AND grade.student_id = ANY(v_student_ids)
    AND grade.grade_period::TEXT = 'semestral_grade';

  IF v_sg_count <> CARDINALITY(v_student_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
      'Expected %s verified NAV113 SG rows but found %s; no reconstruction was performed.',
      CARDINALITY(v_student_ids),
      v_sg_count
    );
  END IF;

  FOREACH v_student_id IN ARRAY v_student_ids
  LOOP
    SELECT * INTO v_sg
    FROM public.posted_grades grade
    WHERE grade.class_record_id = v_class_id
      AND grade.student_id = v_student_id
      AND grade.grade_period::TEXT = 'semestral_grade'
    FOR UPDATE;

    v_projection := public.aspire_calculate_student_grade(v_class_id, v_student_id);
    IF NOT COALESCE((v_projection->>'ok')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_projection->>'midterm_complete')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_projection->>'tfr_complete')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_projection->>'sg_complete')::BOOLEAN, FALSE)
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
        'Student %s no longer has a complete calculable MR/TFR/SG basis; no reconstruction was performed.',
        v_student_id
      );
    END IF;

    IF v_sg.input_snapshot_hash IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
        'Student %s is no longer an expected legacy null-hash SG row; no reconstruction was performed.',
        v_student_id
      );
    END IF;

    IF v_sg.grading_formula_snapshot IS NULL
      OR v_sg.grading_formula_snapshot IS DISTINCT FROM v_class.grading_formula_snapshot
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
        'Student %s does not retain the verified class grading snapshot; no reconstruction was performed.',
        v_student_id
      );
    END IF;

    IF v_sg.computed_grade IS DISTINCT FROM NULLIF(v_projection->>'sg', '')::NUMERIC THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
        'Student %s stored SG no longer matches the locked score basis; no reconstruction was performed.',
        v_student_id
      );
    END IF;

    v_mr := NULLIF(v_projection->>'mr', '')::NUMERIC;
    v_tfr := NULLIF(v_projection->>'tfr', '')::NUMERIC;
    v_projection_hash := NULLIF(v_projection->>'input_snapshot_hash', '');
    v_actor := COALESCE(v_sg.posted_by, v_sg.remarks_set_by, v_class.faculty_id);

    IF v_mr IS NULL OR v_tfr IS NULL OR v_projection_hash IS NULL OR v_actor IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
        'Student %s is missing required reconstruction evidence or actor attribution.',
        v_student_id
      );
    END IF;

    SELECT * INTO v_existing_mr
    FROM public.posted_grades grade
    WHERE grade.class_record_id = v_class_id
      AND grade.student_id = v_student_id
      AND grade.grade_period::TEXT = 'midterm_rating';

    IF FOUND AND (
      v_existing_mr.computed_grade IS DISTINCT FROM v_mr
      OR v_existing_mr.input_snapshot_hash IS DISTINCT FROM v_projection_hash
      OR v_existing_mr.grading_formula_snapshot IS DISTINCT FROM v_class.grading_formula_snapshot
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
        'Student %s already has a conflicting MR row; no reconstruction was performed.',
        v_student_id
      );
    END IF;

    INSERT INTO public.posted_grades (
      posted_grade_id, class_record_id, student_id, grade_period,
      computed_grade, effective_grade, remarks, remarks_note,
      remarks_set_by, remarks_set_at, posted_by, posted_at, is_locked,
      locked_milestones, grading_formula_snapshot, official_source,
      calculation_engine_version, input_snapshot_hash
    ) VALUES (
      gen_random_uuid(), v_class_id, v_student_id, 'midterm_rating',
      v_mr, NULL,
      CASE WHEN public.aspire_transmute_grade(v_mr) <= 3.00
        THEN 'passed' ELSE 'failed' END::public.grade_remarks,
      'Verified legacy reconstruction: the complete locked score basis reproduces the unchanged official SG.',
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
      AND grade.student_id = v_student_id
      AND grade.grade_period::TEXT = 'tentative_final_rating';

    IF FOUND AND (
      v_existing_tfr.computed_grade IS DISTINCT FROM v_tfr
      OR v_existing_tfr.input_snapshot_hash IS DISTINCT FROM v_projection_hash
      OR v_existing_tfr.grading_formula_snapshot IS DISTINCT FROM v_class.grading_formula_snapshot
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
        'Student %s already has a conflicting TFR row; no reconstruction was performed.',
        v_student_id
      );
    END IF;

    INSERT INTO public.posted_grades (
      posted_grade_id, class_record_id, student_id, grade_period,
      computed_grade, effective_grade, remarks, remarks_note,
      remarks_set_by, remarks_set_at, posted_by, posted_at, is_locked,
      locked_milestones, grading_formula_snapshot, official_source,
      calculation_engine_version, input_snapshot_hash
    ) VALUES (
      gen_random_uuid(), v_class_id, v_student_id, 'tentative_final_rating',
      v_tfr, NULL,
      CASE WHEN public.aspire_transmute_grade(v_tfr) <= 3.00
        THEN 'passed' ELSE 'failed' END::public.grade_remarks,
      'Verified legacy reconstruction: the complete locked score basis reproduces the unchanged official SG.',
      v_actor, CURRENT_TIMESTAMP, v_actor, CURRENT_TIMESTAMP, TRUE,
      ARRAY['Semi-Final', 'Final', 'Tentative Final Rating']::VARCHAR[],
      v_class.grading_formula_snapshot, 'system_backfill',
      v_projection->>'calculation_engine_version', v_projection_hash
    ) ON CONFLICT (class_record_id, grade_period, student_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted_tfr := v_inserted_tfr + v_row_count;
  END LOOP;

  SELECT COUNT(*)::INTEGER INTO v_complete_count
  FROM UNNEST(v_student_ids) target(student_id)
  WHERE EXISTS (
      SELECT 1 FROM public.posted_grades mr
      WHERE mr.class_record_id = v_class_id
        AND mr.student_id = target.student_id
        AND mr.grade_period::TEXT = 'midterm_rating'
    )
    AND EXISTS (
      SELECT 1 FROM public.posted_grades tfr
      WHERE tfr.class_record_id = v_class_id
        AND tfr.student_id = target.student_id
        AND tfr.grade_period::TEXT = 'tentative_final_rating'
    );

  IF v_complete_count <> CARDINALITY(v_student_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'NAV113 reconstruction did not produce a complete MR/TFR sequence; the transaction was rolled back.';
  END IF;

  RAISE NOTICE 'Verified NAV113 reconstruction complete. MR inserted: %; TFR inserted: %; complete students: %.',
    v_inserted_mr, v_inserted_tfr, v_complete_count;
END;
$$;

COMMIT;

-- Post-migration class summary. NAV113 must show zero unresolved rows. ITC113
-- remains unresolved because its stored SG values did not match the current
-- score basis and therefore were not reconstructed automatically.
SELECT
  class_record.class_record_id,
  subject.code AS subject_code,
  subject.name AS subject_name,
  section.name AS section_name,
  COUNT(*) FILTER (WHERE sg.grade_period::TEXT = 'semestral_grade') AS sg_students,
  COUNT(*) FILTER (
    WHERE sg.grade_period::TEXT = 'semestral_grade'
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
      )
  ) AS complete_sequence_students,
  COUNT(*) FILTER (
    WHERE sg.grade_period::TEXT = 'semestral_grade'
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.posted_grades mr
          WHERE mr.class_record_id = sg.class_record_id
            AND mr.student_id = sg.student_id
            AND mr.grade_period::TEXT = 'midterm_rating'
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.posted_grades tfr
          WHERE tfr.class_record_id = sg.class_record_id
            AND tfr.student_id = sg.student_id
            AND tfr.grade_period::TEXT = 'tentative_final_rating'
        )
      )
  ) AS unresolved_students,
  CASE
    WHEN class_record.class_record_id = 'a44d7775-a0a2-429b-a5db-b3acd6440299'::UUID
      THEN 'Verified legacy reconstruction'
    ELSE 'Manual faculty/Dean review: stored SG differs from current score basis'
  END AS audit_status
FROM public.class_records class_record
JOIN public.subjects subject ON subject.subject_id = class_record.subject_id
JOIN public.sections section ON section.section_id = class_record.section_id
JOIN public.posted_grades sg ON sg.class_record_id = class_record.class_record_id
WHERE class_record.class_record_id IN (
  '45187317-3a8a-486a-99e1-dbcad7352ac9'::UUID,
  'a44d7775-a0a2-429b-a5db-b3acd6440299'::UUID
)
  AND sg.grade_period::TEXT = 'semestral_grade'
GROUP BY class_record.class_record_id, subject.code, subject.name, section.name
ORDER BY subject.code;
