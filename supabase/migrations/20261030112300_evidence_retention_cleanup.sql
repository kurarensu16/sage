-- Phase 6c — Evidence retention: make the cleanup actually run
-- =============================================================================
-- 2026-10-30. Found by a static audit of Phase 6, not by a failure.
--
-- WHAT WAS MISSING
-- 20261030105114 added aspire_expired_evidence(), which IDENTIFIES evidence
-- whose term has rolled over twice. Nothing ever called it, and nothing could
-- have finished the job if it had:
--
--   * authenticated has DELETE revoked on grade_change_evidence, so the rows
--     could not be removed from the browser;
--   * the grade-evidence delete policy is scoped to the uploader's own prefix
--     (split_part(name,'/',1) = auth.uid()), so an administrator could not
--     remove another student's file from the bucket.
--
-- So evidence accumulated with no way out. Evidence is REQUIRED on every
-- dispute, so that is one to three files per dispute, forever, against a free
-- tier measured in gigabytes.
--
-- ORDER MATTERS
-- The files are deleted from the bucket FIRST and the rows only afterwards. The
-- row is what identifies a file as expired, so dropping it first would leave
-- bytes in the bucket that nothing could ever name again. Done in this order a
-- failed run simply leaves the rows in place and the next run retries them.
--
-- ALSO HERE
-- A user-facing message in apply_approved_milestone_correction interpolated the
-- raw status value, so a user could be shown "This one is pending_dean_review."
-- Patched in place rather than by restating the function.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. One definition of "expired"
-- -----------------------------------------------------------------------------
-- Path-based, because a storage policy only ever has the object's name to work
-- with. The same shape as aspire_is_orphan_storage_path(), which the avatars
-- cleanup already uses, so both buckets are reasoned about the same way.
--
-- SECURITY DEFINER because a policy on storage.objects must be able to consult
-- public tables regardless of who is deleting.
CREATE OR REPLACE FUNCTION public.aspire_is_expired_evidence_path(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.grade_change_evidence e
    JOIN public.remark_override_requests r ON r.request_id = e.request_id
    JOIN public.class_records c ON c.class_record_id = r.class_record_id
    LEFT JOIN public.academic_terms t
      ON t.term_id = c.term_id
      OR (c.term_id IS NULL AND t.school_year = c.school_year AND t.semester::TEXT = c.semester::TEXT)
    WHERE e.object_key = p_name
      AND r.status IN ('applied', 'rejected', 'cancelled')
      AND t.ended_at IS NOT NULL
      -- Not this term's rollover, but the one after it, so a live dispute never
      -- loses the proof it depends on.
      AND EXISTS (
        SELECT 1 FROM public.academic_terms later
        WHERE later.ended_at IS NOT NULL AND later.ended_at > t.ended_at
      )
  );
$$;

REVOKE ALL ON FUNCTION public.aspire_is_expired_evidence_path(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_is_expired_evidence_path(TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Removing the rows
-- -----------------------------------------------------------------------------
-- Takes the ids the caller just cleared from the bucket, but does NOT trust
-- them: each one is re-checked against the same predicate the policy uses. A
-- caller cannot widen the deletion by passing extra ids.
CREATE OR REPLACE FUNCTION public.aspire_purge_evidence(p_evidence_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_removed INTEGER := 0;
BEGIN
  IF NOT (public.is_active_admin() OR public.is_active_registrar()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an administrator or the Registrar can clear expired evidence.';
  END IF;

  IF p_evidence_ids IS NULL OR array_length(p_evidence_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.grade_change_evidence e
  WHERE e.id = ANY (p_evidence_ids)
    AND public.aspire_is_expired_evidence_path(e.object_key);

  GET DIAGNOSTICS v_removed = ROW_COUNT;

  -- Counted, never itemised: which student disputed which grade is not
  -- something an audit of storage housekeeping needs to carry.
  IF v_removed > 0 THEN
    BEGIN
      INSERT INTO public.activity_logs (actor_id, action, message, actor)
      VALUES (
        auth.uid(),
        'Cleared expired evidence',
        FORMAT('%s evidence file(s) removed after the term rollover.', v_removed),
        COALESCE(
          (SELECT u.first_name || ' ' || u.last_name
             FROM public.users u WHERE u.user_id = auth.uid()),
          'System'
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- An audit write must never undo a successful cleanup.
      NULL;
    END;
  END IF;

  RETURN v_removed;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_purge_evidence(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_purge_evidence(UUID[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Letting the bytes go
-- -----------------------------------------------------------------------------
-- A fourth policy, added rather than replacing the student's own-prefix delete:
-- a student may still remove a file they uploaded, and an administrator or the
-- Registrar may additionally remove one that has expired. Nothing else.
--
-- Wrapped for the same reason the Phase 6 policies were: storage.objects is
-- owned by supabase_storage_admin, and whether this role may add policies to it
-- depends on how the project was provisioned.
DO $storage$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS grade_evidence_retention_delete ON storage.objects';
  EXECUTE $p$
    CREATE POLICY grade_evidence_retention_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'grade-evidence'
        AND (public.is_active_admin() OR public.is_active_registrar())
        AND public.aspire_is_expired_evidence_path(name)
      )
  $p$;

  RAISE NOTICE 'Evidence retention delete policy installed.';
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE WARNING
    'Could not add the retention policy to storage.objects (%). Expired evidence files will stay in the bucket until this policy is added by a role that owns storage.objects.',
    SQLERRM;
END;
$storage$;

-- -----------------------------------------------------------------------------
-- 4. A status token was reaching users
-- -----------------------------------------------------------------------------
-- 'Only an approved request can be applied. This one is ' || v_req.status
-- renders as "This one is pending_dean_review." STATUS_PRESENTATION exists in
-- the front end precisely so nobody sees those tokens; this message went around
-- it. Replaced with wording that says the same thing in the user's words, and
-- is more useful for it -- it names who still has to act.
--
-- Patched from the live definition rather than restated, so the other two
-- hundred lines of the function cannot drift in the process. The substitution
-- count is asserted: a patch that matched nothing would otherwise COMMIT
-- silently and look like it worked.
DO $patch$
DECLARE
  v_def TEXT;
  v_new TEXT;
  v_old_fragment TEXT :=
    '''Only an approved request can be applied. This one is '' || v_req.status || ''.''';
  v_new_fragment TEXT :=
    '''Only an approved request can be applied. '' || CASE v_req.status'
    || ' WHEN ''applied'' THEN ''This correction has already been made.'''
    || ' WHEN ''rejected'' THEN ''This request was not approved.'''
    || ' WHEN ''cancelled'' THEN ''The student withdrew this request.'''
    || ' WHEN ''pending_faculty_review'' THEN ''The instructor has not passed it on yet.'''
    || ' WHEN ''pending_dean_review'' THEN ''The Dean has not decided it yet.'''
    || ' WHEN ''pending_registrar_review'' THEN ''The Registrar still has to authorise it.'''
    || ' ELSE ''It is still being reviewed.'' END';
BEGIN
  SELECT pg_get_functiondef(to_regprocedure('public.apply_approved_milestone_correction(uuid,uuid,jsonb)'))
    INTO v_def;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Phase 6c aborted: apply_approved_milestone_correction is missing. Apply 20261030105114 first.';
  END IF;

  IF position(v_old_fragment IN v_def) = 0 THEN
    -- Already patched by an earlier run of this migration, or edited by hand.
    IF position('This correction has already been made.' IN v_def) > 0 THEN
      RAISE NOTICE 'Status message already patched; leaving it as it is.';
      RETURN;
    END IF;
    RAISE EXCEPTION
      'Phase 6c aborted: the status message in apply_approved_milestone_correction does not look the way this patch expects. It was not changed.';
  END IF;

  v_new := replace(v_def, v_old_fragment, v_new_fragment);

  IF v_new = v_def THEN
    RAISE EXCEPTION 'Phase 6c aborted: the status message patch replaced nothing.';
  END IF;

  EXECUTE v_new;
END;
$patch$;

-- -----------------------------------------------------------------------------
-- 5. Verification
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  IF to_regprocedure('public.aspire_is_expired_evidence_path(text)') IS NULL
     OR to_regprocedure('public.aspire_purge_evidence(uuid[])') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the retention functions are missing.';
  END IF;

  -- The purge must re-check expiry itself. Without this it would delete any row
  -- whose id was passed to it, and the whole retention rule would live in the
  -- caller rather than the database.
  SELECT pg_get_functiondef(to_regprocedure('public.aspire_purge_evidence(uuid[])')) INTO v_def;
  IF position('aspire_is_expired_evidence_path' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the purge does not re-check that the evidence has expired.';
  END IF;

  -- The token must be gone from the apply path.
  SELECT pg_get_functiondef(to_regprocedure('public.apply_approved_milestone_correction(uuid,uuid,jsonb)')) INTO v_def;
  IF position('This one is '' || v_req.status' IN v_def) > 0 THEN
    RAISE EXCEPTION 'Verification failed: the raw status value is still shown to users.';
  END IF;
  IF position('The Dean has not decided it yet.' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the replacement status wording is not present.';
  END IF;

  -- Reported, not fatal: without it the rows clear but the bytes stay, which is
  -- worth knowing loudly rather than discovering when the bucket fills.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'grade_evidence_retention_delete'
  ) THEN
    RAISE WARNING 'Expired evidence files cannot be removed from the bucket: the retention delete policy was not created. Add it from the Supabase Storage policy editor.';
  END IF;

  RAISE NOTICE 'Phase 6c installed. Expired evidence can now be cleared from Storage Health.';
END;
$verify$;

COMMIT;
