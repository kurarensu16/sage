-- =============================================================================
-- Graduation: the one outcome a student could never reach
-- =============================================================================
--
-- THE GAP
--   Year levels climb at a school-year rollover: 1st -> 2nd -> 3rd -> 4th.
--   There is no 5th rung, so a student who finishes 4th year stays a 4th year
--   forever. They keep their section, keep appearing on rosters, and keep being
--   counted as an active student with work outstanding. Nothing in ASPIRE can
--   say a student is done.
--
-- WHY THE SYSTEM MUST NOT DECIDE THIS
--   Finishing 4th year is not graduating. A student one failed subject short
--   repeats it, enrols in a lower year's class, and shows as Irregular -- which
--   already works, because "irregular" is derived from being enrolled outside
--   your own section rather than stored.
--
--   Only the Registrar knows who actually completed their requirements, so only
--   the Registrar can say so. Automatic graduation at a year boundary would be
--   wrong for exactly the students it hurts most.
--
-- WHY year_level AND NOT status
--   users.status is read as `= 'active'` across the rollover, class lists,
--   rosters and the RLS policies. A fourth value there would not raise an
--   error; it would make graduated students VANISH from every one of those at
--   once -- the failure shape behind B-01, B-02, B-04 and B-11, and the same
--   reason the intervention closure in 20261103090600 was kept off a status
--   column.
--
--   year_level already carries '1st Year' .. '4th Year' and is used for display
--   and progression, not for access. 'Graduated' extends a vocabulary instead of
--   breaking a gate. A graduated student stays `status = 'active'`, keeps every
--   record, and simply stops being a 4th year.
--
-- WHAT THIS DOES NOT DO
--   It does not unenrol, archive, or touch grades. Graduation is a statement
--   about a student's standing, not a deletion. Reversing it is setting
--   year_level back, which the Admin user form already allows.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Mark a batch of students as graduated.
--
--    Takes user_ids, NOT ID numbers. The client resolves the uploaded ID numbers
--    against real rows first and refuses to call this unless every one matched,
--    so an unreadable spreadsheet cell can never silently graduate nobody while
--    reporting success.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_mark_students_graduated(
  p_user_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INTEGER := 0;
  v_names   TEXT;
BEGIN
  IF NOT (public.is_active_registrar() OR public.is_active_admin()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an active registrar or administrator may record a graduation.';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No students were given.';
  END IF;

  -- Students only. Passing a faculty or dean id must not quietly relabel them.
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = ANY (p_user_ids) AND role::TEXT <> 'student'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'One of those accounts is not a student. Nothing was changed.';
  END IF;

  -- Every id must exist, or the caller's list and the database disagree about
  -- who was graduated and only the database would be right.
  IF (SELECT count(*) FROM public.users WHERE user_id = ANY (p_user_ids))
     <> array_length(p_user_ids, 1) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'One of those students no longer exists. Nothing was changed.';
  END IF;

  SELECT string_agg(u.first_name || ' ' || u.last_name, ', ' ORDER BY u.last_name)
  INTO v_names
  FROM public.users u
  WHERE u.user_id = ANY (p_user_ids);

  UPDATE public.users
  SET year_level = 'Graduated'
  WHERE user_id = ANY (p_user_ids)
    AND role::TEXT = 'student'
    AND COALESCE(year_level, '') <> 'Graduated';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Each graduate is told. A change to someone's standing that they learn about
  -- from a blank portal is the same silence this release has been closing.
  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, dedupe_key, is_read
  )
  SELECT u.user_id, 'academic_standing', 'You Have Been Marked as Graduated',
         '/student/mygradeslist', 'info',
         'The Registrar has recorded that you completed your programme. Your records stay available in your Grade Report.',
         format('graduated:%s', u.user_id), FALSE
  FROM public.users u
  WHERE u.user_id = ANY (p_user_ids)
    AND u.year_level = 'Graduated'
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'graduated', v_updated,
    'requested', array_length(p_user_ids, 1),
    'students', v_names
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_mark_students_graduated(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_mark_students_graduated(UUID[]) TO authenticated;

COMMENT ON FUNCTION public.registrar_mark_students_graduated(UUID[]) IS
  'Registrar/Admin only: records that students completed their programme by '
  'setting year_level to Graduated. status is deliberately untouched.';

-- -----------------------------------------------------------------------------
-- 2. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE v_def TEXT;
BEGIN
  IF to_regprocedure('public.registrar_mark_students_graduated(uuid[])') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the graduation RPC was not created.';
  END IF;

  v_def := pg_get_functiondef('public.registrar_mark_students_graduated(uuid[])'::regprocedure);

  -- The gate must be server-side. A client-side role check is a suggestion.
  IF position('is_active_registrar' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: anyone could record a graduation.';
  END IF;

  -- status must never be written by this function. If it ever is, graduated
  -- students disappear from every filter that reads status = 'active'.
  IF v_def ~* 'SET\s+status' OR v_def ~* 'status\s*=\s*''graduated''' THEN
    RAISE EXCEPTION 'Verification failed: graduation writes to status, which hides the student everywhere.';
  END IF;

  IF position('year_level' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: graduation does not set year_level.';
  END IF;

  -- No status value named 'graduated' may have leaked into the users table
  -- either, from this migration or a later one.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND pg_get_constraintdef(oid) ILIKE '%graduated%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: a graduated value leaked into the users status constraint.';
  END IF;

  RAISE NOTICE 'The Registrar can now record that a student has graduated.';
END
$verify$;

COMMIT;
