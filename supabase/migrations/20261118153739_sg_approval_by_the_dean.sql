-- =============================================================================
-- The Semestral Grade is approved by the Dean before it is released
-- =============================================================================
--
-- THE DECISION (pre-final defense revision, 2026-11-18)
--   Grade posting flow: Faculty submits the SG -> the Dean's office approves it
--   -> it is released to the student and received by the Registrar. MR and TFR
--   are unchanged and still post directly.
--   Plan: docs/02-thesis/defense/REGISTRAR_REVISIONS_PLAN_2026-11-18.md, Phase 3.
--
--   Decisions recorded 2026-11-18:
--     - SG only.                         - Returning an SG requires a reason.
--     - The Registrar only receives.     - Overrides and corrections: approved SGs only.
--     - Dean analytics keep counting pending SGs (the Dean is the reviewer).
--     - On-time / late / overdue and rollover are measured at SUBMISSION.
--
-- HOW IT WORKS
--   1. sg_approvals            one row per class: submitted -> approved, or
--                              submitted -> returned -> submitted again.
--   2. Submission              an AFTER trigger on posted_grades opens the row
--                              when the SG is first posted (and reopens it when
--                              a returned SG is re-posted). No change to how
--                              faculty post: post_grade_milestone_v3 is
--                              untouched, and v2 gets one guarded edit (step 7).
--   3. Students do not see it  a RESTRICTIVE select policy on posted_grades
--                              hides a student's own SG row until approval.
--                              Restrictive, so it holds whatever permissive
--                              policies exist on the live table.
--   4. No email before release a BEFORE INSERT trigger on notifications holds
--                              the student's SG notice (and so the student and
--                              guardian emails, which are fanned out AFTER
--                              insert) in sg_held_notifications.
--   5. The Dean decides        decide_sg_approval(): approve releases the held
--                              notices, archives a previous-term class, and
--                              tells the faculty and the Registrar; return
--                              needs a reason and tells the faculty.
--   6. Archive waits           a previous-term class is archived on approval,
--                              not on posting, so a returned SG is never stuck
--                              on a read-only class.
--   7. Re-post after return    post_grade_milestone_v2 treats existing SG rows
--                              as immutable. Patched in place (read the
--                              deployed body, assert one anchor, replace), the
--                              same technique as 20261118060222, so that
--                              existing rows may be re-posted while the class
--                              is RETURNED. Scores stay locked (MR and TFR
--                              already lock every term); a wrong score is fixed
--                              through the existing milestone correction flow.
--   8. Corrections wait        a request against an SG that is not approved
--                              is refused (Registrar override and faculty SG
--                              correction both open a remark_override_requests
--                              row, so one trigger covers both).
--   9. Existing SGs            every class that already has SG rows is
--                              recorded as approved, so nothing already
--                              released disappears from a student's view.
--
-- NEW TABLES: sg_approvals, sg_held_notifications (paper: 55 -> 57 tables).
-- Safe to re-run.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Pre-conditions
-- -----------------------------------------------------------------------------
DO $pre$
BEGIN
  -- New notice types (sg_approved, sg_returned) need a free-text type column.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications'
      AND column_name = 'type' AND data_type = 'USER-DEFINED'
  ) THEN
    RAISE EXCEPTION 'notifications.type is an enum on this database. Add the values sg_approved and sg_returned to it first, then re-run.';
  END IF;
  IF to_regprocedure('public.is_authorized_dean_for_class(uuid)') IS NULL
     OR to_regprocedure('public.is_class_faculty(uuid)') IS NULL
     OR to_regprocedure('public.class_sg_deadline_state(uuid)') IS NULL
     OR to_regprocedure('public.audit_business_mutation()') IS NULL THEN
    RAISE EXCEPTION 'A required helper is missing (is_authorized_dean_for_class, is_class_faculty, class_sg_deadline_state, audit_business_mutation). Run the earlier migrations first.';
  END IF;
END
$pre$;

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sg_approvals (
  class_record_id UUID PRIMARY KEY REFERENCES public.class_records(class_record_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('submitted', 'approved', 'returned')),
  submitted_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  submission_count INTEGER NOT NULL DEFAULT 1 CHECK (submission_count > 0),
  decided_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  return_reason TEXT,
  -- TRUE for SGs that were already released before Dean approval existed.
  approved_before_workflow BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status <> 'returned' OR length(btrim(COALESCE(return_reason, ''))) > 0)
);

COMMENT ON TABLE public.sg_approvals IS
  'Dean approval of a class''s submitted Semestral Grade. A student sees the SG, '
  'and the student and guardian are emailed, only once status = approved.';

CREATE INDEX IF NOT EXISTS idx_sg_approvals_status ON public.sg_approvals (status, submitted_at);

CREATE TABLE IF NOT EXISTS public.sg_held_notifications (
  held_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_record_id UUID NOT NULL REFERENCES public.class_records(class_record_id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT,
  link TEXT,
  severity TEXT,
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  held_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMPTZ
);

COMMENT ON TABLE public.sg_held_notifications IS
  'Student SG notices held while the Dean has not approved the SG. Released (the '
  'latest per student) on approval; discarded on return.';

CREATE INDEX IF NOT EXISTS idx_sg_held_notifications_class
  ON public.sg_held_notifications (class_record_id) WHERE released_at IS NULL;

ALTER TABLE public.sg_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sg_held_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sg_approvals_select ON public.sg_approvals;
CREATE POLICY sg_approvals_select ON public.sg_approvals
  FOR SELECT TO authenticated
  USING (
    public.is_class_faculty(class_record_id)
    OR public.is_authorized_dean_for_class(class_record_id)
    OR public.is_active_registrar()
    OR public.is_active_admin()
  );

-- Every write goes through the triggers and decide_sg_approval().
REVOKE INSERT, UPDATE, DELETE ON public.sg_approvals FROM authenticated;
REVOKE ALL ON public.sg_approvals FROM anon;
-- Held notices are never read by a client.
REVOKE ALL ON public.sg_held_notifications FROM authenticated, anon;

DROP TRIGGER IF EXISTS audit_business_mutation_trigger ON public.sg_approvals;
CREATE TRIGGER audit_business_mutation_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.sg_approvals
  FOR EACH ROW EXECUTE FUNCTION public.audit_business_mutation();

-- -----------------------------------------------------------------------------
-- 2. Helpers
-- -----------------------------------------------------------------------------
-- Is this posted_grades row the SG? Mirrors getCanonicalGradePeriod() in
-- src/lib/gradeMilestones.js, so legacy 'final'/'sg' rows count too.
--
-- posted_grades.locked_milestones is character varying[] on the live database
-- (the 20261022 migrations treat it as JSONB, but the deployed column is an
-- array). Every caller passes it as locked_milestones::TEXT[]. A first run with
-- a JSONB parameter failed on exactly this (42883) and rolled back cleanly.
DROP FUNCTION IF EXISTS public.aspire_is_sg_row(TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.aspire_is_sg_row(p_grade_period TEXT, p_locks TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE lower(btrim(COALESCE(p_grade_period, '')))
    WHEN 'semestral_grade' THEN TRUE
    WHEN 'sg' THEN TRUE
    WHEN 'final' THEN
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(p_locks, '{}'::TEXT[])) l(v)
        WHERE lower(btrim(l.v)) IN ('semestral grade', 'semestral_grade')
      )
      OR NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p_locks, '{}'::TEXT[])) l(v)
        WHERE lower(btrim(l.v)) IN ('tentative final rating', 'tentative_final_rating')
      )
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION public.aspire_sg_is_released(p_class_record_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sg_approvals a
    WHERE a.class_record_id = p_class_record_id AND a.status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.aspire_sg_is_returned(p_class_record_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sg_approvals a
    WHERE a.class_record_id = p_class_record_id AND a.status = 'returned'
  );
$$;

REVOKE ALL ON FUNCTION public.aspire_sg_is_released(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aspire_sg_is_returned(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_sg_is_released(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aspire_sg_is_returned(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aspire_is_sg_row(TEXT, TEXT[]) TO authenticated;

-- What a student's Grade Report needs to know: is the SG of each class
-- pending, released, or not submitted. Never the Dean's reason.
CREATE OR REPLACE FUNCTION public.get_sg_release_states(p_class_record_ids UUID[])
RETURNS TABLE (class_record_id UUID, state TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ids.id,
         CASE
           WHEN a.status = 'approved' THEN 'released'
           WHEN a.status IN ('submitted', 'returned') THEN 'pending'
           ELSE 'none'
         END
  FROM unnest((COALESCE(p_class_record_ids, '{}'::UUID[]))[1:500]) AS ids(id)
  LEFT JOIN public.sg_approvals a ON a.class_record_id = ids.id
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_sg_release_states(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sg_release_states(UUID[]) TO authenticated;

-- The previous-term archive, now callable from approval as well as posting.
-- Same rule as archive_previous_term_class_after_sg (20261011130000): archive
-- an active previous-term class once every active enrollee has an SG.
CREATE OR REPLACE FUNCTION public.aspire_archive_previous_term_class(p_class_record_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.class_sg_deadline_state(p_class_record_id) = 'current' THEN
    RETURN;
  END IF;

  UPDATE public.class_records c
  SET status = 'archived'
  WHERE c.class_record_id = p_class_record_id
    AND c.status::TEXT = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.section_id = c.section_id
        AND e.subject_id = c.subject_id
        AND COALESCE(e.status::TEXT, 'active') = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.posted_grades pg
          WHERE pg.class_record_id = c.class_record_id
            AND pg.student_id = e.student_id
            AND pg.grade_period::TEXT = 'semestral_grade'
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_archive_previous_term_class(UUID) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Existing SGs count as approved (before any trigger can see them).
-- -----------------------------------------------------------------------------
INSERT INTO public.sg_approvals (
  class_record_id, status, submitted_by, submitted_at, decided_at, approved_before_workflow
)
SELECT g.class_record_id, 'approved',
       (array_agg(g.posted_by ORDER BY g.posted_at DESC NULLS LAST))[1],
       max(g.posted_at), max(g.posted_at), TRUE
FROM public.posted_grades g
WHERE public.aspire_is_sg_row(g.grade_period::TEXT, g.locked_milestones::TEXT[])
GROUP BY g.class_record_id
ON CONFLICT (class_record_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Submission: posting an SG opens (or re-opens) the approval.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_open_sg_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.sg_approvals%ROWTYPE;
  v_subject TEXT;
  v_section TEXT;
  v_faculty TEXT;
  v_department UUID;
BEGIN
  IF NOT public.aspire_is_sg_row(NEW.grade_period::TEXT, NEW.locked_milestones::TEXT[]) THEN
    RETURN NULL;
  END IF;

  -- First SG row of a class: open as submitted. A returned SG becomes
  -- submitted again only when the faculty re-posts it -- not when a later
  -- correction cascade touches the row.
  INSERT INTO public.sg_approvals (class_record_id, status, submitted_by, submitted_at)
  VALUES (NEW.class_record_id, 'submitted', NEW.posted_by, CURRENT_TIMESTAMP)
  ON CONFLICT (class_record_id) DO UPDATE SET
    status = 'submitted',
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = EXCLUDED.submitted_at,
    submission_count = public.sg_approvals.submission_count + 1,
    decided_by = NULL,
    decided_at = NULL,
    updated_at = CURRENT_TIMESTAMP
  WHERE public.sg_approvals.status = 'returned'
    AND NEW.official_source::TEXT = 'faculty_post';

  SELECT * INTO v_row FROM public.sg_approvals WHERE class_record_id = NEW.class_record_id;
  IF v_row.status <> 'submitted' THEN
    RETURN NULL;
  END IF;

  -- Tell the Dean of the class's college. One notice per submission round:
  -- the dedupe key carries submission_count, and every later row of the same
  -- posting hits the key and inserts nothing.
  SELECT COALESCE(sub.code, 'A class'), COALESCE(sec.name, ''), sec.department_id,
         BTRIM(COALESCE(f.first_name, '') || ' ' || COALESCE(f.last_name, ''))
    INTO v_subject, v_section, v_department, v_faculty
  FROM public.class_records c
  LEFT JOIN public.subjects sub ON sub.subject_id = c.subject_id
  LEFT JOIN public.sections sec ON sec.section_id = c.section_id
  LEFT JOIN public.users f ON f.user_id = c.faculty_id
  WHERE c.class_record_id = NEW.class_record_id;

  INSERT INTO public.notifications (recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read)
  SELECT u.user_id, 'grades_pending',
         CASE WHEN v_row.submission_count > 1 THEN 'SG Resubmitted for Approval' ELSE 'SG Submitted for Approval' END,
         '/dean/sgapprovals/' || NEW.class_record_id::TEXT, 'info',
         format('%s submitted the Semestral Grade of %s %s for your approval.',
                COALESCE(NULLIF(v_faculty, ''), 'The instructor'), v_subject, v_section),
         jsonb_build_object('class_record_id', NEW.class_record_id, 'submission', v_row.submission_count),
         format('sg_submitted:%s:%s:%s', NEW.class_record_id, v_row.submission_count, u.user_id),
         FALSE
  FROM public.users u
  WHERE u.role::TEXT = 'dean'
    AND COALESCE(u.status::TEXT, 'active') = 'active'
    AND u.department_id = v_department
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_open_sg_approval() FROM PUBLIC, anon, authenticated;

-- DEFERRED to the end of the posting transaction, on purpose. The posting
-- function writes one student at a time and re-checks "is this SG returned?"
-- for each one. A trigger that flipped returned -> submitted after the FIRST
-- row would make every later row of the same re-post look not-returned, so
-- they would be skipped and the class resubmitted half-updated. Deferred, the
-- whole roster is re-posted under "returned" and the flip happens once, at
-- commit. Caught by the PGlite run of this migration (2026-11-18).
DROP TRIGGER IF EXISTS trg_open_sg_approval ON public.posted_grades;
CREATE CONSTRAINT TRIGGER trg_open_sg_approval
  AFTER INSERT OR UPDATE ON public.posted_grades
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.aspire_open_sg_approval();

-- -----------------------------------------------------------------------------
-- 5. Students cannot read their own SG until it is approved.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS posted_grades_sg_release_gate ON public.posted_grades;
CREATE POLICY posted_grades_sg_release_gate ON public.posted_grades
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    student_id IS DISTINCT FROM auth.uid()
    OR NOT public.aspire_is_sg_row(grade_period::TEXT, locked_milestones::TEXT[])
    OR public.aspire_sg_is_released(class_record_id)
  );

-- -----------------------------------------------------------------------------
-- 6. The student's SG notice (and its emails) waits for approval.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_hold_unreleased_sg_notice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class UUID;
BEGIN
  IF NEW.type NOT IN ('grade_posted', 'grade_changed')
     OR lower(COALESCE(NEW.payload->>'grade_period', '')) NOT IN ('semestral_grade', 'sg')
     OR COALESCE(NEW.payload->>'class_record_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RETURN NEW;
  END IF;

  v_class := (NEW.payload->>'class_record_id')::UUID;
  IF public.aspire_sg_is_released(v_class) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.sg_held_notifications (
    class_record_id, recipient_id, type, title, link, severity, message, payload
  ) VALUES (
    v_class, NEW.recipient_id, NEW.type, NEW.title, NEW.link, NEW.severity, NEW.message,
    COALESCE(NEW.payload, '{}'::JSONB)
  );
  -- Not inserted, so the AFTER INSERT fan-out queues no email or guardian copy.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_hold_unreleased_sg_notice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hold_unreleased_sg_notice ON public.notifications;
CREATE TRIGGER trg_hold_unreleased_sg_notice
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.aspire_hold_unreleased_sg_notice();

-- -----------------------------------------------------------------------------
-- 7. A previous-term class is archived on approval, not on posting.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_previous_term_class_after_sg()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.grade_period::TEXT <> 'semestral_grade'
     OR NOT public.aspire_sg_is_released(NEW.class_record_id) THEN
    RETURN NULL;
  END IF;
  PERFORM public.aspire_archive_previous_term_class(NEW.class_record_id);
  RETURN NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Corrections and overrides apply to approved SGs only.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_block_requests_on_unreleased_sg()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.posted_grade_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.posted_grades g
    WHERE g.posted_grade_id = NEW.posted_grade_id
      AND public.aspire_is_sg_row(g.grade_period::TEXT, g.locked_milestones::TEXT[])
      AND NOT public.aspire_sg_is_released(g.class_record_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'This Semestral Grade is still waiting for the Dean''s approval. It can be corrected or overridden only after it is approved; until then the Dean returns it to the instructor.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_block_requests_on_unreleased_sg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_block_requests_on_unreleased_sg ON public.remark_override_requests;
CREATE TRIGGER trg_block_requests_on_unreleased_sg
  BEFORE INSERT ON public.remark_override_requests
  FOR EACH ROW EXECUTE FUNCTION public.aspire_block_requests_on_unreleased_sg();

-- -----------------------------------------------------------------------------
-- 9. The Dean's decision.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_sg_approval(
  p_class_record_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_row public.sg_approvals%ROWTYPE;
  v_decision TEXT := lower(btrim(COALESCE(p_decision, '')));
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_class public.class_records%ROWTYPE;
  v_label TEXT;
  v_released INTEGER := 0;
  v_held RECORD;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required.';
  END IF;
  IF v_decision NOT IN ('approve', 'return') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The decision must be approve or return.';
  END IF;
  IF NOT public.is_authorized_dean_for_class(p_class_record_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the Dean of this class''s college can approve or return its SG.';
  END IF;

  SELECT * INTO v_row FROM public.sg_approvals
  WHERE class_record_id = p_class_record_id FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'submitted' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'This SG is not waiting for approval. Reload the page to see its current status.';
  END IF;
  IF v_decision = 'return' AND (v_reason IS NULL OR length(v_reason) < 10) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Write the reason for returning the SG (at least 10 characters). The instructor will see it.';
  END IF;

  SELECT * INTO v_class FROM public.class_records WHERE class_record_id = p_class_record_id;
  SELECT COALESCE(sub.code, 'the class') || COALESCE(' ' || sec.name, '')
    INTO v_label
  FROM public.class_records c
  LEFT JOIN public.subjects sub ON sub.subject_id = c.subject_id
  LEFT JOIN public.sections sec ON sec.section_id = c.section_id
  WHERE c.class_record_id = p_class_record_id;

  IF v_decision = 'approve' THEN
    UPDATE public.sg_approvals SET
      status = 'approved', decided_by = v_actor, decided_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE class_record_id = p_class_record_id;

    -- Release the latest held notice per student. Inserted after the status
    -- change, so the hold trigger lets it through and the email fan-out runs.
    FOR v_held IN
      SELECT DISTINCT ON (h.recipient_id) h.*
      FROM public.sg_held_notifications h
      WHERE h.class_record_id = p_class_record_id AND h.released_at IS NULL
      ORDER BY h.recipient_id, h.held_at DESC
    LOOP
      INSERT INTO public.notifications (recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read)
      VALUES (
        v_held.recipient_id, 'grade_posted', 'Official Grade Posted',
        COALESCE(v_held.link, '/student/grades'), COALESCE(v_held.severity, 'info'),
        format('Your Semestral Grade (SG) for %s has been approved by the Dean and is now official.', v_label),
        v_held.payload || jsonb_build_object('approved_at', CURRENT_TIMESTAMP),
        format('sg_released:%s:%s:%s', p_class_record_id, v_held.recipient_id, v_row.submission_count),
        FALSE
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
      v_released := v_released + 1;
    END LOOP;
    UPDATE public.sg_held_notifications SET released_at = CURRENT_TIMESTAMP
    WHERE class_record_id = p_class_record_id AND released_at IS NULL;

    PERFORM public.aspire_archive_previous_term_class(p_class_record_id);

    -- The instructor, and every active Registrar (who receives the record).
    INSERT INTO public.notifications (recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read)
    SELECT v_class.faculty_id, 'sg_approved', 'SG Approved',
           '/faculty/gradecomputationpreview?id=' || p_class_record_id::TEXT, 'info',
           format('The Dean approved the Semestral Grade of %s. It is now official and visible to your students.', v_label),
           jsonb_build_object('class_record_id', p_class_record_id),
           format('sg_approved:%s:%s:%s', p_class_record_id, v_row.submission_count, v_class.faculty_id), FALSE
    WHERE v_class.faculty_id IS NOT NULL
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    INSERT INTO public.notifications (recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read)
    SELECT u.user_id, 'sg_approved', 'Approved SG Received',
           '/registrar/gradesheets/' || p_class_record_id::TEXT, 'info',
           format('The Dean approved the Semestral Grade of %s. Its grade sheet is now official.', v_label),
           jsonb_build_object('class_record_id', p_class_record_id),
           format('sg_approved:%s:%s:%s', p_class_record_id, v_row.submission_count, u.user_id), FALSE
    FROM public.users u
    WHERE u.role::TEXT = 'registrar' AND COALESCE(u.status::TEXT, 'active') = 'active'
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  ELSE
    UPDATE public.sg_approvals SET
      status = 'returned', decided_by = v_actor, decided_at = CURRENT_TIMESTAMP,
      return_reason = v_reason, updated_at = CURRENT_TIMESTAMP
    WHERE class_record_id = p_class_record_id;

    -- Never sent, and the next submission holds fresh ones.
    DELETE FROM public.sg_held_notifications
    WHERE class_record_id = p_class_record_id AND released_at IS NULL;

    INSERT INTO public.notifications (recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read)
    SELECT v_class.faculty_id, 'sg_returned', 'SG Returned by the Dean',
           '/faculty/gradecomputationpreview?id=' || p_class_record_id::TEXT, 'warning',
           format('The Dean returned the Semestral Grade of %s. Reason: %s', v_label, v_reason),
           jsonb_build_object('class_record_id', p_class_record_id, 'reason', v_reason),
           format('sg_returned:%s:%s:%s', p_class_record_id, v_row.submission_count, v_class.faculty_id), FALSE
    WHERE v_class.faculty_id IS NOT NULL
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'class_record_id', p_class_record_id,
    'status', CASE WHEN v_decision = 'approve' THEN 'approved' ELSE 'returned' END,
    'released_notifications', v_released
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decide_sg_approval(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_sg_approval(UUID, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10. A returned SG may be re-posted over its existing rows.
--     Patched from the DEPLOYED body; see the header, step 7.
-- -----------------------------------------------------------------------------
DO $patch$
DECLARE
  v_def TEXT;
  v_hits INTEGER;
  v_old CONSTANT TEXT := $old$IF p_grade_period = 'semestral_grade' AND NOT v_is_insert THEN$old$;
  v_new CONSTANT TEXT := $new$IF p_grade_period = 'semestral_grade' AND NOT v_is_insert AND NOT public.aspire_sg_is_returned(p_class_record_id) THEN$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'post_grade_milestone_v2';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_grade_milestone_v2 does not exist.';
  END IF;
  IF position('aspire_sg_is_returned' IN v_def) > 0 THEN
    RAISE NOTICE 'post_grade_milestone_v2 already allows re-posting a returned SG; nothing to do.';
    RETURN;
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION
      'Expected the SG immutability check exactly once in post_grade_milestone_v2, found %. Re-read the deployed body before re-running.',
      v_hits;
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
  RAISE NOTICE 'post_grade_milestone_v2 now lets a faculty member re-post a returned SG.';
END
$patch$;

-- -----------------------------------------------------------------------------
-- 11. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_unrecorded INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_open_sg_approval' AND tgrelid = 'public.posted_grades'::regclass) THEN
    RAISE EXCEPTION 'Verification failed: posting an SG does not open an approval.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_hold_unreleased_sg_notice' AND tgrelid = 'public.notifications'::regclass) THEN
    RAISE EXCEPTION 'Verification failed: an unapproved SG would still email the student and guardian.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'posted_grades'
      AND policyname = 'posted_grades_sg_release_gate' AND permissive = 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION 'Verification failed: students could still read an unapproved SG.';
  END IF;
  IF position('aspire_sg_is_returned' IN pg_get_functiondef(
       (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'post_grade_milestone_v2' LIMIT 1))) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a returned SG cannot be re-posted.';
  END IF;

  -- Every class that already had an SG must now read as approved, or students
  -- would lose grades they could see yesterday.
  SELECT COUNT(DISTINCT g.class_record_id) INTO v_unrecorded
  FROM public.posted_grades g
  WHERE public.aspire_is_sg_row(g.grade_period::TEXT, g.locked_milestones::TEXT[])
    AND NOT EXISTS (SELECT 1 FROM public.sg_approvals a WHERE a.class_record_id = g.class_record_id);
  IF v_unrecorded > 0 THEN
    RAISE EXCEPTION 'Verification failed: % class(es) with an SG have no approval record.', v_unrecorded;
  END IF;

  RAISE NOTICE 'SG approval by the Dean is in place. % class(es) recorded as already approved.',
    (SELECT COUNT(*) FROM public.sg_approvals WHERE approved_before_workflow);
END
$verify$;

COMMIT;
