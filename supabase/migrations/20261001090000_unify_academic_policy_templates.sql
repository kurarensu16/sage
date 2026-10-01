-- Unify the official default grading template and make subject templates mandatory.
-- Run after 20260929130000_backfill_official_grading_components.sql.

BEGIN;

DO $$
DECLARE
  general_core_id UUID;
  duplicate_id UUID;
BEGIN
  SELECT computation_id INTO general_core_id
  FROM public.grade_computations
  WHERE name = 'General Education Core'
  ORDER BY created_at ASC
  LIMIT 1;

  IF general_core_id IS NULL THEN
    INSERT INTO public.grade_computations (name, description)
    VALUES ('General Education Core', 'Official general education grading template')
    RETURNING computation_id INTO general_core_id;

    INSERT INTO public.grade_computation_components (computation_id, name, weight, max_score, is_multiple)
    VALUES
      (general_core_id, 'Class Standing (Formative)', 50, 20, TRUE),
      (general_core_id, 'Major Examination', 40, 40, FALSE),
      (general_core_id, 'Character Rating', 10, 100, FALSE);
  END IF;

  SELECT computation_id INTO duplicate_id
  FROM public.grade_computations
  WHERE name = 'General / Professional Education Scale'
  ORDER BY created_at ASC
  LIMIT 1;

  UPDATE public.subjects
  SET computation_id = general_core_id
  WHERE computation_id IS NULL
     OR computation_id = duplicate_id;

  IF duplicate_id IS NOT NULL THEN
    DELETE FROM public.grade_computations WHERE computation_id = duplicate_id;
  END IF;
END $$;

ALTER TABLE public.subjects
  DROP CONSTRAINT IF EXISTS subjects_computation_id_fkey;

ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_computation_id_fkey
  FOREIGN KEY (computation_id)
  REFERENCES public.grade_computations(computation_id)
  ON DELETE RESTRICT;

ALTER TABLE public.subjects
  ALTER COLUMN computation_id SET NOT NULL;

ALTER TABLE public.grade_computations
  ADD CONSTRAINT grade_computations_name_unique UNIQUE (name);

COMMIT;
