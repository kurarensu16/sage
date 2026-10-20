-- A student may join through an active class code until the official Semestral
-- Grade is posted. MR/TFR late joiners remain allowed, with the established
-- missing-work-as-zero workflow. Once SG exists, the official roster is closed.

BEGIN;

CREATE OR REPLACE FUNCTION public.request_class_join(p_join_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_code TEXT := upper(btrim(COALESCE(p_join_code, '')));
  v_class RECORD;
  v_existing public.class_join_requests;
  v_request public.class_join_requests;
  v_label TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = v_actor AND u.role::TEXT = 'student' AND u.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active student accounts can request to join a class.';
  END IF;
  IF v_code = '' THEN
    RAISE EXCEPTION 'Please enter a valid join code.';
  END IF;

  SELECT cr.class_record_id, cr.subject_id, cr.section_id, cr.faculty_id,
         sub.code AS subject_code, sub.name AS subject_name, sec.name AS section_name
  INTO v_class
  FROM public.class_room_join_codes jc
  JOIN public.class_records cr ON cr.class_record_id = jc.class_record_id
  LEFT JOIN public.subjects sub ON sub.subject_id = cr.subject_id
  LEFT JOIN public.sections sec ON sec.section_id = cr.section_id
  WHERE upper(jc.join_code) = v_code
    AND jc.is_active IS TRUE
    AND COALESCE(cr.status::TEXT, '') = 'active'
  LIMIT 1;

  IF NOT FOUND OR v_class.subject_id IS NULL OR v_class.section_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive classroom code. Please check with your instructor.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.posted_grades grade
    WHERE grade.class_record_id = v_class.class_record_id
      AND grade.grade_period::TEXT = 'semestral_grade'
  ) THEN
    RAISE EXCEPTION 'Official Semestral Grades are already posted for this class, so its roster is closed to new students.';
  END IF;

  v_label := COALESCE(v_class.subject_code, 'this subject')
    || COALESCE(' (' || v_class.section_name || ')', '');

  IF EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = v_actor AND e.subject_id = v_class.subject_id
  ) THEN
    RAISE EXCEPTION 'You are already enrolled in %.', COALESCE(v_class.subject_code, 'this subject');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_class.class_record_id::TEXT || ':' || v_actor::TEXT, 0));

  SELECT * INTO v_existing
  FROM public.class_join_requests r
  WHERE r.class_record_id = v_class.class_record_id AND r.student_id = v_actor
  FOR UPDATE;

  IF FOUND AND v_existing.status = 'pending' THEN
    RAISE EXCEPTION 'Your request to join % is already waiting for your instructor''s approval.', v_label;
  END IF;

  INSERT INTO public.class_join_requests (class_record_id, student_id, status, requested_at)
  VALUES (v_class.class_record_id, v_actor, 'pending', CURRENT_TIMESTAMP)
  ON CONFLICT (class_record_id, student_id) DO UPDATE SET
    status = 'pending',
    requested_at = CURRENT_TIMESTAMP,
    decided_at = NULL,
    decided_by = NULL,
    student_dismissed_at = NULL
  RETURNING * INTO v_request;

  IF v_class.faculty_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      v_class.faculty_id,
      'class_join_request',
      'New Enrollment Request',
      '/faculty/enrollmentrequests',
      'info',
      'A student requested to join ' || v_label || '. Review it in Enrollment Requests.',
      jsonb_build_object('class_record_id', v_class.class_record_id, 'request_id', v_request.request_id),
      'class_join_request:' || v_request.request_id::TEXT || ':' || floor(extract(epoch FROM v_request.requested_at))::BIGINT::TEXT,
      FALSE
    )
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'request_id', v_request.request_id,
    'status', v_request.status,
    'class_record_id', v_class.class_record_id,
    'subject_code', v_class.subject_code,
    'subject_name', v_class.subject_name,
    'section_name', v_class.section_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_class_join(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_class_join(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_class_join_request(
  p_request_id UUID,
  p_decision TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_decision TEXT := lower(btrim(COALESCE(p_decision, '')));
  v_request public.class_join_requests;
  v_class RECORD;
  v_other_section UUID;
  v_label TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;
  IF v_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'The decision must be approved or rejected.';
  END IF;

  SELECT * INTO v_request
  FROM public.class_join_requests r
  WHERE r.request_id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment request not found.';
  END IF;

  SELECT cr.class_record_id, cr.subject_id, cr.section_id, cr.faculty_id, cr.status,
         sub.code AS subject_code, sec.name AS section_name
  INTO v_class
  FROM public.class_records cr
  LEFT JOIN public.subjects sub ON sub.subject_id = cr.subject_id
  LEFT JOIN public.sections sec ON sec.section_id = cr.section_id
  WHERE cr.class_record_id = v_request.class_record_id
  FOR UPDATE OF cr;

  IF NOT FOUND
     OR v_class.faculty_id IS DISTINCT FROM v_actor
     OR COALESCE(v_class.status::TEXT, '') <> 'active'
     OR NOT EXISTS (
       SELECT 1 FROM public.users u
       WHERE u.user_id = v_actor AND u.role::TEXT = 'faculty' AND u.status = 'active'
     ) THEN
    RAISE EXCEPTION 'Only the active faculty assigned to this class can decide its enrollment requests.';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'This enrollment request has already been decided.';
  END IF;
  IF v_decision = 'approved' AND EXISTS (
    SELECT 1 FROM public.posted_grades grade
    WHERE grade.class_record_id = v_class.class_record_id
      AND grade.grade_period::TEXT = 'semestral_grade'
  ) THEN
    RAISE EXCEPTION 'Official Semestral Grades are already posted for this class, so its roster is closed and this request cannot be approved.';
  END IF;

  v_label := COALESCE(v_class.subject_code, 'the class')
    || COALESCE(' (' || v_class.section_name || ')', '');

  IF v_decision = 'approved' THEN
    SELECT e.section_id INTO v_other_section
    FROM public.enrollments e
    WHERE e.student_id = v_request.student_id
      AND e.subject_id = v_class.subject_id
    LIMIT 1;

    IF FOUND AND v_other_section IS DISTINCT FROM v_class.section_id THEN
      RAISE EXCEPTION 'This student is already enrolled in % in another section. Reject this request or ask an administrator.',
        COALESCE(v_class.subject_code, 'this subject');
    END IF;

    IF NOT FOUND THEN
      PERFORM set_config('aspire.enrollment_source', 'join_approval', true);
      INSERT INTO public.enrollments (student_id, subject_id, section_id, status)
      VALUES (v_request.student_id, v_class.subject_id, v_class.section_id, 'active');
    END IF;
  END IF;

  UPDATE public.class_join_requests
  SET status = v_decision,
      decided_at = CURRENT_TIMESTAMP,
      decided_by = v_actor,
      student_dismissed_at = NULL
  WHERE request_id = v_request.request_id
  RETURNING * INTO v_request;

  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
  ) VALUES (
    v_request.student_id,
    CASE WHEN v_decision = 'approved' THEN 'class_enrolled' ELSE 'class_join_declined' END,
    CASE WHEN v_decision = 'approved' THEN 'Class Registration Success' ELSE 'Enrollment Request Not Approved' END,
    '/student/mysubjects',
    'info',
    CASE WHEN v_decision = 'approved'
      THEN 'Your request to join ' || v_label || ' was approved. The class is now in My Subjects.'
      ELSE 'Your request to join ' || v_label || ' was not approved. Check the class code with your instructor.'
    END,
    jsonb_build_object('class_record_id', v_request.class_record_id, 'request_id', v_request.request_id, 'decision', v_decision),
    'class_join_decision:' || v_request.request_id::TEXT || ':' || floor(extract(epoch FROM v_request.decided_at))::BIGINT::TEXT,
    FALSE
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'request_id', v_request.request_id,
    'status', v_request.status,
    'class_record_id', v_request.class_record_id,
    'student_id', v_request.student_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_class_join_request(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_class_join_request(UUID, TEXT) TO authenticated;

COMMIT;
