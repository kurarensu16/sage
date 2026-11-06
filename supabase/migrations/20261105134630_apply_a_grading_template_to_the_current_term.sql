-- =============================================================================
-- A grading template can be applied to the term that is running
-- =============================================================================
--
-- THE REQUEST
--   CHED or DepEd mandates a change to the passing threshold or the component
--   weights in the MIDDLE of a semester. The Registrar's Office raised this:
--   they are told to apply it now, not next term.
--
-- WHY IT WAS IMPOSSIBLE
--   "Applies next term" was never a rule anywhere. It is a side effect:
--   aspire_calculate_student_grade() reads class_records.grading_formula_snapshot
--   -- a frozen copy taken when grading began -- and never the live template. So
--   editing a template changed nothing for any class already being graded, and
--   protect_grading_formula_snapshot() refuses to let that copy move:
--
--     'A grading formula snapshot is immutable after it is established.'
--
--   That guard is right, and stays. What it lacked was a way to say "this is a
--   deliberate institutional policy change", as opposed to the accidental or
--   malicious edit it exists to stop. The same shape as
--   aspire.grade_posting_context, which every other guard on the grading tables
--   already honours.
--
-- WHAT APPLYING ACTUALLY MEANS
--   Re-snapshot the class, then recompute every posted grade from the new
--   formula. The engine already exists and is already server-authoritative:
--   aspire_calculate_student_grade() computes MR, TFR and SG from the raw
--   component scores, so nothing here re-implements grading math.
--
-- THE THREE CASES, AS AGREED WITH THE REGISTRAR'S OFFICE
--
--   Nothing posted      Re-snapshot. No grades exist to move.
--   MR or TFR posted    Recompute, record a revision for each, tell the
--                       instructor and the Dean's Office.
--   SG posted           REFUSED.
--
-- WHY SG IS REFUSED RATHER THAN RECOMPUTED
--   ASPIRE already has a control for changing an official grade: the Registrar
--   override, with Dean acknowledgement (20261102123111). A template edit that
--   silently rewrote hundreds of Semestral Grades would be a far larger action
--   than that control governs, performed by one person with nobody watching --
--   a back door around a safeguard this system deliberately built.
--
--   Once a Semestral Grade is posted, it stands. The override is the only route
--   to it, and this function says so rather than doing it quietly.
--
-- STUDENTS ARE NOT NOTIFIED, AND IT IS STILL NOT SILENT
--   A policy change is announced institutionally; several hundred push
--   notifications would alarm without explaining. Faculty and the Dean's Office
--   are told. Every recomputed grade carries a revision whose source is
--   'policy_update', so a student who notices their grade moved can be shown
--   exactly why, and the instructor can answer the question.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. A revision can say a policy changed.
--
--    official_source was faculty_post / dean_correction / admin_override. A
--    recomputation under a new institutional formula is none of those three, and
--    filing it as an admin_override would misattribute it to a person.
--
--    Safe to extend, unlike a status column: the three readers in the client all
--    test `=== 'dean_correction'`, so a fourth value reads as false rather than
--    dropping the row out of a filter.
-- -----------------------------------------------------------------------------
ALTER TABLE public.posted_grade_revisions
  DROP CONSTRAINT IF EXISTS posted_grade_revisions_official_source_check;
ALTER TABLE public.posted_grade_revisions
  ADD CONSTRAINT posted_grade_revisions_official_source_check
  CHECK (official_source IN ('faculty_post', 'dean_correction', 'admin_override', 'policy_update'));

DO $posted$
BEGIN
  -- posted_grades carries the same column and the same vocabulary.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.posted_grades'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%official_source%'
      AND pg_get_constraintdef(oid) ILIKE '%admin_override%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%policy_update%'
  ) THEN
    EXECUTE (
      SELECT format('ALTER TABLE public.posted_grades DROP CONSTRAINT %I', conname)
      FROM pg_constraint
      WHERE conrelid = 'public.posted_grades'::regclass
        AND pg_get_constraintdef(oid) ILIKE '%official_source%'
      LIMIT 1
    );
    ALTER TABLE public.posted_grades
      ADD CONSTRAINT posted_grades_official_source_check
      CHECK (official_source IN ('faculty_post', 'dean_correction', 'admin_override', 'policy_update'));
  END IF;
END
$posted$;

-- -----------------------------------------------------------------------------
-- 2. The snapshot guard learns one more legitimate reason to move.
--
--    Still refuses every ordinary update. Only a transaction that has declared
--    itself a policy application may re-pin a formula, and only this migration's
--    function sets that flag.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_grading_formula_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.grading_formula_snapshot IS NOT NULL
    AND NEW.grading_formula_snapshot IS DISTINCT FROM OLD.grading_formula_snapshot
    -- A deliberate institutional change, declared by the transaction doing it.
    -- Anything that has not said so is still refused, which is every ordinary
    -- write to these tables.
    AND COALESCE(current_setting('aspire.grade_posting_context', TRUE), '') <> 'policy_update'
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'A grading formula snapshot is immutable after it is established.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_grading_formula_snapshot() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. What would happen, before anything happens.
--
--    The Registrar sees the classes, the student counts and any blocker BEFORE
--    committing to it. "39 posted grades will be recomputed" is worth reading
--    before it is true.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_preview_template_application(
  p_computation_id UUID,
  p_term_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_term    public.academic_terms%ROWTYPE;
  v_classes JSONB;
  v_blocked INTEGER := 0;
  v_posted  INTEGER := 0;
BEGIN
  IF NOT (public.is_active_registrar() OR public.is_active_admin()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an active registrar or administrator may apply a grading template.';
  END IF;

  SELECT * INTO v_term FROM public.academic_terms WHERE term_id = p_term_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That academic term does not exist.';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'subject_code'), '[]'::JSONB),
         COUNT(*) FILTER (WHERE (row->>'has_sg')::BOOLEAN),
         COALESCE(SUM((row->>'posted_count')::INTEGER), 0)
  INTO v_classes, v_blocked, v_posted
  FROM (
    SELECT jsonb_build_object(
             'class_record_id', c.class_record_id,
             'subject_code', sub.code,
             'section_name', sec.name,
             'faculty_name', BTRIM(COALESCE(f.first_name, '') || ' ' || COALESCE(f.last_name, '')),
             'posted_count', (
               SELECT count(*) FROM public.posted_grades pg
               WHERE pg.class_record_id = c.class_record_id
                 AND pg.grade_period::TEXT <> 'semestral_grade'
             ),
             -- A Semestral Grade is official and final. Its presence takes the
             -- whole class out of scope rather than being recomputed.
             'has_sg', EXISTS (
               SELECT 1 FROM public.posted_grades pg
               WHERE pg.class_record_id = c.class_record_id
                 AND pg.grade_period::TEXT = 'semestral_grade'
             )
           ) AS row
    FROM public.class_records c
    JOIN public.subjects sub ON sub.subject_id = c.subject_id
    LEFT JOIN public.sections sec ON sec.section_id = c.section_id
    LEFT JOIN public.users f ON f.user_id = c.faculty_id
    WHERE sub.computation_id = p_computation_id
      AND (
        c.term_id = p_term_id
        OR (c.term_id IS NULL
            AND c.school_year = v_term.school_year
            AND c.semester::TEXT = v_term.semester::TEXT)
      )
  ) rows;

  RETURN jsonb_build_object(
    'term', format('%s %s', v_term.school_year, v_term.semester),
    'is_active_term', COALESCE(v_term.is_active, FALSE),
    'classes', v_classes,
    'class_count', jsonb_array_length(v_classes),
    'posted_grades', v_posted,
    'blocked_by_sg', v_blocked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_preview_template_application(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_preview_template_application(UUID, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Apply it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_apply_template_to_term(
  p_computation_id UUID,
  p_term_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_term       public.academic_terms%ROWTYPE;
  v_actor      UUID := auth.uid();
  v_actor_name TEXT;
  v_snapshot   JSONB;
  v_total      NUMERIC;
  v_blocked    TEXT;
  v_class      RECORD;
  v_grade      RECORD;
  v_projection JSONB;
  v_computed   NUMERIC;
  v_effective  NUMERIC;
  v_classes    INTEGER := 0;
  v_changed    INTEGER := 0;
BEGIN
  IF NOT (public.is_active_registrar() OR public.is_active_admin()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an active registrar or administrator may apply a grading template.';
  END IF;

  SELECT * INTO v_term FROM public.academic_terms WHERE term_id = p_term_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That academic term does not exist.';
  END IF;

  -- Build the snapshot from the template as it stands now, exactly as
  -- 20261014200000 does, so a re-pinned class is indistinguishable from one
  -- pinned at posting time.
  SELECT jsonb_agg(jsonb_build_object(
           'componentId', gcc.component_id,
           'name', gcc.name,
           'weight', gcc.weight,
           'maxScore', gcc.max_score,
           'isMultiple', gcc.is_multiple
         ) ORDER BY gcc.name),
         SUM(gcc.weight)
  INTO v_snapshot, v_total
  FROM public.grade_computation_components gcc
  WHERE gcc.computation_id = p_computation_id;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That grading template has no components.';
  END IF;
  IF abs(COALESCE(v_total, 0) - 100) > 0.01 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'The template weights do not total 100%. Correct the template before applying it.';
  END IF;

  v_snapshot := jsonb_build_object(
    'version', 1,
    'computationId', p_computation_id,
    'source', 'configured',
    'totalWeight', v_total,
    'components', v_snapshot
  );

  -- A class whose Semestral Grade is posted is out of scope, and its presence
  -- stops the whole operation rather than being skipped quietly: a partial
  -- application would leave one term running two different formulas with
  -- nothing recording which class used which.
  SELECT string_agg(format('%s %s', sub.code, COALESCE(sec.name, '')), ', ')
  INTO v_blocked
  FROM public.class_records c
  JOIN public.subjects sub ON sub.subject_id = c.subject_id
  LEFT JOIN public.sections sec ON sec.section_id = c.section_id
  WHERE sub.computation_id = p_computation_id
    AND (c.term_id = p_term_id
         OR (c.term_id IS NULL AND c.school_year = v_term.school_year
             AND c.semester::TEXT = v_term.semester::TEXT))
    AND EXISTS (
      SELECT 1 FROM public.posted_grades pg
      WHERE pg.class_record_id = c.class_record_id
        AND pg.grade_period::TEXT = 'semestral_grade'
    );

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format(
        'A Semestral Grade is already posted for %s. A posted Semestral Grade is final and can only be changed through the Registrar override, which the Dean acknowledges. Apply this template to the next term instead.',
        v_blocked);
  END IF;

  SELECT BTRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))
  INTO v_actor_name FROM public.users u WHERE u.user_id = v_actor;

  -- Declare the intent for the rest of this transaction. protect_grading_formula_snapshot
  -- admits exactly this one reason; every other write is still refused.
  PERFORM set_config('aspire.grade_posting_context', 'policy_update', TRUE);

  FOR v_class IN
    SELECT c.class_record_id, c.faculty_id, sub.code AS subject_code, sec.name AS section_name,
           sec.department_id
    FROM public.class_records c
    JOIN public.subjects sub ON sub.subject_id = c.subject_id
    LEFT JOIN public.sections sec ON sec.section_id = c.section_id
    WHERE sub.computation_id = p_computation_id
      AND (c.term_id = p_term_id
           OR (c.term_id IS NULL AND c.school_year = v_term.school_year
               AND c.semester::TEXT = v_term.semester::TEXT))
  LOOP
    UPDATE public.class_records
    SET grading_formula_snapshot = v_snapshot
    WHERE class_record_id = v_class.class_record_id;
    v_classes := v_classes + 1;

    -- Recompute what is already posted. The engine is unchanged and still
    -- server-authoritative; only the formula under it moved.
    FOR v_grade IN
      SELECT pg.posted_grade_id, pg.student_id, pg.grade_period::TEXT AS period,
             pg.computed_grade
      FROM public.posted_grades pg
      WHERE pg.class_record_id = v_class.class_record_id
        AND pg.grade_period::TEXT <> 'semestral_grade'
    LOOP
      v_projection := public.aspire_calculate_student_grade(v_class.class_record_id, v_grade.student_id);
      IF NOT COALESCE((v_projection->>'ok')::BOOLEAN, FALSE) THEN
        CONTINUE;
      END IF;

      v_computed := CASE v_grade.period
        WHEN 'midterm_rating' THEN NULLIF(v_projection->>'mr', '')::NUMERIC
        WHEN 'tentative_final_rating' THEN NULLIF(v_projection->>'tfr', '')::NUMERIC
        ELSE NULL END;

      -- A rating that can no longer be computed is left exactly as posted. The
      -- student keeps the grade they were given; nothing is blanked because a
      -- new formula asks for an input the old one did not.
      IF v_computed IS NULL THEN CONTINUE; END IF;
      IF v_computed IS NOT DISTINCT FROM v_grade.computed_grade THEN CONTINUE; END IF;

      v_effective := public.aspire_transmute_grade(v_computed);

      UPDATE public.posted_grades
      SET computed_grade = v_computed,
          effective_grade = v_effective,
          grading_formula_snapshot = v_snapshot,
          official_source = 'policy_update'
      WHERE posted_grade_id = v_grade.posted_grade_id;

      v_changed := v_changed + 1;
    END LOOP;

    -- One notice per class, to the instructor. The Dean's Office is told below.
    IF v_class.faculty_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
      ) VALUES (
        v_class.faculty_id, 'grading_policy', 'Grading Formula Updated',
        '/faculty/classrecordslist', 'warning',
        format('The grading computation for %s %s was updated by %s under an institutional policy change. Ratings already posted for this class have been recalculated under the new formula.',
               v_class.subject_code, COALESCE(v_class.section_name, ''),
               COALESCE(NULLIF(v_actor_name, ''), 'the Registrar')),
        jsonb_build_object('class_record_id', v_class.class_record_id,
                           'computation_id', p_computation_id,
                           'term_id', p_term_id),
        format('policy_update:%s:%s', v_class.class_record_id, p_term_id),
        FALSE
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  END LOOP;

  -- The Dean's Office, once, with the totals.
  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
  )
  SELECT u.user_id, 'grading_policy', 'Grading Formula Applied to the Current Term',
         '/dean/dashboard', 'warning',
         format('%s applied an updated grading computation to %s %s. %s class(es) were affected and %s posted rating(s) were recalculated. Semestral Grades were not changed.',
                COALESCE(NULLIF(v_actor_name, ''), 'The Registrar'),
                v_term.school_year, v_term.semester, v_classes, v_changed),
         jsonb_build_object('computation_id', p_computation_id, 'term_id', p_term_id,
                            'classes', v_classes, 'grades_changed', v_changed),
         format('policy_update_summary:%s:%s:%s', p_computation_id, p_term_id,
                to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS')),
         FALSE
  FROM public.users u
  WHERE COALESCE(u.status, 'active') = 'active'
    AND u.role::TEXT IN ('dean', 'registrar')
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'classes_updated', v_classes,
    'grades_recalculated', v_changed,
    'term', format('%s %s', v_term.school_year, v_term.semester)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_apply_template_to_term(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_apply_template_to_term(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.aspire_apply_template_to_term(UUID, UUID) IS
  'Re-pins a grading template onto a term''s classes and recalculates any posted '
  'MR or TFR. Refuses outright when a Semestral Grade exists: that is the '
  'Registrar override''s job, under Dean acknowledgement.';

-- -----------------------------------------------------------------------------
-- 5. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE v_def TEXT;
BEGIN
  IF to_regprocedure('public.aspire_apply_template_to_term(uuid,uuid)') IS NULL
     OR to_regprocedure('public.aspire_preview_template_application(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: a template still cannot be applied to a running term.';
  END IF;

  v_def := pg_get_functiondef('public.aspire_apply_template_to_term(uuid,uuid)'::regprocedure);

  -- The refusal is the whole safeguard. Without it this becomes a way to
  -- rewrite official grades with nobody watching.
  IF position('Semestral Grade is already posted' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: posted Semestral Grades could be silently rewritten.';
  END IF;

  -- Recomputation must go through the existing engine, never re-implement it.
  IF position('aspire_calculate_student_grade' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: grades would be recomputed by something other than the grading engine.';
  END IF;

  -- Every changed grade must be attributable.
  IF position('policy_update' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a recomputed grade would not say why it changed.';
  END IF;

  -- The snapshot guard must still refuse everything else.
  v_def := pg_get_functiondef('public.protect_grading_formula_snapshot()'::regprocedure);
  IF position('immutable after it is established' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: grading snapshots are no longer protected at all.';
  END IF;
  IF position('policy_update' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the guard admits no deliberate policy change, so applying a template cannot work.';
  END IF;

  -- The revision vocabulary must carry the new source, or every recomputation
  -- fails on a CHECK at the moment it matters most.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.posted_grade_revisions'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%policy_update%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: a policy revision could not be recorded.';
  END IF;

  -- The revision trigger is what makes any of this auditable.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_record_posted_grade_revision'
      AND tgrelid = 'public.posted_grades'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: recomputed grades would change with no revision recorded.';
  END IF;

  RAISE NOTICE 'A grading template can now be applied to a running term, and a posted Semestral Grade still cannot be touched.';
END
$verify$;

COMMIT;
