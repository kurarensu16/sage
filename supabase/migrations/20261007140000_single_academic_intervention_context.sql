-- Use one context for all newly submitted faculty academic interventions while
-- retaining legacy values for historical records.

BEGIN;

ALTER TABLE public.student_risk_evaluations
  DROP CONSTRAINT IF EXISTS student_risk_evaluations_evaluation_context_check;

ALTER TABLE public.student_risk_evaluations
  ADD CONSTRAINT student_risk_evaluations_evaluation_context_check
  CHECK (evaluation_context IN ('academic_intervention', 'passing_recovery', 'pl_retention'));

ALTER TABLE public.student_risk_evaluations
  ALTER COLUMN evaluation_context SET DEFAULT 'academic_intervention';

COMMENT ON COLUMN public.student_risk_evaluations.evaluation_context IS
  'New evaluations use academic_intervention. passing_recovery and pl_retention are retained for historical records only.';

COMMIT;
