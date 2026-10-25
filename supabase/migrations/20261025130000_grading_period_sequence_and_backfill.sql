-- Enforce the official grading-period sequence MR -> TFR -> SG and repair
-- historical SG rows whose earlier period records were bypassed.
--
-- The repair is intentionally conservative. It inserts a missing MR/TFR only
-- when the current locked score basis is complete and its hash still matches
-- the SG snapshot. It does not change SG, send notifications, or invent an
-- earlier posting timestamp. Any inconsistent row remains untouched for review.

BEGIN;

ALTER TABLE public.posted_grades
  DROP CONSTRAINT IF EXISTS posted_grades_official_source_check;
ALTER TABLE public.posted_grades
  ADD CONSTRAINT posted_grades_official_source_check
  CHECK (official_source IN ('faculty_post', 'dean_correction', 'admin_override', 'system_backfill'));

ALTER TABLE public.posted_grade_revisions
  DROP CONSTRAINT IF EXISTS posted_grade_revisions_official_source_check;
ALTER TABLE public.posted_grade_revisions
  ADD CONSTRAINT posted_grade_revisions_official_source_check
  CHECK (official_source IN ('faculty_post', 'dean_correction', 'admin_override', 'system_backfill'));

CREATE OR REPLACE FUNCTION public.aspire_assert_grade_period_sequence(
  p_class_record_id UUID,
  p_grade_period TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_missing_mr INTEGER := 0;
  v_missing_tfr INTEGER := 0;
BEGIN
  IF p_grade_period NOT IN ('midterm_rating', 'tentative_final_rating', 'semestral_grade') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported grading period.';
  END IF;

  IF p_grade_period IN ('tentative_final_rating', 'semestral_grade') THEN
    SELECT COUNT(*)::INTEGER INTO v_missing_mr
    FROM public.enrollments enrollment
    JOIN public.class_records class_record
      ON class_record.class_record_id = p_class_record_id
     AND class_record.section_id = enrollment.section_id
     AND class_record.subject_id = enrollment.subject_id
    WHERE COALESCE(enrollment.status::TEXT, 'active') = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM public.posted_grades grade
        WHERE grade.class_record_id = p_class_record_id
          AND grade.student_id = enrollment.student_id
          AND grade.grade_period::TEXT = 'midterm_rating'
      );
  END IF;

  IF p_grade_period = 'semestral_grade' THEN
    SELECT COUNT(*)::INTEGER INTO v_missing_tfr
    FROM public.enrollments enrollment
    JOIN public.class_records class_record
      ON class_record.class_record_id = p_class_record_id
     AND class_record.section_id = enrollment.section_id
     AND class_record.subject_id = enrollment.subject_id
    WHERE COALESCE(enrollment.status::TEXT, 'active') = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM public.posted_grades grade
        WHERE grade.class_record_id = p_class_record_id
          AND grade.student_id = enrollment.student_id
          AND grade.grade_period::TEXT = 'tentative_final_rating'
      );
  END IF;

  IF p_grade_period = 'tentative_final_rating' AND v_missing_mr > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
      'Post the Midterm Rating (MR) for the complete active roster before posting TFR. %s student(s) are missing MR.',
      v_missing_mr
    );
  END IF;
  IF p_grade_period = 'semestral_grade' AND (v_missing_mr > 0 OR v_missing_tfr > 0) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
      'Post MR and TFR for the complete active roster before finalizing SG. Missing MR: %s; missing TFR: %s.',
      v_missing_mr,
      v_missing_tfr
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_assert_grade_period_sequence(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.post_grade_milestone_v3(
  p_operation_id UUID,
  p_class_record_id UUID,
  p_grade_period TEXT,
  p_term_score_rows JSONB DEFAULT '[]'::JSONB,
  p_activity_score_rows JSONB DEFAULT '[]'::JSONB,
  p_posted_grade_rows JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_item JSONB;
  v_student_id UUID;
  v_absences INTEGER;
  v_note TEXT;
  v_fda_decisions JSONB := '{}'::JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required to post grades.';
  END IF;
  IF jsonb_typeof(COALESCE(p_posted_grade_rows, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Grade posting payloads must be JSON arrays.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.class_records class_record
    JOIN public.users actor ON actor.user_id = v_actor
    WHERE class_record.class_record_id = p_class_record_id
      AND class_record.faculty_id = v_actor
      AND actor.role::TEXT = 'faculty'
      AND actor.status::TEXT = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the active faculty assigned to this class can post its grades.';
  END IF;

  PERFORM public.aspire_assert_grade_period_sequence(p_class_record_id, p_grade_period);

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_posted_grade_rows, '[]'::JSONB))
  LOOP
    IF lower(COALESCE(v_item->>'remarks', '')) = 'fda' THEN
      IF p_grade_period <> 'semestral_grade' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'FDA may only be selected for the official semestral grade.';
      END IF;
      v_student_id := NULLIF(v_item->>'student_id', '')::UUID;
      v_note := NULLIF(BTRIM(COALESCE(v_item->>'remarks_note', '')), '');
      IF v_student_id IS NULL OR v_note IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An FDA decision requires a student and a written faculty reason.';
      END IF;

      SELECT COUNT(*)::INTEGER INTO v_absences
      FROM public.attendance_records attendance
      WHERE attendance.class_record_id = p_class_record_id
        AND attendance.student_id = v_student_id
        AND lower(attendance.status::TEXT) = 'absent';
      IF v_absences < 4 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = FORMAT(
          'FDA cannot be selected for student %s because only %s absence(s) are recorded.',
          v_student_id,
          v_absences
        );
      END IF;

      v_fda_decisions := v_fda_decisions || jsonb_build_object(v_student_id::TEXT, TRUE);
    END IF;
  END LOOP;

  PERFORM set_config('aspire.fda_decisions', v_fda_decisions::TEXT, TRUE);
  RETURN public.post_grade_milestone_v2(
    p_operation_id,
    p_class_record_id,
    p_grade_period,
    p_term_score_rows,
    p_activity_score_rows,
    p_posted_grade_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_grade_milestone_v3(UUID, UUID, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_grade_milestone_v3(UUID, UUID, TEXT, JSONB, JSONB, JSONB) TO authenticated;

-- Remove the authenticated bypasses. The v3 function remains able to call v2
-- as its SECURITY DEFINER owner, while clients must enter through v3.
REVOKE EXECUTE ON FUNCTION public.post_grade_milestone_v2(UUID, UUID, TEXT, JSONB, JSONB, JSONB) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.post_grade_milestone_atomic(UUID, TEXT, JSONB, JSONB, JSONB, JSONB) FROM authenticated;

COMMENT ON FUNCTION public.post_grade_milestone_v3(UUID, UUID, TEXT, JSONB, JSONB, JSONB) IS
  'Posts authoritative grading periods in MR-to-TFR-to-SG order. Four absences recommend FDA; only the assigned faculty may explicitly select FDA with a written reason.';

-- Give reconstructed records an explicit audit meaning rather than presenting
-- them as historical faculty releases.
CREATE OR REPLACE FUNCTION public.normalize_semantic_grade_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_grade_period TEXT;
  v_official_source TEXT;
  v_request_status TEXT;
BEGIN
  IF COALESCE(NEW.source, 'application') <> 'database_trigger' THEN
    RETURN NEW;
  END IF;

  IF NEW.entity_type = 'posted_grades' THEN
    IF NEW.operation <> 'delete' THEN
      BEGIN
        SELECT grade.grade_period::TEXT, grade.official_source
        INTO v_grade_period, v_official_source
        FROM public.posted_grades grade
        WHERE grade.posted_grade_id = NEW.entity_id::UUID;
      EXCEPTION WHEN invalid_text_representation THEN
        RETURN NEW;
      END;
    END IF;

    IF NEW.operation = 'delete' THEN
      NEW.action := 'Deleted Posted Grade';
      NEW.message := 'Deleted a posted grade record.';
    ELSIF v_official_source = 'system_backfill' THEN
      NEW.action := 'Reconstructed Missing Grading Period';
      NEW.message := CASE v_grade_period
        WHEN 'midterm_rating' THEN 'Reconstructed a missing Midterm Rating (MR) from the locked SG score basis.'
        WHEN 'tentative_final_rating' THEN 'Reconstructed a missing Tentative Final Rating (TFR) from the locked SG score basis.'
        ELSE 'Reconstructed a missing grading-period record from the locked SG score basis.'
      END;
    ELSIF v_grade_period = 'midterm_rating' THEN
      NEW.action := CASE WHEN NEW.operation = 'insert'
        THEN 'Posted Midterm Rating' ELSE 'Updated Midterm Rating' END;
      NEW.message := CASE WHEN NEW.operation = 'insert'
        THEN 'Posted an official Midterm Rating (MR) for a student.'
        ELSE 'Updated an official Midterm Rating (MR) for a student.' END;
    ELSIF v_grade_period = 'tentative_final_rating' THEN
      NEW.action := CASE WHEN NEW.operation = 'insert'
        THEN 'Posted Tentative Final Rating' ELSE 'Updated Tentative Final Rating' END;
      NEW.message := CASE WHEN NEW.operation = 'insert'
        THEN 'Posted an official Tentative Final Rating (TFR) for a student.'
        ELSE 'Updated an official Tentative Final Rating (TFR) for a student.' END;
    ELSIF v_grade_period = 'semestral_grade' THEN
      IF NEW.operation = 'insert' THEN
        NEW.action := 'Posted Semestral Grade';
        NEW.message := 'Posted an official Semestral Grade (SG) for a student.';
      ELSIF v_official_source = 'admin_override' THEN
        NEW.action := 'Applied Administrative Grade Override';
        NEW.message := 'Applied an administrative override to an official Semestral Grade (SG).';
      ELSIF v_official_source = 'dean_correction' THEN
        NEW.action := 'Applied Semestral Grade Correction';
        NEW.message := 'Applied a Dean-approved correction to an official Semestral Grade (SG).';
      ELSE
        NEW.action := 'Updated Semestral Grade';
        NEW.message := 'Updated an official Semestral Grade (SG).';
      END IF;
    END IF;
  ELSIF NEW.entity_type = 'remark_override_requests' THEN
    IF NEW.operation <> 'delete' THEN
      BEGIN
        SELECT request.status INTO v_request_status
        FROM public.remark_override_requests request
        WHERE request.request_id = NEW.entity_id::UUID;
      EXCEPTION WHEN invalid_text_representation THEN
        RETURN NEW;
      END;
    END IF;

    IF NEW.operation = 'delete' THEN
      NEW.action := 'Deleted SG Correction Request';
      NEW.message := 'Deleted an SG correction request record.';
    ELSIF v_request_status = 'pending' THEN
      NEW.action := CASE WHEN NEW.operation = 'insert'
        THEN 'Submitted SG Correction Request' ELSE 'Updated SG Correction Request' END;
      NEW.message := CASE WHEN NEW.operation = 'insert'
        THEN 'Submitted an SG correction request for Dean review.'
        ELSE 'Updated a pending SG correction request.' END;
    ELSIF v_request_status = 'approved' THEN
      NEW.action := CASE WHEN NEW.operation = 'insert'
        THEN 'Recorded Grade Override Approval' ELSE 'Approved SG Correction Request' END;
      NEW.message := CASE WHEN NEW.operation = 'insert'
        THEN 'Recorded the approval supporting an administrative grade override.'
        ELSE 'The Dean approved an SG correction request.' END;
    ELSIF v_request_status = 'rejected' THEN
      NEW.action := 'Rejected SG Correction Request';
      NEW.message := 'The Dean rejected an SG correction request.';
    ELSIF v_request_status = 'applied' THEN
      NEW.action := 'Completed SG Correction Request';
      NEW.message := 'Marked an approved SG correction request as applied to the official grade.';
    ELSIF v_request_status = 'cancelled' THEN
      NEW.action := 'Cancelled SG Correction Request';
      NEW.message := 'Cancelled an unresolved SG correction request.';
    ELSE
      NEW.action := 'Updated SG Correction Request';
      NEW.message := 'Updated an SG correction request record.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Repair only records whose complete current score basis is exactly the basis
-- frozen with SG. Skipped anomalies remain visible to the post-migration audit.
DO $$
DECLARE
  v_sg public.posted_grades%ROWTYPE;
  v_class public.class_records%ROWTYPE;
  v_projection JSONB;
  v_mr NUMERIC;
  v_tfr NUMERIC;
  v_actor UUID;
  v_repaired_students INTEGER := 0;
  v_skipped_students INTEGER := 0;
BEGIN
  FOR v_sg IN
    SELECT sg.*
    FROM public.posted_grades sg
    WHERE sg.grade_period::TEXT = 'semestral_grade'
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.posted_grades mr
          WHERE mr.class_record_id = sg.class_record_id
            AND mr.student_id = sg.student_id
            AND mr.grade_period::TEXT = 'midterm_rating'
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.posted_grades tfr
          WHERE tfr.class_record_id = sg.class_record_id
            AND tfr.student_id = sg.student_id
            AND tfr.grade_period::TEXT = 'tentative_final_rating'
        )
      )
    ORDER BY sg.class_record_id, sg.student_id
    FOR UPDATE
  LOOP
    SELECT * INTO v_class
    FROM public.class_records class_record
    WHERE class_record.class_record_id = v_sg.class_record_id;
    v_projection := public.aspire_calculate_student_grade(v_sg.class_record_id, v_sg.student_id);

    IF NOT COALESCE((v_projection->>'ok')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_projection->>'midterm_complete')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_projection->>'tfr_complete')::BOOLEAN, FALSE)
      OR NOT COALESCE((v_projection->>'sg_complete')::BOOLEAN, FALSE)
      OR v_sg.input_snapshot_hash IS NULL
      OR v_sg.input_snapshot_hash IS DISTINCT FROM (v_projection->>'input_snapshot_hash')
    THEN
      v_skipped_students := v_skipped_students + 1;
      CONTINUE;
    END IF;

    v_mr := NULLIF(v_projection->>'mr', '')::NUMERIC;
    v_tfr := NULLIF(v_projection->>'tfr', '')::NUMERIC;
    IF v_mr IS NULL OR v_tfr IS NULL THEN
      v_skipped_students := v_skipped_students + 1;
      CONTINUE;
    END IF;

    v_actor := COALESCE(v_sg.posted_by, v_sg.remarks_set_by, v_class.faculty_id);

    INSERT INTO public.posted_grades (
      posted_grade_id, class_record_id, student_id, grade_period,
      computed_grade, effective_grade, remarks, remarks_note,
      remarks_set_by, remarks_set_at, posted_by, posted_at, is_locked,
      locked_milestones, grading_formula_snapshot, official_source,
      calculation_engine_version, input_snapshot_hash
    ) VALUES (
      gen_random_uuid(), v_sg.class_record_id, v_sg.student_id, 'midterm_rating',
      v_mr, NULL,
      CASE WHEN public.aspire_transmute_grade(v_mr) <= 3.00 THEN 'passed' ELSE 'failed' END::public.grade_remarks,
      'Administrative reconstruction after grading-period sequence hardening; derived from the locked SG score basis.',
      v_actor, CURRENT_TIMESTAMP, v_actor, CURRENT_TIMESTAMP, TRUE,
      CASE WHEN lower(COALESCE(v_class.semester::TEXT, '')) LIKE '%summer%'
        THEN ARRAY['Midterm', 'Midterm Rating']::VARCHAR[]
        ELSE ARRAY['Prelim', 'Midterm', 'Midterm Rating']::VARCHAR[] END,
      v_class.grading_formula_snapshot, 'system_backfill',
      v_projection->>'calculation_engine_version', v_projection->>'input_snapshot_hash'
    ) ON CONFLICT (class_record_id, grade_period, student_id) DO NOTHING;

    INSERT INTO public.posted_grades (
      posted_grade_id, class_record_id, student_id, grade_period,
      computed_grade, effective_grade, remarks, remarks_note,
      remarks_set_by, remarks_set_at, posted_by, posted_at, is_locked,
      locked_milestones, grading_formula_snapshot, official_source,
      calculation_engine_version, input_snapshot_hash
    ) VALUES (
      gen_random_uuid(), v_sg.class_record_id, v_sg.student_id, 'tentative_final_rating',
      v_tfr, NULL,
      CASE WHEN public.aspire_transmute_grade(v_tfr) <= 3.00 THEN 'passed' ELSE 'failed' END::public.grade_remarks,
      'Administrative reconstruction after grading-period sequence hardening; derived from the locked SG score basis.',
      v_actor, CURRENT_TIMESTAMP, v_actor, CURRENT_TIMESTAMP, TRUE,
      CASE WHEN lower(COALESCE(v_class.semester::TEXT, '')) LIKE '%summer%'
        THEN ARRAY['Final', 'Tentative Final Rating']::VARCHAR[]
        ELSE ARRAY['Semi-Final', 'Final', 'Tentative Final Rating']::VARCHAR[] END,
      v_class.grading_formula_snapshot, 'system_backfill',
      v_projection->>'calculation_engine_version', v_projection->>'input_snapshot_hash'
    ) ON CONFLICT (class_record_id, grade_period, student_id) DO NOTHING;

    v_repaired_students := v_repaired_students + 1;
  END LOOP;

  RAISE NOTICE 'Grading-period repair complete. Repaired students: %, skipped for manual review: %.',
    v_repaired_students, v_skipped_students;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_posted_grade_period_sequence()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.grade_period::TEXT = 'tentative_final_rating'
    AND NOT EXISTS (
      SELECT 1 FROM public.posted_grades grade
      WHERE grade.class_record_id = NEW.class_record_id
        AND grade.student_id = NEW.student_id
        AND grade.grade_period::TEXT = 'midterm_rating'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A student Midterm Rating (MR) must exist before TFR can be recorded.';
  END IF;

  IF NEW.grade_period::TEXT = 'semestral_grade'
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.posted_grades grade
        WHERE grade.class_record_id = NEW.class_record_id
          AND grade.student_id = NEW.student_id
          AND grade.grade_period::TEXT = 'midterm_rating'
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.posted_grades grade
        WHERE grade.class_record_id = NEW.class_record_id
          AND grade.student_id = NEW.student_id
          AND grade.grade_period::TEXT = 'tentative_final_rating'
      )
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MR and TFR must exist before a student SG can be recorded.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_posted_grade_period_sequence ON public.posted_grades;
CREATE TRIGGER trg_enforce_posted_grade_period_sequence
BEFORE INSERT OR UPDATE OF class_record_id, student_id, grade_period ON public.posted_grades
FOR EACH ROW EXECUTE FUNCTION public.enforce_posted_grade_period_sequence();

REVOKE ALL ON FUNCTION public.enforce_posted_grade_period_sequence() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.enforce_posted_grade_period_sequence() IS
  'Prevents direct or privileged writes from recording TFR before MR or SG before both prior grading periods.';

COMMIT;

-- Post-migration audit: this must return no rows for a fully repaired database.
SELECT
  sg.class_record_id,
  sg.student_id,
  sg.posted_grade_id AS semestral_grade_id,
  NOT EXISTS (
    SELECT 1 FROM public.posted_grades mr
    WHERE mr.class_record_id = sg.class_record_id
      AND mr.student_id = sg.student_id
      AND mr.grade_period::TEXT = 'midterm_rating'
  ) AS missing_mr,
  NOT EXISTS (
    SELECT 1 FROM public.posted_grades tfr
    WHERE tfr.class_record_id = sg.class_record_id
      AND tfr.student_id = sg.student_id
      AND tfr.grade_period::TEXT = 'tentative_final_rating'
  ) AS missing_tfr
FROM public.posted_grades sg
WHERE sg.grade_period::TEXT = 'semestral_grade'
  AND (
    NOT EXISTS (
      SELECT 1 FROM public.posted_grades mr
      WHERE mr.class_record_id = sg.class_record_id
        AND mr.student_id = sg.student_id
        AND mr.grade_period::TEXT = 'midterm_rating'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.posted_grades tfr
      WHERE tfr.class_record_id = sg.class_record_id
        AND tfr.student_id = sg.student_id
        AND tfr.grade_period::TEXT = 'tentative_final_rating'
    )
  )
ORDER BY sg.class_record_id, sg.student_id;
