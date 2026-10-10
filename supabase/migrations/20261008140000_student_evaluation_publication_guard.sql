-- =============================================================================
-- ASPIRE: STUDENT EVALUATION PUBLICATION GUARD
-- =============================================================================
-- Student pages consume only submitted/acknowledged evaluations with an
-- explicit publication timestamp. Draft and pending-review material remains
-- faculty-only. Task completion applies only to the same published records.

BEGIN;

UPDATE public.student_risk_evaluations
SET published_to_student_at = COALESCE(published_to_student_at, updated_at, created_at),
    published_by = COALESCE(published_by, faculty_id)
WHERE status IN ('submitted', 'acknowledged_by_student')
  AND published_to_student_at IS NULL;

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
  v_plan JSONB;
  v_updated_plan JSONB;
BEGIN
  SELECT advising_plan
  INTO v_plan
  FROM public.student_risk_evaluations
  WHERE evaluation_id = p_evaluation_id
    AND student_id = auth.uid()
    AND status IN ('submitted', 'acknowledged_by_student')
    AND published_to_student_at IS NOT NULL
  FOR UPDATE;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Published evaluation not found or task update is not authorized.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_plan) AS item(task)
    WHERE task->>'task_id' = p_task_id
  ) THEN
    RAISE EXCEPTION 'Intervention task not found.';
  END IF;

  SELECT jsonb_agg(
    CASE
      WHEN task->>'task_id' = p_task_id THEN
        jsonb_set(
          jsonb_set(task, '{completed}', to_jsonb(p_completed), TRUE),
          '{completed_at}',
          CASE
            WHEN p_completed THEN to_jsonb(CURRENT_TIMESTAMP)
            ELSE 'null'::JSONB
          END,
          TRUE
        )
      ELSE task
    END
    ORDER BY ordinal
  )
  INTO v_updated_plan
  FROM jsonb_array_elements(v_plan) WITH ORDINALITY AS plan(task, ordinal);

  UPDATE public.student_risk_evaluations
  SET advising_plan = COALESCE(v_updated_plan, '[]'::JSONB),
      updated_at = CURRENT_TIMESTAMP
  WHERE evaluation_id = p_evaluation_id;

  RETURN COALESCE(v_updated_plan, '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.set_legacy_advising_task_completion(UUID, TEXT, BOOLEAN)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_legacy_advising_task_completion(UUID, TEXT, BOOLEAN)
TO authenticated;

COMMIT;
