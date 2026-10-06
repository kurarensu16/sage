-- Transactional faculty referrals; evaluation/task/student status remain independent.
BEGIN;

CREATE TABLE public.student_evaluation_referrals (
  referral_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.student_risk_evaluations ON DELETE CASCADE,
  actor_id UUID REFERENCES public.users ON DELETE RESTRICT,
  request_id UUID,
  reason TEXT CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 1 AND 2000),
  legacy BOOLEAN NOT NULL DEFAULT FALSE,
  referred_at TIMESTAMPTZ,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'resolved')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.users ON DELETE RESTRICT,
  resolution_note TEXT CHECK (char_length(resolution_note) <= 2000),
  last_review_note TEXT CHECK (char_length(last_review_note) <= 2000),
  last_reviewed_at TIMESTAMPTZ,
  last_reviewed_by UUID REFERENCES public.users ON DELETE RESTRICT,
  CHECK (legacy OR (actor_id IS NOT NULL AND request_id IS NOT NULL AND reason IS NOT NULL AND referred_at IS NOT NULL)),
  CHECK ((state = 'pending' AND resolved_at IS NULL AND resolved_by IS NULL)
    OR (state = 'resolved' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)),
  UNIQUE (actor_id, request_id)
);
CREATE UNIQUE INDEX one_pending_evaluation_referral
  ON public.student_evaluation_referrals(evaluation_id) WHERE state = 'pending';
CREATE INDEX evaluation_referral_history ON public.student_evaluation_referrals(evaluation_id, referred_at DESC);

-- Every accepted request is remembered, even when it returns an existing pending
-- event. This prevents a retry of that request from reopening a resolved case.
CREATE TABLE public.student_evaluation_referral_requests (
  actor_id UUID NOT NULL REFERENCES public.users ON DELETE RESTRICT,
  request_id UUID NOT NULL,
  referral_id UUID NOT NULL REFERENCES public.student_evaluation_referrals ON DELETE CASCADE,
  PRIMARY KEY (actor_id, request_id)
);
ALTER TABLE public.student_evaluation_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_evaluation_referral_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_evaluation_referrals, public.student_evaluation_referral_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.student_evaluation_referrals TO authenticated;

CREATE POLICY authorized_referral_read ON public.student_evaluation_referrals
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.student_risk_evaluations e
  JOIN public.class_records c ON c.class_record_id = e.class_record_id
  JOIN public.sections s ON s.section_id = c.section_id
  JOIN public.users u ON u.user_id = auth.uid()
  WHERE e.evaluation_id = student_evaluation_referrals.evaluation_id
    AND u.status = 'active'
    AND (u.role = 'admin' OR (u.role = 'faculty' AND (c.faculty_id = u.user_id OR e.faculty_id = u.user_id))
      OR (u.role = 'dean' AND u.department_id = s.department_id))
));

INSERT INTO public.student_evaluation_referrals(evaluation_id, legacy)
SELECT evaluation_id, TRUE FROM public.student_risk_evaluations WHERE refer_to_dean IS TRUE;

CREATE FUNCTION public.refer_student_evaluation_to_dean(
  p_evaluation_id UUID, p_reason TEXT, p_request_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_case public.student_risk_evaluations;
  v_event public.student_evaluation_referrals;
  v_department UUID;
  v_deans UUID[];
  v_dean UUID;
  v_notifications UUID[];
  v_notification UUID;
  v_email TEXT;
BEGIN
  IF v_actor IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Authentication and request identity are required.'; END IF;
  -- Serialize identity reuse across different evaluations before taking case locks.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::TEXT || ':' || p_request_id::TEXT, 0));
  SELECT * INTO v_case FROM public.student_risk_evaluations WHERE evaluation_id = p_evaluation_id FOR UPDATE;
  SELECT s.department_id INTO v_department FROM public.class_records c
    JOIN public.sections s ON s.section_id = c.section_id
    JOIN public.users u ON u.user_id = v_actor
    WHERE c.class_record_id = v_case.class_record_id AND c.faculty_id = v_actor
      AND c.status = 'active' AND u.role = 'faculty' AND u.status = 'active';
  IF v_department IS NULL OR v_case.status NOT IN ('submitted', 'acknowledged_by_student') THEN
    RAISE EXCEPTION 'Only currently assigned faculty can refer a published evaluation in an active class.';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Enter a referral reason between 1 and 2000 characters.';
  END IF;
  SELECT r.* INTO v_event FROM public.student_evaluation_referral_requests q
    JOIN public.student_evaluation_referrals r ON r.referral_id = q.referral_id
    WHERE q.actor_id = v_actor AND q.request_id = p_request_id;
  IF FOUND AND v_event.evaluation_id <> p_evaluation_id THEN
    RAISE EXCEPTION 'Request identity was already used for a different evaluation.';
  END IF;
  IF v_event.referral_id IS NULL THEN
    SELECT * INTO v_event FROM public.student_evaluation_referrals
      WHERE evaluation_id = p_evaluation_id AND state = 'pending';
    IF v_event.referral_id IS NULL THEN
      SELECT array_agg(user_id) INTO v_deans FROM public.users
        WHERE role = 'dean' AND status = 'active' AND department_id = v_department;
      IF COALESCE(cardinality(v_deans), 0) = 0 THEN
        RAISE EXCEPTION 'No active Dean is assigned to this class department. Contact an administrator.';
      END IF;
      INSERT INTO public.student_evaluation_referrals(evaluation_id, actor_id, request_id, reason, referred_at)
        VALUES (p_evaluation_id, v_actor, p_request_id, btrim(p_reason), CURRENT_TIMESTAMP) RETURNING * INTO v_event;
      UPDATE public.student_risk_evaluations SET refer_to_dean = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE evaluation_id = p_evaluation_id RETURNING * INTO v_case;
      -- This function is the narrowly authorized writer; the general notification
      -- RPC remains restrictive. Existing notification INSERT triggers enqueue delivery.
      FOREACH v_dean IN ARRAY v_deans LOOP
        INSERT INTO public.notifications(recipient_id, type, title, message, link, severity, payload, dedupe_key, is_read)
        VALUES (v_dean, 'dean_referral', 'Faculty evaluation referral',
          'A faculty evaluation requires your review. Open the authorized discussion queue for details.',
          '/dean/atriskstudents?tab=discussion_queue&evaluation_id=' || p_evaluation_id::TEXT, 'info',
          jsonb_build_object('evaluation_id', p_evaluation_id, 'referral_id', v_event.referral_id),
          'dean_referral:' || v_event.referral_id::TEXT || ':' || v_dean::TEXT, FALSE)
          RETURNING notification_id INTO v_notification;
        -- Referral email has its own privacy-safe template in send-email. No
        -- guardian copy, risk, student name, or restricted reason is queued.
        SELECT email INTO v_email FROM public.users WHERE user_id = v_dean;
        IF NULLIF(btrim(v_email), '') IS NOT NULL AND COALESCE((
          SELECT email FROM public.notification_preferences WHERE user_id = v_dean AND notification_type = 'dean_referral'
        ), TRUE) THEN
          INSERT INTO public.notification_deliveries(notification_id, channel, recipient_id, target_address, status)
            VALUES (v_notification, 'email', v_dean, v_email, 'pending');
        END IF;
      END LOOP;
    END IF;
    INSERT INTO public.student_evaluation_referral_requests(actor_id, request_id, referral_id)
      VALUES (v_actor, p_request_id, v_event.referral_id);
  END IF;
  SELECT array_agg(notification_id) INTO v_notifications FROM public.notifications
    WHERE payload->>'referral_id' = v_event.referral_id::TEXT AND type = 'dean_referral';
  RETURN jsonb_build_object('evaluation_id', v_case.evaluation_id, 'refer_to_dean', v_case.refer_to_dean,
    'referral', to_jsonb(v_event), 'notification_ids', COALESCE(to_jsonb(v_notifications), '[]'::JSONB));
END;
$$;
REVOKE ALL ON FUNCTION public.refer_student_evaluation_to_dean(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refer_student_evaluation_to_dean(UUID, TEXT, UUID) TO authenticated;

-- Submission and Dean review replacements are appended below before COMMIT.

DROP FUNCTION public.submit_student_risk_evaluation(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, JSONB, TEXT, TEXT, JSONB, JSONB, BOOLEAN, TEXT);
CREATE OR REPLACE FUNCTION public.submit_student_risk_evaluation(
  p_class_record_id UUID,
  p_student_id UUID,
  p_term TEXT,
  p_evaluation_context TEXT,
  p_risk_level TEXT,
  p_risk_score NUMERIC,
  p_risk_breakdown JSONB,
  p_shared_academic_feedback TEXT,
  p_private_note TEXT,
  p_advising_plan JSONB DEFAULT '[]'::JSONB,
  p_baseline_snapshot JSONB DEFAULT '{}'::JSONB,
  p_refer_to_dean BOOLEAN DEFAULT FALSE,
  p_status TEXT DEFAULT 'submitted',
  p_referral_reason TEXT DEFAULT NULL,
  p_referral_request_id UUID DEFAULT NULL
)
RETURNS public.student_risk_evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT;
  v_class_faculty_id UUID;
  v_evaluation public.student_risk_evaluations;
  v_existing public.student_risk_evaluations;
  v_plan JSONB;
BEGIN
  SELECT role::TEXT
  INTO v_actor_role
  FROM public.users
  WHERE user_id = v_actor_id;

  SELECT faculty_id
  INTO v_class_faculty_id
  FROM public.class_records
  WHERE class_record_id = p_class_record_id;

  IF v_actor_id IS NULL
     OR v_actor_role IS NULL OR v_actor_role NOT IN ('faculty', 'admin')
     OR v_class_faculty_id IS NULL
     OR (v_actor_role = 'faculty' AND v_class_faculty_id <> v_actor_id) THEN
    RAISE EXCEPTION 'Not authorized to submit this student risk evaluation.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = p_student_id AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'The target student does not exist.';
  END IF;

  IF NULLIF(btrim(p_shared_academic_feedback), '') IS NULL THEN
    RAISE EXCEPTION 'Student-visible academic feedback is required.';
  END IF;

  IF NULLIF(btrim(p_private_note), '') IS NULL THEN
    RAISE EXCEPTION 'A restricted faculty note is required.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = v_actor_id AND status = 'active') THEN
    RAISE EXCEPTION 'An active account is required.';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Faculty may save draft or submitted evaluations only.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.class_records WHERE class_record_id = p_class_record_id AND status = 'active') THEN
    RAISE EXCEPTION 'Evaluations require an active class.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments en JOIN public.class_records c
      ON c.section_id = en.section_id AND c.subject_id = en.subject_id
    WHERE c.class_record_id = p_class_record_id AND en.student_id = p_student_id
  ) THEN RAISE EXCEPTION 'Student is not enrolled in this class.'; END IF;
  IF p_term IS NULL OR p_term NOT IN ('Prelim', 'Midterm', 'Semi-Final', 'Final') THEN
    RAISE EXCEPTION 'Select an explicit grading term.';
  END IF;
  IF jsonb_typeof(COALESCE(p_advising_plan, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Advising tasks must be an array.';
  END IF;
  -- Serialize first saves as well as edits; student task writes lock this same row.
  -- Match the tracker RPC's identity-before-case lock order on referral saves.
  IF p_refer_to_dean IS TRUE AND p_referral_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_actor_id::TEXT || ':' || p_referral_request_id::TEXT, 0));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_class_record_id::TEXT || ':' || p_student_id::TEXT || ':' || p_term, 0));
  SELECT * INTO v_existing FROM public.student_risk_evaluations
    WHERE class_record_id = p_class_record_id AND student_id = p_student_id AND term = p_term FOR UPDATE;
  IF v_existing.status <> 'draft' AND p_status = 'draft' THEN
    RAISE EXCEPTION 'A published evaluation cannot be changed back to draft.';
  END IF;
  SELECT COALESCE(jsonb_agg(
    (incoming.task - 'completed' - 'completed_at') || jsonb_build_object(
      'completed', COALESCE(old.task->'completed', 'false'::JSONB),
      'completed_at', COALESCE(old.task->'completed_at', 'null'::JSONB)) ORDER BY ordinal
  ), '[]'::JSONB) INTO v_plan
  FROM jsonb_array_elements(COALESCE(p_advising_plan, '[]'::JSONB)) WITH ORDINALITY AS incoming(task, ordinal)
  LEFT JOIN LATERAL (
    SELECT value AS task FROM jsonb_array_elements(COALESCE(v_existing.advising_plan, '[]'::JSONB))
    WHERE value->>'task_id' = incoming.task->>'task_id' LIMIT 1
  ) old ON TRUE;

  INSERT INTO public.student_risk_evaluations (
    class_record_id,
    student_id,
    faculty_id,
    term,
    evaluation_context,
    risk_level,
    risk_score,
    risk_breakdown,
    shared_academic_feedback,
    advising_plan,
    baseline_snapshot,
    refer_to_dean,
    status,
    published_to_student_at,
    published_by,
    updated_at
  ) VALUES (
    p_class_record_id,
    p_student_id,
    v_class_faculty_id,
    p_term,
    p_evaluation_context,
    p_risk_level,
    p_risk_score,
    COALESCE(p_risk_breakdown, '{}'::JSONB),
    btrim(p_shared_academic_feedback),
    v_plan,
    COALESCE(p_baseline_snapshot, '{}'::JSONB),
    COALESCE(v_existing.refer_to_dean, FALSE),
    p_status,
    CASE WHEN p_status = 'draft' THEN NULL ELSE CURRENT_TIMESTAMP END,
    CASE WHEN p_status = 'draft' THEN NULL ELSE v_actor_id END,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (class_record_id, student_id, term) DO UPDATE
  SET faculty_id = EXCLUDED.faculty_id,
      evaluation_context = EXCLUDED.evaluation_context,
      risk_level = EXCLUDED.risk_level,
      risk_score = EXCLUDED.risk_score,
      risk_breakdown = EXCLUDED.risk_breakdown,
      shared_academic_feedback = EXCLUDED.shared_academic_feedback,
      advising_plan = EXCLUDED.advising_plan,
      baseline_snapshot = EXCLUDED.baseline_snapshot,
      refer_to_dean = student_risk_evaluations.refer_to_dean,
      status = CASE WHEN student_risk_evaluations.status = 'acknowledged_by_student' THEN student_risk_evaluations.status ELSE EXCLUDED.status END,
      published_to_student_at = EXCLUDED.published_to_student_at,
      published_by = EXCLUDED.published_by,
      updated_at = CURRENT_TIMESTAMP
  RETURNING * INTO v_evaluation;

  INSERT INTO public.student_risk_private_notes (
    evaluation_id,
    author_id,
    note_text,
    retention_class,
    updated_at
  ) VALUES (
    v_evaluation.evaluation_id,
    v_actor_id,
    btrim(p_private_note),
    'academic_intervention',
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (evaluation_id, author_id) DO UPDATE
  SET note_text = EXCLUDED.note_text,
      retention_class = EXCLUDED.retention_class,
      updated_at = CURRENT_TIMESTAMP;

  IF p_refer_to_dean IS TRUE THEN
    PERFORM public.refer_student_evaluation_to_dean(v_evaluation.evaluation_id, p_referral_reason, p_referral_request_id);
    SELECT * INTO v_evaluation FROM public.student_risk_evaluations WHERE evaluation_id = v_evaluation.evaluation_id;
  END IF;
  RETURN v_evaluation;
END;
$$;


REVOKE ALL ON FUNCTION public.submit_student_risk_evaluation(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, JSONB, TEXT, TEXT, JSONB, JSONB, BOOLEAN, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_student_risk_evaluation(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, JSONB, TEXT, TEXT, JSONB, JSONB, BOOLEAN, TEXT, TEXT, UUID) TO authenticated;

DROP FUNCTION public.review_student_risk_evaluation(UUID, BOOLEAN, BOOLEAN, TEXT);
CREATE FUNCTION public.review_student_risk_evaluation(
  p_evaluation_id UUID, p_refer_to_dean BOOLEAN, p_requires_tutoring BOOLEAN,
  p_status TEXT, p_resolution_note TEXT DEFAULT NULL
) RETURNS public.student_risk_evaluations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_case public.student_risk_evaluations;
BEGIN
  SELECT * INTO v_case FROM public.student_risk_evaluations WHERE evaluation_id = p_evaluation_id FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM public.class_records c JOIN public.sections s ON s.section_id = c.section_id
    JOIN public.users u ON u.user_id = auth.uid()
    WHERE c.class_record_id = v_case.class_record_id AND u.status = 'active'
      AND (u.role = 'admin' OR (u.role = 'dean' AND u.department_id = s.department_id))
  ) THEN RAISE EXCEPTION 'Not authorized to review this evaluation.'; END IF;
  IF p_refer_to_dean IS NULL OR p_requires_tutoring IS NULL THEN
    RAISE EXCEPTION 'Review flags are required.';
  END IF;
  IF p_refer_to_dean AND NOT COALESCE(v_case.refer_to_dean, FALSE) THEN
    RAISE EXCEPTION 'Resolved cases require a new faculty referral.';
  END IF;
  IF char_length(p_resolution_note) > 2000 THEN RAISE EXCEPTION 'Review note must not exceed 2000 characters.'; END IF;
  UPDATE public.student_evaluation_referrals SET last_review_note = NULLIF(btrim(p_resolution_note), ''),
    last_reviewed_at = CURRENT_TIMESTAMP, last_reviewed_by = auth.uid()
    WHERE evaluation_id = p_evaluation_id AND state = 'pending';
  IF p_refer_to_dean IS FALSE THEN
    IF p_resolution_note IS NULL OR char_length(btrim(p_resolution_note)) NOT BETWEEN 1 AND 2000 THEN
      RAISE EXCEPTION 'Enter a resolution note between 1 and 2000 characters.';
    END IF;
    UPDATE public.student_evaluation_referrals SET state = 'resolved', resolved_at = CURRENT_TIMESTAMP,
      resolved_by = auth.uid(), resolution_note = btrim(p_resolution_note)
      WHERE evaluation_id = p_evaluation_id AND state = 'pending';
  END IF;
  -- p_status retained for caller compatibility. Only student acknowledgment may change it.
  UPDATE public.student_risk_evaluations SET refer_to_dean = p_refer_to_dean,
    requires_tutoring = p_requires_tutoring, updated_at = CURRENT_TIMESTAMP
    WHERE evaluation_id = p_evaluation_id RETURNING * INTO v_case;
  RETURN v_case;
END;
$$;
REVOKE ALL ON FUNCTION public.review_student_risk_evaluation(UUID, BOOLEAN, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_student_risk_evaluation(UUID, BOOLEAN, BOOLEAN, TEXT, TEXT) TO authenticated;
COMMIT;
