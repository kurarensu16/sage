-- Migration: Add durable grading-formula identity hooks
-- This migration is additive. Existing grade computation behavior is unchanged
-- until application callers begin populating these fields.

BEGIN;

-- Activities may be assigned to a stable grading component. Existing rows stay
-- nullable so legacy classes can be categorized explicitly before posting.
ALTER TABLE public.class_activities
  ADD COLUMN IF NOT EXISTS component_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'class_activities_component_id_fkey'
      AND conrelid = 'public.class_activities'::regclass
  ) THEN
    ALTER TABLE public.class_activities
      ADD CONSTRAINT class_activities_component_id_fkey
      FOREIGN KEY (component_id)
      REFERENCES public.grade_computation_components(component_id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_class_activities_component
  ON public.class_activities(component_id);

-- A class snapshot freezes the formula used after grading begins. A posted-grade
-- snapshot provides an immutable audit record of the formula used for that row.
ALTER TABLE public.class_records
  ADD COLUMN IF NOT EXISTS grading_formula_snapshot JSONB;

ALTER TABLE public.posted_grades
  ADD COLUMN IF NOT EXISTS grading_formula_snapshot JSONB;

COMMIT;
