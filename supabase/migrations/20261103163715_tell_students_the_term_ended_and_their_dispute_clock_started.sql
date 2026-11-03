-- =============================================================================
-- At rollover, tell students the term ended and their dispute clock started
-- =============================================================================
--
-- TWO GAPS, ONE EVENT
--
-- 1. STUDENTS ARE NOT TOLD THE TERM CHANGED AT ALL
--      notifyTermActivated() in src/lib/notificationDispatcher.js reads:
--
--        .in('role', ['faculty', 'dean'])
--
--      So faculty and deans learn the term rolled over. Students, registrars
--      and admins learn nothing. A student signs in to a different term, a
--      different section and an archived class list with no explanation.
--
-- 2. THE DISPUTE CLOCK STARTS SILENTLY
--      20261103093355 anchors the grade-change window on the rollover:
--      22 SCHOOL days from ended_at. It is the only route a student has to
--      question a posted grade, and it begins at a moment nobody announces.
--
--      That was defensible when the window had no real expiry. Now that it
--      closes, starting it in silence means a student can lose the right
--      without ever being told they had it.
--
-- WHY A TRIGGER RATHER THAN EXTENDING notifyTermActivated()
--   That function is client-side and its failure path is console.warn -- a
--   swallowed error means nobody is told and nothing records it. This notice
--   carries a deadline a student loses a right by missing, so it is
--   transactional with the rollover itself, like the instructor reminder in
--   20261103093749. If the rollover commits, the notices exist.
--
--   It also needs aspire_add_school_days(), because 22 school days is not
--   22 days and the client has no weekday calendar.
--
-- WHY FACULTY AND DEANS STAY ON THE CLIENT PATH
--   Their message is generic and carries no deadline, so nothing is lost if it
--   is late. Moving them here as well is a tidy-up, not a fix, and would
--   double-notify anyone already covered. The client role list is widened to
--   registrar and admin separately, in the same change.
--
-- TWO MESSAGES, BECAUSE TWO DIFFERENT THINGS ARE TRUE
--   A student with a posted grade has something to question and a date by which
--   to do it. A student with none has nothing to dispute, and telling them
--   about a deadline that cannot apply to them is noise that teaches people to
--   ignore the next one.
--
-- NOT COVERED HERE, DELIBERATELY
--   A Semestral Grade posted LATER, during the sg_grace_days window, has its
--   own deadline: aspire_dispute_deadline() takes GREATEST(ended_at, posted_at),
--   so that student's window opens later and runs longer. They are told when
--   the grade posts, not here -- at rollover that grade does not exist yet.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.aspire_notify_students_of_rollover()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row      RECORD;
  v_deadline TIMESTAMPTZ;
  v_days     INTEGER := COALESCE(NEW.dispute_grace_days, 22);
BEGIN
  IF NEW.ended_at IS NULL OR OLD.ended_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- School days, not calendar days: the deadline must land on a weekday or a
  -- student loses up to two days they were promised.
  v_deadline := public.aspire_add_school_days(NEW.ended_at, v_days);

  FOR v_row IN
    SELECT u.user_id,
           EXISTS (
             SELECT 1
             FROM public.posted_grades pg
             JOIN public.class_records c ON c.class_record_id = pg.class_record_id
             WHERE pg.student_id = u.user_id
               AND (
                 c.term_id = NEW.term_id
                 OR (c.term_id IS NULL
                     AND c.school_year = NEW.school_year
                     AND c.semester::TEXT = NEW.semester::TEXT)
               )
           ) AS has_grades
    FROM public.users u
    WHERE u.role::TEXT = 'student'
      AND COALESCE(u.status, 'active') = 'active'
  LOOP
    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      v_row.user_id,
      'term_rollover_reminder',
      CASE WHEN v_row.has_grades
        THEN 'Your Grades Are Final Unless You Question Them'
        ELSE 'A New Academic Term Has Started' END,
      CASE WHEN v_row.has_grades
        THEN '/student/graderequests'
        ELSE '/student/mygradeslist' END,
      CASE WHEN v_row.has_grades THEN 'warning' ELSE 'info' END,
      CASE WHEN v_row.has_grades
        THEN format(
          '%s %s has ended. If you believe a posted grade is wrong, you have %s school days to file a grade change request — until %s. Weekends do not count. After that date the only way to correct an official grade is through the Registrar.',
          NEW.school_year, NEW.semester, v_days,
          to_char(v_deadline AT TIME ZONE 'Asia/Manila', 'FMDay, FMDD FMMonth YYYY'))
        ELSE format(
          '%s %s has ended and your classes for it are now closed. Your new term''s classes will appear once your instructors set them up.',
          NEW.school_year, NEW.semester)
      END,
      jsonb_build_object(
        'term_id', NEW.term_id,
        'school_year', NEW.school_year,
        'semester', NEW.semester,
        'dispute_deadline', CASE WHEN v_row.has_grades THEN v_deadline END,
        'dispute_grace_days', v_days,
        'has_posted_grades', v_row.has_grades
      ),
      -- One per student per rollover. A term that somehow ends twice must not
      -- send it twice.
      format('term_rollover_student:%s:%s', v_row.user_id, NEW.term_id),
      FALSE
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_students_of_rollover ON public.academic_terms;
CREATE TRIGGER trg_notify_students_of_rollover
  AFTER UPDATE ON public.academic_terms
  FOR EACH ROW EXECUTE FUNCTION public.aspire_notify_students_of_rollover();

-- -----------------------------------------------------------------------------
-- Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE v_def TEXT;
BEGIN
  IF to_regprocedure('public.aspire_add_school_days(timestamptz,integer)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: aspire_add_school_days is missing, so the deadline would be wrong.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_notify_students_of_rollover'
      AND tgrelid = 'public.academic_terms'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: students are still not told the term ended.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'aspire_notify_students_of_rollover';

  -- School days, not calendar days.
  IF position('aspire_add_school_days' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the deadline is not counted in school days.';
  END IF;

  -- Philippine time, like every other date this system shows a person.
  IF position('Asia/Manila' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the deadline would be shown in UTC.';
  END IF;

  -- Both links must be routes that exist in src/App.jsx. 20261103093749 shipped
  -- '/faculty/myclasses', which does not, and sent three instructors to a 404.
  IF position('/student/graderequests' IN v_def) = 0
     OR position('/student/mygradeslist' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a notice would link somewhere students cannot open.';
  END IF;

  -- The sibling rollover triggers must survive: four now hang off this table.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_remind_unposted_sg_on_rollover')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_close_plans_on_rollover')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_archive_tutor_plans_on_rollover') THEN
    RAISE EXCEPTION 'Verification failed: a sibling rollover trigger is missing.';
  END IF;

  RAISE NOTICE 'Students will now be told the term ended, and when their right to question a grade expires.';
END
$verify$;

COMMIT;
