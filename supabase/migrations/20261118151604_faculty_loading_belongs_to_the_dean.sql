-- =============================================================================
-- Faculty loading belongs to the Dean's office, not the Registrar
-- =============================================================================
--
-- THE DECISION (pre-final defense revision, 2026-11-18)
--   Faculty Loading & Provisioning is removed from the Registrar completely and
--   stays with the Dean, who loads their own college's faculty. The Registrar
--   page is gone from src/ (its route now redirects to the dashboard). This
--   migration removes the same authority on the server, so the Registrar cannot
--   call the loading RPCs directly either.
--   Plan: docs/02-thesis/defense/REGISTRAR_REVISIONS_PLAN_2026-11-18.md, Phase 1.
--
-- WHAT CHANGES
--   1. can_load_faculty_for_department() -> the active Dean of that college only.
--      Every loading write routes through it: add/update/delete/finalize drafts,
--      reassign, add_student_to_class, the provisioning lock, and (through
--      can_manage_class_record) update_class_schedule, reassign_class_faculty
--      and delete_class_record. So this one function is the whole change of
--      authority.
--   2. notify_loading_session_started() -> a no-op. Its only remaining branch
--      told the Registrar that a Dean had opened loading, with a link to
--      /registrar/facultyloading. The Registrar has nothing to open now. Kept
--      callable because acquire_provisioning_lock() calls it.
--   3. aspire_notify_section_owner_of_booking() -> notifies the owning
--      college's Dean only, linking to /dean/facultyloading. It previously also
--      notified every Registrar, and sent the Dean a /registrar/... link their
--      role cannot open.
--
-- WHAT DOES NOT CHANGE
--   Read access. No SELECT policy is touched; the Registrar still reads
--   class_records, sections and enrollments for records work. The schedule
--   occupancy and conflict functions still show a Registrar the full detail if
--   one ever calls them. No table, column or row is altered. Old Registrar
--   notifications that link to /registrar/facultyloading are left in place;
--   the app redirects that link to the dashboard.
--
-- Safe to re-run.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Who may load faculty for a college: its Dean.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_load_faculty_for_department(p_department_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.is_active_dean_for_department(p_department_id);
$$;

REVOKE ALL ON FUNCTION public.can_load_faculty_for_department(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_load_faculty_for_department(UUID) TO authenticated;

COMMENT ON FUNCTION public.can_load_faculty_for_department(UUID) IS
  'Faculty loading is the Dean''s, for their own college only. The Registrar '
  'lost this authority on 2026-11-18 (pre-final defense revision).';

-- -----------------------------------------------------------------------------
-- 2. Opening loading no longer notifies the Registrar.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_loading_session_started(p_department_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only a Dean can open loading now, and the only party this ever told about
  -- a Dean's session was the Registrar. Nothing to send.
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_loading_session_started(UUID) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. A booked section notifies its own Dean, with a link the Dean can open.
--    Restated from 20261104210354 with only the recipients and link changed.
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

  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
  )
  SELECT u.user_id, 'faculty_loading',
         'A Class Was Added to Your Section',
         '/dean/facultyloading', 'info',
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
    AND u.role::TEXT = 'dean'
    AND u.department_id = v_section_dept
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.can_load_faculty_for_department(uuid)'::regprocedure);
  IF position('is_active_registrar' IN v_def) > 0 THEN
    RAISE EXCEPTION 'Verification failed: the Registrar can still load faculty.';
  END IF;
  IF position('is_active_dean_for_department' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the Dean can no longer load faculty.';
  END IF;

  v_def := pg_get_functiondef('public.aspire_notify_section_owner_of_booking()'::regprocedure);
  IF position('/registrar/facultyloading' IN v_def) > 0 OR position('''registrar''' IN v_def) > 0 THEN
    RAISE EXCEPTION 'Verification failed: a booking still notifies the Registrar or links to its removed page.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_notify_section_owner_of_booking'
      AND tgrelid = 'public.faculty_load_drafts'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: the booking notice trigger is missing. Run 20261104210354 first.';
  END IF;

  RAISE NOTICE 'Faculty loading is now the Dean''s alone.';
END
$verify$;

COMMIT;
