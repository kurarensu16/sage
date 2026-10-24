-- =============================================================================
-- ASPIRE P0 GRADE-POSTING HARDENING: AUTHORITATIVE TRANSACTION BOUNDARY
-- =============================================================================
-- The client supplies score edits and roster identities, never official grade
-- values. PostgreSQL persists reviewed score edits, recalculates from the frozen
-- class COG, validates roster completeness, writes official rows, consumes one
-- approved correction, and creates notifications in one transaction.

BEGIN;

-- Score-delta corrections are not exposed until they have a dedicated staged
-- schema and approval UI. Rejecting them is safer than silently treating a JSON
-- proposal as permission to unlock the live score ledger.
CREATE OR REPLACE FUNCTION public.reject_unstaged_sg_score_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('pending', 'approved')
    AND jsonb_array_length(COALESCE(NEW.proposed_score_changes, '[]'::JSONB)) > 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '0A000',
      MESSAGE = 'Score-delta SG corrections are disabled until a staged, Dean-reviewable score-change workflow is installed.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_unstaged_sg_score_correction ON public.remark_override_requests;
CREATE TRIGGER trg_reject_unstaged_sg_score_correction
BEFORE INSERT OR UPDATE OF proposed_score_changes, status ON public.remark_override_requests
FOR EACH ROW EXECUTE FUNCTION public.reject_unstaged_sg_score_correction();

-- Close revision windows opened by the legacy approval function. The legacy
-- enforcement trigger blocks an unchanged relock, so suspend that one trigger
-- only for this deterministic migration backfill.
ALTER TABLE public.posted_grades DISABLE TRIGGER trg_enforce_sg_correction_application;
UPDATE public.posted_grades grade
SET is_locked = TRUE
WHERE grade.grade_period::TEXT = 'semestral_grade'
  AND NOT COALESCE(grade.is_locked, TRUE)
  AND EXISTS (
    SELECT 1 FROM public.remark_override_requests request
    WHERE request.posted_grade_id = grade.posted_grade_id
      AND request.status = 'approved'
  );
ALTER TABLE public.posted_grades ENABLE TRIGGER trg_enforce_sg_correction_application;

-- Dean approval is a one-use authorization. It must never unlock the live score
-- sheet because autosave would otherwise become an unaudited correction path.
CREATE OR REPLACE FUNCTION public.review_sg_correction_request(
  p_request_id UUID,
  p_decision TEXT,
  p_dean_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request public.remark_override_requests%ROWTYPE;
  v_posted public.posted_grades%ROWTYPE;
  v_dean_department UUID;
  v_subject_department UUID;
  v_decision TEXT := lower(BTRIM(COALESCE(p_decision, '')));
BEGIN
  IF v_actor IS NULL OR v_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid authenticated review decision is required.';
  END IF;

  SELECT actor.department_id INTO v_dean_department
  FROM public.users actor
  WHERE actor.user_id = v_actor
    AND actor.role::TEXT = 'dean'
    AND actor.status::TEXT = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only an active Dean may review an SG correction request.';
  END IF;

  SELECT request.* INTO v_request
  FROM public.remark_override_requests request
  WHERE request.request_id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Only a pending correction request may be reviewed.';
  END IF;

  SELECT posted.* INTO v_posted
  FROM public.posted_grades posted
  WHERE posted.posted_grade_id = v_request.posted_grade_id
  FOR UPDATE;
  IF v_decision = 'approved' AND (
    NOT FOUND
    OR v_posted.grade_period::TEXT <> 'semestral_grade'
    OR NOT COALESCE(v_posted.is_locked, TRUE)
    OR v_posted.computed_grade IS DISTINCT FROM v_request.original_computed_grade
    OR v_posted.effective_grade IS DISTINCT FROM v_request.original_effective_grade
    OR v_posted.remarks::TEXT IS DISTINCT FROM v_request.original_remark
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The official SG no longer matches the request baseline. Cancel it and submit a current proposal.';
  END IF;

  SELECT subject.department_id INTO v_subject_department
  FROM public.class_records class_record
  JOIN public.subjects subject ON subject.subject_id = class_record.subject_id
  WHERE class_record.class_record_id = v_request.class_record_id;
  IF v_dean_department IS DISTINCT FROM v_subject_department THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This correction request is outside the Dean''s department.';
  END IF;

  IF v_decision = 'approved'
    AND v_request.proposed_remark IS NULL
    AND v_request.proposed_computed_grade IS NULL
    AND v_request.proposed_effective_grade IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The request has no exact proposed correction and cannot be approved.';
  END IF;

  UPDATE public.remark_override_requests
  SET status = v_decision,
      decision_by = v_actor,
      decision_at = CURRENT_TIMESTAMP,
      resolved_by = v_actor,
      resolved_at = CURRENT_TIMESTAMP,
      dean_note = NULLIF(BTRIM(COALESCE(p_dean_note, '')), '')
  WHERE request_id = p_request_id;

  -- Deliberately leave posted_grades.is_locked = TRUE.
  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', v_decision,
    'faculty_id', v_request.requested_by,
    'student_id', v_request.student_id,
    'class_record_id', v_request.class_record_id,
    'proposed_remark', v_request.proposed_remark,
    'official_grade_locked', TRUE
  );
END;
$$;

-- Server-side preflight. Unapproved roster rows are preserved, not treated as
-- attempted changes. Approved rows must agree with the current score projection.
CREATE OR REPLACE FUNCTION public.preflight_sg_correction_posting(
  p_class_record_id UUID,
  p_posted_grade_rows JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_class public.class_records%ROWTYPE;
  v_item JSONB;
  v_student_id UUID;
  v_existing public.posted_grades%ROWTYPE;
  v_request public.remark_override_requests%ROWTYPE;
  v_projection JSONB;
  v_expected_computed NUMERIC;
  v_expected_effective NUMERIC;
  v_canonical_effective NUMERIC;
  v_expected_remark TEXT;
  v_violations JSONB := '[]'::JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required to preflight SG corrections.';
  END IF;
  IF jsonb_typeof(COALESCE(p_posted_grade_rows, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Posted-grade rows must be a JSON array.';
  END IF;

  SELECT * INTO v_class FROM public.class_records WHERE class_record_id = p_class_record_id;
  IF NOT FOUND OR v_class.faculty_id IS DISTINCT FROM v_actor OR NOT EXISTS (
    SELECT 1 FROM public.users actor
    WHERE actor.user_id = v_actor AND actor.role::TEXT = 'faculty' AND actor.status::TEXT = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the active faculty assigned to this class may preflight SG corrections.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_posted_grade_rows, '[]'::JSONB))
  LOOP
    IF COALESCE(v_item->>'grade_period', '') <> 'semestral_grade' THEN CONTINUE; END IF;
    BEGIN
      v_student_id := (v_item->>'student_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Every SG row must contain a valid student ID.';
    END;

    SELECT * INTO v_existing FROM public.posted_grades
    WHERE class_record_id = p_class_record_id
      AND student_id = v_student_id
      AND grade_period::TEXT = 'semestral_grade';
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT * INTO v_request FROM public.remark_override_requests
    WHERE posted_grade_id = v_existing.posted_grade_id AND status = 'approved'
    ORDER BY decision_at DESC NULLS LAST
    LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF jsonb_array_length(COALESCE(v_request.proposed_score_changes, '[]'::JSONB)) > 0 THEN
      v_violations := v_violations || jsonb_build_array(jsonb_build_object(
        'student_id', v_student_id,
        'posted_grade_id', v_existing.posted_grade_id,
        'request_id', v_request.request_id,
        'reason', 'This approval contains an unstaged score delta and cannot be applied by the locked correction workflow.'
      ));
      CONTINUE;
    END IF;

    v_projection := public.aspire_calculate_student_grade(p_class_record_id, v_student_id);
    v_expected_computed := COALESCE(v_request.proposed_computed_grade, v_request.original_computed_grade);
    v_expected_effective := COALESCE(v_request.proposed_effective_grade, v_request.original_effective_grade);
    v_expected_remark := COALESCE(v_request.proposed_remark, v_request.original_remark);
    v_canonical_effective := CASE
      WHEN v_expected_remark = 'fda' THEN 5.00
      WHEN v_expected_remark = 'passed' THEN LEAST(public.aspire_transmute_grade(NULLIF(v_projection->>'sg', '')::NUMERIC), 3.00)
      ELSE public.aspire_transmute_grade(NULLIF(v_projection->>'sg', '')::NUMERIC)
    END;
    IF NOT COALESCE((v_projection->>'ok')::BOOLEAN, FALSE)
      OR NULLIF(v_projection->>'sg', '')::NUMERIC IS DISTINCT FROM v_expected_computed
      OR v_expected_effective IS DISTINCT FROM v_canonical_effective
    THEN
      v_violations := v_violations || jsonb_build_array(jsonb_build_object(
        'student_id', v_student_id,
        'posted_grade_id', v_existing.posted_grade_id,
        'request_id', v_request.request_id,
        'reason', COALESCE(v_projection->>'error', 'The approved SG percentage does not match the current server-calculated score basis.')
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', jsonb_array_length(v_violations) = 0, 'violations', v_violations);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_grade_milestone_v2(
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
  v_class public.class_records%ROWTYPE;
  v_item JSONB;
  v_term public.student_term_scores%ROWTYPE;
  v_activity public.student_activity_scores%ROWTYPE;
  v_payload public.posted_grades%ROWTYPE;
  v_operation public.grade_posting_operations%ROWTYPE;
  v_existing public.posted_grades%ROWTYPE;
  v_request public.remark_override_requests%ROWTYPE;
  v_projection JSONB;
  v_student_id UUID;
  v_computed NUMERIC;
  v_effective NUMERIC;
  v_base_effective NUMERIC;
  v_canonical_effective NUMERIC;
  v_remark TEXT;
  v_candidate_remark TEXT;
  v_note TEXT;
  v_locks JSONB;
  v_result JSONB;
  v_roster_count INTEGER;
  v_existing_count INTEGER;
  v_posted_count INTEGER := 0;
  v_changed_count INTEGER := 0;
  v_preserved_count INTEGER := 0;
  v_term_count INTEGER := 0;
  v_activity_count INTEGER := 0;
  v_is_insert BOOLEAN;
  v_result_changed BOOLEAN;
  v_source TEXT;
  v_subject_label TEXT;
  v_official_revision INTEGER;
  v_request_hash TEXT;
  v_projection_hash TEXT;
  v_notification_count INTEGER := 0;
  v_rows_inserted INTEGER := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required to post grades.';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A posting operation ID is required.';
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
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No roster rows were supplied for posting.';
  END IF;

  v_request_hash := md5(jsonb_build_object(
    'class_record_id', p_class_record_id,
    'grade_period', p_grade_period,
    'term_score_rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'class_record_id', row_data.value->>'class_record_id',
        'student_id', row_data.value->>'student_id',
        'term', row_data.value->>'term',
        'act1', row_data.value->'act1', 'act2', row_data.value->'act2',
        'act3', row_data.value->'act3', 'act4', row_data.value->'act4',
        'act5', row_data.value->'act5', 'act6', row_data.value->'act6',
        'char_rating', row_data.value->'char_rating', 'exam', row_data.value->'exam'
      ) ORDER BY row_data.value->>'student_id', row_data.value->>'term')
      FROM jsonb_array_elements(COALESCE(p_term_score_rows, '[]'::JSONB)) row_data
    ), '[]'::JSONB),
    'activity_score_rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'student_id', row_data.value->>'student_id',
        'activity_id', row_data.value->>'activity_id',
        'score', row_data.value->'score'
      ) ORDER BY row_data.value->>'student_id', row_data.value->>'activity_id')
      FROM jsonb_array_elements(COALESCE(p_activity_score_rows, '[]'::JSONB)) row_data
    ), '[]'::JSONB),
    'posted_grade_rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'student_id', row_data.value->>'student_id',
        'remarks', lower(COALESCE(row_data.value->>'remarks', '')),
        'remarks_note', NULLIF(BTRIM(COALESCE(row_data.value->>'remarks_note', '')), '')
      ) ORDER BY row_data.value->>'student_id')
      FROM jsonb_array_elements(COALESCE(p_posted_grade_rows, '[]'::JSONB)) row_data
    ), '[]'::JSONB)
  )::TEXT);

  PERFORM pg_advisory_xact_lock(hashtextextended('grade-operation:' || p_operation_id::TEXT, 0));
  SELECT operation.* INTO v_operation
  FROM public.grade_posting_operations operation
  WHERE operation.operation_id = p_operation_id;
  IF FOUND THEN
    IF v_operation.actor_id IS DISTINCT FROM v_actor
      OR v_operation.class_record_id IS DISTINCT FROM p_class_record_id
      OR v_operation.grade_period IS DISTINCT FROM p_grade_period
      OR v_operation.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'This operation ID is already bound to a different grade-posting request.';
    END IF;
    RETURN v_operation.result;
  END IF;

  SELECT * INTO v_class FROM public.class_records
  WHERE class_record_id = p_class_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The class record does not exist.';
  END IF;
  IF v_class.faculty_id IS DISTINCT FROM v_actor OR NOT EXISTS (
    SELECT 1 FROM public.users actor
    WHERE actor.user_id = v_actor AND actor.role::TEXT = 'faculty' AND actor.status::TEXT = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the active faculty assigned to this class can post its grades.';
  END IF;
  IF v_class.grading_formula_snapshot IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The class has no frozen grading formula snapshot.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_class_record_id::TEXT || ':' || p_grade_period, 0));
  SELECT COUNT(DISTINCT enrollment.student_id)::INTEGER INTO v_roster_count
  FROM public.enrollments enrollment
  WHERE enrollment.section_id = v_class.section_id
    AND enrollment.subject_id = v_class.subject_id
    AND COALESCE(enrollment.status::TEXT, 'active') = 'active';
  SELECT COUNT(*)::INTEGER INTO v_existing_count
  FROM public.posted_grades grade
  WHERE grade.class_record_id = p_class_record_id AND grade.grade_period::TEXT = p_grade_period;

  IF v_roster_count = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The active class roster is empty.';
  END IF;
  IF (SELECT COUNT(*) FROM (
      SELECT value->>'student_id'
      FROM jsonb_array_elements(p_posted_grade_rows)
      GROUP BY value->>'student_id'
    ) ids) <> jsonb_array_length(p_posted_grade_rows)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'The posting payload contains duplicate student rows.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_posted_grade_rows) row_data
    WHERE COALESCE(row_data.value->>'class_record_id', '') <> p_class_record_id::TEXT
      OR COALESCE(row_data.value->>'grade_period', '') <> p_grade_period
      OR NOT EXISTS (
        SELECT 1 FROM public.enrollments enrollment
        WHERE enrollment.student_id = (row_data.value->>'student_id')::UUID
          AND enrollment.section_id = v_class.section_id
          AND enrollment.subject_id = v_class.subject_id
          AND COALESCE(enrollment.status::TEXT, 'active') = 'active'
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Every posting row must belong to the active class roster and requested milestone.';
  END IF;

  -- New or incomplete milestones must be completed as a full-roster snapshot.
  IF v_existing_count < v_roster_count AND (
    jsonb_array_length(p_posted_grade_rows) <> v_roster_count
    OR EXISTS (
      SELECT enrollment.student_id FROM public.enrollments enrollment
      WHERE enrollment.section_id = v_class.section_id
        AND enrollment.subject_id = v_class.subject_id
        AND COALESCE(enrollment.status::TEXT, 'active') = 'active'
      EXCEPT
      SELECT (row_data.value->>'student_id')::UUID FROM jsonb_array_elements(p_posted_grade_rows) row_data
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Posting is blocked until the payload contains the complete active roster.';
  END IF;

  IF COALESCE(v_class.status::TEXT, '') <> 'active' THEN
    IF p_grade_period <> 'semestral_grade' OR NOT EXISTS (
      SELECT 1 FROM public.remark_override_requests request
      JOIN public.posted_grades grade ON grade.posted_grade_id = request.posted_grade_id
      WHERE grade.class_record_id = p_class_record_id AND request.status = 'approved'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This class is archived and view only. An approved SG correction is required.';
    END IF;
  END IF;

  IF p_grade_period <> 'semestral_grade' AND EXISTS (
    SELECT 1 FROM public.posted_grades grade
    WHERE grade.class_record_id = p_class_record_id
      AND grade.grade_period::TEXT = 'semestral_grade'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MR and TFR are final once the official SG is posted. Use the SG correction workflow for any later official change.';
  END IF;

  -- A score-basis edit is accepted only before SG exists. Existing official SG
  -- corrections are remark/result authorizations, never a live score-sheet unlock.
  IF EXISTS (
      SELECT 1 FROM public.posted_grades grade
      WHERE grade.class_record_id = p_class_record_id
        AND grade.grade_period::TEXT = 'semestral_grade'
    ) AND (
      jsonb_array_length(COALESCE(p_term_score_rows, '[]'::JSONB)) > 0
      OR jsonb_array_length(COALESCE(p_activity_score_rows, '[]'::JSONB)) > 0
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Official SG score inputs are locked. Submit an audited correction proposal instead of live score edits.';
  END IF;

  PERFORM set_config('aspire.grade_posting_context', 'posting', TRUE);
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_term_score_rows, '[]'::JSONB))
  LOOP
    SELECT * INTO v_term FROM jsonb_populate_record(NULL::public.student_term_scores, v_item);
    IF v_term.class_record_id IS DISTINCT FROM p_class_record_id
      OR v_term.term NOT IN ('Prelim', 'Midterm', 'Semi-Final', 'Final')
      OR (p_grade_period = 'midterm_rating' AND v_term.term NOT IN (
        CASE WHEN lower(COALESCE(v_class.semester::TEXT, '')) LIKE '%summer%' THEN 'Midterm' ELSE 'Prelim' END,
        'Midterm'
      ))
      OR (p_grade_period = 'tentative_final_rating' AND v_term.term NOT IN (
        CASE WHEN lower(COALESCE(v_class.semester::TEXT, '')) LIKE '%summer%' THEN 'Final' ELSE 'Semi-Final' END,
        'Final'
      ))
      OR EXISTS (
        SELECT 1 FROM public.posted_grades locked_grade
        WHERE locked_grade.class_record_id = p_class_record_id
          AND locked_grade.student_id = v_term.student_id
          AND locked_grade.grade_period::TEXT <> p_grade_period
          AND COALESCE(locked_grade.is_locked, TRUE)
          AND (
            COALESCE(locked_grade.locked_milestones, '[]'::JSONB) ? v_term.term
            OR (locked_grade.grade_period::TEXT = 'midterm_rating' AND v_term.term IN ('Prelim', 'Midterm'))
            OR (locked_grade.grade_period::TEXT = 'tentative_final_rating' AND v_term.term IN ('Semi-Final', 'Final'))
          )
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.enrollments enrollment
        WHERE enrollment.student_id = v_term.student_id
          AND enrollment.section_id = v_class.section_id
          AND enrollment.subject_id = v_class.subject_id
          AND COALESCE(enrollment.status::TEXT, 'active') = 'active'
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A term-score row does not belong to this active class roster.';
    END IF;
    INSERT INTO public.student_term_scores (
      score_id, class_record_id, student_id, term, act1, act2, act3, act4,
      act5, act6, char_rating, exam, saved_at, saved_by
    ) VALUES (
      COALESCE(v_term.score_id, gen_random_uuid()), p_class_record_id, v_term.student_id, v_term.term,
      v_term.act1, v_term.act2, v_term.act3, v_term.act4, v_term.act5, v_term.act6,
      v_term.char_rating, v_term.exam, CURRENT_TIMESTAMP, v_actor
    ) ON CONFLICT (class_record_id, student_id, term) DO UPDATE SET
      act1 = COALESCE(EXCLUDED.act1, student_term_scores.act1),
      act2 = COALESCE(EXCLUDED.act2, student_term_scores.act2),
      act3 = COALESCE(EXCLUDED.act3, student_term_scores.act3),
      act4 = COALESCE(EXCLUDED.act4, student_term_scores.act4),
      act5 = COALESCE(EXCLUDED.act5, student_term_scores.act5),
      act6 = COALESCE(EXCLUDED.act6, student_term_scores.act6),
      char_rating = COALESCE(EXCLUDED.char_rating, student_term_scores.char_rating),
      exam = COALESCE(EXCLUDED.exam, student_term_scores.exam),
      saved_at = CURRENT_TIMESTAMP, saved_by = v_actor;
    v_term_count := v_term_count + 1;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_activity_score_rows, '[]'::JSONB))
  LOOP
    SELECT * INTO v_activity FROM jsonb_populate_record(NULL::public.student_activity_scores, v_item);
    IF v_activity.score IS NULL OR v_activity.score < 0 OR NOT EXISTS (
      SELECT 1 FROM public.class_activities activity
      JOIN public.enrollments enrollment ON enrollment.student_id = v_activity.student_id
        AND enrollment.section_id = v_class.section_id AND enrollment.subject_id = v_class.subject_id
        AND COALESCE(enrollment.status::TEXT, 'active') = 'active'
      WHERE activity.activity_id = v_activity.activity_id
        AND activity.class_record_id = p_class_record_id
        AND (
          p_grade_period = 'semestral_grade'
          OR (p_grade_period = 'midterm_rating' AND activity.term IN (
            CASE WHEN lower(COALESCE(v_class.semester::TEXT, '')) LIKE '%summer%' THEN 'Midterm' ELSE 'Prelim' END,
            'Midterm'
          ))
          OR (p_grade_period = 'tentative_final_rating' AND activity.term IN (
            CASE WHEN lower(COALESCE(v_class.semester::TEXT, '')) LIKE '%summer%' THEN 'Final' ELSE 'Semi-Final' END,
            'Final'
          ))
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.posted_grades locked_grade
          WHERE locked_grade.class_record_id = p_class_record_id
            AND locked_grade.student_id = v_activity.student_id
            AND locked_grade.grade_period::TEXT <> p_grade_period
            AND COALESCE(locked_grade.is_locked, TRUE)
            AND (
              COALESCE(locked_grade.locked_milestones, '[]'::JSONB) ? activity.term
              OR (locked_grade.grade_period::TEXT = 'midterm_rating' AND activity.term IN ('Prelim', 'Midterm'))
              OR (locked_grade.grade_period::TEXT = 'tentative_final_rating' AND activity.term IN ('Semi-Final', 'Final'))
            )
        )
        AND v_activity.score <= activity.max_score
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An activity score is invalid or outside its configured maximum.';
    END IF;
    INSERT INTO public.student_activity_scores (score_id, student_id, activity_id, score, created_at, updated_at)
    VALUES (COALESCE(v_activity.score_id, gen_random_uuid()), v_activity.student_id,
      v_activity.activity_id, v_activity.score, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (student_id, activity_id) DO UPDATE SET
      score = EXCLUDED.score, updated_at = CURRENT_TIMESTAMP;
    v_activity_count := v_activity_count + 1;
  END LOOP;

  v_locks := CASE p_grade_period
    WHEN 'midterm_rating' THEN
      CASE WHEN lower(COALESCE(v_class.semester::TEXT, '')) LIKE '%summer%'
        THEN '["Midterm","Midterm Rating"]'::JSONB
        ELSE '["Prelim","Midterm","Midterm Rating"]'::JSONB END
    WHEN 'tentative_final_rating' THEN
      CASE WHEN lower(COALESCE(v_class.semester::TEXT, '')) LIKE '%summer%'
        THEN '["Final","Tentative Final Rating"]'::JSONB
        ELSE '["Semi-Final","Final","Tentative Final Rating"]'::JSONB END
    ELSE '["Prelim","Midterm","Semi-Final","Final","Semestral Grade"]'::JSONB
  END;

  SELECT COALESCE(subject.code || ' - ' || subject.name, subject.code, subject.name, 'your class')
  INTO v_subject_label FROM public.subjects subject WHERE subject.subject_id = v_class.subject_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_posted_grade_rows)
  LOOP
    SELECT * INTO v_payload FROM jsonb_populate_record(NULL::public.posted_grades, v_item || jsonb_build_object('locked_milestones', v_locks));
    v_student_id := v_payload.student_id;
    SELECT * INTO v_existing FROM public.posted_grades grade
    WHERE grade.class_record_id = p_class_record_id
      AND grade.student_id = v_student_id
      AND grade.grade_period::TEXT = p_grade_period
    FOR UPDATE;
    v_is_insert := NOT FOUND;

    -- Existing SG rows are immutable unless their own approved request is used.
    IF p_grade_period = 'semestral_grade' AND NOT v_is_insert THEN
      SELECT * INTO v_request FROM public.remark_override_requests request
      WHERE request.posted_grade_id = v_existing.posted_grade_id AND request.status = 'approved'
      ORDER BY request.decision_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
      IF NOT FOUND THEN
        v_preserved_count := v_preserved_count + 1;
        CONTINUE;
      END IF;
      IF jsonb_array_length(COALESCE(v_request.proposed_score_changes, '[]'::JSONB)) > 0 THEN
        RAISE EXCEPTION USING ERRCODE = '0A000', MESSAGE = 'This approved correction contains an unstaged score delta and cannot be applied.';
      END IF;
    ELSE
      v_request.request_id := NULL;
    END IF;

    v_projection := public.aspire_calculate_student_grade(p_class_record_id, v_student_id);
    IF NOT COALESCE((v_projection->>'ok')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT('Grade calculation failed for student %s: %s', v_student_id, COALESCE(v_projection->>'error', 'unknown error'));
    END IF;
    IF p_grade_period = 'midterm_rating' THEN
      v_computed := NULLIF(v_projection->>'mr', '')::NUMERIC;
      IF NOT COALESCE((v_projection->>'midterm_complete')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT('Midterm inputs are incomplete for student %s.', v_student_id);
      END IF;
    ELSIF p_grade_period = 'tentative_final_rating' THEN
      v_computed := NULLIF(v_projection->>'tfr', '')::NUMERIC;
      IF NOT COALESCE((v_projection->>'tfr_complete')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT('Tentative-final inputs are incomplete for student %s.', v_student_id);
      END IF;
    ELSE
      v_computed := NULLIF(v_projection->>'sg', '')::NUMERIC;
      IF NOT COALESCE((v_projection->>'sg_complete')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT('Semestral inputs are incomplete for student %s.', v_student_id);
      END IF;
    END IF;
    IF v_computed IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT('No complete rating is available for student %s.', v_student_id);
    END IF;

    v_base_effective := public.aspire_transmute_grade(v_computed);
    v_note := NULLIF(BTRIM(COALESCE(v_item->>'remarks_note', '')), '');
    IF v_request.request_id IS NOT NULL THEN
      IF v_computed IS DISTINCT FROM COALESCE(v_request.proposed_computed_grade, v_request.original_computed_grade) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT('The approved SG percentage for student %s does not match the current server-calculated score basis.', v_student_id);
      END IF;
      v_remark := COALESCE(v_request.proposed_remark, v_request.original_remark);
      v_effective := COALESCE(v_request.proposed_effective_grade, v_request.original_effective_grade);
      v_canonical_effective := CASE
        WHEN v_remark = 'fda' THEN 5.00
        WHEN v_remark = 'passed' THEN LEAST(v_base_effective, 3.00)
        ELSE v_base_effective
      END;
      IF v_effective IS DISTINCT FROM v_canonical_effective THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT('The approved effective GWA for student %s does not match the server-calculated result.', v_student_id);
      END IF;
      v_note := COALESCE(v_note, v_request.note);
      v_source := 'dean_correction';
    ELSE
      v_candidate_remark := lower(COALESCE(NULLIF(v_item->>'remarks', ''), v_projection->>'remarks', 'failed'));
      IF v_candidate_remark NOT IN ('passed', 'failed', 'incomplete', 'fda', 'dropped') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A posting row contains an unsupported academic remark.';
      END IF;
      IF p_grade_period <> 'semestral_grade' THEN
        -- Milestone remarks are always derived from that milestone's own result.
        v_remark := CASE WHEN v_base_effective <= 3.00 THEN 'passed' ELSE 'failed' END;
        v_effective := NULL;
      ELSIF v_candidate_remark IN ('incomplete', 'dropped') THEN
        -- INC and Dropped cannot be inferred from a numeric result, but must be
        -- explicit and justified. Passed/Failed never enter through this path.
        IF v_note IS NULL THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT('A reason is required for the exceptional %s remark for student %s.', upper(v_candidate_remark), v_student_id);
        END IF;
        v_remark := v_candidate_remark;
        v_effective := v_base_effective;
      ELSE
        -- FDA and binary outcomes are authoritative projections. This prevents
        -- a browser payload from granting a grace pass or suppressing FDA.
        v_remark := v_projection->>'remarks';
        v_effective := NULLIF(v_projection->>'effective_grade', '')::NUMERIC;
        IF v_candidate_remark IN ('passed', 'failed') AND v_remark <> v_candidate_remark THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT('The requested %s remark conflicts with the server-calculated %s result for student %s.', v_candidate_remark, v_remark, v_student_id);
        END IF;
      END IF;
      v_source := 'faculty_post';
    END IF;

    -- Result validation is independent of the UI, including Dean-approved rows.
    IF p_grade_period = 'semestral_grade' THEN
      IF v_effective IS NULL OR v_effective NOT IN (1.00,1.25,1.50,1.75,2.00,2.25,2.50,2.75,3.00,5.00) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The official GWA is outside the institutional transmutation ladder.';
      END IF;
      IF (v_remark = 'passed' AND v_effective > 3.00)
        OR (v_remark = 'failed' AND v_effective <= 3.00)
      THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The approved Passed/Failed remark conflicts with the effective GWA.';
      END IF;
    END IF;

    v_result_changed := v_is_insert
      OR v_existing.computed_grade IS DISTINCT FROM v_computed
      OR v_existing.effective_grade IS DISTINCT FROM v_effective
      OR v_existing.remarks::TEXT IS DISTINCT FROM v_remark
      OR v_existing.input_snapshot_hash IS DISTINCT FROM (v_projection->>'input_snapshot_hash');

    INSERT INTO public.posted_grades (
      posted_grade_id, class_record_id, student_id, grade_period,
      computed_grade, effective_grade, remarks, remarks_note,
      remarks_set_by, remarks_set_at, posted_by, posted_at, is_locked,
      locked_milestones, grading_formula_snapshot, official_source,
      calculation_engine_version, input_snapshot_hash
    ) VALUES (
      COALESCE(v_payload.posted_grade_id, gen_random_uuid()), p_class_record_id, v_student_id, p_grade_period,
      v_computed, v_effective, v_remark::public.grade_remarks, v_note,
      v_actor, CURRENT_TIMESTAMP, v_actor, CURRENT_TIMESTAMP, TRUE,
      v_payload.locked_milestones, v_class.grading_formula_snapshot, v_source,
      v_projection->>'calculation_engine_version', v_projection->>'input_snapshot_hash'
    ) ON CONFLICT (class_record_id, grade_period, student_id) DO UPDATE SET
      computed_grade = EXCLUDED.computed_grade,
      effective_grade = EXCLUDED.effective_grade,
      remarks = EXCLUDED.remarks,
      remarks_note = EXCLUDED.remarks_note,
      remarks_set_by = v_actor,
      remarks_set_at = CURRENT_TIMESTAMP,
      posted_by = v_actor,
      posted_at = CURRENT_TIMESTAMP,
      is_locked = TRUE,
      locked_milestones = EXCLUDED.locked_milestones,
      grading_formula_snapshot = v_class.grading_formula_snapshot,
      official_source = EXCLUDED.official_source,
      calculation_engine_version = EXCLUDED.calculation_engine_version,
      input_snapshot_hash = EXCLUDED.input_snapshot_hash
    RETURNING official_revision INTO v_official_revision;

    v_posted_count := v_posted_count + 1;
    IF v_result_changed THEN
      v_changed_count := v_changed_count + 1;
      INSERT INTO public.notifications (
        recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
      ) VALUES (
        v_student_id,
        CASE WHEN v_is_insert THEN 'grade_posted' ELSE 'grade_changed' END,
        CASE
          WHEN v_is_insert THEN 'New Grade Posted'
          WHEN p_grade_period = 'semestral_grade' THEN 'Official Grade Updated'
          ELSE 'Progress Grade Updated'
        END,
        '/student/grades', 'info',
        CASE WHEN v_is_insert
          THEN FORMAT('Your %s grade for %s has been posted.', p_grade_period, v_subject_label)
          WHEN p_grade_period = 'semestral_grade'
            THEN FORMAT('Your corrected official grade for %s has been posted.', v_subject_label)
          ELSE FORMAT('Your updated %s progress grade for %s has been posted.', p_grade_period, v_subject_label)
        END,
        jsonb_build_object('class_record_id', p_class_record_id, 'grade_period', p_grade_period,
          'computed_grade', v_computed, 'effective_grade', v_effective, 'remarks', v_remark),
        CASE WHEN v_is_insert
          THEN FORMAT('grade_posted:%s:%s:%s', p_class_record_id, p_grade_period, v_student_id)
          WHEN v_request.request_id IS NOT NULL
            THEN FORMAT('grade_changed:%s:%s:%s:request:%s', p_class_record_id, p_grade_period, v_student_id, v_request.request_id)
          ELSE FORMAT('grade_changed:%s:%s:%s:rev%s', p_class_record_id, p_grade_period, v_student_id, v_official_revision) END,
        FALSE
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
      GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
      v_notification_count := v_notification_count + v_rows_inserted;
    END IF;

    IF v_request.request_id IS NOT NULL AND v_request.decision_by IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
      ) VALUES (
        v_request.decision_by, 'grade_changed', 'Approved SG Correction Applied',
        '/dean/remarkoverriderequests', 'info',
        FORMAT('The approved SG correction for %s was applied and the official row remains locked.', v_subject_label),
        jsonb_build_object('request_id', v_request.request_id, 'class_record_id', p_class_record_id,
          'student_id', v_student_id, 'final_remark', v_remark),
        FORMAT('sg_correction_applied:%s', v_request.request_id), FALSE
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
      GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
      v_notification_count := v_notification_count + v_rows_inserted;
    END IF;
  END LOOP;

  IF v_existing_count < v_roster_count AND (
    SELECT COUNT(*) FROM public.posted_grades grade
    WHERE grade.class_record_id = p_class_record_id AND grade.grade_period::TEXT = p_grade_period
  ) <> v_roster_count THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The milestone transaction did not produce a complete active-roster snapshot.';
  END IF;

  SELECT md5(COALESCE(string_agg(
    roster.student_id::TEXT || ':' || COALESCE(public.aspire_grade_input_hash(p_class_record_id, roster.student_id), ''),
    '|' ORDER BY roster.student_id
  ), '')) INTO v_projection_hash
  FROM (
    SELECT DISTINCT enrollment.student_id
    FROM public.enrollments enrollment
    WHERE enrollment.section_id = v_class.section_id
      AND enrollment.subject_id = v_class.subject_id
      AND COALESCE(enrollment.status::TEXT, 'active') = 'active'
  ) roster;

  v_result := jsonb_build_object(
    'operation_id', p_operation_id,
    'class_record_id', p_class_record_id,
    'grade_period', p_grade_period,
    'roster_count', v_roster_count,
    'posted_count', v_posted_count,
    'changed_count', v_changed_count,
    'preserved_count', v_preserved_count,
    'term_score_count', v_term_count,
    'activity_score_count', v_activity_count,
    'request_hash', v_request_hash,
    'projection_hash', v_projection_hash,
    'notifications_queued', v_notification_count,
    'calculation_engine_version', 'server-v1'
  );
  INSERT INTO public.grade_posting_operations (
    operation_id, class_record_id, grade_period, actor_id, request_hash,
    projection_hash, notification_count, status, result
  ) VALUES (
    p_operation_id, p_class_record_id, p_grade_period, v_actor, v_request_hash,
    v_projection_hash, v_notification_count, 'committed', v_result
  );
  RETURN v_result;
END;
$$;

-- Keep the old API secure for stale clients while making v2 the canonical API.
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
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.post_grade_milestone_v2(
    gen_random_uuid(), p_class_record_id, p_grade_period,
    p_term_score_rows, p_activity_score_rows, p_posted_grade_rows
  );
END;
$$;

-- Administrative overrides are validated at the same boundary as the UI and
-- produce a new immutable official revision plus durable notification.
CREATE OR REPLACE FUNCTION public.apply_admin_grade_override_v2(
  p_operation_id UUID,
  p_posted_grade_id UUID,
  p_new_effective_grade NUMERIC,
  p_new_remarks TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_old public.posted_grades%ROWTYPE;
  v_request_id UUID;
  v_new_remarks public.grade_remarks;
  v_faculty_id UUID;
  v_operation public.admin_grade_override_operations%ROWTYPE;
  v_request_hash TEXT;
  v_result JSONB;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only an administrator may apply a grade override.';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An administrative override operation ID is required.';
  END IF;
  v_request_hash := md5(jsonb_build_object(
    'posted_grade_id', p_posted_grade_id,
    'new_effective_grade', p_new_effective_grade,
    'new_remarks', lower(BTRIM(COALESCE(p_new_remarks, ''))),
    'reason', BTRIM(COALESCE(p_reason, ''))
  )::TEXT);
  PERFORM pg_advisory_xact_lock(hashtextextended('admin-grade-override:' || p_operation_id::TEXT, 0));
  SELECT operation.* INTO v_operation
  FROM public.admin_grade_override_operations operation
  WHERE operation.operation_id = p_operation_id;
  IF FOUND THEN
    IF v_operation.actor_id IS DISTINCT FROM v_actor
      OR v_operation.posted_grade_id IS DISTINCT FROM p_posted_grade_id
      OR v_operation.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'This operation ID is already bound to a different administrative override.';
    END IF;
    RETURN v_operation.result;
  END IF;
  IF p_new_effective_grade IS NULL
    OR p_new_effective_grade NOT IN (1.00,1.25,1.50,1.75,2.00,2.25,2.50,2.75,3.00,5.00)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Select a grade from the institutional transmutation ladder.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_new_remarks, '')), '') IS NULL
    OR NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A remark and override reason are required.';
  END IF;
  v_new_remarks := lower(BTRIM(p_new_remarks))::public.grade_remarks;
  IF (v_new_remarks::TEXT = 'passed' AND p_new_effective_grade > 3.00)
    OR (v_new_remarks::TEXT = 'failed' AND p_new_effective_grade <= 3.00)
    OR (v_new_remarks::TEXT = 'fda' AND p_new_effective_grade <> 5.00)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The academic remark conflicts with the replacement GWA.';
  END IF;

  SELECT * INTO v_old FROM public.posted_grades
  WHERE posted_grade_id = p_posted_grade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Posted grade not found.'; END IF;
  IF v_old.grade_period::TEXT <> 'semestral_grade' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Only the Semestral Grade may be overridden.';
  END IF;
  IF v_old.effective_grade IS NOT DISTINCT FROM p_new_effective_grade
    AND v_old.remarks::TEXT IS NOT DISTINCT FROM v_new_remarks::TEXT
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The override must change an official value.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.remark_override_requests
    WHERE posted_grade_id = p_posted_grade_id AND status IN ('pending', 'approved'))
  THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Resolve the open SG correction request before applying an administrative override.';
  END IF;

  INSERT INTO public.remark_override_requests (
    class_record_id, student_id, posted_grade_id, requested_by, requested_at,
    computed_grade, effective_grade, current_remark, requested_remark, note,
    original_computed_grade, original_effective_grade, original_remark,
    proposed_computed_grade, proposed_effective_grade, proposed_remark,
    status, decision_by, decision_at, resolved_by, resolved_at
  ) VALUES (
    v_old.class_record_id, v_old.student_id, p_posted_grade_id, v_actor, CURRENT_TIMESTAMP,
    v_old.computed_grade, v_old.effective_grade, v_old.remarks::TEXT, v_new_remarks::TEXT, BTRIM(p_reason),
    v_old.computed_grade, v_old.effective_grade, v_old.remarks::TEXT,
    v_old.computed_grade, p_new_effective_grade, v_new_remarks::TEXT,
    'approved', v_actor, CURRENT_TIMESTAMP, v_actor, CURRENT_TIMESTAMP
  ) RETURNING request_id INTO v_request_id;

  PERFORM set_config('aspire.grade_posting_context', 'admin_override', TRUE);
  UPDATE public.posted_grades SET
    effective_grade = p_new_effective_grade,
    remarks = v_new_remarks,
    remarks_note = BTRIM(p_reason),
    override_at = CURRENT_TIMESTAMP,
    override_by = v_actor,
    remarks_set_at = CURRENT_TIMESTAMP,
    remarks_set_by = v_actor,
    official_source = 'admin_override',
    calculation_engine_version = 'admin-override-v2',
    is_locked = TRUE
  WHERE posted_grade_id = p_posted_grade_id;

  SELECT faculty_id INTO v_faculty_id FROM public.class_records
  WHERE class_record_id = v_old.class_record_id;

  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
  ) VALUES (
    v_old.student_id, 'grade_changed', 'Official Grade Updated', '/student/grades', 'warning',
    'An administrator updated your official semestral grade. Review the record and contact your school if you have questions.',
    jsonb_build_object('posted_grade_id', p_posted_grade_id, 'class_record_id', v_old.class_record_id,
      'effective_grade', p_new_effective_grade, 'remarks', v_new_remarks::TEXT, 'request_id', v_request_id),
    FORMAT('grade_changed:%s:semestral_grade:%s:admin:%s', v_old.class_record_id, v_old.student_id, v_request_id),
    FALSE
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  IF v_faculty_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      v_faculty_id, 'grade_changed', 'Administrative Grade Override',
      '/faculty/postedgrades', 'warning',
      'An administrator updated an official SG in one of your classes. Review the audited official record.',
      jsonb_build_object('posted_grade_id', p_posted_grade_id, 'class_record_id', v_old.class_record_id,
        'student_id', v_old.student_id, 'request_id', v_request_id),
      FORMAT('grade_changed:%s:semestral_grade:%s:admin-faculty:%s', v_old.class_record_id, v_old.student_id, v_request_id),
      FALSE
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  v_result := jsonb_build_object(
    'operation_id', p_operation_id,
    'posted_grade_id', p_posted_grade_id, 'request_id', v_request_id,
    'previous_effective_grade', v_old.effective_grade, 'previous_remark', v_old.remarks::TEXT,
    'new_effective_grade', p_new_effective_grade, 'new_remark', v_new_remarks::TEXT
  );
  INSERT INTO public.admin_grade_override_operations (
    operation_id, posted_grade_id, actor_id, request_hash, status, result
  ) VALUES (
    p_operation_id, p_posted_grade_id, v_actor, v_request_hash, 'committed', v_result
  );
  RETURN v_result;
END;
$$;

-- Legacy callers remain constrained by the same transaction; new clients use
-- the v2 operation ID so a retry after an unknown commit is deterministic.
CREATE OR REPLACE FUNCTION public.apply_admin_grade_override(
  p_posted_grade_id UUID,
  p_new_effective_grade NUMERIC,
  p_new_remarks TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.apply_admin_grade_override_v2(
    gen_random_uuid(), p_posted_grade_id, p_new_effective_grade, p_new_remarks, p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_sg_correction_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_unstaged_sg_score_correction() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preflight_sg_correction_posting(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_grade_milestone_v2(UUID, UUID, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_grade_milestone_atomic(UUID, TEXT, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_admin_grade_override_v2(UUID, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_admin_grade_override(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_sg_correction_request(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preflight_sg_correction_posting(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_grade_milestone_v2(UUID, UUID, TEXT, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_grade_milestone_atomic(UUID, TEXT, JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_admin_grade_override_v2(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_admin_grade_override(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

COMMIT;
