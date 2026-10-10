-- =============================================================================
-- ASPIRE: INTERVENTION FOLLOW-UP SNAPSHOTS AND FACULTY TASK VERIFICATION
-- =============================================================================
-- Closes the evaluation -> intervention -> follow-up loop:
--   * Students acknowledge each published plan before reporting task progress;
--     a faculty change to the plan's tasks or feedback requires re-acknowledgment.
--   * Students report task completion; the assigned faculty verifies or returns it.
--   * The assigned faculty records one immutable follow-up snapshot once an
--     official milestone (MR, TFR, or SG) has been posted after publication.
--   * A published evaluation keeps its original baseline and risk classification.

BEGIN;

ALTER TABLE public.student_risk_evaluations
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_recorded_by UUID REFERENCES public.users(user_id) ON DELETE RESTRICT;

-- Student acknowledgment of a published plan. Idempotent: acknowledging again
-- returns the row unchanged and keeps the first acknowledgment time.
CREATE OR REPLACE FUNCTION public.acknowledge_student_evaluation(p_evaluation_id UUID)
RETURNS public.student_risk_evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_case public.student_risk_evaluations;
BEGIN
  SELECT * INTO v_case
  FROM public.student_risk_evaluations
  WHERE evaluation_id = p_evaluation_id
    AND student_id = auth.uid()
    AND status IN ('submitted', 'acknowledged_by_student')
    AND published_to_student_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published evaluation not found or acknowledgment is not authorized.';
  END IF;
  IF v_case.status = 'acknowledged_by_student' AND v_case.acknowledged_at IS NOT NULL THEN
    RETURN v_case;
  END IF;

  UPDATE public.student_risk_evaluations
  SET status = 'acknowledged_by_student',
      acknowledged_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE evaluation_id = p_evaluation_id
  RETURNING * INTO v_case;

  RETURN v_case;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_student_evaluation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_student_evaluation(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_recorded_followup_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.followup_snapshot IS NOT NULL
     AND NEW.followup_snapshot IS DISTINCT FROM OLD.followup_snapshot THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'A recorded follow-up snapshot is immutable.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_recorded_followup_snapshot ON public.student_risk_evaluations;
CREATE TRIGGER trg_protect_recorded_followup_snapshot
BEFORE UPDATE OF followup_snapshot ON public.student_risk_evaluations
FOR EACH ROW EXECUTE FUNCTION public.protect_recorded_followup_snapshot();

-- Student-reported completion. Verified tasks are locked; re-reporting a
-- returned task clears its returned state so it re-enters faculty review.
CREATE OR REPLACE FUNCTION public.set_legacy_advising_task_completion(
  p_evaluation_id UUID,
  p_task_id TEXT,
  p_completed BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_case public.student_risk_evaluations;
  v_task JSONB;
  v_updated_plan JSONB;
BEGIN
  IF p_completed IS NULL THEN
    RAISE EXCEPTION 'A completion value is required.';
  END IF;

  SELECT * INTO v_case
  FROM public.student_risk_evaluations
  WHERE evaluation_id = p_evaluation_id
    AND student_id = auth.uid()
    AND status IN ('submitted', 'acknowledged_by_student')
    AND published_to_student_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published evaluation not found or task update is not authorized.';
  END IF;
  IF v_case.status <> 'acknowledged_by_student' OR v_case.acknowledged_at IS NULL THEN
    RAISE EXCEPTION 'Acknowledge this intervention plan before reporting task progress.';
  END IF;
  IF v_case.followup_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'This intervention plan is closed because its follow-up has been recorded.';
  END IF;

  SELECT item.task INTO v_task
  FROM jsonb_array_elements(COALESCE(v_case.advising_plan, '[]'::JSONB)) AS item(task)
  WHERE item.task->>'task_id' = p_task_id
  LIMIT 1;

  IF v_task IS NULL THEN
    RAISE EXCEPTION 'Intervention task not found.';
  END IF;
  IF v_task->>'verification_status' = 'verified' THEN
    RAISE EXCEPTION 'Your instructor has already verified this task.';
  END IF;

  SELECT jsonb_agg(
    CASE
      WHEN plan.task->>'task_id' = p_task_id THEN
        (plan.task - 'completed' - 'completed_at' - 'verification_status')
        || jsonb_build_object(
          'completed', p_completed,
          'completed_at', CASE WHEN p_completed THEN to_jsonb(CURRENT_TIMESTAMP) ELSE 'null'::JSONB END
        )
      ELSE plan.task
    END
    ORDER BY plan.ordinal
  )
  INTO v_updated_plan
  FROM jsonb_array_elements(v_case.advising_plan) WITH ORDINALITY AS plan(task, ordinal);

  UPDATE public.student_risk_evaluations
  SET advising_plan = COALESCE(v_updated_plan, '[]'::JSONB),
      updated_at = CURRENT_TIMESTAMP
  WHERE evaluation_id = p_evaluation_id;

  RETURN COALESCE(v_updated_plan, '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.set_legacy_advising_task_completion(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_legacy_advising_task_completion(UUID, TEXT, BOOLEAN) TO authenticated;

-- Faculty verification of a student-reported task. Returning a task requires a
-- note and reopens it for the student; it never changes grades.
CREATE OR REPLACE FUNCTION public.verify_intervention_task(
  p_evaluation_id UUID,
  p_task_id TEXT,
  p_verified BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_case public.student_risk_evaluations;
  v_task JSONB;
  v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_updated_plan JSONB;
BEGIN
  IF v_actor IS NULL OR p_verified IS NULL THEN
    RAISE EXCEPTION 'Authentication and a verification decision are required.';
  END IF;

  SELECT * INTO v_case
  FROM public.student_risk_evaluations
  WHERE evaluation_id = p_evaluation_id
  FOR UPDATE;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.class_records c
    JOIN public.users u ON u.user_id = v_actor
    WHERE c.class_record_id = v_case.class_record_id
      AND c.faculty_id = v_actor
      AND c.status = 'active'
      AND u.role = 'faculty'
      AND u.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only the currently assigned faculty of an active class can verify intervention tasks.';
  END IF;
  IF v_case.status NOT IN ('submitted', 'acknowledged_by_student') OR v_case.published_to_student_at IS NULL THEN
    RAISE EXCEPTION 'Only tasks in a published evaluation can be verified.';
  END IF;
  IF v_case.followup_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'This intervention plan is closed because its follow-up has been recorded.';
  END IF;

  SELECT item.task INTO v_task
  FROM jsonb_array_elements(COALESCE(v_case.advising_plan, '[]'::JSONB)) AS item(task)
  WHERE item.task->>'task_id' = p_task_id
  LIMIT 1;

  IF v_task IS NULL THEN
    RAISE EXCEPTION 'Intervention task not found.';
  END IF;
  IF v_task->'completed' IS DISTINCT FROM 'true'::JSONB OR v_task->>'verification_status' = 'verified' THEN
    RAISE EXCEPTION 'Only tasks the student reported complete and that await review can be verified or returned.';
  END IF;
  IF NOT p_verified AND (v_note IS NULL OR char_length(v_note) > 500) THEN
    RAISE EXCEPTION 'Enter a note of 1 to 500 characters telling the student what is still needed.';
  END IF;

  SELECT jsonb_agg(
    CASE
      WHEN plan.task->>'task_id' IS DISTINCT FROM p_task_id THEN plan.task
      WHEN p_verified THEN
        (plan.task - 'verification_status' - 'verified_at' - 'verified_by')
        || jsonb_build_object(
          'verification_status', 'verified',
          'verified_at', to_jsonb(CURRENT_TIMESTAMP),
          'verified_by', to_jsonb(v_actor)
        )
      ELSE
        (plan.task - 'completed' - 'completed_at' - 'verification_status' - 'return_note' - 'returned_at' - 'returned_by')
        || jsonb_build_object(
          'completed', FALSE,
          'completed_at', 'null'::JSONB,
          'verification_status', 'returned',
          'return_note', v_note,
          'returned_at', to_jsonb(CURRENT_TIMESTAMP),
          'returned_by', to_jsonb(v_actor)
        )
    END
    ORDER BY plan.ordinal
  )
  INTO v_updated_plan
  FROM jsonb_array_elements(v_case.advising_plan) WITH ORDINALITY AS plan(task, ordinal);

  UPDATE public.student_risk_evaluations
  SET advising_plan = v_updated_plan,
      updated_at = CURRENT_TIMESTAMP
  WHERE evaluation_id = p_evaluation_id;

  RETURN v_updated_plan;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_intervention_task(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_intervention_task(UUID, TEXT, BOOLEAN, TEXT) TO authenticated;

-- One-time follow-up snapshot. The client supplies the current standing computed
-- by the same shared risk engine used for the baseline; the server validates it
-- and stamps the qualifying milestone, task counts, actor, and time.
CREATE OR REPLACE FUNCTION public.record_intervention_followup(
  p_evaluation_id UUID,
  p_followup JSONB
)
RETURNS public.student_risk_evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_case public.student_risk_evaluations;
  v_milestone_period TEXT;
  v_milestone_posted_at TIMESTAMPTZ;
  v_level TEXT;
  v_score NUMERIC;
  v_gwa NUMERIC;
  v_total INTEGER;
  v_reported INTEGER;
  v_verified INTEGER;
  v_snapshot JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  SELECT * INTO v_case
  FROM public.student_risk_evaluations
  WHERE evaluation_id = p_evaluation_id
  FOR UPDATE;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.class_records c
    JOIN public.users u ON u.user_id = v_actor
    WHERE c.class_record_id = v_case.class_record_id
      AND c.faculty_id = v_actor
      AND c.status = 'active'
      AND u.role = 'faculty'
      AND u.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only the currently assigned faculty of an active class can record a follow-up.';
  END IF;
  IF v_case.status NOT IN ('submitted', 'acknowledged_by_student') OR v_case.published_to_student_at IS NULL THEN
    RAISE EXCEPTION 'Only a published evaluation can receive a follow-up.';
  END IF;
  IF v_case.followup_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'A follow-up has already been recorded for this evaluation and cannot be changed.';
  END IF;

  IF p_followup IS NULL OR jsonb_typeof(p_followup) <> 'object' THEN
    RAISE EXCEPTION 'Follow-up values are required.';
  END IF;
  v_level := p_followup->>'risk_level';
  IF jsonb_typeof(p_followup->'risk_score') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'A numeric follow-up risk score is required.';
  END IF;
  v_score := (p_followup->>'risk_score')::NUMERIC;
  IF v_score < 0 OR v_score > 100 THEN
    RAISE EXCEPTION 'The follow-up risk score must be between 0 and 100.';
  END IF;
  -- Tier boundaries mirror RISK_TIERS in src/lib/academicPolicy.js.
  -- Parenthesized: PL/pgSQL ends an IF condition at the first THEN it sees.
  IF v_level IS DISTINCT FROM (CASE
       WHEN v_score >= 75 THEN 'critical'
       WHEN v_score >= 50 THEN 'high'
       WHEN v_score >= 25 THEN 'moderate'
       ELSE 'low'
     END) THEN
    RAISE EXCEPTION 'The follow-up risk level does not match its risk score.';
  END IF;
  IF COALESCE(jsonb_typeof(p_followup->'gwa'), 'null') NOT IN ('null', 'number') THEN
    RAISE EXCEPTION 'The follow-up GWA must be a number or empty.';
  END IF;
  IF jsonb_typeof(p_followup->'gwa') = 'number' THEN
    v_gwa := (p_followup->>'gwa')::NUMERIC;
    IF v_gwa < 1 OR v_gwa > 5 THEN
      RAISE EXCEPTION 'The follow-up GWA must be between 1.00 and 5.00.';
    END IF;
  END IF;

  SELECT pg.grade_period, pg.posted_at
  INTO v_milestone_period, v_milestone_posted_at
  FROM public.posted_grades pg
  WHERE pg.class_record_id = v_case.class_record_id
    AND pg.student_id = v_case.student_id
    AND pg.grade_period IN ('midterm_rating', 'tentative_final_rating', 'semestral_grade')
    AND pg.posted_at > v_case.published_to_student_at
  ORDER BY pg.posted_at DESC
  LIMIT 1;

  IF v_milestone_period IS NULL THEN
    RAISE EXCEPTION 'Record the follow-up after the next official grade milestone (MR, TFR, or SG) is posted for this student.';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE item.task->'completed' = 'true'::JSONB),
         count(*) FILTER (WHERE item.task->>'verification_status' = 'verified')
  INTO v_total, v_reported, v_verified
  FROM jsonb_array_elements(COALESCE(v_case.advising_plan, '[]'::JSONB)) AS item(task);

  v_snapshot := (p_followup
      - 'captured_at' - 'captured_by' - 'milestone' - 'milestone_posted_at'
      - 'tasks_total' - 'tasks_reported' - 'tasks_verified' - 'tasks_completed')
    || jsonb_build_object(
      'captured_at', CURRENT_TIMESTAMP,
      'captured_by', v_actor,
      'milestone', v_milestone_period,
      'milestone_posted_at', v_milestone_posted_at,
      'tasks_total', v_total,
      'tasks_reported', v_reported,
      'tasks_verified', v_verified,
      'tasks_completed', v_verified
    );

  UPDATE public.student_risk_evaluations
  SET followup_snapshot = v_snapshot,
      followup_recorded_at = CURRENT_TIMESTAMP,
      followup_recorded_by = v_actor,
      updated_at = CURRENT_TIMESTAMP
  WHERE evaluation_id = p_evaluation_id
  RETURNING * INTO v_case;

  RETURN v_case;
END;
$$;

REVOKE ALL ON FUNCTION public.record_intervention_followup(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_intervention_followup(UUID, JSONB) TO authenticated;

-- Same signature as 20261006120000. Changes: a closed (followed-up) evaluation
-- cannot be resubmitted; per-task verification state survives faculty edits; a
-- published evaluation keeps its first baseline, risk classification, and
-- publication time so later edits cannot rewrite the historical record; and a
-- change to the tasks or student-visible feedback clears the student's
-- acknowledgment so the revised plan must be acknowledged again.
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
  v_content_changed BOOLEAN := FALSE;
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
  IF p_refer_to_dean IS TRUE AND p_referral_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_actor_id::TEXT || ':' || p_referral_request_id::TEXT, 0));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_class_record_id::TEXT || ':' || p_student_id::TEXT || ':' || p_term, 0));
  SELECT * INTO v_existing FROM public.student_risk_evaluations
    WHERE class_record_id = p_class_record_id AND student_id = p_student_id AND term = p_term FOR UPDATE;
  IF v_existing.status <> 'draft' AND p_status = 'draft' THEN
    RAISE EXCEPTION 'A published evaluation cannot be changed back to draft.';
  END IF;
  IF v_existing.followup_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'A follow-up has been recorded for this evaluation, so its intervention record is closed.';
  END IF;

  SELECT COALESCE(jsonb_agg(
    (incoming.task - 'completed' - 'completed_at' - 'verification_status' - 'verified_at' - 'verified_by'
      - 'return_note' - 'returned_at' - 'returned_by')
    || jsonb_build_object(
      'completed', COALESCE(old.task->'completed', 'false'::JSONB),
      'completed_at', COALESCE(old.task->'completed_at', 'null'::JSONB))
    || jsonb_strip_nulls(jsonb_build_object(
      'verification_status', old.task->'verification_status',
      'verified_at', old.task->'verified_at',
      'verified_by', old.task->'verified_by',
      'return_note', old.task->'return_note',
      'returned_at', old.task->'returned_at',
      'returned_by', old.task->'returned_by'))
    ORDER BY ordinal
  ), '[]'::JSONB) INTO v_plan
  FROM jsonb_array_elements(COALESCE(p_advising_plan, '[]'::JSONB)) WITH ORDINALITY AS incoming(task, ordinal)
  LEFT JOIN LATERAL (
    SELECT value AS task FROM jsonb_array_elements(COALESCE(v_existing.advising_plan, '[]'::JSONB))
    WHERE value->>'task_id' = incoming.task->>'task_id' LIMIT 1
  ) old ON TRUE;

  -- What the student acknowledged: feedback plus each task's identity, text, and due date.
  IF v_existing.evaluation_id IS NOT NULL THEN
    v_content_changed :=
      v_existing.shared_academic_feedback IS DISTINCT FROM btrim(p_shared_academic_feedback)
      OR (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(t->>'task_id', t->>'description', t->>'due_date') ORDER BY o), '[]'::JSONB)
        FROM jsonb_array_elements(COALESCE(v_existing.advising_plan, '[]'::JSONB)) WITH ORDINALITY AS x(t, o)
      ) IS DISTINCT FROM (
        SELECT COALESCE(jsonb_agg(jsonb_build_array(t->>'task_id', t->>'description', t->>'due_date') ORDER BY o), '[]'::JSONB)
        FROM jsonb_array_elements(v_plan) WITH ORDINALITY AS x(t, o)
      );
  END IF;

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
      risk_level = CASE WHEN student_risk_evaluations.published_to_student_at IS NULL
        THEN EXCLUDED.risk_level ELSE student_risk_evaluations.risk_level END,
      risk_score = CASE WHEN student_risk_evaluations.published_to_student_at IS NULL
        THEN EXCLUDED.risk_score ELSE student_risk_evaluations.risk_score END,
      risk_breakdown = CASE WHEN student_risk_evaluations.published_to_student_at IS NULL
        THEN EXCLUDED.risk_breakdown ELSE student_risk_evaluations.risk_breakdown END,
      shared_academic_feedback = EXCLUDED.shared_academic_feedback,
      advising_plan = EXCLUDED.advising_plan,
      baseline_snapshot = CASE WHEN student_risk_evaluations.published_to_student_at IS NULL
          OR student_risk_evaluations.baseline_snapshot = '{}'::JSONB
        THEN EXCLUDED.baseline_snapshot ELSE student_risk_evaluations.baseline_snapshot END,
      refer_to_dean = student_risk_evaluations.refer_to_dean,
      status = CASE WHEN student_risk_evaluations.status = 'acknowledged_by_student' AND NOT v_content_changed
        THEN student_risk_evaluations.status ELSE EXCLUDED.status END,
      acknowledged_at = CASE WHEN v_content_changed THEN NULL ELSE student_risk_evaluations.acknowledged_at END,
      published_to_student_at = COALESCE(student_risk_evaluations.published_to_student_at, EXCLUDED.published_to_student_at),
      published_by = COALESCE(student_risk_evaluations.published_by, EXCLUDED.published_by),
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

-- Notification preferences: the owner-only INSERT/UPDATE policies already exist
-- (20261001170000) but only SELECT was granted, so the Settings page could not save.
-- The in-app inbox is never muted; device alerts and email are per-type opt-outs.
GRANT INSERT, UPDATE ON public.notification_preferences TO authenticated;
UPDATE public.notification_preferences SET in_app = TRUE WHERE in_app IS DISTINCT FROM TRUE;
ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_in_app_always_on;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_in_app_always_on CHECK (in_app);

COMMIT;
