-- Keep the audit ledger meaningful and bounded. A faculty score-sheet save is
-- already recorded once by the application, so do not add one trigger row for
-- every score record it inserts, updates, or deletes.

BEGIN;

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

    -- Technical timestamp refreshes are not business events.
    IF COALESCE(changed_fields, '') = '' THEN
      RETURN NEW;
    END IF;
  END IF;

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

  INSERT INTO public.activity_logs (
    actor, action, message, actor_id, actor_role,
    entity_type, entity_id, operation, source
  )
  VALUES (
    actor_name,
    LEFT(operation_label || ' ' || REPLACE(TG_TABLE_NAME, '_', ' '), 50),
    operation_label || ' ' || TG_TABLE_NAME || ' record ' || record_id
      || CASE WHEN TG_OP = 'UPDATE' THEN '. Changed fields: ' || changed_fields || '.' ELSE '.' END,
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

-- Score rows are numerous implementation records. Each completed faculty save
-- is logged once as an application-level "Score Batch Save" event instead.
DO $$
DECLARE
  score_table TEXT;
BEGIN
  FOREACH score_table IN ARRAY ARRAY[
    'draft_scores',
    'student_term_scores',
    'student_term_details',
    'student_component_scores',
    'student_activity_scores'
  ]
  LOOP
    IF TO_REGCLASS('public.' || score_table) IS NOT NULL THEN
      EXECUTE FORMAT(
        'DROP TRIGGER IF EXISTS audit_business_mutation_trigger ON public.%I',
        score_table
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_business_mutation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_business_mutation() TO authenticated, service_role;

COMMIT;
