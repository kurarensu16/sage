-- =============================================================================
-- Restore: disable every table's triggers before deleting any of them
-- =============================================================================
-- Date: 2026-11-06
--
-- WHAT WENT WRONG
-- Every restore and rehearsal since 2026-10-29 failed with SQLSTATE 42501,
-- "Correction linkage is managed only by the SG correction workflow" -- the
-- message from trg_enforce_sg_correction_application on posted_grades, a
-- BEFORE UPDATE trigger. The restore never issues an UPDATE on posted_grades
-- itself, so this looked impossible by inspection. A direct, rolled-back test
-- proved otherwise:
--
--   SET CONSTRAINTS ALL DEFERRED;
--   DELETE FROM remark_override_requests WHERE request_id = <referenced>;
--
-- raises the exact same error, with this CONTEXT:
--   UPDATE ONLY "posted_grades" SET "last_correction_request_id" = NULL
--   WHERE ... "last_correction_request_id" = $1
--
-- posted_grades.last_correction_request_id -> remark_override_requests is
-- ON DELETE SET NULL and DEFERRABLE (made so in 20261029215500, to let the
-- two tables refill in either order). But the deferred timing only postpones
-- the FK's existence *check* -- the SET NULL *action* itself still fires as
-- soon as the DELETE runs, immediately, regardless of SET CONSTRAINTS.
--
-- The old loop disabled and deleted one table at a time, in the same pass:
--   FOR each table: DISABLE TRIGGER USER; DELETE FROM that table;
-- aspire_backup_table_order() sorts "remark_override_requests" before
-- "posted_grades" (the FK between them is excluded from the ordering graph
-- because it is deferrable). So remark_override_requests was deleted while
-- posted_grades's own trigger was still enabled -- its turn in the loop had
-- not come yet -- and the SET NULL cascade's internal UPDATE tripped it.
--
-- HOW IT IS FIXED
-- Disabling and deleting are split into two full passes: every table's
-- triggers are disabled first, in one complete loop, before any table is
-- deleted. By the time the first DELETE runs, posted_grades's trigger (and
-- every other table's) is already off, so no cascade from any delete can
-- reach a live trigger regardless of which table is processed first.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.aspire_restore_backup(
  p_payload JSONB,
  p_rehearse BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
SET statement_timeout = '600s'
AS $fn$
DECLARE
  v_rec RECORD;
  v_entry JSONB;
  v_rows JSONB;
  v_expected BIGINT;
  v_inserted BIGINT;
  v_total BIGINT := 0;
  v_tables INTEGER := 0;
  v_skipped JSONB := '[]'::JSONB;
  v_missing_logins INTEGER := 0;
  v_locks_cleared INTEGER := 0;
  v_settings_actor UUID;
  v_maint BOOLEAN;
  v_diffs JSONB;
  v_blocking INTEGER;
  v_report JSONB;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Only an administrator can restore a backup.';
  END IF;

  IF p_payload IS NULL OR p_payload->>'aspire_backup_version' IS NULL THEN
    RAISE EXCEPTION 'That file is not an ASPIRE backup.';
  END IF;
  IF (p_payload->>'aspire_backup_version')::INTEGER <> 2 THEN
    RAISE EXCEPTION 'That backup was made by a different version of ASPIRE and cannot be restored here.';
  END IF;
  IF jsonb_typeof(p_payload->'tables') <> 'array' THEN
    RAISE EXCEPTION 'That backup file is incomplete and cannot be restored.';
  END IF;

  -- Maintenance mode is the interlock. Without it, a user could post a grade
  -- into a table that has been emptied but not yet refilled. Asked through
  -- is_maintenance_active() so the gate and the banner cannot disagree about
  -- whether a scheduled window counts.
  v_maint := public.is_maintenance_active();
  IF NOT COALESCE(v_maint, FALSE) THEN
    RAISE EXCEPTION 'Turn on maintenance mode before restoring, so that no one else is using the system while it happens.';
  END IF;

  -- One restore at a time. Two admins restoring different files would otherwise
  -- serialise on row locks and the second would quietly overwrite the first's
  -- work -- both reporting success.
  IF NOT pg_try_advisory_xact_lock(hashtext('aspire_restore_backup')) THEN
    RAISE EXCEPTION 'Another restore is already running. Wait for it to finish before starting another.';
  END IF;

  -- Refuse incompatible backups before touching anything.
  v_diffs := public.aspire_compare_schema_shape(p_payload->'schema_shape');
  SELECT count(*) INTO v_blocking
  FROM jsonb_array_elements(v_diffs) d
  WHERE (d->>'blocking')::BOOLEAN;

  IF v_blocking > 0 THEN
    RAISE EXCEPTION
      'This backup does not fit the current database: % change(s) would make every record invalid. Nothing was changed. Check the backup before restoring it.',
      v_blocking;
  END IF;

  -- Refuse before touching anything if the order cannot be determined.
  IF EXISTS (SELECT 1 FROM public.aspire_backup_table_order() o WHERE o.sort_order < 0) THEN
    RAISE EXCEPTION 'The database tables cannot be put in a safe restore order. Nothing was changed.';
  END IF;

  -- Deferrable foreign keys are checked once, at commit, instead of after every
  -- statement. That is what lets the two tables in the posted_grades <->
  -- remark_override_requests cycle be refilled in either order. Non-deferrable
  -- constraints are untouched by this, so every other reference is still
  -- enforced immediately and the parents-first order still matters.
  --
  -- It does NOT defer a referenced table's ON DELETE SET NULL/CASCADE action --
  -- that fires the moment the parent row is deleted, regardless of this
  -- setting. Triggers being disabled everywhere before any delete runs (below)
  -- is what actually keeps that action from reaching a live trigger.
  SET CONSTRAINTS ALL DEFERRED;

  -- Everything that changes the database happens inside this block, so that
  -- raising at the end of a rehearsal rolls back every part of it -- including
  -- the lock clearing and the actor bookkeeping below. PL/pgSQL gives a block
  -- with an EXCEPTION clause its own subtransaction, which is exactly the undo
  -- a rehearsal needs.
  BEGIN
    -- ---------------------------------------------------------------------
    -- Release the skipped tables' references into tables about to be emptied.
    -- ---------------------------------------------------------------------
    -- Ephemeral by definition: a restore ends every editing session, and these
    -- rows expire on their own anyway. Clearing them also releases
    -- provisioning_locks.locked_by, which is NOT NULL and so cannot be nulled.
    DELETE FROM public.provisioning_locks WHERE ctid <> '(0,0)'::tid;
    GET DIAGNOSTICS v_locks_cleared = ROW_COUNT;

    -- Saved so the record of who did what survives, then reattached below for
    -- everyone the backup still contains. ON DELETE SET NULL clears these as
    -- the users table is emptied, so no explicit nulling is needed.
    CREATE TEMP TABLE _aspire_restore_actors ON COMMIT DROP AS
      SELECT b.id, b.performed_by
      FROM public.backup_runs b
      WHERE b.performed_by IS NOT NULL;

    SELECT s.updated_by INTO v_settings_actor
    FROM public.system_settings s WHERE s.id = 1;

    -- ---------------------------------------------------------------------
    -- Triggers off, every table, before any delete. A table's FK actions
    -- (ON DELETE SET NULL/CASCADE) fire immediately when a row it references
    -- is deleted, no matter what order the tables are processed in -- so
    -- every table must already have its own triggers disabled before the
    -- first DELETE runs anywhere, not just before its own.
    -- ---------------------------------------------------------------------
    FOR v_rec IN SELECT o.table_name FROM public.aspire_backup_table_order() o
    LOOP
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', v_rec.table_name);
    END LOOP;

    -- ---------------------------------------------------------------------
    -- Now empty everything, children before parents.
    -- ---------------------------------------------------------------------
    -- `WHERE ctid <> '(0,0)'` satisfies Supabase's safeupdate guard, which
    -- refuses an unqualified DELETE. It cannot be written `WHERE TRUE`: the
    -- planner folds a constant-true qualification away and the guard refuses it
    -- just the same. ctid is a column reference, so the comparison survives --
    -- and it matches every row, because item offsets begin at 1.
    FOR v_rec IN
      SELECT o.table_name FROM public.aspire_backup_table_order() o
      ORDER BY o.sort_order DESC, o.table_name DESC
    LOOP
      EXECUTE format('DELETE FROM public.%I WHERE ctid <> ''(0,0)''::tid', v_rec.table_name);
    END LOOP;

    -- ---------------------------------------------------------------------
    -- Refill, parents before children.
    -- ---------------------------------------------------------------------
    FOR v_rec IN
      SELECT o.table_name FROM public.aspire_backup_table_order() o
      ORDER BY o.sort_order, o.table_name
    LOOP
      SELECT t INTO v_entry
      FROM jsonb_array_elements(p_payload->'tables') t
      WHERE t->>'name' = v_rec.table_name;

      IF v_entry IS NULL THEN
        -- A table that exists now but not in the backup: left empty, and said so.
        v_skipped := v_skipped || jsonb_build_object(
          'table', v_rec.table_name, 'reason', 'not present in the backup file');
        CONTINUE;
      END IF;

      v_rows := COALESCE(v_entry->'rows', '[]'::JSONB);
      v_expected := jsonb_array_length(v_rows);

      IF v_rec.table_name = 'users' THEN
        -- Profile rows need their login to exist.
        EXECUTE format(
          'INSERT INTO public.%I SELECT r.* FROM jsonb_populate_recordset(NULL::public.%I, $1) r WHERE r.user_id IN (SELECT id FROM auth.users)',
          v_rec.table_name, v_rec.table_name
        ) USING v_rows;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        v_missing_logins := v_expected - v_inserted;
      ELSE
        EXECUTE format(
          'INSERT INTO public.%I SELECT r.* FROM jsonb_populate_recordset(NULL::public.%I, $1) r',
          v_rec.table_name, v_rec.table_name
        ) USING v_rows;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;

        -- Every row the file held must be in the database. Anything else is a
        -- silent partial restore, which is worse than a failed one: it looks
        -- like success. Checked inside the transaction, so a mismatch rolls the
        -- whole restore back.
        IF v_inserted <> v_expected THEN
          RAISE EXCEPTION
            'Only % of the % records in "%" could be restored, so nothing was changed. The backup may be damaged.',
            v_inserted, v_expected, v_rec.table_name;
        END IF;
      END IF;

      v_total := v_total + v_inserted;
      v_tables := v_tables + 1;
    END LOOP;

    -- ---------------------------------------------------------------------
    -- Put the actors back, for everyone the backup still contains.
    -- ---------------------------------------------------------------------
    UPDATE public.backup_runs b
    SET performed_by = a.performed_by
    FROM _aspire_restore_actors a
    WHERE b.id = a.id
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = a.performed_by);

    UPDATE public.system_settings s
    SET updated_by = v_settings_actor
    WHERE s.id = 1
      AND v_settings_actor IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = v_settings_actor);

    -- Triggers back on.
    FOR v_rec IN SELECT o.table_name FROM public.aspire_backup_table_order() o
    LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', v_rec.table_name);
    END LOOP;

    -- Force every deferred foreign key to be checked NOW, while still inside
    -- this block. A rehearsal rolls back and never reaches a commit, so a
    -- deferred constraint would otherwise never be checked at all and the
    -- rehearsal would pass a backup with broken references.
    SET CONSTRAINTS ALL IMMEDIATE;

    v_report := jsonb_build_object(
      'rehearsal', p_rehearse,
      'tables_restored', v_tables,
      'rows_restored', v_total,
      'profiles_skipped_missing_login', v_missing_logins,
      'editing_locks_cleared', v_locks_cleared,
      'tables_left_empty', v_skipped,
      'advisories', v_diffs,
      'backup_taken_at', p_payload->>'taken_at'
    );

    IF p_rehearse THEN
      -- Carried in the error message because it is the one channel certain to
      -- survive the rollback this raise exists to cause.
      RAISE EXCEPTION USING ERRCODE = 'ASPDR', MESSAGE = v_report::TEXT;
    END IF;

  EXCEPTION WHEN SQLSTATE 'ASPDR' THEN
    -- Rehearsal finished and has been rolled back. The database is untouched.
    v_report := SQLERRM::JSONB;
  END;

  IF p_rehearse THEN
    INSERT INTO public.backup_runs (kind, performed_by, table_count, row_count, backup_taken_at, schema_fingerprint, notes)
    VALUES ('rehearsal', auth.uid(),
            (v_report->>'tables_restored')::INTEGER,
            (v_report->>'rows_restored')::INTEGER,
            (p_payload->>'taken_at')::TIMESTAMPTZ,
            p_payload->>'schema_fingerprint',
            format('Rehearsal succeeded and was rolled back: %s records across %s tables would be restored.',
                   v_report->>'rows_restored', v_report->>'tables_restored'));
    RETURN v_report;
  END IF;

  INSERT INTO public.backup_runs (kind, performed_by, table_count, row_count, backup_taken_at, schema_fingerprint, notes)
  VALUES ('restore', auth.uid(), v_tables, v_total::INTEGER,
          (p_payload->>'taken_at')::TIMESTAMPTZ,
          p_payload->>'schema_fingerprint',
          format('Restored %s records across %s tables. %s profile row(s) skipped for missing logins. %s editing lock(s) cleared.',
                 v_total, v_tables, v_missing_logins, v_locks_cleared));

  -- The restored activity log is the backup's version, so it has no record of
  -- anything that happened afterwards -- including this restore. A terminal
  -- entry written now, after the triggers are back on, stops the gap looking
  -- like missing evidence rather than a known discontinuity.
  BEGIN
    INSERT INTO public.activity_logs (actor_id, action, message, actor)
    VALUES (auth.uid(), 'Restored Backup',
            format('System restored from a backup taken %s. Entries after that time were replaced and are recorded only in the backup history.',
                   COALESCE(p_payload->>'taken_at', 'at an unknown time')),
            COALESCE((SELECT u.first_name || ' ' || u.last_name
                      FROM public.users u WHERE u.user_id = auth.uid()), 'Administrator'));
  EXCEPTION WHEN OTHERS THEN
    -- Deliberately swallowed. This entry is a courtesy to whoever reads the
    -- activity log later; backup_runs already carries the authoritative record.
    -- Letting it fail here would roll back a restore that had already
    -- succeeded, which is the worst possible trade.
    NULL;
  END;

  RETURN v_report;
END;
$fn$;

COMMENT ON FUNCTION public.aspire_restore_backup(JSONB, BOOLEAN) IS
  'Destructive unless p_rehearse is true. Disables every table''s triggers '
  'before deleting any of them (a referenced table''s ON DELETE SET NULL/CASCADE '
  'action fires immediately on delete, regardless of deferred constraints, so '
  'per-table disable-then-delete is not safe for FK cycles). Empties and '
  'refills every backed-up table in one transaction, verifying each table''s '
  'row count before committing. Requires maintenance mode ON and an exclusive '
  'advisory lock. Clears editing locks; preserves who performed each past '
  'backup. Touches only the public schema -- auth records are left alone, so '
  'passwords and logins are unaffected. A person created after the backup '
  'keeps their login but loses their profile row, and must be re-added.';

COMMIT;
