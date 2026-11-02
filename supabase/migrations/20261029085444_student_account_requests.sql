-- =============================================================================
-- ASPIRE: STUDENT ACCOUNT REQUEST QUEUE (Registrar -> Admin handoff)
-- =============================================================================
-- Replaces the Registrar "Import Students" page, which was removed.
--
-- WHY THE PREVIOUS DESIGN WAS WRONG
--   Import Students let the Registrar assign a home section to students who
--   already had accounts. That was redundant -- Admin's Import Users already
--   requires a section for every student and validates it against the college
--   and the active term -- and it was weaker, because it did not re-check those
--   rules. Two write paths to the same column, one of them laxer, is how data
--   drifts.
--
-- WHAT REPLACES IT
--   A one-directional handoff that matches who owns what. Registrar owns which
--   students exist, from institutional records; Admin owns accounts and
--   provisions the real mailbox in Outlook, which the system cannot do and must
--   not guess at.
--
--     1. Registrar fills the template from institutional records and uploads it.
--        Rows land here as 'pending'.
--     2. Admin reviews the queue and exports it in Import Users' exact column
--        format, with Email blank and a RequestID column carried along.
--     3. Admin creates the mailboxes in Outlook and fills the Email column.
--     4. Admin uploads through the EXISTING Import Users page. That remains the
--        single account-creation path and the single place section, college and
--        year level are validated. The RequestID column is what lets each
--        created account flip its queue row to 'created' instead of the queue
--        having to guess by matching names.
--
--   No account is ever created from this table directly. It is an inbox, not a
--   second creator.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.student_account_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  -- REQUIRED. The ID number is the institution-wide unique identifier across
  -- students and both teaching and non-teaching personnel, so the registrar
  -- always supplies it from institutional records rather than letting the
  -- system generate one that would not match the official record.
  user_number TEXT NOT NULL,
  year_level TEXT,
  department_id UUID REFERENCES public.departments(department_id),
  program_id UUID REFERENCES public.programs(program_id),
  section_id UUID REFERENCES public.sections(section_id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'created', 'rejected')),
  rejection_reason TEXT,
  submitted_by UUID NOT NULL REFERENCES public.users(user_id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES public.users(user_id),
  reviewed_at TIMESTAMPTZ,
  created_user_id UUID REFERENCES public.users(user_id)
);

COMMENT ON TABLE public.student_account_requests IS
  'Registrar-to-Admin handoff queue for new students. Not an account source: '
  'accounts are created only through Import Users, which validates section, '
  'college and year level. A row links to its account via created_user_id.';

CREATE INDEX IF NOT EXISTS idx_student_account_requests_status
  ON public.student_account_requests(status);

ALTER TABLE public.student_account_requests ENABLE ROW LEVEL SECURITY;

-- Both roles need to see the queue: the registrar to track what they handed
-- over, the admin to work it. Neither writes directly -- every mutation below
-- goes through a SECURITY DEFINER RPC that re-checks the caller's role.
DROP POLICY IF EXISTS student_account_requests_select ON public.student_account_requests;
CREATE POLICY student_account_requests_select ON public.student_account_requests
  FOR SELECT TO authenticated
  USING (public.is_active_registrar() OR public.is_active_admin());

REVOKE INSERT, UPDATE, DELETE ON public.student_account_requests FROM authenticated;
REVOKE ALL ON public.student_account_requests FROM anon;

-- -----------------------------------------------------------------------------
-- Registrar submits a batch
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_student_account_requests(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_row JSONB;
  v_inserted INTEGER := 0;
BEGIN
  IF NOT public.is_active_registrar() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an active registrar may submit student records.';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A non-empty array of rows is required.';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    IF NULLIF(BTRIM(COALESCE(v_row->>'last_name', '')), '') IS NULL
      OR NULLIF(BTRIM(COALESCE(v_row->>'first_name', '')), '') IS NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Every row needs a last name and a first name.';
    END IF;

    IF NULLIF(BTRIM(COALESCE(v_row->>'user_number', '')), '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Every row needs an ID number. It is the institution-wide unique identifier.';
    END IF;

    -- The ID is unique across every person in the institution, so a clash with
    -- an existing account or an already-queued record is caught at submit time
    -- rather than surfacing much later as a failed import.
    IF EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_number = BTRIM(v_row->>'user_number')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = format('ID number %s already belongs to an existing account.',
                         BTRIM(v_row->>'user_number'));
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.student_account_requests r
      WHERE r.user_number = BTRIM(v_row->>'user_number')
        AND r.status <> 'rejected'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = format('ID number %s is already in the handover queue.',
                         BTRIM(v_row->>'user_number'));
    END IF;

    INSERT INTO public.student_account_requests (
      last_name, first_name, middle_name, user_number, year_level,
      department_id, program_id, section_id, submitted_by
    ) VALUES (
      BTRIM(v_row->>'last_name'),
      BTRIM(v_row->>'first_name'),
      NULLIF(BTRIM(COALESCE(v_row->>'middle_name', '')), ''),
      BTRIM(v_row->>'user_number'),
      NULLIF(BTRIM(COALESCE(v_row->>'year_level', '')), ''),
      NULLIF(v_row->>'department_id', '')::UUID,
      NULLIF(v_row->>'program_id', '')::UUID,
      NULLIF(v_row->>'section_id', '')::UUID,
      v_actor
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', TRUE, 'submitted', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_student_account_requests(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_student_account_requests(JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- Admin rejects a row back to the registrar
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_student_account_request(
  p_request_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an active administrator may reject a student record.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    -- A rejection the registrar cannot act on just bounces back again.
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A reason is required when rejecting.';
  END IF;

  SELECT status INTO v_status FROM public.student_account_requests
  WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Request not found.';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Only a pending record may be rejected.';
  END IF;

  UPDATE public.student_account_requests
  SET status = 'rejected',
      rejection_reason = BTRIM(p_reason),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE request_id = p_request_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_student_account_request(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_student_account_request(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Import Users links a created account back to its request
-- -----------------------------------------------------------------------------
-- Called by the existing import flow when the uploaded file carries a RequestID
-- column. This is the only thing that moves a row to 'created', so the queue
-- reflects accounts that genuinely exist rather than ones someone believes were
-- made.
CREATE OR REPLACE FUNCTION public.mark_student_account_request_created(
  p_request_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an active administrator may complete a student record.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That account does not exist.';
  END IF;

  SELECT status INTO v_status FROM public.student_account_requests
  WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Request not found.';
  END IF;
  -- Idempotent: re-importing the same file must not fail or relink.
  IF v_status = 'created' THEN
    RETURN jsonb_build_object('ok', TRUE, 'already_created', TRUE);
  END IF;

  UPDATE public.student_account_requests
  SET status = 'created',
      created_user_id = p_user_id,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = NULL
  WHERE request_id = p_request_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_student_account_request_created(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_student_account_request_created(UUID, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Post-conditions
-- -----------------------------------------------------------------------------
DO $verify$
BEGIN
  IF to_regclass('public.student_account_requests') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: student_account_requests was not created.';
  END IF;

  IF to_regprocedure('public.submit_student_account_requests(jsonb)') IS NULL
    OR to_regprocedure('public.reject_student_account_request(uuid,text)') IS NULL
    OR to_regprocedure('public.mark_student_account_request_created(uuid,uuid)') IS NULL
  THEN
    RAISE EXCEPTION 'Verification failed: one or more queue RPCs are missing.';
  END IF;

  -- The table must stay read-only to clients; all writes go through the RPCs.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'student_account_requests'
      AND cmd <> 'SELECT'
  ) THEN
    RAISE EXCEPTION
      'Verification failed: student_account_requests has a write policy. Writes '
      'must go only through the submit/reject/mark RPCs.';
  END IF;

  RAISE NOTICE 'Student account request queue verified.';
END
$verify$;

COMMIT;
