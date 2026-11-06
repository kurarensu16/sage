-- =============================================================================
-- General Education teaches everyone's students
-- =============================================================================
--
-- THE GAP
--   fetchLoadingCatalog(departmentId, term) filters faculty, programs, subjects
--   AND sections by the same department_id. That is correct for a college that
--   teaches its own students, and wrong for the Department of General
--   Education, which teaches students from every college and has none of its
--   own.
--
--   So a General Education instructor cannot be loaded at all: the picker shows
--   only General Education's sections, and there are none.
--
-- WHY A COLUMN AND NOT A NAME
--   Matching "General Education" by name would be a lookup in code for
--   something that lives in the database -- the same mistake the section form
--   comment warns about ("Program codes are read from programs.abbreviation,
--   never from a map in code"). A college is renamed, a second cross-college
--   unit appears, and the rule silently stops applying.
--
--   The flag is set by whoever administers colleges, not inferred.
--
-- THE COURTESY NOTICE
--   BSIT-1A belongs to Technology and Engineering. General Education booking a
--   class into it takes a slot out of their planning, and they should not find
--   out by trying to use it.
--
--   A trigger rather than code inside add_faculty_load_draft, so any future
--   path that creates a draft reports it too. Fires ONLY when the booking
--   college differs from the section's -- booking your own section would be
--   telling you what you just did.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Which colleges teach outside their own students.
-- -----------------------------------------------------------------------------
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS teaches_across_colleges BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.departments.teaches_across_colleges IS
  'TRUE for a college whose faculty teach other colleges students -- General '
  'Education. Its loading picker gains a college step and can reach every '
  'section; every other college keeps its own. Set deliberately, never inferred '
  'from the name.';

-- -----------------------------------------------------------------------------
-- 2. Tell a college when someone else books one of its sections.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_notify_section_owner_of_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_section_dept  UUID;
  v_section_name  TEXT;
  v_booking_name  TEXT;
  v_days          TEXT;
BEGIN
  IF NEW.section_id IS NULL OR NEW.department_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.department_id, s.name INTO v_section_dept, v_section_name
  FROM public.sections s WHERE s.section_id = NEW.section_id;

  -- Booking your own section is not news.
  IF v_section_dept IS NULL OR v_section_dept = NEW.department_id THEN
    RETURN NEW;
  END IF;

  SELECT d.name INTO v_booking_name
  FROM public.departments d WHERE d.department_id = NEW.department_id;

  v_days := COALESCE(array_to_string(NEW.meeting_days, '/'), 'an unscheduled slot');

  -- The dean of the section's college, and every active registrar. The subject
  -- is deliberately absent: the owning college is told its section was used and
  -- by whom, which is what affects their planning, and the same boundary
  -- redact_schedule_conflict draws elsewhere.
  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
  )
  SELECT u.user_id, 'faculty_loading',
         'A Class Was Added to Your Section',
         '/registrar/facultyloading', 'info',
         format('%s scheduled a class in %s%s. That slot is no longer available for your own loading.',
                COALESCE(v_booking_name, 'Another college'),
                COALESCE(v_section_name, 'one of your sections'),
                CASE WHEN NEW.start_time IS NOT NULL
                     THEN format(' on %s, %s to %s', v_days,
                                 to_char(NEW.start_time, 'FMHH12:MI AM'),
                                 to_char(NEW.end_time, 'FMHH12:MI AM'))
                     ELSE '' END),
         jsonb_build_object(
           'section_id', NEW.section_id,
           'booking_department_id', NEW.department_id,
           'draft_id', NEW.id
         ),
         format('section_booked:%s:%s', NEW.id, u.user_id),
         FALSE
  FROM public.users u
  WHERE COALESCE(u.status, 'active') = 'active'
    AND (
      (u.role::TEXT = 'dean' AND u.department_id = v_section_dept)
      OR u.role::TEXT = 'registrar'
    )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_section_owner_of_booking ON public.faculty_load_drafts;
CREATE TRIGGER trg_notify_section_owner_of_booking
  AFTER INSERT ON public.faculty_load_drafts
  FOR EACH ROW EXECUTE FUNCTION public.aspire_notify_section_owner_of_booking();

-- -----------------------------------------------------------------------------
-- 3. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE v_def TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'departments'
      AND column_name = 'teaches_across_colleges'
  ) THEN
    RAISE EXCEPTION 'Verification failed: no college can be marked as teaching across colleges.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_notify_section_owner_of_booking'
      AND tgrelid = 'public.faculty_load_drafts'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: a college is not told when someone else books its section.';
  END IF;

  v_def := pg_get_functiondef('public.aspire_notify_section_owner_of_booking()'::regprocedure);

  -- It must not fire for a college booking its own section, or every normal
  -- assignment raises a notice telling the registrar what they just did.
  IF position('v_section_dept = NEW.department_id' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a college would be notified of its own bookings.';
  END IF;

  -- A route that exists in src/App.jsx. 20261103093749 shipped
  -- /faculty/myclasses, which does not, and sent three instructors to a 404.
  IF position('/registrar/facultyloading' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the notice links somewhere that cannot be opened.';
  END IF;

  -- The advisory locks from 20261104205834 must still be in place: without
  -- them, two colleges sharing a section can both win, and this notice would
  -- report a booking that should never have been accepted.
  --
  -- Looked up by name rather than by a written-out signature, so a later change
  -- to the argument list cannot make this assertion silently unresolvable.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'add_faculty_load_draft'
      AND position('load_section:' IN pg_get_functiondef(p.oid)) > 0
  ) THEN
    RAISE EXCEPTION 'Verification failed: run 20261104205834 first -- two colleges can still double-book a section.';
  END IF;

  RAISE NOTICE 'General Education can be marked, and a college is told when its section is booked.';
END
$verify$;

COMMIT;
