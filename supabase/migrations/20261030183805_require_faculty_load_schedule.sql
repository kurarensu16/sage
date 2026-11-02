-- Faculty loading: the schedule becomes required
-- =============================================================================
-- 2026-10-30. Reverses a decision taken in 20261029093613, where meeting_days,
-- start_time and end_time were nullable so "a college could adopt timetabling at
-- its own pace without blocking loading."
--
-- WHY IT HAS TO CHANGE
-- find_schedule_conflict() is the only safeguard in the system against loading
-- one faculty member into two classes in the same hour, or booking one section
-- twice. Its first statement is:
--
--   IF p_days IS NULL OR array_length(p_days, 1) IS NULL
--      OR p_start IS NULL OR p_end IS NULL THEN RETURN NULL;
--
-- So an optional schedule did not mean "checked later" -- it meant the check was
-- switched off by leaving three fields blank, and the assignment went in with
-- nothing able to flag the clash. The flexibility and the safeguard were the
-- same switch.
--
-- WHAT THIS MIGRATION DOES
--   1. Tightens the three columns on faculty_load_drafts to NOT NULL and
--      replaces the two CHECK constraints that were written to permit NULL.
--   2. Patches add_faculty_load_draft() to refuse a blank schedule with a
--      plain-English message, so the refusal reads as guidance rather than as a
--      constraint violation.
--
-- WHAT IT DELIBERATELY LEAVES ALONE
--   * class_records.meeting_days/start_time/end_time stay NULLABLE. Classes
--     created before scheduling existed, or provisioned outside faculty
--     loading, have no pattern; making those columns NOT NULL would need a
--     schedule invented for every one of them. finalize_faculty_load_draft()
--     copies the pattern onto the class it provisions, so everything that comes
--     through loading from now on carries one.
--   * find_schedule_conflict()'s NULL guard stays. It still receives rows from
--     class_records, which may legitimately have no pattern, and a guard that
--     drafts can no longer trigger costs nothing.
--
-- The UI and service halves are in FacultyLoadingWorkspace.jsx and
-- facultyLoadingService.js in the same change.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Nothing may be left behind half-tightened
-- -----------------------------------------------------------------------------
-- A plain ALTER would fail with Postgres's own message, which names a column and
-- nothing else. This says what is in the way and what to do about it, because a
-- draft with no schedule cannot have one guessed for it.
DO $guard$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.faculty_load_drafts
  WHERE meeting_days IS NULL
     OR array_length(meeting_days, 1) IS NULL
     OR start_time IS NULL
     OR end_time IS NULL;

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Aborted: % faculty load assignment(s) have no schedule. Nothing was changed. Open Faculty Loading & Provisioning, give each of them days and times, or remove the drafts, then run this again.', v_bad;
  END IF;
END;
$guard$;

-- -----------------------------------------------------------------------------
-- 2. The columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.faculty_load_drafts
  ALTER COLUMN meeting_days SET NOT NULL,
  ALTER COLUMN start_time SET NOT NULL,
  ALTER COLUMN end_time SET NOT NULL;

-- Both of the originals were phrased to pass when a value was NULL. With NOT
-- NULL in place those branches are dead, and leaving them in would suggest a
-- blank schedule is still a state this table expects.
ALTER TABLE public.faculty_load_drafts
  DROP CONSTRAINT IF EXISTS faculty_load_drafts_time_order,
  DROP CONSTRAINT IF EXISTS faculty_load_drafts_days_valid;

ALTER TABLE public.faculty_load_drafts
  ADD CONSTRAINT faculty_load_drafts_time_order
    CHECK (end_time > start_time),
  ADD CONSTRAINT faculty_load_drafts_days_valid
    CHECK (
      array_length(meeting_days, 1) >= 1
      AND meeting_days <@ ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun']::TEXT[]
    );

COMMENT ON COLUMN public.faculty_load_drafts.meeting_days IS
  'Day set for the class, e.g. {Mon,Wed,Fri}. REQUIRED: schedule conflict '
  'detection runs off this column and the two times, so an assignment without '
  'them is an assignment nothing can check.';

-- -----------------------------------------------------------------------------
-- 3. The RPC
-- -----------------------------------------------------------------------------
-- Restated in full rather than patched from its live definition, because this
-- adds a block instead of substituting a string. Drift is ruled out instead by
-- asserting first that the live body is still the one 20261029093613 installed:
-- if something has changed it since, this aborts rather than quietly reverting
-- that change.
DO $assert$
DECLARE
  v_def TEXT;
BEGIN
  IF to_regprocedure('public.add_faculty_load_draft(uuid,uuid,uuid,uuid,text,text,text[],time,time)') IS NULL THEN
    RAISE EXCEPTION 'Aborted: add_faculty_load_draft() is missing. Apply 20261029093613 first.';
  END IF;

  v_def := pg_get_functiondef(
    to_regprocedure('public.add_faculty_load_draft(uuid,uuid,uuid,uuid,text,text,text[],time,time)'));

  -- Already carries this migration's guard, from an earlier run.
  IF position('A class needs its meeting days' IN v_def) > 0 THEN
    RAISE NOTICE 'add_faculty_load_draft() already requires a schedule.';
    RETURN;
  END IF;

  -- Anchors from the 20261029093613 body. All three present means the function
  -- is the one this migration was written against.
  IF position('Someone else is editing this college right now' IN v_def) = 0
     OR position('Classes can only be assigned to a faculty member' IN v_def) = 0
     OR position('That class already exists for this term' IN v_def) = 0 THEN
    RAISE EXCEPTION
      'Aborted: add_faculty_load_draft() is not the definition this migration expects. It was not changed. Reconcile it by hand before running this.';
  END IF;
END;
$assert$;

CREATE OR REPLACE FUNCTION public.add_faculty_load_draft(
  p_department_id UUID,
  p_subject_id UUID,
  p_section_id UUID,
  p_faculty_id UUID,
  p_school_year TEXT,
  p_semester TEXT,
  -- No longer defaulted to NULL. A caller that omits them is a caller that
  -- forgot them, and the error below says so.
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

  -- Holding the college lock is part of being allowed to write, not just a UI
  -- affordance; otherwise a stale tab could add behind the current holder.
  IF NOT EXISTS (
    SELECT 1 FROM public.provisioning_locks
    WHERE department_id = p_department_id
      AND locked_by = v_actor
      AND last_heartbeat_at > now() - INTERVAL '3 minutes'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Someone else is editing this college right now. Reopen the page to take over.';
  END IF;

  -- The schedule is required. Checked before anything is written, and ahead of
  -- the NOT NULL columns, so the refusal is a sentence a registrar can act on
  -- rather than a constraint name. The days check uses array_length rather than
  -- = '{}' because an empty array is not NULL and would otherwise pass.
  IF p_days IS NULL OR array_length(p_days, 1) IS NULL
     OR p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'A class needs its meeting days and both times before it can be assigned. Without them the system cannot tell whether this faculty member is already teaching at that hour.';
  END IF;

  IF p_end <= p_start THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'The end time has to be after the start time.';
  END IF;

  IF NOT (p_days <@ ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun']::TEXT[]) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Those meeting days are not recognised. Use the day buttons on the form.';
  END IF;

  SELECT role::TEXT INTO v_faculty_role FROM public.users WHERE user_id = p_faculty_id;
  IF v_faculty_role IS DISTINCT FROM 'faculty' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Classes can only be assigned to a faculty member.';
  END IF;

  -- A live class already occupying the slot is as blocking as a live draft.
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

  -- Institution-wide schedule check. Now reached on every call, because the
  -- guard above guarantees it has something to work with.
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
    -- The partial index fired: another session claimed the slot first.
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'That class has just been assigned to someone else. Refresh to see the current load.';
END;
$$;

REVOKE ALL ON FUNCTION public.add_faculty_load_draft(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT[], TIME, TIME) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_faculty_load_draft(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT[], TIME, TIME) TO authenticated;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_col TEXT;
  v_nullable TEXT;
  v_def TEXT;
BEGIN
  -- 1. All three columns are NOT NULL.
  FOREACH v_col IN ARRAY ARRAY['meeting_days', 'start_time', 'end_time'] LOOP
    SELECT is_nullable INTO v_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'faculty_load_drafts'
      AND column_name = v_col;

    IF v_nullable IS NULL THEN
      RAISE EXCEPTION 'Verification failed: faculty_load_drafts.% does not exist.', v_col;
    END IF;
    IF v_nullable <> 'NO' THEN
      RAISE EXCEPTION 'Verification failed: faculty_load_drafts.% is still nullable.', v_col;
    END IF;
  END LOOP;

  -- 2. Neither CHECK still carries an IS NULL escape.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.faculty_load_drafts'::regclass
      AND conname IN ('faculty_load_drafts_time_order', 'faculty_load_drafts_days_valid')
      AND pg_get_constraintdef(oid) ILIKE '%IS NULL%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: a schedule CHECK constraint still permits NULL.';
  END IF;

  -- 3. Both CHECKs are present. Dropping without re-adding would be worse than
  --    leaving the permissive pair in place.
  IF (
    SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.faculty_load_drafts'::regclass
      AND conname IN ('faculty_load_drafts_time_order', 'faculty_load_drafts_days_valid')
  ) <> 2 THEN
    RAISE EXCEPTION 'Verification failed: one of the schedule CHECK constraints is missing.';
  END IF;

  -- 4. The RPC carries the guard, and still carries the rest of its body --
  --    a restated function that lost a check would read as success otherwise.
  v_def := pg_get_functiondef(
    to_regprocedure('public.add_faculty_load_draft(uuid,uuid,uuid,uuid,text,text,text[],time,time)'));
  IF position('A class needs its meeting days' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: add_faculty_load_draft() does not require a schedule.';
  END IF;
  IF position('Someone else is editing this college right now' IN v_def) = 0
     OR position('Classes can only be assigned to a faculty member' IN v_def) = 0
     OR position('That class already exists for this term' IN v_def) = 0
     OR position('find_schedule_conflict' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: add_faculty_load_draft() lost one of its original checks.';
  END IF;

  RAISE NOTICE 'Faculty loading now requires a schedule on every assignment.';
END;
$verify$;

COMMIT;
