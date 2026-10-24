-- =============================================================================
-- ASPIRE: STAGED, DEAN-APPROVED SG SCORE CORRECTIONS
-- =============================================================================
-- Faculty may request one student-scoped correction after SG is posted. Dean
-- approval authorizes one correction transaction but never opens the locked
-- live ledger. Faculty then enters exact activity/exam/character changes;
-- PostgreSQL previews them in a rolled-back subtransaction and atomically
-- freezes/applies every canonical before/after value when the request is used.

BEGIN;

ALTER TABLE public.grade_correction_history
  ADD COLUMN IF NOT EXISTS applied_score_changes JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE public.remark_override_requests
  ADD COLUMN IF NOT EXISTS correction_scope TEXT NOT NULL DEFAULT 'result_only';

ALTER TABLE public.remark_override_requests
  DROP CONSTRAINT IF EXISTS remark_override_requests_correction_scope_check;
ALTER TABLE public.remark_override_requests
  ADD CONSTRAINT remark_override_requests_correction_scope_check
  CHECK (correction_scope IN ('result_only', 'student_score_row', 'admin_override'));

CREATE TABLE IF NOT EXISTS public.sg_correction_operations (
  operation_id UUID PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE REFERENCES public.remark_override_requests(request_id) ON DELETE RESTRICT,
  posted_grade_id UUID NOT NULL REFERENCES public.posted_grades(posted_grade_id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status = 'committed'),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.sg_correction_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sg_correction_operations_authorized_select ON public.sg_correction_operations;
CREATE POLICY sg_correction_operations_authorized_select
ON public.sg_correction_operations FOR SELECT TO authenticated
USING (
  actor_id = auth.uid()
  OR public.is_active_admin()
  OR EXISTS (
    SELECT 1
    FROM public.remark_override_requests request
    WHERE request.request_id = sg_correction_operations.request_id
      AND public.is_authorized_dean_for_class(request.class_record_id)
  )
);

REVOKE ALL ON TABLE public.sg_correction_operations FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sg_correction_operations FROM authenticated;
GRANT SELECT ON TABLE public.sg_correction_operations TO authenticated;

-- The P0 placeholder rejected all score deltas. The functions below replace it
-- with an exact staged workflow, so the placeholder trigger must be retired.
DROP TRIGGER IF EXISTS trg_reject_unstaged_sg_score_correction ON public.remark_override_requests;
DROP FUNCTION IF EXISTS public.reject_unstaged_sg_score_correction();

-- Apply canonical score deltas to the current transaction. This helper is never
-- exposed to clients. Preview calls it inside a deliberately rolled-back block;
-- final application calls it inside the approved correction transaction.
CREATE OR REPLACE FUNCTION public.aspire_apply_sg_score_changes(
  p_class_record_id UUID,
  p_student_id UUID,
  p_score_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item JSONB;
  v_target_type TEXT;
  v_target_key TEXT;
  v_seen TEXT[] := ARRAY[]::TEXT[];
  v_activity public.class_activities%ROWTYPE;
  v_term_score public.student_term_scores%ROWTYPE;
  v_columns public.class_grading_columns%ROWTYPE;
  v_activity_id UUID;
  v_term TEXT;
  v_field TEXT;
  v_label TEXT;
  v_original NUMERIC;
  v_current NUMERIC;
  v_proposed NUMERIC;
  v_max NUMERIC;
  v_canonical JSONB := '[]'::JSONB;
BEGIN
  IF jsonb_typeof(COALESCE(p_score_changes, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Proposed score changes must be a JSON array.';
  END IF;
  IF jsonb_array_length(COALESCE(p_score_changes, '[]'::JSONB)) > 50 THEN
    RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'A correction request may change at most 50 score items.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_score_changes, '[]'::JSONB))
  LOOP
    v_target_type := lower(BTRIM(COALESCE(v_item->>'target_type', '')));
    IF jsonb_typeof(v_item->'proposed_score') <> 'number'
      OR NOT (v_item ? 'original_score')
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Every score correction needs exact original and proposed numeric values.';
    END IF;

    v_original := CASE WHEN jsonb_typeof(v_item->'original_score') = 'null'
      THEN NULL ELSE (v_item->>'original_score')::NUMERIC END;
    v_proposed := (v_item->>'proposed_score')::NUMERIC;

    IF v_target_type = 'activity' THEN
      BEGIN
        v_activity_id := (v_item->>'activity_id')::UUID;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An activity correction contains an invalid activity ID.';
      END;
      v_target_key := 'activity:' || v_activity_id::TEXT;
      IF v_target_key = ANY(v_seen) THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'The same score target appears more than once in the correction proposal.';
      END IF;
      v_seen := array_append(v_seen, v_target_key);

      SELECT activity.* INTO v_activity
      FROM public.class_activities activity
      WHERE activity.activity_id = v_activity_id
        AND activity.class_record_id = p_class_record_id
      FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'A proposed activity does not belong to this class.';
      END IF;

      SELECT score.score INTO v_current
      FROM public.student_activity_scores score
      WHERE score.student_id = p_student_id
        AND score.activity_id = v_activity_id
      FOR UPDATE;
      IF NOT FOUND THEN v_current := NULL; END IF;

      v_max := v_activity.max_score;
      v_term := v_activity.term;
      v_field := NULL;
      v_label := COALESCE(NULLIF(BTRIM(v_activity.name), ''), 'Activity');

      IF v_current IS DISTINCT FROM v_original THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = FORMAT('%s no longer matches the proposed original score. Refresh and submit a current correction.', v_label);
      END IF;
      IF v_proposed < 0 OR v_max IS NULL OR v_proposed > v_max THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT('%s must be between 0 and %s.', v_label, v_max);
      END IF;
      IF v_proposed IS NOT DISTINCT FROM v_current THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT('%s must have a different proposed score.', v_label);
      END IF;

      INSERT INTO public.student_activity_scores (
        score_id, student_id, activity_id, score, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), p_student_id, v_activity_id, v_proposed, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ) ON CONFLICT (student_id, activity_id) DO UPDATE SET
        score = EXCLUDED.score,
        updated_at = CURRENT_TIMESTAMP;
    ELSIF v_target_type = 'term_score' THEN
      v_term := v_item->>'term';
      v_field := lower(BTRIM(COALESCE(v_item->>'field', '')));
      IF v_term NOT IN ('Prelim', 'Midterm', 'Semi-Final', 'Final')
        OR v_field NOT IN ('act1', 'act2', 'act3', 'act4', 'act5', 'act6', 'char_rating', 'exam')
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A term-score correction has an unsupported term or score field.';
      END IF;
      v_target_key := 'term:' || v_term || ':' || v_field;
      IF v_target_key = ANY(v_seen) THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'The same score target appears more than once in the correction proposal.';
      END IF;
      v_seen := array_append(v_seen, v_target_key);

      SELECT score.* INTO v_term_score
      FROM public.student_term_scores score
      WHERE score.class_record_id = p_class_record_id
        AND score.student_id = p_student_id
        AND score.term = v_term
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = FORMAT('No %s score row exists for this student.', v_term);
      END IF;

      v_current := CASE v_field
        WHEN 'act1' THEN v_term_score.act1 WHEN 'act2' THEN v_term_score.act2
        WHEN 'act3' THEN v_term_score.act3 WHEN 'act4' THEN v_term_score.act4
        WHEN 'act5' THEN v_term_score.act5 WHEN 'act6' THEN v_term_score.act6
        WHEN 'char_rating' THEN v_term_score.char_rating
        WHEN 'exam' THEN v_term_score.exam END;

      SELECT columns.* INTO v_columns
      FROM public.class_grading_columns columns
      WHERE columns.class_record_id = p_class_record_id AND columns.term = v_term;

      v_max := CASE v_field
        WHEN 'act1' THEN COALESCE(v_columns.act1_max, 20)
        WHEN 'act2' THEN COALESCE(v_columns.act2_max, 20)
        WHEN 'act3' THEN COALESCE(v_columns.act3_max, 20)
        WHEN 'act4' THEN COALESCE(v_columns.act4_max, 20)
        WHEN 'act5' THEN COALESCE(v_columns.act5_max, 20)
        WHEN 'act6' THEN COALESCE(v_columns.act6_max, 10)
        WHEN 'exam' THEN COALESCE(v_columns.exam_max, 40)
        ELSE NULL END;
      IF v_field = 'char_rating' THEN
        SELECT NULLIF(component->>'maxScore', '')::NUMERIC INTO v_max
        FROM public.class_records class_record
        CROSS JOIN LATERAL jsonb_array_elements(class_record.grading_formula_snapshot->'components') component
        WHERE class_record.class_record_id = p_class_record_id
          AND (
            component->>'semanticType' = 'character'
            OR (component->>'semanticType' IS NULL AND component->>'name' ~* 'character')
          )
        LIMIT 1;
        v_max := COALESCE(v_max, 100);
      END IF;

      v_label := COALESCE(NULLIF(BTRIM(v_item->>'label'), ''),
        CASE v_field WHEN 'exam' THEN 'Examination' WHEN 'char_rating' THEN 'Character Rating' ELSE upper(v_field) END);
      IF v_current IS DISTINCT FROM v_original THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = FORMAT('%s %s no longer matches the proposed original score. Refresh and submit a current correction.', v_term, v_label);
      END IF;
      IF v_proposed < 0 OR v_max IS NULL OR v_proposed > v_max THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT('%s %s must be between 0 and %s.', v_term, v_label, v_max);
      END IF;
      IF v_proposed IS NOT DISTINCT FROM v_current THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT('%s %s must have a different proposed score.', v_term, v_label);
      END IF;

      UPDATE public.student_term_scores SET
        act1 = CASE WHEN v_field = 'act1' THEN v_proposed ELSE act1 END,
        act2 = CASE WHEN v_field = 'act2' THEN v_proposed ELSE act2 END,
        act3 = CASE WHEN v_field = 'act3' THEN v_proposed ELSE act3 END,
        act4 = CASE WHEN v_field = 'act4' THEN v_proposed ELSE act4 END,
        act5 = CASE WHEN v_field = 'act5' THEN v_proposed ELSE act5 END,
        act6 = CASE WHEN v_field = 'act6' THEN v_proposed ELSE act6 END,
        char_rating = CASE WHEN v_field = 'char_rating' THEN v_proposed ELSE char_rating END,
        exam = CASE WHEN v_field = 'exam' THEN v_proposed ELSE exam END,
        saved_at = CURRENT_TIMESTAMP,
        saved_by = auth.uid()
      WHERE score_id = v_term_score.score_id;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Score corrections may target only a configured activity or term score.';
    END IF;

    v_canonical := v_canonical || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'target_type', v_target_type,
      'activity_id', v_activity_id,
      'term', v_term,
      'field', v_field,
      'label', v_label,
      'original_score', v_current,
      'proposed_score', v_proposed,
      'max_score', v_max
    )));
    v_activity_id := NULL;
  END LOOP;

  RETURN v_canonical;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_sg_score_correction(
  p_class_record_id UUID,
  p_student_id UUID,
  p_score_changes JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_class public.class_records%ROWTYPE;
  v_posted public.posted_grades%ROWTYPE;
  v_projection JSONB;
  v_canonical JSONB := '[]'::JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required to preview an SG correction.';
  END IF;
  IF jsonb_typeof(COALESCE(p_score_changes, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Proposed score changes must be a JSON array.';
  END IF;
  SELECT * INTO v_class FROM public.class_records WHERE class_record_id = p_class_record_id;
  IF NOT FOUND OR NOT (
    v_class.faculty_id = v_actor
    OR public.is_authorized_dean_for_class(p_class_record_id)
    OR public.is_active_admin()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You are not authorized to preview this SG correction.';
  END IF;
  SELECT * INTO v_posted
  FROM public.posted_grades
  WHERE class_record_id = p_class_record_id
    AND student_id = p_student_id
    AND grade_period::TEXT = 'semestral_grade';
  IF NOT FOUND OR NOT COALESCE(v_posted.is_locked, TRUE) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'A locked official SG is required before proposing a score correction.';
  END IF;

  IF jsonb_array_length(COALESCE(p_score_changes, '[]'::JSONB)) = 0 THEN
    v_projection := public.aspire_calculate_student_grade(p_class_record_id, p_student_id);
  ELSE
    BEGIN
      PERFORM set_config('aspire.grade_posting_context', 'correction', TRUE);
      v_canonical := public.aspire_apply_sg_score_changes(p_class_record_id, p_student_id, p_score_changes);
      v_projection := public.aspire_calculate_student_grade(p_class_record_id, p_student_id);
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASPIRE_SCORE_PREVIEW_ROLLBACK';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'ASPIRE_SCORE_PREVIEW_ROLLBACK' THEN RAISE; END IF;
    END;
  END IF;

  IF NOT COALESCE((v_projection->>'ok')::BOOLEAN, FALSE)
    OR NOT COALESCE((v_projection->>'sg_complete')::BOOLEAN, FALSE)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = COALESCE(v_projection->>'error', 'The proposed score basis does not produce a complete SG.');
  END IF;

  RETURN jsonb_build_object(
    'class_record_id', p_class_record_id,
    'student_id', p_student_id,
    'original_computed_grade', v_posted.computed_grade,
    'original_effective_grade', v_posted.effective_grade,
    'original_remark', v_posted.remarks::TEXT,
    'proposed_computed_grade', NULLIF(v_projection->>'sg', '')::NUMERIC,
    'base_effective_grade', public.aspire_transmute_grade(NULLIF(v_projection->>'sg', '')::NUMERIC),
    'suggested_remark', v_projection->>'remarks',
    'canonical_score_changes', v_canonical,
    'projection', v_projection
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_sg_correction_request(
  p_class_record_id UUID,
  p_student_id UUID,
  p_proposed_remark TEXT,
  p_reason TEXT,
  p_evidence_url TEXT DEFAULT NULL,
  p_proposed_computed_grade NUMERIC DEFAULT NULL,
  p_proposed_effective_grade NUMERIC DEFAULT NULL,
  p_proposed_score_changes JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_class public.class_records%ROWTYPE;
  v_posted public.posted_grades%ROWTYPE;
  v_preview JSONB;
  v_canonical_changes JSONB;
  v_request_id UUID;
  v_subject_name TEXT;
  v_section_name TEXT;
  v_faculty_name TEXT;
  v_proposed_remark TEXT := lower(BTRIM(COALESCE(p_proposed_remark, '')));
  v_computed NUMERIC;
  v_base_effective NUMERIC;
  v_effective NUMERIC;
  v_notification_count INTEGER := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A correction reason is required.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_evidence_url, '')), '') IS NOT NULL
    AND BTRIM(p_evidence_url) !~* '^https://[^[:space:]]+$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The evidence reference must be a secure HTTPS URL.';
  END IF;
  IF v_proposed_remark NOT IN ('passed', 'failed', 'incomplete', 'fda', 'dropped') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Select an exact proposed academic remark.';
  END IF;

  SELECT * INTO v_class FROM public.class_records
  WHERE class_record_id = p_class_record_id FOR UPDATE;
  IF NOT FOUND OR v_class.faculty_id IS DISTINCT FROM v_actor OR NOT EXISTS (
    SELECT 1 FROM public.users actor
    WHERE actor.user_id = v_actor AND actor.role::TEXT = 'faculty' AND actor.status::TEXT = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the active faculty assigned to this class may request an SG correction.';
  END IF;

  SELECT * INTO v_posted FROM public.posted_grades
  WHERE class_record_id = p_class_record_id
    AND student_id = p_student_id
    AND grade_period::TEXT = 'semestral_grade'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'No official semestral grade exists for this student.';
  END IF;
  IF NOT COALESCE(v_posted.is_locked, TRUE) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The official SG must remain locked while a correction is requested.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.remark_override_requests request
    WHERE request.posted_grade_id = v_posted.posted_grade_id
      AND request.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'An unresolved correction request already exists for this semestral grade.';
  END IF;

  v_preview := public.preview_sg_score_correction(p_class_record_id, p_student_id, COALESCE(p_proposed_score_changes, '[]'::JSONB));
  v_canonical_changes := v_preview->'canonical_score_changes';
  v_computed := CASE WHEN jsonb_array_length(v_canonical_changes) > 0
    THEN NULLIF(v_preview->>'proposed_computed_grade', '')::NUMERIC
    ELSE v_posted.computed_grade END;
  v_base_effective := public.aspire_transmute_grade(v_computed);
  v_effective := CASE
    WHEN v_proposed_remark = 'fda' THEN 5.00
    WHEN v_proposed_remark = 'passed' THEN LEAST(v_base_effective, 3.00)
    ELSE v_base_effective END;

  IF v_proposed_remark = 'failed' AND v_effective <= 3.00 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A Failed proposal conflicts with the recalculated passing GWA.';
  END IF;
  IF p_proposed_computed_grade IS NOT NULL AND p_proposed_computed_grade IS DISTINCT FROM v_computed THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The proposed SG percentage is stale. Recalculate the score proposal and try again.';
  END IF;
  IF p_proposed_effective_grade IS NOT NULL AND p_proposed_effective_grade IS DISTINCT FROM v_effective THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The proposed effective GWA is stale. Recalculate the score proposal and try again.';
  END IF;
  -- A faculty request may ask only for one student-scoped correction window.
  -- Exact score deltas are selected after Dean approval and are still applied
  -- only by the atomic correction RPC below.

  SELECT
    COALESCE(subject.code || ' - ' || subject.name, subject.name, subject.code, 'Subject'),
    section.name,
    BTRIM(COALESCE(faculty.first_name, '') || ' ' || COALESCE(faculty.last_name, ''))
  INTO v_subject_name, v_section_name, v_faculty_name
  FROM public.class_records class_record
  LEFT JOIN public.subjects subject ON subject.subject_id = class_record.subject_id
  LEFT JOIN public.sections section ON section.section_id = class_record.section_id
  LEFT JOIN public.users faculty ON faculty.user_id = class_record.faculty_id
  WHERE class_record.class_record_id = p_class_record_id;

  INSERT INTO public.remark_override_requests (
    class_record_id, student_id, requested_by, requested_at,
    subject_name, section_name, faculty_name, posted_grade_id,
    computed_grade, effective_grade, current_remark, requested_remark,
    original_computed_grade, original_effective_grade, original_remark,
    proposed_computed_grade, proposed_effective_grade, proposed_remark,
    proposed_score_changes, correction_scope, note, evidence_url, status
  ) VALUES (
    p_class_record_id, p_student_id, v_actor, CURRENT_TIMESTAMP,
    v_subject_name, v_section_name, v_faculty_name, v_posted.posted_grade_id,
    v_posted.computed_grade, v_posted.effective_grade, v_posted.remarks::TEXT, v_proposed_remark,
    v_posted.computed_grade, v_posted.effective_grade, v_posted.remarks::TEXT,
    v_computed, v_effective, v_proposed_remark,
    v_canonical_changes, 'student_score_row', BTRIM(p_reason), NULLIF(BTRIM(COALESCE(p_evidence_url, '')), ''), 'pending'
  ) RETURNING request_id INTO v_request_id;

  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
  )
  SELECT
    dean.user_id,
    'override_request',
    'SG Correction Request',
    '/dean/remarkoverriderequests',
    'warning',
    FORMAT('%s requested one student-scoped SG correction in %s (%s).',
      COALESCE(NULLIF(v_faculty_name, ''), 'The assigned faculty'),
      COALESCE(v_subject_name, 'the class'), COALESCE(v_section_name, 'section')),
    jsonb_build_object(
      'request_id', v_request_id,
      'class_record_id', p_class_record_id,
      'student_id', p_student_id,
      'requested_remark', v_proposed_remark,
      'correction_scope', 'student_score_row'
    ),
    FORMAT('sg_correction_requested:%s:%s', v_request_id, dean.user_id),
    FALSE
  FROM public.class_records class_record
  JOIN public.subjects subject ON subject.subject_id = class_record.subject_id
  JOIN public.users dean ON dean.department_id = subject.department_id
    AND dean.role::TEXT = 'dean'
    AND dean.status::TEXT = 'active'
  WHERE class_record.class_record_id = p_class_record_id
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_notification_count = ROW_COUNT;
  IF v_notification_count = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'No active Dean is assigned to this subject department, so the correction request was not created.';
  END IF;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'posted_grade_id', v_posted.posted_grade_id,
    'status', 'pending',
    'original_computed_grade', v_posted.computed_grade,
    'original_effective_grade', v_posted.effective_grade,
    'original_remark', v_posted.remarks::TEXT,
    'proposed_computed_grade', v_computed,
    'proposed_effective_grade', v_effective,
    'proposed_remark', v_proposed_remark,
    'proposed_score_changes', v_canonical_changes,
    'correction_scope', 'student_score_row'
  );
END;
$$;

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
  v_preview JSONB;
  v_expected_computed NUMERIC;
  v_expected_effective NUMERIC;
BEGIN
  IF v_actor IS NULL OR v_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid authenticated review decision is required.';
  END IF;
  SELECT actor.department_id INTO v_dean_department
  FROM public.users actor
  WHERE actor.user_id = v_actor AND actor.role::TEXT = 'dean' AND actor.status::TEXT = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only an active Dean may review an SG correction request.';
  END IF;

  SELECT * INTO v_request FROM public.remark_override_requests
  WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Only a pending correction request may be reviewed.';
  END IF;
  SELECT subject.department_id INTO v_subject_department
  FROM public.class_records class_record
  JOIN public.subjects subject ON subject.subject_id = class_record.subject_id
  WHERE class_record.class_record_id = v_request.class_record_id;
  IF v_dean_department IS DISTINCT FROM v_subject_department THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This correction request is outside the Dean''s department.';
  END IF;

  IF v_decision = 'approved' THEN
    SELECT * INTO v_posted FROM public.posted_grades
    WHERE posted_grade_id = v_request.posted_grade_id FOR UPDATE;
    IF NOT FOUND OR v_posted.grade_period::TEXT <> 'semestral_grade'
      OR NOT COALESCE(v_posted.is_locked, TRUE)
      OR v_posted.computed_grade IS DISTINCT FROM v_request.original_computed_grade
      OR v_posted.effective_grade IS DISTINCT FROM v_request.original_effective_grade
      OR v_posted.remarks::TEXT IS DISTINCT FROM v_request.original_remark
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The official SG no longer matches the request baseline. Cancel it and submit a current proposal.';
    END IF;

    v_preview := public.preview_sg_score_correction(v_request.class_record_id, v_request.student_id, v_request.proposed_score_changes);
    IF (v_preview->'canonical_score_changes') IS DISTINCT FROM v_request.proposed_score_changes THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The proposed score basis changed before review. Reject this request and require a current proposal.';
    END IF;
    v_expected_computed := CASE WHEN jsonb_array_length(v_request.proposed_score_changes) > 0
      THEN NULLIF(v_preview->>'proposed_computed_grade', '')::NUMERIC
      ELSE v_request.original_computed_grade END;
    v_expected_effective := CASE
      WHEN v_request.proposed_remark = 'fda' THEN 5.00
      WHEN v_request.proposed_remark = 'passed' THEN LEAST(public.aspire_transmute_grade(v_expected_computed), 3.00)
      ELSE public.aspire_transmute_grade(v_expected_computed) END;
    IF v_request.proposed_computed_grade IS DISTINCT FROM v_expected_computed
      OR v_request.proposed_effective_grade IS DISTINCT FROM v_expected_effective
    THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The proposed SG result is stale. Reject this request and require a recalculated proposal.';
    END IF;
  END IF;

  UPDATE public.remark_override_requests SET
    status = v_decision,
    decision_by = v_actor,
    decision_at = CURRENT_TIMESTAMP,
    resolved_by = v_actor,
    resolved_at = CURRENT_TIMESTAMP,
    dean_note = NULLIF(BTRIM(COALESCE(p_dean_note, '')), '')
  WHERE request_id = p_request_id;

  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
  ) VALUES (
    v_request.requested_by,
    CASE WHEN v_decision = 'approved' THEN 'override_approved' ELSE 'override_rejected' END,
    CASE WHEN v_decision = 'approved' THEN 'SG Correction Approved' ELSE 'SG Correction Rejected' END,
    '/faculty/postedgrades',
    CASE WHEN v_decision = 'approved' THEN 'info' ELSE 'warning' END,
    CASE WHEN v_decision = 'approved'
      THEN FORMAT('Your student-scoped SG correction request for %s was approved. Open the class and use Edit Full Row & Apply.', COALESCE(v_request.subject_name, 'the class'))
      ELSE FORMAT('Your SG correction request for %s was rejected.%s',
        COALESCE(v_request.subject_name, 'the class'),
        CASE WHEN NULLIF(BTRIM(COALESCE(p_dean_note, '')), '') IS NULL
          THEN '' ELSE ' Dean note: ' || BTRIM(p_dean_note) END)
    END,
    jsonb_build_object(
      'request_id', p_request_id,
      'class_record_id', v_request.class_record_id,
      'student_id', v_request.student_id,
      'decision', v_decision,
      'dean_note', NULLIF(BTRIM(COALESCE(p_dean_note, '')), '')
    ),
    FORMAT('sg_correction_reviewed:%s:%s', p_request_id, v_decision),
    FALSE
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', v_decision,
    'faculty_id', v_request.requested_by,
    'student_id', v_request.student_id,
    'class_record_id', v_request.class_record_id,
    'proposed_remark', v_request.proposed_remark,
    'proposed_score_changes', v_request.proposed_score_changes,
    'official_grade_locked', TRUE
  );
END;
$$;

-- Score-bearing approvals can only be consumed by the dedicated correction RPC.
-- Remark-only legacy approvals remain compatible with the milestone posting RPC.
CREATE OR REPLACE FUNCTION public.enforce_sg_correction_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request public.remark_override_requests%ROWTYPE;
  v_context_request_id UUID;
BEGIN
  IF OLD.posted_grade_id IS DISTINCT FROM NEW.posted_grade_id
    OR OLD.class_record_id IS DISTINCT FROM NEW.class_record_id
    OR OLD.student_id IS DISTINCT FROM NEW.student_id
    OR OLD.grade_period IS DISTINCT FROM NEW.grade_period
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Posted-grade identity fields are immutable.';
  END IF;
  IF NEW.last_correction_request_id IS DISTINCT FROM OLD.last_correction_request_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Correction linkage is managed only by the SG correction workflow.';
  END IF;
  IF NEW.grade_period::TEXT <> 'semestral_grade' THEN RETURN NEW; END IF;

  BEGIN
    v_context_request_id := NULLIF(current_setting('aspire.sg_correction_request_id', TRUE), '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The SG correction transaction context is invalid.';
  END;

  IF v_context_request_id IS NOT NULL THEN
    IF COALESCE(current_setting('aspire.grade_posting_context', TRUE), '') <> 'correction' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The approved score correction must use the secured correction transaction.';
    END IF;
    SELECT * INTO v_request FROM public.remark_override_requests
    WHERE request_id = v_context_request_id
      AND posted_grade_id = OLD.posted_grade_id
      AND status = 'approved'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The correction transaction does not match an approved, unused request.';
    END IF;
  ELSE
    IF NOT (
      OLD.computed_grade IS DISTINCT FROM NEW.computed_grade
      OR OLD.effective_grade IS DISTINCT FROM NEW.effective_grade
      OR OLD.remarks IS DISTINCT FROM NEW.remarks
    ) THEN RETURN NEW; END IF;
    SELECT * INTO v_request FROM public.remark_override_requests
    WHERE posted_grade_id = OLD.posted_grade_id AND status = 'approved'
    ORDER BY decision_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An approved, unused SG correction request is required before changing this official grade.';
    END IF;
    IF jsonb_array_length(COALESCE(v_request.proposed_score_changes, '[]'::JSONB)) > 0 THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This approval changes locked scores and must use the dedicated Apply Approved Correction action.';
    END IF;
    IF v_request.correction_scope = 'student_score_row' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This student-scoped approval must use Edit Full Row & Apply; ordinary SG reposting cannot consume it.';
    END IF;
  END IF;

  IF NOT (
    public.is_active_admin()
    OR EXISTS (
      SELECT 1 FROM public.class_records class_record
      WHERE class_record.class_record_id = NEW.class_record_id AND class_record.faculty_id = v_actor
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the assigned faculty or an administrator may apply an approved SG correction.';
  END IF;
  IF NOT COALESCE(NEW.is_locked, FALSE) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected SG must remain locked in the correction transaction.';
  END IF;
  IF NEW.computed_grade IS DISTINCT FROM COALESCE(v_request.proposed_computed_grade, v_request.original_computed_grade)
    OR NEW.effective_grade IS DISTINCT FROM COALESCE(v_request.proposed_effective_grade, v_request.original_effective_grade)
    OR NEW.remarks::TEXT IS DISTINCT FROM COALESCE(v_request.proposed_remark, v_request.original_remark)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected SG result differs from the exact Dean-approved proposal.';
  END IF;

  NEW.last_correction_request_id := v_request.request_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_applied_sg_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_score_changes JSONB := '[]'::JSONB;
BEGIN
  IF NEW.last_correction_request_id IS NULL
    OR NEW.last_correction_request_id IS NOT DISTINCT FROM OLD.last_correction_request_id
  THEN RETURN NEW; END IF;

  UPDATE public.remark_override_requests SET
    status = 'applied', applied_by = v_actor, applied_at = CURRENT_TIMESTAMP,
    final_computed_grade = NEW.computed_grade,
    final_effective_grade = NEW.effective_grade,
    final_remark = NEW.remarks::TEXT,
    applied_posted_grade_id = NEW.posted_grade_id
  WHERE request_id = NEW.last_correction_request_id AND status = 'approved'
  RETURNING proposed_score_changes INTO v_score_changes;

  IF FOUND THEN
    INSERT INTO public.grade_correction_history (
      request_id, posted_grade_id, class_record_id, student_id,
      previous_computed_grade, previous_effective_grade, previous_remark,
      final_computed_grade, final_effective_grade, final_remark,
      applied_score_changes, applied_by, applied_at
    ) VALUES (
      NEW.last_correction_request_id, NEW.posted_grade_id, NEW.class_record_id, NEW.student_id,
      OLD.computed_grade, OLD.effective_grade, OLD.remarks::TEXT,
      NEW.computed_grade, NEW.effective_grade, NEW.remarks::TEXT,
      COALESCE(v_score_changes, '[]'::JSONB), v_actor, CURRENT_TIMESTAMP
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_approved_sg_correction_v2(
  p_operation_id UUID,
  p_request_id UUID,
  p_score_changes JSONB DEFAULT '[]'::JSONB,
  p_proposed_remark TEXT DEFAULT NULL
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
  v_class public.class_records%ROWTYPE;
  v_operation public.sg_correction_operations%ROWTYPE;
  v_canonical_changes JSONB;
  v_projection JSONB;
  v_computed NUMERIC;
  v_effective NUMERIC;
  v_final_remark TEXT;
  v_revision INTEGER;
  v_result JSONB;
  v_request_hash TEXT;
  v_subject_label TEXT;
  v_subject_code TEXT;
  v_subject_name TEXT;
  v_student_name TEXT;
BEGIN
  IF v_actor IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An authenticated correction operation is required.';
  END IF;
  v_request_hash := md5(jsonb_build_object(
    'request_id', p_request_id,
    'score_changes', COALESCE(p_score_changes, '[]'::JSONB),
    'proposed_remark', lower(BTRIM(COALESCE(p_proposed_remark, '')))
  )::TEXT);
  PERFORM pg_advisory_xact_lock(hashtextextended('sg-correction:' || p_operation_id::TEXT, 0));
  SELECT * INTO v_operation FROM public.sg_correction_operations WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_operation.actor_id IS DISTINCT FROM v_actor
      OR v_operation.request_id IS DISTINCT FROM p_request_id
      OR v_operation.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'This operation ID is already bound to a different SG correction.';
    END IF;
    RETURN v_operation.result;
  END IF;

  SELECT * INTO v_request FROM public.remark_override_requests
  WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'approved' OR v_request.correction_scope <> 'student_score_row' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Only an approved, unused student-row correction may be applied here.';
  END IF;
  SELECT * INTO v_class FROM public.class_records
  WHERE class_record_id = v_request.class_record_id FOR UPDATE;
  IF NOT FOUND OR v_class.faculty_id IS DISTINCT FROM v_actor OR NOT EXISTS (
    SELECT 1 FROM public.users actor
    WHERE actor.user_id = v_actor AND actor.role::TEXT = 'faculty' AND actor.status::TEXT = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the active faculty assigned to this class may apply its approved correction.';
  END IF;
  SELECT * INTO v_posted FROM public.posted_grades
  WHERE posted_grade_id = v_request.posted_grade_id FOR UPDATE;
  IF NOT FOUND OR v_posted.grade_period::TEXT <> 'semestral_grade'
    OR NOT COALESCE(v_posted.is_locked, TRUE)
    OR v_posted.computed_grade IS DISTINCT FROM v_request.original_computed_grade
    OR v_posted.effective_grade IS DISTINCT FROM v_request.original_effective_grade
    OR v_posted.remarks::TEXT IS DISTINCT FROM v_request.original_remark
  THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'The official SG changed after approval. The correction was not applied.';
  END IF;

  PERFORM set_config('aspire.grade_posting_context', 'correction', TRUE);
  PERFORM set_config('aspire.sg_correction_request_id', p_request_id::TEXT, TRUE);
  v_canonical_changes := public.aspire_apply_sg_score_changes(
    v_request.class_record_id, v_request.student_id, COALESCE(p_score_changes, '[]'::JSONB)
  );

  v_projection := public.aspire_calculate_student_grade(v_request.class_record_id, v_request.student_id);
  IF NOT COALESCE((v_projection->>'ok')::BOOLEAN, FALSE)
    OR NOT COALESCE((v_projection->>'sg_complete')::BOOLEAN, FALSE)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = COALESCE(v_projection->>'error', 'The corrected score basis does not produce a complete SG.');
  END IF;
  v_computed := CASE WHEN jsonb_array_length(v_canonical_changes) > 0
    THEN NULLIF(v_projection->>'sg', '')::NUMERIC
    ELSE v_request.original_computed_grade END;
  v_final_remark := lower(BTRIM(COALESCE(v_request.proposed_remark, v_request.original_remark)));
  IF v_final_remark NOT IN ('passed', 'failed', 'incomplete', 'fda', 'dropped') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Select a valid final academic remark.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_proposed_remark, '')), '') IS NOT NULL
    AND lower(BTRIM(p_proposed_remark)) IS DISTINCT FROM v_final_remark
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'The final academic status must match the outcome reviewed and approved by the Dean.';
  END IF;
  v_effective := CASE
    WHEN v_final_remark = 'fda' THEN 5.00
    WHEN v_final_remark = 'passed' THEN LEAST(public.aspire_transmute_grade(v_computed), 3.00)
    ELSE public.aspire_transmute_grade(v_computed) END;
  IF v_final_remark = 'failed' AND v_effective <= 3.00 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A Failed result conflicts with the recalculated passing GWA.';
  END IF;
  IF jsonb_array_length(v_canonical_changes) = 0
    AND v_computed IS NOT DISTINCT FROM v_posted.computed_grade
    AND v_effective IS NOT DISTINCT FROM v_posted.effective_grade
    AND v_final_remark IS NOT DISTINCT FROM v_posted.remarks::TEXT
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The approved correction must change at least one score or official SG value.';
  END IF;

  -- Freeze the faculty's exact post-approval edit set into the approved request
  -- before the official row is changed. The request and immutable history then
  -- preserve precisely what was applied under the Dean's one-use permission.
  UPDATE public.remark_override_requests SET
    proposed_score_changes = v_canonical_changes,
    proposed_computed_grade = v_computed,
    proposed_effective_grade = v_effective,
    proposed_remark = v_final_remark,
    requested_remark = v_final_remark
  WHERE request_id = p_request_id AND status = 'approved';

  UPDATE public.posted_grades SET
    computed_grade = v_computed,
    effective_grade = v_effective,
    remarks = v_final_remark::public.grade_remarks,
    remarks_note = v_request.note,
    remarks_set_by = v_actor,
    remarks_set_at = CURRENT_TIMESTAMP,
    posted_by = v_actor,
    posted_at = CURRENT_TIMESTAMP,
    is_locked = TRUE,
    official_source = 'dean_correction',
    calculation_engine_version = v_projection->>'calculation_engine_version',
    input_snapshot_hash = v_projection->>'input_snapshot_hash'
  WHERE posted_grade_id = v_posted.posted_grade_id
  RETURNING official_revision INTO v_revision;

  SELECT
    COALESCE(subject.code || ' - ' || subject.name, subject.code, subject.name, 'your class'),
    subject.code,
    subject.name
  INTO v_subject_label, v_subject_code, v_subject_name
  FROM public.subjects subject
  WHERE subject.subject_id = v_class.subject_id;
  SELECT BTRIM(COALESCE(student.last_name, '') || ', ' || COALESCE(student.first_name, ''))
  INTO v_student_name
  FROM public.users student
  WHERE student.user_id = v_request.student_id;
  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
  ) VALUES (
    v_request.student_id, 'grade_changed', 'Official Grade Updated', '/student/grades', 'warning',
    FORMAT('Your corrected official grade for %s has been posted.', v_subject_label),
    jsonb_build_object('class_record_id', v_request.class_record_id, 'grade_period', 'semestral_grade',
      'computed_grade', v_computed, 'effective_grade', v_effective, 'remarks', v_final_remark,
      'subject_code', v_subject_code, 'subject_name', v_subject_name, 'term', 'Semestral Grade',
      'rating', v_computed, 'gwa', v_effective, 'remark', v_final_remark,
      'student_name', NULLIF(v_student_name, ', '), 'source', 'dean_correction'),
    FORMAT('grade_changed:%s:semestral_grade:%s:request:%s', v_request.class_record_id, v_request.student_id, p_request_id),
    FALSE
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  IF v_request.decision_by IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      v_request.decision_by, 'override_approved', 'Approved SG Correction Applied',
      '/dean/remarkoverriderequests', 'info',
      FORMAT('The approved SG correction for %s was applied and the official row remains locked.', v_subject_label),
      jsonb_build_object('request_id', p_request_id, 'class_record_id', v_request.class_record_id,
        'student_id', v_request.student_id, 'final_remark', v_final_remark),
      FORMAT('sg_correction_applied:%s', p_request_id), FALSE
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  v_result := jsonb_build_object(
    'operation_id', p_operation_id,
    'request_id', p_request_id,
    'posted_grade_id', v_posted.posted_grade_id,
    'student_id', v_request.student_id,
    'class_record_id', v_request.class_record_id,
    'computed_grade', v_computed,
    'effective_grade', v_effective,
    'remarks', v_final_remark,
    'official_revision', v_revision,
    'applied_score_changes', v_canonical_changes,
    'status', 'applied'
  );
  INSERT INTO public.sg_correction_operations (
    operation_id, request_id, posted_grade_id, actor_id, request_hash, status, result
  ) VALUES (
    p_operation_id, p_request_id, v_posted.posted_grade_id, v_actor, v_request_hash, 'committed', v_result
  );
  RETURN v_result;
END;
$$;

-- Administrative overrides replace the complete official SG result. The GWA
-- and remark must remain coherent with the replacement SG percentage.
CREATE OR REPLACE FUNCTION public.apply_admin_grade_override_v3(
  p_operation_id UUID,
  p_posted_grade_id UUID,
  p_new_computed_grade NUMERIC,
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
  v_operation public.admin_grade_override_operations%ROWTYPE;
  v_request_id UUID;
  v_new_remark TEXT := lower(BTRIM(COALESCE(p_new_remarks, '')));
  v_expected_effective NUMERIC;
  v_request_hash TEXT;
  v_result JSONB;
  v_faculty_id UUID;
  v_subject_code TEXT;
  v_subject_name TEXT;
  v_student_name TEXT;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only an administrator may apply a grade override.';
  END IF;
  IF p_operation_id IS NULL OR p_new_computed_grade IS NULL
    OR p_new_computed_grade < 0 OR p_new_computed_grade > 100
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A replacement SG percentage from 0 to 100 is required.';
  END IF;
  IF p_new_effective_grade IS NULL
    OR p_new_effective_grade NOT IN (1.00,1.25,1.50,1.75,2.00,2.25,2.50,2.75,3.00,5.00)
    OR v_new_remark NOT IN ('passed', 'failed', 'incomplete', 'fda', 'dropped')
    OR NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A valid GWA, academic status, and override reason are required.';
  END IF;
  v_expected_effective := CASE
    WHEN v_new_remark = 'fda' THEN 5.00
    WHEN v_new_remark = 'passed' THEN LEAST(public.aspire_transmute_grade(p_new_computed_grade), 3.00)
    ELSE public.aspire_transmute_grade(p_new_computed_grade) END;
  IF p_new_effective_grade IS DISTINCT FROM v_expected_effective
    OR (v_new_remark = 'failed' AND p_new_effective_grade <= 3.00)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The replacement SG, GWA, and academic status are not mutually consistent.';
  END IF;

  v_request_hash := md5(jsonb_build_object(
    'posted_grade_id', p_posted_grade_id,
    'new_computed_grade', p_new_computed_grade,
    'new_effective_grade', p_new_effective_grade,
    'new_remarks', v_new_remark,
    'reason', BTRIM(p_reason)
  )::TEXT);
  PERFORM pg_advisory_xact_lock(hashtextextended('admin-grade-override:' || p_operation_id::TEXT, 0));
  SELECT * INTO v_operation FROM public.admin_grade_override_operations
  WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_operation.actor_id IS DISTINCT FROM v_actor
      OR v_operation.posted_grade_id IS DISTINCT FROM p_posted_grade_id
      OR v_operation.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'This operation ID is already bound to a different administrative override.';
    END IF;
    RETURN v_operation.result;
  END IF;

  SELECT * INTO v_old FROM public.posted_grades
  WHERE posted_grade_id = p_posted_grade_id FOR UPDATE;
  IF NOT FOUND OR v_old.grade_period::TEXT <> 'semestral_grade' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Only an existing Semestral Grade may be overridden.';
  END IF;
  IF v_old.computed_grade IS NOT DISTINCT FROM p_new_computed_grade
    AND v_old.effective_grade IS NOT DISTINCT FROM p_new_effective_grade
    AND v_old.remarks::TEXT IS NOT DISTINCT FROM v_new_remark
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The administrative override must change an official SG value.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.remark_override_requests
    WHERE posted_grade_id = p_posted_grade_id AND status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Resolve the open SG correction request before applying an administrative override.';
  END IF;

  INSERT INTO public.remark_override_requests (
    class_record_id, student_id, posted_grade_id, requested_by, requested_at,
    computed_grade, effective_grade, current_remark, requested_remark, note,
    original_computed_grade, original_effective_grade, original_remark,
    proposed_computed_grade, proposed_effective_grade, proposed_remark,
    proposed_score_changes, correction_scope, status, decision_by, decision_at, resolved_by, resolved_at
  ) VALUES (
    v_old.class_record_id, v_old.student_id, p_posted_grade_id, v_actor, CURRENT_TIMESTAMP,
    v_old.computed_grade, v_old.effective_grade, v_old.remarks::TEXT, v_new_remark, BTRIM(p_reason),
    v_old.computed_grade, v_old.effective_grade, v_old.remarks::TEXT,
    p_new_computed_grade, p_new_effective_grade, v_new_remark,
    '[]'::JSONB, 'admin_override', 'approved', v_actor, CURRENT_TIMESTAMP, v_actor, CURRENT_TIMESTAMP
  ) RETURNING request_id INTO v_request_id;

  PERFORM set_config('aspire.grade_posting_context', 'admin_override', TRUE);
  UPDATE public.posted_grades SET
    computed_grade = p_new_computed_grade,
    effective_grade = p_new_effective_grade,
    remarks = v_new_remark::public.grade_remarks,
    remarks_note = BTRIM(p_reason),
    override_at = CURRENT_TIMESTAMP,
    override_by = v_actor,
    remarks_set_at = CURRENT_TIMESTAMP,
    remarks_set_by = v_actor,
    official_source = 'admin_override',
    calculation_engine_version = 'admin-override-v3',
    input_snapshot_hash = COALESCE(input_snapshot_hash, public.aspire_grade_input_hash(v_old.class_record_id, v_old.student_id)),
    is_locked = TRUE
  WHERE posted_grade_id = p_posted_grade_id;

  SELECT
    class_record.faculty_id,
    subject.code,
    subject.name
  INTO v_faculty_id, v_subject_code, v_subject_name
  FROM public.class_records class_record
  JOIN public.subjects subject ON subject.subject_id = class_record.subject_id
  WHERE class_record.class_record_id = v_old.class_record_id;
  SELECT BTRIM(COALESCE(student.last_name, '') || ', ' || COALESCE(student.first_name, ''))
  INTO v_student_name
  FROM public.users student
  WHERE student.user_id = v_old.student_id;

  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
  ) VALUES (
    v_old.student_id, 'grade_changed', 'Official Grade Updated', '/student/grades', 'warning',
    'An administrator updated your official semestral grade. Review the record and contact your school if you have questions.',
    jsonb_build_object('posted_grade_id', p_posted_grade_id, 'class_record_id', v_old.class_record_id,
      'computed_grade', p_new_computed_grade, 'effective_grade', p_new_effective_grade,
      'remarks', v_new_remark, 'request_id', v_request_id,
      'subject_code', v_subject_code, 'subject_name', v_subject_name, 'term', 'Semestral Grade',
      'rating', p_new_computed_grade, 'gwa', p_new_effective_grade, 'remark', v_new_remark,
      'student_name', NULLIF(v_student_name, ', '), 'source', 'admin_override'),
    FORMAT('grade_changed:%s:semestral_grade:%s:admin:%s', v_old.class_record_id, v_old.student_id, v_request_id),
    FALSE
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  IF v_faculty_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      v_faculty_id, 'compliance', 'Administrative Grade Override',
      '/faculty/postedgrades', 'warning',
      'An administrator replaced the official SG percentage, GWA, or status in one of your classes. Review the audited official record.',
      jsonb_build_object('posted_grade_id', p_posted_grade_id, 'class_record_id', v_old.class_record_id,
        'student_id', v_old.student_id, 'request_id', v_request_id,
        'computed_grade', p_new_computed_grade, 'effective_grade', p_new_effective_grade, 'remarks', v_new_remark),
      FORMAT('grade_changed:%s:semestral_grade:%s:admin-faculty:%s', v_old.class_record_id, v_old.student_id, v_request_id),
      FALSE
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  v_result := jsonb_build_object(
    'operation_id', p_operation_id,
    'posted_grade_id', p_posted_grade_id,
    'request_id', v_request_id,
    'previous_computed_grade', v_old.computed_grade,
    'previous_effective_grade', v_old.effective_grade,
    'previous_remark', v_old.remarks::TEXT,
    'new_computed_grade', p_new_computed_grade,
    'new_effective_grade', p_new_effective_grade,
    'new_remark', v_new_remark
  );
  INSERT INTO public.admin_grade_override_operations (
    operation_id, posted_grade_id, actor_id, request_hash, status, result
  ) VALUES (
    p_operation_id, p_posted_grade_id, v_actor, v_request_hash, 'committed', v_result
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_apply_sg_score_changes(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_sg_score_correction(UUID, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_sg_correction_request(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_sg_correction_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_approved_sg_correction_v2(UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_admin_grade_override_v3(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_sg_score_correction(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_sg_correction_request(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_sg_correction_request(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_approved_sg_correction_v2(UUID, UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_admin_grade_override_v3(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;

COMMIT;
