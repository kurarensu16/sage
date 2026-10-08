-- =============================================================================
-- ASPIRE: ATOMIC, IDEMPOTENT GRADE-MILESTONE POSTING
-- =============================================================================
-- The client still calculates grades with the shared dynamic COG engine. This
-- RPC makes persistence atomic: the immutable class COG snapshot, reviewed
-- NULL-to-zero substitutions, granular activity scores, and posted milestone
-- rows either all commit or all roll back.

BEGIN;

-- Posting is identified by the class, milestone, and student. Creating this
-- index intentionally fails (without deleting history) if legacy duplicates
-- need to be reviewed before the migration can be applied.
CREATE UNIQUE INDEX IF NOT EXISTS uq_posted_grades_class_period_student
  ON public.posted_grades(class_record_id, grade_period, student_id);

CREATE OR REPLACE FUNCTION public.post_grade_milestone_atomic(
  p_class_record_id UUID,
  p_grade_period TEXT,
  p_grading_formula_snapshot JSONB,
  p_term_score_rows JSONB DEFAULT '[]'::JSONB,
  p_activity_score_rows JSONB DEFAULT '[]'::JSONB,
  p_posted_grade_rows JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_class public.class_records%ROWTYPE;
  v_effective_snapshot JSONB;
  v_component_count INTEGER;
  v_total_weight NUMERIC;
  v_item JSONB;
  v_term public.student_term_scores%ROWTYPE;
  v_activity public.student_activity_scores%ROWTYPE;
  v_posted public.posted_grades%ROWTYPE;
  v_student_id UUID;
  v_posted_count INTEGER := 0;
  v_term_count INTEGER := 0;
  v_activity_count INTEGER := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required to post grades.';
  END IF;

  IF p_grade_period NOT IN ('midterm_rating', 'tentative_final_rating', 'semestral_grade') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported grade milestone.';
  END IF;

  IF jsonb_typeof(COALESCE(p_term_score_rows, '[]'::JSONB)) <> 'array'
    OR jsonb_typeof(COALESCE(p_activity_score_rows, '[]'::JSONB)) <> 'array'
    OR jsonb_typeof(COALESCE(p_posted_grade_rows, '[]'::JSONB)) <> 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Grade posting payloads must be JSON arrays.';
  END IF;

  IF jsonb_array_length(COALESCE(p_posted_grade_rows, '[]'::JSONB)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No student grades were supplied for posting.';
  END IF;

  SELECT class_record.*
  INTO v_class
  FROM public.class_records class_record
  WHERE class_record.class_record_id = p_class_record_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The class record does not exist.';
  END IF;

  IF v_class.faculty_id IS DISTINCT FROM v_actor_id
    OR COALESCE(v_class.status::TEXT, '') <> 'active'
    OR NOT EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.user_id = v_actor_id
        AND actor.role::TEXT = 'faculty'
        AND actor.status = 'active'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the active faculty assigned to this class can post its grades.';
  END IF;

  -- Serialize retries and concurrent posts for the same class milestone.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_class_record_id::TEXT || ':' || p_grade_period, 0)
  );

  v_effective_snapshot := COALESCE(v_class.grading_formula_snapshot, p_grading_formula_snapshot);
  IF v_effective_snapshot IS NULL
    OR jsonb_typeof(v_effective_snapshot) <> 'object'
    OR jsonb_typeof(v_effective_snapshot->'components') <> 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A valid class or subject COG is required before grades can be posted.';
  END IF;

  SELECT COUNT(*), SUM((component->>'weight')::NUMERIC)
  INTO v_component_count, v_total_weight
  FROM jsonb_array_elements(v_effective_snapshot->'components') component
  WHERE NULLIF(BTRIM(component->>'name'), '') IS NOT NULL
    AND (component->>'weight')::NUMERIC > 0
    AND (component->>'maxScore')::NUMERIC > 0;

  IF v_component_count <> jsonb_array_length(v_effective_snapshot->'components')
    OR v_component_count = 0
    OR ABS(COALESCE(v_total_weight, 0) - 100) > 0.01
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The grading COG is invalid or its component weights do not total 100%.';
  END IF;

  IF v_class.grading_formula_snapshot IS NOT NULL
    AND p_grading_formula_snapshot IS NOT NULL
    AND v_class.grading_formula_snapshot <> p_grading_formula_snapshot
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The submitted COG differs from the class grading snapshot.';
  END IF;

  IF v_class.grading_formula_snapshot IS NULL THEN
    UPDATE public.class_records
    SET grading_formula_snapshot = v_effective_snapshot
    WHERE class_record_id = p_class_record_id
      AND grading_formula_snapshot IS NULL;
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_term_score_rows, '[]'::JSONB))
  LOOP
    SELECT * INTO v_term
    FROM jsonb_populate_record(NULL::public.student_term_scores, v_item);

    IF v_term.class_record_id IS DISTINCT FROM p_class_record_id
      OR v_term.term NOT IN ('Prelim', 'Midterm', 'Semi-Final', 'Final')
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A term-score row does not belong to this class or uses an invalid term.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.enrollments enrollment
      WHERE enrollment.student_id = v_term.student_id
        AND enrollment.section_id = v_class.section_id
        AND enrollment.subject_id = v_class.subject_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'A term-score student is not enrolled in this class.';
    END IF;

    INSERT INTO public.student_term_scores (
      score_id, class_record_id, student_id, term,
      act1, act2, act3, act4, act5, act6, char_rating, exam,
      saved_at, saved_by
    ) VALUES (
      COALESCE(v_term.score_id, gen_random_uuid()), p_class_record_id, v_term.student_id, v_term.term,
      v_term.act1, v_term.act2, v_term.act3, v_term.act4, v_term.act5, v_term.act6,
      v_term.char_rating, v_term.exam, CURRENT_TIMESTAMP, v_actor_id
    )
    ON CONFLICT (class_record_id, student_id, term) DO UPDATE SET
      act1 = COALESCE(EXCLUDED.act1, student_term_scores.act1),
      act2 = COALESCE(EXCLUDED.act2, student_term_scores.act2),
      act3 = COALESCE(EXCLUDED.act3, student_term_scores.act3),
      act4 = COALESCE(EXCLUDED.act4, student_term_scores.act4),
      act5 = COALESCE(EXCLUDED.act5, student_term_scores.act5),
      act6 = COALESCE(EXCLUDED.act6, student_term_scores.act6),
      char_rating = COALESCE(EXCLUDED.char_rating, student_term_scores.char_rating),
      exam = COALESCE(EXCLUDED.exam, student_term_scores.exam),
      saved_at = CURRENT_TIMESTAMP,
      saved_by = v_actor_id;

    v_term_count := v_term_count + 1;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_activity_score_rows, '[]'::JSONB))
  LOOP
    SELECT * INTO v_activity
    FROM jsonb_populate_record(NULL::public.student_activity_scores, v_item);

    IF v_activity.score IS NULL OR v_activity.score < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An activity score must be a non-negative number.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.class_activities activity
      JOIN public.enrollments enrollment
        ON enrollment.student_id = v_activity.student_id
       AND enrollment.section_id = v_class.section_id
       AND enrollment.subject_id = v_class.subject_id
      WHERE activity.activity_id = v_activity.activity_id
        AND activity.class_record_id = p_class_record_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'An activity-score row does not belong to this class roster.';
    END IF;

    INSERT INTO public.student_activity_scores (
      score_id, student_id, activity_id, score, created_at, updated_at
    ) VALUES (
      COALESCE(v_activity.score_id, gen_random_uuid()), v_activity.student_id,
      v_activity.activity_id, v_activity.score, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (student_id, activity_id) DO UPDATE SET
      score = EXCLUDED.score,
      updated_at = CURRENT_TIMESTAMP;

    v_activity_count := v_activity_count + 1;
  END LOOP;

  IF (
    SELECT COUNT(*)
    FROM (
      SELECT (value->>'student_id')::UUID
      FROM jsonb_array_elements(p_posted_grade_rows)
      GROUP BY (value->>'student_id')::UUID
    ) distinct_students
  ) <> jsonb_array_length(p_posted_grade_rows) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'The posting payload contains duplicate student rows.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_posted_grade_rows)
  LOOP
    IF COALESCE(v_item->>'grade_period', '') <> p_grade_period THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A posted-grade row targets a different milestone.';
    END IF;

    IF COALESCE(v_item->>'remarks', '') NOT IN ('passed', 'failed', 'incomplete', 'fda', 'dropped') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A posted-grade row has an unsupported remark.';
    END IF;

    SELECT * INTO v_posted
    FROM jsonb_populate_record(NULL::public.posted_grades, v_item);
    v_student_id := v_posted.student_id;

    IF v_posted.class_record_id IS DISTINCT FROM p_class_record_id
      OR v_posted.computed_grade IS NULL
      OR v_posted.computed_grade < 0
      OR v_posted.computed_grade > 100
      OR (p_grade_period = 'semestral_grade' AND v_posted.effective_grade IS NULL)
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A posted-grade row is incomplete or outside the accepted grade range.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.enrollments enrollment
      WHERE enrollment.student_id = v_student_id
        AND enrollment.section_id = v_class.section_id
        AND enrollment.subject_id = v_class.subject_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'A posted-grade student is not enrolled in this class.';
    END IF;

    INSERT INTO public.posted_grades (
      posted_grade_id, class_record_id, student_id, grade_period,
      computed_grade, effective_grade, remarks, remarks_note,
      remarks_set_by, remarks_set_at, posted_by, posted_at,
      is_locked, locked_milestones, grading_formula_snapshot
    ) VALUES (
      gen_random_uuid(), p_class_record_id, v_student_id, p_grade_period,
      v_posted.computed_grade,
      CASE WHEN p_grade_period = 'semestral_grade' THEN v_posted.effective_grade ELSE NULL END,
      v_posted.remarks, v_posted.remarks_note,
      v_actor_id, CURRENT_TIMESTAMP, v_actor_id, CURRENT_TIMESTAMP,
      TRUE, v_posted.locked_milestones, v_effective_snapshot
    )
    ON CONFLICT (class_record_id, grade_period, student_id) DO UPDATE SET
      computed_grade = EXCLUDED.computed_grade,
      effective_grade = EXCLUDED.effective_grade,
      remarks = EXCLUDED.remarks,
      remarks_note = EXCLUDED.remarks_note,
      remarks_set_by = v_actor_id,
      remarks_set_at = CURRENT_TIMESTAMP,
      posted_by = v_actor_id,
      posted_at = CURRENT_TIMESTAMP,
      is_locked = TRUE,
      locked_milestones = EXCLUDED.locked_milestones,
      grading_formula_snapshot = v_effective_snapshot;

    v_posted_count := v_posted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'class_record_id', p_class_record_id,
    'grade_period', p_grade_period,
    'posted_count', v_posted_count,
    'term_score_count', v_term_count,
    'activity_score_count', v_activity_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_grade_milestone_atomic(UUID, TEXT, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_grade_milestone_atomic(UUID, TEXT, JSONB, JSONB, JSONB, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_grade_milestone_atomic(UUID, TEXT, JSONB, JSONB, JSONB, JSONB) TO authenticated;

COMMIT;
