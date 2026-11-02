-- =============================================================================
-- Proof of work before a catch-up task can be marked done
-- =============================================================================
--
-- THE GAP
--   A student ticks a task; a faculty member clicks verify. There is nothing to
--   verify against. Objective 5 lists student acknowledgment and task
--   verification as two separate steps, and today the only thing separating
--   them is who clicked.
--
--   The task already states its artifact -- "Completed assignment with
--   step-by-step solutions for all counting and pigeonhole problems" -- so the
--   system describes the proof and cannot receive it.
--
-- WHO DECIDES
--   The faculty member, per task, when they write it. Not every task has an
--   artifact: faculty_consultation and attendance_recovery have none by nature
--   -- the instructor was there -- and the AI is allowed to generate both.
--   Requiring a file on every task would make those permanently un-tickable,
--   and would block a student who did the work but cannot scan it.
--
--   So requires_evidence is a property of the task, defaulted by action_type in
--   the client, and this function only enforces what the task says.
--
-- WHY THE GUARD IS HERE AND NOT ONLY IN THE UI
--   A disabled button is a courtesy. set_legacy_advising_task_completion is
--   callable directly, so without this a client could mark a task complete with
--   no evidence and the verification step would be back to trust. Same
--   reasoning as trg_block_frozen_term_scores in 20261031210000.
--
-- STORAGE
--   Supabase Storage, in the existing private evidence bucket, exactly as
--   grade-change evidence works today. The task records WHERE the file lives,
--   so the later move to R2 is a value change rather than a migration -- the
--   same pattern getEvidenceUrl() already branches on.
--
-- RETENTION
--   Evidence lives as long as the intervention record and is archived with it.
--   A verified outcome that can no longer be justified is weak support for
--   Hypothesis 2, which rests on the baseline-to-follow-up pairing being
--   auditable after the fact.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Attach evidence to one task, and mark it done in the same statement.
--    One call, because a tick without its file is the state this exists to
--    prevent -- two calls could leave it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_advising_task_completion_with_evidence(
  p_evaluation_id UUID,
  p_task_id TEXT,
  p_completed BOOLEAN,
  p_object_key TEXT DEFAULT NULL,
  p_storage TEXT DEFAULT 'supabase',
  p_mime TEXT DEFAULT NULL,
  p_size BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan JSONB;
  v_task JSONB;
  v_updated_plan JSONB;
  v_requires BOOLEAN;
  v_evidence JSONB;
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
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'This plan could not be found, or it is not yours to update.';
  END IF;

  SELECT task INTO v_task
  FROM jsonb_array_elements(v_plan) AS item(task)
  WHERE task->>'task_id' = p_task_id;

  IF v_task IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'That task is not part of this plan.';
  END IF;

  v_requires := COALESCE((v_task->>'requires_evidence')::BOOLEAN, FALSE);

  -- Only when marking DONE. Unticking must stay possible without re-uploading,
  -- or a student who ticked by mistake would be stuck.
  IF p_completed AND v_requires THEN
    IF p_object_key IS NULL OR BTRIM(p_object_key) = '' THEN
      -- The existing file still counts: a student correcting a mistaken untick
      -- should not have to send the same work twice.
      IF v_task->'evidence'->>'object_key' IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = 'This task needs a file before it can be marked done. Attach a photo or PDF of your work.';
      END IF;
    END IF;
  END IF;

  IF p_storage IS NOT NULL AND p_storage NOT IN ('supabase', 'r2') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Unsupported evidence storage.';
  END IF;

  v_evidence := CASE
    WHEN p_object_key IS NULL OR BTRIM(p_object_key) = '' THEN v_task->'evidence'
    ELSE jsonb_build_object(
      'object_key', BTRIM(p_object_key),
      'storage', COALESCE(p_storage, 'supabase'),
      'mime', p_mime,
      'size', p_size,
      'uploaded_at', CURRENT_TIMESTAMP
    )
  END;

  SELECT jsonb_agg(
    CASE
      WHEN task->>'task_id' = p_task_id THEN
        jsonb_set(
          jsonb_set(
            jsonb_set(task, '{completed}', to_jsonb(p_completed), TRUE),
            '{completed_at}',
            CASE WHEN p_completed THEN to_jsonb(CURRENT_TIMESTAMP) ELSE 'null'::JSONB END,
            TRUE
          ),
          '{evidence}', COALESCE(v_evidence, 'null'::JSONB), TRUE
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

REVOKE ALL ON FUNCTION public.set_advising_task_completion_with_evidence(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_advising_task_completion_with_evidence(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, BIGINT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Close the old door.
--    set_legacy_advising_task_completion takes no evidence, so leaving it
--    callable would leave the requirement optional in practice. It now
--    delegates, which keeps every existing caller working and routes them
--    through the same check.
-- -----------------------------------------------------------------------------
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
BEGIN
  -- No evidence passed: a task that requires it is refused, a task that does
  -- not is unaffected. Unticking continues to work either way.
  RETURN public.set_advising_task_completion_with_evidence(
    p_evaluation_id, p_task_id, p_completed, NULL, 'supabase', NULL, NULL
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_def TEXT;
BEGIN
  IF to_regprocedure('public.set_advising_task_completion_with_evidence(uuid,text,boolean,text,text,text,bigint)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the evidence-aware function was not created.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'set_legacy_advising_task_completion';

  IF position('set_advising_task_completion_with_evidence' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the legacy function still bypasses the evidence check.';
  END IF;

  RAISE NOTICE 'A task that requires proof can no longer be ticked without it.';
END $$;

COMMIT;
