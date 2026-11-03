-- =============================================================================
-- The Semestral Grade reminder linked to a route that does not exist
-- =============================================================================
--
-- THE BUG
--   20261103093749 sends each instructor a "Semestral Grade Still Outstanding"
--   notice with:
--
--     link = '/faculty/myclasses'
--
--   There is no such route. src/App.jsx defines /faculty/classrecordslist and
--   redirects /faculty/postedgrades and /faculty/enrollmentrequests to it;
--   everything else falls through to <Route path="*" element={<NotFound />} />.
--
--   Every other notification in this repo uses /faculty/classrecordslist
--   (20261010160000, 20261029093613). That one was the outlier.
--
--   So the notice fired correctly at the rollover, named the right class and
--   the right deadline, and then sent the instructor to a 404 -- which reads as
--   "the system is broken", not "here is the grade you owe".
--
-- WHY A SECOND MIGRATION RATHER THAN EDITING THE FIRST
--   20261103093749 has already run against the live database. A migration that
--   has run is a record of what happened; corrections are new migrations.
--
-- THE ROWS ALREADY SENT
--   Repaired by hand on 2026-11-03 immediately after the rollover:
--
--     UPDATE public.notifications SET link = '/faculty/classrecordslist'
--     WHERE type = 'term_rollover_reminder' AND link = '/faculty/myclasses';
--
--   Repeated below so a database restored from an earlier backup is corrected
--   too, rather than silently keeping the broken link.
--
-- RELATED, AND NOT FIXED HERE
--   Pointing at the right page is only half of it. ClassRecordsList.jsx loaded
--   classes strictly by term_id, so a class the rollover deliberately left
--   open was absent from the instructor's current-term view regardless of which
--   link brought them there. That is fixed in the same change, client-side.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Correct the function.
--
--    Patched from the DEPLOYED definition rather than re-declared from this
--    repo's copy: 20261029040940 rewrites function bodies in place, so the
--    migration file is not necessarily what the database is running. The
--    assertions make a silent no-op impossible.
-- -----------------------------------------------------------------------------
DO $patch$
DECLARE
  v_def  TEXT;
  v_old  CONSTANT TEXT := '/faculty/myclasses';
  v_new  CONSTANT TEXT := '/faculty/classrecordslist';
  v_hits INTEGER;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'aspire_remind_unposted_sg_on_rollover';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'aspire_remind_unposted_sg_on_rollover does not exist. Run 20261103093749 first.';
  END IF;

  IF position(v_old IN v_def) = 0 THEN
    RAISE NOTICE 'The reminder already points at a route that exists; nothing to do.';
    RETURN;
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION
      'Expected the broken link exactly once, found %. Re-read the deployed body before re-running.',
      v_hits;
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$patch$;

-- -----------------------------------------------------------------------------
-- 2. Repair any notice already sent.
--
--    Idempotent: a database where this was fixed by hand matches zero rows.
-- -----------------------------------------------------------------------------
UPDATE public.notifications
SET link = '/faculty/classrecordslist'
WHERE type = 'term_rollover_reminder'
  AND link = '/faculty/myclasses';

-- -----------------------------------------------------------------------------
-- 3. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def     TEXT;
  v_broken  INTEGER;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'aspire_remind_unposted_sg_on_rollover';

  IF position('/faculty/classrecordslist' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the reminder still does not name a route that exists.';
  END IF;

  IF position('/faculty/myclasses' IN v_def) > 0 THEN
    RAISE EXCEPTION 'Verification failed: the broken link survived the patch.';
  END IF;

  -- The rest of the function must have survived: it is the only thing that
  -- tells an instructor WHICH grade they owe, and by when.
  IF position('Semestral Grade Still Outstanding' IN v_def) = 0
     OR position('sg_grace_days' IN v_def) = 0
     OR position('dispute_grace_days' IN v_def) = 0
     OR position('Asia/Manila' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the reminder body did not survive the patch.';
  END IF;

  -- The trigger must still be attached, or the next rollover says nothing.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_remind_unposted_sg_on_rollover'
      AND tgrelid = 'public.academic_terms'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: the rollover reminder trigger is gone.';
  END IF;

  SELECT count(*) INTO v_broken
  FROM public.notifications
  WHERE link = '/faculty/myclasses';
  IF v_broken > 0 THEN
    RAISE EXCEPTION 'Verification failed: % notification(s) still link to a 404.', v_broken;
  END IF;

  RAISE NOTICE 'The Semestral Grade reminder now leads to the class list it names.';
END
$verify$;

COMMIT;
