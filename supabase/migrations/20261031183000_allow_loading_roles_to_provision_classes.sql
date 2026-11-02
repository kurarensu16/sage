-- =============================================================================
-- Let the roles that do faculty loading actually provision the class
-- =============================================================================
--
-- THE BUG
--   Finalizing a draft fails for both the Dean and the Registrar:
--
--     POST /rest/v1/class_records -> 403
--     new row violates row-level security policy for table "class_records"
--
--   class_records_faculty_insert was written on 2026-10-08, three weeks before
--   faculty loading existed. It admits:
--
--     public.is_active_admin()                        -- role 'admin' ONLY
--     OR faculty_id = auth.uid() AND actor is faculty -- a teacher's own class
--
--   Faculty loading arrived on 2026-10-29 and finalize provisions the class with
--   a direct client insert. Nobody in the loading flow satisfies either arm:
--   a Dean is not an admin, a Registrar is not an admin, and neither is
--   inserting a class for themselves. So the feature could never have completed
--   from either portal. It went unnoticed because the Dean path had never been
--   run end to end, and the Registrar path stops at exactly the same policy.
--
-- THE FIX
--   Add a third arm using can_load_faculty_for_department(), which is already
--   the single authority for "may load faculty for this college" -- the same
--   function the draft RPCs check. The college is read from the section, which
--   is where a class's college actually lives.
--
--   Deliberately NOT a blanket widening to registrar and dean: a Dean stays
--   confined to their own college here exactly as they are everywhere else,
--   because can_load_faculty_for_department() resolves to
--   is_active_dean_for_department(department_id) for them.
--
-- WHAT THIS DOES NOT FIX
--   The insert is still a direct client write, where AGENTS.md asks for a
--   SECURITY DEFINER RPC. Moving it is the better end state, but the snapshot
--   it writes is built in JavaScript by resolveGradingFormula() and
--   createGradingFormulaSnapshot(), and post_grade_milestone_atomic compares
--   snapshots with an order-sensitive JSONB <>. Rebuilding that in SQL risks a
--   mismatch that would surface much later, at the first posting. So the
--   authorization boundary is corrected here and the move is left as its own
--   change.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS class_records_faculty_insert ON public.class_records;
CREATE POLICY class_records_faculty_insert
ON public.class_records FOR INSERT TO authenticated
WITH CHECK (
  public.is_active_admin()
  OR (
    faculty_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users actor
      WHERE actor.user_id = auth.uid()
        AND actor.role::TEXT = 'faculty'
        AND COALESCE(actor.status::TEXT, 'active') = 'active'
    )
  )
  -- Faculty loading: the Registrar institution-wide, a Dean for their own
  -- college. The college comes from the section the class is being created for.
  OR public.can_load_faculty_for_department(
       (SELECT s.department_id FROM public.sections s
         WHERE s.section_id = class_records.section_id)
     )
);

COMMENT ON POLICY class_records_faculty_insert ON public.class_records IS
  'Admins, a faculty member creating their own class, and whoever may load '
  'faculty for the section''s college. The third arm is what makes Finalize '
  'work in Faculty Loading for the Registrar and for a Dean within their own '
  'college.';

-- -----------------------------------------------------------------------------
-- Verify the policy admits what it should, using the catalog rather than trust.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_expr(pol.polwithcheck, pol.polrelid) INTO v_def
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'class_records'
    AND pol.polname = 'class_records_faculty_insert';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Verification failed: class_records_faculty_insert is missing.';
  END IF;
  IF position('can_load_faculty_for_department' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the loading arm was not added.';
  END IF;
  -- The original two arms must survive, or provisioning by an admin, and a
  -- faculty member creating their own class, both break.
  IF position('is_active_admin' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the admin arm was dropped.';
  END IF;

  RAISE NOTICE 'Finalize can now provision a class as Registrar, or as Dean within their own college.';
END $$;

COMMIT;
