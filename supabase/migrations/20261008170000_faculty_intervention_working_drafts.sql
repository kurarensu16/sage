-- Persist faculty-reviewed intervention work without publishing it to students.
BEGIN;

CREATE TABLE IF NOT EXISTS public.faculty_intervention_working_drafts (
  working_draft_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  class_record_id UUID NOT NULL REFERENCES public.class_records(class_record_id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  term TEXT NOT NULL CHECK (term IN ('Prelim', 'Midterm', 'Semi-Final', 'Final')),
  evaluation_context TEXT NOT NULL DEFAULT 'academic_intervention',
  shared_academic_feedback TEXT NOT NULL DEFAULT '',
  private_note TEXT NOT NULL DEFAULT '',
  tasks JSONB NOT NULL,
  plan_deadline DATE,
  refer_to_dean BOOLEAN NOT NULL DEFAULT FALSE,
  referral_reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'submitted')),
  submitted_evaluation_id UUID REFERENCES public.student_risk_evaluations(evaluation_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (faculty_id, class_record_id, student_id, term),
  CHECK (jsonb_typeof(tasks) = 'array' AND jsonb_array_length(tasks) BETWEEN 1 AND 5),
  CHECK (char_length(shared_academic_feedback) <= 5000),
  CHECK (char_length(private_note) <= 5000),
  CHECK (char_length(referral_reason) <= 2000)
);

ALTER TABLE public.faculty_intervention_working_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.faculty_intervention_working_drafts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_faculty_intervention_working_draft(
  p_class_record_id UUID,
  p_student_id UUID,
  p_term TEXT,
  p_evaluation_context TEXT,
  p_shared_academic_feedback TEXT,
  p_private_note TEXT,
  p_tasks JSONB,
  p_plan_deadline DATE DEFAULT NULL,
  p_refer_to_dean BOOLEAN DEFAULT FALSE,
  p_referral_reason TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_class public.class_records%ROWTYPE;
  v_draft public.faculty_intervention_working_drafts%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required.';
  END IF;
  IF p_term NOT IN ('Prelim', 'Midterm', 'Semi-Final', 'Final') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Select a valid grading term.';
  END IF;
  IF jsonb_typeof(COALESCE(p_tasks, '[]'::JSONB)) <> 'array'
    OR jsonb_array_length(COALESCE(p_tasks, '[]'::JSONB)) NOT BETWEEN 1 AND 5
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A working draft must contain between one and five tasks.';
  END IF;
  IF char_length(COALESCE(p_shared_academic_feedback, '')) > 5000
    OR char_length(COALESCE(p_private_note, '')) > 5000
    OR char_length(COALESCE(p_referral_reason, '')) > 2000
  THEN
    RAISE EXCEPTION USING ERRCODE = '22001', MESSAGE = 'One or more draft fields exceed the accepted length.';
  END IF;

  SELECT class_record.* INTO v_class
  FROM public.class_records class_record
  WHERE class_record.class_record_id = p_class_record_id;

  IF NOT FOUND
    OR v_class.faculty_id IS DISTINCT FROM v_actor
    OR COALESCE(v_class.status::TEXT, '') <> 'active'
    OR NOT EXISTS (
      SELECT 1 FROM public.users actor
      WHERE actor.user_id = v_actor
        AND actor.role::TEXT = 'faculty'
        AND actor.status = 'active'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.enrollments enrollment
      WHERE enrollment.student_id = p_student_id
        AND enrollment.section_id = v_class.section_id
        AND enrollment.subject_id = v_class.subject_id
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the assigned faculty may save this student intervention draft.';
  END IF;

  INSERT INTO public.faculty_intervention_working_drafts (
    faculty_id, class_record_id, student_id, term, evaluation_context,
    shared_academic_feedback, private_note, tasks, plan_deadline,
    refer_to_dean, referral_reason, status, submitted_evaluation_id,
    created_at, updated_at
  ) VALUES (
    v_actor, p_class_record_id, p_student_id, p_term,
    COALESCE(NULLIF(BTRIM(p_evaluation_context), ''), 'academic_intervention'),
    COALESCE(p_shared_academic_feedback, ''), COALESCE(p_private_note, ''), p_tasks,
    p_plan_deadline, COALESCE(p_refer_to_dean, FALSE), COALESCE(p_referral_reason, ''),
    'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT (faculty_id, class_record_id, student_id, term) DO UPDATE SET
    evaluation_context = EXCLUDED.evaluation_context,
    shared_academic_feedback = EXCLUDED.shared_academic_feedback,
    private_note = EXCLUDED.private_note,
    tasks = EXCLUDED.tasks,
    plan_deadline = EXCLUDED.plan_deadline,
    refer_to_dean = EXCLUDED.refer_to_dean,
    referral_reason = EXCLUDED.referral_reason,
    status = 'active',
    submitted_evaluation_id = NULL,
    updated_at = CURRENT_TIMESTAMP
  RETURNING * INTO v_draft;

  RETURN jsonb_build_object(
    'working_draft_id', v_draft.working_draft_id,
    'status', v_draft.status,
    'updated_at', v_draft.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_faculty_intervention_working_draft(
  p_class_record_id UUID,
  p_student_id UUID,
  p_term TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_draft public.faculty_intervention_working_drafts%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.class_records class_record
    JOIN public.users actor ON actor.user_id = v_actor
    WHERE class_record.class_record_id = p_class_record_id
      AND class_record.faculty_id = v_actor
      AND actor.role::TEXT = 'faculty'
      AND actor.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the assigned faculty may load this student intervention draft.';
  END IF;

  SELECT draft.* INTO v_draft
  FROM public.faculty_intervention_working_drafts draft
  WHERE draft.faculty_id = v_actor
    AND draft.class_record_id = p_class_record_id
    AND draft.student_id = p_student_id
    AND draft.term = p_term
    AND draft.status = 'active';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'working_draft', TRUE,
    'working_draft_id', v_draft.working_draft_id,
    'evaluation_context', v_draft.evaluation_context,
    'shared_academic_feedback', v_draft.shared_academic_feedback,
    'private_note', v_draft.private_note,
    'tasks', v_draft.tasks,
    'plan_deadline', v_draft.plan_deadline,
    'refer_to_dean', v_draft.refer_to_dean,
    'referral_reason', v_draft.referral_reason,
    'updated_at', v_draft.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.link_submitted_intervention_working_draft()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::TEXT NOT IN ('submitted', 'pending_review') THEN
    RETURN NEW;
  END IF;

  UPDATE public.faculty_intervention_working_drafts draft
  SET status = 'submitted',
      submitted_evaluation_id = NEW.evaluation_id,
      updated_at = CURRENT_TIMESTAMP
  WHERE draft.faculty_id = NEW.faculty_id
    AND draft.class_record_id = NEW.class_record_id
    AND draft.student_id = NEW.student_id
    AND draft.term = NEW.term
    AND draft.status = 'active';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_submitted_intervention_working_draft ON public.student_risk_evaluations;
CREATE TRIGGER trg_link_submitted_intervention_working_draft
AFTER INSERT OR UPDATE OF status, advising_plan, shared_academic_feedback
ON public.student_risk_evaluations
FOR EACH ROW
EXECUTE FUNCTION public.link_submitted_intervention_working_draft();

REVOKE ALL ON FUNCTION public.save_faculty_intervention_working_draft(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, DATE, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_faculty_intervention_working_draft(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, DATE, BOOLEAN, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.get_faculty_intervention_working_draft(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_faculty_intervention_working_draft(UUID, UUID, TEXT) TO authenticated;

COMMIT;
