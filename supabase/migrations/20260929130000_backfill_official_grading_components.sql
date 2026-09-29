-- Restore component rows for official DYCI grading templates whose headers
-- exist but whose component definitions were never seeded.
--
-- This migration is intentionally fail-safe and idempotent: it seeds a
-- recognized template only when that template currently has zero components.

BEGIN;

WITH preset_components (
  template_name,
  component_name,
  weight,
  max_score,
  is_multiple
) AS (
  VALUES
    -- Names used by the existing production seed.
    ('General / Professional Education Scale', 'Class Standing (Formative)', 50.00, 20.00, TRUE),
    ('General / Professional Education Scale', 'Major Examination',          40.00, 40.00, FALSE),
    ('General / Professional Education Scale', 'Character Rating',           10.00, 100.00, FALSE),

    ('Health Sciences Theory Scale', 'Class Standing (Formative)', 30.00, 20.00, TRUE),
    ('Health Sciences Theory Scale', 'Major Examination',          60.00, 100.00, FALSE),
    ('Health Sciences Theory Scale', 'Character Rating',           10.00, 100.00, FALSE),

    ('Health Sciences RLE Scale', 'Checklist Rating',                 50.00, 100.00, TRUE),
    ('Health Sciences RLE Scale', 'Nursing Care Plan & Case Study',    20.00, 100.00, TRUE),
    ('Health Sciences RLE Scale', 'Rubric Assessment',                 20.00, 100.00, FALSE),
    ('Health Sciences RLE Scale', 'Quizzes & Written Outputs',         10.00, 50.00, TRUE),

    ('Maritime Lecture Scale', 'Class Standing',     60.00, 100.00, TRUE),
    ('Maritime Lecture Scale', 'Major Examination',  40.00, 100.00, FALSE),

    ('Maritime Laboratory Scale', 'Systematic Exercises',          40.00, 100.00, TRUE),
    ('Maritime Laboratory Scale', 'Demonstration of Competence',    60.00, 100.00, FALSE),

    -- Names used by the current template-management UI.
    ('General Education Core', 'Class Standing (Formative)', 50.00, 20.00, TRUE),
    ('General Education Core', 'Major Examination',          40.00, 40.00, FALSE),
    ('General Education Core', 'Character Rating',           10.00, 100.00, FALSE),

    ('Health Sciences (Theory)', 'Class Standing (Formative)', 30.00, 20.00, TRUE),
    ('Health Sciences (Theory)', 'Major Examination',          60.00, 100.00, FALSE),
    ('Health Sciences (Theory)', 'Character Rating',           10.00, 100.00, FALSE),

    ('Health Sciences (RLE / Clinical Practicum)', 'Checklist Rating',                 50.00, 100.00, TRUE),
    ('Health Sciences (RLE / Clinical Practicum)', 'Nursing Care Plan & Case Study',    20.00, 100.00, TRUE),
    ('Health Sciences (RLE / Clinical Practicum)', 'Rubric Assessment',                 20.00, 100.00, FALSE),
    ('Health Sciences (RLE / Clinical Practicum)', 'Quizzes & Written Outputs',         10.00, 50.00, TRUE),

    ('Maritime Studies (Lecture)', 'Class Standing',     60.00, 100.00, TRUE),
    ('Maritime Studies (Lecture)', 'Major Examination',  40.00, 100.00, FALSE),

    ('Maritime Studies (Laboratory / Simulator)', 'Systematic Exercises',          40.00, 100.00, TRUE),
    ('Maritime Studies (Laboratory / Simulator)', 'Demonstration of Competence',    60.00, 100.00, FALSE)
),
empty_official_templates AS (
  SELECT gc.computation_id, gc.name
  FROM public.grade_computations AS gc
  WHERE gc.name IN (SELECT DISTINCT template_name FROM preset_components)
    AND NOT EXISTS (
      SELECT 1
      FROM public.grade_computation_components AS existing
      WHERE existing.computation_id = gc.computation_id
    )
)
INSERT INTO public.grade_computation_components (
  computation_id,
  name,
  weight,
  max_score,
  is_multiple
)
SELECT
  template.computation_id,
  preset.component_name,
  preset.weight,
  preset.max_score,
  preset.is_multiple
FROM empty_official_templates AS template
JOIN preset_components AS preset
  ON preset.template_name = template.name;

COMMIT;
