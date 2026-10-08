-- =============================================================================
-- ASPIRE: GRADING AND ADVISING AUTHORIZATION HARDENING
-- =============================================================================
-- Replaces the early development-wide access model on student-facing grading
-- data with ownership, faculty-assignment, Dean-department, and Admin rules.
-- Multi-table milestone posting and SG correction remain secured RPC workflows.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_active_admin()
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
      AND actor.role::TEXT = 'admin'
      AND COALESCE(actor.status::TEXT, 'active') = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_faculty(p_class_record_id UUID)
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
      AND class_record.status::TEXT = 'active'
      AND actor.role::TEXT = 'faculty'
      AND COALESCE(actor.status::TEXT, 'active') = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_authorized_dean_for_class(p_class_record_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_records class_record
    JOIN public.sections section ON section.section_id = class_record.section_id
    JOIN public.users actor ON actor.user_id = auth.uid()
    WHERE class_record.class_record_id = p_class_record_id
      AND actor.role::TEXT = 'dean'
      AND COALESCE(actor.status::TEXT, 'active') = 'active'
      AND actor.department_id = section.department_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_student_enrolled_in_class(
  p_student_id UUID,
  p_class_record_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_records class_record
    JOIN public.enrollments enrollment
      ON enrollment.section_id = class_record.section_id
     AND enrollment.subject_id = class_record.subject_id
    WHERE class_record.class_record_id = p_class_record_id
      AND enrollment.student_id = p_student_id
      AND COALESCE(enrollment.status::TEXT, 'active') = 'active'
  );
$$;

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
    OR public.is_active_admin();
$$;

CREATE OR REPLACE FUNCTION public.is_authorized_dean_for_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users actor
    JOIN public.users student ON student.user_id = p_student_id
    WHERE actor.user_id = auth.uid()
      AND actor.role::TEXT = 'dean'
      AND COALESCE(actor.status::TEXT, 'active') = 'active'
      AND (
        actor.department_id = student.department_id
        OR EXISTS (
          SELECT 1
          FROM public.enrollments enrollment
          JOIN public.sections section ON section.section_id = enrollment.section_id
          WHERE enrollment.student_id = student.user_id
            AND section.department_id = actor.department_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_assigned_faculty(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_authorized_dean_for_class(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_student_enrolled_in_class(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_student_class_record(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_authorized_dean_for_student(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_faculty(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_authorized_dean_for_class(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_student_enrolled_in_class(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_student_class_record(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_authorized_dean_for_student(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Classroom and enrollment boundaries used by every grading policy
-- -----------------------------------------------------------------------------

ALTER TABLE public.class_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_records_authenticated_select ON public.class_records;
CREATE POLICY class_records_authenticated_select
ON public.class_records FOR SELECT TO authenticated
USING (TRUE);

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
);

DROP POLICY IF EXISTS class_records_faculty_update ON public.class_records;
CREATE POLICY class_records_faculty_update
ON public.class_records FOR UPDATE TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS class_records_faculty_delete ON public.class_records;
CREATE POLICY class_records_faculty_delete
ON public.class_records FOR DELETE TO authenticated
USING (public.is_active_admin());

DROP POLICY IF EXISTS enrollments_authorized_select ON public.enrollments;
CREATE POLICY enrollments_authorized_select
ON public.enrollments FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  OR public.is_active_admin()
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
  OR EXISTS (
    SELECT 1
    FROM public.class_records class_record
    WHERE class_record.subject_id = enrollments.subject_id
      AND class_record.section_id = enrollments.section_id
      AND public.is_assigned_faculty(class_record.class_record_id)
  )
);

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_computations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_computation_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_grading_columns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subjects_authenticated_select ON public.subjects;
CREATE POLICY subjects_authenticated_select
ON public.subjects FOR SELECT TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS subjects_admin_mutation ON public.subjects;
CREATE POLICY subjects_admin_mutation
ON public.subjects FOR ALL TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS grade_computations_authenticated_select ON public.grade_computations;
CREATE POLICY grade_computations_authenticated_select
ON public.grade_computations FOR SELECT TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS grade_computations_admin_mutation ON public.grade_computations;
CREATE POLICY grade_computations_admin_mutation
ON public.grade_computations FOR ALL TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS grade_computation_components_authenticated_select ON public.grade_computation_components;
CREATE POLICY grade_computation_components_authenticated_select
ON public.grade_computation_components FOR SELECT TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS grade_computation_components_admin_mutation ON public.grade_computation_components;
CREATE POLICY grade_computation_components_admin_mutation
ON public.grade_computation_components FOR ALL TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS class_grading_columns_authorized_select ON public.class_grading_columns;
CREATE POLICY class_grading_columns_authorized_select
ON public.class_grading_columns FOR SELECT TO authenticated
USING (
  public.is_student_enrolled_in_class(auth.uid(), class_record_id)
  OR public.is_assigned_faculty(class_record_id)
  OR public.is_authorized_dean_for_class(class_record_id)
  OR public.is_active_admin()
);

DROP POLICY IF EXISTS class_grading_columns_faculty_mutation ON public.class_grading_columns;
CREATE POLICY class_grading_columns_faculty_mutation
ON public.class_grading_columns FOR ALL TO authenticated
USING (public.is_assigned_faculty(class_record_id) OR public.is_active_admin())
WITH CHECK (public.is_assigned_faculty(class_record_id) OR public.is_active_admin());

CREATE OR REPLACE FUNCTION public.protect_grading_formula_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.grading_formula_snapshot IS NOT NULL
    AND NEW.grading_formula_snapshot IS DISTINCT FROM OLD.grading_formula_snapshot
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'A grading formula snapshot is immutable after it is established.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_class_formula_snapshot ON public.class_records;
CREATE TRIGGER trg_protect_class_formula_snapshot
BEFORE UPDATE OF grading_formula_snapshot ON public.class_records
FOR EACH ROW EXECUTE FUNCTION public.protect_grading_formula_snapshot();

DROP TRIGGER IF EXISTS trg_protect_posted_formula_snapshot ON public.posted_grades;
CREATE TRIGGER trg_protect_posted_formula_snapshot
BEFORE UPDATE OF grading_formula_snapshot ON public.posted_grades
FOR EACH ROW EXECUTE FUNCTION public.protect_grading_formula_snapshot();

REVOKE ALL ON FUNCTION public.protect_grading_formula_snapshot() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Saved activities and scores
-- -----------------------------------------------------------------------------

ALTER TABLE public.class_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_activity_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_term_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_component_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_activities_authorized_select ON public.class_activities;
CREATE POLICY class_activities_authorized_select
ON public.class_activities FOR SELECT TO authenticated
USING (
  public.is_student_enrolled_in_class(auth.uid(), class_record_id)
  OR public.is_assigned_faculty(class_record_id)
  OR public.is_authorized_dean_for_class(class_record_id)
  OR public.is_active_admin()
);

DROP POLICY IF EXISTS class_activities_faculty_mutation ON public.class_activities;
CREATE POLICY class_activities_faculty_mutation
ON public.class_activities FOR ALL TO authenticated
USING (public.is_assigned_faculty(class_record_id) OR public.is_active_admin())
WITH CHECK (public.is_assigned_faculty(class_record_id) OR public.is_active_admin());

DROP POLICY IF EXISTS student_activity_scores_authorized_select ON public.student_activity_scores;
CREATE POLICY student_activity_scores_authorized_select
ON public.student_activity_scores FOR SELECT TO authenticated
USING (
  public.can_read_student_class_record(
    (SELECT activity.class_record_id FROM public.class_activities activity WHERE activity.activity_id = student_activity_scores.activity_id),
    student_id
  )
);

DROP POLICY IF EXISTS student_activity_scores_faculty_mutation ON public.student_activity_scores;
CREATE POLICY student_activity_scores_faculty_mutation
ON public.student_activity_scores FOR ALL TO authenticated
USING (
  public.is_assigned_faculty(
    (SELECT activity.class_record_id FROM public.class_activities activity WHERE activity.activity_id = student_activity_scores.activity_id)
  ) OR public.is_active_admin()
)
WITH CHECK (
  (
    public.is_assigned_faculty(
      (SELECT activity.class_record_id FROM public.class_activities activity WHERE activity.activity_id = student_activity_scores.activity_id)
    )
    AND public.is_student_enrolled_in_class(
      student_id,
      (SELECT activity.class_record_id FROM public.class_activities activity WHERE activity.activity_id = student_activity_scores.activity_id)
    )
  ) OR public.is_active_admin()
);

DROP POLICY IF EXISTS student_term_scores_authorized_select ON public.student_term_scores;
CREATE POLICY student_term_scores_authorized_select
ON public.student_term_scores FOR SELECT TO authenticated
USING (public.can_read_student_class_record(class_record_id, student_id));

DROP POLICY IF EXISTS student_term_scores_faculty_mutation ON public.student_term_scores;
CREATE POLICY student_term_scores_faculty_mutation
ON public.student_term_scores FOR ALL TO authenticated
USING (public.is_assigned_faculty(class_record_id) OR public.is_active_admin())
WITH CHECK (
  (
    public.is_assigned_faculty(class_record_id)
    AND public.is_student_enrolled_in_class(student_id, class_record_id)
  ) OR public.is_active_admin()
);

DROP POLICY IF EXISTS student_component_scores_authorized_select ON public.student_component_scores;
CREATE POLICY student_component_scores_authorized_select
ON public.student_component_scores FOR SELECT TO authenticated
USING (public.can_read_student_class_record(class_record_id, student_id));

DROP POLICY IF EXISTS student_component_scores_faculty_mutation ON public.student_component_scores;
CREATE POLICY student_component_scores_faculty_mutation
ON public.student_component_scores FOR ALL TO authenticated
USING (public.is_assigned_faculty(class_record_id) OR public.is_active_admin())
WITH CHECK (
  (
    public.is_assigned_faculty(class_record_id)
    AND public.is_student_enrolled_in_class(student_id, class_record_id)
  ) OR public.is_active_admin()
);

CREATE OR REPLACE FUNCTION public.validate_student_activity_score_maximum()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_score NUMERIC;
BEGIN
  SELECT activity.max_score
  INTO v_max_score
  FROM public.class_activities activity
  WHERE activity.activity_id = NEW.activity_id;

  IF v_max_score IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'The selected activity does not exist.';
  END IF;

  IF NEW.score IS NOT NULL AND NEW.score > v_max_score THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = FORMAT('Activity score %s cannot exceed the activity maximum of %s.', NEW.score, v_max_score);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_student_activity_score_maximum ON public.student_activity_scores;
CREATE TRIGGER trg_validate_student_activity_score_maximum
BEFORE INSERT OR UPDATE OF activity_id, score ON public.student_activity_scores
FOR EACH ROW EXECUTE FUNCTION public.validate_student_activity_score_maximum();

REVOKE ALL ON FUNCTION public.validate_student_activity_score_maximum() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Official grades and attendance
-- -----------------------------------------------------------------------------

ALTER TABLE public.posted_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS posted_grades_authorized_select ON public.posted_grades;
CREATE POLICY posted_grades_authorized_select
ON public.posted_grades FOR SELECT TO authenticated
USING (public.can_read_student_class_record(class_record_id, student_id));

DROP POLICY IF EXISTS posted_grades_admin_update ON public.posted_grades;
CREATE POLICY posted_grades_admin_update
ON public.posted_grades FOR UPDATE TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Allow select for authenticated users on attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "Allow all operations for faculty and admin on attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS attendance_records_authorized_select ON public.attendance_records;
CREATE POLICY attendance_records_authorized_select
ON public.attendance_records FOR SELECT TO authenticated
USING (public.can_read_student_class_record(class_record_id, student_id));

DROP POLICY IF EXISTS attendance_records_faculty_mutation ON public.attendance_records;
CREATE POLICY attendance_records_faculty_mutation
ON public.attendance_records FOR ALL TO authenticated
USING (public.is_assigned_faculty(class_record_id) OR public.is_active_admin())
WITH CHECK (
  (
    public.is_assigned_faculty(class_record_id)
    AND public.is_student_enrolled_in_class(student_id, class_record_id)
  ) OR public.is_active_admin()
);

-- -----------------------------------------------------------------------------
-- Advising insights, evaluations, and SG correction records
-- -----------------------------------------------------------------------------

ALTER TABLE public.student_academic_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remark_override_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_correction_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_academic_insights_authorized_select ON public.student_academic_insights;
CREATE POLICY student_academic_insights_authorized_select
ON public.student_academic_insights FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  OR public.is_authorized_dean_for_student(student_id)
  OR public.is_active_admin()
);

DROP POLICY IF EXISTS student_academic_insights_owner_insert ON public.student_academic_insights;
CREATE POLICY student_academic_insights_owner_insert
ON public.student_academic_insights FOR INSERT TO authenticated
WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS risk_evaluations_student_select ON public.student_risk_evaluations;
CREATE POLICY risk_evaluations_student_select
ON public.student_risk_evaluations FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  AND status IN ('submitted', 'acknowledged_by_student')
  AND published_to_student_at IS NOT NULL
);

DROP POLICY IF EXISTS "Allow select for authenticated users on remark_override_requests" ON public.remark_override_requests;
DROP POLICY IF EXISTS remark_override_requests_authorized_select ON public.remark_override_requests;
CREATE POLICY remark_override_requests_authorized_select
ON public.remark_override_requests FOR SELECT TO authenticated
USING (
  requested_by = auth.uid()
  OR public.is_assigned_faculty(class_record_id)
  OR public.is_authorized_dean_for_class(class_record_id)
  OR public.is_active_admin()
);

DROP POLICY IF EXISTS grade_correction_history_authorized_select ON public.grade_correction_history;
CREATE POLICY grade_correction_history_authorized_select
ON public.grade_correction_history FOR SELECT TO authenticated
USING (
  public.is_assigned_faculty(class_record_id)
  OR public.is_authorized_dean_for_class(class_record_id)
  OR public.is_active_admin()
);

-- Remove anonymous and unnecessary direct mutation paths. Security-definer
-- posting/correction RPCs keep their separately granted execution rights.
REVOKE ALL ON TABLE public.class_activities FROM anon;
REVOKE ALL ON TABLE public.class_records FROM anon;
REVOKE ALL ON TABLE public.enrollments FROM anon;
REVOKE ALL ON TABLE public.subjects FROM anon;
REVOKE ALL ON TABLE public.grade_computations FROM anon;
REVOKE ALL ON TABLE public.grade_computation_components FROM anon;
REVOKE ALL ON TABLE public.class_grading_columns FROM anon;
REVOKE ALL ON TABLE public.student_activity_scores FROM anon;
REVOKE ALL ON TABLE public.student_term_scores FROM anon;
REVOKE ALL ON TABLE public.student_component_scores FROM anon;
REVOKE ALL ON TABLE public.posted_grades FROM anon;
REVOKE ALL ON TABLE public.attendance_records FROM anon;
REVOKE ALL ON TABLE public.student_academic_insights FROM anon;
REVOKE ALL ON TABLE public.remark_override_requests FROM anon;
REVOKE ALL ON TABLE public.grade_correction_history FROM anon;

REVOKE INSERT, DELETE ON TABLE public.posted_grades FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.student_academic_insights FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.remark_override_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.grade_correction_history FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.class_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.class_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.grade_computations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.grade_computation_components TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.class_grading_columns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_activity_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_term_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_component_scores TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.posted_grades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance_records TO authenticated;
GRANT SELECT, INSERT ON TABLE public.student_academic_insights TO authenticated;
GRANT SELECT ON TABLE public.remark_override_requests TO authenticated;
GRANT SELECT ON TABLE public.grade_correction_history TO authenticated;

COMMIT;
