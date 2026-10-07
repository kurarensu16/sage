-- AI-assisted faculty intervention drafts and authoritative task validation.
BEGIN;

CREATE TABLE public.faculty_intervention_drafts (
  draft_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  faculty_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  class_record_id UUID NOT NULL REFERENCES public.class_records(class_record_id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  term TEXT NOT NULL CHECK (term IN ('Prelim', 'Midterm', 'Semi-Final', 'Final')),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  snapshot_hash TEXT NOT NULL CHECK (char_length(snapshot_hash) BETWEEN 16 AND 128),
  generated_tasks JSONB NOT NULL CHECK (jsonb_typeof(generated_tasks) = 'array' AND jsonb_array_length(generated_tasks) = 3),
  summary TEXT NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 1 AND 1200),
  model TEXT NOT NULL CHECK (char_length(model) BETWEEN 1 AND 200),
  prompt_version TEXT NOT NULL CHECK (char_length(prompt_version) BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'accepted', 'discarded', 'superseded')),
  accepted_evaluation_id UUID REFERENCES public.student_risk_evaluations(evaluation_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMPTZ,
  UNIQUE (faculty_id, request_id),
  CHECK ((status = 'accepted' AND accepted_evaluation_id IS NOT NULL AND accepted_at IS NOT NULL)
    OR (status <> 'accepted' AND accepted_at IS NULL))
);

CREATE INDEX faculty_intervention_drafts_case_history
  ON public.faculty_intervention_drafts(class_record_id, student_id, term, created_at DESC);

ALTER TABLE public.faculty_intervention_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.faculty_intervention_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.faculty_intervention_drafts TO authenticated;

CREATE POLICY faculty_intervention_draft_read ON public.faculty_intervention_drafts
FOR SELECT TO authenticated USING (
  faculty_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.users actor
    WHERE actor.user_id = auth.uid() AND actor.role = 'faculty' AND actor.status = 'active'
  )
);

CREATE POLICY admin_intervention_draft_read ON public.faculty_intervention_drafts
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.users actor
    WHERE actor.user_id = auth.uid() AND actor.role = 'admin' AND actor.status = 'active'
  )
);

CREATE OR REPLACE FUNCTION public.validate_intervention_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task JSONB;
  v_task_id TEXT;
  v_description TEXT;
  v_target_term TEXT;
  v_due_date TEXT;
  v_seen_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Legacy rows with empty plans remain readable and may receive unrelated status
  -- updates. Validate whenever a plan is first inserted or actually changed.
  IF TG_OP = 'UPDATE' AND NEW.advising_plan IS NOT DISTINCT FROM OLD.advising_plan THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.advising_plan) <> 'array' THEN
    RAISE EXCEPTION 'Advising tasks must be an array.';
  END IF;
  IF jsonb_array_length(NEW.advising_plan) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'An intervention plan requires between 1 and 5 valid tasks.';
  END IF;

  FOR v_task IN SELECT value FROM jsonb_array_elements(NEW.advising_plan)
  LOOP
    IF jsonb_typeof(v_task) <> 'object' THEN
      RAISE EXCEPTION 'Every intervention task must be an object.';
    END IF;
    v_task_id := btrim(COALESCE(v_task->>'task_id', ''));
    v_description := btrim(COALESCE(v_task->>'description', ''));
    v_target_term := NULLIF(btrim(COALESCE(v_task->>'target_term', '')), '');
    v_due_date := NULLIF(btrim(COALESCE(v_task->>'due_date', '')), '');

    IF v_task_id = '' OR char_length(v_task_id) > 120 THEN
      RAISE EXCEPTION 'Every intervention task requires a valid task ID.';
    END IF;
    IF v_task_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'Intervention task IDs must be unique.';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_task_id);

    IF v_description = '' OR char_length(v_description) > 500 THEN
      RAISE EXCEPTION 'Every intervention task requires a description of 1 to 500 characters.';
    END IF;
    -- Preserve AI provenance after faculty review, but apply generation-specific
    -- shape constraints only while the text is still the untouched model output.
    IF v_task->>'source' = 'ai_assisted'
       AND COALESCE((v_task->>'faculty_edited')::BOOLEAN, FALSE) IS FALSE THEN
      IF char_length(v_description) NOT BETWEEN 40 AND 300 THEN
        RAISE EXCEPTION 'AI-assisted task descriptions must contain 40 to 300 characters.';
      END IF;
      IF char_length(btrim(COALESCE(v_task->>'deliverable', ''))) NOT BETWEEN 1 AND 300 THEN
        RAISE EXCEPTION 'AI-assisted tasks require a measurable deliverable of up to 300 characters.';
      END IF;
      IF COALESCE(v_task->>'action_type', '') NOT IN (
        'complete_missing_work', 'correct_failed_work', 'targeted_review', 'practice_assessment',
        'faculty_consultation', 'attendance_recovery', 'study_plan', 'performance_maintenance'
      ) THEN RAISE EXCEPTION 'An AI-assisted task has an invalid action type.'; END IF;
      IF COALESCE(v_task->>'priority', '') NOT IN ('immediate', 'developmental', 'follow_up') THEN
        RAISE EXCEPTION 'An AI-assisted task has an invalid priority.';
      END IF;
      IF jsonb_typeof(v_task->'basis_codes') <> 'array' OR jsonb_array_length(v_task->'basis_codes') = 0 THEN
        RAISE EXCEPTION 'AI-assisted tasks require academic evidence codes.';
      END IF;
    END IF;
    IF v_target_term IS NOT NULL AND v_target_term NOT IN ('Prelim', 'Midterm', 'Semi-Final', 'Final') THEN
      RAISE EXCEPTION 'An intervention task has an invalid target term.';
    END IF;
    IF v_due_date IS NOT NULL AND (
      v_due_date !~ '^\d{4}-\d{2}-\d{2}$'
      OR to_char(to_date(v_due_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> v_due_date
    ) THEN
      RAISE EXCEPTION 'An intervention task has an invalid due date.';
    END IF;
    IF v_task ? 'draft_id' AND COALESCE(v_task->>'draft_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'An intervention task has an invalid AI draft identity.';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_student_risk_intervention_plan ON public.student_risk_evaluations;
CREATE TRIGGER validate_student_risk_intervention_plan
BEFORE INSERT OR UPDATE OF advising_plan ON public.student_risk_evaluations
FOR EACH ROW EXECUTE FUNCTION public.validate_intervention_plan();

CREATE OR REPLACE FUNCTION public.accept_used_intervention_drafts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.faculty_intervention_drafts draft
  SET status = 'accepted', accepted_evaluation_id = NEW.evaluation_id, accepted_at = CURRENT_TIMESTAMP
  WHERE draft.faculty_id = NEW.faculty_id
    AND draft.class_record_id = NEW.class_record_id
    AND draft.student_id = NEW.student_id
    AND draft.term = NEW.term
    AND draft.status IN ('generated', 'superseded')
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(NEW.advising_plan) task
      WHERE task->>'draft_id' = draft.draft_id::TEXT
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accept_used_intervention_drafts ON public.student_risk_evaluations;
CREATE TRIGGER accept_used_intervention_drafts
AFTER INSERT OR UPDATE OF advising_plan ON public.student_risk_evaluations
FOR EACH ROW EXECUTE FUNCTION public.accept_used_intervention_drafts();

COMMIT;
