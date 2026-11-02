-- =============================================================================
-- Let a Dean's finalize enrol the block section
-- =============================================================================
--
-- THE BUG
--   Provisioning a class auto-enrols the students whose section_id matches.
--   enrollments_faculty_mutation admits:
--
--     is_active_admin()
--     OR is_active_registrar()
--     OR the faculty assigned to that class
--
--   A Dean is none of those. So when a Dean finalizes, the class record is
--   created and the enrolment insert is refused, and the class ends up with
--   nobody in it.
--
--   This is the same omission as class_records_faculty_insert (fixed in
--   20261031183000): both policies were written on 2026-10-08, three weeks
--   before faculty loading existed, so neither anticipated a Dean provisioning
--   a class. The Registrar arm was added later for the role split and happens
--   to cover the Registrar here, which is why only the Dean path is broken.
--
--   It is worse than the class_records one in a specific way: the client
--   swallows the failure, so the finalize reports success and the class looks
--   provisioned. The only symptom is an empty roster found later.
--
-- THE FIX
--   The same third arm, resolved through the section's college, so a Dean may
--   enrol into their own college and nowhere else.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS enrollments_faculty_mutation ON public.enrollments;
CREATE POLICY enrollments_faculty_mutation
ON public.enrollments FOR ALL TO authenticated
USING (
  public.is_active_admin()
  OR public.is_active_registrar()
  OR EXISTS (
    SELECT 1
    FROM public.class_records class_record
    WHERE class_record.subject_id = enrollments.subject_id
      AND class_record.section_id = enrollments.section_id
      AND public.is_assigned_faculty(class_record.class_record_id)
  )
  -- Faculty loading: a Dean within their own college. The Registrar is already
  -- covered by their own arm above.
  OR public.can_load_faculty_for_department(
       (SELECT s.department_id FROM public.sections s
         WHERE s.section_id = enrollments.section_id)
     )
)
WITH CHECK (
  public.is_active_admin()
  OR public.is_active_registrar()
  OR EXISTS (
    SELECT 1
    FROM public.class_records class_record
    WHERE class_record.subject_id = enrollments.subject_id
      AND class_record.section_id = enrollments.section_id
      AND public.is_assigned_faculty(class_record.class_record_id)
  )
  OR public.can_load_faculty_for_department(
       (SELECT s.department_id FROM public.sections s
         WHERE s.section_id = enrollments.section_id)
     )
);

COMMENT ON POLICY enrollments_faculty_mutation ON public.enrollments IS
  'Admins, the Registrar, the class''s assigned faculty, and whoever may load '
  'faculty for the section''s college. The last arm is what lets a Dean''s '
  'Finalize enrol the block section.';

-- -----------------------------------------------------------------------------
-- Backfill: classes already provisioned by a Dean have no enrolments, because
-- the insert was refused at the time. Enrol the block section for them now.
-- Only students whose own section_id matches the class's section, which is the
-- same rule the client applies, and never a student already enrolled.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_added INT;
BEGIN
  INSERT INTO public.enrollments (student_id, subject_id, section_id, status)
  SELECT u.user_id, c.subject_id, c.section_id, 'active'
  FROM public.class_records c
  JOIN public.users u
    ON u.section_id = c.section_id
   AND u.role::TEXT = 'student'
   AND COALESCE(u.status::TEXT, 'active') = 'active'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = u.user_id
      AND e.subject_id = c.subject_id
      AND e.section_id = c.section_id
  );

  GET DIAGNOSTICS v_added = ROW_COUNT;
  RAISE NOTICE 'Backfilled % block-section enrolment(s) for classes that had none.', v_added;
END $$;

DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_expr(pol.polwithcheck, pol.polrelid) INTO v_def
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'enrollments'
    AND pol.polname = 'enrollments_faculty_mutation';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Verification failed: enrollments_faculty_mutation is missing.';
  END IF;
  IF position('can_load_faculty_for_department' IN v_def) = 0
     OR position('is_active_registrar' IN v_def) = 0
     OR position('is_assigned_faculty' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the policy lost one of its arms.';
  END IF;

  RAISE NOTICE 'A Dean can now enrol the block section within their own college.';
END $$;

COMMIT;
