-- =============================================================================
-- ASPIRE STUDENT RISK: PRIVACY-SAFE FACULTY NOTES
-- =============================================================================
-- Implements SR-001/SR-002:
--   * separates student-visible guidance from restricted faculty notes;
--   * removes legacy private-note content from the student-readable table;
--   * enables RLS for evaluations and private notes;
--   * exposes narrow transactional RPCs for faculty, student, and dean actions.

BEGIN;

ALTER TABLE public.student_risk_evaluations
  ADD COLUMN IF NOT EXISTS shared_academic_feedback TEXT,
  ADD COLUMN IF NOT EXISTS published_to_student_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE public.student_risk_evaluations
  ALTER COLUMN professor_notes DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.student_risk_private_notes (
  note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.student_risk_evaluations(evaluation_id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  note_text TEXT NOT NULL CHECK (length(btrim(note_text)) > 0),
  retention_class TEXT NOT NULL DEFAULT 'academic_intervention',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (evaluation_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_student_risk_private_notes_evaluation
  ON public.student_risk_private_notes(evaluation_id);

CREATE INDEX IF NOT EXISTS idx_student_risk_private_notes_author
  ON public.student_risk_private_notes(author_id);

-- Existing professor_notes are private by default. Copy and verify before clearing
-- the legacy column so a student-readable evaluation row contains no private text.
INSERT INTO public.student_risk_private_notes (
  evaluation_id,
  author_id,
  note_text,
  retention_class,
  created_at,
  updated_at
)
SELECT
  evaluation_id,
  faculty_id,
  professor_notes,
  'legacy_professor_note',
  created_at,
  updated_at
FROM public.student_risk_evaluations
WHERE NULLIF(btrim(professor_notes), '') IS NOT NULL
ON CONFLICT (evaluation_id, author_id) DO UPDATE
SET note_text = EXCLUDED.note_text,
    retention_class = EXCLUDED.retention_class,
    updated_at = EXCLUDED.updated_at;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.student_risk_evaluations evaluation
    WHERE NULLIF(btrim(evaluation.professor_notes), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_risk_private_notes note
        WHERE note.evaluation_id = evaluation.evaluation_id
          AND note.author_id = evaluation.faculty_id
          AND note.note_text = evaluation.professor_notes
      )
  ) THEN
    RAISE EXCEPTION 'Private-note migration verification failed; legacy notes were not cleared.';
  END IF;
END;
$$;

UPDATE public.student_risk_evaluations
SET professor_notes = NULL
WHERE professor_notes IS NOT NULL;

ALTER TABLE public.student_risk_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_risk_private_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS risk_evaluations_student_select ON public.student_risk_evaluations;
CREATE POLICY risk_evaluations_student_select
ON public.student_risk_evaluations
FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  AND status <> 'draft'
);

DROP POLICY IF EXISTS risk_evaluations_faculty_select ON public.student_risk_evaluations;
CREATE POLICY risk_evaluations_faculty_select
ON public.student_risk_evaluations
FOR SELECT TO authenticated
USING (
  faculty_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.class_records class_record
    WHERE class_record.class_record_id = student_risk_evaluations.class_record_id
      AND class_record.faculty_id = auth.uid()
  )
);

DROP POLICY IF EXISTS risk_evaluations_dean_select ON public.student_risk_evaluations;
CREATE POLICY risk_evaluations_dean_select
ON public.student_risk_evaluations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users actor
    JOIN public.class_records class_record
      ON class_record.class_record_id = student_risk_evaluations.class_record_id
    JOIN public.sections section
      ON section.section_id = class_record.section_id
    WHERE actor.user_id = auth.uid()
      AND actor.role = 'dean'
      AND actor.department_id = section.department_id
  )
);

DROP POLICY IF EXISTS risk_evaluations_admin_select ON public.student_risk_evaluations;
CREATE POLICY risk_evaluations_admin_select
ON public.student_risk_evaluations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users actor
    WHERE actor.user_id = auth.uid()
      AND actor.role = 'admin'
  )
);

DROP POLICY IF EXISTS risk_private_notes_faculty_select ON public.student_risk_private_notes;
CREATE POLICY risk_private_notes_faculty_select
ON public.student_risk_private_notes
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.student_risk_evaluations evaluation
    JOIN public.class_records class_record
      ON class_record.class_record_id = evaluation.class_record_id
    WHERE evaluation.evaluation_id = student_risk_private_notes.evaluation_id
      AND (
        evaluation.faculty_id = auth.uid()
        OR class_record.faculty_id = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS risk_private_notes_dean_select ON public.student_risk_private_notes;
CREATE POLICY risk_private_notes_dean_select
ON public.student_risk_private_notes
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.student_risk_evaluations evaluation
    JOIN public.class_records class_record
      ON class_record.class_record_id = evaluation.class_record_id
    JOIN public.sections section
      ON section.section_id = class_record.section_id
    JOIN public.users actor
      ON actor.user_id = auth.uid()
    WHERE evaluation.evaluation_id = student_risk_private_notes.evaluation_id
      AND actor.role = 'dean'
      AND actor.department_id = section.department_id
  )
);

DROP POLICY IF EXISTS risk_private_notes_admin_select ON public.student_risk_private_notes;
CREATE POLICY risk_private_notes_admin_select
ON public.student_risk_private_notes
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users actor
    WHERE actor.user_id = auth.uid()
      AND actor.role = 'admin'
  )
);

CREATE OR REPLACE FUNCTION public.submit_student_risk_evaluation(
  p_class_record_id UUID,
  p_student_id UUID,
  p_term TEXT,
  p_evaluation_context TEXT,
  p_risk_level TEXT,
  p_risk_score NUMERIC,
  p_risk_breakdown JSONB,
  p_shared_academic_feedback TEXT,
  p_private_note TEXT,
  p_advising_plan JSONB DEFAULT '[]'::JSONB,
  p_baseline_snapshot JSONB DEFAULT '{}'::JSONB,
  p_refer_to_dean BOOLEAN DEFAULT FALSE,
  p_status TEXT DEFAULT 'submitted'
)
RETURNS public.student_risk_evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT;
  v_class_faculty_id UUID;
  v_evaluation public.student_risk_evaluations;
BEGIN
  SELECT role::TEXT
  INTO v_actor_role
  FROM public.users
  WHERE user_id = v_actor_id;

  SELECT faculty_id
  INTO v_class_faculty_id
  FROM public.class_records
  WHERE class_record_id = p_class_record_id;

  IF v_actor_id IS NULL
     OR v_actor_role NOT IN ('faculty', 'admin')
     OR v_class_faculty_id IS NULL
     OR (v_actor_role = 'faculty' AND v_class_faculty_id <> v_actor_id) THEN
    RAISE EXCEPTION 'Not authorized to submit this student risk evaluation.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = p_student_id AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'The target student does not exist.';
  END IF;

  IF NULLIF(btrim(p_shared_academic_feedback), '') IS NULL THEN
    RAISE EXCEPTION 'Student-visible academic feedback is required.';
  END IF;

  IF NULLIF(btrim(p_private_note), '') IS NULL THEN
    RAISE EXCEPTION 'A restricted faculty note is required.';
  END IF;

  INSERT INTO public.student_risk_evaluations (
    class_record_id,
    student_id,
    faculty_id,
    term,
    evaluation_context,
    risk_level,
    risk_score,
    risk_breakdown,
    shared_academic_feedback,
    advising_plan,
    baseline_snapshot,
    refer_to_dean,
    status,
    published_to_student_at,
    published_by,
    updated_at
  ) VALUES (
    p_class_record_id,
    p_student_id,
    v_class_faculty_id,
    p_term,
    p_evaluation_context,
    p_risk_level,
    p_risk_score,
    COALESCE(p_risk_breakdown, '{}'::JSONB),
    btrim(p_shared_academic_feedback),
    COALESCE(p_advising_plan, '[]'::JSONB),
    COALESCE(p_baseline_snapshot, '{}'::JSONB),
    COALESCE(p_refer_to_dean, FALSE),
    p_status,
    CASE WHEN p_status = 'draft' THEN NULL ELSE CURRENT_TIMESTAMP END,
    CASE WHEN p_status = 'draft' THEN NULL ELSE v_actor_id END,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (class_record_id, student_id, term) DO UPDATE
  SET faculty_id = EXCLUDED.faculty_id,
      evaluation_context = EXCLUDED.evaluation_context,
      risk_level = EXCLUDED.risk_level,
      risk_score = EXCLUDED.risk_score,
      risk_breakdown = EXCLUDED.risk_breakdown,
      shared_academic_feedback = EXCLUDED.shared_academic_feedback,
      advising_plan = EXCLUDED.advising_plan,
      baseline_snapshot = EXCLUDED.baseline_snapshot,
      refer_to_dean = EXCLUDED.refer_to_dean,
      status = EXCLUDED.status,
      published_to_student_at = EXCLUDED.published_to_student_at,
      published_by = EXCLUDED.published_by,
      updated_at = CURRENT_TIMESTAMP
  RETURNING * INTO v_evaluation;

  INSERT INTO public.student_risk_private_notes (
    evaluation_id,
    author_id,
    note_text,
    retention_class,
    updated_at
  ) VALUES (
    v_evaluation.evaluation_id,
    v_actor_id,
    btrim(p_private_note),
    'academic_intervention',
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (evaluation_id, author_id) DO UPDATE
  SET note_text = EXCLUDED.note_text,
      retention_class = EXCLUDED.retention_class,
      updated_at = CURRENT_TIMESTAMP;

  RETURN v_evaluation;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_legacy_advising_task_completion(
  p_evaluation_id UUID,
  p_task_id TEXT,
  p_completed BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan JSONB;
  v_updated_plan JSONB;
BEGIN
  SELECT advising_plan
  INTO v_plan
  FROM public.student_risk_evaluations
  WHERE evaluation_id = p_evaluation_id
    AND student_id = auth.uid()
    AND status <> 'draft'
  FOR UPDATE;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Evaluation not found or task update is not authorized.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_plan) AS item(task)
    WHERE task->>'task_id' = p_task_id
  ) THEN
    RAISE EXCEPTION 'Intervention task not found.';
  END IF;

  SELECT jsonb_agg(
    CASE
      WHEN task->>'task_id' = p_task_id THEN
        jsonb_set(
          jsonb_set(task, '{completed}', to_jsonb(p_completed), TRUE),
          '{completed_at}',
          CASE
            WHEN p_completed THEN to_jsonb(CURRENT_TIMESTAMP)
            ELSE 'null'::JSONB
          END,
          TRUE
        )
      ELSE task
    END
    ORDER BY ordinal
  )
  INTO v_updated_plan
  FROM jsonb_array_elements(v_plan) WITH ORDINALITY AS plan(task, ordinal);

  UPDATE public.student_risk_evaluations
  SET advising_plan = COALESCE(v_updated_plan, '[]'::JSONB),
      updated_at = CURRENT_TIMESTAMP
  WHERE evaluation_id = p_evaluation_id;

  RETURN COALESCE(v_updated_plan, '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_student_risk_evaluation(
  p_evaluation_id UUID,
  p_refer_to_dean BOOLEAN,
  p_requires_tutoring BOOLEAN,
  p_status TEXT
)
RETURNS public.student_risk_evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_evaluation public.student_risk_evaluations;
BEGIN
  IF p_status NOT IN ('submitted', 'acknowledged_by_student') THEN
    RAISE EXCEPTION 'Unsupported evaluation status.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_risk_evaluations evaluation
    JOIN public.class_records class_record
      ON class_record.class_record_id = evaluation.class_record_id
    JOIN public.sections section
      ON section.section_id = class_record.section_id
    JOIN public.users actor
      ON actor.user_id = auth.uid()
    WHERE evaluation.evaluation_id = p_evaluation_id
      AND (
        actor.role = 'admin'
        OR (actor.role = 'dean' AND actor.department_id = section.department_id)
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to review this student risk evaluation.';
  END IF;

  UPDATE public.student_risk_evaluations
  SET refer_to_dean = p_refer_to_dean,
      requires_tutoring = p_requires_tutoring,
      status = p_status,
      updated_at = CURRENT_TIMESTAMP
  WHERE evaluation_id = p_evaluation_id
  RETURNING * INTO v_evaluation;

  RETURN v_evaluation;
END;
$$;

REVOKE ALL ON public.student_risk_evaluations FROM anon, authenticated;
REVOKE ALL ON public.student_risk_private_notes FROM anon, authenticated;
GRANT SELECT ON public.student_risk_evaluations TO authenticated;
GRANT SELECT ON public.student_risk_private_notes TO authenticated;

REVOKE ALL ON FUNCTION public.submit_student_risk_evaluation(
  UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, JSONB, TEXT, TEXT, JSONB, JSONB, BOOLEAN, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_student_risk_evaluation(
  UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, JSONB, TEXT, TEXT, JSONB, JSONB, BOOLEAN, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.set_legacy_advising_task_completion(UUID, TEXT, BOOLEAN)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_legacy_advising_task_completion(UUID, TEXT, BOOLEAN)
TO authenticated;

REVOKE ALL ON FUNCTION public.review_student_risk_evaluation(UUID, BOOLEAN, BOOLEAN, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_student_risk_evaluation(UUID, BOOLEAN, BOOLEAN, TEXT)
TO authenticated;

COMMIT;
