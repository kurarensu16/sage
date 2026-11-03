-- =============================================================================
-- At rollover, tell each instructor which Semestral Grades they still owe
-- =============================================================================
--
-- THE GAP
--   perform_semester_transition() already knows. It archives only the classes
--   whose SG is posted for every enrolled student, counts the rest into
--   v_pending, and returns that number:
--
--     SELECT COUNT(*) INTO v_pending
--     FROM public.class_records
--     WHERE term_id = v_old.term_id AND status::TEXT = 'active';
--
--   A number. Nobody is told WHOSE. notifyTermActivated() sends every faculty
--   and dean the same generic "Academic Term Activated" line, which says
--   nothing about an outstanding grade.
--
--   So an instructor can carry an unposted Semestral Grade across a rollover
--   and never learn it, until a student asks.
--
-- WHY IT MATTERS MORE THAN IT USED TO
--   Two clocks start at the rollover and neither is visible from the grade
--   sheet:
--
--     sg_grace_days     calendar days to post the SG at all
--     dispute_grace_days  22 SCHOOL days for the student to question it
--
--   An instructor who does not know the term ended cannot plan around either.
--   The message carries both, in their own units, rather than leaving someone
--   to work out that 22 school days is not 22 days.
--
-- WHERE IT HOOKS
--   academic_terms.ended_at, like the two rollover triggers already here.
--   perform_semester_transition() is not touched.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.aspire_remind_unposted_sg_on_rollover()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row         RECORD;
  v_sg_deadline TIMESTAMPTZ;
BEGIN
  IF NEW.ended_at IS NULL OR OLD.ended_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Calendar days, matching how the grace state is computed elsewhere
  -- (20261011130000:145). The dispute window is school days; the two are
  -- deliberately different units and the message says so.
  v_sg_deadline := NEW.ended_at + make_interval(days => COALESCE(NEW.sg_grace_days, 30));

  FOR v_row IN
    SELECT c.class_record_id, c.faculty_id,
           subject.code AS subject_code,
           section.name AS section_name,
           -- How many students are actually still waiting on a grade.
           (SELECT count(*)
              FROM public.enrollments e
             WHERE e.section_id = c.section_id
               AND e.subject_id = c.subject_id
               AND COALESCE(e.status::TEXT, 'active') = 'active'
               AND NOT EXISTS (
                 SELECT 1 FROM public.posted_grades pg
                  WHERE pg.class_record_id = c.class_record_id
                    AND pg.student_id = e.student_id
                    AND pg.grade_period::TEXT = 'semestral_grade'
               )) AS awaiting
    FROM public.class_records c
    LEFT JOIN public.subjects subject ON subject.subject_id = c.subject_id
    LEFT JOIN public.sections section ON section.section_id = c.section_id
    WHERE c.faculty_id IS NOT NULL
      AND (
        c.term_id = NEW.term_id
        OR (c.term_id IS NULL
            AND c.school_year = NEW.school_year
            AND c.semester::TEXT = NEW.semester::TEXT)
      )
  LOOP
    CONTINUE WHEN v_row.awaiting = 0;

    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      v_row.faculty_id, 'term_rollover_reminder', 'Semestral Grade Still Outstanding',
      '/faculty/myclasses', 'warning',
      format(
        '%s %s has ended and %s student%s in %s %s still has no Semestral Grade. You can post it until %s. After that the class can only be corrected through the Registrar. Students then have %s school days from today to question a posted grade — weekends do not count.',
        NEW.school_year, NEW.semester,
        v_row.awaiting, CASE WHEN v_row.awaiting = 1 THEN '' ELSE 's' END,
        COALESCE(v_row.subject_code, 'a class'), COALESCE(v_row.section_name, ''),
        to_char(v_sg_deadline AT TIME ZONE 'Asia/Manila', 'FMDay, FMDD FMMonth YYYY'),
        COALESCE(NEW.dispute_grace_days, 22)
      ),
      jsonb_build_object(
        'class_record_id', v_row.class_record_id,
        'term_id', NEW.term_id,
        'students_awaiting', v_row.awaiting,
        'sg_deadline', v_sg_deadline,
        'dispute_grace_days', COALESCE(NEW.dispute_grace_days, 22)
      ),
      -- One per class per rollover. A term that somehow ends twice must not
      -- send it twice.
      format('sg_outstanding:%s:%s', v_row.class_record_id, NEW.term_id),
      FALSE
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_remind_unposted_sg_on_rollover ON public.academic_terms;
CREATE TRIGGER trg_remind_unposted_sg_on_rollover
  AFTER UPDATE ON public.academic_terms
  FOR EACH ROW EXECUTE FUNCTION public.aspire_remind_unposted_sg_on_rollover();

-- -----------------------------------------------------------------------------
-- Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE v_def TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_remind_unposted_sg_on_rollover'
      AND tgrelid = 'public.academic_terms'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: instructors are still not told which grades they owe.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'aspire_remind_unposted_sg_on_rollover';

  -- Both clocks, in their own units. A message naming only one leaves the
  -- instructor to discover the other from a student.
  IF position('sg_grace_days' IN v_def) = 0
     OR position('dispute_grace_days' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the reminder does not carry both deadlines.';
  END IF;

  -- Philippine time, like every other date this system shows a person.
  IF position('Asia/Manila' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the posting deadline would be shown in UTC.';
  END IF;

  -- The sibling rollover triggers must survive: three now hang off this table.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_archive_tutor_plans_on_rollover')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_close_plans_on_rollover') THEN
    RAISE EXCEPTION 'Verification failed: a sibling rollover trigger is missing.';
  END IF;

  RAISE NOTICE 'Instructors will now be told, by class, which Semestral Grades they still owe.';
END
$verify$;

COMMIT;
