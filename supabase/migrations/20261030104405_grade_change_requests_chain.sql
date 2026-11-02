-- =============================================================================
-- Phase 6a — Grade change requests: the chain
-- =============================================================================
-- Date: 2026-10-30
-- Plan: docs/03-development/audits/GRADE_CHANGE_REQUEST_WORKFLOW_PLAN_2026-10-28.md
--
-- A student disputes a FINALIZED grade; the instructor validates; the Dean
-- decides; the instructor applies the correction. A request that outlives the
-- dispute window needs the Registrar's authorisation first, because by then the
-- term's records are settled and those are the Registrar's.
--
--   pending_faculty_review
--        -> pending_dean_review        (instructor forwards)
--        -> rejected                   (instructor: not applicable)
--   pending_dean_review
--        -> approved                   (Dean approves, inside the window)
--        -> pending_registrar_review   (Dean approves, window has closed)
--        -> rejected
--   pending_registrar_review
--        -> approved / rejected        (Registrar authorises or refuses)
--   approved -> applied                (instructor makes the correction: 6b)
--
-- WHAT THIS MIGRATION DOES NOT DO
-- It does not apply corrections. milestone_correction_targets(),
-- preview_milestone_correction() and apply_approved_milestone_correction() are
-- in Phase 6b, deliberately separate: those write grades, and that deserves its
-- own reading rather than being buried in a thousand lines of workflow.
--
-- SEPARATE SUBMISSION RPC, NOT AN EXTENSION OF THE SG ONE
-- submit_sg_correction_request takes a proposed remark, a proposed effective
-- grade and proposed score changes. A student must never be able to supply any
-- of those -- a dispute says "this looks wrong, here is why", not "set my grade
-- to 1.25". Keeping the student path on its own function makes that refusal the
-- signature rather than a branch somebody can later forget to guard. (Extending
-- the existing one would also have created an overload, not a replacement.)
--
-- NOTIFICATIONS ARE IN-APP ONLY HERE
-- Every step notifies everyone concerned, as agreed. Email fan-out is currently
-- scoped to grade_posted / grade_changed, so these do not send mail. Widening
-- that is a deliberate separate decision: it changes how much Gmail SMTP this
-- project uses, and the daily cap is real.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. What a request now records
-- -----------------------------------------------------------------------------
ALTER TABLE public.remark_override_requests
  ADD COLUMN IF NOT EXISTS reason_type VARCHAR(30)
    CHECK (reason_type IN ('computation_error', 'missing_or_incorrect_score', 'technical_issue', 'other')),
  ADD COLUMN IF NOT EXISTS reason_detail TEXT,
  ADD COLUMN IF NOT EXISTS grade_period VARCHAR(30),
  ADD COLUMN IF NOT EXISTS submitted_by_role VARCHAR(10) DEFAULT 'faculty'
    CHECK (submitted_by_role IN ('student', 'faculty')),
  ADD COLUMN IF NOT EXISTS faculty_note TEXT,
  ADD COLUMN IF NOT EXISTS registrar_note TEXT,
  -- Set when the Dean approves a request that has outlived the window. Stored
  -- rather than recomputed, because the answer must not change later if someone
  -- edits a term's grace period.
  ADD COLUMN IF NOT EXISTS requires_registrar BOOLEAN NOT NULL DEFAULT FALSE;

-- The chain's new waiting states, alongside the ones the older faculty-raised
-- SG flow still uses.
ALTER TABLE public.remark_override_requests
  DROP CONSTRAINT IF EXISTS remark_override_requests_status_check;
ALTER TABLE public.remark_override_requests
  ADD CONSTRAINT remark_override_requests_status_check
  CHECK (status IN (
    'pending', 'approved', 'rejected', 'applied', 'cancelled',
    'pending_faculty_review', 'pending_dean_review', 'pending_registrar_review'
  ));

-- One open dispute per posted grade. A student cannot stack a second complaint
-- on a milestone while one is already being reviewed.
DROP INDEX IF EXISTS idx_one_open_student_request_per_grade;
CREATE UNIQUE INDEX idx_one_open_student_request_per_grade
  ON public.remark_override_requests (posted_grade_id)
  WHERE submitted_by_role = 'student'
    AND status IN ('pending_faculty_review', 'pending_dean_review', 'pending_registrar_review');

CREATE INDEX IF NOT EXISTS idx_requests_status_period
  ON public.remark_override_requests (status, grade_period);

-- -----------------------------------------------------------------------------
-- 2. The dispute window: 30 school days from the term rollover
-- -----------------------------------------------------------------------------
ALTER TABLE public.academic_terms
  ADD COLUMN IF NOT EXISTS dispute_grace_days INTEGER NOT NULL DEFAULT 30;

ALTER TABLE public.academic_terms
  DROP CONSTRAINT IF EXISTS academic_terms_dispute_grace_days_range;
ALTER TABLE public.academic_terms
  ADD CONSTRAINT academic_terms_dispute_grace_days_range
  CHECK (dispute_grace_days BETWEEN 0 AND 180);

-- School days counted as Monday to Friday.
--
-- HONEST LIMITATION: this system has no academic calendar, so a public holiday
-- or a semestral break counts as a school day. Counting weekdays is the closest
-- the database can get without a holidays table somebody has to maintain -- and
-- an unmaintained calendar would silently be worse than this.
CREATE OR REPLACE FUNCTION public.aspire_add_school_days(
  p_from TIMESTAMPTZ,
  p_days INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from IS NULL THEN NULL
    WHEN COALESCE(p_days, 0) <= 0 THEN p_from
    ELSE (
      SELECT max(d)
      FROM (
        SELECT d
        FROM generate_series(
          p_from + INTERVAL '1 day',
          p_from + ((p_days * 2) + 14) * INTERVAL '1 day',
          INTERVAL '1 day'
        ) AS d
        WHERE EXTRACT(ISODOW FROM d) < 6     -- 6 = Saturday, 7 = Sunday
        ORDER BY d
        LIMIT p_days
      ) weekdays
    )
  END;
$$;

-- NULL means the term has not ended, so nothing has started counting yet and
-- the dispute is simply in time.
CREATE OR REPLACE FUNCTION public.aspire_dispute_deadline(p_class_record_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.aspire_add_school_days(t.ended_at, t.dispute_grace_days)
  FROM public.class_records c
  LEFT JOIN public.academic_terms t
    ON t.term_id = c.term_id
    OR (c.term_id IS NULL AND t.school_year = c.school_year AND t.semester::TEXT = c.semester::TEXT)
  WHERE c.class_record_id = p_class_record_id
  ORDER BY (t.term_id = c.term_id) DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.aspire_dispute_window_open(p_class_record_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.aspire_dispute_deadline(p_class_record_id) >= CURRENT_TIMESTAMP, TRUE);
$$;

REVOKE ALL ON FUNCTION public.aspire_dispute_deadline(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aspire_dispute_window_open(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_dispute_deadline(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aspire_dispute_window_open(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Evidence
-- -----------------------------------------------------------------------------
-- One row per attachment, one to three per request. A separate table rather
-- than a column because a dispute genuinely needs more than one file -- the
-- front and back of a paper, or an activity sheet beside the class record --
-- and because per-file questions (who added which, when, remove just that one)
-- are the ones that actually come up.
CREATE TABLE IF NOT EXISTS public.grade_change_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.remark_override_requests(request_id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  -- Which store holds it. Supabase Storage today, Cloudflare R2 later; recording
  -- it per file is what makes that move additive instead of stranding
  -- everything uploaded before the switch.
  storage TEXT NOT NULL DEFAULT 'supabase' CHECK (storage IN ('supabase', 'r2')),
  content_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, object_key)
);

CREATE INDEX IF NOT EXISTS idx_grade_change_evidence_request
  ON public.grade_change_evidence (request_id);

ALTER TABLE public.grade_change_evidence ENABLE ROW LEVEL SECURITY;

-- Whoever may read the request may read its evidence. Stated once here rather
-- than repeated, so the two can never diverge.
DROP POLICY IF EXISTS grade_change_evidence_select ON public.grade_change_evidence;
CREATE POLICY grade_change_evidence_select ON public.grade_change_evidence
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.remark_override_requests r
      WHERE r.request_id = grade_change_evidence.request_id
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.grade_change_evidence FROM authenticated;
REVOKE ALL ON public.grade_change_evidence FROM anon;

-- The bucket. Private, 5 MB, and only the formats the system can actually
-- display to a reviewer.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'grade-evidence', 'grade-evidence', FALSE, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- 4. Who can see a request
-- -----------------------------------------------------------------------------
-- Owner's decision, 2026-10-29: a student sees their own disputes at every
-- stage, and a correction their instructor raised about them ONLY once it is
-- resolved. They have a right to know their grade changed and why; they do not
-- need to watch an instructor's review unfold, which would invite pressure on a
-- process that should be unhurried.
DROP POLICY IF EXISTS remark_override_requests_authorized_select ON public.remark_override_requests;
CREATE POLICY remark_override_requests_authorized_select
ON public.remark_override_requests FOR SELECT TO authenticated
USING (
  requested_by = auth.uid()
  OR (
    student_id = auth.uid()
    AND status IN ('approved', 'rejected', 'applied')
  )
  OR public.is_assigned_faculty(class_record_id)
  OR public.is_authorized_dean_for_class(class_record_id)
  OR public.is_active_registrar()
  OR public.is_active_admin()
);

-- -----------------------------------------------------------------------------
-- 5. Telling people
-- -----------------------------------------------------------------------------
-- One helper, so every step notifies the same way and a new step cannot quietly
-- forget to. In-app only: see the note at the top of this file about email.
CREATE OR REPLACE FUNCTION public.aspire_notify_request_step(
  p_request_id UUID,
  p_recipient UUID,
  p_title TEXT,
  p_message TEXT,
  p_link TEXT,
  p_severity TEXT DEFAULT 'info'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_recipient IS NULL THEN RETURN; END IF;

  INSERT INTO public.notifications (
    recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
  ) VALUES (
    p_recipient, 'override_request', p_title, p_link, p_severity, p_message,
    jsonb_build_object('request_id', p_request_id),
    -- Scoped to the request AND the message, so each step notifies once but a
    -- later step still gets through.
    FORMAT('gcr:%s:%s:%s', p_request_id, p_recipient, md5(p_title || p_message)),
    FALSE
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_notify_request_step(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Everyone who should hear about a request, resolved once.
CREATE OR REPLACE FUNCTION public.aspire_request_participants(p_request_id UUID)
RETURNS TABLE (student_id UUID, faculty_id UUID, dean_id UUID, registrar_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    r.student_id,
    c.faculty_id,
    (SELECT u.user_id FROM public.users u
      JOIN public.sections s ON s.section_id = c.section_id
     WHERE u.role::TEXT = 'dean'
       AND COALESCE(u.status::TEXT, 'active') = 'active'
       AND u.department_id = s.department_id
     LIMIT 1),
    (SELECT u.user_id FROM public.users u
     WHERE u.role::TEXT = 'registrar'
       AND COALESCE(u.status::TEXT, 'active') = 'active'
     LIMIT 1)
  FROM public.remark_override_requests r
  JOIN public.class_records c ON c.class_record_id = r.class_record_id
  WHERE r.request_id = p_request_id;
$$;

REVOKE ALL ON FUNCTION public.aspire_request_participants(UUID) FROM PUBLIC, anon, authenticated;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_deadline TIMESTAMPTZ;
BEGIN
  IF to_regclass('public.grade_change_evidence') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: grade_change_evidence was not created.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'grade-evidence') THEN
    RAISE EXCEPTION 'Verification failed: the grade-evidence bucket was not created.';
  END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'grade-evidence' AND public) THEN
    RAISE EXCEPTION 'Verification failed: the grade-evidence bucket is public. Evidence must never be world-readable.';
  END IF;

  -- The new waiting states must be accepted, or the chain cannot advance.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'remark_override_requests_status_check'
      AND pg_get_constraintdef(oid) LIKE '%pending_registrar_review%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: the status constraint does not allow the new chain states.';
  END IF;

  -- School-day arithmetic. Friday 2026-01-02 + 1 school day is Monday the 5th,
  -- not Saturday the 3rd. If this ever returns a weekend the whole window is wrong.
  v_deadline := public.aspire_add_school_days(TIMESTAMPTZ '2026-01-02 00:00+08', 1);
  IF EXTRACT(ISODOW FROM v_deadline) > 5 THEN
    RAISE EXCEPTION 'Verification failed: school-day arithmetic landed on a weekend (%).', v_deadline;
  END IF;

  -- 30 school days is six working weeks, so it must land further out than 30
  -- calendar days would. This catches the arithmetic silently degrading to
  -- calendar days.
  IF public.aspire_add_school_days(TIMESTAMPTZ '2026-01-05 00:00+08', 30)
     <= TIMESTAMPTZ '2026-01-05 00:00+08' + INTERVAL '30 days' THEN
    RAISE EXCEPTION 'Verification failed: 30 school days is not longer than 30 calendar days.';
  END IF;

  IF public.aspire_add_school_days(NULL, 30) IS NOT NULL THEN
    RAISE EXCEPTION 'Verification failed: an unended term must have no deadline.';
  END IF;

  RAISE NOTICE 'Phase 6a installed. Dispute window is % school days from rollover by default.',
    (SELECT DISTINCT dispute_grace_days FROM public.academic_terms LIMIT 1);
END
$verify$;

-- =============================================================================
-- Phase 6a, part 2 — storage policies and the chain's RPCs
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 6. Storage policies for the evidence bucket
-- -----------------------------------------------------------------------------
-- Uploads happen BEFORE the request exists -- evidence is required, so the
-- request cannot be created without it. Paths are therefore scoped to the
-- student ("<uid>/..."), the same convention the avatars bucket uses, and the
-- submit RPC re-checks that every key's first segment is the caller. A student
-- can only ever submit files they uploaded themselves.
--
-- Wrapped because storage.objects is owned by supabase_storage_admin, and
-- whether this role may add policies to it depends on how the project was
-- provisioned. A refusal here must not roll back the chain; it means evidence
-- uploads fail, which the verification below reports loudly.
DO $storage$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS grade_evidence_student_insert ON storage.objects';
  EXECUTE $p$
    CREATE POLICY grade_evidence_student_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'grade-evidence'
        AND split_part(name, '/', 1) = auth.uid()::TEXT
      )
  $p$;

  -- Readable by the person who uploaded it, and by anyone who can see the
  -- request it was attached to. The second half chains through
  -- grade_change_evidence, whose own policy defers to the request's -- so there
  -- is exactly one definition of who may read a dispute.
  EXECUTE 'DROP POLICY IF EXISTS grade_evidence_read ON storage.objects';
  EXECUTE $p$
    CREATE POLICY grade_evidence_read ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'grade-evidence'
        AND (
          split_part(name, '/', 1) = auth.uid()::TEXT
          OR EXISTS (
            SELECT 1 FROM public.grade_change_evidence e
            WHERE e.object_key = storage.objects.name
          )
        )
      )
  $p$;

  -- A student may remove a file they uploaded. Needed both for tidying an
  -- abandoned upload and for replacing a photo that turned out illegible.
  EXECUTE 'DROP POLICY IF EXISTS grade_evidence_student_delete ON storage.objects';
  EXECUTE $p$
    CREATE POLICY grade_evidence_student_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'grade-evidence'
        AND split_part(name, '/', 1) = auth.uid()::TEXT
      )
  $p$;

  RAISE NOTICE 'Evidence storage policies installed.';
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE WARNING
    'Could not add policies to storage.objects (%). Evidence uploads will be refused until these are added by a role that owns storage.objects.',
    SQLERRM;
END;
$storage$;

-- -----------------------------------------------------------------------------
-- 7. What a student may dispute
-- -----------------------------------------------------------------------------
-- Finalized milestones only. While a consultation window is open the instructor
-- can still correct the grade directly, which is faster for everyone -- that is
-- what milestone_edits_frozen() already decides, and this reuses it rather than
-- restating the rule.
CREATE OR REPLACE FUNCTION public.student_disputable_milestones()
RETURNS TABLE (
  posted_grade_id UUID,
  class_record_id UUID,
  grade_period TEXT,
  subject_code TEXT,
  subject_name TEXT,
  section_name TEXT,
  faculty_name TEXT,
  school_year TEXT,
  semester TEXT,
  effective_grade NUMERIC,
  remarks TEXT,
  posted_at TIMESTAMPTZ,
  has_open_request BOOLEAN,
  open_request_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    pg.posted_grade_id,
    pg.class_record_id,
    pg.grade_period::TEXT,
    sub.code::TEXT,
    sub.name::TEXT,
    sec.name::TEXT,
    BTRIM(COALESCE(f.first_name, '') || ' ' || COALESCE(f.last_name, '')),
    c.school_year::TEXT,
    c.semester::TEXT,
    pg.effective_grade,
    pg.remarks::TEXT,
    pg.posted_at,
    EXISTS (
      SELECT 1 FROM public.remark_override_requests r
      WHERE r.posted_grade_id = pg.posted_grade_id
        AND r.submitted_by_role = 'student'
        AND r.status IN ('pending_faculty_review', 'pending_dean_review', 'pending_registrar_review')
    ),
    (SELECT r.request_id FROM public.remark_override_requests r
      WHERE r.posted_grade_id = pg.posted_grade_id
        AND r.submitted_by_role = 'student'
        AND r.status IN ('pending_faculty_review', 'pending_dean_review', 'pending_registrar_review')
      LIMIT 1)
  FROM public.posted_grades pg
  JOIN public.class_records c ON c.class_record_id = pg.class_record_id
  LEFT JOIN public.subjects sub ON sub.subject_id = c.subject_id
  LEFT JOIN public.sections sec ON sec.section_id = c.section_id
  LEFT JOIN public.users f ON f.user_id = c.faculty_id
  WHERE pg.student_id = auth.uid()
    AND public.milestone_edits_frozen(pg.class_record_id, pg.grade_period::TEXT)
    AND public.aspire_dispute_window_open(pg.class_record_id)
  ORDER BY pg.posted_at DESC;
$$;

REVOKE ALL ON FUNCTION public.student_disputable_milestones() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_disputable_milestones() TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. Raising a dispute
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_grade_change_request(
  p_posted_grade_id UUID,
  p_reason_type TEXT,
  p_reason_detail TEXT,
  p_evidence_keys TEXT[] DEFAULT NULL,
  p_evidence_storage TEXT DEFAULT 'supabase'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_student UUID := auth.uid();
  v_grade RECORD;
  v_request_id UUID;
  v_key TEXT;
  v_count INTEGER;
  v_parts RECORD;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to raise a request.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = v_student AND u.role::TEXT = 'student'
      AND COALESCE(u.status::TEXT, 'active') = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only a student can raise a request about their own grade.';
  END IF;

  SELECT pg.posted_grade_id, pg.class_record_id, pg.student_id, pg.grade_period,
         pg.computed_grade, pg.effective_grade, pg.remarks
    INTO v_grade
  FROM public.posted_grades pg
  WHERE pg.posted_grade_id = p_posted_grade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That grade could not be found.';
  END IF;

  -- The grade has to be the caller's own. Passing somebody else's id is the
  -- first thing anyone would try.
  IF v_grade.student_id <> v_student THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'You can only raise a request about your own grade.';
  END IF;

  IF NOT public.milestone_edits_frozen(v_grade.class_record_id, v_grade.grade_period::TEXT) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This grade is not final yet. Speak to your instructor -- they can still correct it directly, which is faster.';
  END IF;

  IF NOT public.aspire_dispute_window_open(v_grade.class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'The period for raising a question about this grade has closed. Contact the Registrar if you still need it reviewed.';
  END IF;

  IF p_reason_type IS NULL
     OR p_reason_type NOT IN ('computation_error', 'missing_or_incorrect_score', 'technical_issue', 'other') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Choose what the problem is.';
  END IF;

  IF length(BTRIM(COALESCE(p_reason_detail, ''))) < 20 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Explain what happened in a little more detail so your instructor can check it.';
  END IF;

  -- Evidence is required, one to three files, and every one must be something
  -- this student uploaded. Checked here and not only in the page, because the
  -- page is not what decides.
  v_count := COALESCE(array_length(p_evidence_keys, 1), 0);
  IF v_count < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Attach at least one photo or file showing the problem.';
  END IF;
  IF v_count > 3 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'You can attach up to three files.';
  END IF;

  FOREACH v_key IN ARRAY p_evidence_keys LOOP
    IF split_part(v_key, '/', 1) <> v_student::TEXT THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'One of those files was not uploaded by you.';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.remark_override_requests r
    WHERE r.posted_grade_id = p_posted_grade_id
      AND r.submitted_by_role = 'student'
      AND r.status IN ('pending_faculty_review', 'pending_dean_review', 'pending_registrar_review')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'You already have a request open for this grade. Wait for it to be resolved before raising another.';
  END IF;

  INSERT INTO public.remark_override_requests (
    class_record_id, student_id, requested_by, requested_at,
    posted_grade_id, grade_period, reason_type, reason_detail,
    submitted_by_role, status, correction_scope,
    original_computed_grade, original_effective_grade, original_remark
  ) VALUES (
    v_grade.class_record_id, v_student, v_student, CURRENT_TIMESTAMP,
    p_posted_grade_id, v_grade.grade_period::TEXT, p_reason_type, BTRIM(p_reason_detail),
    'student', 'pending_faculty_review',
    -- The gradebook's correction editor only opens for this scope. Setting it
    -- here is what lets an approved semestral request be applied at all.
    'student_score_row',
    v_grade.computed_grade, v_grade.effective_grade, v_grade.remarks::TEXT
  )
  RETURNING request_id INTO v_request_id;

  FOREACH v_key IN ARRAY p_evidence_keys LOOP
    INSERT INTO public.grade_change_evidence (request_id, object_key, storage, uploaded_by)
    VALUES (v_request_id, v_key, COALESCE(p_evidence_storage, 'supabase'), v_student)
    ON CONFLICT (request_id, object_key) DO NOTHING;
  END LOOP;

  SELECT * INTO v_parts FROM public.aspire_request_participants(v_request_id);
  PERFORM public.aspire_notify_request_step(
    v_request_id, v_parts.faculty_id,
    'Grade question from a student',
    'A student has raised a question about a finalized grade in one of your classes. Review it and either explain why it does not apply, or pass it to the Dean.',
    '/faculty/graderequests', 'warning'
  );

  RETURN jsonb_build_object('request_id', v_request_id, 'status', 'pending_faculty_review');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_grade_change_request(UUID, TEXT, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_grade_change_request(UUID, TEXT, TEXT, TEXT[], TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. Withdrawing, and attaching more
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_grade_change_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_parts RECORD;
BEGIN
  SELECT * INTO v_req FROM public.remark_override_requests WHERE request_id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That request could not be found.';
  END IF;

  IF v_req.requested_by <> auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You can only withdraw a request you raised.';
  END IF;

  IF v_req.status NOT IN ('pending_faculty_review', 'pending_dean_review', 'pending_registrar_review') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This request has already been decided, so it can no longer be withdrawn.';
  END IF;

  UPDATE public.remark_override_requests
  SET status = 'cancelled', resolved_at = CURRENT_TIMESTAMP, resolved_by = auth.uid()
  WHERE request_id = p_request_id;

  SELECT * INTO v_parts FROM public.aspire_request_participants(p_request_id);
  PERFORM public.aspire_notify_request_step(
    p_request_id, v_parts.faculty_id,
    'Grade question withdrawn',
    'A student has withdrawn their question about a grade. No action is needed.',
    '/faculty/graderequests', 'info'
  );

  RETURN jsonb_build_object('ok', TRUE, 'status', 'cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_grade_change_evidence(
  p_request_id UUID,
  p_object_key TEXT,
  p_storage TEXT DEFAULT 'supabase'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_count INTEGER;
BEGIN
  SELECT * INTO v_req FROM public.remark_override_requests WHERE request_id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That request could not be found.';
  END IF;

  IF v_req.requested_by <> auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You can only add files to a request you raised.';
  END IF;

  IF v_req.status NOT IN ('pending_faculty_review', 'pending_dean_review', 'pending_registrar_review') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This request has already been decided, so files can no longer be added.';
  END IF;

  IF split_part(p_object_key, '/', 1) <> auth.uid()::TEXT THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'That file was not uploaded by you.';
  END IF;

  SELECT count(*) INTO v_count FROM public.grade_change_evidence WHERE request_id = p_request_id;
  IF v_count >= 3 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'You can attach up to three files.';
  END IF;

  INSERT INTO public.grade_change_evidence (request_id, object_key, storage, uploaded_by)
  VALUES (p_request_id, p_object_key, COALESCE(p_storage, 'supabase'), auth.uid())
  ON CONFLICT (request_id, object_key) DO NOTHING;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- Removing the last file is refused: a dispute without evidence is not a state
-- this process allows, and allowing it here would create one by the back door.
CREATE OR REPLACE FUNCTION public.remove_grade_change_evidence(p_evidence_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_ev RECORD;
  v_req RECORD;
  v_count INTEGER;
BEGIN
  SELECT * INTO v_ev FROM public.grade_change_evidence WHERE id = p_evidence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That file could not be found.';
  END IF;

  SELECT * INTO v_req FROM public.remark_override_requests WHERE request_id = v_ev.request_id;

  IF v_req.requested_by <> auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You can only remove a file you attached.';
  END IF;

  IF v_req.status NOT IN ('pending_faculty_review', 'pending_dean_review', 'pending_registrar_review') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This request has already been decided, so its files can no longer be changed.';
  END IF;

  SELECT count(*) INTO v_count FROM public.grade_change_evidence WHERE request_id = v_ev.request_id;
  IF v_count <= 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'A request needs at least one file. Add the replacement first, then remove this one.';
  END IF;

  DELETE FROM public.grade_change_evidence WHERE id = p_evidence_id;
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_grade_change_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attach_grade_change_evidence(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_grade_change_evidence(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_grade_change_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attach_grade_change_evidence(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_grade_change_evidence(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10. The three reviews
-- -----------------------------------------------------------------------------
-- The instructor's step is a gate, not a second review: either the dispute is
-- plainly inapplicable, or it goes to the Dean with context only they have.
CREATE OR REPLACE FUNCTION public.faculty_review_grade_change_request(
  p_request_id UUID,
  p_decision TEXT,
  p_faculty_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_parts RECORD;
  v_note TEXT := NULLIF(BTRIM(COALESCE(p_faculty_note, '')), '');
BEGIN
  SELECT * INTO v_req FROM public.remark_override_requests WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That request could not be found.';
  END IF;

  IF NOT public.is_assigned_faculty(v_req.class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the instructor assigned to this class can review this request.';
  END IF;

  IF v_req.status <> 'pending_faculty_review' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This request is no longer waiting on you.';
  END IF;

  IF p_decision NOT IN ('forward', 'reject') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose whether to pass this on or to reject it.';
  END IF;

  -- A refusal without a reason is the outcome students escalate.
  IF p_decision = 'reject' AND (v_note IS NULL OR length(v_note) < 10) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Write a sentence or two explaining why this does not apply. The student reads it.';
  END IF;

  SELECT * INTO v_parts FROM public.aspire_request_participants(p_request_id);

  IF p_decision = 'forward' THEN
    UPDATE public.remark_override_requests
    SET status = 'pending_dean_review', faculty_note = v_note
    WHERE request_id = p_request_id;

    PERFORM public.aspire_notify_request_step(
      p_request_id, v_parts.dean_id,
      'Grade change awaiting your decision',
      'An instructor has validated a student''s grade question and passed it to you for a decision.',
      '/dean/graderequests', 'warning'
    );
    PERFORM public.aspire_notify_request_step(
      p_request_id, v_parts.student_id,
      'Your grade question has moved on',
      'Your instructor has reviewed your question and passed it to the Dean for a decision.',
      '/student/graderequests', 'info'
    );
    RETURN jsonb_build_object('ok', TRUE, 'status', 'pending_dean_review');
  END IF;

  UPDATE public.remark_override_requests
  SET status = 'rejected', faculty_note = v_note,
      resolved_at = CURRENT_TIMESTAMP, resolved_by = auth.uid()
  WHERE request_id = p_request_id;

  PERFORM public.aspire_notify_request_step(
    p_request_id, v_parts.student_id,
    'Your grade question was not approved',
    'Your instructor reviewed your question and explained why it does not apply. Open it to read their reason.',
    '/student/graderequests', 'warning'
  );
  RETURN jsonb_build_object('ok', TRUE, 'status', 'rejected');
END;
$$;

-- The Dean decides. Approving a request that has outlived the dispute window
-- sends it on to the Registrar rather than straight to the instructor: the
-- term's records are settled by then, and reopening them is the Registrar's
-- authority, not the Dean's.
CREATE OR REPLACE FUNCTION public.dean_review_grade_change_request(
  p_request_id UUID,
  p_decision TEXT,
  p_dean_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_parts RECORD;
  v_note TEXT := NULLIF(BTRIM(COALESCE(p_dean_note, '')), '');
  v_late BOOLEAN;
  v_next TEXT;
BEGIN
  SELECT * INTO v_req FROM public.remark_override_requests WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That request could not be found.';
  END IF;

  IF NOT public.is_authorized_dean_for_class(v_req.class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the Dean of this college can decide this request.';
  END IF;

  -- Accepts the older faculty-raised 'pending' as well, so one Dean page serves
  -- both the new chain and the existing semestral correction flow.
  IF v_req.status NOT IN ('pending_dean_review', 'pending') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'This request is no longer waiting on you.';
  END IF;

  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose whether to approve this or not.';
  END IF;

  IF v_note IS NULL OR length(v_note) < 10 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Write a sentence or two explaining your decision. Both the instructor and the student read it.';
  END IF;

  SELECT * INTO v_parts FROM public.aspire_request_participants(p_request_id);

  IF p_decision = 'reject' THEN
    UPDATE public.remark_override_requests
    SET status = 'rejected', dean_note = v_note,
        resolved_at = CURRENT_TIMESTAMP, resolved_by = auth.uid()
    WHERE request_id = p_request_id;

    PERFORM public.aspire_notify_request_step(
      p_request_id, v_parts.student_id,
      'Your grade question was not approved',
      'The Dean reviewed your question and did not approve a change. Open it to read their reason.',
      '/student/graderequests', 'warning'
    );
    PERFORM public.aspire_notify_request_step(
      p_request_id, v_parts.faculty_id,
      'Grade change not approved',
      'The Dean did not approve a grade change you passed on. No correction is needed.',
      '/faculty/graderequests', 'info'
    );
    RETURN jsonb_build_object('ok', TRUE, 'status', 'rejected');
  END IF;

  v_late := NOT public.aspire_dispute_window_open(v_req.class_record_id);
  v_next := CASE WHEN v_late THEN 'pending_registrar_review' ELSE 'approved' END;

  UPDATE public.remark_override_requests
  SET status = v_next, dean_note = v_note, requires_registrar = v_late
  WHERE request_id = p_request_id;

  IF v_late THEN
    PERFORM public.aspire_notify_request_step(
      p_request_id, v_parts.registrar_id,
      'Late grade change needs your authorisation',
      'A grade change has been validated by the instructor and approved by the Dean, but the term has already closed. Your authorisation is needed before the correction can be made.',
      '/registrar/lategradechanges', 'warning'
    );
    PERFORM public.aspire_notify_request_step(
      p_request_id, v_parts.student_id,
      'Your grade question was approved by the Dean',
      'The Dean approved your question. Because the term has already closed, the Registrar is now authorising the change.',
      '/student/graderequests', 'info'
    );
  ELSE
    PERFORM public.aspire_notify_request_step(
      p_request_id, v_parts.faculty_id,
      'Grade change approved -- correction needed',
      'The Dean approved a grade change. Open it to make the correction.',
      '/faculty/graderequests', 'warning'
    );
    PERFORM public.aspire_notify_request_step(
      p_request_id, v_parts.student_id,
      'Your grade question was approved',
      'The Dean approved your question. Your instructor will now make the correction.',
      '/student/graderequests', 'info'
    );
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'status', v_next, 'requires_registrar', v_late);
END;
$$;

-- The Registrar authorises reopening a closed term. An additional authority,
-- never a replacement: the evidence, the instructor's validation and the Dean's
-- approval have all already happened before anything arrives here.
CREATE OR REPLACE FUNCTION public.registrar_review_grade_change_request(
  p_request_id UUID,
  p_decision TEXT,
  p_registrar_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_parts RECORD;
  v_note TEXT := NULLIF(BTRIM(COALESCE(p_registrar_note, '')), '');
BEGIN
  SELECT * INTO v_req FROM public.remark_override_requests WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That request could not be found.';
  END IF;

  IF NOT public.is_active_registrar() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the Registrar can authorise a change to a closed term.';
  END IF;

  IF v_req.status <> 'pending_registrar_review' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'This request is not waiting on you.';
  END IF;

  IF p_decision NOT IN ('authorize', 'reject') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose whether to authorise this or not.';
  END IF;

  IF v_note IS NULL OR length(v_note) < 10 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Write a sentence or two explaining your decision. It is recorded against the change permanently.';
  END IF;

  SELECT * INTO v_parts FROM public.aspire_request_participants(p_request_id);

  IF p_decision = 'reject' THEN
    UPDATE public.remark_override_requests
    SET status = 'rejected', registrar_note = v_note,
        resolved_at = CURRENT_TIMESTAMP, resolved_by = auth.uid()
    WHERE request_id = p_request_id;

    PERFORM public.aspire_notify_request_step(
      p_request_id, v_parts.student_id,
      'Your grade question was not authorised',
      'The Dean approved your question, but the Registrar could not authorise a change to a closed term. Open it to read their reason.',
      '/student/graderequests', 'warning'
    );
    PERFORM public.aspire_notify_request_step(
      p_request_id, v_parts.faculty_id,
      'Late grade change not authorised',
      'The Registrar did not authorise reopening the term for this correction. No change is needed.',
      '/faculty/graderequests', 'info'
    );
    RETURN jsonb_build_object('ok', TRUE, 'status', 'rejected');
  END IF;

  UPDATE public.remark_override_requests
  SET status = 'approved', registrar_note = v_note
  WHERE request_id = p_request_id;

  PERFORM public.aspire_notify_request_step(
    p_request_id, v_parts.faculty_id,
    'Late grade change authorised -- correction needed',
    'The Registrar has authorised reopening this closed term. Open it to make the correction.',
    '/faculty/graderequests', 'warning'
  );
  PERFORM public.aspire_notify_request_step(
    p_request_id, v_parts.student_id,
    'Your grade change was authorised',
    'The Registrar authorised the change. Your instructor will now make the correction.',
    '/student/graderequests', 'info'
  );

  RETURN jsonb_build_object('ok', TRUE, 'status', 'approved');
END;
$$;

REVOKE ALL ON FUNCTION public.faculty_review_grade_change_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dean_review_grade_change_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_review_grade_change_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.faculty_review_grade_change_request(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dean_review_grade_change_request(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_review_grade_change_request(UUID, TEXT, TEXT) TO authenticated;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
DO $verify2$
DECLARE
  v_qual TEXT;
BEGIN
  IF to_regprocedure('public.student_disputable_milestones()') IS NULL
     OR to_regprocedure('public.submit_grade_change_request(uuid,text,text,text[],text)') IS NULL
     OR to_regprocedure('public.withdraw_grade_change_request(uuid)') IS NULL
     OR to_regprocedure('public.attach_grade_change_evidence(uuid,text,text)') IS NULL
     OR to_regprocedure('public.remove_grade_change_evidence(uuid)') IS NULL
     OR to_regprocedure('public.faculty_review_grade_change_request(uuid,text,text)') IS NULL
     OR to_regprocedure('public.dean_review_grade_change_request(uuid,text,text)') IS NULL
     OR to_regprocedure('public.registrar_review_grade_change_request(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: one or more chain functions are missing.';
  END IF;

  -- The storage policies are what make evidence possible at all. If they were
  -- refused, say so here rather than letting the first student discover it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'grade_evidence_student_insert'
  ) THEN
    RAISE WARNING 'Evidence uploads will fail: the storage policy was not created. Add it from the Supabase Storage policy editor.';
  END IF;

  -- Students must not be able to see an in-progress faculty-raised correction.
  SELECT pg_get_expr(p.polqual, p.polrelid) INTO v_qual
  FROM pg_policy p
  WHERE p.polname = 'remark_override_requests_authorized_select'
    AND p.polrelid = 'public.remark_override_requests'::regclass;

  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the request visibility policy is missing.';
  END IF;

  IF v_qual NOT LIKE '%student_id%'
     OR v_qual NOT LIKE '%approved%'
     OR v_qual NOT LIKE '%rejected%'
     OR v_qual NOT LIKE '%applied%' THEN
    RAISE EXCEPTION
      'Verification failed: the student visibility rule is not restricted to resolved requests. Policy reads: %', v_qual;
  END IF;

  RAISE NOTICE 'Phase 6a chain installed: submit, withdraw, evidence, and the three reviews.';
END
$verify2$;
