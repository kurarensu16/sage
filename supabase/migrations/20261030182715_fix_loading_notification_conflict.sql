-- Fix: faculty loading could not be opened — ON CONFLICT could not find the index
-- =============================================================================
-- 2026-10-30. Opening any college in Faculty Loading & Provisioning failed with
--
--   42P10  there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- WHY, EXACTLY
-- notifications.dedupe_key is covered by a PARTIAL unique index:
--
--   CREATE UNIQUE INDEX notifications_dedupe ON public.notifications
--     USING btree (dedupe_key) WHERE (dedupe_key IS NOT NULL)
--
-- PostgreSQL will only infer a partial index for ON CONFLICT when the clause
-- carries a predicate that matches the index's own. Ten other migrations in
-- this project write it correctly:
--
--   ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
--
-- The faculty loading migration omitted the WHERE in four places, across two
-- functions. Without it the planner finds no usable arbiter and raises 42P10 —
-- the index is there and is entirely healthy; the statement simply never
-- referred to it.
--
-- WHAT IT BROKE
--   notify_loading_session_started  — called by acquire_provisioning_lock, so
--                                     NO college could be opened for loading
--   notify_load_finalized           — would have failed when finalizing a draft
--
-- The first was disguised: the workspace's lock state defaulted to "not
-- acquired", and its banner read that as "another user is editing". So a failed
-- notification presented as a colleague holding the college. The UI half of
-- that is fixed in FacultyLoadingWorkspace.jsx in the same change.
--
-- The function bodies are PATCHED FROM THEIR LIVE DEFINITIONS rather than
-- restated, so the several hundred lines around these four statements cannot
-- drift in the process, and the substitution count is asserted — a patch that
-- matched nothing would otherwise COMMIT silently and look like it worked.

BEGIN;

DO $patch$
DECLARE
  v_name TEXT;
  v_def TEXT;
  v_new TEXT;
  v_fixed INTEGER;
  v_total INTEGER := 0;
  v_old CONSTANT TEXT := 'ON CONFLICT (dedupe_key) DO NOTHING';
  v_good CONSTANT TEXT := 'ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING';
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'public.notify_loading_session_started(uuid)',
    'public.notify_load_finalized(uuid)'
  ] LOOP
    IF to_regprocedure(v_name) IS NULL THEN
      RAISE EXCEPTION 'Aborted: % is missing. Apply 20261029093613 first.', v_name;
    END IF;

    v_def := pg_get_functiondef(to_regprocedure(v_name));

    -- Already correct, or already patched by an earlier run of this file.
    IF position(v_old IN v_def) = 0 THEN
      IF position(v_good IN v_def) > 0 THEN
        RAISE NOTICE '% already uses the partial-index predicate.', v_name;
        CONTINUE;
      END IF;
      RAISE EXCEPTION
        'Aborted: % contains neither form of the ON CONFLICT clause this patch expects. It was not changed.', v_name;
    END IF;

    v_new := replace(v_def, v_old, v_good);

    -- replace() is global, so this counts every occurrence it corrected.
    v_fixed := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    IF v_fixed = 0 THEN
      RAISE EXCEPTION 'Aborted: the patch replaced nothing in %.', v_name;
    END IF;

    EXECUTE v_new;
    v_total := v_total + v_fixed;
    RAISE NOTICE 'Patched % occurrence(s) in %.', v_fixed, v_name;
  END LOOP;

  IF v_total = 0 THEN
    RAISE NOTICE 'Nothing to patch; both functions were already correct.';
  END IF;
END;
$patch$;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_name TEXT;
  v_def TEXT;
  v_dept UUID;
BEGIN
  -- 1. The bad form is gone from both.
  FOREACH v_name IN ARRAY ARRAY[
    'public.notify_loading_session_started(uuid)',
    'public.notify_load_finalized(uuid)'
  ] LOOP
    v_def := pg_get_functiondef(to_regprocedure(v_name));
    IF position('ON CONFLICT (dedupe_key) DO NOTHING' IN v_def) > 0 THEN
      RAISE EXCEPTION 'Verification failed: % still omits the partial-index predicate.', v_name;
    END IF;
    IF position('ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING' IN v_def) = 0 THEN
      RAISE EXCEPTION 'Verification failed: % no longer contains the expected ON CONFLICT clause at all.', v_name;
    END IF;
  END LOOP;

  -- 2. The index the clause now refers to exists, and is partial. Without the
  --    predicate on the INDEX, the predicate on the STATEMENT would fail too.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%(dedupe_key)%'
      AND indexdef ILIKE '%dedupe_key IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: the partial unique index on notifications.dedupe_key is missing. The patched clause cannot resolve without it.';
  END IF;

  -- 3. Prove the statement actually runs, rather than only reading right.
  --    Inserted and rolled back, so nothing is left behind: a verification that
  --    merely greps the source is what let this ship broken in the first place.
  SELECT department_id INTO v_dept FROM public.departments LIMIT 1;
  IF v_dept IS NULL THEN
    RAISE NOTICE 'No departments exist, so the live insert could not be exercised. Open a college in Faculty Loading to confirm.';
  ELSE
    BEGIN
      INSERT INTO public.notifications (recipient_id, type, title, message, link, dedupe_key)
      SELECT u.user_id, 'system', 'ON CONFLICT probe', 'rolled back', '/',
             'probe:' || gen_random_uuid()::TEXT
      FROM public.users u LIMIT 1
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

      RAISE EXCEPTION USING ERRCODE = 'ASPRB', MESSAGE = 'probe ok';
    EXCEPTION
      WHEN SQLSTATE 'ASPRB' THEN
        RAISE NOTICE 'ON CONFLICT clause executes correctly against the partial index.';
      WHEN SQLSTATE '42P10' THEN
        RAISE EXCEPTION 'Verification failed: the ON CONFLICT clause still cannot find the index.';
    END;
  END IF;

  RAISE NOTICE 'Faculty loading notifications fixed. Opening a college should now work.';
END;
$verify$;

COMMIT;
