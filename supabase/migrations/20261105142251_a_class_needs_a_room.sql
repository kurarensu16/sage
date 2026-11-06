-- =============================================================================
-- A room becomes required, for the same reason the schedule did
-- =============================================================================
--
-- WHAT CHANGES
--   add_faculty_load_draft_v2() accepted p_room_id as NULL and recorded a class
--   with no room. The Registrar's Office has since confirmed a room is not
--   optional: every class meets somewhere, and a load with blanks in it is not
--   a timetable.
--
-- WHY IT IS NOT MERELY TIDINESS
--   This is the same mistake 20261030183805 corrected for the schedule, and the
--   reasoning is identical. find_room_conflict() opens with:
--
--     IF p_room_id IS NULL OR p_days IS NULL ... THEN RETURN NULL;
--
--   So a blank room did not merely leave a field empty -- it SKIPPED the room
--   conflict check entirely. The one safeguard against two classes being put in
--   one room at one time was switched off by leaving a dropdown alone, and
--   nobody would find out until both turned up in the first week.
--
--   A guard that an empty field can disable is not a guard.
--
-- WHAT IS DELIBERATELY LEFT ALONE
--   * class_records.room_id and faculty_load_drafts.room_id stay NULLABLE.
--     Every class provisioned before rooms existed has none, and making the
--     column NOT NULL would mean inventing a room for each of them.
--   * find_room_conflict()'s NULL guard stays. It still reads class_records
--     rows that legitimately have no room, and a guard that drafts can no
--     longer trigger costs nothing.
--   * class_type already cannot be blank: it is NOT NULL with a default of
--     'lecture' and a two-value CHECK, and the picker offers no empty option.
--     Nothing to enforce that is not already enforced.
--
--   The same shape as 20261030183805: tighten the RPC, leave the columns.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.add_faculty_load_draft_v2(
  p_department_id UUID,
  p_subject_id UUID,
  p_section_id UUID,
  p_faculty_id UUID,
  p_school_year TEXT,
  p_semester TEXT,
  p_days TEXT[] DEFAULT NULL,
  p_start TIME DEFAULT NULL,
  p_end TIME DEFAULT NULL,
  p_class_type TEXT DEFAULT 'lecture',
  p_room_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor    UUID := auth.uid();
  v_conflict JSONB;
  v_room     RECORD;
  v_id       UUID;
BEGIN
  IF p_class_type NOT IN ('lecture', 'laboratory') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'A class is either a lecture or a laboratory.';
  END IF;

  -- Required. A blank room skips find_room_conflict() entirely, so accepting
  -- one would let two classes share a room with nothing to catch it.
  IF p_room_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Pick a room. Every class needs one, and the room is what the timetable is checked against.';
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

  IF (SELECT role::TEXT FROM public.users WHERE user_id = p_faculty_id) IS DISTINCT FROM 'faculty' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Classes can only be assigned to a faculty member.';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE room_id = p_room_id;
  IF NOT FOUND OR NOT v_room.is_active THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'That room is not available.';
  END IF;
  -- A warning rather than a refusal: a laboratory sometimes genuinely meets in
  -- a lecture room, and the Registrar knows their campus better than this
  -- constraint would.
  IF p_class_type = 'laboratory' AND v_room.room_type <> 'laboratory' THEN
    RAISE WARNING 'A laboratory class was scheduled in a lecture room (%).', v_room.code;
  END IF;

  -- Serialise on everything this booking consumes, in a fixed order, so two
  -- sessions cannot each hold one and wait for another.
  PERFORM pg_advisory_xact_lock(hashtext('load_section:' || p_section_id::TEXT));
  PERFORM pg_advisory_xact_lock(hashtext('load_faculty:' || p_faculty_id::TEXT));
  PERFORM pg_advisory_xact_lock(hashtext('load_room:' || p_room_id::TEXT));

  IF EXISTS (
    SELECT 1 FROM public.class_records c
    WHERE c.subject_id = p_subject_id
      AND c.section_id = p_section_id
      AND c.school_year = p_school_year
      AND c.semester::TEXT = p_semester
      AND COALESCE(c.class_type, 'lecture') = p_class_type
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'That class already exists for this term.';
  END IF;

  v_conflict := public.find_schedule_conflict(
    p_faculty_id, p_section_id, p_days, p_start, p_end, p_school_year, p_semester
  );
  IF v_conflict IS NULL THEN
    v_conflict := public.find_room_conflict(
      p_room_id, p_days, p_start, p_end, p_school_year, p_semester
    );
  END IF;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = public.describe_schedule_conflict(v_conflict);
  END IF;

  INSERT INTO public.faculty_load_drafts (
    department_id, subject_id, section_id, faculty_id,
    school_year, semester, created_by, meeting_days, start_time, end_time,
    class_type, room_id
  ) VALUES (
    p_department_id, p_subject_id, p_section_id, p_faculty_id,
    p_school_year, p_semester, v_actor, p_days, p_start, p_end,
    p_class_type, p_room_id
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', TRUE, 'id', v_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'That class has just been assigned to someone else. Refresh to see the current load.';
END;
$$;

REVOKE ALL ON FUNCTION public.add_faculty_load_draft_v2(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT[], TIME, TIME, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_faculty_load_draft_v2(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT[], TIME, TIME, TEXT, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE v_def TEXT;
BEGIN
  v_def := pg_get_functiondef(
    'public.add_faculty_load_draft_v2(uuid,uuid,uuid,uuid,text,text,text[],time,time,text,uuid)'::regprocedure);

  IF position('Pick a room' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a class could still be added with no room, which skips the room conflict check.';
  END IF;

  -- The refusal must come BEFORE the conflict lookup, or a null room reaches
  -- it and is quietly waved through by its NULL guard.
  --
  -- Compared against the CALL, not the function's name: the name also appears
  -- in the comment that explains the refusal, and position() returns the first
  -- occurrence -- so comparing against the bare name made the comment look like
  -- the call and this assertion failed on a correct function.
  IF position('Pick a room' IN v_def)
     > position('v_conflict := public.find_room_conflict(' IN v_def) THEN
    RAISE EXCEPTION 'Verification failed: the room check runs after the conflict lookup, so a blank room still skips it.';
  END IF;

  -- Everything the previous version guaranteed must still hold.
  IF position('load_section:' IN v_def) = 0
     OR position('load_faculty:' IN v_def) = 0
     OR position('load_room:' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the advisory locks were lost, so two colleges can double-book again.';
  END IF;
  IF position('Someone else is editing this college right now' IN v_def) = 0
     OR position('Classes can only be assigned to a faculty member' IN v_def) = 0
     OR position('That class already exists for this term' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a guard from the previous version is missing.';
  END IF;

  -- class_type needs no new enforcement: NOT NULL, defaulted, and constrained.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.faculty_load_drafts'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%class_type%'
      AND pg_get_constraintdef(oid) ILIKE '%laboratory%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: class_type is no longer constrained.';
  END IF;

  RAISE NOTICE 'A class now needs a room, so the room conflict check can no longer be skipped by leaving a field blank.';
END
$verify$;

COMMIT;
