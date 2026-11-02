-- =============================================================================
-- Let the Registrar send the notifications their own actions generate
-- =============================================================================
--
-- THE BUG
--   Reassigning a class as Registrar succeeds, and then:
--
--     dispatch_notifications -> 400
--     P0001: Not authorized to send notification type system to this recipient.
--
--   can_dispatch_notification ends with an institutional-sender branch:
--
--     RETURN p_actor_role IN ('dean', 'office') AND p_notification_type IN (...)
--
--   'registrar' is absent. The function was written on 2026-10-01; the
--   registrar role was only added to the users CHECK on 2026-10-29
--   (20261029034500_allow_registrar_role_value). A Registrar therefore falls
--   through every branch -- student, faculty, institutional -- and returns
--   FALSE for every notification type there is.
--
--   This is the third policy written before the role split to omit the
--   Registrar, after class_records_faculty_insert (20261031183000) and
--   enrollments_faculty_mutation (20261031190000).
--
-- WHY IT MATTERS MORE THAN A FAILED TOAST
--   The reassign handler's own comment: "Both parties are told: a faculty
--   member should not discover they have gained or lost a class by noticing
--   their list changed." The notification IS the step. The client catches the
--   failure and logs it, so the reassignment completes and nobody is informed --
--   the same silent partial success as the Dean enrolment bug.
--
-- 'office' IS LEFT ALONE HERE
--   It is a retired role that still appears in this function and in the users
--   CHECK constraint. Removing it is a separate cleanup with its own blast
--   radius, deliberately not bundled into a fix for a live bug.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.can_dispatch_notification(
  p_actor_id UUID,
  p_actor_role TEXT,
  p_recipient_id UUID,
  p_notification_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient_role TEXT;
BEGIN
  SELECT role::TEXT INTO v_recipient_role
  FROM public.users
  WHERE user_id = p_recipient_id;

  IF v_recipient_role IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_actor_role = 'admin' OR p_recipient_id = p_actor_id THEN
    RETURN TRUE;
  END IF;

  IF p_actor_role = 'student' THEN
    RETURN p_notification_type = 'consultation_request'
      AND v_recipient_role = 'faculty'
      AND EXISTS (
        SELECT 1
        FROM public.enrollments enrollment
        JOIN public.class_records class_record
          ON class_record.section_id = enrollment.section_id
         AND class_record.subject_id = enrollment.subject_id
        WHERE enrollment.student_id = p_actor_id
          AND enrollment.status = 'active'
          AND class_record.faculty_id = p_recipient_id
      );
  END IF;

  IF p_actor_role = 'faculty' THEN
    IF v_recipient_role = 'student'
       AND p_notification_type IN ('grade_posted', 'grade_changed', 'academic_advising', 'ews_alert', 'system')
       AND EXISTS (
         SELECT 1
         FROM public.enrollments enrollment
         JOIN public.class_records class_record
           ON class_record.section_id = enrollment.section_id
          AND class_record.subject_id = enrollment.subject_id
         WHERE enrollment.student_id = p_recipient_id
           AND enrollment.status = 'active'
           AND class_record.faculty_id = p_actor_id
       ) THEN
      RETURN TRUE;
    END IF;

    RETURN v_recipient_role = 'dean'
      AND p_notification_type IN ('grades_pending', 'override_request');
  END IF;

  -- Institutional senders: the Registrar, Deans, and the retired college-office
  -- role, for advisories, evaluation windows, and term/roster notices. The
  -- Registrar is the addition -- faculty loading, enrolment and term rollover
  -- all generate notices that only they perform.
  RETURN p_actor_role IN ('registrar', 'dean', 'office')
    AND p_notification_type IN (
      'grade_posted', 'grade_changed', 'eval_window_open', 'eval_closed',
      'eval_deadline_reminder', 'ews_alert', 'academic_notice',
      'risk_threshold', 'eval_compiled', 'grades_pending', 'override_request',
      'override_approved', 'override_rejected', 'term_rollover_reminder',
      'roster_import', 'system', 'compliance', 'assignment', 'class_assigned'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.can_dispatch_notification(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;

DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'can_dispatch_notification';

  IF position('''registrar''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the registrar was not added.';
  END IF;
  -- The restatement must not have dropped the narrower branches, or a student
  -- or faculty member would gain or lose sending rights silently.
  IF position('consultation_request' IN v_def) = 0
     OR position('grades_pending' IN v_def) = 0
     OR position('academic_advising' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a narrower branch was lost.';
  END IF;

  RAISE NOTICE 'The Registrar can now dispatch the notifications their actions generate.';
END $$;

COMMIT;
