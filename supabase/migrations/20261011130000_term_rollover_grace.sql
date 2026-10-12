-- Admin setup audit R1, R2, R3: safe term rollover with a grace period for unposted SGs.
--
-- Before:
--   * The rollover emptied every student's home section when the next term had no
--     sections yet, and promoted every student's year level (R1).
--   * Sections and classes never stored term_id, so the rollover archived nothing and
--     the pre-check always found 0 classes (R2).
--   * Once archiving worked, an unposted class could no longer be posted (posting needs
--     an active class), and the late flag marked every MR/TFR row as late (R3).
--
-- After (design: docs/03-development/audits/ADMIN_SETUP_AUDIT_2026-10-11.md §5.11):
--   1. term_id is filled automatically on sections and classes from their school year
--      and semester (new rows and a one-time back-fill of existing rows).
--   2. academic_terms gets sg_grace_days (default 30) and ended_at (set by the rollover).
--   3. The rollover (admin only) is refused until the next term has sections. It moves
--      each student to the matching next-term section (same name, or the next year
--      number in a new school year, same college) and promotes only those students;
--      students without a matching section keep their current section and year.
--      It archives only classes whose SG is posted for every enrolled student; the
--      others stay open as previous-term classes until their SG is posted.
--   4. Every first SG posting is labelled on time / late (within the grace period) /
--      late_overdue (after the grace period), from the class's term.
--   5. When the SG of a previous-term class is posted for every enrolled student, the
--      class is archived (view only).
--   6. An archived class accepts only an SG repost of a Dean-approved SG correction
--      (posting function and the correction request are opened to archived classes;
--      the existing correction triggers still guard every value).
--   7. get_term_sg_status(school_year, semester): per-class SG status for the
--      pre-rollover check (admin) and Grade Submission Status (Dean, own college).
-- No admin-made or automatic grades. The old is_late_submission column is no longer
-- written (kept for history).

BEGIN;

-- ── 1. term_id on sections and classes ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fill_section_term_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.term_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT t.term_id INTO NEW.term_id
  FROM public.academic_terms t
  WHERE t.school_year = NEW.school_year
    AND t.semester::TEXT = NEW.semester::TEXT
  ORDER BY t.created_at
  LIMIT 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_section_term_id ON public.sections;
CREATE TRIGGER trg_fill_section_term_id
BEFORE INSERT OR UPDATE OF school_year, semester ON public.sections
FOR EACH ROW EXECUTE FUNCTION public.fill_section_term_id();

CREATE OR REPLACE FUNCTION public.fill_class_term_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.term_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT t.term_id INTO NEW.term_id
  FROM public.academic_terms t
  WHERE t.school_year = NEW.school_year
    AND t.semester::TEXT = NEW.semester::TEXT
  ORDER BY t.created_at
  LIMIT 1;
  IF NEW.term_id IS NULL AND NEW.section_id IS NOT NULL THEN
    SELECT s.term_id INTO NEW.term_id FROM public.sections s WHERE s.section_id = NEW.section_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_class_term_id ON public.class_records;
CREATE TRIGGER trg_fill_class_term_id
BEFORE INSERT OR UPDATE OF school_year, semester ON public.class_records
FOR EACH ROW EXECUTE FUNCTION public.fill_class_term_id();

-- One-time back-fill (R2): rows saved before term_id was recorded.
UPDATE public.sections s
SET term_id = t.term_id
FROM public.academic_terms t
WHERE s.term_id IS NULL
  AND t.school_year = s.school_year
  AND t.semester::TEXT = s.semester::TEXT;

UPDATE public.class_records c
SET term_id = t.term_id
FROM public.academic_terms t
WHERE c.term_id IS NULL
  AND t.school_year = c.school_year
  AND t.semester::TEXT = c.semester::TEXT;

-- ── 2. Grace period and end date per term; SG submission label ─────────────────
ALTER TABLE public.academic_terms
  ADD COLUMN IF NOT EXISTS sg_grace_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_terms_sg_grace_days_range'
  ) THEN
    ALTER TABLE public.academic_terms
      ADD CONSTRAINT academic_terms_sg_grace_days_range CHECK (sg_grace_days BETWEEN 0 AND 180);
  END IF;
END;
$$;

ALTER TABLE public.posted_grades
  ADD COLUMN IF NOT EXISTS sg_submission_status TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posted_grades_sg_submission_status_check'
  ) THEN
    ALTER TABLE public.posted_grades
      ADD CONSTRAINT posted_grades_sg_submission_status_check
      CHECK (sg_submission_status IS NULL OR sg_submission_status IN ('on_time', 'late', 'late_overdue'));
  END IF;
END;
$$;

-- 'current' (its term is active, upcoming, or never ended), 'grace' (term ended, within
-- the grace period), or 'overdue' (term ended, grace period over).
CREATE OR REPLACE FUNCTION public.class_sg_deadline_state(p_class_record_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN t.term_id IS NULL OR COALESCE(t.is_active, FALSE) OR t.ended_at IS NULL THEN 'current'
      WHEN CURRENT_TIMESTAMP <= t.ended_at + make_interval(days => t.sg_grace_days) THEN 'grace'
      ELSE 'overdue'
    END
    FROM public.class_records c
    LEFT JOIN public.academic_terms t
      ON t.term_id = c.term_id
      OR (c.term_id IS NULL AND t.school_year = c.school_year AND t.semester::TEXT = c.semester::TEXT)
    WHERE c.class_record_id = p_class_record_id
    ORDER BY (t.term_id = c.term_id) DESC NULLS LAST
    LIMIT 1
  ), 'current');
$$;

REVOKE ALL ON FUNCTION public.class_sg_deadline_state(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.class_sg_deadline_state(UUID) TO authenticated;

-- ── 4. Label every first SG posting ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_sg_submission_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.grade_period::TEXT <> 'semestral_grade' THEN
    NEW.sg_submission_status := NULL;
    RETURN NEW;
  END IF;
  NEW.sg_submission_status := CASE public.class_sg_deadline_state(NEW.class_record_id)
    WHEN 'grace' THEN 'late'
    WHEN 'overdue' THEN 'late_overdue'
    ELSE 'on_time'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sg_submission_status ON public.posted_grades;
CREATE TRIGGER trg_set_sg_submission_status
BEFORE INSERT ON public.posted_grades
FOR EACH ROW EXECUTE FUNCTION public.set_sg_submission_status();

-- The label is set once, at the first posting; a later correction keeps it.
CREATE OR REPLACE FUNCTION public.keep_sg_submission_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.sg_submission_status := OLD.sg_submission_status;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_sg_submission_status ON public.posted_grades;
CREATE TRIGGER trg_keep_sg_submission_status
BEFORE UPDATE OF sg_submission_status ON public.posted_grades
FOR EACH ROW EXECUTE FUNCTION public.keep_sg_submission_status();

-- ── 5. Archive a previous-term class once its SG is posted for everyone ─────────
CREATE OR REPLACE FUNCTION public.archive_previous_term_class_after_sg()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.grade_period::TEXT <> 'semestral_grade'
     OR public.class_sg_deadline_state(NEW.class_record_id) = 'current' THEN
    RETURN NULL;
  END IF;

  UPDATE public.class_records c
  SET status = 'archived'
  WHERE c.class_record_id = NEW.class_record_id
    AND c.status::TEXT = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.section_id = c.section_id
        AND e.subject_id = c.subject_id
        AND COALESCE(e.status::TEXT, 'active') = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.posted_grades pg
          WHERE pg.class_record_id = c.class_record_id
            AND pg.student_id = e.student_id
            AND pg.grade_period::TEXT = 'semestral_grade'
        )
    );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_previous_term_class_after_sg ON public.posted_grades;
CREATE TRIGGER trg_archive_previous_term_class_after_sg
AFTER INSERT ON public.posted_grades
FOR EACH ROW EXECUTE FUNCTION public.archive_previous_term_class_after_sg();

-- ── 3. Safe rollover ───────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.perform_semester_transition(UUID, UUID);

CREATE OR REPLACE FUNCTION public.perform_semester_transition(
  old_term_uuid UUID,
  new_term_uuid UUID,
  p_grace_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old public.academic_terms%ROWTYPE;
  v_new public.academic_terms%ROWTYPE;
  v_is_new_sy BOOLEAN;
  v_new_sections INTEGER;
  v_moved INTEGER := 0;
  v_kept INTEGER := 0;
  v_archived INTEGER := 0;
  v_pending INTEGER := 0;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only an active administrator can start the next term.';
  END IF;
  IF p_grace_days IS NULL OR p_grace_days < 0 OR p_grace_days > 180 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The grace period must be between 0 and 180 days.';
  END IF;

  SELECT * INTO v_old FROM public.academic_terms WHERE term_id = old_term_uuid FOR UPDATE;
  SELECT * INTO v_new FROM public.academic_terms WHERE term_id = new_term_uuid FOR UPDATE;
  IF v_old.term_id IS NULL OR v_new.term_id IS NULL OR v_old.term_id = v_new.term_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid current or next academic term.';
  END IF;
  IF NOT COALESCE(v_old.is_active, FALSE) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The current term is no longer active. Reload Term Settings.';
  END IF;

  -- Rows saved before term_id was recorded.
  UPDATE public.sections SET term_id = t.term_id
  FROM public.academic_terms t
  WHERE sections.term_id IS NULL
    AND t.term_id IN (v_old.term_id, v_new.term_id)
    AND t.school_year = sections.school_year
    AND t.semester::TEXT = sections.semester::TEXT;
  UPDATE public.class_records SET term_id = v_old.term_id
  WHERE term_id IS NULL
    AND school_year = v_old.school_year
    AND semester::TEXT = v_old.semester::TEXT;

  SELECT COUNT(*) INTO v_new_sections FROM public.sections WHERE term_id = v_new.term_id;
  IF v_new_sections = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('No sections exist yet for %s %s. Create the next term''s sections first; students are moved into them during the rollover.', v_new.school_year, v_new.semester);
  END IF;

  v_is_new_sy := v_new.school_year IS DISTINCT FROM v_old.school_year;

  -- Keep a record of every student's section and year in the term that is ending.
  INSERT INTO public.student_term_details (student_id, term_id, year_level, section_id)
  SELECT user_id, v_old.term_id, COALESCE(year_level, '1st Year'), section_id
  FROM public.users
  WHERE role::TEXT = 'student' AND COALESCE(status, 'active') = 'active' AND section_id IS NOT NULL
  ON CONFLICT (student_id, term_id) DO UPDATE
  SET year_level = EXCLUDED.year_level, section_id = EXCLUDED.section_id;

  -- Move each student to the matching next-term section of the same college:
  -- the same name, or the next year number in a new school year (BSIT-1A -> BSIT-2A).
  -- Students without a matching section keep their current section and year level.
  WITH targets AS (
    SELECT DISTINCT ON (u.user_id)
      u.user_id,
      ns.section_id AS new_section_id,
      substring(ns.name FROM '-(\d)') AS new_year_digit
    FROM public.users u
    JOIN public.sections os ON os.section_id = u.section_id
    JOIN public.sections ns
      ON ns.term_id = v_new.term_id
     AND ns.department_id IS NOT DISTINCT FROM os.department_id
     AND upper(ns.name) = upper(
           CASE
             WHEN v_is_new_sy AND os.name ~ '-\d'
               THEN regexp_replace(os.name, '-(\d)', '-' || ((substring(os.name FROM '-(\d)'))::INTEGER + 1)::TEXT)
             ELSE os.name
           END)
    WHERE u.role::TEXT = 'student'
      AND COALESCE(u.status, 'active') = 'active'
      AND os.term_id IS DISTINCT FROM v_new.term_id
    ORDER BY u.user_id, ns.name
  )
  UPDATE public.users u
  SET section_id = t.new_section_id,
      year_level = CASE
        WHEN v_is_new_sy AND t.new_year_digit IS NOT NULL THEN
          t.new_year_digit || CASE t.new_year_digit WHEN '1' THEN 'st' WHEN '2' THEN 'nd' WHEN '3' THEN 'rd' ELSE 'th' END || ' Year'
        ELSE u.year_level
      END
  FROM targets t
  WHERE u.user_id = t.user_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  SELECT COUNT(*) INTO v_kept
  FROM public.users u
  LEFT JOIN public.sections s ON s.section_id = u.section_id
  WHERE u.role::TEXT = 'student'
    AND COALESCE(u.status, 'active') = 'active'
    AND u.section_id IS NOT NULL
    AND s.term_id IS DISTINCT FROM v_new.term_id;

  -- Archive the ending term's classes whose SG is posted for every enrolled student.
  -- The rest stay open as previous-term classes until their SG is posted.
  UPDATE public.class_records c
  SET status = 'archived'
  WHERE c.term_id = v_old.term_id
    AND c.status::TEXT = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.section_id = c.section_id
        AND e.subject_id = c.subject_id
        AND COALESCE(e.status::TEXT, 'active') = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.posted_grades pg
          WHERE pg.class_record_id = c.class_record_id
            AND pg.student_id = e.student_id
            AND pg.grade_period::TEXT = 'semestral_grade'
        )
    );
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  SELECT COUNT(*) INTO v_pending
  FROM public.class_records
  WHERE term_id = v_old.term_id AND status::TEXT = 'active';

  UPDATE public.academic_terms
  SET is_active = FALSE, ended_at = CURRENT_TIMESTAMP, sg_grace_days = p_grace_days
  WHERE term_id = v_old.term_id;
  UPDATE public.academic_terms
  SET is_active = TRUE, ended_at = NULL
  WHERE term_id = v_new.term_id;

  RETURN jsonb_build_object(
    'students_moved', v_moved,
    'students_kept', v_kept,
    'classes_archived', v_archived,
    'classes_pending_sg', v_pending,
    'grace_days', p_grace_days,
    'new_school_year', v_is_new_sy
  );
END;
$$;

REVOKE ALL ON FUNCTION public.perform_semester_transition(UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perform_semester_transition(UUID, UUID, INTEGER) TO authenticated;

-- ── 7. Per-class SG status for a term ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_term_sg_status(p_school_year TEXT, p_semester TEXT)
RETURNS TABLE (
  class_record_id UUID,
  subject_code TEXT,
  subject_name TEXT,
  section_name TEXT,
  department_id UUID,
  faculty_id UUID,
  faculty_name TEXT,
  class_status TEXT,
  deadline_state TEXT,
  enrolled_count INTEGER,
  sg_posted_count INTEGER,
  sg_late_count INTEGER,
  sg_overdue_count INTEGER,
  sg_first_posted_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    c.class_record_id,
    sub.code::TEXT,
    sub.name::TEXT,
    sec.name::TEXT,
    sec.department_id,
    c.faculty_id,
    BTRIM(COALESCE(f.first_name, '') || ' ' || COALESCE(f.last_name, '')),
    c.status::TEXT,
    public.class_sg_deadline_state(c.class_record_id),
    (SELECT COUNT(DISTINCT e.student_id) FROM public.enrollments e
      WHERE e.section_id = c.section_id AND e.subject_id = c.subject_id
        AND COALESCE(e.status::TEXT, 'active') = 'active')::INTEGER,
    (SELECT COUNT(*) FROM public.posted_grades pg
      WHERE pg.class_record_id = c.class_record_id AND pg.grade_period::TEXT = 'semestral_grade')::INTEGER,
    (SELECT COUNT(*) FROM public.posted_grades pg
      WHERE pg.class_record_id = c.class_record_id AND pg.grade_period::TEXT = 'semestral_grade'
        AND pg.sg_submission_status = 'late')::INTEGER,
    (SELECT COUNT(*) FROM public.posted_grades pg
      WHERE pg.class_record_id = c.class_record_id AND pg.grade_period::TEXT = 'semestral_grade'
        AND pg.sg_submission_status = 'late_overdue')::INTEGER,
    (SELECT MIN(pg.posted_at) FROM public.posted_grades pg
      WHERE pg.class_record_id = c.class_record_id AND pg.grade_period::TEXT = 'semestral_grade')
  FROM public.class_records c
  LEFT JOIN public.subjects sub ON sub.subject_id = c.subject_id
  LEFT JOIN public.sections sec ON sec.section_id = c.section_id
  LEFT JOIN public.users f ON f.user_id = c.faculty_id
  WHERE c.school_year = p_school_year
    AND c.semester::TEXT = p_semester
    AND (
      public.is_active_admin()
      OR EXISTS (
        SELECT 1 FROM public.users actor
        WHERE actor.user_id = auth.uid()
          AND actor.role::TEXT = 'dean'
          AND COALESCE(actor.status::TEXT, 'active') = 'active'
          AND actor.department_id = sec.department_id
      )
    )
  ORDER BY sec.name, sub.code;
$$;

REVOKE ALL ON FUNCTION public.get_term_sg_status(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_term_sg_status(TEXT, TEXT) TO authenticated;

-- ── 6. Archived classes: only a Dean-approved SG correction may be reposted ─────

CREATE OR REPLACE FUNCTION public.post_grade_milestone_atomic(
  p_class_record_id UUID,
  p_grade_period TEXT,
  p_grading_formula_snapshot JSONB,
  p_term_score_rows JSONB DEFAULT '[]'::JSONB,
  p_activity_score_rows JSONB DEFAULT '[]'::JSONB,
  p_posted_grade_rows JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_class public.class_records%ROWTYPE;
  v_effective_snapshot JSONB;
  v_component_count INTEGER;
  v_total_weight NUMERIC;
  v_item JSONB;
  v_term public.student_term_scores%ROWTYPE;
  v_activity public.student_activity_scores%ROWTYPE;
  v_posted public.posted_grades%ROWTYPE;
  v_student_id UUID;
  v_posted_count INTEGER := 0;
  v_term_count INTEGER := 0;
  v_activity_count INTEGER := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required to post grades.';
  END IF;

  IF p_grade_period NOT IN ('midterm_rating', 'tentative_final_rating', 'semestral_grade') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported grade milestone.';
  END IF;

  IF jsonb_typeof(COALESCE(p_term_score_rows, '[]'::JSONB)) <> 'array'
    OR jsonb_typeof(COALESCE(p_activity_score_rows, '[]'::JSONB)) <> 'array'
    OR jsonb_typeof(COALESCE(p_posted_grade_rows, '[]'::JSONB)) <> 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Grade posting payloads must be JSON arrays.';
  END IF;

  IF jsonb_array_length(COALESCE(p_posted_grade_rows, '[]'::JSONB)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No student grades were supplied for posting.';
  END IF;

  SELECT class_record.*
  INTO v_class
  FROM public.class_records class_record
  WHERE class_record.class_record_id = p_class_record_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The class record does not exist.';
  END IF;

  IF v_class.faculty_id IS DISTINCT FROM v_actor_id
    OR NOT EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.user_id = v_actor_id
        AND actor.role::TEXT = 'faculty'
        AND actor.status = 'active'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the active faculty assigned to this class can post its grades.';
  END IF;

  -- An archived class is view only. The one write allowed is reposting its SG after the
  -- Dean approved an SG correction (review_sg_correction_request unlocked that row).
  -- Every student in the payload must already have an SG; the correction triggers
  -- still refuse any changed value that was not approved.
  IF COALESCE(v_class.status::TEXT, '') <> 'active' THEN
    IF p_grade_period <> 'semestral_grade'
      OR NOT EXISTS (
        SELECT 1 FROM public.posted_grades unlocked
        WHERE unlocked.class_record_id = p_class_record_id
          AND unlocked.grade_period::TEXT = 'semestral_grade'
          AND NOT COALESCE(unlocked.is_locked, TRUE)
      )
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(p_posted_grade_rows, '[]'::JSONB)) payload
        WHERE NOT EXISTS (
          SELECT 1 FROM public.posted_grades existing
          WHERE existing.class_record_id = p_class_record_id
            AND existing.grade_period::TEXT = 'semestral_grade'
            AND existing.student_id = (payload.value->>'student_id')::UUID
        )
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This class is archived and view only. Official SG changes go through an approved SG correction.';
    END IF;
  END IF;

  -- Serialize retries and concurrent posts for the same class milestone.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_class_record_id::TEXT || ':' || p_grade_period, 0)
  );

  v_effective_snapshot := COALESCE(v_class.grading_formula_snapshot, p_grading_formula_snapshot);
  IF v_effective_snapshot IS NULL
    OR jsonb_typeof(v_effective_snapshot) <> 'object'
    OR jsonb_typeof(v_effective_snapshot->'components') <> 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A valid class or subject COG is required before grades can be posted.';
  END IF;

  SELECT COUNT(*), SUM((component->>'weight')::NUMERIC)
  INTO v_component_count, v_total_weight
  FROM jsonb_array_elements(v_effective_snapshot->'components') component
  WHERE NULLIF(BTRIM(component->>'name'), '') IS NOT NULL
    AND (component->>'weight')::NUMERIC > 0
    AND (component->>'maxScore')::NUMERIC > 0;

  IF v_component_count <> jsonb_array_length(v_effective_snapshot->'components')
    OR v_component_count = 0
    OR ABS(COALESCE(v_total_weight, 0) - 100) > 0.01
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The grading COG is invalid or its component weights do not total 100%.';
  END IF;

  IF v_class.grading_formula_snapshot IS NOT NULL
    AND p_grading_formula_snapshot IS NOT NULL
    AND v_class.grading_formula_snapshot <> p_grading_formula_snapshot
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The submitted COG differs from the class grading snapshot.';
  END IF;

  IF v_class.grading_formula_snapshot IS NULL THEN
    UPDATE public.class_records
    SET grading_formula_snapshot = v_effective_snapshot
    WHERE class_record_id = p_class_record_id
      AND grading_formula_snapshot IS NULL;
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_term_score_rows, '[]'::JSONB))
  LOOP
    SELECT * INTO v_term
    FROM jsonb_populate_record(NULL::public.student_term_scores, v_item);

    IF v_term.class_record_id IS DISTINCT FROM p_class_record_id
      OR v_term.term NOT IN ('Prelim', 'Midterm', 'Semi-Final', 'Final')
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A term-score row does not belong to this class or uses an invalid term.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.enrollments enrollment
      WHERE enrollment.student_id = v_term.student_id
        AND enrollment.section_id = v_class.section_id
        AND enrollment.subject_id = v_class.subject_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'A term-score student is not enrolled in this class.';
    END IF;

    INSERT INTO public.student_term_scores (
      score_id, class_record_id, student_id, term,
      act1, act2, act3, act4, act5, act6, char_rating, exam,
      saved_at, saved_by
    ) VALUES (
      COALESCE(v_term.score_id, gen_random_uuid()), p_class_record_id, v_term.student_id, v_term.term,
      v_term.act1, v_term.act2, v_term.act3, v_term.act4, v_term.act5, v_term.act6,
      v_term.char_rating, v_term.exam, CURRENT_TIMESTAMP, v_actor_id
    )
    ON CONFLICT (class_record_id, student_id, term) DO UPDATE SET
      act1 = COALESCE(EXCLUDED.act1, student_term_scores.act1),
      act2 = COALESCE(EXCLUDED.act2, student_term_scores.act2),
      act3 = COALESCE(EXCLUDED.act3, student_term_scores.act3),
      act4 = COALESCE(EXCLUDED.act4, student_term_scores.act4),
      act5 = COALESCE(EXCLUDED.act5, student_term_scores.act5),
      act6 = COALESCE(EXCLUDED.act6, student_term_scores.act6),
      char_rating = COALESCE(EXCLUDED.char_rating, student_term_scores.char_rating),
      exam = COALESCE(EXCLUDED.exam, student_term_scores.exam),
      saved_at = CURRENT_TIMESTAMP,
      saved_by = v_actor_id;

    v_term_count := v_term_count + 1;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_activity_score_rows, '[]'::JSONB))
  LOOP
    SELECT * INTO v_activity
    FROM jsonb_populate_record(NULL::public.student_activity_scores, v_item);

    IF v_activity.score IS NULL OR v_activity.score < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An activity score must be a non-negative number.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.class_activities activity
      JOIN public.enrollments enrollment
        ON enrollment.student_id = v_activity.student_id
       AND enrollment.section_id = v_class.section_id
       AND enrollment.subject_id = v_class.subject_id
      WHERE activity.activity_id = v_activity.activity_id
        AND activity.class_record_id = p_class_record_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'An activity-score row does not belong to this class roster.';
    END IF;

    INSERT INTO public.student_activity_scores (
      score_id, student_id, activity_id, score, created_at, updated_at
    ) VALUES (
      COALESCE(v_activity.score_id, gen_random_uuid()), v_activity.student_id,
      v_activity.activity_id, v_activity.score, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (student_id, activity_id) DO UPDATE SET
      score = EXCLUDED.score,
      updated_at = CURRENT_TIMESTAMP;

    v_activity_count := v_activity_count + 1;
  END LOOP;

  IF (
    SELECT COUNT(*)
    FROM (
      SELECT (value->>'student_id')::UUID
      FROM jsonb_array_elements(p_posted_grade_rows)
      GROUP BY (value->>'student_id')::UUID
    ) distinct_students
  ) <> jsonb_array_length(p_posted_grade_rows) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'The posting payload contains duplicate student rows.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_posted_grade_rows)
  LOOP
    IF COALESCE(v_item->>'grade_period', '') <> p_grade_period THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A posted-grade row targets a different milestone.';
    END IF;

    IF COALESCE(v_item->>'remarks', '') NOT IN ('passed', 'failed', 'incomplete', 'fda', 'dropped') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A posted-grade row has an unsupported remark.';
    END IF;

    SELECT * INTO v_posted
    FROM jsonb_populate_record(NULL::public.posted_grades, v_item);
    v_student_id := v_posted.student_id;

    IF v_posted.class_record_id IS DISTINCT FROM p_class_record_id
      OR v_posted.computed_grade IS NULL
      OR v_posted.computed_grade < 0
      OR v_posted.computed_grade > 100
      OR (p_grade_period = 'semestral_grade' AND v_posted.effective_grade IS NULL)
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A posted-grade row is incomplete or outside the accepted grade range.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.enrollments enrollment
      WHERE enrollment.student_id = v_student_id
        AND enrollment.section_id = v_class.section_id
        AND enrollment.subject_id = v_class.subject_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'A posted-grade student is not enrolled in this class.';
    END IF;

    INSERT INTO public.posted_grades (
      posted_grade_id, class_record_id, student_id, grade_period,
      computed_grade, effective_grade, remarks, remarks_note,
      remarks_set_by, remarks_set_at, posted_by, posted_at,
      is_locked, locked_milestones, grading_formula_snapshot
    ) VALUES (
      gen_random_uuid(), p_class_record_id, v_student_id, p_grade_period,
      v_posted.computed_grade,
      CASE WHEN p_grade_period = 'semestral_grade' THEN v_posted.effective_grade ELSE NULL END,
      v_posted.remarks, v_posted.remarks_note,
      v_actor_id, CURRENT_TIMESTAMP, v_actor_id, CURRENT_TIMESTAMP,
      TRUE, v_posted.locked_milestones, v_effective_snapshot
    )
    ON CONFLICT (class_record_id, grade_period, student_id) DO UPDATE SET
      computed_grade = EXCLUDED.computed_grade,
      effective_grade = EXCLUDED.effective_grade,
      remarks = EXCLUDED.remarks,
      remarks_note = EXCLUDED.remarks_note,
      remarks_set_by = v_actor_id,
      remarks_set_at = CURRENT_TIMESTAMP,
      posted_by = v_actor_id,
      posted_at = CURRENT_TIMESTAMP,
      is_locked = TRUE,
      locked_milestones = EXCLUDED.locked_milestones,
      grading_formula_snapshot = v_effective_snapshot;

    v_posted_count := v_posted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'class_record_id', p_class_record_id,
    'grade_period', p_grade_period,
    'posted_count', v_posted_count,
    'term_score_count', v_term_count,
    'activity_score_count', v_activity_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_sg_correction_request(
  p_class_record_id UUID,
  p_student_id UUID,
  p_proposed_remark TEXT,
  p_reason TEXT,
  p_evidence_url TEXT DEFAULT NULL,
  p_proposed_computed_grade NUMERIC DEFAULT NULL,
  p_proposed_effective_grade NUMERIC DEFAULT NULL,
  p_proposed_score_changes JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_class public.class_records%ROWTYPE;
  v_posted public.posted_grades%ROWTYPE;
  v_request_id UUID;
  v_subject_name TEXT;
  v_section_name TEXT;
  v_faculty_name TEXT;
  v_proposed_remark TEXT := lower(BTRIM(COALESCE(p_proposed_remark, '')));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A correction reason is required.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_evidence_url, '')), '') IS NOT NULL
    AND BTRIM(p_evidence_url) !~* '^https://[^[:space:]]+$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The evidence reference must be a secure HTTPS URL.';
  END IF;
  IF v_proposed_remark NOT IN ('passed', 'failed', 'incomplete', 'fda', 'dropped') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Select an exact proposed academic remark.';
  END IF;
  IF jsonb_typeof(COALESCE(p_proposed_score_changes, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Proposed score changes must be a JSON array.';
  END IF;
  IF p_proposed_computed_grade IS NOT NULL
    AND (p_proposed_computed_grade < 0 OR p_proposed_computed_grade > 100)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The proposed computed percentage must be between 0 and 100.';
  END IF;
  IF p_proposed_effective_grade IS NOT NULL
    AND (p_proposed_effective_grade < 1 OR p_proposed_effective_grade > 5)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The proposed effective GWA must be between 1.00 and 5.00.';
  END IF;

  SELECT class_record.* INTO v_class
  FROM public.class_records class_record
  WHERE class_record.class_record_id = p_class_record_id
  FOR UPDATE;

  -- Archived classes are included: an SG posted after the term ended can still be
  -- corrected through the Dean.
  IF NOT FOUND OR v_class.faculty_id IS DISTINCT FROM v_actor
    OR NOT EXISTS (
      SELECT 1 FROM public.users actor
      WHERE actor.user_id = v_actor AND actor.role::TEXT = 'faculty' AND actor.status = 'active'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the active faculty assigned to this class may request an SG correction.';
  END IF;

  SELECT posted.* INTO v_posted
  FROM public.posted_grades posted
  WHERE posted.class_record_id = p_class_record_id
    AND posted.student_id = p_student_id
    AND posted.grade_period::TEXT = 'semestral_grade'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'No official semestral grade exists for this student.';
  END IF;
  IF NOT COALESCE(v_posted.is_locked, TRUE) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'This semestral grade already has an active revision permission.';
  END IF;
  IF (p_proposed_computed_grade IS NULL OR p_proposed_computed_grade IS NOT DISTINCT FROM v_posted.computed_grade)
    AND (p_proposed_effective_grade IS NULL OR p_proposed_effective_grade IS NOT DISTINCT FROM v_posted.effective_grade)
    AND v_proposed_remark IS NOT DISTINCT FROM v_posted.remarks::TEXT
    AND jsonb_array_length(COALESCE(p_proposed_score_changes, '[]'::JSONB)) = 0
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The correction proposal must change at least one official value.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.remark_override_requests request
    WHERE request.posted_grade_id = v_posted.posted_grade_id
      AND request.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'An unresolved correction request already exists for this semestral grade.';
  END IF;

  SELECT
    COALESCE(subject.code || ' - ' || subject.name, subject.name, subject.code, 'Subject'),
    section.name,
    BTRIM(COALESCE(faculty.first_name, '') || ' ' || COALESCE(faculty.last_name, ''))
  INTO v_subject_name, v_section_name, v_faculty_name
  FROM public.class_records class_record
  LEFT JOIN public.subjects subject ON subject.subject_id = class_record.subject_id
  LEFT JOIN public.sections section ON section.section_id = class_record.section_id
  LEFT JOIN public.users faculty ON faculty.user_id = class_record.faculty_id
  WHERE class_record.class_record_id = p_class_record_id;

  INSERT INTO public.remark_override_requests (
    class_record_id, student_id, requested_by, requested_at,
    subject_name, section_name, faculty_name,
    posted_grade_id,
    computed_grade, effective_grade, current_remark, requested_remark,
    original_computed_grade, original_effective_grade, original_remark,
    proposed_computed_grade, proposed_effective_grade, proposed_remark,
    proposed_score_changes, note, evidence_url, status
  ) VALUES (
    p_class_record_id, p_student_id, v_actor, CURRENT_TIMESTAMP,
    v_subject_name, v_section_name, v_faculty_name,
    v_posted.posted_grade_id,
    v_posted.computed_grade, v_posted.effective_grade, v_posted.remarks::TEXT, v_proposed_remark,
    v_posted.computed_grade, v_posted.effective_grade, v_posted.remarks::TEXT,
    p_proposed_computed_grade, p_proposed_effective_grade, v_proposed_remark,
    COALESCE(p_proposed_score_changes, '[]'::JSONB), BTRIM(p_reason), NULLIF(BTRIM(COALESCE(p_evidence_url, '')), ''), 'pending'
  )
  RETURNING request_id INTO v_request_id;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'posted_grade_id', v_posted.posted_grade_id,
    'status', 'pending',
    'original_computed_grade', v_posted.computed_grade,
    'original_effective_grade', v_posted.effective_grade,
    'original_remark', v_posted.remarks::TEXT,
    'proposed_computed_grade', p_proposed_computed_grade,
    'proposed_effective_grade', p_proposed_effective_grade,
    'proposed_remark', v_proposed_remark
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_grade_milestone_atomic(UUID, TEXT, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_grade_milestone_atomic(UUID, TEXT, JSONB, JSONB, JSONB, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_grade_milestone_atomic(UUID, TEXT, JSONB, JSONB, JSONB, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_sg_correction_request(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_sg_correction_request(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB) TO authenticated;

COMMIT;
