-- =============================================================================
-- ASPIRE CORRECTED-MILESTONE CONSISTENCY
-- =============================================================================
-- A Dean-approved student-row correction changes the score basis used by MR,
-- TFR, and SG. Keep all three official milestone rows consistent in the same
-- secured transaction, while ordinary post-SG edits remain blocked.

BEGIN;

ALTER TABLE public.grade_correction_history
  ADD COLUMN IF NOT EXISTS applied_milestone_changes JSONB NOT NULL DEFAULT '{}'::JSONB;

-- Revision numbering must also advance when an official row is linked to the
-- correction that produced it. correction_repair is migration-only and is not
-- exposed through an authenticated RPC.
CREATE OR REPLACE FUNCTION public.advance_posted_grade_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_context TEXT := COALESCE(current_setting('aspire.grade_posting_context', TRUE), '');
BEGIN
  IF (
      OLD.computed_grade IS DISTINCT FROM NEW.computed_grade
      OR OLD.effective_grade IS DISTINCT FROM NEW.effective_grade
      OR OLD.remarks IS DISTINCT FROM NEW.remarks
    ) AND v_context NOT IN ('posting', 'correction', 'correction_repair', 'admin_override')
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Official grade values are managed only by secured posting or override operations.';
  END IF;
  IF (
      OLD.official_source IS DISTINCT FROM NEW.official_source
      OR OLD.calculation_engine_version IS DISTINCT FROM NEW.calculation_engine_version
      OR OLD.input_snapshot_hash IS DISTINCT FROM NEW.input_snapshot_hash
    ) AND v_context NOT IN ('posting', 'correction', 'correction_repair', 'admin_override')
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Official grade provenance is managed only by secured posting operations.';
  END IF;
  IF OLD.computed_grade IS DISTINCT FROM NEW.computed_grade
    OR OLD.effective_grade IS DISTINCT FROM NEW.effective_grade
    OR OLD.remarks IS DISTINCT FROM NEW.remarks
    OR OLD.official_source IS DISTINCT FROM NEW.official_source
    OR OLD.calculation_engine_version IS DISTINCT FROM NEW.calculation_engine_version
    OR OLD.input_snapshot_hash IS DISTINCT FROM NEW.input_snapshot_hash
    OR OLD.last_correction_request_id IS DISTINCT FROM NEW.last_correction_request_id
  THEN
    NEW.official_revision := OLD.official_revision + 1;
  ELSE
    NEW.official_revision := OLD.official_revision;
  END IF;
  RETURN NEW;
END;
$$;

-- Extend the existing SG guard so one approved student-row correction may
-- revise its derived MR/TFR rows. The SG remains the only row that consumes
-- the approval and validates the exact final official result.
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
  v_context TEXT := COALESCE(current_setting('aspire.grade_posting_context', TRUE), '');
  v_projection JSONB;
  v_expected_computed NUMERIC;
  v_expected_remark TEXT;
BEGIN
  IF OLD.posted_grade_id IS DISTINCT FROM NEW.posted_grade_id
    OR OLD.class_record_id IS DISTINCT FROM NEW.class_record_id
    OR OLD.student_id IS DISTINCT FROM NEW.student_id
    OR OLD.grade_period IS DISTINCT FROM NEW.grade_period
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Posted-grade identity fields are immutable.';
  END IF;

  BEGIN
    v_context_request_id := NULLIF(current_setting('aspire.sg_correction_request_id', TRUE), '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The SG correction transaction context is invalid.';
  END;

  IF v_context_request_id IS NOT NULL THEN
    IF v_context NOT IN ('correction', 'correction_repair') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The approved score correction must use the secured correction transaction.';
    END IF;

    SELECT * INTO v_request
    FROM public.remark_override_requests request
    WHERE request.request_id = v_context_request_id
      AND request.class_record_id = OLD.class_record_id
      AND request.student_id = OLD.student_id
      AND request.correction_scope = 'student_score_row'
      AND (
        (v_context = 'correction' AND request.status = 'approved')
        OR (v_context = 'correction_repair' AND request.status = 'applied')
      )
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The correction transaction does not match an authorized student-row request.';
    END IF;
    IF OLD.grade_period::TEXT = 'semestral_grade'
      AND v_request.posted_grade_id IS DISTINCT FROM OLD.posted_grade_id
    THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The correction request does not belong to this official SG.';
    END IF;
    IF NEW.last_correction_request_id IS NOT NULL
      AND NEW.last_correction_request_id IS DISTINCT FROM v_request.request_id
    THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The official revision is linked to a different correction request.';
    END IF;
    IF v_context = 'correction' AND NOT (
      public.is_active_admin()
      OR EXISTS (
        SELECT 1 FROM public.class_records class_record
        WHERE class_record.class_record_id = NEW.class_record_id
          AND class_record.faculty_id = v_actor
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the assigned faculty or an administrator may apply an approved SG correction.';
    END IF;
    IF v_context = 'correction_repair' AND v_actor IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Correction repair is reserved for the migration transaction.';
    END IF;
    IF NOT COALESCE(NEW.is_locked, FALSE) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Corrected official milestones must remain locked.';
    END IF;

    IF NEW.grade_period::TEXT IN ('midterm_rating', 'tentative_final_rating') THEN
      v_projection := public.aspire_calculate_student_grade(NEW.class_record_id, NEW.student_id);
      IF NOT COALESCE((v_projection->>'ok')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = COALESCE(v_projection->>'error', 'The corrected milestone could not be recalculated.');
      END IF;
      v_expected_computed := CASE NEW.grade_period::TEXT
        WHEN 'midterm_rating' THEN NULLIF(v_projection->>'mr', '')::NUMERIC
        ELSE NULLIF(v_projection->>'tfr', '')::NUMERIC
      END;
      v_expected_remark := CASE
        WHEN public.aspire_transmute_grade(v_expected_computed) <= 3.00 THEN 'passed'
        ELSE 'failed'
      END;
      IF NEW.computed_grade IS DISTINCT FROM v_expected_computed
        OR NEW.effective_grade IS NOT NULL
        OR NEW.remarks::TEXT IS DISTINCT FROM v_expected_remark
      THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected progress milestone differs from the server-calculated score basis.';
      END IF;
    ELSE
      IF NEW.grade_period::TEXT <> 'semestral_grade' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'This correction may revise only MR, TFR, and SG milestones.';
      END IF;
      IF v_context = 'correction' AND (
        NEW.computed_grade IS DISTINCT FROM COALESCE(v_request.proposed_computed_grade, v_request.original_computed_grade)
        OR NEW.effective_grade IS DISTINCT FROM COALESCE(v_request.proposed_effective_grade, v_request.original_effective_grade)
        OR NEW.remarks::TEXT IS DISTINCT FROM COALESCE(v_request.proposed_remark, v_request.original_remark)
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected SG result differs from the exact Dean-approved proposal.';
      END IF;
    END IF;

    NEW.last_correction_request_id := v_request.request_id;
    RETURN NEW;
  END IF;

  IF NEW.last_correction_request_id IS DISTINCT FROM OLD.last_correction_request_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Correction linkage is managed only by the SG correction workflow.';
  END IF;
  IF NEW.grade_period::TEXT <> 'semestral_grade' THEN RETURN NEW; END IF;

  IF NOT (
    OLD.computed_grade IS DISTINCT FROM NEW.computed_grade
    OR OLD.effective_grade IS DISTINCT FROM NEW.effective_grade
    OR OLD.remarks IS DISTINCT FROM NEW.remarks
  ) THEN RETURN NEW; END IF;

  SELECT * INTO v_request
  FROM public.remark_override_requests request
  WHERE request.posted_grade_id = OLD.posted_grade_id
    AND request.status = 'approved'
  ORDER BY request.decision_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An approved, unused SG correction request is required before changing this official grade.';
  END IF;
  IF jsonb_array_length(COALESCE(v_request.proposed_score_changes, '[]'::JSONB)) > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This approval changes locked scores and must use the dedicated Apply Approved Correction action.';
  END IF;
  IF v_request.correction_scope = 'student_score_row' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This student-scoped approval must use Edit Full Row & Apply; ordinary SG reposting cannot consume it.';
  END IF;
  IF NOT (
    public.is_active_admin()
    OR EXISTS (
      SELECT 1 FROM public.class_records class_record
      WHERE class_record.class_record_id = NEW.class_record_id
        AND class_record.faculty_id = v_actor
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

-- Synchronize the two progress milestones from the same server projection used
-- by SG. This helper is private and runs only inside an authorized correction.
CREATE OR REPLACE FUNCTION public.aspire_sync_corrected_progress_milestones(
  p_request_id UUID,
  p_projection JSONB,
  p_actor UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.remark_override_requests%ROWTYPE;
  v_class public.class_records%ROWTYPE;
  v_mr_old public.posted_grades%ROWTYPE;
  v_tfr_old public.posted_grades%ROWTYPE;
  v_mr_exists BOOLEAN := FALSE;
  v_tfr_exists BOOLEAN := FALSE;
  v_mr NUMERIC;
  v_tfr NUMERIC;
  v_mr_remark TEXT;
  v_tfr_remark TEXT;
  v_mr_locks VARCHAR[];
  v_tfr_locks VARCHAR[];
  v_recorded_by UUID;
BEGIN
  SELECT * INTO v_request
  FROM public.remark_override_requests request
  WHERE request.request_id = p_request_id
    AND request.correction_scope = 'student_score_row'
    AND request.status IN ('approved', 'applied');
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A student-row correction request is required to synchronize progress milestones.';
  END IF;
  SELECT * INTO v_class
  FROM public.class_records class_record
  WHERE class_record.class_record_id = v_request.class_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The correction class record no longer exists.';
  END IF;
  IF NOT COALESCE((p_projection->>'ok')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = COALESCE(p_projection->>'error', 'The corrected grade projection is invalid.');
  END IF;

  v_mr := NULLIF(p_projection->>'mr', '')::NUMERIC;
  v_tfr := NULLIF(p_projection->>'tfr', '')::NUMERIC;
  IF v_mr IS NULL OR v_tfr IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected score basis must produce both MR and TFR.';
  END IF;
  v_mr_remark := CASE WHEN public.aspire_transmute_grade(v_mr) <= 3.00 THEN 'passed' ELSE 'failed' END;
  v_tfr_remark := CASE WHEN public.aspire_transmute_grade(v_tfr) <= 3.00 THEN 'passed' ELSE 'failed' END;
  v_recorded_by := COALESCE(p_actor, v_request.applied_by, v_request.requested_by);
  v_mr_locks := CASE WHEN lower(COALESCE(v_class.semester::TEXT, '')) LIKE '%summer%'
    THEN ARRAY['Midterm', 'Midterm Rating']::VARCHAR[]
    ELSE ARRAY['Prelim', 'Midterm', 'Midterm Rating']::VARCHAR[] END;
  v_tfr_locks := CASE WHEN lower(COALESCE(v_class.semester::TEXT, '')) LIKE '%summer%'
    THEN ARRAY['Final', 'Tentative Final Rating']::VARCHAR[]
    ELSE ARRAY['Semi-Final', 'Final', 'Tentative Final Rating']::VARCHAR[] END;

  SELECT * INTO v_mr_old
  FROM public.posted_grades grade
  WHERE grade.class_record_id = v_request.class_record_id
    AND grade.student_id = v_request.student_id
    AND grade.grade_period::TEXT = 'midterm_rating'
  FOR UPDATE;
  v_mr_exists := FOUND;
  SELECT * INTO v_tfr_old
  FROM public.posted_grades grade
  WHERE grade.class_record_id = v_request.class_record_id
    AND grade.student_id = v_request.student_id
    AND grade.grade_period::TEXT = 'tentative_final_rating'
  FOR UPDATE;
  v_tfr_exists := FOUND;

  INSERT INTO public.posted_grades (
    posted_grade_id, class_record_id, student_id, grade_period,
    computed_grade, effective_grade, remarks, remarks_note,
    remarks_set_by, remarks_set_at, posted_by, posted_at, is_locked,
    locked_milestones, grading_formula_snapshot, official_source,
    calculation_engine_version, input_snapshot_hash, last_correction_request_id
  ) VALUES (
    gen_random_uuid(), v_request.class_record_id, v_request.student_id, 'midterm_rating',
    v_mr, NULL, v_mr_remark::public.grade_remarks, v_request.note,
    v_recorded_by, CURRENT_TIMESTAMP, v_recorded_by, CURRENT_TIMESTAMP, TRUE,
    v_mr_locks, v_class.grading_formula_snapshot, 'dean_correction',
    p_projection->>'calculation_engine_version', p_projection->>'input_snapshot_hash', p_request_id
  ) ON CONFLICT (class_record_id, grade_period, student_id) DO UPDATE SET
    computed_grade = EXCLUDED.computed_grade,
    effective_grade = NULL,
    remarks = EXCLUDED.remarks,
    remarks_note = EXCLUDED.remarks_note,
    remarks_set_by = EXCLUDED.remarks_set_by,
    remarks_set_at = CURRENT_TIMESTAMP,
    posted_by = EXCLUDED.posted_by,
    posted_at = CURRENT_TIMESTAMP,
    is_locked = TRUE,
    locked_milestones = EXCLUDED.locked_milestones,
    grading_formula_snapshot = EXCLUDED.grading_formula_snapshot,
    official_source = 'dean_correction',
    calculation_engine_version = EXCLUDED.calculation_engine_version,
    input_snapshot_hash = EXCLUDED.input_snapshot_hash,
    last_correction_request_id = p_request_id;

  INSERT INTO public.posted_grades (
    posted_grade_id, class_record_id, student_id, grade_period,
    computed_grade, effective_grade, remarks, remarks_note,
    remarks_set_by, remarks_set_at, posted_by, posted_at, is_locked,
    locked_milestones, grading_formula_snapshot, official_source,
    calculation_engine_version, input_snapshot_hash, last_correction_request_id
  ) VALUES (
    gen_random_uuid(), v_request.class_record_id, v_request.student_id, 'tentative_final_rating',
    v_tfr, NULL, v_tfr_remark::public.grade_remarks, v_request.note,
    v_recorded_by, CURRENT_TIMESTAMP, v_recorded_by, CURRENT_TIMESTAMP, TRUE,
    v_tfr_locks, v_class.grading_formula_snapshot, 'dean_correction',
    p_projection->>'calculation_engine_version', p_projection->>'input_snapshot_hash', p_request_id
  ) ON CONFLICT (class_record_id, grade_period, student_id) DO UPDATE SET
    computed_grade = EXCLUDED.computed_grade,
    effective_grade = NULL,
    remarks = EXCLUDED.remarks,
    remarks_note = EXCLUDED.remarks_note,
    remarks_set_by = EXCLUDED.remarks_set_by,
    remarks_set_at = CURRENT_TIMESTAMP,
    posted_by = EXCLUDED.posted_by,
    posted_at = CURRENT_TIMESTAMP,
    is_locked = TRUE,
    locked_milestones = EXCLUDED.locked_milestones,
    grading_formula_snapshot = EXCLUDED.grading_formula_snapshot,
    official_source = 'dean_correction',
    calculation_engine_version = EXCLUDED.calculation_engine_version,
    input_snapshot_hash = EXCLUDED.input_snapshot_hash,
    last_correction_request_id = p_request_id;

  RETURN jsonb_build_object(
    'midterm_rating', jsonb_build_object(
      'operation', CASE WHEN v_mr_exists THEN 'updated' ELSE 'inserted' END,
      'before', CASE WHEN v_mr_exists THEN v_mr_old.computed_grade ELSE NULL END,
      'after', v_mr
    ),
    'tentative_final_rating', jsonb_build_object(
      'operation', CASE WHEN v_tfr_exists THEN 'updated' ELSE 'inserted' END,
      'before', CASE WHEN v_tfr_exists THEN v_tfr_old.computed_grade ELSE NULL END,
      'after', v_tfr
    )
  );
END;
$$;

-- Only the SG update consumes the one-use request. MR/TFR revisions are linked
-- to it but cannot mark it applied before the final official write succeeds.
CREATE OR REPLACE FUNCTION public.record_applied_sg_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_score_changes JSONB := '[]'::JSONB;
  v_milestone_changes JSONB := '{}'::JSONB;
BEGIN
  IF NEW.grade_period::TEXT <> 'semestral_grade'
    OR NEW.last_correction_request_id IS NULL
    OR NEW.last_correction_request_id IS NOT DISTINCT FROM OLD.last_correction_request_id
  THEN RETURN NEW; END IF;

  BEGIN
    v_milestone_changes := COALESCE(
      NULLIF(current_setting('aspire.sg_correction_milestone_changes', TRUE), '')::JSONB,
      '{}'::JSONB
    );
  EXCEPTION WHEN invalid_text_representation THEN
    v_milestone_changes := '{}'::JSONB;
  END;

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
      applied_score_changes, applied_milestone_changes, applied_by, applied_at
    ) VALUES (
      NEW.last_correction_request_id, NEW.posted_grade_id, NEW.class_record_id, NEW.student_id,
      OLD.computed_grade, OLD.effective_grade, OLD.remarks::TEXT,
      NEW.computed_grade, NEW.effective_grade, NEW.remarks::TEXT,
      COALESCE(v_score_changes, '[]'::JSONB), v_milestone_changes,
      COALESCE(v_actor, NEW.remarks_set_by, NEW.posted_by), CURRENT_TIMESTAMP
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
  v_milestone_changes JSONB;
  v_projection JSONB;
  v_mr NUMERIC;
  v_tfr NUMERIC;
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

  -- Serialize every official milestone for this student before changing scores.
  PERFORM 1 FROM public.posted_grades grade
  WHERE grade.class_record_id = v_request.class_record_id
    AND grade.student_id = v_request.student_id
    AND grade.grade_period::TEXT IN ('midterm_rating', 'tentative_final_rating', 'semestral_grade')
  ORDER BY grade.grade_period::TEXT
  FOR UPDATE;

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
  v_mr := NULLIF(v_projection->>'mr', '')::NUMERIC;
  v_tfr := NULLIF(v_projection->>'tfr', '')::NUMERIC;
  v_computed := CASE WHEN jsonb_array_length(v_canonical_changes) > 0
    THEN NULLIF(v_projection->>'sg', '')::NUMERIC
    ELSE v_request.original_computed_grade END;
  IF v_mr IS NULL OR v_tfr IS NULL OR v_computed IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected score basis does not produce complete MR, TFR, and SG milestones.';
  END IF;
  v_final_remark := lower(BTRIM(COALESCE(v_request.proposed_remark, v_request.original_remark)));
  IF v_final_remark NOT IN ('passed', 'failed', 'incomplete', 'fda', 'dropped') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Select a valid final academic remark.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_proposed_remark, '')), '') IS NOT NULL
    AND lower(BTRIM(p_proposed_remark)) IS DISTINCT FROM v_final_remark
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The final academic status must match the outcome reviewed and approved by the Dean.';
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

  UPDATE public.remark_override_requests SET
    proposed_score_changes = v_canonical_changes,
    proposed_computed_grade = v_computed,
    proposed_effective_grade = v_effective,
    proposed_remark = v_final_remark,
    requested_remark = v_final_remark
  WHERE request_id = p_request_id AND status = 'approved';

  v_milestone_changes := public.aspire_sync_corrected_progress_milestones(
    p_request_id, v_projection, v_actor
  );
  v_milestone_changes := v_milestone_changes || jsonb_build_object(
    'semestral_grade', jsonb_build_object('operation', 'updated', 'before', v_posted.computed_grade, 'after', v_computed),
    'effective_gwa', jsonb_build_object('before', v_posted.effective_grade, 'after', v_effective)
  );
  PERFORM set_config('aspire.sg_correction_milestone_changes', v_milestone_changes::TEXT, TRUE);

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
    input_snapshot_hash = v_projection->>'input_snapshot_hash',
    last_correction_request_id = p_request_id
  WHERE posted_grade_id = v_posted.posted_grade_id
  RETURNING official_revision INTO v_revision;

  SELECT
    COALESCE(subject.code || ' - ' || subject.name, subject.code, subject.name, 'your class'),
    subject.code, subject.name
  INTO v_subject_label, v_subject_code, v_subject_name
  FROM public.subjects subject WHERE subject.subject_id = v_class.subject_id;
  SELECT BTRIM(COALESCE(student.last_name, '') || ', ' || COALESCE(student.first_name, ''))
  INTO v_student_name FROM public.users student WHERE student.user_id = v_request.student_id;

  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
  ) VALUES (
    v_request.student_id, 'grade_changed', 'Official Grades Corrected', '/student/grades', 'warning',
    FORMAT('Your approved grade correction for %s was applied. Your MR, TFR, and official SG were recalculated.', v_subject_label),
    jsonb_build_object(
      'class_record_id', v_request.class_record_id, 'grade_period', 'semestral_grade',
      'mr', v_mr, 'tfr', v_tfr, 'computed_grade', v_computed,
      'effective_grade', v_effective, 'remarks', v_final_remark,
      'subject_code', v_subject_code, 'subject_name', v_subject_name,
      'term', 'Semestral Grade', 'rating', v_computed, 'gwa', v_effective,
      'remark', v_final_remark, 'student_name', NULLIF(v_student_name, ', '),
      'source', 'dean_correction', 'request_id', p_request_id
    ),
    FORMAT('grade_changed:%s:semestral_grade:%s:request:%s', v_request.class_record_id, v_request.student_id, p_request_id),
    FALSE
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  IF v_request.decision_by IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      v_request.decision_by, 'override_approved', 'Approved SG Correction Applied',
      '/dean/remarkoverriderequests', 'info',
      FORMAT('The approved SG correction for %s was applied; MR, TFR, and SG were recalculated and remain locked.', v_subject_label),
      jsonb_build_object('request_id', p_request_id, 'class_record_id', v_request.class_record_id,
        'student_id', v_request.student_id, 'mr', v_mr, 'tfr', v_tfr,
        'sg', v_computed, 'effective_grade', v_effective, 'final_remark', v_final_remark),
      FORMAT('sg_correction_applied:%s', p_request_id), FALSE
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  v_result := jsonb_build_object(
    'operation_id', p_operation_id, 'request_id', p_request_id,
    'posted_grade_id', v_posted.posted_grade_id,
    'student_id', v_request.student_id, 'class_record_id', v_request.class_record_id,
    'mr', v_mr, 'tfr', v_tfr, 'computed_grade', v_computed,
    'effective_grade', v_effective, 'remarks', v_final_remark,
    'official_revision', v_revision, 'milestone_changes', v_milestone_changes,
    'updated_milestones', jsonb_build_array('midterm_rating', 'tentative_final_rating', 'semestral_grade'),
    'applied_score_changes', v_canonical_changes, 'status', 'applied'
  );
  INSERT INTO public.sg_correction_operations (
    operation_id, request_id, posted_grade_id, actor_id, request_hash, status, result
  ) VALUES (
    p_operation_id, p_request_id, v_posted.posted_grade_id, v_actor, v_request_hash, 'committed', v_result
  );
  RETURN v_result;
END;
$$;

-- Dean decisions already carry the class/request identities in their payload.
-- Normalize the durable link before email/push dispatchers observe the row.
CREATE OR REPLACE FUNCTION public.route_sg_correction_faculty_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class_record_id TEXT;
  v_request_id TEXT;
BEGIN
  -- override_approved is also used for the Dean's post-application receipt.
  -- Route only the faculty decision notice, identified by its faculty link;
  -- never replace a /dean destination.
  IF NEW.type = 'override_approved'
    AND COALESCE(NEW.link, '') LIKE '/faculty/%'
  THEN
    v_class_record_id := NULLIF(NEW.payload->>'class_record_id', '');
    v_request_id := NULLIF(NEW.payload->>'request_id', '');
    IF v_class_record_id IS NOT NULL THEN
      NEW.link := '/faculty/postedgradesview?id=' || v_class_record_id
        || CASE WHEN v_request_id IS NULL THEN '' ELSE '&request=' || v_request_id END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_sg_correction_faculty_notification ON public.notifications;
CREATE TRIGGER trg_route_sg_correction_faculty_notification
BEFORE INSERT OR UPDATE OF type, payload, link ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.route_sg_correction_faculty_notification();

UPDATE public.notifications notification
SET link = '/faculty/postedgradesview?id=' || (notification.payload->>'class_record_id')
  || CASE
    WHEN NULLIF(notification.payload->>'request_id', '') IS NULL THEN ''
    ELSE '&request=' || (notification.payload->>'request_id')
  END
WHERE notification.type = 'override_approved'
  AND COALESCE(notification.link, '') LIKE '/faculty/%'
  AND NULLIF(notification.payload->>'class_record_id', '') IS NOT NULL;

-- Existing applied full-row corrections already contain their corrected score
-- basis and SG. Recalculate only their derived MR/TFR rows; never reapply scores
-- and never touch administrative overrides.
DO $repair$
DECLARE
  v_request RECORD;
  v_projection JSONB;
BEGIN
  FOR v_request IN
    SELECT request.request_id, request.class_record_id, request.student_id,
           COALESCE(request.applied_by, request.requested_by) AS recorded_by
    FROM public.remark_override_requests request
    JOIN public.posted_grades sg
      ON sg.posted_grade_id = request.posted_grade_id
     AND sg.grade_period::TEXT = 'semestral_grade'
    WHERE request.status = 'applied'
      AND request.correction_scope = 'student_score_row'
      AND jsonb_array_length(COALESCE(request.proposed_score_changes, '[]'::JSONB)) > 0
      AND sg.last_correction_request_id = request.request_id
      AND sg.official_source = 'dean_correction'
  LOOP
    v_projection := public.aspire_calculate_student_grade(v_request.class_record_id, v_request.student_id);
    IF COALESCE((v_projection->>'ok')::BOOLEAN, FALSE)
      AND COALESCE((v_projection->>'sg_complete')::BOOLEAN, FALSE)
    THEN
      PERFORM set_config('aspire.grade_posting_context', 'correction_repair', TRUE);
      PERFORM set_config('aspire.sg_correction_request_id', v_request.request_id::TEXT, TRUE);
      PERFORM public.aspire_sync_corrected_progress_milestones(
        v_request.request_id, v_projection, v_request.recorded_by
      );
    END IF;
  END LOOP;
  PERFORM set_config('aspire.grade_posting_context', '', TRUE);
  PERFORM set_config('aspire.sg_correction_request_id', '', TRUE);
END;
$repair$;

REVOKE ALL ON FUNCTION public.aspire_sync_corrected_progress_milestones(UUID, JSONB, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_posted_grade_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_sg_correction_application() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_applied_sg_correction() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.route_sg_correction_faculty_notification() FROM PUBLIC, anon, authenticated;

COMMIT;
