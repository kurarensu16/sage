-- Pin every existing class to the COG it is currently assigned.
--
-- Policy (owner, 2026-10-14): once a subject is assigned to a class, that class's grading
-- formula is fixed. An admin editing a COG mid-year is preparing the **next** term, and
-- that edit must never reach a class that already exists — active or archived.
--
-- Where this already held before this migration:
--   * posted grades: posted_grades.grading_formula_snapshot freezes per row, and
--     protect_grading_formula_snapshot makes an established snapshot immutable
--   * classes created from 2026-10-14 onward: provisionClassroomByAdmin now writes the
--     snapshot at creation (ASPIRE-C10)
--
-- The gap this closes: classes created **before** that change which never posted a
-- milestone still have grading_formula_snapshot NULL, so every grade surface falls back
-- to the subject's live template and silently tracks any later edit.
--
-- SHAPE WARNING. post_grade_milestone_atomic compares the submitted snapshot against the
-- stored one with a strict JSONB `<>`, so this object must match what the application
-- builds in createGradingFormulaSnapshot()/resolveGradingFormula(). Field names and types
-- below mirror that output exactly:
--   { version, computationId, source, totalWeight, components:[ { componentId, key, name,
--     weight, maxScore, isMultiple, semanticType, displayOrder, isRequired } ] }
-- `key` equals componentId, which is what createComponentKey() returns whenever a
-- component has an id — true for every row coming from this table.
--
-- Component order is decided here and becomes canonical for the class: once a snapshot
-- exists, ScoreInput resolves the formula from the snapshot rather than the template, and
-- re-resolving a snapshot reproduces it field for field with array order preserved. So
-- posting keeps matching regardless of the order chosen, as long as it is deterministic.
--
-- Weights are cast to float8 so numbers serialise the way JavaScript writes them
-- (40 rather than 40.00).
--
-- Classes whose template does not total 100% are deliberately left NULL: the application
-- treats such a formula as invalid and stores no snapshot, so writing one here would
-- disagree with it. WEIGHT_TOLERANCE in src/lib/gradingMath.js is 0.01.

BEGIN;

WITH template AS (
  SELECT
    component.computation_id,
    SUM(component.weight)::float8 AS total_weight,
    jsonb_agg(
      jsonb_build_object(
        'componentId',  component.component_id,
        'key',          component.component_id,
        'name',         component.name,
        'weight',       component.weight::float8,
        'maxScore',     component.max_score::float8,
        'isMultiple',   COALESCE(component.is_multiple, FALSE),
        'semanticType', component.semantic_type,
        'displayOrder', component.display_order,
        'isRequired',   COALESCE(component.is_required, TRUE)
      )
      ORDER BY component.display_order, component.name, component.component_id
    ) AS components
  FROM public.grade_computation_components component
  GROUP BY component.computation_id
)
UPDATE public.class_records class_record
SET grading_formula_snapshot = jsonb_build_object(
      'version',       1,
      'computationId', template.computation_id,
      'source',        'configured',
      'totalWeight',   template.total_weight,
      'components',    template.components
    )
FROM public.subjects subject
JOIN template ON template.computation_id = subject.computation_id
WHERE class_record.subject_id = subject.subject_id
  AND class_record.grading_formula_snapshot IS NULL
  AND abs(template.total_weight - 100) <= 0.01;

COMMIT;

-- Afterwards, anything still unpinned is a class whose subject has no template, or whose
-- template does not total 100%. Both need an admin decision, not a backfill:
--   SELECT c.class_record_id, s.code, c.school_year, c.semester
--   FROM public.class_records c
--   JOIN public.subjects s ON s.subject_id = c.subject_id
--   WHERE c.grading_formula_snapshot IS NULL;
