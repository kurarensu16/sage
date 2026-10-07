-- Server-side audit coverage for user-initiated business-data mutations.
-- Stores identifiers and changed column names only; row values are deliberately excluded.
BEGIN;

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS actor_id UUID,
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS operation TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'application';

CREATE OR REPLACE FUNCTION public.audit_business_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  before_row JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE '{}'::JSONB END;
  after_row JSONB := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE '{}'::JSONB END;
  effective_row JSONB := CASE WHEN TG_OP = 'DELETE' THEN before_row ELSE after_row END;
  actor_id UUID := auth.uid();
  actor_name TEXT;
  actor_role TEXT;
  record_id TEXT;
  changed_fields TEXT;
  operation_label TEXT := CASE TG_OP WHEN 'INSERT' THEN 'Created' WHEN 'UPDATE' THEN 'Updated' ELSE 'Deleted' END;
BEGIN
  -- Edge functions using the service role do not carry auth.uid(). Infer only
  -- explicit actor/owner fields, never a target student/user identifier.
  IF actor_id IS NULL THEN
    actor_id := COALESCE(
      NULLIF(effective_row->>'actor_id', '')::UUID,
      NULLIF(effective_row->>'faculty_id', '')::UUID,
      NULLIF(effective_row->>'resolved_by', '')::UUID,
      NULLIF(effective_row->>'reviewed_by', '')::UUID,
      NULLIF(effective_row->>'created_by', '')::UUID,
      NULLIF(effective_row->>'updated_by', '')::UUID,
      NULLIF(effective_row->>'submitted_by', '')::UUID,
      NULLIF(effective_row->>'requested_by', '')::UUID,
      NULLIF(effective_row->>'approved_by', '')::UUID
    );
  END IF;

  SELECT LEFT(COALESCE(
    NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''),
    NULLIF(u.email, ''),
    actor_id::TEXT,
    'System'
  ), 100), u.role::TEXT
  INTO actor_name, actor_role
  FROM (SELECT actor_id AS id) actor_source
  LEFT JOIN public.users u ON u.user_id = actor_source.id;

  actor_name := COALESCE(actor_name, LEFT(COALESCE(actor_id::TEXT, 'System'), 100));

  record_id := COALESCE(
    effective_row->>'evaluation_id', effective_row->>'posted_grade_id',
    effective_row->>'score_id', effective_row->>'component_score_id',
    effective_row->>'class_record_id', effective_row->>'request_id',
    effective_row->>'referral_id', effective_row->>'consultation_id',
    effective_row->>'join_code_id', effective_row->>'computation_id',
    effective_row->>'activity_id', effective_row->>'enrollment_id',
    effective_row->>'response_id', effective_row->>'notification_id',
    effective_row->>'term_id', effective_row->>'user_id',
    effective_row->>'subject_id', effective_row->>'section_id',
    effective_row->>'department_id', effective_row->>'program_id',
    effective_row->>'id', 'unknown'
  );

  IF TG_OP = 'UPDATE' THEN
    SELECT STRING_AGG(key, ', ' ORDER BY key)
    INTO changed_fields
    FROM JSONB_EACH(after_row) current_value
    WHERE (before_row -> current_value.key) IS DISTINCT FROM current_value.value
      AND current_value.key NOT IN (
        'updated_at', 'last_seen_at', 'password', 'password_hash',
        'token', 'access_token', 'refresh_token', 'private_notes',
        'note_text', 'reason', 'message', 'content', 'snapshot', 'prompt'
      );
  END IF;

  INSERT INTO public.activity_logs (
    actor, action, message, actor_id, actor_role,
    entity_type, entity_id, operation, source
  )
  VALUES (
    actor_name,
    LEFT(operation_label || ' ' || REPLACE(TG_TABLE_NAME, '_', ' '), 50),
    operation_label || ' ' || TG_TABLE_NAME || ' record ' || record_id
      || CASE
        WHEN TG_OP = 'UPDATE' AND COALESCE(changed_fields, '') <> ''
          THEN '. Changed fields: ' || changed_fields || '.'
        WHEN TG_OP = 'UPDATE' THEN '. No auditable business fields changed.'
        ELSE '.'
      END,
    actor_id,
    actor_role,
    TG_TABLE_NAME,
    record_id,
    LOWER(TG_OP),
    'database_trigger'
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_business_mutation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_business_mutation() TO authenticated, service_role;

DO $$
DECLARE
  table_name TEXT;
  audited_tables CONSTANT TEXT[] := ARRAY[
    'users', 'profiles', 'departments', 'programs', 'subjects', 'sections', 'academic_terms',
    'class_records', 'enrollments', 'class_enrollments', 'class_room_join_codes', 'class_join_requests',
    'grade_computations', 'grade_computation_components',
    'draft_scores', 'student_term_scores', 'student_term_details', 'student_component_scores',
    'class_activities', 'student_activity_scores', 'posted_grades', 'grade_change_requests',
    'attendance_logs', 'attendance_records',
    'evaluation_forms', 'evaluation_criteria', 'evaluation_windows',
    'evaluation_responses', 'evaluation_ratings', 'evaluation_comments',
    'consultation_requests', 'student_consultation_requests', 'remark_override_requests',
    'student_risk_evaluations', 'student_risk_private_notes',
    'student_evaluation_referrals', 'student_evaluation_referral_requests',
    'faculty_intervention_drafts', 'student_academic_insights', 'faculty_performance_insights',
    'ai_counseling_logs', 'clearance_records', 'guardian_contacts', 'guardians',
    'notification_preferences'
  ];
BEGIN
  FOREACH table_name IN ARRAY audited_tables LOOP
    IF TO_REGCLASS('public.' || table_name) IS NOT NULL THEN
      EXECUTE FORMAT('DROP TRIGGER IF EXISTS audit_business_mutation_trigger ON public.%I', table_name);
      EXECUTE FORMAT(
        'CREATE TRIGGER audit_business_mutation_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION public.audit_business_mutation()',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

COMMIT;
