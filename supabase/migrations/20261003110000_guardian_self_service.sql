-- =============================================================================
-- Student self-service access to their own guardian record.
-- Date: 2026-10-03
--
-- guardians already has RLS enabled (20261001170000) but zero policies, so no
-- authenticated client — including the student themselves — could read or
-- write their own row. This adds:
--   1. A SELECT policy so a student can see whether their own guardian record
--      already exists (needed for the required-field Settings UI / login gate
--      to decide whether to show itself).
--   2. A SECURITY DEFINER RPC, not a raw INSERT/UPDATE policy — same pattern
--      as dispatch_notifications() — so full_name/relationship/email are
--      always validated non-empty server-side, and "one primary guardian per
--      student" is enforced by upserting against the existing
--      guardians_one_primary partial unique index rather than allowing an
--      unbounded number of rows.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS guardians_student_select ON public.guardians;
CREATE POLICY guardians_student_select
  ON public.guardians FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE OR REPLACE FUNCTION public.upsert_primary_guardian(
  p_full_name TEXT,
  p_relationship TEXT,
  p_email TEXT
)
RETURNS public.guardians
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student_id UUID := auth.uid();
  v_row public.guardians;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  IF trim(COALESCE(p_full_name, '')) = ''
     OR trim(COALESCE(p_relationship, '')) = ''
     OR trim(COALESCE(p_email, '')) = ''
     OR p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Guardian name, relationship, and a valid email are all required.';
  END IF;

  INSERT INTO public.guardians (student_id, full_name, relationship, email, is_primary)
  VALUES (v_student_id, trim(p_full_name), trim(p_relationship), trim(lower(p_email)), true)
  ON CONFLICT (student_id) WHERE is_primary
  DO UPDATE SET
    full_name = EXCLUDED.full_name,
    relationship = EXCLUDED.relationship,
    email = EXCLUDED.email
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_primary_guardian(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_primary_guardian(TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
