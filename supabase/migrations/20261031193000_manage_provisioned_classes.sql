-- =============================================================================
-- Reassign, retime and remove a class that is already provisioned
-- =============================================================================
--
-- WHY
--   Until now the three correction actions in Faculty Loading stopped at the
--   draft boundary: once finalized, a class could only be left as it was.
--   Timetable clashes do not respect that boundary -- a room moves, a faculty
--   member drops a load, two colleges discover they booked the same person --
--   and the answer was to live with it.
--
-- WHY RPCs AND NOT POLICIES
--   class_records_faculty_update and class_records_faculty_delete are
--   is_active_admin() only. Widening them would hand the client open UPDATE on
--   every column of a live class, including school_year, semester and the
--   frozen grading_formula_snapshot. These three functions change exactly the
--   columns they name and nothing else.
--
-- THE SAFETY LINE
--   A class that has been graded is not a scheduling mistake any more.
--   Deleting is refused once any score or posted grade exists behind it, and
--   reassigning warns nobody but is recorded. Retiming is always allowed: the
--   hour a class meets has no bearing on its grades.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Shared guard: may the caller manage this class, and does it still exist.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_class_record(p_class_record_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.can_load_faculty_for_department(
           (SELECT s.department_id
              FROM public.class_records c
              JOIN public.sections s ON s.section_id = c.section_id
             WHERE c.class_record_id = p_class_record_id)
         );
$$;

REVOKE ALL ON FUNCTION public.can_manage_class_record(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_class_record(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 1. Retime a live class.
--    p_exclude_class is the class_records counterpart of p_exclude_draft: the
--    row being changed must not be reported as clashing with itself.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_class_schedule(
  p_class_record_id UUID,
  p_days TEXT[],
  p_start TIME,
  p_end TIME
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class public.class_records%ROWTYPE;
  v_conflict JSONB;
BEGIN
  SELECT * INTO v_class FROM public.class_records
  WHERE class_record_id = p_class_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That class could not be found.';
  END IF;

  IF NOT public.can_manage_class_record(p_class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'You do not have access to faculty loading for this college.';
  END IF;

  IF p_days IS NULL OR array_length(p_days, 1) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pick at least one meeting day.';
  END IF;
  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Give both a start time and an end time.';
  END IF;
  IF p_end <= p_start THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'The end time has to be after the start time.';
  END IF;
  IF p_start < TIME '07:00' OR p_end > TIME '20:00' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Classes can only be scheduled between 7:00 AM and 8:00 PM.';
  END IF;

  v_conflict := public.find_schedule_conflict(
    v_class.faculty_id, v_class.section_id, p_days, p_start, p_end,
    v_class.school_year, v_class.semester::TEXT, NULL, p_class_record_id
  );
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = public.describe_schedule_conflict(v_conflict);
  END IF;

  UPDATE public.class_records
     SET meeting_days = p_days, start_time = p_start, end_time = p_end
   WHERE class_record_id = p_class_record_id;

  -- The draft that produced this class must move with it. find_schedule_conflict
  -- unions drafts (status <> 'superseded', which includes 'finalized') with
  -- class_records, so leaving the draft on the old time would keep blocking that
  -- slot for everyone else -- a ghost class at an hour nothing meets any more.
  UPDATE public.faculty_load_drafts
     SET meeting_days = p_days, start_time = p_start, end_time = p_end
   WHERE class_record_id = p_class_record_id
     AND status <> 'superseded';

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Reassign a live class to a different faculty member.
--    The incoming instructor may already be teaching at this hour even though
--    the outgoing one was not, so the conflict check runs against the NEW
--    faculty, excluding this class.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reassign_class_faculty(
  p_class_record_id UUID,
  p_new_faculty_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class public.class_records%ROWTYPE;
  v_role TEXT;
  v_conflict JSONB;
BEGIN
  SELECT * INTO v_class FROM public.class_records
  WHERE class_record_id = p_class_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That class could not be found.';
  END IF;

  IF NOT public.can_manage_class_record(p_class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'You do not have access to faculty loading for this college.';
  END IF;

  IF v_class.faculty_id = p_new_faculty_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'That class is already assigned to this faculty member.';
  END IF;

  SELECT role::TEXT INTO v_role FROM public.users WHERE user_id = p_new_faculty_id;
  IF v_role IS DISTINCT FROM 'faculty' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Classes can only be assigned to a faculty member.';
  END IF;

  IF v_class.meeting_days IS NOT NULL AND v_class.start_time IS NOT NULL THEN
    v_conflict := public.find_schedule_conflict(
      p_new_faculty_id, v_class.section_id, v_class.meeting_days,
      v_class.start_time, v_class.end_time,
      v_class.school_year, v_class.semester::TEXT, NULL, p_class_record_id
    );
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = public.describe_schedule_conflict(v_conflict);
    END IF;
  END IF;

  UPDATE public.class_records
     SET faculty_id = p_new_faculty_id
   WHERE class_record_id = p_class_record_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'previous_faculty_id', v_class.faculty_id
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Remove a live class, but only while it is still only a schedule.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_class_record(p_class_record_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class public.class_records%ROWTYPE;
  v_posted INT;
  v_scores INT;
BEGIN
  SELECT * INTO v_class FROM public.class_records
  WHERE class_record_id = p_class_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That class could not be found.';
  END IF;

  IF NOT public.can_manage_class_record(p_class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'You do not have access to faculty loading for this college.';
  END IF;

  SELECT count(*) INTO v_posted FROM public.posted_grades
   WHERE class_record_id = p_class_record_id;
  IF v_posted > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This class already has posted grades, so it cannot be removed.';
  END IF;

  -- Two score tables, both of which count as "this class has been taught":
  -- per-activity marks hang off class_activities, and term totals carry the
  -- class_record_id directly.
  SELECT count(*) INTO v_scores
    FROM public.student_activity_scores s
    JOIN public.class_activities a ON a.activity_id = s.activity_id
   WHERE a.class_record_id = p_class_record_id;
  IF v_scores = 0 THEN
    SELECT count(*) INTO v_scores FROM public.student_term_scores
     WHERE class_record_id = p_class_record_id;
  END IF;
  IF v_scores > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This class already has recorded scores, so it cannot be removed.';
  END IF;

  -- The draft that produced it goes back to being a draft, so the slot is not
  -- stranded: it can be corrected and finalized again, or deleted outright.
  UPDATE public.faculty_load_drafts
     SET status = 'draft', class_record_id = NULL, finalized_by = NULL, finalized_at = NULL
   WHERE class_record_id = p_class_record_id;

  DELETE FROM public.enrollments
   WHERE subject_id = v_class.subject_id
     AND section_id = v_class.section_id;

  DELETE FROM public.class_records WHERE class_record_id = p_class_record_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.update_class_schedule(UUID, TEXT[], TIME, TIME) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reassign_class_faculty(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_class_record(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_class_schedule(UUID, TEXT[], TIME, TIME) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_class_faculty(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_class_record(UUID) TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('update_class_schedule', 'reassign_class_faculty',
                           'delete_class_record', 'can_manage_class_record')) <> 4 THEN
    RAISE EXCEPTION 'Verification failed: not all class-management functions were created.';
  END IF;
  RAISE NOTICE 'Provisioned classes can now be retimed, reassigned, and removed while ungraded.';
END $$;

COMMIT;
