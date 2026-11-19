-- =============================================================================
-- A live class's students and faculty are told when it changes;
-- a live class can no longer be removed, only transferred
-- =============================================================================
--
-- THE REQUEST (owner, 2026-11-18, during QA; plan section 10, Phase 5)
--   1. When the Dean changes an ACTIVE class in Faculty Loading -- its days,
--      times, or faculty -- the enrolled students and the faculty are notified.
--      Drafts stay silent: students cannot see them.
--   2. A class that is already assigned (live) must not be removed: removing
--      it deletes its enrollments, and sensitive records could be lost by
--      mistake. It is transferred to another faculty member instead, which
--      keeps every enrollment, score and grade.
--
-- HOW
--   1. A trigger on class_records, so EVERY path that changes a live class
--      notifies -- update_class_schedule, reassign_class_faculty, and
--      reassign_faculty_load (which repoints the class a draft produced) --
--      without patching any of them. It fires only when the days, the times or
--      the faculty actually change, and only for an active class; saving the
--      same schedule sends nothing.
--        schedule changed  -> every enrolled student + the class's faculty
--        faculty changed   -> every enrolled student + the new faculty + the
--                             previous faculty
--      In-app and push (notification fan-out), no email: email stays reserved
--      for grades. Same transaction as the change, so a change cannot happen
--      without its notice.
--   2. delete_class_record is no longer callable from the app. Drafts are
--      still removed through delete_faculty_load_draft, which is untouched.
--
-- NEW NOTICE TYPE: class_changed (students: link My Subjects; faculty: My Classes)
-- Safe to re-run.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Helpers
-- -----------------------------------------------------------------------------
-- "IT213 · BSIT-1B", plus " (Laboratory)" for the lab half of a subject.
CREATE OR REPLACE FUNCTION public.aspire_class_label(p_class_record_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(sub.code, 'A class')
         || COALESCE(' · ' || sec.name, '')
         || CASE WHEN lower(COALESCE(c.class_type::TEXT, '')) LIKE 'lab%' THEN ' (Laboratory)' ELSE '' END
  FROM public.class_records c
  LEFT JOIN public.subjects sub ON sub.subject_id = c.subject_id
  LEFT JOIN public.sections sec ON sec.section_id = c.section_id
  WHERE c.class_record_id = p_class_record_id;
$$;

-- "Mon/Wed 12:45 PM-8:00 PM", or "no set schedule".
CREATE OR REPLACE FUNCTION public.aspire_format_schedule(p_days TEXT[], p_start TIME, p_end TIME)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_days IS NULL OR array_length(p_days, 1) IS NULL OR p_start IS NULL OR p_end IS NULL
      THEN 'no set schedule'
    ELSE array_to_string(p_days, '/') || ' '
         || to_char(p_start, 'FMHH12:MI AM') || '–' || to_char(p_end, 'FMHH12:MI AM')
  END;
$$;

REVOKE ALL ON FUNCTION public.aspire_class_label(UUID) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. The notice trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_notify_class_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_label TEXT;
  v_stamp TEXT := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS');
  v_schedule_changed BOOLEAN;
  v_faculty_changed BOOLEAN;
  v_old_sched TEXT;
  v_new_sched TEXT;
  v_new_name TEXT;
  v_old_name TEXT;
BEGIN
  -- Live classes only. An archived class's schedule is history, and drafts
  -- live in faculty_load_drafts, not here.
  IF COALESCE(NEW.status::TEXT, 'active') <> 'active' THEN
    RETURN NULL;
  END IF;

  v_schedule_changed := OLD.meeting_days IS DISTINCT FROM NEW.meeting_days
                     OR OLD.start_time IS DISTINCT FROM NEW.start_time
                     OR OLD.end_time IS DISTINCT FROM NEW.end_time;
  v_faculty_changed := OLD.faculty_id IS DISTINCT FROM NEW.faculty_id;
  IF NOT v_schedule_changed AND NOT v_faculty_changed THEN
    RETURN NULL;
  END IF;

  v_label := public.aspire_class_label(NEW.class_record_id);

  IF v_schedule_changed THEN
    v_old_sched := public.aspire_format_schedule(OLD.meeting_days, OLD.start_time, OLD.end_time);
    v_new_sched := public.aspire_format_schedule(NEW.meeting_days, NEW.start_time, NEW.end_time);

    -- Every enrolled student.
    INSERT INTO public.notifications (recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read)
    SELECT DISTINCT e.student_id, 'class_changed', 'Class Schedule Changed', '/student/mysubjects', 'warning',
           format('%s now meets %s (was %s).', v_label, v_new_sched, v_old_sched),
           jsonb_build_object('class_record_id', NEW.class_record_id, 'change', 'schedule',
                              'old_schedule', v_old_sched, 'new_schedule', v_new_sched),
           format('class_changed:schedule:%s:%s:%s', NEW.class_record_id, e.student_id, v_stamp),
           FALSE
    FROM public.enrollments e
    WHERE e.subject_id = NEW.subject_id AND e.section_id = NEW.section_id
      AND COALESCE(e.status::TEXT, 'active') = 'active'
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    -- The faculty who teaches it (after any reassignment in the same update).
    INSERT INTO public.notifications (recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read)
    SELECT NEW.faculty_id, 'class_changed', 'Class Schedule Changed', '/faculty/classrecordslist', 'warning',
           format('Your class %s now meets %s (was %s).', v_label, v_new_sched, v_old_sched),
           jsonb_build_object('class_record_id', NEW.class_record_id, 'change', 'schedule',
                              'old_schedule', v_old_sched, 'new_schedule', v_new_sched),
           format('class_changed:schedule:%s:%s:%s', NEW.class_record_id, NEW.faculty_id, v_stamp),
           FALSE
    WHERE NEW.faculty_id IS NOT NULL
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  IF v_faculty_changed THEN
    SELECT BTRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))
      INTO v_new_name FROM public.users u WHERE u.user_id = NEW.faculty_id;
    SELECT BTRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))
      INTO v_old_name FROM public.users u WHERE u.user_id = OLD.faculty_id;
    v_new_name := COALESCE(NULLIF(v_new_name, ''), 'another faculty member');
    v_old_name := COALESCE(NULLIF(v_old_name, ''), 'the previous faculty member');

    INSERT INTO public.notifications (recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read)
    SELECT DISTINCT e.student_id, 'class_changed', 'Class Instructor Changed', '/student/mysubjects', 'info',
           format('%s is now handled by Prof. %s.', v_label, v_new_name),
           jsonb_build_object('class_record_id', NEW.class_record_id, 'change', 'faculty'),
           format('class_changed:faculty:%s:%s:%s', NEW.class_record_id, e.student_id, v_stamp),
           FALSE
    FROM public.enrollments e
    WHERE e.subject_id = NEW.subject_id AND e.section_id = NEW.section_id
      AND COALESCE(e.status::TEXT, 'active') = 'active'
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    INSERT INTO public.notifications (recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read)
    SELECT NEW.faculty_id, 'class_changed', 'Class Assigned to You', '/faculty/classrecordslist', 'info',
           format('You were assigned %s (%s), transferred from Prof. %s.', v_label,
                  public.aspire_format_schedule(NEW.meeting_days, NEW.start_time, NEW.end_time), v_old_name),
           jsonb_build_object('class_record_id', NEW.class_record_id, 'change', 'faculty'),
           format('class_changed:faculty:%s:%s:%s', NEW.class_record_id, NEW.faculty_id, v_stamp),
           FALSE
    WHERE NEW.faculty_id IS NOT NULL
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    INSERT INTO public.notifications (recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read)
    SELECT OLD.faculty_id, 'class_changed', 'Class Transferred', '/faculty/classrecordslist', 'info',
           format('%s was transferred to Prof. %s. Its records stay with the class.', v_label, v_new_name),
           jsonb_build_object('class_record_id', NEW.class_record_id, 'change', 'faculty'),
           format('class_changed:faculty:%s:%s:%s', NEW.class_record_id, OLD.faculty_id, v_stamp),
           FALSE
    WHERE OLD.faculty_id IS NOT NULL
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_notify_class_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_class_changes ON public.class_records;
CREATE TRIGGER trg_notify_class_changes
  AFTER UPDATE OF meeting_days, start_time, end_time, faculty_id ON public.class_records
  FOR EACH ROW EXECUTE FUNCTION public.aspire_notify_class_changes();

-- -----------------------------------------------------------------------------
-- 3. A live class cannot be removed from the app; transfer it instead.
-- -----------------------------------------------------------------------------
-- Every class_records row is a live class (drafts are faculty_load_drafts and
-- are still removed by delete_faculty_load_draft). The function is kept for
-- administrators working in the SQL editor, but the app can no longer call it.
REVOKE EXECUTE ON FUNCTION public.delete_class_record(UUID) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.delete_class_record(UUID) IS
  'Not callable from the app since 2026-11-18: a live class is transferred to '
  'another faculty member (reassign), never removed, so its enrollments and '
  'records cannot be lost by mistake.';

-- -----------------------------------------------------------------------------
-- 4. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_class_changes'
                 AND tgrelid = 'public.class_records'::regclass) THEN
    RAISE EXCEPTION 'Verification failed: class changes would not notify anyone.';
  END IF;
  IF has_function_privilege('authenticated', 'public.delete_class_record(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Verification failed: the app can still remove a live class.';
  END IF;
  RAISE NOTICE 'Live-class changes now notify students and faculty, and live classes can only be transferred, not removed.';
END
$verify$;

COMMIT;
