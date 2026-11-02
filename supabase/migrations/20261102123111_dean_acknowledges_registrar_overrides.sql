-- =============================================================================
-- A Registrar's override is effective at once, and not finished until the
-- Dean has acknowledged it
-- =============================================================================
--
-- THE GAP
--   Every other path that changes an official grade in ASPIRE needs two
--   distinct people. The request chain needs four hands. Even the late route --
--   a request that outlived the dispute window -- runs student -> faculty ->
--   Dean -> Registrar, so a Dean has already decided before the Registrar acts.
--
--   Grade Override is the only single-actor write to a posted grade. One
--   person, one form, immediate effect. apply_admin_grade_override_v3 already
--   notifies the student and the assigned faculty, and nobody else. The Dean of
--   the college that owns the section -- the only person who knows the student,
--   the instructor and whether the new figure is plausible -- was never told.
--
--   The owner's words, 2026-11-02: "it can be biased if only the registrar can
--   edit the grade, and there is no knowledge from a specific college on where
--   the student is."
--
-- ACKNOWLEDGEMENT IS A RECORD, NOT A GATE
--   The grade changes the moment the Registrar commits it, and a Dean who
--   disagrees does not reverse it. Making the Dean a veto would remove the
--   Registrar's authority, and would make the override -- which exists for when
--   the normal chain CANNOT run -- depend on someone being available. A
--   department between Deans would deadlock the one mechanism meant never to.
--
--   So a Dean does one of two things, and the grade stands either way:
--     acknowledged  -- seen, and not objected to
--     queried       -- seen, and objected to, permanently, in the record
--
--   That is the difference between "the Dean was notified" and "the Dean saw
--   it", which are very different claims to stand behind if a grade is ever
--   questioned later. An unread notification is indistinguishable from no
--   notification at all.
--
-- WHY A TRIGGER AND NOT A PATCH TO THE RPC
--   apply_admin_grade_override_v3 is 180 lines and has already been rewritten
--   in place once, by 20261029040940's live-definition substitution. Every
--   override records a row here, so the row's arrival is the event worth
--   hanging this on. Nothing can commit an override without the Dean being
--   told, including a future second override path.
--
-- WHY 'office' IS NOT USED
--   The owner said "the Dean's office". There is a vestigial `office` role: it
--   survives in the users CHECK constraint and three RLS enumerations, and has
--   no portal, no route and no client code at all -- the College Office was
--   discarded. Notifications routed there would be unreadable. The recipient is
--   the active dean of the section's department, via the same rule
--   is_authorized_dean_for_class() uses everywhere else.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The acknowledgement lives on the operation row.
--
--    Not a new table: the operation IS the record of the override, and the
--    acknowledgement is a property of it. A second table would split one event
--    across two stores and invite them to disagree.
-- -----------------------------------------------------------------------------
ALTER TABLE public.admin_grade_override_operations
  ADD COLUMN IF NOT EXISTS acknowledgement_state TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES public.users(user_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledgement_note TEXT;

ALTER TABLE public.admin_grade_override_operations
  DROP CONSTRAINT IF EXISTS admin_grade_override_operations_ack_state_check;
ALTER TABLE public.admin_grade_override_operations
  ADD CONSTRAINT admin_grade_override_operations_ack_state_check
  CHECK (acknowledgement_state IN ('pending', 'acknowledged', 'queried'));

-- A decided acknowledgement must say who and when. A 'queried' one must also
-- say why: an objection with no reason is not reviewable by anyone later.
ALTER TABLE public.admin_grade_override_operations
  DROP CONSTRAINT IF EXISTS admin_grade_override_operations_ack_complete_check;
ALTER TABLE public.admin_grade_override_operations
  ADD CONSTRAINT admin_grade_override_operations_ack_complete_check
  CHECK (
    (acknowledgement_state = 'pending'
      AND acknowledged_by IS NULL AND acknowledged_at IS NULL)
    OR (acknowledgement_state = 'acknowledged'
      AND acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL)
    OR (acknowledgement_state = 'queried'
      AND acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL
      AND BTRIM(COALESCE(acknowledgement_note, '')) <> '')
  );

-- The outstanding count is read on every load of two screens.
CREATE INDEX IF NOT EXISTS admin_grade_override_operations_pending_ack
  ON public.admin_grade_override_operations (acknowledgement_state)
  WHERE acknowledgement_state = 'pending';

-- -----------------------------------------------------------------------------
-- 2. The Dean must be able to read the operation they are acknowledging.
--
--    The existing policy allowed the actor and the admin only, which is why
--    this needs widening and not merely a notification: a notice linking to a
--    row the recipient cannot SELECT is a dead end, and -- as B-11 showed --
--    RLS hides it as absence rather than as refusal.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS admin_grade_override_operations_authorized_select ON public.admin_grade_override_operations;
CREATE POLICY admin_grade_override_operations_authorized_select
ON public.admin_grade_override_operations FOR SELECT TO authenticated
USING (
  actor_id = auth.uid()
  OR public.is_active_admin()
  OR public.is_active_registrar()
  OR EXISTS (
    SELECT 1
    FROM public.posted_grades grade
    WHERE grade.posted_grade_id = admin_grade_override_operations.posted_grade_id
      AND public.is_authorized_dean_for_class(grade.class_record_id)
  )
);

-- -----------------------------------------------------------------------------
-- 3. Tell the Dean, with the comparison rather than the bare fact.
--
--    "A grade was changed" is unusable: the Dean's job here is to judge whether
--    the new figure is plausible for a student they know, which needs the
--    before and the after side by side, the instructor, and the reason. The
--    payload carries all of it so the screen never has to re-derive it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_notify_dean_of_override()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_grade         public.posted_grades%ROWTYPE;
  v_dean          UUID;
  v_student_name  TEXT;
  v_subject_code  TEXT;
  v_section_name  TEXT;
  v_faculty_name  TEXT;
  v_actor_name    TEXT;
  v_open_request  TEXT;
BEGIN
  SELECT * INTO v_grade FROM public.posted_grades
  WHERE posted_grade_id = NEW.posted_grade_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT BTRIM(COALESCE(student.last_name, '') || ', ' || COALESCE(student.first_name, ''))
  INTO v_student_name
  FROM public.users student WHERE student.user_id = v_grade.student_id;

  SELECT subject.code, section.name,
         BTRIM(COALESCE(faculty.first_name, '') || ' ' || COALESCE(faculty.last_name, ''))
  INTO v_subject_code, v_section_name, v_faculty_name
  FROM public.class_records class_record
  LEFT JOIN public.subjects subject ON subject.subject_id = class_record.subject_id
  LEFT JOIN public.sections section ON section.section_id = class_record.section_id
  LEFT JOIN public.users faculty ON faculty.user_id = class_record.faculty_id
  WHERE class_record.class_record_id = v_grade.class_record_id;

  SELECT BTRIM(COALESCE(actor.first_name, '') || ' ' || COALESCE(actor.last_name, ''))
  INTO v_actor_name
  FROM public.users actor WHERE actor.user_id = NEW.actor_id;

  -- The Dean's real question is "why wasn't the normal chain used", so the
  -- answer travels with the notice instead of being left to inference.
  SELECT request.status::TEXT INTO v_open_request
  FROM public.remark_override_requests request
  WHERE request.posted_grade_id = NEW.posted_grade_id
  ORDER BY request.requested_at DESC NULLS LAST
  LIMIT 1;

  -- Every active dean of the owning department, because a department may have
  -- more than one and an acknowledgement nobody received is the failure mode
  -- this whole migration exists to prevent.
  FOR v_dean IN
    SELECT actor.user_id
    FROM public.users actor
    JOIN public.class_records class_record
      ON class_record.class_record_id = v_grade.class_record_id
    JOIN public.sections section
      ON section.section_id = class_record.section_id
    WHERE actor.role::TEXT = 'dean'
      AND COALESCE(actor.status::TEXT, 'active') = 'active'
      AND actor.department_id = section.department_id
  LOOP
    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      v_dean, 'override_review', 'Grade Override Needs Your Acknowledgement',
      '/dean/gradeoverrides', 'warning',
      FORMAT('The Registrar replaced %s''s official grade in %s. The change is already in effect. Review it and acknowledge.',
        COALESCE(NULLIF(v_student_name, ', '), 'a student'),
        COALESCE(v_subject_code, 'a subject')),
      jsonb_build_object(
        'operation_id', NEW.operation_id,
        'posted_grade_id', NEW.posted_grade_id,
        'class_record_id', v_grade.class_record_id,
        'student_id', v_grade.student_id,
        'student_name', NULLIF(v_student_name, ', '),
        'subject_code', v_subject_code,
        'section_name', v_section_name,
        'faculty_name', NULLIF(v_faculty_name, ''),
        'actor_name', NULLIF(v_actor_name, ''),
        'previous_computed_grade', NEW.result->'previous_computed_grade',
        'previous_effective_grade', NEW.result->'previous_effective_grade',
        'previous_remark', NEW.result->'previous_remark',
        'new_computed_grade', NEW.result->'new_computed_grade',
        'new_effective_grade', NEW.result->'new_effective_grade',
        'new_remark', NEW.result->'new_remark',
        'related_request_status', v_open_request
      ),
      FORMAT('override_review:%s:%s', NEW.operation_id, v_dean),
      FALSE
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_dean_of_override ON public.admin_grade_override_operations;
CREATE TRIGGER trg_notify_dean_of_override
  AFTER INSERT ON public.admin_grade_override_operations
  FOR EACH ROW EXECUTE FUNCTION public.aspire_notify_dean_of_override();

-- -----------------------------------------------------------------------------
-- 4. The Dean records their decision.
--
--    Deliberately NOT reversible and NOT re-decidable: an acknowledgement that
--    can be withdrawn is not a record of anything. A Dean who changes their
--    mind raises it with the Registrar, which leaves its own trail.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acknowledge_grade_override(
  p_operation_id UUID,
  p_state TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation public.admin_grade_override_operations%ROWTYPE;
  v_grade     public.posted_grades%ROWTYPE;
  v_note      TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
  v_dean_name TEXT;
BEGIN
  IF p_state NOT IN ('acknowledged', 'queried') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'An override is either acknowledged or queried.';
  END IF;

  SELECT * INTO v_operation FROM public.admin_grade_override_operations
  WHERE operation_id = p_operation_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That override could not be found.';
  END IF;

  SELECT * INTO v_grade FROM public.posted_grades
  WHERE posted_grade_id = v_operation.posted_grade_id;

  IF NOT public.is_authorized_dean_for_class(v_grade.class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the Dean of the college that owns this section may acknowledge this override.';
  END IF;

  IF v_operation.acknowledgement_state <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = FORMAT('This override was already %s and cannot be decided again.',
        v_operation.acknowledgement_state);
  END IF;

  IF p_state = 'queried' AND v_note IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'A queried override needs a written reason, or nobody can act on the objection.';
  END IF;

  UPDATE public.admin_grade_override_operations
  SET acknowledgement_state = p_state,
      acknowledged_by = auth.uid(),
      acknowledged_at = CURRENT_TIMESTAMP,
      acknowledgement_note = v_note
  WHERE operation_id = p_operation_id;

  SELECT BTRIM(COALESCE(dean.first_name, '') || ' ' || COALESCE(dean.last_name, ''))
  INTO v_dean_name FROM public.users dean WHERE dean.user_id = auth.uid();

  -- The Registrar hears back either way. A query that only sat in a column
  -- would be an objection the person who acted on it never learns about.
  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
  ) VALUES (
    v_operation.actor_id,
    CASE WHEN p_state = 'queried' THEN 'override_queried' ELSE 'override_acknowledged' END,
    CASE WHEN p_state = 'queried' THEN 'Grade Override Queried by the Dean'
         ELSE 'Grade Override Acknowledged' END,
    '/registrar/gradeoverride',
    CASE WHEN p_state = 'queried' THEN 'critical' ELSE 'info' END,
    CASE WHEN p_state = 'queried'
      THEN FORMAT('%s queried your grade override. The grade is unchanged. Reason: %s',
             COALESCE(NULLIF(v_dean_name, ''), 'The Dean'), v_note)
      ELSE FORMAT('%s acknowledged your grade override.',
             COALESCE(NULLIF(v_dean_name, ''), 'The Dean')) END,
    jsonb_build_object(
      'operation_id', p_operation_id,
      'posted_grade_id', v_operation.posted_grade_id,
      'class_record_id', v_grade.class_record_id,
      'state', p_state,
      'note', v_note
    ),
    FORMAT('override_decision:%s', p_operation_id),
    FALSE
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'operation_id', p_operation_id,
    'acknowledgement_state', p_state,
    'acknowledged_at', CURRENT_TIMESTAMP,
    'note', v_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_grade_override(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_grade_override(UUID, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_policy TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_grade_override_operations'
      AND column_name = 'acknowledgement_state'
  ) THEN
    RAISE EXCEPTION 'Verification failed: the acknowledgement columns were not added.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_notify_dean_of_override'
      AND tgrelid = 'public.admin_grade_override_operations'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: the Dean is still not told about an override.';
  END IF;

  IF to_regprocedure('public.acknowledge_grade_override(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the acknowledgement RPC was not created.';
  END IF;

  SELECT pg_get_expr(polqual, polrelid) INTO v_policy
  FROM pg_policy
  WHERE polname = 'admin_grade_override_operations_authorized_select'
    AND polrelid = 'public.admin_grade_override_operations'::regclass;

  IF position('is_authorized_dean_for_class' IN COALESCE(v_policy, '')) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the Dean cannot read the override they are asked to acknowledge.';
  END IF;

  -- The actor arm must survive, or a Registrar loses sight of their own work.
  IF position('actor_id' IN COALESCE(v_policy, '')) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the actor arm was dropped from the select policy.';
  END IF;

  -- A queried override with no reason must be impossible, not merely
  -- discouraged. Asserted from the catalog rather than by attempting an insert:
  -- a test row here would need a real posted_grade_id and a real actor, and a
  -- verification step that writes to an audited table to prove a point is a
  -- worse idea than reading the constraint back.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_grade_override_operations_ack_complete_check'
      AND conrelid = 'public.admin_grade_override_operations'::regclass
      AND pg_get_constraintdef(oid) LIKE '%acknowledgement_note%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: a queried override could be recorded with no reason.';
  END IF;

  RAISE NOTICE 'A Registrar override now reaches the Dean, and is not finished until acknowledged.';
END
$verify$;

COMMIT;
