-- =============================================================================
-- An instructor keeps the classes they taught
-- =============================================================================
--
-- THE SYMPTOM
--   An archived class opened from the faculty portal showed "0 Students
--   Enrolled" and an empty grade sheet, while the database held 13 enrollments,
--   13 posted grades and 52 term-score rows for it. Nothing had been deleted.
--   The instructor simply could not see their own class any more.
--
-- THE CAUSE
--   is_assigned_faculty() ends with:
--
--     AND class_record.status::TEXT = 'active'
--
--   and it is used as the faculty arm of BOTH the mutation policies and the
--   read policies. For writing that clause is exactly right: an archived class
--   is view only, and its scores must not be editable. For reading it is wrong,
--   because perform_semester_transition() flips status to 'archived' the moment
--   the Semestral Grade is in -- and at that instant the instructor who taught
--   the class stops satisfying every SELECT policy that depends on the
--   function. The roster, the scores, the posted grades, the activities, the
--   attendance and the grading columns all vanish together.
--
--   The archive was not losing records. It was being denied them.
--
--   This is why a client-side fix could not work: reconstructing the roster
--   from posted_grades and student_term_scores fails too, because those tables
--   are gated by the same predicate through can_read_student_class_record().
--
-- THE FIX
--   Separate the two questions the one function was being asked to answer:
--
--     is_assigned_faculty(class)  "may this faculty CHANGE this class?"
--                                 keeps status = 'active'. Unchanged, and still
--                                 the gate on every mutation policy.
--
--     is_class_faculty(class)     "did this faculty TEACH this class?"
--                                 no status test. A teaching assignment is a
--                                 historical fact and does not expire.
--
--   Read policies move to the second. Write policies do not move at all, so an
--   archived class stays exactly as read-only as it is today -- that property is
--   asserted at the bottom rather than assumed.
--
-- WHY NOT JUST DROP THE STATUS CHECK FROM is_assigned_faculty
--   Because it guards six mutation policies. Removing the clause there would
--   reopen archived classes for editing and silently undo the whole point of
--   archiving, which is that an official grade stops being casually editable
--   and can only change through a Registrar override the Dean acknowledges.
--
-- BLAST RADIUS
--   can_read_student_class_record() is the single read predicate behind
--   posted_grades, student_term_scores, student_component_scores,
--   student_activity_scores and attendance_records, so changing it once covers
--   all five. Three further policies name the function directly and are
--   rewritten here: enrollments, class_grading_columns and class_activities.
--
--   Nothing widens beyond the instructor who was actually assigned to the
--   class. A faculty member still cannot read a class that was never theirs.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- "Did this faculty teach this class?" -- the same test as is_assigned_faculty
-- minus the status clause. The actor must still be an active faculty account;
-- it is the CLASS that is allowed to be closed, not the person.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_class_faculty(p_class_record_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_records class_record
    JOIN public.users actor ON actor.user_id = auth.uid()
    WHERE class_record.class_record_id = p_class_record_id
      AND class_record.faculty_id = actor.user_id
      AND actor.role::TEXT = 'faculty'
      AND COALESCE(actor.status::TEXT, 'active') = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_class_faculty(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_class_faculty(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- The shared read predicate. One edit here reaches posted_grades,
-- student_term_scores, student_component_scores, student_activity_scores and
-- attendance_records, because each of their SELECT policies calls it.
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
    OR public.is_class_faculty(p_class_record_id)
    OR public.is_authorized_dean_for_class(p_class_record_id)
    OR public.is_active_admin();
$$;

-- -----------------------------------------------------------------------------
-- The three SELECT policies that name the predicate directly.
--
-- Each is recreated with the same shape it already has, with the faculty arm
-- swapped. The student and dean arms are copied verbatim so this migration
-- changes exactly one thing.
-- -----------------------------------------------------------------------------

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
        public.is_class_faculty(class_record.class_record_id)
        OR public.is_authorized_dean_for_class(class_record.class_record_id)
      )
  )
);

DROP POLICY IF EXISTS class_grading_columns_authorized_select ON public.class_grading_columns;
CREATE POLICY class_grading_columns_authorized_select
ON public.class_grading_columns FOR SELECT TO authenticated
USING (
  public.is_student_enrolled_in_class(auth.uid(), class_record_id)
  OR public.is_class_faculty(class_record_id)
  OR public.is_authorized_dean_for_class(class_record_id)
  OR public.is_active_admin()
);

DROP POLICY IF EXISTS class_activities_authorized_select ON public.class_activities;
CREATE POLICY class_activities_authorized_select
ON public.class_activities FOR SELECT TO authenticated
USING (
  public.is_student_enrolled_in_class(auth.uid(), class_record_id)
  OR public.is_class_faculty(class_record_id)
  OR public.is_authorized_dean_for_class(class_record_id)
  OR public.is_active_admin()
);

-- -----------------------------------------------------------------------------
-- Verify against the catalog, not against this file.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
  v_qual TEXT;
  v_count INTEGER;
  v_policy RECORD;
BEGIN
  -- 1. The new read predicate must NOT test class status.
  v_def := pg_get_functiondef('public.is_class_faculty(uuid)'::regprocedure);
  IF position('status' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: is_class_faculty does not check the actor''s account status.';
  END IF;
  IF v_def ILIKE '%class_record.status%' THEN
    RAISE EXCEPTION 'Verification failed: is_class_faculty still tests the class status, so archived classes stay hidden.';
  END IF;

  -- 2. The write predicate must STILL test class status. This is the property
  --    that keeps an archived class read-only; if it were lost, this migration
  --    would have quietly reopened official grades for editing.
  v_def := pg_get_functiondef('public.is_assigned_faculty(uuid)'::regprocedure);
  IF v_def NOT ILIKE '%class_record.status%' THEN
    RAISE EXCEPTION 'Verification failed: is_assigned_faculty no longer restricts writes to active classes.';
  END IF;

  -- 3. The shared read predicate must route through the new function.
  v_def := pg_get_functiondef('public.can_read_student_class_record(uuid,uuid)'::regprocedure);
  IF v_def NOT ILIKE '%is_class_faculty%' THEN
    RAISE EXCEPTION 'Verification failed: can_read_student_class_record still hides archived classes from their instructor.';
  END IF;
  IF v_def ILIKE '%is_assigned_faculty%' THEN
    RAISE EXCEPTION 'Verification failed: can_read_student_class_record still calls the write predicate.';
  END IF;

  -- 4. Every rewritten SELECT policy must exist and use the read predicate.
  FOR v_policy IN
    SELECT unnest(ARRAY[
      'enrollments_authorized_select',
      'class_grading_columns_authorized_select',
      'class_activities_authorized_select'
    ]) AS policyname
  LOOP
    SELECT qual INTO v_qual
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname = v_policy.policyname;

    IF v_qual IS NULL THEN
      RAISE EXCEPTION 'Verification failed: policy % is missing.', v_policy.policyname;
    END IF;
    IF v_qual NOT ILIKE '%is_class_faculty%' THEN
      RAISE EXCEPTION 'Verification failed: policy % does not use the read predicate.', v_policy.policyname;
    END IF;
    IF v_qual ILIKE '%is_assigned_faculty%' THEN
      RAISE EXCEPTION 'Verification failed: policy % still uses the write predicate.', v_policy.policyname;
    END IF;
  END LOOP;

  -- 5. The mutation policies must be untouched. "An archived class is not
  --    editable" is the guarantee most at risk in this migration, so it is
  --    checked rather than assumed.
  --
  --    Discovered from the catalog instead of from a hardcoded list. An earlier
  --    draft named the seven policies this repository's migrations create, and
  --    it failed on student_component_scores_faculty_mutation, which
  --    20261008180000 creates but which is not present in the live database.
  --    A list written from migrations describes what SHOULD be deployed; only
  --    the catalog describes what IS. A policy that does not exist is also not
  --    one this migration can weaken, so absence is not the failure -- a policy
  --    that exists and has LOST its active-class requirement is.
  v_count := 0;
  FOR v_policy IN
    SELECT policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE '%faculty_mutation%'
  LOOP
    IF v_policy.qual IS NULL OR v_policy.qual NOT ILIKE '%is_assigned_faculty%' THEN
      RAISE EXCEPTION 'Verification failed: mutation policy % no longer requires an active class, so archived grades became editable.', v_policy.policyname;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Verification failed: no faculty mutation policy was found at all, so nothing is holding archived classes read-only.';
  END IF;

  -- The one policy this migration rewrites a sibling of, so its write gate is
  -- named outright rather than left to the sweep above.
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public' AND policyname = 'enrollments_faculty_mutation';
  IF v_qual IS NULL OR v_qual NOT ILIKE '%is_assigned_faculty%' THEN
    RAISE EXCEPTION 'Verification failed: enrollments_faculty_mutation is missing or no longer requires an active class.';
  END IF;

  RAISE NOTICE 'Checked % faculty mutation policies; all still require an active class.', v_count;

  RAISE NOTICE 'Instructors can read the classes they taught after those classes are archived. Writing to them is still refused.';
END
$verify$;

COMMIT;
