-- =============================================================================
-- The student account handover becomes a batch, and reports back
-- =============================================================================
--
-- WHAT THE HANDOVER IS
--   Registrar submits student records -> Admin exports them, creates accounts
--   through Import Users, or returns a record with a reason.
--
--   The table already carries status, rejection_reason, reviewed_by and
--   reviewed_at, and reject_student_account_request() already REFUSES a
--   rejection with no reason. None of that is missing.
--
-- THE THREE GAPS
--
-- 1. THE REGISTRAR IS NEVER TOLD WHAT HAPPENED
--      Both review RPCs write the outcome and stop. A RETURNED record is a
--      student who will never get an account, and the person who submitted them
--      finds out when the student asks why they cannot sign in.
--
--      The Admin side IS told, but through notifyAdminActivity() -- client-side,
--      failure path console.warn. A swallowed dispatch leaves the Registrar
--      reading "submitted successfully" while no Admin was told, and the records
--      sit in pending with each side believing the other has them.
--
-- 2. A HANDOVER HAS NO IDENTITY
--      The Registrar hands over an Excel of forty students and thinks of it as
--      one thing. The system only had forty unrelated rows, so neither side
--      could answer "the forty I sent on Tuesday -- how many are done?", and a
--      per-student notice would have meant forty bells for one event.
--
-- 3. AN IMPORT FAILURE HAD NOWHERE TO GO
--      Import Users validates sections, year levels, emails and duplicates. A
--      row that fails was simply skipped: still pending, with the reason living
--      only in the admin's browser until they navigated away.
--
--      Auto-rejecting those rows was considered and refused. "Rejected" means
--      "this record is wrong, Registrar must fix it". Most import failures are
--      not that -- a missing mailbox, a malformed email the Admin typed, a
--      timeout -- and there is no path from rejected back to pending, so a
--      transient failure would permanently eject a valid student from the queue
--      and send the Registrar to fix a record with nothing wrong in it.
--
--      The record keeps its error and stays pending. The Admin retries, or
--      rejects it properly once they know the record itself is at fault.
--
-- WHY status KEEPS ITS THREE VALUES
--   pending / created / rejected are read by both pages' filters and by the two
--   review RPCs. A fourth value would drop those rows out of every one of them
--   at once -- the shape behind B-01, B-02, B-04 and B-11. "Failed" is not a
--   status; it is a pending row that carries its last error.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. A handover has an identity, a term, and a memory of what went wrong.
-- -----------------------------------------------------------------------------
ALTER TABLE public.student_account_requests
  ADD COLUMN IF NOT EXISTS batch_id UUID,
  ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES public.academic_terms(term_id),
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_student_account_requests_batch
  ON public.student_account_requests(batch_id);

COMMENT ON COLUMN public.student_account_requests.batch_id IS
  'One submit = one batch. What the Registrar recognises as "the file I sent", '
  'and what notifications are grouped by so forty students raise one notice.';
COMMENT ON COLUMN public.student_account_requests.last_error IS
  'Why the last Import Users attempt skipped this row. The row stays pending: '
  'a failed attempt is not a rejected record, and there is no way back from '
  'rejected.';

-- Rows that predate batches are one batch each, so every row has an identity
-- and nothing has to special-case a NULL.
UPDATE public.student_account_requests
SET batch_id = request_id
WHERE batch_id IS NULL;

-- -----------------------------------------------------------------------------
-- 2. A human-readable name for a batch.
--
--    A UUID tells the Registrar nothing. They recognise the day they sent it
--    and how many were in it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_account_batch_label(p_batch_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT format('%s handover of %s student%s',
                to_char(min(r.submitted_at) AT TIME ZONE 'Asia/Manila', 'FMDD FMMon'),
                count(*),
                CASE WHEN count(*) = 1 THEN '' ELSE 's' END)
  FROM public.student_account_requests r
  WHERE r.batch_id = p_batch_id;
$$;

-- -----------------------------------------------------------------------------
-- 2b. The account created must be the student who was handed over.
--
--     Import Users reads every field from the CSV and only afterwards calls
--     mark_student_account_request_created() to link the row. Nothing compared
--     the account against the request, so an Administrator could export a
--     handover, change the name, the ID number, the section or even the role,
--     upload it, and the system would create that different person AND report
--     the Registrar's request as created. The Registrar would be told
--     "Juan Dela Cruz's account is ready" for an account belonging to somebody
--     else.
--
--     The client is being changed to build handover rows from the request
--     rather than from the file, so there is nothing left to tamper with. This
--     is the backstop for a client someone has gone around: the ID number is
--     the institution-wide identifier, so if it does not match, this is not the
--     student who was handed over.
--
--     The request stays pending and keeps the reason, rather than being
--     rejected: a mismatch is a failed attempt, not a record the Registrar got
--     wrong.
-- -----------------------------------------------------------------------------
DO $harden$
DECLARE
  v_def  TEXT;
  v_old  CONSTANT TEXT :=
    '  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = ''P0002'', MESSAGE = ''That account does not exist.'';
  END IF;';
  v_new  CONSTANT TEXT :=
    '  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = ''P0002'', MESSAGE = ''That account does not exist.'';
  END IF;

  -- The account must be the student who was handed over. user_number is the
  -- institution-wide identifier, so a mismatch means this is someone else.
  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.student_account_requests r ON r.request_id = p_request_id
    WHERE u.user_id = p_user_id
      AND BTRIM(u.user_number) = BTRIM(r.user_number)
      AND u.role::TEXT = ''student''
  ) THEN
    UPDATE public.student_account_requests
    SET last_error = ''The account created does not match this record''''s ID number, so it was not linked. Return this record, or create the account from the handover.'',
        last_attempt_at = now()
    WHERE request_id = p_request_id;

    RAISE EXCEPTION USING ERRCODE = ''23514'',
      MESSAGE = ''That account is not the student this record handed over. Create the account from the handover rather than editing the file.'';
  END IF;';
  v_hits INTEGER;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'mark_student_account_request_created';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'mark_student_account_request_created does not exist. Run 20261029085444 first.';
  END IF;

  IF position('is not the student this record handed over' IN v_def) > 0 THEN
    RAISE NOTICE 'The identity check is already in place; nothing to do.';
    RETURN;
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION
      'Expected the account-exists guard exactly once in mark_student_account_request_created, found %.',
      v_hits;
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$harden$;

-- -----------------------------------------------------------------------------
-- 3. Record a failed import attempt. Pending, with its reason.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_student_account_request_failure(
  p_request_id UUID,
  p_error TEXT
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
      MESSAGE = 'Only an active administrator may record an import failure.';
  END IF;

  SELECT status INTO v_status FROM public.student_account_requests
  WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Request not found.';
  END IF;

  -- A record already created or already returned is not waiting on an import.
  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', TRUE, 'ignored', TRUE);
  END IF;

  UPDATE public.student_account_requests
  SET last_error = NULLIF(BTRIM(COALESCE(p_error, '')), ''),
      last_attempt_at = now()
  WHERE request_id = p_request_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.record_student_account_request_failure(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_student_account_request_failure(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Tell the Registrar, by batch.
--
--    TWO notices at most per handover:
--
--      RETURNED   fires as soon as anything is sent back, because that is the
--                 only part the Registrar can act on. Deliberately carries NO
--                 count: a second rejection in the same batch would make a
--                 count stale, and the dedupe key holds it to one per batch per
--                 day. "Open to see which" is true however many there are.
--
--      COMPLETE   fires when the batch has no pending rows left, with the real
--                 figures. One per batch, ever.
--
--    A clean batch raises one notice. A batch with returns raises two. Never
--    one per student.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_notify_registrar_of_account_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_label   TEXT;
  v_pending INTEGER;
  v_created INTEGER;
  v_return  INTEGER;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.submitted_by IS NULL OR NEW.batch_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_label := public.aspire_account_batch_label(NEW.batch_id);

  IF NEW.status = 'rejected' THEN
    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      NEW.submitted_by, 'student_account_request',
      'Student Records Returned to You',
      '/registrar/studentaccountrequests', 'warning',
      format('Records from your %s were returned by the Administrator and have no account. Open the handover to see which, and why, then correct and submit them again.', v_label),
      jsonb_build_object('batch_id', NEW.batch_id, 'request_id', NEW.request_id),
      format('account_batch_returned:%s:%s', NEW.batch_id,
             to_char(now() AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD')),
      FALSE
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  SELECT count(*) FILTER (WHERE status = 'pending'),
         count(*) FILTER (WHERE status = 'created'),
         count(*) FILTER (WHERE status = 'rejected')
    INTO v_pending, v_created, v_return
  FROM public.student_account_requests
  WHERE batch_id = NEW.batch_id;

  IF v_pending = 0 THEN
    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      NEW.submitted_by, 'student_account_request',
      'Student Handover Complete',
      '/registrar/studentaccountrequests',
      CASE WHEN v_return > 0 THEN 'warning' ELSE 'info' END,
      format('Your %s is finished: %s account%s created%s.',
             v_label, v_created, CASE WHEN v_created = 1 THEN '' ELSE 's' END,
             CASE WHEN v_return > 0
                  THEN format(', %s returned for correction', v_return)
                  ELSE '' END),
      jsonb_build_object('batch_id', NEW.batch_id, 'created', v_created, 'returned', v_return),
      format('account_batch_complete:%s', NEW.batch_id),
      FALSE
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_registrar_of_account_review ON public.student_account_requests;
CREATE TRIGGER trg_notify_registrar_of_account_review
  AFTER UPDATE ON public.student_account_requests
  FOR EACH ROW EXECUTE FUNCTION public.aspire_notify_registrar_of_account_review();

-- -----------------------------------------------------------------------------
-- 5. Stamp the batch and the term at submit, and tell Admin inside it.
--
--    Patched from the DEPLOYED definition rather than re-declared from this
--    repo's copy: 20261029040940 rewrites function bodies in place. The
--    assertions make a silent no-op impossible.
-- -----------------------------------------------------------------------------
DO $patch$
DECLARE
  v_def  TEXT;
  v_new  TEXT;
  v_hits INTEGER;
  c_cols CONSTANT TEXT :=
    'department_id, program_id, section_id, submitted_by
    ) VALUES (';
  c_actor CONSTANT TEXT :=
      'v_actor
    );';
  c_ret CONSTANT TEXT :=
    '  RETURN jsonb_build_object(''ok'', TRUE, ''submitted'', v_inserted);';
  c_insert CONSTANT TEXT := '    INSERT INTO public.student_account_requests (';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'submit_student_account_requests';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'submit_student_account_requests does not exist. Run 20261029085444 first.';
  END IF;

  IF position('v_batch_id' IN v_def) > 0 THEN
    RAISE NOTICE 'The submit already stamps a batch; nothing to do.';
    RETURN;
  END IF;

  -- Each anchor must appear exactly once, or the body is not the one this
  -- migration was written against.
  v_hits := (length(v_def) - length(replace(v_def, c_cols, ''))) / length(c_cols);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'Expected the insert column list once, found %.', v_hits;
  END IF;
  v_hits := (length(v_def) - length(replace(v_def, c_actor, ''))) / length(c_actor);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'Expected the insert value list once, found %.', v_hits;
  END IF;
  v_hits := (length(v_def) - length(replace(v_def, c_ret, ''))) / length(c_ret);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'Expected the return statement once, found %.', v_hits;
  END IF;
  v_hits := (length(v_def) - length(replace(v_def, c_insert, ''))) / length(c_insert);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'Expected the insert statement once, found %.', v_hits;
  END IF;

  v_new := v_def;

  -- One batch id and one term for every row of this submit.
  v_new := replace(v_new, 'DECLARE', 'DECLARE
  v_batch_id UUID := gen_random_uuid();
  v_term_id  UUID := (SELECT term_id FROM public.academic_terms WHERE is_active LIMIT 1);');

  -- Year level must agree with the section, checked HERE rather than at import.
  -- Import Users already refuses a mismatch, but by then the Registrar has gone
  -- home and the record comes back days later through the Administrator. The
  -- Registrar is the one who can fix it, and they are standing at the screen.
  --
  -- The year is the digit after the hyphen in the section name -- the same
  -- convention perform_semester_transition promotes on, and the same one
  -- src/lib/subjectCode.js reads for subjects. A name with no such digit is
  -- left alone rather than guessed at.
  v_new := replace(v_new, c_insert,
'    IF NULLIF(BTRIM(COALESCE(v_row->>''year_level'', '''')), '''') IS NOT NULL
       AND NULLIF(v_row->>''section_id'', '''') IS NOT NULL THEN
      DECLARE
        v_section_name TEXT;
        v_section_year TEXT;
      BEGIN
        SELECT s.name INTO v_section_name FROM public.sections s
        WHERE s.section_id = (v_row->>''section_id'')::UUID;

        v_section_year := CASE substring(COALESCE(v_section_name, '''') FROM ''-(\d)'')
          WHEN ''1'' THEN ''1st Year'' WHEN ''2'' THEN ''2nd Year''
          WHEN ''3'' THEN ''3rd Year'' WHEN ''4'' THEN ''4th Year'' ELSE NULL END;

        IF v_section_year IS NOT NULL
           AND BTRIM(v_row->>''year_level'') <> v_section_year THEN
          RAISE EXCEPTION USING ERRCODE = ''23514'',
            MESSAGE = format(''%s is in section %s, which is %s, but the year level says %s. Correct one of them before submitting.'',
                             BTRIM(v_row->>''last_name''), v_section_name,
                             v_section_year, BTRIM(v_row->>''year_level''));
        END IF;
      END;
    END IF;

    INSERT INTO public.student_account_requests (');

  v_new := replace(v_new, c_cols,
    'department_id, program_id, section_id, submitted_by, batch_id, term_id
    ) VALUES (');
  v_new := replace(v_new, c_actor,
      'v_actor, v_batch_id, v_term_id
    );');

  v_new := replace(v_new, c_ret,
'  -- Every active administrator, in the same transaction as the records. This
  -- used to be sent afterwards by notifyAdminActivity(), whose failure path is
  -- console.warn: a swallowed dispatch left the Registrar reading "submitted
  -- successfully" while no Admin had been told.
  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
  )
  SELECT a.user_id, ''student_account_request'',
         ''Student Records Awaiting Account Creation'',
         ''/admin/studentaccountrequests'', ''warning'',
         format(''%s student record(s) were submitted by %s and are waiting for accounts. Create them through Import Users, or return a record with a reason.'',
                v_inserted,
                COALESCE((SELECT BTRIM(u.first_name || '' '' || u.last_name)
                          FROM public.users u WHERE u.user_id = v_actor), ''the Registrar'')),
         jsonb_build_object(''batch_id'', v_batch_id, ''submitted'', v_inserted, ''submitted_by'', v_actor),
         format(''account_batch_submitted:%s'', v_batch_id),
         FALSE
  FROM public.users a
  WHERE a.role::TEXT = ''admin'' AND COALESCE(a.status, ''active'') = ''active''
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(''ok'', TRUE, ''submitted'', v_inserted, ''batch_id'', v_batch_id);');

  EXECUTE v_new;
END
$patch$;

-- -----------------------------------------------------------------------------
-- 6. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_submit TEXT;
  v_review TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_account_requests'
      AND column_name = 'batch_id'
  ) THEN
    RAISE EXCEPTION 'Verification failed: a handover still has no identity.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.student_account_requests WHERE batch_id IS NULL) THEN
    RAISE EXCEPTION 'Verification failed: some rows have no batch, so they would never notify.';
  END IF;

  -- status must keep its three values. A fourth would drop rows out of both
  -- pages' filters and both review RPCs at once.
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid = 'public.student_account_requests'::regclass
        AND pg_get_constraintdef(oid) ILIKE '%status%' LIMIT 1)
     NOT LIKE '%pending%created%rejected%' THEN
    RAISE EXCEPTION 'Verification failed: the status vocabulary changed.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_notify_registrar_of_account_review'
      AND tgrelid = 'public.student_account_requests'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: the Registrar is still not told what the Admin decided.';
  END IF;

  v_review := pg_get_functiondef('public.aspire_notify_registrar_of_account_review()'::regprocedure);

  -- Both outcomes. Notifying only on creation would leave the harmful case --
  -- a returned student with no account -- as silent as it is today.
  IF position('account_batch_returned' IN v_review) = 0
     OR position('account_batch_complete' IN v_review) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a handover outcome would go unreported.';
  END IF;

  -- Routes that exist in src/App.jsx. 20261103093749 shipped /faculty/myclasses,
  -- which does not, and sent three instructors to a 404.
  IF position('/registrar/studentaccountrequests' IN v_review) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the notice links somewhere the Registrar cannot open.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_submit
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'submit_student_account_requests';

  IF position('v_batch_id' IN v_submit) = 0 OR position('v_term_id' IN v_submit) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the submit does not stamp a batch and a term.';
  END IF;
  IF position('/admin/studentaccountrequests' IN v_submit) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the submit does not notify administrators.';
  END IF;

  -- The validations the submit already performs must have survived the patch.
  IF position('already belongs to an existing account' IN v_submit) = 0
     OR position('already in the handover queue' IN v_submit) = 0
     OR position('needs an ID number' IN v_submit) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the submit body did not survive the patch.';
  END IF;

  -- Rejecting without a reason must still be refused at the door.
  IF position('A reason is required when rejecting' IN
       pg_get_functiondef('public.reject_student_account_request(uuid,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a record could be returned with no reason.';
  END IF;

  -- The account linked must be the student handed over. Without this, an edited
  -- export creates a different person and reports the Registrar's record as
  -- created.
  IF position('is not the student this record handed over' IN
       pg_get_functiondef('public.mark_student_account_request_created(uuid,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a handover could be linked to the wrong account.';
  END IF;

  -- Year level and section are reconciled where the Registrar can act on it.
  IF position('Correct one of them before submitting' IN v_submit) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a year level contradicting its section would reach the Administrator.';
  END IF;

  -- A failed import must have somewhere to go that is not 'rejected'.
  IF to_regprocedure('public.record_student_account_request_failure(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: an import failure has nowhere to be recorded.';
  END IF;

  RAISE NOTICE 'Handovers are now batches, and report back in both directions.';
END
$verify$;

COMMIT;
