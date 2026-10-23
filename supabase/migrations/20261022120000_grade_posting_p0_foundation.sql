-- =============================================================================
-- ASPIRE P0 GRADE-POSTING HARDENING: SERVER CALCULATION FOUNDATION
-- =============================================================================
-- Adds immutable official revisions, a deterministic server calculator, durable
-- posting operations, and database guards that keep the basis of a locked SG
-- from being edited outside the official posting transaction.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Explicit provenance and immutable official revisions
-- -----------------------------------------------------------------------------

ALTER TABLE public.posted_grades
  ADD COLUMN IF NOT EXISTS official_source TEXT NOT NULL DEFAULT 'faculty_post',
  ADD COLUMN IF NOT EXISTS official_revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS calculation_engine_version TEXT,
  ADD COLUMN IF NOT EXISTS input_snapshot_hash TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'posted_grades_official_source_check'
      AND conrelid = 'public.posted_grades'::regclass
  ) THEN
    ALTER TABLE public.posted_grades
      ADD CONSTRAINT posted_grades_official_source_check
      CHECK (official_source IN ('faculty_post', 'dean_correction', 'admin_override'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'posted_grades_official_revision_check'
      AND conrelid = 'public.posted_grades'::regclass
  ) THEN
    ALTER TABLE public.posted_grades
      ADD CONSTRAINT posted_grades_official_revision_check
      CHECK (official_revision > 0);
  END IF;
END;
$$;

UPDATE public.posted_grades
SET official_source = CASE
      WHEN override_by IS NOT NULL
        AND (override_at IS NULL OR remarks_set_at IS NULL OR override_at >= remarks_set_at)
        THEN 'admin_override'
      WHEN last_correction_request_id IS NOT NULL THEN 'dean_correction'
      ELSE 'faculty_post'
    END,
    calculation_engine_version = COALESCE(calculation_engine_version, 'legacy-client-v1'),
    official_revision = GREATEST(COALESCE(official_revision, 1), 1);

CREATE TABLE IF NOT EXISTS public.posted_grade_revisions (
  revision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posted_grade_id UUID NOT NULL REFERENCES public.posted_grades(posted_grade_id) ON DELETE RESTRICT,
  class_record_id UUID NOT NULL REFERENCES public.class_records(class_record_id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  grade_period TEXT NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  computed_grade NUMERIC(5,2),
  effective_grade NUMERIC(5,2),
  remarks TEXT NOT NULL,
  official_source TEXT NOT NULL CHECK (official_source IN ('faculty_post', 'dean_correction', 'admin_override')),
  calculation_engine_version TEXT,
  input_snapshot_hash TEXT,
  correction_request_id UUID REFERENCES public.remark_override_requests(request_id) ON DELETE RESTRICT,
  recorded_by UUID REFERENCES public.users(user_id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (posted_grade_id, revision_number)
);

INSERT INTO public.posted_grade_revisions (
  posted_grade_id, class_record_id, student_id, grade_period, revision_number,
  computed_grade, effective_grade, remarks, official_source,
  calculation_engine_version, input_snapshot_hash, correction_request_id,
  recorded_by, recorded_at
)
SELECT
  grade.posted_grade_id, grade.class_record_id, grade.student_id, grade.grade_period::TEXT,
  grade.official_revision, grade.computed_grade, grade.effective_grade, grade.remarks::TEXT,
  grade.official_source, grade.calculation_engine_version, grade.input_snapshot_hash,
  grade.last_correction_request_id, COALESCE(grade.remarks_set_by, grade.posted_by),
  COALESCE(grade.remarks_set_at, grade.posted_at, CURRENT_TIMESTAMP)
FROM public.posted_grades grade
ON CONFLICT (posted_grade_id, revision_number) DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_posted_grade_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.computed_grade IS NOT DISTINCT FROM NEW.computed_grade
    AND OLD.effective_grade IS NOT DISTINCT FROM NEW.effective_grade
    AND OLD.remarks IS NOT DISTINCT FROM NEW.remarks
    AND OLD.official_source IS NOT DISTINCT FROM NEW.official_source
    AND OLD.calculation_engine_version IS NOT DISTINCT FROM NEW.calculation_engine_version
    AND OLD.input_snapshot_hash IS NOT DISTINCT FROM NEW.input_snapshot_hash
    AND OLD.last_correction_request_id IS NOT DISTINCT FROM NEW.last_correction_request_id
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.posted_grade_revisions (
    posted_grade_id, class_record_id, student_id, grade_period, revision_number,
    computed_grade, effective_grade, remarks, official_source,
    calculation_engine_version, input_snapshot_hash, correction_request_id,
    recorded_by, recorded_at
  ) VALUES (
    NEW.posted_grade_id, NEW.class_record_id, NEW.student_id, NEW.grade_period::TEXT,
    NEW.official_revision, NEW.computed_grade, NEW.effective_grade, NEW.remarks::TEXT,
    NEW.official_source, NEW.calculation_engine_version, NEW.input_snapshot_hash,
    NEW.last_correction_request_id, COALESCE(NEW.remarks_set_by, NEW.posted_by, auth.uid()),
    COALESCE(NEW.remarks_set_at, NEW.posted_at, CURRENT_TIMESTAMP)
  )
  ON CONFLICT (posted_grade_id, revision_number) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_posted_grade_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (
      OLD.computed_grade IS DISTINCT FROM NEW.computed_grade
      OR OLD.effective_grade IS DISTINCT FROM NEW.effective_grade
      OR OLD.remarks IS DISTINCT FROM NEW.remarks
    ) AND COALESCE(current_setting('aspire.grade_posting_context', TRUE), '') NOT IN ('posting', 'correction', 'admin_override')
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Official grade values are managed only by secured posting or override operations.';
  END IF;
  IF (
      OLD.official_source IS DISTINCT FROM NEW.official_source
      OR OLD.calculation_engine_version IS DISTINCT FROM NEW.calculation_engine_version
      OR OLD.input_snapshot_hash IS DISTINCT FROM NEW.input_snapshot_hash
    ) AND COALESCE(current_setting('aspire.grade_posting_context', TRUE), '') NOT IN ('posting', 'correction', 'admin_override')
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Official grade provenance is managed only by secured posting operations.';
  END IF;
  IF OLD.computed_grade IS DISTINCT FROM NEW.computed_grade
    OR OLD.effective_grade IS DISTINCT FROM NEW.effective_grade
    OR OLD.remarks IS DISTINCT FROM NEW.remarks
    OR OLD.official_source IS DISTINCT FROM NEW.official_source
    OR OLD.calculation_engine_version IS DISTINCT FROM NEW.calculation_engine_version
    OR OLD.input_snapshot_hash IS DISTINCT FROM NEW.input_snapshot_hash
  THEN
    -- The database, rather than a caller-supplied value, owns revision order.
    NEW.official_revision := OLD.official_revision + 1;
  ELSE
    NEW.official_revision := OLD.official_revision;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_posted_grade_revision ON public.posted_grades;
CREATE TRIGGER trg_advance_posted_grade_revision
BEFORE UPDATE ON public.posted_grades
FOR EACH ROW EXECUTE FUNCTION public.advance_posted_grade_revision();

DROP TRIGGER IF EXISTS trg_record_posted_grade_revision ON public.posted_grades;
CREATE TRIGGER trg_record_posted_grade_revision
AFTER INSERT OR UPDATE ON public.posted_grades
FOR EACH ROW EXECUTE FUNCTION public.record_posted_grade_revision();

CREATE OR REPLACE FUNCTION public.prevent_posted_grade_revision_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Official posted-grade revisions are immutable.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_posted_grade_revision_mutation ON public.posted_grade_revisions;
CREATE TRIGGER trg_prevent_posted_grade_revision_mutation
BEFORE UPDATE OR DELETE ON public.posted_grade_revisions
FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_grade_revision_mutation();

ALTER TABLE public.posted_grade_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS posted_grade_revisions_authorized_select ON public.posted_grade_revisions;
CREATE POLICY posted_grade_revisions_authorized_select
ON public.posted_grade_revisions FOR SELECT TO authenticated
USING (public.can_read_student_class_record(class_record_id, student_id));

REVOKE ALL ON TABLE public.posted_grade_revisions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.posted_grade_revisions FROM authenticated;
GRANT SELECT ON TABLE public.posted_grade_revisions TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Durable idempotent posting operations
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.grade_posting_operations (
  operation_id UUID PRIMARY KEY,
  class_record_id UUID NOT NULL REFERENCES public.class_records(class_record_id) ON DELETE RESTRICT,
  grade_period TEXT NOT NULL CHECK (grade_period IN ('midterm_rating', 'tentative_final_rating', 'semestral_grade')),
  actor_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  request_hash TEXT NOT NULL,
  projection_hash TEXT NOT NULL,
  notification_count INTEGER NOT NULL DEFAULT 0 CHECK (notification_count >= 0),
  status TEXT NOT NULL CHECK (status IN ('committed')),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_grade_posting_operations_class_period
  ON public.grade_posting_operations(class_record_id, grade_period, committed_at DESC);

ALTER TABLE public.grade_posting_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grade_posting_operations_authorized_select ON public.grade_posting_operations;
CREATE POLICY grade_posting_operations_authorized_select
ON public.grade_posting_operations FOR SELECT TO authenticated
USING (
  actor_id = auth.uid()
  OR public.is_assigned_faculty(class_record_id)
  OR public.is_authorized_dean_for_class(class_record_id)
  OR public.is_active_admin()
);

REVOKE ALL ON TABLE public.grade_posting_operations FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.grade_posting_operations FROM authenticated;
GRANT SELECT ON TABLE public.grade_posting_operations TO authenticated;

CREATE TABLE IF NOT EXISTS public.admin_grade_override_operations (
  operation_id UUID PRIMARY KEY,
  posted_grade_id UUID NOT NULL REFERENCES public.posted_grades(posted_grade_id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('committed')),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.admin_grade_override_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_grade_override_operations_authorized_select ON public.admin_grade_override_operations;
CREATE POLICY admin_grade_override_operations_authorized_select
ON public.admin_grade_override_operations FOR SELECT TO authenticated
USING (actor_id = auth.uid() OR public.is_active_admin());

REVOKE ALL ON TABLE public.admin_grade_override_operations FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.admin_grade_override_operations FROM authenticated;
GRANT SELECT ON TABLE public.admin_grade_override_operations TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Canonical transmutation and reproducible input hash
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.aspire_transmute_grade(p_rating NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_rating IS NULL THEN NULL
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
  END::NUMERIC;
$$;

CREATE OR REPLACE FUNCTION public.aspire_grade_input_hash(
  p_class_record_id UUID,
  p_student_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT md5(jsonb_build_object(
    'formula', class_record.grading_formula_snapshot,
    'semester', class_record.semester,
    'columns', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'term', column_row.term,
        'act1_max', column_row.act1_max, 'act2_max', column_row.act2_max,
        'act3_max', column_row.act3_max, 'act4_max', column_row.act4_max,
        'act5_max', column_row.act5_max, 'act6_max', column_row.act6_max,
        'exam_max', column_row.exam_max
      ) ORDER BY column_row.term)
      FROM public.class_grading_columns column_row
      WHERE column_row.class_record_id = p_class_record_id
    ), '[]'::JSONB),
    'activities', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'activity_id', activity.activity_id,
        'term', activity.term,
        'name', activity.name,
        'max_score', activity.max_score,
        'component_id', activity.component_id
      ) ORDER BY activity.term, activity.created_at, activity.activity_id)
      FROM public.class_activities activity
      WHERE activity.class_record_id = p_class_record_id
    ), '[]'::JSONB),
    'term_scores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'term', score_row.term,
        'act1', score_row.act1, 'act2', score_row.act2,
        'act3', score_row.act3, 'act4', score_row.act4,
        'act5', score_row.act5, 'act6', score_row.act6,
        'char_rating', score_row.char_rating, 'exam', score_row.exam
      ) ORDER BY score_row.term)
      FROM public.student_term_scores score_row
      WHERE score_row.class_record_id = p_class_record_id
        AND score_row.student_id = p_student_id
    ), '[]'::JSONB),
    'activity_scores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'activity_id', activity_score.activity_id,
        'score', activity_score.score
      ) ORDER BY activity_score.activity_id)
      FROM public.student_activity_scores activity_score
      JOIN public.class_activities activity ON activity.activity_id = activity_score.activity_id
      WHERE activity.class_record_id = p_class_record_id
        AND activity_score.student_id = p_student_id
    ), '[]'::JSONB),
    'absences', (
      SELECT COUNT(*) FROM public.attendance_records attendance
      WHERE attendance.class_record_id = p_class_record_id
        AND attendance.student_id = p_student_id
        AND lower(attendance.status::TEXT) = 'absent'
    )
  )::TEXT)
  FROM public.class_records class_record
  WHERE class_record.class_record_id = p_class_record_id;
$$;

REVOKE ALL ON FUNCTION public.aspire_transmute_grade(NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aspire_grade_input_hash(UUID, UUID) FROM PUBLIC, anon;

-- -----------------------------------------------------------------------------
-- 4. Server-authoritative term and milestone calculation
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.aspire_calculate_term_rating(
  p_class_record_id UUID,
  p_student_id UUID,
  p_term TEXT,
  p_formula_snapshot JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_component JSONB;
  v_activity RECORD;
  v_component_name TEXT;
  v_component_id TEXT;
  v_semantic_type TEXT;
  v_weight NUMERIC;
  v_default_max NUMERIC;
  v_is_multiple BOOLEAN;
  v_is_required BOOLEAN;
  v_multi_count INTEGER;
  v_character_count INTEGER;
  v_other_single_count INTEGER;
  v_activity_count INTEGER;
  v_expected INTEGER;
  v_entered INTEGER;
  v_earned NUMERIC;
  v_possible NUMERIC;
  v_score NUMERIC;
  v_max NUMERIC;
  v_contribution NUMERIC;
  v_total NUMERIC := 0;
  v_encoded_weight NUMERIC := 0;
  v_has_data BOOLEAN := FALSE;
  v_complete BOOLEAN := TRUE;
  v_missing JSONB := '[]'::JSONB;
  v_contributions JSONB := '[]'::JSONB;
  v_act1 NUMERIC; v_act2 NUMERIC; v_act3 NUMERIC;
  v_act4 NUMERIC; v_act5 NUMERIC; v_act6 NUMERIC;
  v_char NUMERIC; v_exam NUMERIC;
  v_max1 NUMERIC; v_max2 NUMERIC; v_max3 NUMERIC;
  v_max4 NUMERIC; v_max5 NUMERIC; v_max6 NUMERIC;
  v_exam_max NUMERIC;
  v_scores NUMERIC[];
  v_maxes NUMERIC[];
  v_index INTEGER;
BEGIN
  IF p_term NOT IN ('Prelim', 'Midterm', 'Semi-Final', 'Final') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Unsupported academic term.');
  END IF;
  IF p_formula_snapshot IS NULL
    OR jsonb_typeof(p_formula_snapshot) <> 'object'
    OR jsonb_typeof(p_formula_snapshot->'components') <> 'array'
    OR jsonb_array_length(p_formula_snapshot->'components') = 0
  THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'A valid class grading snapshot is required.');
  END IF;

  SELECT score.act1, score.act2, score.act3, score.act4, score.act5, score.act6,
         score.char_rating, score.exam
  INTO v_act1, v_act2, v_act3, v_act4, v_act5, v_act6, v_char, v_exam
  FROM public.student_term_scores score
  WHERE score.class_record_id = p_class_record_id
    AND score.student_id = p_student_id
    AND score.term = p_term;

  SELECT column_row.act1_max, column_row.act2_max, column_row.act3_max,
         column_row.act4_max, column_row.act5_max, column_row.act6_max,
         column_row.exam_max
  INTO v_max1, v_max2, v_max3, v_max4, v_max5, v_max6, v_exam_max
  FROM public.class_grading_columns column_row
  WHERE column_row.class_record_id = p_class_record_id
    AND column_row.term = p_term;

  v_max1 := COALESCE(v_max1, 20); v_max2 := COALESCE(v_max2, 20);
  v_max3 := COALESCE(v_max3, 20); v_max4 := COALESCE(v_max4, 20);
  v_max5 := COALESCE(v_max5, 20); v_max6 := COALESCE(v_max6, 10);
  v_exam_max := COALESCE(v_exam_max, 40);
  v_scores := ARRAY[v_act1, v_act2, v_act3, v_act4, v_act5, v_act6];
  v_maxes := ARRAY[v_max1, v_max2, v_max3, v_max4, v_max5, v_max6];

  SELECT COUNT(*) FILTER (WHERE COALESCE((component->>'isMultiple')::BOOLEAN, FALSE)),
         COUNT(*) FILTER (WHERE NOT COALESCE((component->>'isMultiple')::BOOLEAN, FALSE)
           AND (component->>'semanticType' = 'character' OR (component->>'semanticType' IS NULL AND component->>'name' ~* 'character'))),
         COUNT(*) FILTER (WHERE NOT COALESCE((component->>'isMultiple')::BOOLEAN, FALSE)
           AND NOT (component->>'semanticType' = 'character' OR (component->>'semanticType' IS NULL AND component->>'name' ~* 'character')))
  INTO v_multi_count, v_character_count, v_other_single_count
  FROM jsonb_array_elements(p_formula_snapshot->'components') component;

  IF v_character_count > 1 OR v_other_single_count > 1 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'The grading snapshot cannot be mapped safely to the current score sheet.');
  END IF;

  IF v_multi_count > 1 AND EXISTS (
    SELECT 1
    FROM public.class_activities activity
    WHERE activity.class_record_id = p_class_record_id
      AND activity.term = p_term
      AND (
        activity.component_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(p_formula_snapshot->'components') component
          WHERE COALESCE((component->>'isMultiple')::BOOLEAN, FALSE)
            AND component->>'componentId' = activity.component_id::TEXT
        )
      )
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Categorize every activity before grades can be calculated or posted.');
  END IF;

  FOR v_component IN SELECT value FROM jsonb_array_elements(p_formula_snapshot->'components')
  LOOP
    v_component_name := BTRIM(COALESCE(v_component->>'name', ''));
    v_component_id := NULLIF(v_component->>'componentId', '');
    v_semantic_type := NULLIF(v_component->>'semanticType', '');
    v_weight := NULLIF(v_component->>'weight', '')::NUMERIC;
    v_default_max := NULLIF(v_component->>'maxScore', '')::NUMERIC;
    v_is_multiple := COALESCE((v_component->>'isMultiple')::BOOLEAN, FALSE);
    v_is_required := COALESCE((v_component->>'isRequired')::BOOLEAN, TRUE);

    IF v_component_name = '' OR v_weight IS NULL OR v_weight <= 0
      OR v_default_max IS NULL OR v_default_max <= 0
    THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'The class grading snapshot contains an invalid component.');
    END IF;

    v_expected := 0; v_entered := 0; v_earned := 0; v_possible := 0;

    IF v_is_multiple THEN
      SELECT COUNT(*) INTO v_activity_count
      FROM public.class_activities activity
      WHERE activity.class_record_id = p_class_record_id
        AND activity.term = p_term
        AND (v_multi_count = 1 OR activity.component_id::TEXT = v_component_id);

      IF v_activity_count > 0 THEN
        FOR v_activity IN
          SELECT ranked.activity_id, ranked.max_score,
                 COALESCE(
                   activity_score.score,
                   CASE WHEN v_multi_count = 1 THEN v_scores[ranked.activity_index] ELSE NULL END
                 ) AS score
          FROM (
            SELECT activity.activity_id, activity.max_score, activity.component_id,
                   ROW_NUMBER() OVER (ORDER BY activity.created_at, activity.activity_id)::INTEGER AS activity_index
            FROM public.class_activities activity
            WHERE activity.class_record_id = p_class_record_id
              AND activity.term = p_term
              AND (v_multi_count = 1 OR activity.component_id::TEXT = v_component_id)
          ) ranked
          LEFT JOIN public.student_activity_scores activity_score
            ON activity_score.activity_id = ranked.activity_id
           AND activity_score.student_id = p_student_id
          ORDER BY ranked.activity_index
        LOOP
          v_expected := v_expected + 1;
          IF v_activity.score IS NOT NULL THEN
            IF v_activity.score < 0 OR v_activity.score > v_activity.max_score THEN
              RETURN jsonb_build_object('ok', FALSE, 'error', FORMAT('%s contains a score outside its configured maximum.', p_term));
            END IF;
            v_entered := v_entered + 1;
            v_earned := v_earned + v_activity.score;
            v_possible := v_possible + v_activity.max_score;
          END IF;
        END LOOP;
      ELSIF v_multi_count = 1 THEN
        FOR v_index IN 1..6 LOOP
          v_expected := v_expected + 1;
          v_score := v_scores[v_index];
          v_max := COALESCE(v_maxes[v_index], v_default_max);
          IF v_score IS NOT NULL THEN
            IF v_score < 0 OR v_score > v_max THEN
              RETURN jsonb_build_object('ok', FALSE, 'error', FORMAT('%s contains a score outside its configured maximum.', p_term));
            END IF;
            v_entered := v_entered + 1;
            v_earned := v_earned + v_score;
            v_possible := v_possible + v_max;
          END IF;
        END LOOP;
      ELSE
        RETURN jsonb_build_object('ok', FALSE, 'error', 'Every repeatable grading component needs a categorized activity.');
      END IF;
    ELSIF v_semantic_type = 'character' OR (v_semantic_type IS NULL AND v_component_name ~* 'character') THEN
      v_expected := 1;
      IF v_char IS NOT NULL THEN
        IF v_char < 0 OR v_char > v_default_max THEN
          RETURN jsonb_build_object('ok', FALSE, 'error', FORMAT('%s character rating exceeds its configured maximum.', p_term));
        END IF;
        v_entered := 1; v_earned := v_char; v_possible := v_default_max;
      END IF;
    ELSE
      v_expected := 1;
      IF v_exam IS NOT NULL THEN
        IF v_exam < 0 OR v_exam > v_exam_max THEN
          RETURN jsonb_build_object('ok', FALSE, 'error', FORMAT('%s examination score exceeds its configured maximum.', p_term));
        END IF;
        v_entered := 1; v_earned := v_exam; v_possible := v_exam_max;
      END IF;
    END IF;

    IF v_entered > 0 THEN
      v_has_data := TRUE;
      v_encoded_weight := v_encoded_weight + v_weight;
      v_contribution := LEAST(100, GREATEST(0, (v_earned / NULLIF(v_possible, 0)) * 100)) / 100 * v_weight;
      v_total := v_total + v_contribution;
    ELSE
      v_contribution := 0;
    END IF;

    IF v_is_required AND NOT (v_entered > 0 AND (NOT v_is_multiple OR v_entered = v_expected)) THEN
      v_complete := FALSE;
      v_missing := v_missing || jsonb_build_array(v_component_name);
    END IF;

    v_contributions := v_contributions || jsonb_build_array(jsonb_build_object(
      'name', v_component_name,
      'weight', v_weight,
      'earned', v_earned,
      'possible', v_possible,
      'enteredItemCount', v_entered,
      'expectedItemCount', v_expected,
      'contribution', v_contribution,
      'isComplete', v_entered > 0 AND (NOT v_is_multiple OR v_entered = v_expected)
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'rating', CASE WHEN v_has_data THEN LEAST(100, GREATEST(0, ROUND(v_total))) ELSE NULL END,
    'rawRating', CASE WHEN v_has_data THEN v_total ELSE NULL END,
    'hasData', v_has_data,
    'isComplete', v_complete,
    'missingComponents', v_missing,
    'encodedWeight', v_encoded_weight,
    'contributions', v_contributions,
    'error', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.aspire_calculate_student_grade(
  p_class_record_id UUID,
  p_student_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class public.class_records%ROWTYPE;
  v_prelim JSONB; v_midterm JSONB; v_semi_final JSONB; v_final JSONB;
  v_p NUMERIC; v_m NUMERIC; v_sf NUMERIC; v_f NUMERIC;
  v_mr NUMERIC; v_tfr NUMERIC; v_sg NUMERIC; v_gwa NUMERIC;
  v_is_summer BOOLEAN;
  v_midterm_complete BOOLEAN; v_tfr_complete BOOLEAN; v_sg_complete BOOLEAN;
  v_absences INTEGER;
  v_remark TEXT;
BEGIN
  SELECT * INTO v_class FROM public.class_records WHERE class_record_id = p_class_record_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Class record not found.');
  END IF;
  IF v_class.grading_formula_snapshot IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This class has no frozen grading formula snapshot.');
  END IF;
  IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_class.grading_formula_snapshot->'components') component
      WHERE NULLIF(BTRIM(component->>'name'), '') IS NULL
        OR NULLIF(component->>'weight', '')::NUMERIC <= 0
        OR NULLIF(component->>'maxScore', '')::NUMERIC <= 0
    )
    OR ABS(COALESCE((
      SELECT SUM(NULLIF(component->>'weight', '')::NUMERIC)
      FROM jsonb_array_elements(v_class.grading_formula_snapshot->'components') component
    ), 0) - 100) > 0.01
  THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'The frozen grading formula is invalid or its component weights do not total 100%.');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments enrollment
    WHERE enrollment.student_id = p_student_id
      AND enrollment.section_id = v_class.section_id
      AND enrollment.subject_id = v_class.subject_id
      AND COALESCE(enrollment.status::TEXT, 'active') = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Student is not actively enrolled in this class.');
  END IF;

  v_is_summer := lower(COALESCE(v_class.semester::TEXT, '')) LIKE '%summer%';

  v_prelim := public.aspire_calculate_term_rating(p_class_record_id, p_student_id, 'Prelim', v_class.grading_formula_snapshot);
  v_midterm := public.aspire_calculate_term_rating(p_class_record_id, p_student_id, 'Midterm', v_class.grading_formula_snapshot);
  v_semi_final := public.aspire_calculate_term_rating(p_class_record_id, p_student_id, 'Semi-Final', v_class.grading_formula_snapshot);
  v_final := public.aspire_calculate_term_rating(p_class_record_id, p_student_id, 'Final', v_class.grading_formula_snapshot);

  IF (v_is_summer AND (
      NOT COALESCE((v_midterm->>'ok')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_final->>'ok')::BOOLEAN, FALSE)
    )) OR (NOT v_is_summer AND (
      NOT COALESCE((v_prelim->>'ok')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_midterm->>'ok')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_semi_final->>'ok')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_final->>'ok')::BOOLEAN, FALSE)
    ))
  THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'error', CASE WHEN v_is_summer
        THEN COALESCE(v_midterm->>'error', v_final->>'error', 'Grade calculation failed.')
        ELSE COALESCE(v_prelim->>'error', v_midterm->>'error', v_semi_final->>'error', v_final->>'error', 'Grade calculation failed.')
      END,
      'terms', jsonb_build_object('Prelim', v_prelim, 'Midterm', v_midterm, 'Semi-Final', v_semi_final, 'Final', v_final)
    );
  END IF;

  v_p := NULLIF(v_prelim->>'rating', '')::NUMERIC;
  v_m := NULLIF(v_midterm->>'rating', '')::NUMERIC;
  v_sf := NULLIF(v_semi_final->>'rating', '')::NUMERIC;
  v_f := NULLIF(v_final->>'rating', '')::NUMERIC;
  IF v_is_summer THEN
    v_mr := CASE WHEN v_m IS NULL THEN NULL ELSE ROUND(v_m) END;
    v_tfr := CASE WHEN v_f IS NULL THEN NULL ELSE ROUND(v_f) END;
    v_sg := CASE
      WHEN v_mr IS NOT NULL AND v_tfr IS NOT NULL THEN ROUND((v_mr + v_tfr) / 2)
      ELSE COALESCE(v_tfr, v_mr)
    END;
    v_midterm_complete := COALESCE((v_midterm->>'isComplete')::BOOLEAN, FALSE);
    v_tfr_complete := COALESCE((v_final->>'isComplete')::BOOLEAN, FALSE);
    v_sg_complete := v_midterm_complete AND v_tfr_complete;
  ELSE
    v_mr := CASE
      WHEN v_p IS NOT NULL AND v_m IS NOT NULL THEN ROUND((v_p + v_m) / 2)
      ELSE COALESCE(v_m, v_p)
    END;
    v_tfr := CASE
      WHEN v_sf IS NOT NULL AND v_f IS NOT NULL THEN ROUND((v_sf + v_f) / 2)
      ELSE COALESCE(v_f, v_sf)
    END;
    v_sg := CASE
      WHEN v_mr IS NOT NULL AND v_tfr IS NOT NULL THEN ROUND((v_mr + v_tfr) / 2)
      ELSE COALESCE(v_tfr, v_mr)
    END;
    v_midterm_complete := COALESCE((v_prelim->>'isComplete')::BOOLEAN, FALSE)
      AND COALESCE((v_midterm->>'isComplete')::BOOLEAN, FALSE);
    v_tfr_complete := COALESCE((v_semi_final->>'isComplete')::BOOLEAN, FALSE)
      AND COALESCE((v_final->>'isComplete')::BOOLEAN, FALSE);
    v_sg_complete := v_midterm_complete AND v_tfr_complete;
  END IF;

  v_gwa := public.aspire_transmute_grade(v_sg);
  SELECT COUNT(*)::INTEGER INTO v_absences
  FROM public.attendance_records attendance
  WHERE attendance.class_record_id = p_class_record_id
    AND attendance.student_id = p_student_id
    AND lower(attendance.status::TEXT) = 'absent';
  v_remark := CASE
    WHEN NOT v_sg_complete THEN 'incomplete'
    WHEN v_absences >= 4 THEN 'fda'
    WHEN v_gwa <= 3 THEN 'passed'
    ELSE 'failed'
  END;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'class_record_id', p_class_record_id,
    'student_id', p_student_id,
    'is_summer', v_is_summer,
    'terms', jsonb_build_object('Prelim', v_prelim, 'Midterm', v_midterm, 'Semi-Final', v_semi_final, 'Final', v_final),
    'mr', v_mr,
    'tfr', v_tfr,
    'sg', v_sg,
    'effective_grade', CASE WHEN v_remark = 'fda' THEN 5.00 ELSE v_gwa END,
    'remarks', v_remark,
    'absences', v_absences,
    'midterm_complete', v_midterm_complete,
    'tfr_complete', v_tfr_complete,
    'sg_complete', v_sg_complete,
    'input_snapshot_hash', public.aspire_grade_input_hash(p_class_record_id, p_student_id),
    'calculation_engine_version', 'server-v1'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_class_grade_projection(
  p_class_record_id UUID,
  p_student_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_class public.class_records%ROWTYPE;
  v_student_id UUID;
  v_rows JSONB := '[]'::JSONB;
  v_is_privileged BOOLEAN := FALSE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required to calculate grades.';
  END IF;
  SELECT * INTO v_class FROM public.class_records WHERE class_record_id = p_class_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Class record not found.';
  END IF;
  IF NOT (
    v_class.faculty_id = v_actor
    OR public.is_authorized_dean_for_class(p_class_record_id)
    OR public.is_active_admin()
    OR EXISTS (
      SELECT 1 FROM public.enrollments enrollment
      WHERE enrollment.student_id = v_actor
        AND enrollment.section_id = v_class.section_id
        AND enrollment.subject_id = v_class.subject_id
        AND COALESCE(enrollment.status::TEXT, 'active') = 'active'
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You are not authorized to calculate grades for this class.';
  END IF;

  v_is_privileged := v_class.faculty_id = v_actor
    OR public.is_authorized_dean_for_class(p_class_record_id)
    OR public.is_active_admin();

  FOR v_student_id IN
    SELECT DISTINCT enrollment.student_id
    FROM public.enrollments enrollment
    WHERE enrollment.section_id = v_class.section_id
      AND enrollment.subject_id = v_class.subject_id
      AND COALESCE(enrollment.status::TEXT, 'active') = 'active'
      AND (p_student_ids IS NULL OR enrollment.student_id = ANY(p_student_ids))
      AND (v_is_privileged OR enrollment.student_id = v_actor)
    ORDER BY enrollment.student_id
  LOOP
    v_rows := v_rows || jsonb_build_array(public.aspire_calculate_student_grade(p_class_record_id, v_student_id));
  END LOOP;

  RETURN jsonb_build_object(
    'class_record_id', p_class_record_id,
    'calculation_engine_version', 'server-v1',
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_calculate_term_rating(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aspire_calculate_student_grade(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_class_grade_projection(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_grade_projection(UUID, UUID[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Protect the basis of a locked official SG
-- MR and TFR intentionally remain faculty-revisable; only SG closes the basis.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.aspire_assert_grade_basis_mutable(
  p_class_record_id UUID,
  p_student_id UUID,
  p_term TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('aspire.grade_posting_context', TRUE) IN ('posting', 'correction') THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.posted_grades grade
    WHERE grade.class_record_id = p_class_record_id
      AND grade.student_id = p_student_id
      AND grade.grade_period::TEXT = 'semestral_grade'
      AND COALESCE(grade.is_locked, TRUE)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'This student''s official SG basis is locked. Use the approved SG correction workflow.';
  END IF;
  -- p_term is retained for one trigger contract, but MR/TFR rows do not lock it.
  -- Their assigned faculty may revise scores and re-post those progress ratings.
END;
$$;

CREATE OR REPLACE FUNCTION public.aspire_assert_sg_basis_mutable(
  p_class_record_id UUID,
  p_student_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.aspire_assert_grade_basis_mutable(p_class_record_id, p_student_id, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_locked_sg_term_scores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.aspire_assert_grade_basis_mutable(OLD.class_record_id, OLD.student_id, OLD.term);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    PERFORM public.aspire_assert_grade_basis_mutable(OLD.class_record_id, OLD.student_id, OLD.term);
  END IF;
  PERFORM public.aspire_assert_grade_basis_mutable(NEW.class_record_id, NEW.student_id, NEW.term);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_locked_sg_term_scores ON public.student_term_scores;
CREATE TRIGGER trg_protect_locked_sg_term_scores
BEFORE INSERT OR UPDATE OR DELETE ON public.student_term_scores
FOR EACH ROW EXECUTE FUNCTION public.protect_locked_sg_term_scores();

CREATE OR REPLACE FUNCTION public.protect_locked_sg_activity_scores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class_record_id UUID;
  v_term TEXT;
  v_old_class_record_id UUID;
  v_old_term TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT activity.class_record_id, activity.term INTO v_class_record_id, v_term
    FROM public.class_activities activity WHERE activity.activity_id = OLD.activity_id;
    PERFORM public.aspire_assert_grade_basis_mutable(v_class_record_id, OLD.student_id, v_term);
    RETURN OLD;
  END IF;
  SELECT activity.class_record_id, activity.term INTO v_class_record_id, v_term
  FROM public.class_activities activity WHERE activity.activity_id = NEW.activity_id;
  IF TG_OP = 'UPDATE' THEN
    SELECT activity.class_record_id, activity.term INTO v_old_class_record_id, v_old_term
    FROM public.class_activities activity WHERE activity.activity_id = OLD.activity_id;
    PERFORM public.aspire_assert_grade_basis_mutable(v_old_class_record_id, OLD.student_id, v_old_term);
  END IF;
  PERFORM public.aspire_assert_grade_basis_mutable(v_class_record_id, NEW.student_id, v_term);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_locked_sg_activity_scores ON public.student_activity_scores;
CREATE TRIGGER trg_protect_locked_sg_activity_scores
BEFORE INSERT OR UPDATE OR DELETE ON public.student_activity_scores
FOR EACH ROW EXECUTE FUNCTION public.protect_locked_sg_activity_scores();

CREATE OR REPLACE FUNCTION public.protect_locked_sg_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.aspire_assert_grade_basis_mutable(OLD.class_record_id, OLD.student_id, NULL);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    PERFORM public.aspire_assert_grade_basis_mutable(OLD.class_record_id, OLD.student_id, NULL);
  END IF;
  PERFORM public.aspire_assert_grade_basis_mutable(NEW.class_record_id, NEW.student_id, NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_locked_sg_attendance ON public.attendance_records;
CREATE TRIGGER trg_protect_locked_sg_attendance
BEFORE INSERT OR UPDATE OR DELETE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.protect_locked_sg_attendance();

CREATE OR REPLACE FUNCTION public.protect_posted_class_grade_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (OLD.section_id IS DISTINCT FROM NEW.section_id
      OR OLD.subject_id IS DISTINCT FROM NEW.subject_id
      OR OLD.semester IS DISTINCT FROM NEW.semester
      OR OLD.term_id IS DISTINCT FROM NEW.term_id)
    AND EXISTS (
      SELECT 1 FROM public.posted_grades grade
      WHERE grade.class_record_id = OLD.class_record_id
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Class roster identity and term metadata are immutable after a grade milestone is posted.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_posted_class_grade_identity ON public.class_records;
CREATE TRIGGER trg_protect_posted_class_grade_identity
BEFORE UPDATE OF section_id, subject_id, semester, term_id ON public.class_records
FOR EACH ROW EXECUTE FUNCTION public.protect_posted_class_grade_identity();

CREATE OR REPLACE FUNCTION public.protect_locked_sg_class_configuration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class_record_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_class_record_id := OLD.class_record_id;
  ELSE
    v_class_record_id := NEW.class_record_id;
  END IF;
  IF current_setting('aspire.grade_posting_context', TRUE) IN ('posting', 'correction') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.posted_grades grade
    WHERE grade.class_record_id = v_class_record_id
      AND grade.grade_period::TEXT = 'semestral_grade'
      AND COALESCE(grade.is_locked, TRUE)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This class configuration is frozen because official SG records exist.';
  END IF;
  -- MR/TFR are progress ratings and do not freeze class score configuration.
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_locked_sg_class_activities ON public.class_activities;
CREATE TRIGGER trg_protect_locked_sg_class_activities
BEFORE INSERT OR UPDATE OR DELETE ON public.class_activities
FOR EACH ROW EXECUTE FUNCTION public.protect_locked_sg_class_configuration();

DROP TRIGGER IF EXISTS trg_protect_locked_sg_grading_columns ON public.class_grading_columns;
CREATE TRIGGER trg_protect_locked_sg_grading_columns
BEFORE INSERT OR UPDATE OR DELETE ON public.class_grading_columns
FOR EACH ROW EXECUTE FUNCTION public.protect_locked_sg_class_configuration();

REVOKE ALL ON FUNCTION public.aspire_assert_sg_basis_mutable(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aspire_assert_grade_basis_mutable(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_posted_grade_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_locked_sg_term_scores() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_locked_sg_activity_scores() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_locked_sg_attendance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_posted_class_grade_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_locked_sg_class_configuration() FROM PUBLIC, anon, authenticated;

COMMIT;
