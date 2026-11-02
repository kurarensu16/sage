-- =============================================================================
-- ASPIRE: GRADE CONSULTATION WINDOWS (Phase 5)
-- =============================================================================
-- Splits "posted" from "final" for the two progress milestones, and gives
-- faculty a place to record who actually reached out during the window.
--
-- Reference: docs/03-development/audits/GRADE_LIFECYCLE_AND_CONSULTATION_LOG_WORKFLOW_PLAN_2026-10-28.md
--
-- SCOPE, NARROWED FROM THE PLAN BY DEVELOPER DECISION
--   Windows apply to MIDTERM RATING and TENTATIVE FINAL RATING only.
--   SEMESTRAL GRADE is deliberately excluded: it is the summary of the other
--   two, so the consultation belongs at the milestones that feed it rather than
--   being repeated on the total. SG therefore posts and locks immediately,
--   exactly as it does today, and revising it continues to require the existing
--   Dean-approved correction path.
--
--   Consequence for Phase 6: a student Grade Change Request gates on
--   finalized_at for MR and TFR, but on POSTED for SG, because SG never
--   acquires a finalized_at.
--
-- WHY THIS IS A SMALL CHANGE RATHER THAN THE PLAN'S LARGE ONE
--   The plan proposed stopping is_locked from being set at post time and
--   deriving it from finalized_at instead. is_locked is referenced about 35
--   times across 8 migrations, and every one of those guards was written when
--   posted always meant locked -- so that approach puts the grading integrity
--   rules into a state none of them has seen.
--
--   Reading the live code showed the actual obstacle is far narrower. What
--   freezes a Prelim score after MR is posted is two EXISTS guards inside the
--   posting function, which refuse changed scores for any term already covered
--   by a different LOCKED milestone. So the exception needed is precisely:
--   a milestone stops freezing its terms while its consultation window is open.
--
--   is_locked keeps its exact meaning everywhere. The SG correction machinery is
--   untouched -- it already returns early for MR and TFR. Two conditions change,
--   in one function, and only for the two progress milestones.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The window and its notes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grade_consultation_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_record_id UUID NOT NULL REFERENCES public.class_records(class_record_id) ON DELETE CASCADE,
  -- SG is excluded at the schema level, not merely in the UI, so no later code
  -- path can open one by accident.
  grade_period TEXT NOT NULL
    CHECK (grade_period IN ('midterm_rating', 'tentative_final_rating')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ NULL,
  finalized_by UUID NULL REFERENCES public.users(user_id),
  UNIQUE (class_record_id, grade_period)
);

COMMENT ON TABLE public.grade_consultation_windows IS
  'One window per class and progress milestone. Open means the assigned faculty '
  'may still revise the scores behind it; finalized means they may not. '
  'Semestral grade has no window by design -- it is the summary of MR and TFR.';

CREATE TABLE IF NOT EXISTS public.grade_consultation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  window_id UUID NOT NULL REFERENCES public.grade_consultation_windows(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(user_id),
  note TEXT NOT NULL,
  logged_by UUID NOT NULL REFERENCES public.users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_notes_window
  ON public.grade_consultation_notes(window_id);
CREATE INDEX IF NOT EXISTS idx_consultation_notes_student
  ON public.grade_consultation_notes(student_id);

ALTER TABLE public.grade_consultation_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_consultation_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultation_windows_select ON public.grade_consultation_windows;
CREATE POLICY consultation_windows_select ON public.grade_consultation_windows
  FOR SELECT TO authenticated
  USING (
    public.is_assigned_faculty(class_record_id)
    OR public.is_authorized_dean_for_class(class_record_id)
    OR public.is_active_registrar()
    -- A student may see the window state for a class they are in, which is what
    -- drives the Posted / Finalized badge on their grade report.
    OR EXISTS (
      SELECT 1 FROM public.class_records c
      JOIN public.enrollments e
        ON e.subject_id = c.subject_id AND e.section_id = c.section_id
      WHERE c.class_record_id = grade_consultation_windows.class_record_id
        AND e.student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS consultation_notes_select ON public.grade_consultation_notes;
CREATE POLICY consultation_notes_select ON public.grade_consultation_notes
  FOR SELECT TO authenticated
  USING (
    -- A student sees only their own notes. One student must never see that
    -- another queried their grade.
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.grade_consultation_windows w
      WHERE w.id = grade_consultation_notes.window_id
        AND (public.is_assigned_faculty(w.class_record_id)
             OR public.is_authorized_dean_for_class(w.class_record_id))
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.grade_consultation_windows FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.grade_consultation_notes FROM authenticated;
REVOKE ALL ON public.grade_consultation_windows FROM anon;
REVOKE ALL ON public.grade_consultation_notes FROM anon;

-- -----------------------------------------------------------------------------
-- 2. The window opens by itself when a progress milestone is posted
-- -----------------------------------------------------------------------------
-- A trigger rather than a change inside the posting function: posting is the
-- most load-bearing code in the system and this keeps it untouched.
CREATE OR REPLACE FUNCTION public.open_consultation_window_on_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.grade_period::TEXT IN ('midterm_rating', 'tentative_final_rating') THEN
    INSERT INTO public.grade_consultation_windows (class_record_id, grade_period)
    VALUES (NEW.class_record_id, NEW.grade_period::TEXT)
    ON CONFLICT (class_record_id, grade_period) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_open_consultation_window ON public.posted_grades;
CREATE TRIGGER trg_open_consultation_window
AFTER INSERT ON public.posted_grades
FOR EACH ROW EXECUTE FUNCTION public.open_consultation_window_on_post();

REVOKE ALL ON FUNCTION public.open_consultation_window_on_post() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Is this milestone still freezing its terms?
-- -----------------------------------------------------------------------------
-- TRUE means scores feeding it may not be changed. SG always freezes. MR and
-- TFR freeze only once their window is finalized -- or immediately if no window
-- exists, which is the case for every milestone posted before this migration.
CREATE OR REPLACE FUNCTION public.milestone_edits_frozen(
  p_class_record_id UUID,
  p_grade_period TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_grade_period NOT IN ('midterm_rating', 'tentative_final_rating') THEN TRUE
    ELSE COALESCE(
      (SELECT w.finalized_at IS NOT NULL
       FROM public.grade_consultation_windows w
       WHERE w.class_record_id = p_class_record_id
         AND w.grade_period = p_grade_period),
      TRUE   -- no window: pre-existing milestone, behaves as before
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.milestone_edits_frozen(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.milestone_edits_frozen(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Logging a consultation, and closing the window
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_grade_consultation(
  p_window_id UUID,
  p_student_id UUID,
  p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window public.grade_consultation_windows%ROWTYPE;
BEGIN
  SELECT * INTO v_window FROM public.grade_consultation_windows WHERE id = p_window_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That consultation record could not be found.';
  END IF;

  IF NOT public.is_assigned_faculty(v_window.class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the faculty assigned to this class may log a consultation.';
  END IF;

  -- Enforced here, not only in the page, so a stale tab cannot add a note after
  -- the window closed and make the record look like it was open longer.
  IF v_window.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This grade has been finalized, so its consultation record is closed.';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Write what the consultation was about.';
  END IF;

  INSERT INTO public.grade_consultation_notes (window_id, student_id, note, logged_by)
  VALUES (p_window_id, p_student_id, BTRIM(p_note), auth.uid());

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_grade_milestone(p_window_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window public.grade_consultation_windows%ROWTYPE;
  v_notes INTEGER;
BEGIN
  SELECT * INTO v_window FROM public.grade_consultation_windows
  WHERE id = p_window_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That consultation record could not be found.';
  END IF;

  -- Faculty only, by developer decision: the person who owns the grade is the
  -- one who declares it final. No dean or registrar override.
  IF NOT public.is_assigned_faculty(v_window.class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the faculty assigned to this class may finalize this grade.';
  END IF;

  IF v_window.finalized_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'already_finalized', TRUE);
  END IF;

  SELECT count(*) INTO v_notes FROM public.grade_consultation_notes WHERE window_id = p_window_id;

  UPDATE public.grade_consultation_windows
  SET finalized_at = now(), finalized_by = auth.uid()
  WHERE id = p_window_id;

  RETURN jsonb_build_object('ok', TRUE, 'notes_logged', v_notes);
END;
$$;

REVOKE ALL ON FUNCTION public.log_grade_consultation(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_grade_milestone(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_grade_consultation(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_grade_milestone(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Teach the posting function about open windows
-- -----------------------------------------------------------------------------
-- The two guards that refuse changed scores for a term already covered by a
-- locked milestone now also require that milestone to be frozen. An MR with an
-- open window therefore stops blocking edits to its Prelim and Midterm scores,
-- which is exactly the consultation window's purpose.
--
-- WHICH FUNCTION HOLDS THE GUARDS
-- post_grade_milestone_v3 is what clients call, but it is a thin wrapper: it
-- validates FDA selections and the MR -> TFR -> SG sequence, then delegates to
-- post_grade_milestone_v2, which holds the actual posting logic and both
-- locked-milestone guards. So v2 is what gets patched.
--
-- An earlier version of this migration targeted v3 and was stopped by its own
-- assertion, which found zero guards there. That is the assertion working: a
-- silent no-op would have left the consultation window with no effect on
-- whether scores could be edited, and nobody would have noticed until a faculty
-- member tried to correct a grade during an open window.
--
-- Patched by reading the LIVE definition rather than transcribing several
-- hundred lines of posting logic by hand, and asserting the expected number of
-- substitutions so a drifted body aborts instead of silently doing nothing.
DO $patch$
DECLARE
  v_def TEXT;
  v_new TEXT;
  v_v3 TEXT;
  v_needle TEXT := 'AND COALESCE(locked_grade.is_locked, TRUE)';
  v_count INTEGER;
BEGIN
  v_def := pg_get_functiondef(
    'public.post_grade_milestone_v2(uuid,uuid,text,jsonb,jsonb,jsonb)'::regprocedure
  );

  -- Idempotent: re-running this migration must not append the condition twice.
  IF position('milestone_edits_frozen' IN v_def) > 0 THEN
    RAISE NOTICE 'post_grade_milestone_v2 already respects consultation windows; nothing to patch.';
    RETURN;
  END IF;

  v_count := (length(v_def) - length(replace(v_def, v_needle, ''))) / length(v_needle);
  IF v_count <> 2 THEN
    RAISE EXCEPTION
      'Phase 5 aborted: post_grade_milestone_v2 contains % locked-milestone guard(s), expected 2. '
      'The deployed body differs from what was reviewed -- re-check before applying.', v_count;
  END IF;

  -- Patching v2 only helps if v3 still routes through it. If a later migration
  -- ever inlines the posting logic into v3, this patch would quietly stop
  -- affecting real posting while still reporting success.
  v_v3 := pg_get_functiondef(
    'public.post_grade_milestone_v3(uuid,uuid,text,jsonb,jsonb,jsonb)'::regprocedure
  );
  IF position('post_grade_milestone_v2' IN v_v3) = 0 THEN
    RAISE EXCEPTION
      'Phase 5 aborted: post_grade_milestone_v3 no longer delegates to v2, so patching v2 would have no effect on posting.';
  END IF;

  v_new := replace(
    v_def,
    v_needle,
    v_needle || E'\n          AND public.milestone_edits_frozen(locked_grade.class_record_id, locked_grade.grade_period::TEXT)'
  );

  EXECUTE v_new;
  RAISE NOTICE 'post_grade_milestone_v2 now respects open consultation windows.';
END
$patch$;

-- -----------------------------------------------------------------------------
-- 6. Post-conditions
-- -----------------------------------------------------------------------------
DO $verify$
BEGIN
  IF to_regclass('public.grade_consultation_windows') IS NULL
    OR to_regclass('public.grade_consultation_notes') IS NULL
  THEN
    RAISE EXCEPTION 'Verification failed: consultation tables were not created.';
  END IF;

  IF to_regprocedure('public.finalize_grade_milestone(uuid)') IS NULL
    OR to_regprocedure('public.log_grade_consultation(uuid,uuid,text)') IS NULL
    OR to_regprocedure('public.milestone_edits_frozen(uuid,text)') IS NULL
  THEN
    RAISE EXCEPTION 'Verification failed: one or more Phase 5 functions are missing.';
  END IF;

  -- SG must never be able to hold a window.
  BEGIN
    INSERT INTO public.grade_consultation_windows (class_record_id, grade_period)
    VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'semestral_grade');
    RAISE EXCEPTION 'Verification failed: a semestral_grade window was accepted.';
  EXCEPTION
    WHEN check_violation THEN NULL;              -- correct: rejected by the CHECK
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'Verification failed: semestral_grade passed the CHECK constraint.';
  END;

  -- An unknown milestone must still freeze, so pre-existing grades are unaffected.
  IF NOT public.milestone_edits_frozen('00000000-0000-0000-0000-000000000000'::uuid, 'midterm_rating') THEN
    RAISE EXCEPTION 'Verification failed: a milestone with no window must stay frozen.';
  END IF;
  IF NOT public.milestone_edits_frozen('00000000-0000-0000-0000-000000000000'::uuid, 'semestral_grade') THEN
    RAISE EXCEPTION 'Verification failed: semestral grade must always stay frozen.';
  END IF;

  -- The patch must actually be in the deployed body. Without this, a future
  -- change to the needle would make the patch a silent no-op and every other
  -- check here would still pass: the tables, the functions and the CHECK
  -- constraint would all be correct while the window did nothing.
  IF position('milestone_edits_frozen' IN pg_get_functiondef(
       'public.post_grade_milestone_v2(uuid,uuid,text,jsonb,jsonb,jsonb)'::regprocedure)) = 0
  THEN
    RAISE EXCEPTION 'Verification failed: post_grade_milestone_v2 was not patched, so consultation windows would have no effect.';
  END IF;

  RAISE NOTICE 'Grade consultation windows verified.';
END
$verify$;

COMMIT;
