-- =============================================================================
-- Grade Override is the Registrar's page, and the Registrar could not read it
-- =============================================================================
--
-- THE BUG
--   Registrar -> Grade Override -> search a student. The student is found --
--   name, email, college and section all resolve -- and then:
--
--     "No posted grades found for this student."
--
--   The student's own Grade Report shows IT213 with MR 5.00, TFR 1.00 and
--   SG 2.00 at that same moment. The rows are there. RLS filtered them away,
--   and a filtered SELECT returns zero rows rather than an error, so the page
--   had nothing to report but absence.
--
--   posted_grades_authorized_select defers to can_read_student_class_record(),
--   written 2026-10-08:
--
--     p_student_id = auth.uid()
--     OR is_assigned_faculty(...)
--     OR is_authorized_dean_for_class(...)
--     OR is_active_admin()
--
--   The admin/registrar split landed 2026-10-29 and moved student records to
--   the Registrar. 20261029040940 re-pointed the gates it had audited -- the
--   override RPCs, the template save, the semester transition -- by substituting
--   is_active_admin() for is_active_registrar() in each live definition. This
--   helper was not on that list. It is a SECURITY DEFINER read helper rather
--   than a role gate, so the call-site audit did not reach it.
--
-- WHAT I GOT WRONG FIRST
--   The first version of this migration also tried to open
--   apply_admin_grade_override_v3() to the Registrar, on the belief that the
--   write was a second wall behind the read. It is not. 20261029040940 already
--   moved that gate from admin to registrar fourteen days ago; the Registrar
--   could always apply the override, and could only never find a grade to apply
--   it to. That attempt failed loudly --
--
--     Expected the admin guard exactly once ... found 0
--
--   -- which is the guard doing its job. Reading 20261023211000 without
--   accounting for the later live-substitution migration is how the repo's
--   source can disagree with the deployed database, and the lesson is the one
--   AGENTS.md already states: query the catalog, do not grep the migrations.
--
-- WHY ADMIN KEEPS THE READ
--   20261029040940 REPLACED admin with registrar in the gates it moved, because
--   those authorise an action AGENTS.md assigns to the Registrar alone. This
--   helper is different: it gates SELECT on posted_grades, student_term_scores,
--   student_activity_scores and attendance_records for every role at once.
--   Taking the admin arm out would be a separate decision with its own blast
--   radius, not part of fixing a Registrar who cannot see a grade. Added, not
--   substituted.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The Registrar may read a student's official record.
--
--    One arm restores every record-keeping screen the split handed over, not
--    only this page, because the same helper gates the term scores, the
--    activity scores and the attendance behind them.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_read_student_class_record(
  p_class_record_id UUID,
  p_student_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT p_student_id = auth.uid()
    OR public.is_assigned_faculty(p_class_record_id)
    OR public.is_authorized_dean_for_class(p_class_record_id)
    OR public.is_active_registrar()
    OR public.is_active_admin();
$$;

-- -----------------------------------------------------------------------------
-- 2. Verify against the catalog, including the thing this migration does NOT do.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_read     TEXT;
  v_override TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_read
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'can_read_student_class_record';

  IF v_read IS NULL THEN
    RAISE EXCEPTION 'Verification failed: can_read_student_class_record is missing.';
  END IF;

  IF position('is_active_registrar' IN v_read) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the Registrar still cannot read a student record.';
  END IF;

  -- The arms that were already there must survive. Losing one would hide a
  -- student's own grades from them, which no screen would report as an error.
  IF position('is_assigned_faculty' IN v_read) = 0
     OR position('is_authorized_dean_for_class' IN v_read) = 0
     OR position('is_active_admin' IN v_read) = 0
     OR position('auth.uid()' IN v_read) = 0 THEN
    RAISE EXCEPTION 'Verification failed: an existing reader arm was dropped.';
  END IF;

  -- Not changed here, asserted here. If this ever fails, 20261029040940 was
  -- rolled back or the function was re-declared from 20261023211000's source,
  -- and the Registrar has silently lost the override itself.
  v_override := pg_get_functiondef(
    'public.apply_admin_grade_override_v3(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT)'::regprocedure
  );
  IF position('public.is_active_registrar()' IN v_override) = 0 THEN
    RAISE EXCEPTION
      'Verification failed: apply_admin_grade_override_v3 no longer admits the Registrar. '
      'Re-run 20261029040940_registrar_role_authorization.sql.';
  END IF;

  RAISE NOTICE 'The Registrar can now read official grades. The override gate already admitted them.';
END
$verify$;

COMMIT;
