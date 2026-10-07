-- Support audited one-at-a-time AI additions after the initial three-task plan.
BEGIN;

ALTER TABLE public.faculty_intervention_drafts
  ADD COLUMN IF NOT EXISTS generation_mode TEXT NOT NULL DEFAULT 'initial_plan';

ALTER TABLE public.faculty_intervention_drafts
  DROP CONSTRAINT IF EXISTS faculty_intervention_drafts_generation_mode_check;

ALTER TABLE public.faculty_intervention_drafts
  ADD CONSTRAINT faculty_intervention_drafts_generation_mode_check
  CHECK (generation_mode IN ('initial_plan', 'additional_task'));

ALTER TABLE public.faculty_intervention_drafts
  DROP CONSTRAINT IF EXISTS faculty_intervention_drafts_generated_tasks_check;

ALTER TABLE public.faculty_intervention_drafts
  ADD CONSTRAINT faculty_intervention_drafts_generated_tasks_check
  CHECK (
    jsonb_typeof(generated_tasks) = 'array'
    AND (
      (generation_mode = 'initial_plan' AND jsonb_array_length(generated_tasks) = 3)
      OR (generation_mode = 'additional_task' AND jsonb_array_length(generated_tasks) = 1)
    )
  );

CREATE INDEX IF NOT EXISTS faculty_intervention_drafts_mode_history
  ON public.faculty_intervention_drafts(class_record_id, student_id, term, generation_mode, created_at DESC);

CREATE OR REPLACE FUNCTION public.accept_used_intervention_drafts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Suggestions generated for this case but omitted from the submitted plan
  -- remain auditable and are explicitly classified as discarded.
  UPDATE public.faculty_intervention_drafts draft
  SET status = 'discarded'
  WHERE draft.faculty_id = NEW.faculty_id
    AND draft.class_record_id = NEW.class_record_id
    AND draft.student_id = NEW.student_id
    AND draft.term = NEW.term
    AND draft.status IN ('generated', 'superseded')
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(NEW.advising_plan) task
      WHERE task->>'draft_id' = draft.draft_id::TEXT
    );

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

COMMIT;
