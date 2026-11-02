-- =============================================================================
-- Faculty loading: correcting a draft's schedule
-- =============================================================================
--
-- WHY
--   A mistyped schedule had no remedy. Reassign moves the class to a different
--   faculty member, which is a different act entirely, and deleting and
--   re-adding loses the row. So "13:44-18:48" could only be fixed by starting
--   over, and in practice it stayed.
--
-- THE EXCLUSION THAT MAKES THIS POSSIBLE
--   find_schedule_conflict() already accepts p_exclude_draft, which nothing had
--   ever passed. It exists for exactly this case: when re-checking a row that is
--   being changed, the row's own current slot must not count as a conflict with
--   itself, or every edit would be refused by the thing it is editing.
--
-- SCOPE
--   Drafts only. Once finalized, a class record exists and may already carry
--   enrolments and scores, and the instructor and students would need telling
--   that the time moved. That is a larger change and deliberately not this one.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.update_faculty_load_draft(
  p_draft_id UUID,
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
  v_actor UUID := auth.uid();
  v_draft public.faculty_load_drafts%ROWTYPE;
  v_conflict JSONB;
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

  IF v_draft.status = 'superseded' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'That assignment has already been replaced.';
  END IF;
  IF v_draft.status = 'finalized' OR v_draft.class_record_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This assignment is already a live class, so its schedule cannot be changed here.';
  END IF;

  -- Same shape of validation as adding, because the same column constraints and
  -- the same conflict check apply to the result.
  IF p_days IS NULL OR array_length(p_days, 1) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Pick at least one meeting day.';
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

  -- Excluding this draft from its own check. Without it the row's existing slot
  -- would be reported as a clash with the slot replacing it.
  v_conflict := public.find_schedule_conflict(
    v_draft.faculty_id, v_draft.section_id, p_days, p_start, p_end,
    v_draft.school_year, v_draft.semester, p_draft_id
  );
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = public.describe_schedule_conflict(v_conflict);
  END IF;

  UPDATE public.faculty_load_drafts
     SET meeting_days = p_days,
         start_time = p_start,
         end_time = p_end
   WHERE id = p_draft_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.update_faculty_load_draft(UUID, TEXT[], TIME, TIME) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_faculty_load_draft(UUID, TEXT[], TIME, TIME) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_faculty_load_draft'
  ) THEN
    RAISE EXCEPTION 'Verification failed: update_faculty_load_draft() was not created.';
  END IF;
  RAISE NOTICE 'A draft schedule can now be corrected in place.';
END $$;

COMMIT;
