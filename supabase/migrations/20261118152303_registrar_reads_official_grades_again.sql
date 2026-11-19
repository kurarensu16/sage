-- =============================================================================
-- The Registrar reads official grades again
-- =============================================================================
--
-- THE GAP
--   can_read_student_class_record() is the single read gate behind
--   posted_grades, student_term_scores, student_component_scores,
--   student_activity_scores and attendance_records.
--
--   20261101012000_registrar_can_read_and_override_official_grades.sql added
--   a Registrar arm to it:
--
--     ... OR public.is_active_registrar() OR public.is_active_admin()
--
--   20261105152119_an_instructor_keeps_the_classes_they_taught.sql then
--   redefined the same function to swap the faculty arm (is_assigned_faculty
--   -> is_class_faculty) and says it "changes exactly one thing" -- but its new
--   body has no Registrar arm. Applied in order, the Registrar reads no posted
--   grade at all: Grade Override finds the student and shows no grades, and the
--   Phase 2 Student Records and Class Grade Sheets would be empty.
--
-- THE FIX
--   Restate the function with the 2026-11-05 faculty arm AND the 2026-11-01
--   Registrar arm. Nothing else changes: same signature, same security, and
--   the write policies are untouched (the Registrar still changes a grade only
--   through apply_admin_grade_override_v3).
--
--   Safe to run whether or not the live database already has the Registrar arm.
--   Plan: docs/02-thesis/defense/REGISTRAR_REVISIONS_PLAN_2026-11-18.md, Phase 2.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.can_read_student_class_record(
  p_class_record_id UUID,
  p_student_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT p_student_id = auth.uid()
    OR public.is_class_faculty(p_class_record_id)
    OR public.is_authorized_dean_for_class(p_class_record_id)
    OR public.is_active_registrar()
    OR public.is_active_admin();
$$;

REVOKE ALL ON FUNCTION public.can_read_student_class_record(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_student_class_record(UUID, UUID) TO authenticated;

DO $verify$
DECLARE v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.can_read_student_class_record(uuid, uuid)'::regprocedure);

  IF position('is_active_registrar' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the Registrar still cannot read official grades.';
  END IF;

  -- The 2026-11-05 fix must survive: an instructor keeps read access to an
  -- archived class they taught.
  IF position('is_class_faculty' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the read gate lost is_class_faculty. Run 20261105152119 first.';
  END IF;

  RAISE NOTICE 'The Registrar reads official grades again.';
END
$verify$;

COMMIT;
