-- =============================================================================
-- ASPIRE: FACULTY LOADING AND PROVISIONING (Phase 4)
-- =============================================================================
-- Backs the unified Faculty Loading & Provisioning page shared by Registrar (all
-- colleges) and Dean (own college):
--   * faculty_load_drafts  -- the Draft -> Finalize checkpoint
--   * provisioning_locks   -- per-college concurrency guard, 3-minute TTL
--
-- Reference: docs/03-development/audits/FACULTY_LOADING_AND_PROVISIONING_WORKFLOW_PLAN_2026-10-28.md
--
-- WHAT THIS DOES NOT DO
--   It does not create classes. provisionClassroomByAdmin() in
--   src/lib/classRoomService.js remains the single provisioning path and is
--   reused verbatim -- it validates the slot, freezes the grading formula
--   snapshot (including Phase 3's passing and FDA thresholds), auto-enrols the
--   block section and issues a join code. Finalize simply calls it and then
--   stamps the draft here. A second provisioning path would diverge from that
--   snapshot logic, which is the one thing in this system that must not drift.
--
-- WHY THERE IS NO AUTOMATED CONFLICT DETECTION
--   Checked against the live schema: class_records carries no day, time or
--   meeting-schedule column, and no table anywhere tracks timetables -- the only
--   `scheduled_at` columns belong to consultation scheduling. A faculty member
--   teaching the same subject in two sections is normal, not a clash; a real
--   clash needs meeting times that do not exist yet. So the draft stage is a
--   human review checkpoint, and the one thing the database CAN enforce -- that
--   a subject+section slot has at most one live claimant -- is enforced
--   structurally by the partial unique index below.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Dean scoping helper
-- -----------------------------------------------------------------------------
-- The existing dean helpers resolve scope from a class or a student. Loading
-- happens before any class exists, so scope has to come from the college itself.
CREATE OR REPLACE FUNCTION public.is_active_dean_for_department(p_department_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users actor
    WHERE actor.user_id = auth.uid()
      AND actor.role::TEXT = 'dean'
      AND COALESCE(actor.status::TEXT, 'active') = 'active'
      AND actor.department_id = p_department_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_dean_for_department(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_dean_for_department(UUID) TO authenticated;

-- Registrar reaches every college; a Dean reaches only their own. Expressed once
-- here so every RPC below applies the identical rule.
CREATE OR REPLACE FUNCTION public.can_load_faculty_for_department(p_department_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.is_active_registrar()
      OR public.is_active_dean_for_department(p_department_id);
$$;

REVOKE ALL ON FUNCTION public.can_load_faculty_for_department(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_load_faculty_for_department(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Per-college concurrency lock
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provisioning_locks (
  department_id UUID PRIMARY KEY REFERENCES public.departments(department_id) ON DELETE CASCADE,
  locked_by UUID NOT NULL REFERENCES public.users(user_id),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.provisioning_locks IS
  'One advisory lock per college for the Faculty Loading page. Expires after 3 '
  'minutes without a heartbeat, which covers a closed tab or a crash that an '
  'explicit release never would.';

ALTER TABLE public.provisioning_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provisioning_locks_select ON public.provisioning_locks;
CREATE POLICY provisioning_locks_select ON public.provisioning_locks
  FOR SELECT TO authenticated
  USING (public.is_active_registrar() OR public.is_active_dean_for_department(department_id));

REVOKE INSERT, UPDATE, DELETE ON public.provisioning_locks FROM authenticated;
REVOKE ALL ON public.provisioning_locks FROM anon;

-- Acquire, or take over an abandoned lock. Returns the current holder either
-- way so the page can name them in its read-only banner without a second query.
CREATE OR REPLACE FUNCTION public.acquire_provisioning_lock(p_department_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_lock public.provisioning_locks%ROWTYPE;
  v_holder TEXT;
BEGIN
  IF NOT public.can_load_faculty_for_department(p_department_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'You do not have access to faculty loading for this college.';
  END IF;

  -- Serialise the whole acquire so two callers cannot both see a free lock.
  PERFORM pg_advisory_xact_lock(hashtextextended('provisioning-lock:' || p_department_id::TEXT, 0));

  SELECT * INTO v_lock FROM public.provisioning_locks WHERE department_id = p_department_id;

  IF FOUND
    AND v_lock.locked_by <> v_actor
    AND v_lock.last_heartbeat_at > now() - INTERVAL '3 minutes'
  THEN
    SELECT BTRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))
      INTO v_holder
    FROM public.users u WHERE u.user_id = v_lock.locked_by;

    RETURN jsonb_build_object(
      'acquired', FALSE,
      'holder_id', v_lock.locked_by,
      'holder_name', COALESCE(NULLIF(v_holder, ''), 'Another user'),
      'since', v_lock.locked_at
    );
  END IF;

  INSERT INTO public.provisioning_locks (department_id, locked_by, locked_at, last_heartbeat_at)
  VALUES (p_department_id, v_actor, now(), now())
  ON CONFLICT (department_id) DO UPDATE
    SET locked_by = EXCLUDED.locked_by,
        locked_at = EXCLUDED.locked_at,
        last_heartbeat_at = EXCLUDED.last_heartbeat_at;

  PERFORM public.notify_loading_session_started(p_department_id);

  RETURN jsonb_build_object('acquired', TRUE, 'holder_id', v_actor);
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_provisioning_lock(p_department_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.provisioning_locks
  SET last_heartbeat_at = now()
  WHERE department_id = p_department_id AND locked_by = auth.uid();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  -- Losing the lock is not an error: the page simply drops to read-only.
  RETURN jsonb_build_object('held', v_updated > 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_provisioning_lock(p_department_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.provisioning_locks
  WHERE department_id = p_department_id AND locked_by = auth.uid();
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_provisioning_lock(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_provisioning_lock(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_provisioning_lock(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_provisioning_lock(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_provisioning_lock(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_provisioning_lock(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Faculty load drafts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faculty_load_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(department_id),
  subject_id UUID NOT NULL REFERENCES public.subjects(subject_id),
  section_id UUID NOT NULL REFERENCES public.sections(section_id),
  faculty_id UUID NOT NULL REFERENCES public.users(user_id),
  school_year TEXT NOT NULL,
  semester TEXT NOT NULL,
  -- Meeting pattern. One pattern per class: a day set plus a single time range,
  -- which covers MWF 08:00-09:00 and TTh 13:00-14:30 alike.
  -- KNOWN LIMITATION: it cannot express a split pattern such as lecture MW
  -- 08:00-09:00 plus lab F 13:00-16:00. That needs a child table of meetings;
  -- moving to one later is a migration, not a redesign of this column set.
  -- Rooms are deliberately out of scope -- no room exists anywhere in the schema.
  meeting_days TEXT[] NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  CONSTRAINT faculty_load_drafts_time_order
    CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time),
  CONSTRAINT faculty_load_drafts_days_valid
    CHECK (
      meeting_days IS NULL
      OR (array_length(meeting_days, 1) >= 1
          AND meeting_days <@ ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun']::TEXT[])
    ),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'superseded')),
  class_record_id UUID NULL REFERENCES public.class_records(class_record_id),
  created_by UUID NOT NULL REFERENCES public.users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_by UUID NULL REFERENCES public.users(user_id),
  finalized_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE public.faculty_load_drafts IS
  'Draft -> Finalize checkpoint for faculty loading. Rows are never hard '
  'deleted: a replaced assignment becomes superseded, keeping the record of who '
  'was originally loaded.';

-- At most one LIVE claim per slot per term. Superseded rows are excluded so the
-- history of reassignments can accumulate without blocking a new assignment.
-- This is what makes a double-booking structurally impossible rather than
-- something caught after submission.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_faculty_load_slot_live
  ON public.faculty_load_drafts (subject_id, section_id, school_year, semester)
  WHERE status <> 'superseded';

CREATE INDEX IF NOT EXISTS idx_faculty_load_drafts_faculty
  ON public.faculty_load_drafts (faculty_id, school_year, semester);

ALTER TABLE public.faculty_load_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS faculty_load_drafts_select ON public.faculty_load_drafts;
CREATE POLICY faculty_load_drafts_select ON public.faculty_load_drafts
  FOR SELECT TO authenticated
  USING (
    public.is_active_registrar()
    OR public.is_active_dean_for_department(department_id)
    -- A faculty member may see their own load, including what is still drafted.
    OR faculty_id = auth.uid()
  );

REVOKE INSERT, UPDATE, DELETE ON public.faculty_load_drafts FROM authenticated;
REVOKE ALL ON public.faculty_load_drafts FROM anon;

-- The live class carries the same pattern, so a conflict check sees drafts and
-- already-provisioned classes alike. Existing classes have no schedule and stay
-- NULL, which the check treats as "unknown, allow" -- blocking on them would
-- make every legacy class unassignable.
ALTER TABLE public.class_records
  ADD COLUMN IF NOT EXISTS meeting_days TEXT[] NULL,
  ADD COLUMN IF NOT EXISTS start_time TIME NULL,
  ADD COLUMN IF NOT EXISTS end_time TIME NULL;

COMMENT ON COLUMN public.class_records.meeting_days IS
  'Day set for the class, e.g. {Mon,Wed,Fri}. NULL on classes created before '
  'scheduling existed; conflict checks skip those rather than block them.';

-- -----------------------------------------------------------------------------
-- Schedule conflict detection
-- -----------------------------------------------------------------------------
-- INSTITUTION-WIDE on purpose. General Education faculty teach across colleges,
-- so a check scoped to the college on screen would miss exactly the clashes that
-- matter -- and a Dean, who sees only their own college, could create one they
-- are literally unable to see.
--
-- The return therefore discloses only the conflicting class's COLLEGE (and
-- program where it can be derived). A Dean has no business seeing another
-- college's subject, section or faculty, but does need enough to understand why
-- the slot is refused.
-- Disclosure boundary, applied before the conflict ever leaves the database.
--
--   Registrar -> full specifics. They are institution-wide by definition, so
--                naming the clashing subject and section tells them nothing they
--                could not already look up, and it is what makes the refusal
--                actionable.
--   Dean      -> college and program only. A Dean's remit is one college; which
--                subject and section another college is running is not theirs
--                to see, even though the clash legitimately blocks them.
--
-- Done here rather than in the message formatter on purpose: if it were only in
-- the formatter, a Dean calling find_schedule_conflict() directly would still
-- receive the specifics in the payload.
CREATE OR REPLACE FUNCTION public.redact_schedule_conflict(p_conflict JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF p_conflict IS NULL THEN RETURN NULL; END IF;
  IF public.is_active_registrar() THEN RETURN p_conflict; END IF;
  RETURN p_conflict - 'subject_code' - 'section_name';
END;
$$;

REVOKE ALL ON FUNCTION public.redact_schedule_conflict(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redact_schedule_conflict(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.find_schedule_conflict(
  p_faculty_id UUID,
  p_section_id UUID,
  p_days TEXT[],
  p_start TIME,
  p_end TIME,
  p_school_year TEXT,
  p_semester TEXT,
  p_exclude_draft UUID DEFAULT NULL,
  p_exclude_class UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hit RECORD;
BEGIN
  -- No schedule given means nothing to check. Scheduling is optional so a
  -- college can adopt it at its own pace without blocking loading.
  IF p_days IS NULL OR array_length(p_days, 1) IS NULL
     OR p_start IS NULL OR p_end IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. The same faculty member already teaching at an overlapping time.
  SELECT d.name AS college, pr.abbreviation AS program,
         x.meeting_days, x.start_time, x.end_time,
         sub.code AS subject_code, s2.name AS section_name
    INTO v_hit
  FROM (
    SELECT l.faculty_id, l.section_id, l.subject_id, l.department_id,
           l.meeting_days, l.start_time, l.end_time
    FROM public.faculty_load_drafts l
    WHERE l.status <> 'superseded'
      AND l.school_year = p_school_year AND l.semester = p_semester
      AND (p_exclude_draft IS NULL OR l.id <> p_exclude_draft)
    UNION ALL
    SELECT c.faculty_id, c.section_id, c.subject_id, sec.department_id,
           c.meeting_days, c.start_time, c.end_time
    FROM public.class_records c
    LEFT JOIN public.sections sec ON sec.section_id = c.section_id
    WHERE c.school_year = p_school_year AND c.semester::TEXT = p_semester
      AND (p_exclude_class IS NULL OR c.class_record_id <> p_exclude_class)
  ) x
  LEFT JOIN public.departments d ON d.department_id = x.department_id
  LEFT JOIN public.sections s2 ON s2.section_id = x.section_id
  LEFT JOIN public.subjects sub ON sub.subject_id = x.subject_id
  LEFT JOIN public.programs pr
    ON pr.department_id = x.department_id
   AND upper(pr.abbreviation) = upper(split_part(COALESCE(s2.name, ''), '-', 1))
  WHERE x.faculty_id = p_faculty_id
    AND x.meeting_days && p_days          -- share at least one day
    AND x.start_time IS NOT NULL
    AND x.start_time < p_end AND p_start < x.end_time
  LIMIT 1;

  IF FOUND THEN
    RETURN public.redact_schedule_conflict(jsonb_build_object(
      'kind', 'faculty',
      'college', COALESCE(v_hit.college, 'another college'),
      'program', v_hit.program,
      'days', v_hit.meeting_days,
      'start_time', v_hit.start_time,
      'end_time', v_hit.end_time,
      'subject_code', v_hit.subject_code,
      'section_name', v_hit.section_name
    ));
  END IF;

  -- 2. The same section already booked at an overlapping time. Students cannot
  --    be in two classes at once, and this is as common a mistake as the above.
  SELECT d.name AS college, x.meeting_days, x.start_time, x.end_time,
         sub.code AS subject_code, s2.name AS section_name
    INTO v_hit
  FROM (
    SELECT l.section_id, l.subject_id, l.department_id, l.meeting_days, l.start_time, l.end_time
    FROM public.faculty_load_drafts l
    WHERE l.status <> 'superseded'
      AND l.school_year = p_school_year AND l.semester = p_semester
      AND (p_exclude_draft IS NULL OR l.id <> p_exclude_draft)
    UNION ALL
    SELECT c.section_id, c.subject_id, sec.department_id, c.meeting_days, c.start_time, c.end_time
    FROM public.class_records c
    LEFT JOIN public.sections sec ON sec.section_id = c.section_id
    WHERE c.school_year = p_school_year AND c.semester::TEXT = p_semester
      AND (p_exclude_class IS NULL OR c.class_record_id <> p_exclude_class)
  ) x
  LEFT JOIN public.departments d ON d.department_id = x.department_id
  LEFT JOIN public.sections s2 ON s2.section_id = x.section_id
  LEFT JOIN public.subjects sub ON sub.subject_id = x.subject_id
  WHERE x.section_id = p_section_id
    AND x.meeting_days && p_days
    AND x.start_time IS NOT NULL
    AND x.start_time < p_end AND p_start < x.end_time
  LIMIT 1;

  IF FOUND THEN
    RETURN public.redact_schedule_conflict(jsonb_build_object(
      'kind', 'section',
      'college', COALESCE(v_hit.college, 'another college'),
      'days', v_hit.meeting_days,
      'start_time', v_hit.start_time,
      'end_time', v_hit.end_time,
      'subject_code', v_hit.subject_code,
      'section_name', v_hit.section_name
    ));
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.find_schedule_conflict(UUID, UUID, TEXT[], TIME, TIME, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_schedule_conflict(UUID, UUID, TEXT[], TIME, TIME, TEXT, TEXT, UUID, UUID) TO authenticated;

-- Turns a conflict into a sentence that explains the refusal without disclosing
-- another college's subject, section or faculty.
CREATE OR REPLACE FUNCTION public.describe_schedule_conflict(p_conflict JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  -- Specifics appear only when redact_schedule_conflict left them in place,
  -- i.e. for a registrar. A dean gets the same sentence minus the subject and
  -- section, which still explains the refusal.
  SELECT CASE
    WHEN p_conflict IS NULL THEN NULL
    WHEN p_conflict->>'kind' = 'faculty' THEN
      format('This faculty member already teaches %s%s %s %s-%s in %s%s.',
             COALESCE(p_conflict->>'subject_code', 'another class'),
             COALESCE(' (' || (p_conflict->>'section_name') || ')', ''),
             array_to_string(ARRAY(SELECT jsonb_array_elements_text(p_conflict->'days')), '/'),
             substr(p_conflict->>'start_time', 1, 5),
             substr(p_conflict->>'end_time', 1, 5),
             p_conflict->>'college',
             COALESCE(' - ' || (p_conflict->>'program'), ''))
    ELSE
      format('This section already has %s %s %s-%s in %s.',
             COALESCE(p_conflict->>'subject_code', 'a class'),
             array_to_string(ARRAY(SELECT jsonb_array_elements_text(p_conflict->'days')), '/'),
             substr(p_conflict->>'start_time', 1, 5),
             substr(p_conflict->>'end_time', 1, 5),
             p_conflict->>'college')
  END;
$$;

REVOKE ALL ON FUNCTION public.describe_schedule_conflict(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.describe_schedule_conflict(JSONB) TO authenticated;

-- Add one draft assignment.
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

  -- Institution-wide schedule check. Skipped entirely when no times are given,
  -- so scheduling stays optional per college.
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

-- Stamp a draft as finalized once the client has provisioned the live class
-- through provisionClassroomByAdmin().
CREATE OR REPLACE FUNCTION public.finalize_faculty_load_draft(
  p_draft_id UUID,
  p_class_record_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft public.faculty_load_drafts%ROWTYPE;
  v_conflict JSONB;
BEGIN
  SELECT * INTO v_draft FROM public.faculty_load_drafts
  WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That assignment could not be found.';
  END IF;

  IF NOT public.can_load_faculty_for_department(v_draft.department_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'You do not have access to faculty loading for this college.';
  END IF;

  -- Idempotent: a retried Finalize after a dropped response must not fail.
  IF v_draft.status = 'finalized' THEN
    RETURN jsonb_build_object('ok', TRUE, 'already_finalized', TRUE);
  END IF;
  IF v_draft.status <> 'draft' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Only a draft assignment can be finalized.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.class_records WHERE class_record_id = p_class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That class could not be found.';
  END IF;

  -- Re-checked here, not only at Add. Two sessions can draft classes that were
  -- each valid alone but clash together; Finalize is the last gate before
  -- students can see anything.
  v_conflict := public.find_schedule_conflict(
    v_draft.faculty_id, v_draft.section_id, v_draft.meeting_days,
    v_draft.start_time, v_draft.end_time, v_draft.school_year, v_draft.semester,
    v_draft.id, p_class_record_id
  );
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = public.describe_schedule_conflict(v_conflict);
  END IF;

  -- The live class carries the pattern too, so later checks see it even if the
  -- draft is superseded.
  UPDATE public.class_records
  SET meeting_days = v_draft.meeting_days,
      start_time = v_draft.start_time,
      end_time = v_draft.end_time
  WHERE class_record_id = p_class_record_id;

  UPDATE public.faculty_load_drafts
  SET status = 'finalized',
      class_record_id = p_class_record_id,
      finalized_by = auth.uid(),
      finalized_at = now()
  WHERE id = p_draft_id;

  PERFORM public.notify_load_finalized(p_draft_id);

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- Swap the faculty on an existing assignment. A draft is updated in place; a
-- finalized one updates the live class directly -- no re-provisioning, so
-- existing enrolments, scores and join code are untouched -- and the prior row
-- is superseded with a new row recording the change.
CREATE OR REPLACE FUNCTION public.reassign_faculty_load(
  p_draft_id UUID,
  p_new_faculty_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_draft public.faculty_load_drafts%ROWTYPE;
  v_new_id UUID;
  v_faculty_role TEXT;
  v_conflict JSONB;
BEGIN
  SELECT * INTO v_draft FROM public.faculty_load_drafts
  WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That assignment could not be found.';
  END IF;

  IF NOT public.can_load_faculty_for_department(v_draft.department_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'You do not have access to faculty loading for this college.';
  END IF;
  IF v_draft.status = 'superseded' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'That assignment has already been replaced.';
  END IF;
  IF v_draft.faculty_id = p_new_faculty_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'That class is already assigned to this faculty member.';
  END IF;

  SELECT role::TEXT INTO v_faculty_role FROM public.users WHERE user_id = p_new_faculty_id;
  IF v_faculty_role IS DISTINCT FROM 'faculty' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Classes can only be assigned to a faculty member.';
  END IF;

  -- The incoming faculty member may already be teaching at this time even
  -- though the outgoing one was not. Without this, Reassign is a hole straight
  -- through the conflict rules.
  v_conflict := public.find_schedule_conflict(
    p_new_faculty_id, v_draft.section_id, v_draft.meeting_days,
    v_draft.start_time, v_draft.end_time, v_draft.school_year, v_draft.semester,
    v_draft.id, v_draft.class_record_id
  );
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = public.describe_schedule_conflict(v_conflict);
  END IF;

  -- Supersede first so the partial unique index allows the replacement row.
  UPDATE public.faculty_load_drafts SET status = 'superseded' WHERE id = p_draft_id;

  INSERT INTO public.faculty_load_drafts (
    department_id, subject_id, section_id, faculty_id, school_year, semester,
    status, class_record_id, created_by, finalized_by, finalized_at,
    meeting_days, start_time, end_time
  ) VALUES (
    v_draft.department_id, v_draft.subject_id, v_draft.section_id, p_new_faculty_id,
    v_draft.school_year, v_draft.semester,
    v_draft.status, v_draft.class_record_id, v_actor,
    CASE WHEN v_draft.status = 'finalized' THEN v_actor ELSE NULL END,
    CASE WHEN v_draft.status = 'finalized' THEN now() ELSE NULL END,
    v_draft.meeting_days, v_draft.start_time, v_draft.end_time
  )
  RETURNING id INTO v_new_id;

  -- A finalized assignment has a live class, so point it at the new faculty.
  IF v_draft.class_record_id IS NOT NULL THEN
    UPDATE public.class_records
    SET faculty_id = p_new_faculty_id
    WHERE class_record_id = v_draft.class_record_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'new_id', v_new_id,
    'previous_faculty_id', v_draft.faculty_id,
    'was_finalized', v_draft.status = 'finalized'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_faculty_load_draft(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT[], TIME, TIME) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_faculty_load_draft(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reassign_faculty_load(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_faculty_load_draft(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT[], TIME, TIME) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_faculty_load_draft(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_faculty_load(UUID, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Add an irregular or off-block student straight onto a class roster
-- -----------------------------------------------------------------------------
-- Additive only. The regular join-code path (submitJoinRequest -> Faculty's
-- Enrollment Requests) is untouched and remains how a student with a code
-- enrols themselves. This covers what that flow was never meant to: an
-- off-block elective, or a block student taking one extra subject, placed
-- directly by the Registrar or the owning Dean with no code and no faculty
-- approval step.
--
-- Enrollment type is NOT stored. getEnrollmentType() derives Regular vs
-- Irregular by comparing the student's home section to the class's section, so
-- adding a row here is automatically labelled correctly everywhere.
CREATE OR REPLACE FUNCTION public.add_student_to_class(
  p_class_record_id UUID,
  p_student_id UUID,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class public.class_records%ROWTYPE;
  v_department UUID;
  v_student_role TEXT;
  v_clash RECORD;
  v_message TEXT;
BEGIN
  SELECT * INTO v_class FROM public.class_records WHERE class_record_id = p_class_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That class could not be found.';
  END IF;

  SELECT department_id INTO v_department FROM public.sections WHERE section_id = v_class.section_id;
  IF NOT public.can_load_faculty_for_department(v_department) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'You do not have access to this class''s college.';
  END IF;

  SELECT role::TEXT INTO v_student_role FROM public.users
  WHERE user_id = p_student_id AND COALESCE(status::TEXT, 'active') = 'active';
  IF v_student_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Only an active student can be added to a class.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = p_student_id
      AND e.subject_id = v_class.subject_id
      AND e.section_id = v_class.section_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'That student is already enrolled in this class.';
  END IF;

  -- A student cannot attend two classes at once either. Unlike the faculty and
  -- section rules this is a WARNING rather than an absolute bar: an irregular
  -- student's timetable is exactly the case where the registrar may know
  -- something the schedule does not. So it refuses once, explains, and proceeds
  -- only on a deliberate retry with p_force.
  IF NOT p_force AND v_class.meeting_days IS NOT NULL AND v_class.start_time IS NOT NULL THEN
    SELECT sub.code AS subject_code, other.meeting_days, other.start_time, other.end_time
      INTO v_clash
    FROM public.enrollments e
    JOIN public.class_records other
      ON other.subject_id = e.subject_id
     AND other.section_id = e.section_id
     AND other.school_year = v_class.school_year
     AND other.semester = v_class.semester
    LEFT JOIN public.subjects sub ON sub.subject_id = other.subject_id
    WHERE e.student_id = p_student_id
      AND other.class_record_id <> p_class_record_id
      AND other.meeting_days && v_class.meeting_days
      AND other.start_time IS NOT NULL
      AND other.start_time < v_class.end_time
      AND v_class.start_time < other.end_time
    LIMIT 1;

    IF FOUND THEN
      v_message := format(
        'This student already has %s %s %s-%s, which overlaps this class. Add anyway only if that is intended.',
        COALESCE(v_clash.subject_code, 'another class'),
        array_to_string(v_clash.meeting_days, '/'),
        substr(v_clash.start_time::TEXT, 1, 5),
        substr(v_clash.end_time::TEXT, 1, 5)
      );
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = v_message;
    END IF;
  END IF;

  INSERT INTO public.enrollments (student_id, subject_id, section_id, status)
  VALUES (p_student_id, v_class.subject_id, v_class.section_id, 'active');

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.add_student_to_class(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_student_to_class(UUID, UUID, BOOLEAN) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Notifications
-- -----------------------------------------------------------------------------
-- Raised server-side rather than from the page, so they cannot be skipped by a
-- client that errors out mid-flow, and so two open tabs cannot double-fire.
--
-- Everything here leans on the partial unique index on notifications.dedupe_key:
-- the insert is ON CONFLICT DO NOTHING, and the key carries a time bucket. That
-- is what stops a refresh, a takeover or a 40-class Finalize All from burying
-- someone in near-identical notices -- which is the fastest way to train people
-- to ignore the ones that matter.

CREATE OR REPLACE FUNCTION public.notify_loading_session_started(p_department_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_college TEXT;
  -- 30-minute bucket: reopening the page shortly after is the same session as
  -- far as anyone being notified is concerned.
  v_bucket TEXT := to_char(date_trunc('hour', now()), 'YYYYMMDDHH24')
                   || CASE WHEN EXTRACT(MINUTE FROM now()) < 30 THEN 'A' ELSE 'B' END;
BEGIN
  SELECT u.role::TEXT, BTRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))
    INTO v_actor_role, v_actor_name
  FROM public.users u WHERE u.user_id = v_actor;

  SELECT d.name INTO v_college FROM public.departments d WHERE d.department_id = p_department_id;
  v_actor_name := COALESCE(NULLIF(v_actor_name, ''), 'Someone');

  IF v_actor_role = 'registrar' THEN
    -- Tell the dean of that college, who would otherwise only find out by
    -- opening the page and meeting the read-only banner.
    INSERT INTO public.notifications (recipient_id, type, title, message, link, dedupe_key)
    SELECT u.user_id,
           'system',
           'Faculty loading in progress',
           format('%s from the Registrar''s office is working on %s faculty loading right now.',
                  v_actor_name, COALESCE(v_college, 'your college')),
           '/dean/facultyloading',
           format('loading-session:%s:%s:%s', p_department_id, v_actor, v_bucket)
    FROM public.users u
    WHERE u.role::TEXT = 'dean'
      AND COALESCE(u.status::TEXT, 'active') = 'active'
      AND u.department_id = p_department_id
    ON CONFLICT (dedupe_key) DO NOTHING;

  ELSIF v_actor_role = 'dean' THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, link, dedupe_key)
    SELECT u.user_id,
           'system',
           'Faculty loading in progress',
           format('Dean %s is working on %s faculty loading right now.',
                  v_actor_name, COALESCE(v_college, 'their college')),
           '/registrar/facultyloading',
           format('loading-session:%s:%s:%s', p_department_id, v_actor, v_bucket)
    FROM public.users u
    WHERE u.role::TEXT = 'registrar'
      AND COALESCE(u.status::TEXT, 'active') = 'active'
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_loading_session_started(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_load_finalized(p_draft_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft public.faculty_load_drafts%ROWTYPE;
  v_subject TEXT;
  v_section TEXT;
  v_college TEXT;
  v_batch TEXT := to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
BEGIN
  SELECT * INTO v_draft FROM public.faculty_load_drafts WHERE id = p_draft_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT s.code INTO v_subject FROM public.subjects s WHERE s.subject_id = v_draft.subject_id;
  SELECT sec.name INTO v_section FROM public.sections sec WHERE sec.section_id = v_draft.section_id;
  SELECT d.name INTO v_college FROM public.departments d WHERE d.department_id = v_draft.department_id;

  -- The faculty member gets one per class, because each is a different class
  -- they now have to teach. Keyed on the draft so a retried finalize is silent.
  INSERT INTO public.notifications (recipient_id, type, title, message, link, dedupe_key)
  VALUES (
    v_draft.faculty_id,
    'system',
    'A class has been assigned to you',
    format('%s (%s) is now open and visible to students.',
           COALESCE(v_subject, 'A subject'), COALESCE(v_section, 'a section')),
    '/faculty/classrecordslist',
    format('load-finalized:%s', p_draft_id)
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  -- The dean gets ONE per batch, not one per class: finalizing a whole college
  -- at once would otherwise produce dozens of near-identical notices.
  INSERT INTO public.notifications (recipient_id, type, title, message, link, dedupe_key)
  SELECT u.user_id,
         'system',
         'Classes are now live',
         format('Faculty loading for %s has been finalized and those classes are visible to students.',
                COALESCE(v_college, 'your college')),
         '/dean/facultyloading',
         format('load-finalized-batch:%s:%s', v_draft.department_id, v_batch)
  FROM public.users u
  WHERE u.role::TEXT = 'dean'
    AND COALESCE(u.status::TEXT, 'active') = 'active'
    AND u.department_id = v_draft.department_id
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_load_finalized(UUID) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Post-conditions
-- -----------------------------------------------------------------------------
DO $verify$
BEGIN
  IF to_regclass('public.faculty_load_drafts') IS NULL
    OR to_regclass('public.provisioning_locks') IS NULL
  THEN
    RAISE EXCEPTION 'Verification failed: Phase 4 tables were not created.';
  END IF;

  IF to_regprocedure('public.acquire_provisioning_lock(uuid)') IS NULL
    OR to_regprocedure('public.touch_provisioning_lock(uuid)') IS NULL
    OR to_regprocedure('public.release_provisioning_lock(uuid)') IS NULL
    OR to_regprocedure('public.add_faculty_load_draft(uuid,uuid,uuid,uuid,text,text,text[],time,time)') IS NULL
    OR to_regprocedure('public.find_schedule_conflict(uuid,uuid,text[],time,time,text,text,uuid,uuid)') IS NULL
    OR to_regprocedure('public.finalize_faculty_load_draft(uuid,uuid)') IS NULL
    OR to_regprocedure('public.reassign_faculty_load(uuid,uuid)') IS NULL
    OR to_regprocedure('public.can_load_faculty_for_department(uuid)') IS NULL
  THEN
    RAISE EXCEPTION 'Verification failed: one or more Phase 4 RPCs are missing.';
  END IF;

  -- The slot guard is the whole point of the draft table; without the partial
  -- index two people could claim the same class.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uniq_faculty_load_slot_live'
  ) THEN
    RAISE EXCEPTION 'Verification failed: the live-slot unique index is missing.';
  END IF;

  -- Both tables must stay read-only to clients.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('faculty_load_drafts', 'provisioning_locks')
      AND cmd <> 'SELECT'
  ) THEN
    RAISE EXCEPTION
      'Verification failed: a write policy exists on a Phase 4 table. Writes must '
      'go only through the RPCs.';
  END IF;

  RAISE NOTICE 'Faculty loading and provisioning verified.';
END
$verify$;

COMMIT;
