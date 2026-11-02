-- AI Study Advising — spend ceiling and token accounting
-- =============================================================================
-- 2026-10-30. The project moved to a DIRECT DeepSeek account with a $2 ceiling.
--
-- WHAT WAS MISSING
-- The tutor already had a per-student burst limit and a per-student daily cap.
-- Neither bounds TOTAL spend. With 116 accounts at 20 calls a day, the worst
-- case is over 2,000 calls in a day -- enough to exhaust a $2 budget before
-- anyone noticed, and the failure mode is the feature going silently dead.
--
-- A per-user limit answers "is one student abusing this". It does not answer
-- "can we still afford to answer anyone". That is what this adds.
--
-- WHY COUNT RATHER THAN METER
-- There is no spend figure to read back from the provider mid-request, so the
-- ceiling is expressed in CALLS, which the system controls, and actual TOKEN
-- usage is recorded alongside so real cost can be worked out afterwards from
-- one published price. Counting is the control; tokens are the evidence.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The ceiling
-- -----------------------------------------------------------------------------
ALTER TABLE public.system_settings
  -- Total AI calls allowed since ai_budget_started_at. NULL means no ceiling,
  -- which is deliberately NOT the default: an unset budget on a paid account is
  -- how a small balance disappears.
  ADD COLUMN IF NOT EXISTS ai_call_budget INTEGER NOT NULL DEFAULT 1500,
  -- Moving this forward resets the count without deleting history, so the log
  -- stays complete for the thesis while the budget starts again.
  ADD COLUMN IF NOT EXISTS ai_budget_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Per student, per Philippine day. Lowered from the 20 that made sense
  -- against an unmetered free tier.
  ADD COLUMN IF NOT EXISTS ai_daily_cap_per_student INTEGER NOT NULL DEFAULT 25;

COMMENT ON COLUMN public.system_settings.ai_call_budget IS
  'Total AI Study Advising calls allowed since ai_budget_started_at. The spend ceiling.';

-- -----------------------------------------------------------------------------
-- 2. The evidence
-- -----------------------------------------------------------------------------
ALTER TABLE public.student_tutor_log
  ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS completion_tokens INTEGER,
  -- What the provider says actually served the request, which is not always
  -- what was asked for: a model name can be an alias that is repointed at a
  -- newer snapshot without notice. For a thesis that matters -- "which model
  -- produced these results" should be answerable from data, not from a
  -- configuration value that may have changed since.
  ADD COLUMN IF NOT EXISTS model_served TEXT;

-- Supports the global budget count, which runs before every AI call.
CREATE INDEX IF NOT EXISTS idx_student_tutor_log_budget
  ON public.student_tutor_log (created_at)
  WHERE used_ai;

-- -----------------------------------------------------------------------------
-- 3. Reading the budget
-- -----------------------------------------------------------------------------
-- One definition, used by the edge function before it spends anything and by
-- the admin page that displays it. Readable by any signed-in account: a student
-- who is refused deserves to be told the system is out of budget rather than
-- that something went wrong.
CREATE OR REPLACE FUNCTION public.aspire_tutor_budget()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'budget', s.ai_call_budget,
    'since', s.ai_budget_started_at,
    'daily_cap_per_student', s.ai_daily_cap_per_student,
    'used', (
      SELECT COUNT(*) FROM public.student_tutor_log l
      WHERE l.used_ai AND l.created_at >= s.ai_budget_started_at
    ),
    'remaining', GREATEST(s.ai_call_budget - (
      SELECT COUNT(*) FROM public.student_tutor_log l
      WHERE l.used_ai AND l.created_at >= s.ai_budget_started_at
    ), 0),
    'prompt_tokens', COALESCE((
      SELECT SUM(l.prompt_tokens) FROM public.student_tutor_log l
      WHERE l.used_ai AND l.created_at >= s.ai_budget_started_at
    ), 0),
    'completion_tokens', COALESCE((
      SELECT SUM(l.completion_tokens) FROM public.student_tutor_log l
      WHERE l.used_ai AND l.created_at >= s.ai_budget_started_at
    ), 0)
  )
  FROM public.system_settings s
  WHERE s.id = 1;
$$;

REVOKE ALL ON FUNCTION public.aspire_tutor_budget() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_tutor_budget() TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Changing it
-- -----------------------------------------------------------------------------
-- Admin only. Separate from set_maintenance_window so a budget change cannot
-- accidentally alter maintenance state, which shares the same row.
CREATE OR REPLACE FUNCTION public.aspire_set_tutor_budget(
  p_budget INTEGER,
  p_daily_cap INTEGER DEFAULT NULL,
  p_reset_window BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an administrator can change the AI budget.';
  END IF;

  IF p_budget IS NULL OR p_budget < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'The budget must be zero or more. Zero switches the tutor off.';
  END IF;

  IF p_daily_cap IS NOT NULL AND p_daily_cap < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'The per-student daily limit must be at least one.';
  END IF;

  UPDATE public.system_settings
  SET ai_call_budget = p_budget,
      ai_daily_cap_per_student = COALESCE(p_daily_cap, ai_daily_cap_per_student),
      -- Resetting the window restarts counting from now. History is kept.
      ai_budget_started_at = CASE WHEN p_reset_window THEN now() ELSE ai_budget_started_at END,
      updated_at = now()
  WHERE id = 1;

  RETURN public.aspire_tutor_budget();
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_set_tutor_budget(INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_set_tutor_budget(INTEGER, INTEGER, BOOLEAN) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Verification
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v JSONB;
BEGIN
  IF to_regprocedure('public.aspire_tutor_budget()') IS NULL
     OR to_regprocedure('public.aspire_set_tutor_budget(integer,integer,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the budget functions are missing.';
  END IF;

  SELECT public.aspire_tutor_budget() INTO v;
  IF v IS NULL OR v->>'budget' IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the budget reader returned nothing. system_settings may have no row.';
  END IF;

  -- A ceiling that defaults to unlimited would defeat the purpose of the file.
  IF (v->>'budget')::INTEGER <= 0 THEN
    RAISE WARNING 'The AI call budget is zero: the study tutor will refuse every request until it is raised.';
  END IF;

  RAISE NOTICE 'Tutor budget installed: % calls allowed, % used, per-student daily cap %.',
    v->>'budget', v->>'used', v->>'daily_cap_per_student';
END;
$verify$;

COMMIT;
