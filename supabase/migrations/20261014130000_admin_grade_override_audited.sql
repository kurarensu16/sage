-- Phase 0.2 — Close the admin bypass in the SG correction workflow.
--
-- Before this migration, enforce_sg_correction_application() returned early for any
-- actor whose users.role was 'admin', so an admin (including a self-escalated one, see
-- 20261014120000_harden_users_rls.sql) could overwrite a posted, locked Semestral Grade
-- with a raw client UPDATE. Because that path never set last_correction_request_id, the
-- companion audit trigger record_applied_sg_correction() never fired and the change left
-- no row in grade_correction_history.
--
-- Approach: rather than let the trigger trust a role or a session flag, an administrative
-- override now has to produce the same artifact a faculty correction does — an approved
-- remark_override_requests row whose proposed values match exactly what gets written. The
-- admin-only RPC below creates that row and applies it in one transaction, so the existing
-- integrity checks and the existing audit trigger both run unchanged. Every admin override
-- therefore lands in grade_correction_history with a reason attached.

BEGIN;

-- 1. The trigger no longer waives its checks for admins. Admins are allowed to be the
--    actor applying a correction (faculty are, too), but both must match an approved
--    request. Body is otherwise identical to 20261008160000_sg_correction_integrity.sql.
CREATE OR REPLACE FUNCTION public.enforce_sg_correction_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request public.remark_override_requests%ROWTYPE;
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

  IF NEW.grade_period::TEXT = 'semestral_grade'
    AND NOT COALESCE(OLD.is_locked, TRUE)
    AND COALESCE(NEW.is_locked, FALSE)
    AND NOT (
      OLD.computed_grade IS DISTINCT FROM NEW.computed_grade
      OR OLD.effective_grade IS DISTINCT FROM NEW.effective_grade
      OR OLD.remarks IS DISTINCT FROM NEW.remarks
    )
    AND EXISTS (
      SELECT 1 FROM public.remark_override_requests request
      WHERE request.posted_grade_id = OLD.posted_grade_id
        AND request.status = 'approved'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Apply the exact approved SG correction before reposting. An unchanged repost cannot consume or relock the approval.';
  END IF;

  IF NEW.grade_period::TEXT <> 'semestral_grade'
    OR NOT (
      OLD.computed_grade IS DISTINCT FROM NEW.computed_grade
      OR OLD.effective_grade IS DISTINCT FROM NEW.effective_grade
      OR OLD.remarks IS DISTINCT FROM NEW.remarks
    )
  THEN
    RETURN NEW;
  END IF;

  -- The admin early-return that used to sit here is gone. An active admin may act, but
  -- only against an approved request, exactly like the assigned faculty.
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

  SELECT request.* INTO v_request
  FROM public.remark_override_requests request
  WHERE request.posted_grade_id = OLD.posted_grade_id
    AND request.status = 'approved'
  ORDER BY request.decision_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An approved, unused SG correction request is required before changing this official grade.';
  END IF;
  IF NOT COALESCE(NEW.is_locked, FALSE) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected SG must be reposted and relocked in the same transaction.';
  END IF;

  IF v_request.proposed_computed_grade IS NULL
    AND NEW.computed_grade IS DISTINCT FROM v_request.original_computed_grade
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected percentage differs from the approved proposal.';
  ELSIF v_request.proposed_computed_grade IS NOT NULL
    AND NEW.computed_grade IS DISTINCT FROM v_request.proposed_computed_grade
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected percentage differs from the approved proposal.';
  END IF;

  IF v_request.proposed_effective_grade IS NULL
    AND NEW.effective_grade IS DISTINCT FROM v_request.original_effective_grade
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected GWA differs from the approved proposal.';
  ELSIF v_request.proposed_effective_grade IS NOT NULL
    AND NEW.effective_grade IS DISTINCT FROM v_request.proposed_effective_grade
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected GWA differs from the approved proposal.';
  END IF;

  IF v_request.proposed_remark IS NULL
    AND NEW.remarks::TEXT IS DISTINCT FROM v_request.original_remark
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected remark differs from the approved proposal.';
  ELSIF v_request.proposed_remark IS NOT NULL
    AND NEW.remarks::TEXT IS DISTINCT FROM v_request.proposed_remark
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The corrected remark differs from the approved proposal.';
  END IF;

  NEW.last_correction_request_id := v_request.request_id;
  RETURN NEW;
END;
$$;

-- 2. The admin Grade Override page writes through this function instead of updating
--    posted_grades directly. It self-approves (that is the administrative power the
--    feature exists to provide) but it cannot act silently: the request row carries the
--    reason, and record_applied_sg_correction() writes grade_correction_history.
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

  -- uq_unresolved_sg_correction allows only one open request per posted grade, and an
  -- override must not quietly consume a correction the Dean is still deciding on.
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
    v_old.computed_grade, v_old.effective_grade, v_old.remarks::TEXT, p_new_remarks, p_reason,
    v_old.computed_grade, v_old.effective_grade, v_old.remarks::TEXT,
    NULL, p_new_effective_grade, p_new_remarks,
    'approved', v_actor, CURRENT_TIMESTAMP, v_actor, CURRENT_TIMESTAMP
  )
  RETURNING request_id INTO v_request_id;

  -- Deliberately does not set last_correction_request_id: the BEFORE trigger validates
  -- this update against the request above and sets that linkage itself, which is what
  -- makes the AFTER trigger write the grade_correction_history row.
  UPDATE public.posted_grades
  SET effective_grade = p_new_effective_grade,
      remarks = p_new_remarks,
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
    'new_remark', p_new_remarks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_admin_grade_override(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_admin_grade_override(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

COMMIT;
