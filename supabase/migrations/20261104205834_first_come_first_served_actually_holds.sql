-- =============================================================================
-- Two colleges can book the same section at the same moment
-- =============================================================================
--
-- THE HOLE
--   add_faculty_load_draft() calls find_schedule_conflict() immediately before
--   its INSERT, and a unique index catches the SAME subject being claimed
--   twice. Neither covers two DIFFERENT subjects at the same time in the same
--   section:
--
--     General Education adds GE101  to BSIT-1A, MWF 9:00
--     Technology and Engineering adds ITC113 to BSIT-1A, MWF 9:00
--
--   Different subjects, so the unique index never fires. Both call the conflict
--   check; under READ COMMITTED, if both run before either commits, BOTH see no
--   conflict and BOTH insert. The section is double-booked and nothing reports
--   it. The students find out in the first week of the semester.
--
-- WHY IT MATTERS NOW
--   Today only one college ever touches a section, so the race is unreachable.
--   Letting General Education load into other colleges' sections is what makes
--   it reachable -- so this must land BEFORE that change, not after. Shipping
--   them the other way round introduces a silent data fault with no symptom
--   until a timetable is printed.
--
-- THE FIX
--   Serialise on the section and the faculty member for the length of the
--   check-and-insert, using the advisory-lock pattern aspire_restore_backup()
--   already uses. The second caller then runs its check AFTER the first has
--   committed, sees the row, and is refused properly.
--
--   Section first, faculty second, always in that order, so two sessions can
--   never hold one lock each and wait on the other.
--
--   pg_advisory_xact_lock, not try_: the wait is microseconds and a caller that
--   gave up would be back to guessing. Released automatically at commit or
--   rollback, so a failed insert cannot strand a lock.
--
-- ALSO HERE
--   aspire_schedule_occupancy(), so the loading screen can show when a faculty
--   member or a section is already busy BEFORE a time is chosen. Same data the
--   conflict check reads, and the same redaction: a non-registrar sees the
--   college that owns the clashing class, never its subject or section.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Make "first" mean something.
--
--    Patched from the DEPLOYED definition rather than re-declared: 20261029040940
--    rewrites function bodies in place, so this repo's copy is not necessarily
--    what the database is running. The assertion makes a silent no-op
--    impossible.
-- -----------------------------------------------------------------------------
DO $patch$
DECLARE
  v_def  TEXT;
  -- Anchored on the CODE, not on the comment above it.
  --
  -- The first attempt anchored on the comment "Skipped entirely when no times
  -- are given", which was the wording in 20261029093613. 20261030183805
  -- redefined the whole function and rewrote that comment to "Now reached on
  -- every call", so the anchor matched nothing and this migration refused
  -- rather than half-applying. Comments are prose and get edited; the
  -- assignment statement is the thing that has to be there for the function to
  -- work at all.
  v_old  CONSTANT TEXT := '  v_conflict := public.find_schedule_conflict(';
  v_new  CONSTANT TEXT :=
'  -- Serialise on the section, then the faculty member, for the rest of this
  -- transaction. Without this, two colleges adding different subjects to one
  -- section at the same instant both pass the check below and both insert --
  -- and the section is double-booked with nothing to report it.
  --
  -- Always section before faculty: a fixed order means two sessions cannot each
  -- hold one and wait for the other. Released at commit or rollback.
  PERFORM pg_advisory_xact_lock(hashtext(''load_section:'' || p_section_id::TEXT));
  PERFORM pg_advisory_xact_lock(hashtext(''load_faculty:'' || p_faculty_id::TEXT));

  v_conflict := public.find_schedule_conflict(';
  v_hits INTEGER;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'add_faculty_load_draft';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'add_faculty_load_draft does not exist. Run 20261029093613 first.';
  END IF;

  IF position('load_section:' IN v_def) > 0 THEN
    RAISE NOTICE 'The draft add already serialises on the section; nothing to do.';
    RETURN;
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION
      'Expected the conflict check exactly once in add_faculty_load_draft, found %. Re-read the deployed body before re-running.',
      v_hits;
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$patch$;

-- -----------------------------------------------------------------------------
-- 2. When is this faculty member, or this section, already busy?
--
--    The loading screen used to offer a faculty member and a time with no
--    indication of either being taken, so the only way to find a free slot was
--    to guess and be refused. This returns what is already booked, which is the
--    same question find_schedule_conflict() answers one slot at a time.
--
--    Drafts AND live classes, because a draft reserves a slot -- that is what
--    makes first-come-first-served true across colleges.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_schedule_occupancy(
  p_faculty_id UUID,
  p_section_id UUID,
  p_school_year TEXT,
  p_semester TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows JSONB;
BEGIN
  IF p_faculty_id IS NULL AND p_section_id IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'start_time'), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
             'owner', CASE WHEN x.faculty_id = p_faculty_id THEN 'faculty' ELSE 'section' END,
             'days', x.meeting_days,
             'start_time', x.start_time,
             'end_time', x.end_time,
             'college', COALESCE(d.name, 'another college'),
             -- Stripped below for anyone who is not a registrar, exactly as
             -- redact_schedule_occupancy's sibling does for a single conflict.
             'subject_code', sub.code,
             'section_name', s2.name
           ) AS entry
    FROM (
      SELECT l.faculty_id, l.section_id, l.subject_id, l.department_id,
             l.meeting_days, l.start_time, l.end_time
      FROM public.faculty_load_drafts l
      WHERE l.status <> 'superseded'
        AND l.school_year = p_school_year AND l.semester = p_semester
      UNION ALL
      SELECT c.faculty_id, c.section_id, c.subject_id, sec.department_id,
             c.meeting_days, c.start_time, c.end_time
      FROM public.class_records c
      LEFT JOIN public.sections sec ON sec.section_id = c.section_id
      WHERE c.school_year = p_school_year AND c.semester::TEXT = p_semester
    ) x
    LEFT JOIN public.departments d ON d.department_id = x.department_id
    LEFT JOIN public.sections s2 ON s2.section_id = x.section_id
    LEFT JOIN public.subjects sub ON sub.subject_id = x.subject_id
    WHERE x.start_time IS NOT NULL
      AND (
        (p_faculty_id IS NOT NULL AND x.faculty_id = p_faculty_id)
        OR (p_section_id IS NOT NULL AND x.section_id = p_section_id)
      )
  ) rows;

  -- Days and times in full -- that is what you schedule around. Subject and
  -- section withheld from anyone but a registrar, so this cannot become a way
  -- around the boundary redact_schedule_conflict() enforces.
  IF NOT public.is_active_registrar() THEN
    SELECT COALESCE(jsonb_agg((entry - 'subject_code' - 'section_name') ORDER BY entry->>'start_time'), '[]'::JSONB)
    INTO v_rows
    FROM jsonb_array_elements(v_rows) AS t(entry);
  END IF;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_schedule_occupancy(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_schedule_occupancy(UUID, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.aspire_schedule_occupancy(UUID, UUID, TEXT, TEXT) IS
  'What a faculty member or a section is already booked for this term, drafts '
  'included. Subject and section are withheld from non-registrars, matching '
  'redact_schedule_conflict().';

-- -----------------------------------------------------------------------------
-- 3. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE v_add TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_add
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'add_faculty_load_draft';

  IF position('load_section:' IN v_add) = 0 OR position('load_faculty:' IN v_add) = 0 THEN
    RAISE EXCEPTION 'Verification failed: two colleges could still double-book one section.';
  END IF;

  -- The lock must be taken BEFORE the check it protects, or it protects nothing.
  IF position('load_section:' IN v_add) > position('find_schedule_conflict' IN v_add) THEN
    RAISE EXCEPTION 'Verification failed: the lock is taken after the conflict check, which leaves the race open.';
  END IF;

  -- The rest of the function must have survived the patch.
  IF position('Classes can only be assigned to a faculty member' IN v_add) = 0
     OR position('That class already exists for this term' IN v_add) = 0
     OR position('Someone else is editing this college right now' IN v_add) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the draft-add body did not survive the patch.';
  END IF;

  IF to_regprocedure('public.aspire_schedule_occupancy(uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the loading screen cannot show what is already booked.';
  END IF;

  -- Occupancy must honour the same boundary as a single conflict, or it becomes
  -- a way to read another college's timetable one faculty member at a time.
  IF position('is_active_registrar' IN
       pg_get_functiondef('public.aspire_schedule_occupancy(uuid,uuid,text,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Verification failed: occupancy would disclose another college''s subjects and sections.';
  END IF;

  RAISE NOTICE 'First-come-first-served now holds, and the loading screen can show what is taken.';
END
$verify$;

COMMIT;
