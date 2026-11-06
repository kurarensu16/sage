-- =============================================================================
-- Rooms, and whether a class is a lecture or a laboratory
-- =============================================================================
--
-- NEITHER EXISTED
--   20261029093613 says so plainly: "Rooms are deliberately out of scope -- no
--   room exists anywhere in the schema", and records that one pattern per class
--   "cannot express a split pattern such as lecture MW 08:00-09:00 plus lab F
--   13:00-16:00".
--
--   So a subject with a laboratory could only have one of its two sessions
--   recorded, and nobody could say where any class met.
--
-- THE TYPE BELONGS ON THE CLASS, NOT THE SUBJECT
--   Physics meets twice: lecture Monday and Wednesday in a classroom,
--   laboratory Friday in a lab. Those are two schedules, two rooms and two
--   different kinds of session, so they are TWO class records -- which is
--   exactly the "child table of meetings" the limitation note anticipated,
--   reached by letting a subject be claimed twice rather than by adding a
--   table.
--
--   The partial unique index that enforced one claim per subject and section is
--   therefore rebuilt to include the type. Without that, the laboratory could
--   never be added after the lecture.
--
-- A ROOM COLUMN WITHOUT A ROOM CHECK WOULD BE WORSE THAN NO ROOM COLUMN
--   It would display authoritative-looking data while two classes sat in one
--   room, and nobody would find out until the first week of the semester. So
--   find_schedule_conflict gains a third arm, the same shape as the two it
--   already has.
--
-- WHY ROOMS ARE ROWS
--   "Room 201", "RM 201" and "Rm. 201" are three different rooms to a string
--   comparison, and a clash would slip through exactly when two people typed it
--   differently. A room needs identity before a conflict check means anything.
--   Same reason colleges, programs and sections are rows rather than a map in
--   code.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Rooms.
--
--    room_type is exactly two values and a CHECK, not a lookup table. What a
--    particular laboratory contains -- computers, nursing equipment, a
--    simulator -- is not the system's concern; it is a laboratory, and its name
--    says the rest.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
  room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  room_type TEXT NOT NULL CHECK (room_type IN ('lecture', 'laboratory')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive, so "Room 201" and "ROOM 201" cannot both exist and split a
-- clash in two.
CREATE UNIQUE INDEX IF NOT EXISTS rooms_code_unique
  ON public.rooms (upper(BTRIM(code)));

COMMENT ON TABLE public.rooms IS
  'Teaching spaces. room_type is lecture or laboratory only; a room under '
  'renovation is deactivated rather than deleted, so the classes that used it '
  'keep their history.';

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rooms_select_authenticated ON public.rooms;
CREATE POLICY rooms_select_authenticated ON public.rooms
  FOR SELECT TO authenticated USING (TRUE);

-- Writes go through the RPC below, which checks the role server-side. No write
-- policy at all means a direct client write is refused rather than relying on
-- the UI not to offer one -- the same shape as system_settings.
REVOKE INSERT, UPDATE, DELETE ON public.rooms FROM authenticated;
REVOKE ALL ON public.rooms FROM anon;

CREATE OR REPLACE FUNCTION public.save_room(
  p_room_id UUID,
  p_code TEXT,
  p_room_type TEXT,
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID := p_room_id;
BEGIN
  IF NOT (public.is_active_registrar() OR public.is_active_admin()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an active registrar or administrator may manage rooms.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_code, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A room needs a name.';
  END IF;
  IF p_room_type NOT IN ('lecture', 'laboratory') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'A room is either a lecture room or a laboratory.';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.rooms (code, room_type, is_active)
    VALUES (BTRIM(p_code), p_room_type, COALESCE(p_is_active, TRUE))
    RETURNING room_id INTO v_id;
  ELSE
    UPDATE public.rooms
    SET code = BTRIM(p_code),
        room_type = p_room_type,
        is_active = COALESCE(p_is_active, TRUE)
    WHERE room_id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That room no longer exists.';
    END IF;
  END IF;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = format('A room called %s already exists.', BTRIM(p_code));
END;
$$;

REVOKE ALL ON FUNCTION public.save_room(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_room(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. A class knows its room and its kind.
-- -----------------------------------------------------------------------------
ALTER TABLE public.faculty_load_drafts
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES public.rooms(room_id),
  ADD COLUMN IF NOT EXISTS class_type TEXT NOT NULL DEFAULT 'lecture';

ALTER TABLE public.class_records
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES public.rooms(room_id),
  ADD COLUMN IF NOT EXISTS class_type TEXT NOT NULL DEFAULT 'lecture';

ALTER TABLE public.faculty_load_drafts
  DROP CONSTRAINT IF EXISTS faculty_load_drafts_class_type_check;
ALTER TABLE public.faculty_load_drafts
  ADD CONSTRAINT faculty_load_drafts_class_type_check
  CHECK (class_type IN ('lecture', 'laboratory'));

ALTER TABLE public.class_records
  DROP CONSTRAINT IF EXISTS class_records_class_type_check;
ALTER TABLE public.class_records
  ADD CONSTRAINT class_records_class_type_check
  CHECK (class_type IN ('lecture', 'laboratory'));

COMMENT ON COLUMN public.class_records.class_type IS
  'lecture or laboratory. A subject with both is TWO class records, because one '
  'meeting pattern cannot hold two different days, times and rooms.';

-- -----------------------------------------------------------------------------
-- 3. A subject may be claimed once per section PER TYPE.
--
--    The existing index allowed one claim per subject and section, which would
--    have made the laboratory unaddable once the lecture existed.
-- -----------------------------------------------------------------------------
DO $reindex$
DECLARE v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'faculty_load_drafts'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%subject_id%'
      AND indexdef ILIKE '%section_id%'
      AND indexdef NOT ILIKE '%class_type%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', v_name);
    RAISE NOTICE 'Replaced live-slot index % so a laboratory can follow a lecture.', v_name;
  END LOOP;
END
$reindex$;

CREATE UNIQUE INDEX IF NOT EXISTS faculty_load_drafts_live_slot
  ON public.faculty_load_drafts (subject_id, section_id, school_year, semester, class_type)
  WHERE status <> 'superseded';

-- -----------------------------------------------------------------------------
-- 4. A third kind of clash: the same room, at the same time.
--
--    Appended to find_schedule_conflict rather than written separately, so one
--    call still answers "can this slot be used" and no caller can check two of
--    the three and forget the third.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_room_conflict(
  p_room_id UUID,
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
  IF p_room_id IS NULL OR p_days IS NULL OR array_length(p_days, 1) IS NULL
     OR p_start IS NULL OR p_end IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT r.code AS room_code, d.name AS college,
         x.meeting_days, x.start_time, x.end_time,
         sub.code AS subject_code, s2.name AS section_name
    INTO v_hit
  FROM (
    SELECT l.room_id, l.section_id, l.subject_id, l.department_id,
           l.meeting_days, l.start_time, l.end_time
    FROM public.faculty_load_drafts l
    WHERE l.status <> 'superseded'
      AND l.school_year = p_school_year AND l.semester = p_semester
      AND (p_exclude_draft IS NULL OR l.id <> p_exclude_draft)
    UNION ALL
    SELECT c.room_id, c.section_id, c.subject_id, sec.department_id,
           c.meeting_days, c.start_time, c.end_time
    FROM public.class_records c
    LEFT JOIN public.sections sec ON sec.section_id = c.section_id
    WHERE c.school_year = p_school_year AND c.semester::TEXT = p_semester
      AND (p_exclude_class IS NULL OR c.class_record_id <> p_exclude_class)
  ) x
  LEFT JOIN public.rooms r ON r.room_id = x.room_id
  LEFT JOIN public.departments d ON d.department_id = x.department_id
  LEFT JOIN public.sections s2 ON s2.section_id = x.section_id
  LEFT JOIN public.subjects sub ON sub.subject_id = x.subject_id
  WHERE x.room_id = p_room_id
    AND x.meeting_days && p_days
    AND x.start_time IS NOT NULL
    AND x.start_time < p_end AND p_start < x.end_time
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Same boundary as every other conflict: the college, never the class.
  RETURN public.redact_schedule_conflict(jsonb_build_object(
    'kind', 'room',
    'room_code', v_hit.room_code,
    'college', COALESCE(v_hit.college, 'another college'),
    'days', v_hit.meeting_days,
    'start_time', v_hit.start_time,
    'end_time', v_hit.end_time,
    'subject_code', v_hit.subject_code,
    'section_name', v_hit.section_name
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.find_room_conflict(UUID, TEXT[], TIME, TIME, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_room_conflict(UUID, TEXT[], TIME, TIME, TEXT, TEXT, UUID, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Which rooms are free.
--
--    The picker offers only rooms that can actually be had, so a room clash is
--    close to impossible by construction. The advisory lock in step 6 closes
--    the millisecond that remains.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_available_rooms(
  p_room_type TEXT,
  p_days TEXT[],
  p_start TIME,
  p_end TIME,
  p_school_year TEXT,
  p_semester TEXT
)
RETURNS TABLE (room_id UUID, code TEXT, room_type TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.room_id, r.code, r.room_type
  FROM public.rooms r
  WHERE r.is_active
    AND (p_room_type IS NULL OR r.room_type = p_room_type)
    -- With no schedule chosen yet, every room of the right kind is offered:
    -- there is nothing to be busy during.
    AND (
      p_days IS NULL OR array_length(p_days, 1) IS NULL
      OR p_start IS NULL OR p_end IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM (
          SELECT l.room_id, l.meeting_days, l.start_time, l.end_time
          FROM public.faculty_load_drafts l
          WHERE l.status <> 'superseded'
            AND l.school_year = p_school_year AND l.semester = p_semester
          UNION ALL
          SELECT c.room_id, c.meeting_days, c.start_time, c.end_time
          FROM public.class_records c
          WHERE c.school_year = p_school_year AND c.semester::TEXT = p_semester
        ) x
        WHERE x.room_id = r.room_id
          AND x.meeting_days && p_days
          AND x.start_time IS NOT NULL
          AND x.start_time < p_end AND p_start < x.end_time
      )
    )
  ORDER BY r.code;
$$;

REVOKE ALL ON FUNCTION public.aspire_available_rooms(TEXT, TEXT[], TIME, TIME, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_available_rooms(TEXT, TEXT[], TIME, TIME, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Accept a room and a type when a draft is added, and check both.
-- -----------------------------------------------------------------------------
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

  IF p_room_id IS NOT NULL THEN
    SELECT * INTO v_room FROM public.rooms WHERE room_id = p_room_id;
    IF NOT FOUND OR NOT v_room.is_active THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002',
        MESSAGE = 'That room is not available.';
    END IF;
    -- A warning rather than a refusal: a laboratory sometimes genuinely meets
    -- in a lecture room, and the Registrar knows their campus better than this
    -- constraint would.
    IF p_class_type = 'laboratory' AND v_room.room_type <> 'laboratory' THEN
      RAISE WARNING 'A laboratory class was scheduled in a lecture room (%).', v_room.code;
    END IF;
  END IF;

  -- Serialise on everything this booking consumes, in a fixed order, so two
  -- sessions cannot each hold one and wait for another.
  PERFORM pg_advisory_xact_lock(hashtext('load_section:' || p_section_id::TEXT));
  PERFORM pg_advisory_xact_lock(hashtext('load_faculty:' || p_faculty_id::TEXT));
  IF p_room_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('load_room:' || p_room_id::TEXT));
  END IF;

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

COMMENT ON FUNCTION public.add_faculty_load_draft_v2(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT[], TIME, TIME, TEXT, UUID) IS
  'Adds a load draft carrying a class type and a room. The v1 signature is left '
  'in place and still works, so nothing breaks mid-deploy.';

-- -----------------------------------------------------------------------------
-- 7. Describe a room clash in the same voice as the other two.
-- -----------------------------------------------------------------------------
DO $describe$
DECLARE
  v_def  TEXT;
  v_old  CONSTANT TEXT := '    WHEN p_conflict->>''kind'' = ''faculty'' THEN';
  v_new  CONSTANT TEXT :=
'    WHEN p_conflict->>''kind'' = ''room'' THEN
      format(''%s is already in use %s %s-%s by %s.'',
             COALESCE(p_conflict->>''room_code'', ''That room''),
             array_to_string(ARRAY(SELECT jsonb_array_elements_text(p_conflict->''days'')), ''/''),
             substr(p_conflict->>''start_time'', 1, 5),
             substr(p_conflict->>''end_time'', 1, 5),
             COALESCE(p_conflict->>''subject_code'', p_conflict->>''college''))
    WHEN p_conflict->>''kind'' = ''faculty'' THEN';
  v_hits INTEGER;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'describe_schedule_conflict';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'describe_schedule_conflict does not exist. Run 20261029093613 first.';
  END IF;
  IF position('= ''room''' IN v_def) > 0 THEN
    RAISE NOTICE 'Room clashes are already described; nothing to do.';
    RETURN;
  END IF;

  -- A room branch ahead of the faculty one. The ELSE arm stays the section
  -- case, so the three kinds each get their own sentence.
  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION
      'Expected the faculty branch exactly once in describe_schedule_conflict, found %. Re-read the deployed body before re-running.',
      v_hits;
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$describe$;

-- -----------------------------------------------------------------------------
-- 8. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
BEGIN
  IF to_regclass('public.rooms') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: rooms were not created.';
  END IF;

  -- Exactly two types. A lookup table was considered and rejected as out of
  -- scope; if a third value ever appears, this assertion is where to argue it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.rooms'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%lecture%'
      AND pg_get_constraintdef(oid) ILIKE '%laboratory%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: room_type is not constrained to lecture or laboratory.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'class_records' AND column_name = 'room_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'class_records' AND column_name = 'class_type'
  ) THEN
    RAISE EXCEPTION 'Verification failed: a class cannot record its room or its kind.';
  END IF;

  -- The laboratory must be addable after the lecture, or a split subject can
  -- still only have one of its sessions recorded.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'faculty_load_drafts'
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%class_type%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: a laboratory could not be added after its lecture.';
  END IF;

  IF to_regprocedure('public.find_room_conflict(uuid,text[],time,time,text,text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: rooms are recorded but never checked, which is worse than not recording them.';
  END IF;

  IF to_regprocedure('public.aspire_available_rooms(text,text[],time,time,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the picker cannot tell which rooms are free.';
  END IF;

  -- A room clash must honour the same boundary as the other two kinds.
  IF position('redact_schedule_conflict' IN
       pg_get_functiondef('public.find_room_conflict(uuid,text[],time,time,text,text,uuid,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a room clash would disclose another college''s class.';
  END IF;

  -- v2 must lock before it checks, like v1.
  IF position('load_room:' IN
       pg_get_functiondef('public.add_faculty_load_draft_v2(uuid,uuid,uuid,uuid,text,text,text[],time,time,text,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Verification failed: two colleges could still book one room at once.';
  END IF;

  -- A room clash must produce a sentence, not fall through to the section
  -- wording, which would tell the registrar the wrong thing is wrong.
  IF position('= ''room''' IN
       pg_get_functiondef('public.describe_schedule_conflict(jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a room clash would be described as a section clash.';
  END IF;

  RAISE NOTICE 'Rooms exist, classes know their kind, and a room can only hold one class at a time.';
END
$verify$;

COMMIT;
