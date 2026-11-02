-- =============================================================================
-- ASPIRE: DYNAMIC GRADING THRESHOLDS (Phase 3)
-- =============================================================================
-- Two admin-editable policy levers that are single institutional constants today:
--   * passing transmutation threshold, per COG template (grade_computations)
--   * FDA absence threshold, per subject (subjects)
--
-- Reference: docs/03-development/audits/DYNAMIC_GRADING_POLICY_WORKFLOW_PLAN_2026-10-27.md
--
-- THREE DEPARTURES FROM THE PLAN, each because the plan's approach would not
-- have worked. All three were verified against the live migration set first.
--
-- 1. THE RESCALE FORMULA IS DIFFERENT (and the band values differ from the
--    plan's worked example).
--    The plan proposed  minRating(i) = T + (100 - T) * (8 - i) / 8.
--    At T = 75 that yields 100 for GWA 1.00, but the DYCI ladder's top band is
--    98 -- so it does not reproduce the current ladder, which is why the plan
--    needed a "use the verbatim table when T is NULL or 75" special case. That
--    special case leaves a cliff: at T = 75 a 1.00 needs 98, at T = 76 it needs
--    100. A one-point policy change should not move the top band two points the
--    other way.
--    Instead, this migration scales the handbook's OWN offsets from the passing
--    mark -- [23,20,17,14,11,8,5,2,0] for GWA 1.00..3.00 -- by (100 - T)/25:
--        minRating(i) = T + offset(i) * (100 - T) / 25
--    At T = 75 the factor is exactly 1.0, so the ladder is reproduced exactly
--    with no special case; the handbook's uneven 3,3,3,3,3,3,3,2 spacing is
--    preserved proportionally rather than flattened to even steps; and the top
--    band never exceeds 100 for any T in 50..94 (at T = 50 it is 96, at T = 94
--    it is 99.52). This is still "one number rescales the ladder", which is what
--    was approved -- only the arithmetic is corrected.
--
-- 2. THE SECOND PARAMETER HAS NO DEFAULT.
--    The plan said a `DEFAULT NULL` second parameter means none of the 20+
--    existing one-argument call sites need to change. In PostgreSQL that is the
--    opposite of true: with both aspire_transmute_grade(numeric) and
--    aspire_transmute_grade(numeric, numeric DEFAULT NULL) present, a
--    one-argument call fails with "function ... is not unique". So the overload
--    below takes two required arguments. One-argument calls then resolve
--    unambiguously to the existing function, which this migration does not touch
--    at all -- the 20+ legacy call sites keep their exact current behaviour.
--
-- 3. THERE IS NO SNAPSHOT BACKFILL.
--    The plan called for adding the new keys to every existing
--    class_records.grading_formula_snapshot. That is impossible as written:
--    trg_protect_class_formula_snapshot (20261008180000) raises 23514 on any
--    change to an established snapshot, so the backfill would fail on every row,
--    and forcing it through would mean disabling an integrity guard over live
--    grading data.
--    Its stated justification does not hold either. The strict JSONB `<>` check
--    in the posting path only fires when the CALLER passes a snapshot, and the
--    client does not: gradePostingService.js calls post_grade_milestone_v3 with
--    no snapshot argument. Readers therefore treat a MISSING key as NULL, which
--    already means "institutional default". Historical classes keep their
--    snapshots untouched, consistent with the confirmed decision that already
--    posted data is out of scope.
--
-- ZERO-CHANGE GUARANTEE
--   A template with no passing_threshold, or exactly 75, and a subject with no
--   fda_absence_threshold, behave identically to today -- same ladder, same
--   absence tiers, same posted values.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The two policy columns
-- -----------------------------------------------------------------------------
-- Both nullable, and NULL is meaningful: it is "follow the institutional
-- default", not "unset". That is what keeps every existing row unaffected.

ALTER TABLE public.grade_computations
  ADD COLUMN IF NOT EXISTS passing_threshold NUMERIC(5,2) NULL;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grade_computations'::regclass
      AND conname = 'grade_computations_passing_threshold_range'
  ) THEN
    ALTER TABLE public.grade_computations
      ADD CONSTRAINT grade_computations_passing_threshold_range
      CHECK (passing_threshold IS NULL OR (passing_threshold >= 50 AND passing_threshold <= 94));
  END IF;
END
$constraint$;

COMMENT ON COLUMN public.grade_computations.passing_threshold IS
  'Passing percentage for this COG template, 50-94. NULL means the institutional '
  'default of 75. Frozen into class_records.grading_formula_snapshot at class '
  'creation, so an edit only reaches classes created afterwards.';

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS fda_absence_threshold SMALLINT NULL;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subjects'::regclass
      AND conname = 'subjects_fda_absence_threshold_range'
  ) THEN
    ALTER TABLE public.subjects
      ADD CONSTRAINT subjects_fda_absence_threshold_range
      CHECK (fda_absence_threshold IS NULL OR (fda_absence_threshold >= 2 AND fda_absence_threshold <= 10));
  END IF;
END
$constraint$;

COMMENT ON COLUMN public.subjects.fda_absence_threshold IS
  'Absences that trigger FDA for this subject, 2-10. NULL means the institutional '
  'default of 4. Warning and near-FDA tiers derive from it as threshold-2 and '
  'threshold-1. Frozen into the class snapshot at class creation.';

-- -----------------------------------------------------------------------------
-- 2. Threshold-aware transmutation
-- -----------------------------------------------------------------------------
-- A SEPARATE OVERLOAD. aspire_transmute_grade(NUMERIC) is deliberately left
-- exactly as it is: it remains the legacy, institutional-default ladder that
-- 20+ call sites across 8 migrations already rely on. Only code that knows a
-- specific class's frozen threshold calls the two-argument form.

CREATE OR REPLACE FUNCTION public.aspire_transmute_grade(
  p_rating NUMERIC,
  p_passing_threshold NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_rating IS NULL THEN NULL

    -- NULL or exactly 75 takes the verbatim handbook ladder. The rescale below
    -- reduces to these same numbers at 75 (the factor is exactly 1.0), so this
    -- branch is belt-and-braces rather than a correctness crutch -- it removes
    -- any possibility of a floating-point edge changing a posted grade.
    WHEN p_passing_threshold IS NULL OR p_passing_threshold = 75 THEN
      CASE
        WHEN p_rating >= 98 THEN 1.00
        WHEN p_rating >= 95 THEN 1.25
        WHEN p_rating >= 92 THEN 1.50
        WHEN p_rating >= 89 THEN 1.75
        WHEN p_rating >= 86 THEN 2.00
        WHEN p_rating >= 83 THEN 2.25
        WHEN p_rating >= 80 THEN 2.50
        WHEN p_rating >= 77 THEN 2.75
        WHEN p_rating >= 75 THEN 3.00
        ELSE 5.00
      END

    -- Rescaled ladder: each band keeps its proportional distance above the
    -- passing mark. offset(i) * (100 - T) / 25, with offsets taken from the
    -- handbook ladder itself.
    ELSE
      CASE
        WHEN p_rating >= p_passing_threshold + 23 * (100 - p_passing_threshold) / 25 THEN 1.00
        WHEN p_rating >= p_passing_threshold + 20 * (100 - p_passing_threshold) / 25 THEN 1.25
        WHEN p_rating >= p_passing_threshold + 17 * (100 - p_passing_threshold) / 25 THEN 1.50
        WHEN p_rating >= p_passing_threshold + 14 * (100 - p_passing_threshold) / 25 THEN 1.75
        WHEN p_rating >= p_passing_threshold + 11 * (100 - p_passing_threshold) / 25 THEN 2.00
        WHEN p_rating >= p_passing_threshold +  8 * (100 - p_passing_threshold) / 25 THEN 2.25
        WHEN p_rating >= p_passing_threshold +  5 * (100 - p_passing_threshold) / 25 THEN 2.50
        WHEN p_rating >= p_passing_threshold +  2 * (100 - p_passing_threshold) / 25 THEN 2.75
        WHEN p_rating >= p_passing_threshold                                         THEN 3.00
        ELSE 5.00
      END
  END::NUMERIC;
$$;

REVOKE ALL ON FUNCTION public.aspire_transmute_grade(NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_transmute_grade(NUMERIC, NUMERIC) TO authenticated;

COMMENT ON FUNCTION public.aspire_transmute_grade(NUMERIC, NUMERIC) IS
  'Transmutes a rating to GWA against a given passing threshold. NULL or 75 '
  'yields the verbatim DYCI ladder. The single-argument overload is the legacy '
  'default-75 path and is unchanged.';

-- -----------------------------------------------------------------------------
-- 3. Post-conditions -- the zero-change guarantee, asserted rather than assumed
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_rating NUMERIC;
  v_legacy NUMERIC;
  v_null_threshold NUMERIC;
  v_at_75 NUMERIC;
BEGIN
  IF to_regprocedure('public.aspire_transmute_grade(numeric,numeric)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the two-argument overload was not created.';
  END IF;

  -- The one-argument form must still exist and still be reachable with one
  -- argument. If a DEFAULT had been added this call would raise 42725.
  IF to_regprocedure('public.aspire_transmute_grade(numeric)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the legacy one-argument function is missing.';
  END IF;

  -- Sweep every half point across the whole scale and assert that the new
  -- function at NULL and at 75 agrees with the legacy ladder everywhere.
  FOR v_rating IN SELECT generate_series(0, 200) / 2.0
  LOOP
    v_legacy := public.aspire_transmute_grade(v_rating);
    v_null_threshold := public.aspire_transmute_grade(v_rating, NULL);
    v_at_75 := public.aspire_transmute_grade(v_rating, 75);

    IF v_null_threshold IS DISTINCT FROM v_legacy THEN
      RAISE EXCEPTION
        'Verification failed: at rating %, NULL threshold gave % but the legacy ladder gives %.',
        v_rating, v_null_threshold, v_legacy;
    END IF;
    IF v_at_75 IS DISTINCT FROM v_legacy THEN
      RAISE EXCEPTION
        'Verification failed: at rating %, threshold 75 gave % but the legacy ladder gives %.',
        v_rating, v_at_75, v_legacy;
    END IF;
  END LOOP;

  -- Spot-check the rescale itself at the documented bounds, and that no band
  -- ever demands more than 100.
  IF public.aspire_transmute_grade(80, 80) IS DISTINCT FROM 3.00 THEN
    RAISE EXCEPTION 'Verification failed: a score exactly at an 80 threshold must be 3.00.';
  END IF;
  IF public.aspire_transmute_grade(79.99, 80) IS DISTINCT FROM 5.00 THEN
    RAISE EXCEPTION 'Verification failed: a score just below an 80 threshold must be 5.00.';
  END IF;
  IF public.aspire_transmute_grade(100, 50) IS DISTINCT FROM 1.00
    OR public.aspire_transmute_grade(100, 94) IS DISTINCT FROM 1.00
  THEN
    RAISE EXCEPTION 'Verification failed: a perfect score must reach 1.00 at every allowed threshold.';
  END IF;

  RAISE NOTICE 'Dynamic grading thresholds verified: NULL and 75 reproduce the legacy ladder exactly.';
END
$verify$;

COMMIT;
