-- =============================================================================
-- ASPIRE: ENFORCE THE OFFICIAL SG BASIS LOCK
-- =============================================================================
-- An official Semestral Grade closes its score basis regardless of a stale
-- legacy is_locked flag. MR and TFR remain faculty-revisable until SG exists.

BEGIN;

-- Normalize legacy SG rows that were left open by the retired correction flow.
-- That trigger rejects an unchanged relock, so suspend it only for this backfill.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.posted_grades'::regclass
      AND tgname = 'trg_enforce_sg_correction_application'
      AND NOT tgisinternal
  ) THEN
    ALTER TABLE public.posted_grades DISABLE TRIGGER trg_enforce_sg_correction_application;
  END IF;
END;
$$;

UPDATE public.posted_grades
SET is_locked = TRUE
WHERE grade_period::TEXT = 'semestral_grade'
  AND is_locked IS DISTINCT FROM TRUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.posted_grades'::regclass
      AND tgname = 'trg_enforce_sg_correction_application'
      AND NOT tgisinternal
  ) THEN
    ALTER TABLE public.posted_grades ENABLE TRIGGER trg_enforce_sg_correction_application;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.aspire_assert_grade_basis_mutable(
  p_class_record_id UUID,
  p_student_id UUID,
  p_term TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('aspire.grade_posting_context', TRUE) IN ('posting', 'correction') THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.posted_grades grade
    WHERE grade.class_record_id = p_class_record_id
      AND grade.student_id = p_student_id
      AND grade.grade_period::TEXT = 'semestral_grade'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'This student''s official SG basis is locked. Use the approved SG correction workflow.';
  END IF;

  -- p_term remains part of the shared trigger contract. MR/TFR rows do not
  -- lock score input; faculty may revise and re-post them until SG exists.
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_locked_sg_class_configuration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class_record_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_class_record_id := OLD.class_record_id;
  ELSE
    v_class_record_id := NEW.class_record_id;
  END IF;

  IF current_setting('aspire.grade_posting_context', TRUE) IN ('posting', 'correction') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.posted_grades grade
    WHERE grade.class_record_id = v_class_record_id
      AND grade.grade_period::TEXT = 'semestral_grade'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'This class configuration is frozen because official SG records exist.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_assert_grade_basis_mutable(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_locked_sg_class_configuration()
  FROM PUBLIC, anon, authenticated;

COMMIT;
