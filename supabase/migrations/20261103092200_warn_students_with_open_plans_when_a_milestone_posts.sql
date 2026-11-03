-- =============================================================================
-- Tell a student their plan is about to close, while they can still act
-- =============================================================================
--
-- THE PROBLEM THIS SOLVES
--   Finalizing has no fixed date. An instructor may finalize an hour after
--   posting or three weeks later, and 20261103091500 closes every open plan the
--   moment they do. A student cannot plan around a deadline nobody has told
--   them about.
--
--   Posting DOES have a date. So the warning goes out then, and the student has
--   the whole posted-to-finalized window -- however long the instructor leaves
--   it -- to finish.
--
-- WHERE IT HOOKS
--   The INSERT on grade_consultation_windows. A window is opened automatically
--   by trg_open_consultation_window when MR or TFR is posted, so that insert IS
--   "a milestone was posted", and it already carries class_record_id and
--   grade_period. post_grade_milestone_v2 is not touched: it is 180 lines, and
--   20261029040940 rewrites function bodies in place, so this repo's copy of it
--   is not necessarily what the database is running.
--
-- ONLY THE TWO COMBINED MILESTONES EXIST
--   There is no separate posting for Prelim or for Semi-Final. MR covers
--   Prelim + Midterm together; TFR covers Semi-Final + Final together. That
--   mapping is aspire_milestone_terms(), the same one the score freeze uses.
--
-- TWO MESSAGES, BECAUSE TWO DIFFERENT PEOPLE ARE BEING WAITED ON
--   Telling a student to "finish your tasks" when they have already reported
--   everything and are waiting on their instructor to verify would be both
--   wrong and irritating. The student whose move it is gets a deadline; the
--   student waiting on someone else gets reassurance.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Whose move is it?
--
--    'tasks_outstanding'    the student still has something to do
--    'awaiting_verification' the student is done; the instructor is not
--    'complete'              nothing to say, so nothing is sent
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_evaluation_student_state(p_plan JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- SQL NULL first, and explicitly. jsonb_typeof(NULL) is NULL, so this
    -- condition would evaluate to NULL rather than TRUE, fall through both
    -- EXISTS checks (which find no rows over a NULL array) and return
    -- 'complete' -- silently deciding a student with no plan needs no warning.
    WHEN p_plan IS NULL THEN 'tasks_outstanding'
    WHEN jsonb_typeof(p_plan) <> 'array' OR jsonb_array_length(p_plan) = 0
      THEN 'tasks_outstanding'
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_plan) AS t(task)
      WHERE COALESCE((task->>'completed')::BOOLEAN, FALSE) = FALSE
    ) THEN 'tasks_outstanding'
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_plan) AS t(task)
      WHERE COALESCE(task->>'verification_status', '') <> 'verified'
    ) THEN 'awaiting_verification'
    ELSE 'complete'
  END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Warn the students who still have one open.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_warn_open_plans_on_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_terms   TEXT[] := public.aspire_milestone_terms(NEW.grade_period::TEXT);
  v_label   TEXT := CASE NEW.grade_period::TEXT
                      WHEN 'midterm_rating' THEN 'Midterm Rating'
                      WHEN 'tentative_final_rating' THEN 'Tentative Final Rating'
                      ELSE NEW.grade_period::TEXT END;
  v_subject TEXT;
  v_row     RECORD;
  v_state   TEXT;
BEGIN
  IF v_terms IS NULL OR array_length(v_terms, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT subject.code INTO v_subject
  FROM public.class_records class_record
  LEFT JOIN public.subjects subject ON subject.subject_id = class_record.subject_id
  WHERE class_record.class_record_id = NEW.class_record_id;

  FOR v_row IN
    SELECT e.evaluation_id, e.student_id, e.term, e.advising_plan
    FROM public.student_risk_evaluations e
    WHERE e.class_record_id = NEW.class_record_id
      AND e.term = ANY (v_terms)
      AND e.closure_state IS NULL
      -- Published only. A plan the student has never seen cannot be reported
      -- to them as nearly overdue.
      AND e.status IN ('submitted', 'acknowledged_by_student')
      AND e.published_to_student_at IS NOT NULL
  LOOP
    v_state := public.aspire_evaluation_student_state(v_row.advising_plan);
    CONTINUE WHEN v_state = 'complete';

    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      v_row.student_id, 'plan_due', 'Finish Your Action Plan', '/student/facultyadvising',
      CASE WHEN v_state = 'tasks_outstanding' THEN 'warning' ELSE 'info' END,
      CASE WHEN v_state = 'tasks_outstanding'
        THEN format(
          'Your %s for %s has been posted and you still have unfinished tasks in your action plan. Complete them before your instructor finalizes this period. Once it is final the plan closes, and any question about your grade has to go through a formal grade change request instead.',
          v_label, COALESCE(v_subject, 'this class'))
        ELSE format(
          'Your %s for %s has been posted. You have reported every task in your action plan and your instructor still has to verify them. Nothing more is needed from you.',
          v_label, COALESCE(v_subject, 'this class'))
      END,
      jsonb_build_object(
        'evaluation_id', v_row.evaluation_id,
        'class_record_id', NEW.class_record_id,
        'term', v_row.term,
        'grade_period', NEW.grade_period::TEXT,
        'student_state', v_state
      ),
      -- One per evaluation per milestone, as agreed. Re-posting a milestone
      -- must not send it twice.
      format('plan_due:%s:%s', v_row.evaluation_id, NEW.grade_period::TEXT),
      FALSE
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_warn_open_plans_on_post ON public.grade_consultation_windows;
CREATE TRIGGER trg_warn_open_plans_on_post
  AFTER INSERT ON public.grade_consultation_windows
  FOR EACH ROW EXECUTE FUNCTION public.aspire_warn_open_plans_on_post();

-- -----------------------------------------------------------------------------
-- 3. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_warn_open_plans_on_post'
      AND tgrelid = 'public.grade_consultation_windows'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: posting a milestone does not warn students with open plans.';
  END IF;

  -- The window-opening trigger is what makes this reachable at all.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_open_consultation_window'
      AND tgrelid = 'public.posted_grades'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: trg_open_consultation_window is missing, so no window is inserted on posting and this warning can never fire.';
  END IF;

  -- The three states must be distinguishable, or the wrong person is told to act.
  IF public.aspire_evaluation_student_state(
       '[{"completed":true,"verification_status":"verified"}]'::JSONB) <> 'complete'
     OR public.aspire_evaluation_student_state(
       '[{"completed":true}]'::JSONB) <> 'awaiting_verification'
     OR public.aspire_evaluation_student_state(
       '[{"completed":true,"verification_status":"verified"},{"completed":false}]'::JSONB) <> 'tasks_outstanding'
     OR public.aspire_evaluation_student_state('[]'::JSONB) <> 'tasks_outstanding'
     -- NULL and JSON null, both of which read as "no plan", not "complete".
     OR public.aspire_evaluation_student_state(NULL) <> 'tasks_outstanding'
     OR public.aspire_evaluation_student_state('null'::JSONB) <> 'tasks_outstanding'
  THEN
    RAISE EXCEPTION 'Verification failed: the student-state rule cannot tell whose move it is.';
  END IF;

  RAISE NOTICE 'Students with an open plan are now warned when the milestone is posted, not when it is finalized.';
END
$verify$;

COMMIT;
