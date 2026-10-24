-- =============================================================================
-- ASPIRE SEMANTIC GRADE AUDIT EVENTS
-- =============================================================================
-- The generic mutation trigger correctly preserves entity IDs and changed
-- fields, but its visible wording exposes table names and does not identify the
-- academic workflow. Normalize grade-related trigger entries before insertion
-- while retaining entity_id as non-visual audit evidence.

BEGIN;

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
        SELECT request.status
        INTO v_request_status
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

DROP TRIGGER IF EXISTS trg_normalize_semantic_grade_audit_event ON public.activity_logs;
CREATE TRIGGER trg_normalize_semantic_grade_audit_event
BEFORE INSERT ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.normalize_semantic_grade_audit_event();

REVOKE ALL ON FUNCTION public.normalize_semantic_grade_audit_event() FROM PUBLIC, anon, authenticated;

COMMIT;
