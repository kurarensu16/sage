-- Require every student-reported task to be reviewed before a follow-up closes the plan.
--
-- Same signature and behavior as 20261010120000, plus one check: recording the
-- follow-up is rejected while any task is reported complete but not yet verified
-- or returned by the faculty. Unreported tasks do not block it, so a student who
-- ignores the plan cannot keep it open. Already-recorded follow-ups are unchanged.

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

  -- A task the student reported but the faculty has not yet verified or returned
  -- would be frozen as "awaiting verification" forever once the plan closes.
  IF v_reported > v_verified THEN
    RAISE EXCEPTION 'Review every task the student reported (verify or return it) before recording the follow-up. % task(s) still await your review.', v_reported - v_verified;
  END IF;

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
