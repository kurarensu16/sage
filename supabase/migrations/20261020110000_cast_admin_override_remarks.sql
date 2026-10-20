-- The secured administrative override RPC receives remarks as TEXT from
-- PostgREST, while posted_grades.remarks is the grade_remarks enum. Cast the
-- input before creating the audit request or updating the official grade.

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_admin_grade_override(
  p_posted_grade_id UUID,
  p_new_effective_grade NUMERIC,
  p_new_remarks TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_old public.posted_grades%ROWTYPE;
  v_request_id UUID;
  v_new_remarks public.grade_remarks;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only an administrator may apply a grade override.';
  END IF;
  IF p_new_effective_grade IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A replacement grade is required.';
  END IF;
  IF p_new_remarks IS NULL OR length(trim(p_new_remarks)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A remark is required.';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An override reason is required.';
  END IF;

  v_new_remarks := p_new_remarks::public.grade_remarks;

  SELECT * INTO v_old
  FROM public.posted_grades
  WHERE posted_grade_id = p_posted_grade_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Posted grade not found.';
  END IF;
  IF v_old.grade_period::TEXT <> 'semestral_grade' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Only the Semestral Grade may be overridden. MR and TFR are progress ratings.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.remark_override_requests
    WHERE posted_grade_id = p_posted_grade_id
      AND status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'An SG correction request is already open for this grade. Resolve that request before applying an administrative override.';
  END IF;

  INSERT INTO public.remark_override_requests (
    class_record_id, student_id, posted_grade_id,
    requested_by, requested_at,
    computed_grade, effective_grade, current_remark, requested_remark, note,
    original_computed_grade, original_effective_grade, original_remark,
    proposed_computed_grade, proposed_effective_grade, proposed_remark,
    status, decision_by, decision_at, resolved_by, resolved_at
  ) VALUES (
    v_old.class_record_id, v_old.student_id, p_posted_grade_id,
    v_actor, CURRENT_TIMESTAMP,
    v_old.computed_grade, v_old.effective_grade, v_old.remarks::TEXT, v_new_remarks::TEXT, p_reason,
    v_old.computed_grade, v_old.effective_grade, v_old.remarks::TEXT,
    NULL, p_new_effective_grade, v_new_remarks::TEXT,
    'approved', v_actor, CURRENT_TIMESTAMP, v_actor, CURRENT_TIMESTAMP
  )
  RETURNING request_id INTO v_request_id;

  UPDATE public.posted_grades
  SET effective_grade = p_new_effective_grade,
      remarks = v_new_remarks,
      remarks_note = p_reason,
      override_at = CURRENT_TIMESTAMP,
      override_by = v_actor,
      is_locked = TRUE
  WHERE posted_grade_id = p_posted_grade_id;

  RETURN jsonb_build_object(
    'posted_grade_id', p_posted_grade_id,
    'request_id', v_request_id,
    'previous_effective_grade', v_old.effective_grade,
    'previous_remark', v_old.remarks::TEXT,
    'new_effective_grade', p_new_effective_grade,
    'new_remark', v_new_remarks::TEXT
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_admin_grade_override(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_admin_grade_override(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

COMMIT;
