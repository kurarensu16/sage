-- =============================================================================
-- An approved SG reaches every student (in-app, email, guardian email)
-- =============================================================================
--
-- THE SYMPTOM (QA, 2026-11-18)
--   The Dean approved a RESUBMITTED SG. The faculty got "SG Approved" and the
--   Registrar got "Approved SG Received", but the student got no in-app notice
--   and no email, and the guardian got no email. The Grade Report itself showed
--   the SG correctly.
--
-- THE CAUSE
--   20261118153739 did not write the student's notice on approval. It RELEASED
--   the notice the posting function had written and the hold trigger had kept
--   back. Two things emptied that store:
--     1. Returning the SG deletes every held notice ("the next submission
--        holds fresh ones").
--     2. The next submission does NOT hold fresh ones for everybody:
--        post_grade_milestone_v2 writes a notice only for a student whose SG
--        result CHANGED on the re-post. A student whose grade did not change
--        gets none.
--   So after return -> resubmit -> approve, only the students whose grade
--   changed on the resubmission were told; everyone else got nothing.
--   (The faculty and Registrar notices were written directly by
--   decide_sg_approval, which is why they arrived.)
--
-- THE FIX
--   On approval, the student notice is WRITTEN from the class's SG rows, one
--   per student, rather than released from the held store. Held notices are
--   still kept back while the SG waits (that part worked) and are marked
--   released on approval, but they are no longer the source. Each notice is a
--   'grade_posted' carrying both payload vocabularies (the database's and the
--   email templates', see 20261118060222), so the existing fan-out sends the
--   student and guardian emails with the real subject, term and grade.
--
--   Also: the MR/TFR "Progress Grade Updated" notice from 20261118192713 gets
--   the same email keys, if that migration has run.
--
--   Backfill: every class approved through the Dean workflow whose students
--   never got their release notice receives it now (the QA class among them).
--   SGs recorded as approved before the workflow existed are left alone.
--
-- NO TABLE IS CHANGED. One function added, decide_sg_approval restated (it is
-- this plan's own function, from 20261118153739), one backfill. Safe to re-run:
-- every notice has a dedupe key.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.decide_sg_approval(uuid,text,text)') IS NULL
     OR to_regprocedure('public.aspire_is_sg_row(text,text[])') IS NULL THEN
    RAISE EXCEPTION 'Run 20261118153739_sg_approval_by_the_dean.sql first.';
  END IF;
END
$pre$;

-- -----------------------------------------------------------------------------
-- 1. One "Official Grade Posted" notice per student with an SG row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_notify_students_sg_approved(
  p_class_record_id UUID,
  p_round INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_label TEXT;
  v_code TEXT;
  v_name TEXT;
  v_count INTEGER;
BEGIN
  SELECT COALESCE(sub.code, 'the class') || COALESCE(' ' || sec.name, ''), sub.code, sub.name
    INTO v_label, v_code, v_name
  FROM public.class_records c
  LEFT JOIN public.subjects sub ON sub.subject_id = c.subject_id
  LEFT JOIN public.sections sec ON sec.section_id = c.section_id
  WHERE c.class_record_id = p_class_record_id;

  INSERT INTO public.notifications (recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read)
  SELECT
    g.student_id, 'grade_posted', 'Official Grade Posted', '/student/grades', 'info',
    format('Your Semestral Grade (SG) for %s has been approved by the Dean and is now official.', v_label),
    jsonb_build_object(
      -- The database's names (Grade Report, reconciliation).
      'class_record_id', p_class_record_id, 'grade_period', 'semestral_grade',
      'computed_grade', g.computed_grade, 'effective_grade', g.effective_grade, 'remarks', g.remarks::TEXT,
      -- The email templates' names (send-email/index.ts).
      'subject_code', v_code, 'subject_name', v_name, 'term', 'Semestral Grade',
      'rating', g.computed_grade, 'gwa', g.effective_grade, 'remark', g.remarks::TEXT,
      'student_name', NULLIF(BTRIM(COALESCE(u.last_name, '') || ', ' || COALESCE(u.first_name, '')), ','),
      'approved_at', CURRENT_TIMESTAMP, 'submission', p_round
    ),
    format('sg_released:%s:%s:%s', p_class_record_id, g.student_id, p_round),
    FALSE
  FROM public.posted_grades g
  LEFT JOIN public.users u ON u.user_id = g.student_id
  WHERE g.class_record_id = p_class_record_id
    AND public.aspire_is_sg_row(g.grade_period::TEXT, g.locked_milestones::TEXT[])
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.sg_held_notifications SET released_at = CURRENT_TIMESTAMP
  WHERE class_record_id = p_class_record_id AND released_at IS NULL;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_notify_students_sg_approved(UUID, INTEGER) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. decide_sg_approval: as in 20261118153739, except the student notices.
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

    -- Every student of the class, written after the status change so the hold
    -- trigger lets it through and the email fan-out runs (20261118194508).
    v_released := public.aspire_notify_students_sg_approved(p_class_record_id, v_row.submission_count);

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

    -- Never sent. Approval writes its own notices, so nothing is lost.
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
-- 3. Backfill: approved through the workflow, but a student was never told.
--    The dedupe key makes this a no-op for students who already were.
-- -----------------------------------------------------------------------------
DO $backfill$
DECLARE
  v_a RECORD;
  v_total INTEGER := 0;
BEGIN
  FOR v_a IN
    SELECT a.class_record_id, a.submission_count
    FROM public.sg_approvals a
    WHERE a.status = 'approved' AND NOT a.approved_before_workflow
  LOOP
    v_total := v_total + public.aspire_notify_students_sg_approved(v_a.class_record_id, v_a.submission_count);
  END LOOP;
  RAISE NOTICE 'Backfill: % student notice(s) written for SGs the Dean already approved.', v_total;
END
$backfill$;

-- -----------------------------------------------------------------------------
-- 4. The MR/TFR correction notice (20261118192713) carries the email keys too.
--    Only if that migration has run; it is patched from its deployed body.
-- -----------------------------------------------------------------------------
DO $patch$
DECLARE
  v_def TEXT;
  v_hits INTEGER;
  v_old CONSTANT TEXT := $old$'previous_grade', v_row.computed_grade, 'sg_resubmission', p_round$old$;
  v_new CONSTANT TEXT := $new$'previous_grade', v_row.computed_grade, 'sg_resubmission', p_round,
        'subject_code', (SELECT s.code FROM public.subjects s JOIN public.class_records c ON c.subject_id = s.subject_id WHERE c.class_record_id = p_class_record_id),
        'subject_name', (SELECT s.name FROM public.subjects s JOIN public.class_records c ON c.subject_id = s.subject_id WHERE c.class_record_id = p_class_record_id),
        'term', CASE v_row.grade_period::TEXT WHEN 'midterm_rating' THEN 'Midterm' ELSE 'Tentative Final' END,
        'rating', v_rating, 'gwa', NULL, 'remark', v_remark,
        'student_name', (SELECT NULLIF(BTRIM(COALESCE(u.last_name, '') || ', ' || COALESCE(u.first_name, '')), ',') FROM public.users u WHERE u.user_id = v_row.student_id)$new$;
BEGIN
  IF to_regprocedure('public.aspire_sync_progress_ratings(uuid,integer)') IS NULL THEN
    RAISE NOTICE '20261118192713 has not run yet; it already carries the email keys when it does.';
    RETURN;
  END IF;
  SELECT pg_get_functiondef('public.aspire_sync_progress_ratings(uuid,integer)'::regprocedure) INTO v_def;
  IF position('''student_name''' IN v_def) > 0 THEN
    RAISE NOTICE 'aspire_sync_progress_ratings already carries the email keys; nothing to do.';
    RETURN;
  END IF;
  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'Expected the progress-notice payload once in aspire_sync_progress_ratings, found %.', v_hits;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
  RAISE NOTICE 'The MR/TFR correction notice now names the subject, the term, the student and the grade.';
END
$patch$;

-- -----------------------------------------------------------------------------
-- 5. Verify.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef('public.decide_sg_approval(uuid,text,text)'::regprocedure) INTO v_def;
  IF position('aspire_notify_students_sg_approved' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: approving an SG still depends on held notices.';
  END IF;
  SELECT pg_get_functiondef('public.aspire_notify_students_sg_approved(uuid,integer)'::regprocedure) INTO v_def;
  IF position('''student_name''' IN v_def) = 0 OR position('''grade_period''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the approval notice lacks a payload key the Grade Report or the email reads.';
  END IF;
  RAISE NOTICE 'Approving an SG now notifies every student of the class, with student and guardian emails.';
END
$verify$;

COMMIT;
