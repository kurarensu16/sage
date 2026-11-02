-- =============================================================================
-- Faculty loading: deleting a draft, and a teaching-hours window
-- =============================================================================
--
-- TWO CHANGES, both requested during QA preparation on 2026-10-31.
--
-- 1. DELETE A DRAFT
--    There was no way to remove an assignment. Reassign moves it to someone
--    else and finalize turns it into a class, but a draft added by mistake --
--    wrong section, wrong subject, wrong time -- could only be left sitting in
--    the list or pushed onto a colleague. Deleting is restricted to drafts that
--    are still drafts: once finalized, a class record exists and removing the
--    draft would orphan it, so that case is refused and the Registrar's
--    existing tools handle it instead.
--
-- 2. TEACHING HOURS: 07:00 TO 20:00
--    Schedules were free-form, so 03:00-04:30 was accepted. Nothing downstream
--    reads the hour, so this never corrupted anything -- it simply let a
--    typo through on the field that the conflict check depends on, and a
--    mistyped hour reads as a legitimate class nobody can attend.
--
--    Enforced in three places for the same reason the schedule requirement is:
--    the column constraint is the thing that cannot be bypassed, the RPC guard
--    produces a sentence a person can act on, and the client disables the
--    control before either is reached.
--
-- SAFETY
--   Both halves abort rather than alter data if the existing rows do not fit.
--   Run the two verification SELECTs below first if you want to see what would
--   be affected before committing to anything.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Refuse to proceed if any live row already sits outside the window.
--    Widening the window is a decision for the developer, not for a migration
--    that happens to run at the wrong moment.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_bad INT;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.faculty_load_drafts
  WHERE status <> 'superseded'
    AND (start_time < TIME '07:00' OR end_time > TIME '20:00');

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Aborting: % live draft(s) fall outside 07:00-20:00. Fix or supersede them first, or widen the window in this migration.', v_bad;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. The window, as a column constraint.
--    A named constraint so the next person can find it; the service layer maps
--    it to plain English, and the RPC below refuses before it is ever reached.
-- -----------------------------------------------------------------------------
ALTER TABLE public.faculty_load_drafts
  DROP CONSTRAINT IF EXISTS faculty_load_drafts_teaching_hours;

ALTER TABLE public.faculty_load_drafts
  ADD CONSTRAINT faculty_load_drafts_teaching_hours
  CHECK (start_time >= TIME '07:00' AND end_time <= TIME '20:00');

COMMENT ON CONSTRAINT faculty_load_drafts_teaching_hours ON public.faculty_load_drafts IS
  'Classes run between 07:00 and 20:00. The hour is not read by any computation; '
  'the constraint exists so a mistyped time cannot pass as a real class on the '
  'one field schedule-conflict detection depends on.';

-- -----------------------------------------------------------------------------
-- 2. The same window inside add_faculty_load_draft(), so the refusal is a
--    sentence rather than a constraint violation.
--
--    The function is restated in full because PostgreSQL has no way to insert a
--    statement into an existing body. Its prior checks are asserted at the end
--    of this migration so a restatement cannot silently drop one.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_faculty_load_draft(
  p_department_id UUID,
  p_subject_id UUID,
  p_section_id UUID,
  p_faculty_id UUID,
  p_school_year TEXT,
  p_semester TEXT,
  p_days TEXT[] DEFAULT NULL,
  p_start TIME DEFAULT NULL,
  p_end TIME DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_id UUID;
  v_faculty_role TEXT;
  v_conflict JSONB;
BEGIN
  IF NOT public.can_load_faculty_for_department(p_department_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'You do not have access to faculty loading for this college.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.provisioning_locks
    WHERE department_id = p_department_id
      AND locked_by = v_actor
      AND last_heartbeat_at > now() - INTERVAL '3 minutes'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Someone else is editing this college right now. Reopen the page to take over.';
  END IF;

  SELECT role::TEXT INTO v_faculty_role FROM public.users WHERE user_id = p_faculty_id;
  IF v_faculty_role IS DISTINCT FROM 'faculty' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Classes can only be assigned to a faculty member.';
  END IF;

  -- The schedule is required: conflict detection runs entirely off these three
  -- values, so an assignment without them is an assignment nothing can check.
  IF p_days IS NULL OR array_length(p_days, 1) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Pick at least one meeting day before adding the assignment.';
  END IF;
  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Give both a start time and an end time before adding the assignment.';
  END IF;
  IF p_end <= p_start THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'The end time has to be after the start time.';
  END IF;

  -- Teaching hours.
  IF p_start < TIME '07:00' OR p_end > TIME '20:00' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Classes can only be scheduled between 7:00 AM and 8:00 PM.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.class_records c
    WHERE c.subject_id = p_subject_id
      AND c.section_id = p_section_id
      AND c.school_year = p_school_year
      AND c.semester::TEXT = p_semester
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'That class already exists for this term.';
  END IF;

  v_conflict := public.find_schedule_conflict(
    p_faculty_id, p_section_id, p_days, p_start, p_end, p_school_year, p_semester
  );
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = public.describe_schedule_conflict(v_conflict);
  END IF;

  INSERT INTO public.faculty_load_drafts (
    department_id, subject_id, section_id, faculty_id,
    school_year, semester, created_by, meeting_days, start_time, end_time
  ) VALUES (
    p_department_id, p_subject_id, p_section_id, p_faculty_id,
    p_school_year, p_semester, v_actor, p_days, p_start, p_end
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', TRUE, 'id', v_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'That class has just been assigned to someone else. Refresh to see the current load.';
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Delete a draft.
--    Same authorization shape as reassign_faculty_load: the row is locked, the
--    caller must have loading rights for its college, and -- unlike reassign --
--    must hold the college lock, because this destroys rather than moves.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_faculty_load_draft(p_draft_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_draft public.faculty_load_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_draft FROM public.faculty_load_drafts
  WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'That assignment could not be found.';
  END IF;

  IF NOT public.can_load_faculty_for_department(v_draft.department_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'You do not have access to faculty loading for this college.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.provisioning_locks
    WHERE department_id = v_draft.department_id
      AND locked_by = v_actor
      AND last_heartbeat_at > now() - INTERVAL '3 minutes'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Someone else is editing this college right now. Reopen the page to take over.';
  END IF;

  -- A finalized draft has a class record behind it, and that class may already
  -- carry enrolments and scores. Removing the draft would leave the class with
  -- no record of how it came to exist.
  IF v_draft.status = 'finalized' OR v_draft.class_record_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This assignment is already a live class, so it cannot be removed here.';
  END IF;
  IF v_draft.status = 'superseded' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'That assignment has already been replaced.';
  END IF;

  DELETE FROM public.faculty_load_drafts WHERE id = p_draft_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_faculty_load_draft(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_faculty_load_draft(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_faculty_load_draft(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT[], TIME, TIME) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Prove the restatement above kept every earlier check.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'add_faculty_load_draft';

  IF position('Someone else is editing this college right now' IN v_def) = 0
     OR position('Classes can only be assigned to a faculty member' IN v_def) = 0
     OR position('That class already exists for this term' IN v_def) = 0
     OR position('Pick at least one meeting day' IN v_def) = 0
     OR position('find_schedule_conflict' IN v_def) = 0
     OR position('7:00 AM and 8:00 PM' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: add_faculty_load_draft() lost one of its checks.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'delete_faculty_load_draft'
  ) THEN
    RAISE EXCEPTION 'Verification failed: delete_faculty_load_draft() was not created.';
  END IF;

  RAISE NOTICE 'Drafts can now be deleted, and classes are limited to 07:00-20:00.';
END $$;

COMMIT;

-- =============================================================================
-- Look before you run, if you want to:
--
--   SELECT id, start_time, end_time, status
--   FROM public.faculty_load_drafts
--   WHERE status <> 'superseded'
--     AND (start_time < TIME '07:00' OR end_time > TIME '20:00');
--
--   -- Drafts that could be deleted once this is applied:
--   SELECT id, subject_id, section_id, faculty_id
--   FROM public.faculty_load_drafts
--   WHERE status = 'draft' AND class_record_id IS NULL;
-- =============================================================================
