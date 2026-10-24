-- Phase 1: identify every unapproved official-SG change before the atomic
-- posting RPC runs. The posted_grades trigger remains the final enforcement
-- and consumes an approval only after a successful update.

CREATE OR REPLACE FUNCTION public.preflight_sg_correction_posting(
  p_class_record_id UUID,
  p_posted_grade_rows JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_item JSONB;
  v_existing public.posted_grades%ROWTYPE;
  v_request public.remark_override_requests%ROWTYPE;
  v_violations JSONB := '[]'::JSONB;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required to preflight SG corrections.';
  END IF;
  IF jsonb_typeof(COALESCE(p_posted_grade_rows, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Posted-grade rows must be a JSON array.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.class_records class_record
    JOIN public.users actor ON actor.user_id = v_actor_id
    WHERE class_record.class_record_id = p_class_record_id
      AND class_record.faculty_id = v_actor_id
      AND actor.role::TEXT = 'faculty'
      AND actor.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the active faculty assigned to this class may preflight SG corrections.';
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_posted_grade_rows, '[]'::JSONB))
  LOOP
    IF COALESCE(v_item->>'grade_period', '') <> 'semestral_grade' THEN
      CONTINUE;
    END IF;

    SELECT posted.*
    INTO v_existing
    FROM public.posted_grades posted
    WHERE posted.class_record_id = p_class_record_id
      AND posted.student_id = (v_item->>'student_id')::UUID
      AND posted.grade_period::TEXT = 'semestral_grade';

    -- First-time SG posts are not corrections. Existing grades that remain
    -- identical also do not need an approval.
    IF NOT FOUND
      OR (
        v_existing.computed_grade IS NOT DISTINCT FROM (v_item->>'computed_grade')::NUMERIC
        AND v_existing.effective_grade IS NOT DISTINCT FROM (v_item->>'effective_grade')::NUMERIC
        AND v_existing.remarks::TEXT IS NOT DISTINCT FROM (v_item->>'remarks')
      )
    THEN
      CONTINUE;
    END IF;

    SELECT request.*
    INTO v_request
    FROM public.remark_override_requests request
    WHERE request.posted_grade_id = v_existing.posted_grade_id
      AND request.status = 'approved'
      AND request.proposed_computed_grade IS NOT NULL
      AND request.proposed_effective_grade IS NOT NULL
      AND request.proposed_remark IS NOT NULL
      AND request.proposed_computed_grade IS NOT DISTINCT FROM (v_item->>'computed_grade')::NUMERIC
      AND request.proposed_effective_grade IS NOT DISTINCT FROM (v_item->>'effective_grade')::NUMERIC
      AND request.proposed_remark IS NOT DISTINCT FROM (v_item->>'remarks')
    FOR KEY SHARE;

    IF NOT FOUND THEN
      v_violations := v_violations || jsonb_build_array(jsonb_build_object(
        'student_id', v_existing.student_id,
        'posted_grade_id', v_existing.posted_grade_id,
        'reason', 'No approved, unused correction request exactly matches this official SG.'
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_violations) = 0,
    'violations', v_violations
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preflight_sg_correction_posting(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preflight_sg_correction_posting(UUID, JSONB) TO authenticated;
