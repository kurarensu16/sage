-- =============================================================================
-- Finalizing a milestone closes the action plans behind it, and says so
-- =============================================================================
--
-- WHAT THIS ADDS
--   20261103090600 stopped a frozen period's plan from being edited. This one
--   records WHY it stopped, closes the referral raised from it, and tells the
--   three people who need to know.
--
--   This is the first migration in the set that writes data. It writes nothing
--   on install -- only when a milestone is finalized from here on.
--
-- WHERE IT HOOKS
--   grade_consultation_windows.finalized_at, not finalize_grade_milestone().
--   Hooking the column means a second finalize path added later cannot bypass
--   it, and it leaves the posting/finalizing functions untouched -- the same
--   reasoning trg_open_consultation_window already states for itself:
--   "posting is the most load-bearing code in the system and this keeps it
--   untouched."
--
-- WHY THE NOTIFICATIONS ARE IN THE SAME TRANSACTION
--   A closure whose notification was swallowed is the exact shape of B-02 and
--   B-04: the action reports success while the part the user would have seen
--   quietly failed. So a notification that cannot be written fails the
--   finalization, and the instructor retries. A student never told their plan
--   closed is worse than a click repeated.
--
-- WHY A REFERRAL CANNOT BE 'resolved' HERE
--   state was ('pending','resolved'), and 'resolved' requires resolved_by --
--   it asserts that a Dean looked at it and acted. Nobody did. A third value,
--   'closed', records the truth: it ended because its period ended.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. A referral can end without anyone having answered it.
-- -----------------------------------------------------------------------------
ALTER TABLE public.student_evaluation_referrals
  DROP CONSTRAINT IF EXISTS student_evaluation_referrals_state_check;
ALTER TABLE public.student_evaluation_referrals
  ADD CONSTRAINT student_evaluation_referrals_state_check
  CHECK (state IN ('pending', 'resolved', 'closed'));

-- The original paired constraint is unnamed, so it is found by definition and
-- replaced rather than guessed at.
DO $swap$
DECLARE v_name TEXT;
BEGIN
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'public.student_evaluation_referrals'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%resolved_at IS NOT NULL%'
    AND pg_get_constraintdef(oid) LIKE '%resolved_by%';

  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.student_evaluation_referrals DROP CONSTRAINT %I', v_name);
  END IF;

  -- 'closed' carries no resolver, exactly like 'pending': nobody acted.
  EXECUTE $c$
    ALTER TABLE public.student_evaluation_referrals
    ADD CONSTRAINT student_evaluation_referrals_resolution_check
    CHECK (
      (state IN ('pending', 'closed') AND resolved_at IS NULL AND resolved_by IS NULL)
      OR (state = 'resolved' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
    )
  $c$;
END
$swap$;

-- -----------------------------------------------------------------------------
-- 2. Close every open plan behind one milestone, and tell people.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_close_period_evaluations(
  p_class_record_id UUID,
  p_grade_period TEXT,
  p_event TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_terms   TEXT[] := public.aspire_milestone_terms(p_grade_period);
  v_row     RECORD;
  v_subject TEXT;
  v_label   TEXT := CASE p_grade_period
                      WHEN 'midterm_rating' THEN 'Midterm Rating'
                      WHEN 'tentative_final_rating' THEN 'Tentative Final Rating'
                      ELSE p_grade_period END;
  v_count   INTEGER := 0;
  v_dean    UUID;
BEGIN
  IF v_terms IS NULL OR array_length(v_terms, 1) IS NULL THEN
    RETURN 0;   -- semestral_grade covers no grading period of its own
  END IF;

  SELECT subject.code INTO v_subject
  FROM public.class_records class_record
  LEFT JOIN public.subjects subject ON subject.subject_id = class_record.subject_id
  WHERE class_record.class_record_id = p_class_record_id;

  -- The lock from 20261103090600 refuses ordinary edits to a frozen period.
  -- This is not one, and says so in the way every other guard on the grading
  -- tables expects.
  PERFORM set_config('aspire.evaluation_closure_context', 'closing', TRUE);

  FOR v_row IN
    UPDATE public.student_risk_evaluations e
    SET closure_state   = public.aspire_evaluation_closure_state(e.advising_plan),
        closed_at       = CURRENT_TIMESTAMP,
        closed_by_event = p_event,
        updated_at      = CURRENT_TIMESTAMP
    WHERE e.class_record_id = p_class_record_id
      AND e.term = ANY (v_terms)
      AND e.closure_state IS NULL
      -- A draft was never real, and a plan the student never saw cannot be
      -- reported to them as having closed.
      AND e.status IN ('submitted', 'acknowledged_by_student')
      AND e.published_to_student_at IS NOT NULL
    RETURNING e.*
  LOOP
    v_count := v_count + 1;

    -- A referral outlives its evaluation nowhere: it was raised about this
    -- period's intervention.
    UPDATE public.student_evaluation_referrals
    SET state = 'closed'
    WHERE evaluation_id = v_row.evaluation_id
      AND state = 'pending';

    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      v_row.student_id, 'plan_closed', 'Action Plan Closed', '/student/facultyadvising',
      CASE WHEN v_row.closure_state = 'closed_tasks_verified' THEN 'info' ELSE 'warning' END,
      CASE WHEN v_row.closure_state = 'closed_tasks_verified'
        THEN format('Your action plan for %s is closed. You completed every task and your instructor verified them. The %s is now final.',
                    COALESCE(v_subject, 'this class'), v_label)
        ELSE format('Your action plan for %s closed unfinished because the %s is now final. If you have a question about your grade, raise a grade change request.',
                    COALESCE(v_subject, 'this class'), v_label)
      END,
      jsonb_build_object(
        'evaluation_id', v_row.evaluation_id, 'class_record_id', p_class_record_id,
        'term', v_row.term, 'closure_state', v_row.closure_state,
        'grade_period', p_grade_period, 'event', p_event
      ),
      format('plan_closed:%s:student', v_row.evaluation_id),
      FALSE
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    IF v_row.faculty_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
      ) VALUES (
        v_row.faculty_id, 'plan_closed', 'Action Plan Closed', '/faculty/interventionrecords',
        CASE WHEN v_row.closure_state = 'closed_tasks_verified' THEN 'info' ELSE 'warning' END,
        format('An action plan in %s closed as %s when the %s was finalized.',
               COALESCE(v_subject, 'your class'),
               CASE WHEN v_row.closure_state = 'closed_tasks_verified' THEN 'completed and verified' ELSE 'unfinished' END,
               v_label),
        jsonb_build_object(
          'evaluation_id', v_row.evaluation_id, 'class_record_id', p_class_record_id,
          'student_id', v_row.student_id, 'closure_state', v_row.closure_state,
          'grade_period', p_grade_period, 'event', p_event
        ),
        format('plan_closed:%s:faculty', v_row.evaluation_id),
        FALSE
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;

    -- The Dean owns intervention oversight and the Intervention Results
    -- dashboard, so a plan that ended without an outcome is theirs to see.
    FOR v_dean IN
      SELECT actor.user_id
      FROM public.users actor
      JOIN public.class_records class_record ON class_record.class_record_id = p_class_record_id
      JOIN public.sections section ON section.section_id = class_record.section_id
      WHERE actor.role::TEXT = 'dean'
        AND COALESCE(actor.status::TEXT, 'active') = 'active'
        AND actor.department_id = section.department_id
    LOOP
      INSERT INTO public.notifications (
        recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
      ) VALUES (
        v_dean, 'plan_closed', 'Action Plan Closed', '/dean/interventionresults', 'info',
        format('An action plan in %s closed as %s at the %s.',
               COALESCE(v_subject, 'a class'),
               CASE WHEN v_row.closure_state = 'closed_tasks_verified' THEN 'completed and verified' ELSE 'unfinished' END,
               v_label),
        jsonb_build_object(
          'evaluation_id', v_row.evaluation_id, 'class_record_id', p_class_record_id,
          'closure_state', v_row.closure_state, 'grade_period', p_grade_period, 'event', p_event
        ),
        format('plan_closed:%s:dean:%s', v_row.evaluation_id, v_dean),
        FALSE
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END LOOP;
  END LOOP;

  PERFORM set_config('aspire.evaluation_closure_context', '', TRUE);
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_close_period_evaluations(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Fire it when a milestone is finalized.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_close_evaluations_on_finalize()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.finalized_at IS NOT NULL AND OLD.finalized_at IS NULL THEN
    PERFORM public.aspire_close_period_evaluations(
      NEW.class_record_id, NEW.grade_period::TEXT, 'milestone_finalized'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_evaluations_on_finalize ON public.grade_consultation_windows;
CREATE TRIGGER trg_close_evaluations_on_finalize
  AFTER UPDATE ON public.grade_consultation_windows
  FOR EACH ROW EXECUTE FUNCTION public.aspire_close_evaluations_on_finalize();

-- -----------------------------------------------------------------------------
-- 4. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE v_check TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_check
  FROM pg_constraint
  WHERE conrelid = 'public.student_evaluation_referrals'::regclass
    AND conname = 'student_evaluation_referrals_state_check';

  IF v_check IS NULL OR position('closed' IN v_check) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a referral cannot be closed without claiming someone resolved it.';
  END IF;

  -- 'closed' must not require a resolver, or the closure could never be written.
  SELECT pg_get_constraintdef(oid) INTO v_check
  FROM pg_constraint
  WHERE conrelid = 'public.student_evaluation_referrals'::regclass
    AND conname = 'student_evaluation_referrals_resolution_check';

  IF v_check IS NULL OR position('''closed''' IN v_check) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the resolution constraint does not admit a closed referral.';
  END IF;

  IF to_regprocedure('public.aspire_close_period_evaluations(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the closure worker was not created.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_close_evaluations_on_finalize'
      AND tgrelid = 'public.grade_consultation_windows'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: finalizing a milestone does not close its plans.';
  END IF;

  -- The lock from the previous migration must already exist, or this one
  -- would close plans that are still editable.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_block_frozen_period_evaluations'
      AND tgrelid = 'public.student_risk_evaluations'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: run 20261103090600 first — the lock it installs is what makes this closure final.';
  END IF;

  RAISE NOTICE 'Finalizing a milestone now closes its action plans and notifies the student, the instructor and the Dean.';
END
$verify$;

COMMIT;
