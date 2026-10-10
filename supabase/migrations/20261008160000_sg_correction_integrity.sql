-- =============================================================================
-- ASPIRE: SEMESTRAL-GRADE CORRECTION INTEGRITY
-- =============================================================================
-- Dean approval grants one narrowly scoped revision permission. It never
-- changes the official posted grade. The request becomes Applied only when the
-- assigned faculty successfully reposts a matching corrected SG.

BEGIN;

ALTER TABLE public.remark_override_requests
  ADD COLUMN IF NOT EXISTS posted_grade_id UUID REFERENCES public.posted_grades(posted_grade_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS original_computed_grade NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS original_effective_grade NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS original_remark VARCHAR(30),
  ADD COLUMN IF NOT EXISTS proposed_computed_grade NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS proposed_effective_grade NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS proposed_remark VARCHAR(30),
  ADD COLUMN IF NOT EXISTS proposed_score_changes JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS decision_by UUID REFERENCES public.users(user_id),
  ADD COLUMN IF NOT EXISTS decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS applied_by UUID REFERENCES public.users(user_id),
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.users(user_id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_computed_grade NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS final_effective_grade NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS final_remark VARCHAR(30),
  ADD COLUMN IF NOT EXISTS applied_posted_grade_id UUID REFERENCES public.posted_grades(posted_grade_id) ON DELETE RESTRICT;

ALTER TABLE public.remark_override_requests
  DROP CONSTRAINT IF EXISTS remark_override_requests_status_check;
ALTER TABLE public.remark_override_requests
  ADD CONSTRAINT remark_override_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'cancelled'));

UPDATE public.remark_override_requests request
SET posted_grade_id = posted.posted_grade_id,
    original_computed_grade = COALESCE(request.original_computed_grade, request.computed_grade, posted.computed_grade),
    original_effective_grade = COALESCE(request.original_effective_grade, request.effective_grade, posted.effective_grade),
    original_remark = COALESCE(request.original_remark, request.current_remark, posted.remarks::TEXT),
    proposed_remark = COALESCE(
      request.proposed_remark,
      CASE WHEN request.requested_remark <> 'Pending Edit' THEN request.requested_remark END
    )
FROM public.posted_grades posted
WHERE request.posted_grade_id IS NULL
  AND posted.class_record_id = request.class_record_id
  AND posted.student_id = request.student_id
  AND posted.grade_period::TEXT = 'semestral_grade';

-- Preserve every legacy row while deterministically resolving duplicate open
-- requests before the one-unresolved-request invariant is installed.
WITH ranked_open_requests AS (
  SELECT request_id,
         ROW_NUMBER() OVER (
           PARTITION BY posted_grade_id
           ORDER BY CASE WHEN status = 'approved' THEN 0 ELSE 1 END,
                    requested_at DESC NULLS LAST,
                    request_id DESC
         ) AS request_rank
  FROM public.remark_override_requests
  WHERE posted_grade_id IS NOT NULL
    AND status IN ('pending', 'approved')
)
UPDATE public.remark_override_requests request
SET status = 'cancelled',
    cancelled_at = CURRENT_TIMESTAMP,
    resolved_at = COALESCE(request.resolved_at, CURRENT_TIMESTAMP)
FROM ranked_open_requests ranked
WHERE request.request_id = ranked.request_id
  AND ranked.request_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_unresolved_sg_correction
  ON public.remark_override_requests(posted_grade_id)
  WHERE status IN ('pending', 'approved');

ALTER TABLE public.posted_grades
  ADD COLUMN IF NOT EXISTS last_correction_request_id UUID
  REFERENCES public.remark_override_requests(request_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.grade_correction_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES public.remark_override_requests(request_id) ON DELETE RESTRICT,
  posted_grade_id UUID NOT NULL REFERENCES public.posted_grades(posted_grade_id) ON DELETE RESTRICT,
  class_record_id UUID NOT NULL REFERENCES public.class_records(class_record_id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  previous_computed_grade NUMERIC(5,2),
  previous_effective_grade NUMERIC(5,2),
  previous_remark VARCHAR(30),
  final_computed_grade NUMERIC(5,2),
  final_effective_grade NUMERIC(5,2),
  final_remark VARCHAR(30),
  applied_by UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_class public.class_records%ROWTYPE;
  v_posted public.posted_grades%ROWTYPE;
  v_request_id UUID;
  v_subject_name TEXT;
  v_section_name TEXT;
  v_faculty_name TEXT;
  v_proposed_remark TEXT := lower(BTRIM(COALESCE(p_proposed_remark, '')));
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
  IF jsonb_typeof(COALESCE(p_proposed_score_changes, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Proposed score changes must be a JSON array.';
  END IF;
  IF p_proposed_computed_grade IS NOT NULL
    AND (p_proposed_computed_grade < 0 OR p_proposed_computed_grade > 100)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The proposed computed percentage must be between 0 and 100.';
  END IF;
  IF p_proposed_effective_grade IS NOT NULL
    AND (p_proposed_effective_grade < 1 OR p_proposed_effective_grade > 5)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The proposed effective GWA must be between 1.00 and 5.00.';
  END IF;

  SELECT class_record.* INTO v_class
  FROM public.class_records class_record
  WHERE class_record.class_record_id = p_class_record_id
  FOR UPDATE;

  IF NOT FOUND OR v_class.faculty_id IS DISTINCT FROM v_actor
    OR COALESCE(v_class.status::TEXT, '') <> 'active'
    OR NOT EXISTS (
      SELECT 1 FROM public.users actor
      WHERE actor.user_id = v_actor AND actor.role::TEXT = 'faculty' AND actor.status = 'active'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the active faculty assigned to this class may request an SG correction.';
  END IF;

  SELECT posted.* INTO v_posted
  FROM public.posted_grades posted
  WHERE posted.class_record_id = p_class_record_id
    AND posted.student_id = p_student_id
    AND posted.grade_period::TEXT = 'semestral_grade'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'No official semestral grade exists for this student.';
  END IF;
  IF NOT COALESCE(v_posted.is_locked, TRUE) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'This semestral grade already has an active revision permission.';
  END IF;
  IF (p_proposed_computed_grade IS NULL OR p_proposed_computed_grade IS NOT DISTINCT FROM v_posted.computed_grade)
    AND (p_proposed_effective_grade IS NULL OR p_proposed_effective_grade IS NOT DISTINCT FROM v_posted.effective_grade)
    AND v_proposed_remark IS NOT DISTINCT FROM v_posted.remarks::TEXT
    AND jsonb_array_length(COALESCE(p_proposed_score_changes, '[]'::JSONB)) = 0
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The correction proposal must change at least one official value.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.remark_override_requests request
    WHERE request.posted_grade_id = v_posted.posted_grade_id
      AND request.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'An unresolved correction request already exists for this semestral grade.';
  END IF;

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
    subject_name, section_name, faculty_name,
    posted_grade_id,
    computed_grade, effective_grade, current_remark, requested_remark,
    original_computed_grade, original_effective_grade, original_remark,
    proposed_computed_grade, proposed_effective_grade, proposed_remark,
    proposed_score_changes, note, evidence_url, status
  ) VALUES (
    p_class_record_id, p_student_id, v_actor, CURRENT_TIMESTAMP,
    v_subject_name, v_section_name, v_faculty_name,
    v_posted.posted_grade_id,
    v_posted.computed_grade, v_posted.effective_grade, v_posted.remarks::TEXT, v_proposed_remark,
    v_posted.computed_grade, v_posted.effective_grade, v_posted.remarks::TEXT,
    p_proposed_computed_grade, p_proposed_effective_grade, v_proposed_remark,
    COALESCE(p_proposed_score_changes, '[]'::JSONB), BTRIM(p_reason), NULLIF(BTRIM(COALESCE(p_evidence_url, '')), ''), 'pending'
  )
  RETURNING request_id INTO v_request_id;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'posted_grade_id', v_posted.posted_grade_id,
    'status', 'pending',
    'original_computed_grade', v_posted.computed_grade,
    'original_effective_grade', v_posted.effective_grade,
    'original_remark', v_posted.remarks::TEXT,
    'proposed_computed_grade', p_proposed_computed_grade,
    'proposed_effective_grade', p_proposed_effective_grade,
    'proposed_remark', v_proposed_remark
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_sg_correction_request(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request public.remark_override_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required.';
  END IF;

  SELECT request.* INTO v_request
  FROM public.remark_override_requests request
  WHERE request.request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_request.requested_by IS DISTINCT FROM v_actor
    OR v_request.status NOT IN ('pending', 'approved')
    OR NOT EXISTS (
      SELECT 1
      FROM public.class_records class_record
      JOIN public.users actor ON actor.user_id = v_actor
      WHERE class_record.class_record_id = v_request.class_record_id
        AND class_record.faculty_id = v_actor
        AND actor.role::TEXT = 'faculty'
        AND actor.status = 'active'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the assigned faculty may cancel an unresolved SG correction request.';
  END IF;

  UPDATE public.remark_override_requests
  SET status = 'cancelled',
      cancelled_by = v_actor,
      cancelled_at = CURRENT_TIMESTAMP,
      resolved_by = COALESCE(resolved_by, v_actor),
      resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP)
  WHERE request_id = p_request_id;

  IF v_request.status = 'approved' THEN
    UPDATE public.posted_grades
    SET is_locked = TRUE
    WHERE posted_grade_id = v_request.posted_grade_id
      AND grade_period::TEXT = 'semestral_grade';
  END IF;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'cancelled',
    'student_id', v_request.student_id,
    'class_record_id', v_request.class_record_id
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
SET search_path = public
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
    AND actor.status = 'active';
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
  IF v_decision = 'approved' THEN
    IF NOT FOUND
      OR NOT COALESCE(v_posted.is_locked, TRUE)
      OR v_posted.computed_grade IS DISTINCT FROM v_request.original_computed_grade
      OR v_posted.effective_grade IS DISTINCT FROM v_request.original_effective_grade
      OR v_posted.remarks::TEXT IS DISTINCT FROM v_request.original_remark
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The official SG no longer matches the request baseline. Cancel it and submit a current proposal.';
    END IF;
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
    AND jsonb_array_length(COALESCE(v_request.proposed_score_changes, '[]'::JSONB)) = 0
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

  IF v_decision = 'approved' THEN
    UPDATE public.posted_grades
    SET is_locked = FALSE
    WHERE posted_grade_id = v_request.posted_grade_id
      AND grade_period::TEXT = 'semestral_grade';
  END IF;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', v_decision,
    'faculty_id', v_request.requested_by,
    'student_id', v_request.student_id,
    'class_record_id', v_request.class_record_id,
    'proposed_remark', v_request.proposed_remark
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_sg_correction_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
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

  SELECT role::TEXT INTO v_role FROM public.users WHERE user_id = v_actor;
  IF v_role = 'admin' THEN
    RETURN NEW;
  END IF;
  IF v_role <> 'faculty' OR NOT EXISTS (
    SELECT 1 FROM public.class_records class_record
    WHERE class_record.class_record_id = NEW.class_record_id
      AND class_record.faculty_id = v_actor
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the assigned faculty may apply an approved SG correction.';
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

DROP TRIGGER IF EXISTS trg_enforce_sg_correction_application ON public.posted_grades;
CREATE TRIGGER trg_enforce_sg_correction_application
BEFORE UPDATE ON public.posted_grades
FOR EACH ROW
EXECUTE FUNCTION public.enforce_sg_correction_application();

CREATE OR REPLACE FUNCTION public.record_applied_sg_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF NEW.last_correction_request_id IS NULL
    OR NEW.last_correction_request_id IS NOT DISTINCT FROM OLD.last_correction_request_id
  THEN
    RETURN NEW;
  END IF;

  UPDATE public.remark_override_requests
  SET status = 'applied',
      applied_by = v_actor,
      applied_at = CURRENT_TIMESTAMP,
      final_computed_grade = NEW.computed_grade,
      final_effective_grade = NEW.effective_grade,
      final_remark = NEW.remarks::TEXT,
      applied_posted_grade_id = NEW.posted_grade_id
  WHERE request_id = NEW.last_correction_request_id
    AND status = 'approved';

  IF FOUND THEN
    INSERT INTO public.grade_correction_history (
      request_id, posted_grade_id, class_record_id, student_id,
      previous_computed_grade, previous_effective_grade, previous_remark,
      final_computed_grade, final_effective_grade, final_remark,
      applied_by, applied_at
    ) VALUES (
      NEW.last_correction_request_id, NEW.posted_grade_id, NEW.class_record_id, NEW.student_id,
      OLD.computed_grade, OLD.effective_grade, OLD.remarks::TEXT,
      NEW.computed_grade, NEW.effective_grade, NEW.remarks::TEXT,
      v_actor, CURRENT_TIMESTAMP
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_applied_sg_correction ON public.posted_grades;
CREATE TRIGGER trg_record_applied_sg_correction
AFTER UPDATE ON public.posted_grades
FOR EACH ROW
EXECUTE FUNCTION public.record_applied_sg_correction();

CREATE OR REPLACE FUNCTION public.prevent_grade_correction_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Applied grade-correction history is immutable.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_grade_correction_history_mutation ON public.grade_correction_history;
CREATE TRIGGER trg_prevent_grade_correction_history_mutation
BEFORE UPDATE OR DELETE ON public.grade_correction_history
FOR EACH ROW
EXECUTE FUNCTION public.prevent_grade_correction_history_mutation();

REVOKE ALL ON FUNCTION public.submit_sg_correction_request(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_sg_correction_request(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.review_sg_correction_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_sg_correction_request(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_sg_correction_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_sg_correction_request(UUID) TO authenticated;

-- Lifecycle writes are RPC-only while read access remains available to the
-- existing Faculty and Dean screens. This remains necessary while project-wide
-- RLS is intentionally disabled.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.remark_override_requests FROM anon, authenticated;
GRANT SELECT ON TABLE public.remark_override_requests TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.grade_correction_history FROM anon, authenticated;
GRANT SELECT ON TABLE public.grade_correction_history TO authenticated;

COMMIT;
