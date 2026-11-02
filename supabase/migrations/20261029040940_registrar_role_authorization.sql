-- =============================================================================
-- ASPIRE: REGISTRAR ROLE AUTHORIZATION (Admin/Registrar split, Phase 1 step 2)
-- =============================================================================
-- Introduces 'registrar' as a 5th distinct role and moves the authorization for
-- Academic Setup, Academic Terms, Student Records, and Grade Override onto it.
--
-- Reference: docs/03-development/audits/REGISTRAR_RLS_CALL_SITE_AUDIT_2026-10-29.md
--            docs/03-development/audits/ADMIN_REGISTRAR_ROLE_SPLIT_WORKFLOW_PLAN_2026-10-28.md
--            docs/03-development/audits/POST_DEFENSE_IMPLEMENTATION_PHASING_2026-10-29.md
--
-- DESIGN NOTES
--  * public.is_active_admin() is deliberately LEFT UNCHANGED and keeps meaning
--    strictly 'admin'. Admin and Registrar are two distinct roles, so the ~60
--    call sites that must stay admin-only cannot drift. A new
--    public.is_active_registrar() is added instead, and only the sites
--    inventoried in the audit are re-pointed to it.
--  * No schema change: public.users.role is unconstrained TEXT, so 'registrar'
--    is simply a new value -- not an enum/CHECK widening.
--  * Section 2 DROPs the legacy 20260606164500 policies on academic_terms and
--    student_term_details before recreating them. This is required, not
--    cosmetic: Postgres OR's permissive policies together, and those legacy
--    admin-only policies were never dropped (unlike the attendance_records
--    equivalents, which 20261008180000 did drop). Re-pointing without dropping
--    would leave the old rule still granting access.
--  * Section 3 re-points large PL/pgSQL bodies by reading each function's LIVE
--    definition via pg_get_functiondef(), substituting only the gate call, and
--    re-executing it. Deliberate: hand-transcribing ~350 lines of grading logic
--    to change one line each would risk a silent logic error, and reading the
--    live definition guarantees the patch matches what is actually deployed.
--    Each swap asserts the expected substitution count, so an unexpected body
--    aborts the migration instead of silently doing nothing.
--  * One transaction: authorization must not be able to end up half-migrated.
--
-- NOT CHANGED HERE (deliberately, per the audit)
--  * Admin keeps: users_insert_admin, users_update_self_or_admin,
--    prevent_self_role_escalation, activity_logs_select_admin, grade audit reads.
--  * Registrar never gets INSERT on public.users. Import Students is
--    enrollment-only; account creation stays exclusively Admin's.
--  * Join-code / class_join_requests admin fallbacks: deferred to Phase 4.
--  * Admin's broad gradebook superuser fallbacks: separate reviewed change.
--  * The blanket USING (true) read policies (audit bucket W): addressed by the
--    RBAC read-hardening migration that follows this one. NOTE: that migration
--    must grant Registrar an explicit read on public.users, or View Users will
--    go blank once users_select_authenticated is narrowed.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The new role gate
-- -----------------------------------------------------------------------------
-- Mirrors is_active_admin() exactly, including the active-status check, so a
-- deactivated or archived registrar account carries no privilege.

CREATE OR REPLACE FUNCTION public.is_active_registrar()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users actor
    WHERE actor.user_id = auth.uid()
      AND actor.role::TEXT = 'registrar'
      AND COALESCE(actor.status::TEXT, 'active') = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_registrar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_registrar() TO authenticated;

COMMENT ON FUNCTION public.is_active_registrar() IS
  'TRUE when the caller is an active registrar. Distinct from is_active_admin(): '
  'Registrar owns academic and records data; Admin owns accounts and maintenance.';

-- -----------------------------------------------------------------------------
-- 2. Policy re-points
-- -----------------------------------------------------------------------------
-- 2a. ADMIN LOSES / REGISTRAR GAINS. The paired *_select policies are left
--     alone, so every role keeps its existing read access.

-- A1 Colleges & Departments
DROP POLICY IF EXISTS departments_admin_write ON public.departments;
CREATE POLICY departments_admin_write ON public.departments
  FOR ALL TO authenticated
  USING (public.is_active_registrar())
  WITH CHECK (public.is_active_registrar());

-- A2 Manage Sections
DROP POLICY IF EXISTS sections_admin_write ON public.sections;
CREATE POLICY sections_admin_write ON public.sections
  FOR ALL TO authenticated
  USING (public.is_active_registrar())
  WITH CHECK (public.is_active_registrar());

-- A3 Programs (backs the net-new Registrar Programs page)
DROP POLICY IF EXISTS programs_admin_write ON public.programs;
CREATE POLICY programs_admin_write ON public.programs
  FOR ALL TO authenticated
  USING (public.is_active_registrar())
  WITH CHECK (public.is_active_registrar());

-- A4 Subjects
DROP POLICY IF EXISTS subjects_admin_mutation ON public.subjects;
CREATE POLICY subjects_admin_mutation
ON public.subjects FOR ALL TO authenticated
USING (public.is_active_registrar())
WITH CHECK (public.is_active_registrar());

-- A5 Grading Templates (COG header)
DROP POLICY IF EXISTS grade_computations_admin_mutation ON public.grade_computations;
CREATE POLICY grade_computations_admin_mutation
ON public.grade_computations FOR ALL TO authenticated
USING (public.is_active_registrar())
WITH CHECK (public.is_active_registrar());

-- A6 Grading Templates (COG components)
DROP POLICY IF EXISTS grade_computation_components_admin_mutation ON public.grade_computation_components;
CREATE POLICY grade_computation_components_admin_mutation
ON public.grade_computation_components FOR ALL TO authenticated
USING (public.is_active_registrar())
WITH CHECK (public.is_active_registrar());

-- A13 The UPDATE that Grade Override performs on posted_grades.
--     Registrar-only per confirmed decision: Admin has no route to this
--     capability any more, so the audited actor role becomes 'registrar'.
DROP POLICY IF EXISTS posted_grades_admin_update ON public.posted_grades;
CREATE POLICY posted_grades_admin_update
ON public.posted_grades FOR UPDATE TO authenticated
USING (public.is_active_registrar())
WITH CHECK (public.is_active_registrar());

-- A14 / G1 Academic Terms.
--     TermManagement.jsx writes this table DIRECTLY (3 call sites), so the
--     term RPCs alone are not enough. The legacy policy below used a literal
--     role = 'admin' check and was never dropped by any later migration.
DROP POLICY IF EXISTS "Allow all operations for admins on academic_terms" ON public.academic_terms;
DROP POLICY IF EXISTS academic_terms_registrar_write ON public.academic_terms;
CREATE POLICY academic_terms_registrar_write
ON public.academic_terms FOR ALL TO authenticated
USING (public.is_active_registrar())
WITH CHECK (public.is_active_registrar());

-- A15 / G3 student_term_details -- touched by SectionList.jsx, a relocated page.
--     Same never-dropped legacy pattern as academic_terms.
DROP POLICY IF EXISTS "Allow all operations for admins on student_term_details" ON public.student_term_details;
DROP POLICY IF EXISTS student_term_details_registrar_write ON public.student_term_details;
CREATE POLICY student_term_details_registrar_write
ON public.student_term_details FOR ALL TO authenticated
USING (public.is_active_registrar())
WITH CHECK (public.is_active_registrar());

-- 2b. REGISTRAR ADDED ALONGSIDE EXISTING ROLES (additive -- nobody loses access)

-- G2 enrollments: Registrar currently has NO access at all here. Enrollment
--     Management, Section Rosters, and Import Students all depend on this table,
--     so without this they would render but stay empty and fail every write.
--     Admin's existing access is retained (stripping it belongs to the deferred
--     gradebook-fallback cleanup, audit bucket C3).
DROP POLICY IF EXISTS enrollments_authorized_select ON public.enrollments;
CREATE POLICY enrollments_authorized_select
ON public.enrollments FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  OR public.is_active_admin()
  OR public.is_active_registrar()
  OR EXISTS (
    SELECT 1
    FROM public.class_records class_record
    WHERE class_record.subject_id = enrollments.subject_id
      AND class_record.section_id = enrollments.section_id
      AND (
        public.is_assigned_faculty(class_record.class_record_id)
        OR public.is_authorized_dean_for_class(class_record.class_record_id)
      )
  )
);

DROP POLICY IF EXISTS enrollments_faculty_mutation ON public.enrollments;
CREATE POLICY enrollments_faculty_mutation
ON public.enrollments FOR ALL TO authenticated
USING (
  public.is_active_admin()
  OR public.is_active_registrar()
  OR EXISTS (
    SELECT 1
    FROM public.class_records class_record
    WHERE class_record.subject_id = enrollments.subject_id
      AND class_record.section_id = enrollments.section_id
      AND public.is_assigned_faculty(class_record.class_record_id)
  )
)
WITH CHECK (
  public.is_active_admin()
  OR public.is_active_registrar()
  OR EXISTS (
    SELECT 1
    FROM public.class_records class_record
    WHERE class_record.subject_id = enrollments.subject_id
      AND class_record.section_id = enrollments.section_id
      AND public.is_assigned_faculty(class_record.class_record_id)
  )
);

-- C6 Guardian visibility: Registrar is ADDED to the existing role list because
--     it now owns student records, while every other role keeps what it had.
--     The live policy is named guardians_admin_select (NOT guardians_admin_access,
--     as the role-split plan calls it); its source migration is UTF-16 encoded.
DROP POLICY IF EXISTS guardians_admin_select ON public.guardians;
CREATE POLICY guardians_admin_select ON public.guardians
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'registrar', 'dean', 'office', 'faculty')
  ));

-- -----------------------------------------------------------------------------
-- 3. Function gate re-points (live-definition substitution -- see header)
-- -----------------------------------------------------------------------------

DO $migrate$
DECLARE
  v_target   RECORD;
  v_def      TEXT;
  v_new_def  TEXT;
  v_found    INTEGER;
  v_gate     TEXT := 'public.is_active_admin()';
BEGIN
  FOR v_target IN
    SELECT *
    FROM (VALUES
      -- A7  Grading Templates atomic save RPC
      ('public.save_grade_template(UUID, TEXT, TEXT, JSONB)',                            1),
      -- A8  Academic Terms: semester transition
      ('public.perform_semester_transition(UUID, UUID, INTEGER)',                        1),
      -- A9  Academic Terms: SG status read
      ('public.get_term_sg_status(TEXT, TEXT)',                                          1),
      -- A10 Grade Override v2. The legacy v1 shim delegates to v2 and holds no
      --     gate of its own, so re-pointing v2 covers v1 automatically. v2 must
      --     move even though the UI calls v3, otherwise an Admin could still
      --     override a grade via the legacy RPC directly.
      ('public.apply_admin_grade_override_v2(UUID, UUID, NUMERIC, TEXT, TEXT)',          1),
      -- A11 Grade Override v3 -- the version src/lib/gradePostingService.js calls
      ('public.apply_admin_grade_override_v3(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT)', 1),
      -- A12 Trigger guard: "assigned faculty OR admin may apply an approved SG
      --     correction" becomes "assigned faculty OR registrar". TWO gates, not
      --     one: the identical check appears in both the secured-correction
      --     context path and the ordinary SG-repost path (verified against the
      --     live definition, 20261024093000:59-219). Both must move together.
      ('public.enforce_sg_correction_application()',                                     2)
    ) AS t(signature, expected_gates)
  LOOP
    -- Casting to regprocedure raises a clear error if the function is absent,
    -- which is the correct loud failure for an unexpected database state.
    v_def := pg_get_functiondef(v_target.signature::regprocedure);

    v_found := (length(v_def) - length(replace(v_def, v_gate, ''))) / length(v_gate);

    IF v_found <> v_target.expected_gates THEN
      RAISE EXCEPTION
        'Registrar migration aborted: % contains % is_active_admin() gate(s), expected %. '
        'The deployed body differs from what the 2026-10-29 call-site audit recorded -- '
        're-audit this function before re-running this migration.',
        v_target.signature, v_found, v_target.expected_gates;
    END IF;

    v_new_def := replace(v_def, v_gate, 'public.is_active_registrar()');

    IF v_new_def = v_def THEN
      RAISE EXCEPTION 'Registrar migration aborted: no substitution made in %.',
        v_target.signature;
    END IF;

    EXECUTE v_new_def;
    RAISE NOTICE 'Re-pointed % gate(s) to is_active_registrar() in %',
      v_found, v_target.signature;
  END LOOP;
END
$migrate$;

-- -----------------------------------------------------------------------------
-- 4. Post-conditions -- abort the whole migration unless the end state is right
-- -----------------------------------------------------------------------------

DO $verify$
DECLARE
  v_stale_policies INTEGER;
  v_registrar_gaps INTEGER;
BEGIN
  IF to_regprocedure('public.is_active_registrar()') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: is_active_registrar() was not created.';
  END IF;

  -- 4a. None of the relocated policies may still gate on admin.
  SELECT count(*) INTO v_stale_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'departments_admin_write',
      'sections_admin_write',
      'programs_admin_write',
      'subjects_admin_mutation',
      'grade_computations_admin_mutation',
      'grade_computation_components_admin_mutation',
      'posted_grades_admin_update',
      'academic_terms_registrar_write',
      'student_term_details_registrar_write'
    )
    AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%is_active_admin%';

  IF v_stale_policies > 0 THEN
    RAISE EXCEPTION
      'Verification failed: % relocated policy/policies still gate on is_active_admin().',
      v_stale_policies;
  END IF;

  -- 4b. Each relocated policy must actually reference the registrar gate.
  SELECT count(*) INTO v_registrar_gaps
  FROM (VALUES
    ('departments_admin_write'),
    ('sections_admin_write'),
    ('programs_admin_write'),
    ('subjects_admin_mutation'),
    ('grade_computations_admin_mutation'),
    ('grade_computation_components_admin_mutation'),
    ('posted_grades_admin_update'),
    ('academic_terms_registrar_write'),
    ('student_term_details_registrar_write')
  ) AS expected(policyname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.policyname = expected.policyname
      AND (COALESCE(p.qual, '') || COALESCE(p.with_check, '')) LIKE '%is_active_registrar%'
  );

  IF v_registrar_gaps > 0 THEN
    RAISE EXCEPTION
      'Verification failed: % expected registrar policy/policies missing or not registrar-gated.',
      v_registrar_gaps;
  END IF;

  -- 4c. The legacy never-dropped policies must be gone, or they would keep
  --     granting admin access via policy OR-ing.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'Allow all operations for admins on academic_terms',
        'Allow all operations for admins on student_term_details'
      )
  ) THEN
    RAISE EXCEPTION 'Verification failed: a legacy admin-only policy survived the drop.';
  END IF;

  -- 4d. Registrar must be able to reach enrollments (G2).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'enrollments_authorized_select'
      AND COALESCE(qual, '') LIKE '%is_active_registrar%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: enrollments SELECT does not admit registrar.';
  END IF;

  -- 4e. Admin's retained gates must survive untouched.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'users_insert_admin'
      AND COALESCE(with_check, '') LIKE '%is_active_admin%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: users_insert_admin must remain admin-gated.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'activity_logs_select_admin'
      AND COALESCE(qual, '') LIKE '%is_active_admin%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: activity_logs_select_admin must remain admin-gated.';
  END IF;

  -- 4f. Registrar must NOT have gained account-creation power.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'users_insert_admin'
      AND COALESCE(with_check, '') LIKE '%is_active_registrar%'
  ) THEN
    RAISE EXCEPTION
      'Verification failed: registrar must never hold INSERT on public.users '
      '(Import Students is enrollment-only).';
  END IF;

  RAISE NOTICE 'Registrar authorization migration verified successfully.';
END
$verify$;

COMMIT;
