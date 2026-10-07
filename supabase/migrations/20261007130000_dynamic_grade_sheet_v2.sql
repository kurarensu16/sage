-- Dynamic Grade Sheet v2 foundations.
-- Additive and backward-compatible: the current legacy term-score columns stay
-- available while fixed-component data migrates to normalized rows.

BEGIN;

ALTER TABLE public.grade_computations
  ADD COLUMN IF NOT EXISTS formula_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE public.grade_computation_components
  ADD COLUMN IF NOT EXISTS semantic_type TEXT,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.grade_computation_components
SET semantic_type = CASE
  WHEN is_multiple THEN 'coursework'
  WHEN name ILIKE '%character%' THEN 'character'
  WHEN name ILIKE '%exam%' THEN 'written_exam'
  ELSE 'other'
END
WHERE semantic_type IS NULL;

ALTER TABLE public.grade_computation_components
  ALTER COLUMN semantic_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grade_component_semantic_type_check'
      AND conrelid = 'public.grade_computation_components'::regclass
  ) THEN
    ALTER TABLE public.grade_computation_components
      ADD CONSTRAINT grade_component_semantic_type_check
      CHECK (semantic_type IN (
        'coursework', 'character', 'written_exam', 'practical_exam',
        'skills_assessment', 'rubric_assessment', 'other'
      ));
  END IF;
END $$;

WITH ordered AS (
  SELECT component_id,
         ROW_NUMBER() OVER (PARTITION BY computation_id ORDER BY created_at, component_id) - 1 AS position
  FROM public.grade_computation_components
)
UPDATE public.grade_computation_components component
SET display_order = ordered.position
FROM ordered
WHERE component.component_id = ordered.component_id;

CREATE TABLE IF NOT EXISTS public.student_component_scores (
  component_score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_record_id UUID NOT NULL REFERENCES public.class_records(class_record_id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES public.grade_computation_components(component_id) ON DELETE RESTRICT,
  term VARCHAR(20) NOT NULL CHECK (term IN ('Prelim', 'Midterm', 'Semi-Final', 'Final')),
  score NUMERIC(8,2) NOT NULL CHECK (score >= 0),
  max_score NUMERIC(8,2) NOT NULL CHECK (max_score > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT student_component_scores_unique UNIQUE (class_record_id, student_id, component_id, term),
  CONSTRAINT student_component_scores_within_max CHECK (score <= max_score)
);

CREATE INDEX IF NOT EXISTS idx_student_component_scores_class_term
  ON public.student_component_scores(class_record_id, term);
CREATE INDEX IF NOT EXISTS idx_student_component_scores_student
  ON public.student_component_scores(student_id);

-- Match the project's current development policy. RLS must be enabled with
-- role-specific policies before production hardening.
ALTER TABLE public.student_component_scores DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bump_grade_computation_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.weight IS NOT DISTINCT FROM OLD.weight THEN
      RETURN NULL;
    END IF;
    UPDATE public.grade_computations
    SET formula_version = formula_version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE computation_id = NEW.computation_id;
  ELSIF TG_OP = 'INSERT' THEN
    UPDATE public.grade_computations
    SET formula_version = formula_version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE computation_id = NEW.computation_id;
  ELSE
    UPDATE public.grade_computations
    SET formula_version = formula_version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE computation_id = OLD.computation_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_grade_computation_version ON public.grade_computation_components;
CREATE TRIGGER trg_bump_grade_computation_version
AFTER INSERT OR UPDATE OF weight OR DELETE ON public.grade_computation_components
FOR EACH ROW EXECUTE FUNCTION public.bump_grade_computation_version();

COMMIT;
