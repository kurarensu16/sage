-- =============================================================================
-- ASPIRE: REGISTRAR STUDENT-RECORDS WRITE PATH (Admin/Registrar split, Phase 1)
-- =============================================================================
-- Lets the Registrar assign a student's home section, year level, and college
-- WITHOUT granting any broader write access to public.users.
--
-- Reference: docs/03-development/audits/REGISTRAR_RLS_CALL_SITE_AUDIT_2026-10-29.md
--
-- WHY AN RPC RATHER THAN A COLUMN-LIMITED GRANT
--   A student's home section lives on public.users (section_id), and
--   users_update_self_or_admin admits only the row owner or an active admin. The
--   obvious fix -- GRANT UPDATE (section_id, ...) ON public.users -- does not
--   work here: column privileges are granted per DATABASE ROLE, and admin,
--   registrar, faculty and students are all the same role (`authenticated`);
--   only RLS tells them apart. A column grant would therefore restrict nobody,
--   and revoking UPDATE from `authenticated` to re-grant columns would break both
--   Admin's account editing and every user's own profile edit.
--
--   So the capability is expressed as a SECURITY DEFINER RPC instead, which is
--   also the convention AGENTS.md states for privileged writes. Benefits:
--     * public.users RLS is left completely untouched, so "Admin is the only
--       role that can edit an account" stays literally true at the policy layer.
--     * The writable column set is fixed in the function body and cannot be
--       widened by a caller.
--     * The target is restricted to student rows, so a registrar can never alter
--       a faculty, dean, registrar or admin record through this path.
--     * role and status are never written, so this cannot be used to escalate
--       privilege, and prevent_self_role_escalation keeps its meaning.
--
-- Registrar's control over Regular vs Irregular follows from this plus the
-- enrollments access granted in 20261029040940: enrollment type is not stored,
-- it is derived by comparing a student's home section to the class's section
-- (getEnrollmentType in src/lib/classRoomService.js). Note a consequence worth
-- keeping in mind: a student with NO home section is reported Irregular in every
-- class, so clearing that backlog also corrects mislabelled enrolment types.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_set_student_records(
  p_student_id UUID,
  p_section_id UUID DEFAULT NULL,
  p_year_level TEXT DEFAULT NULL,
  p_department_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target public.users%ROWTYPE;
  v_section public.sections%ROWTYPE;
BEGIN
  IF NOT public.is_active_registrar() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an active registrar may set student records.';
  END IF;

  SELECT * INTO v_target FROM public.users WHERE user_id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Student not found.';
  END IF;

  -- Staff rows are out of reach through this path entirely.
  IF COALESCE(v_target.role::TEXT, '') <> 'student' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only student records may be set here. Staff accounts are managed by an administrator.';
  END IF;

  IF p_year_level IS NOT NULL
    AND p_year_level NOT IN ('1st Year', '2nd Year', '3rd Year', '4th Year')
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Year level must be one of 1st Year, 2nd Year, 3rd Year, or 4th Year.';
  END IF;

  IF p_section_id IS NOT NULL THEN
    SELECT * INTO v_section FROM public.sections WHERE section_id = p_section_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Section not found.';
    END IF;
    -- A section belongs to exactly one college, so a student placed in it must
    -- sit under that same college. Silently accepting a mismatch would produce a
    -- student whose college and section disagree.
    IF p_department_id IS NOT NULL
      AND v_section.department_id IS NOT NULL
      AND v_section.department_id <> p_department_id
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'The chosen section belongs to a different college than the one supplied.';
    END IF;
  END IF;

  UPDATE public.users
  SET section_id    = p_section_id,
      year_level    = COALESCE(p_year_level, year_level),
      department_id = COALESCE(p_department_id, department_id)
  WHERE user_id = p_student_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'student_id', p_student_id,
    'section_id', p_section_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_set_student_records(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_set_student_records(UUID, UUID, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.registrar_set_student_records(UUID, UUID, TEXT, UUID) IS
  'Registrar-only: sets a student''s home section, year level, and college. '
  'Never writes role, status, or identity fields, and refuses non-student targets.';

-- Bulk variant for the Import Students flow. One round trip instead of one per
-- row, and the whole import either lands or fails as a unit rather than leaving
-- a partially applied batch behind.
CREATE OR REPLACE FUNCTION public.registrar_bulk_set_student_records(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row JSONB;
  v_applied INTEGER := 0;
BEGIN
  IF NOT public.is_active_registrar() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an active registrar may set student records.';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A JSON array of rows is required.';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    PERFORM public.registrar_set_student_records(
      (v_row->>'student_id')::UUID,
      NULLIF(v_row->>'section_id', '')::UUID,
      NULLIF(v_row->>'year_level', ''),
      NULLIF(v_row->>'department_id', '')::UUID
    );
    v_applied := v_applied + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', TRUE, 'applied', v_applied);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_bulk_set_student_records(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_bulk_set_student_records(JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- Post-conditions
-- -----------------------------------------------------------------------------
DO $verify$
BEGIN
  IF to_regprocedure('public.registrar_set_student_records(uuid,uuid,text,uuid)') IS NULL
    OR to_regprocedure('public.registrar_bulk_set_student_records(jsonb)') IS NULL
  THEN
    RAISE EXCEPTION 'Verification failed: registrar student-records RPCs were not created.';
  END IF;

  -- public.users RLS must be exactly as it was: admin-or-self for UPDATE, with
  -- no registrar branch. The RPC is the only registrar write path.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%is_active_registrar%'
  ) THEN
    RAISE EXCEPTION
      'Verification failed: public.users RLS gained a registrar branch. This migration '
      'deliberately leaves users RLS admin-only and routes registrar writes through an RPC.';
  END IF;

  RAISE NOTICE 'Registrar student-records RPC migration verified.';
END
$verify$;

COMMIT;
