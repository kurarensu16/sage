-- =============================================================================
-- The instructor verifying a task may read the file attached to it
-- =============================================================================
--
-- THE BUG
--   grade_evidence_read, written in 20261030104405 for the grade-change chain,
--   allows a SELECT on a grade-evidence object in exactly two cases:
--
--     split_part(name, '/', 1) = auth.uid()::TEXT      -- your own folder
--     EXISTS (... FROM grade_change_evidence ...)      -- attached to a dispute
--
--   Intervention task evidence is neither. It lives inside
--   student_risk_evaluations.advising_plan as JSONB, so the faculty member who
--   must verify the task could not read the proof:
--
--     POST /storage/v1/object/sign/grade-evidence/<key>  ->  400 Object not found
--
--   Storage reports an RLS refusal as "Object not found" rather than as a
--   permission error, so the failure read like a missing upload. The file was
--   there the whole time. The student's "Proof attached" line comes from the
--   JSONB and never touched storage, which is why only one side looked broken.
--
-- WHY THE RULE IS NOT RESTATED HERE
--   The helper is SECURITY INVOKER, so its SELECT on student_risk_evaluations
--   goes through that table's own four policies -- student, assigned faculty,
--   department dean, admin. Who may read the proof is therefore, by
--   construction, whoever may read the evaluation that asked for it. A
--   SECURITY DEFINER copy of those rules would be a second definition to keep
--   in step, and this file is being written precisely because one such
--   definition fell behind.
--
--   This mirrors the grade_change_evidence arm above it, which defers to the
--   request's policy for the same reason.
--
-- COST
--   One scan of student_risk_evaluations per signed URL. Signing happens when a
--   reviewer clicks "View submitted work", not on render, and the table holds
--   one row per evaluated student per period. If that ever stops being cheap,
--   the answer is an index on the extracted object_key, not a wider policy.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Is this object the evidence on a task of an evaluation the caller can see?
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_can_read_task_evidence(p_object_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_risk_evaluations e
    CROSS JOIN LATERAL jsonb_array_elements(
      -- advising_plan is nullable and has held a bare object in older rows.
      -- jsonb_array_elements raises on either, which inside a policy would
      -- refuse every read in the bucket, not just this one.
      CASE WHEN jsonb_typeof(e.advising_plan) = 'array'
           THEN e.advising_plan
           ELSE '[]'::JSONB END
    ) AS t(task)
    WHERE t.task->'evidence'->>'object_key' = p_object_key
  );
$$;

REVOKE ALL ON FUNCTION public.aspire_can_read_task_evidence(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_can_read_task_evidence(TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Add the third arm. The first two are reproduced verbatim from
--    20261030104405 -- a policy cannot be altered in place, only replaced, so
--    dropping anything they allow would be a silent regression of the
--    grade-change chain.
-- -----------------------------------------------------------------------------
DO $storage$
BEGIN
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
          OR public.aspire_can_read_task_evidence(storage.objects.name)
        )
      )
  $p$;
END
$storage$;

-- -----------------------------------------------------------------------------
-- 3. Verify against the catalog, not against trust.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_policy TEXT;
BEGIN
  IF to_regprocedure('public.aspire_can_read_task_evidence(text)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the task-evidence helper was not created.';
  END IF;

  SELECT pg_get_expr(polqual, polrelid) INTO v_policy
  FROM pg_policy
  WHERE polname = 'grade_evidence_read'
    AND polrelid = 'storage.objects'::regclass;

  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'Verification failed: grade_evidence_read is missing from storage.objects.';
  END IF;

  -- All three arms, so a future rewrite of this policy cannot quietly drop one.
  IF position('aspire_can_read_task_evidence' IN v_policy) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the policy does not reach intervention task evidence.';
  END IF;

  IF position('grade_change_evidence' IN v_policy) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the grade-change arm was lost.';
  END IF;

  IF position('split_part' IN v_policy) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the uploader arm was lost.';
  END IF;

  RAISE NOTICE 'A verifying instructor can now open the proof attached to a task.';
END
$verify$;

COMMIT;
