-- =============================================================================
-- Restore: release the skipped tables' grip on the tables being restored
-- =============================================================================
-- Date: 2026-10-29
--
-- WHAT WENT WRONG
-- The first real restore failed with SQLSTATE 23503 (PostgREST reported 409).
--
-- Tables in the backup skip list are never emptied -- that is the point of the
-- list. But three of them hold foreign keys INTO tables that a restore DOES
-- empty, and those references stay live while the target rows are deleted:
--
--   backup_runs.performed_by         -> users                 (NO ACTION)
--   provisioning_locks.locked_by     -> users                 (NO ACTION, NOT NULL)
--   system_settings.updated_by       -> users                 (NO ACTION)
--   system_settings.hosting_plan_tier    -> hosting_plan_tiers
--   system_settings.maintenance_reason_id -> maintenance_reasons
--
-- Every backup writes a backup_runs row, so by the time anyone attempts a
-- restore this is guaranteed to fail. It could not be found by inspection: the
-- migrations applied cleanly, the compatibility and integrity checks passed,
-- and only an actual delete reaches it.
--
-- (provisioning_locks.department_id already cascades from departments, so that
-- one was never a blocker.)
--
-- HOW EACH IS RESOLVED
--   Reference data      hosting_plan_tiers, maintenance_reasons and
--                       maintenance_note_presets join the skip list. They are
--                       seeded by migrations, not entered by anyone, so
--                       restoring them from an older backup would destroy
--                       current reference data rather than recover anything.
--                       Skipped-to-skipped references never conflict.
--   Ephemeral locks     provisioning_locks is emptied during a restore. A
--                       restore ends every editing session by definition, and
--                       its rows carry a TTL anyway.
--   Actor columns       backup_runs.performed_by and system_settings.updated_by
--                       become ON DELETE SET NULL, and the restore saves their
--                       values and reattaches them afterwards where the person
--                       still exists.
--
-- ON DELETE SET NULL IS WORTH HAVING ON ITS OWN
-- Without it, an admin who has ever taken a backup could never be deleted: the
-- NO ACTION reference from backup_runs would refuse it. That was a live defect
-- independent of restore.
--
-- WHY THE FUNCTION IS REDEFINED RATHER THAN PATCHED AGAIN
-- aspire_restore_backup has now been patched three times from its live
-- definition. Each patch was sound, but stacking string substitutions on the
-- most destructive function in the system makes it progressively harder to know
-- what is deployed. This states the whole function once, with every fix already
-- in it: qualified deletes, the shared maintenance check, the audit entry to
-- activity_logs, and the handling above.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Reference data is not user data
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_backup_skipped_tables()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    -- Operational state that a restore must not roll back.
    'system_settings',          -- holds the maintenance mode gating the restore
    'backup_runs',              -- the history of restores must survive a restore
    'provisioning_locks',       -- ephemeral editing locks, with a TTL
    -- Reference data seeded by migrations. Restoring these from an older backup
    -- would replace current definitions with stale ones -- for example reverting
    -- hosting plan limits to whatever they were months ago.
    'hosting_plan_tiers',
    'maintenance_reasons',
    'maintenance_note_presets'
  ]::TEXT[];
$$;

-- -----------------------------------------------------------------------------
-- 2. Let a person be deleted even if they once took a backup
-- -----------------------------------------------------------------------------
-- A constraint's referential action cannot be altered in place; it has to be
-- dropped and re-added.
ALTER TABLE public.backup_runs DROP CONSTRAINT IF EXISTS backup_runs_performed_by_fkey;
ALTER TABLE public.backup_runs
  ADD CONSTRAINT backup_runs_performed_by_fkey
  FOREIGN KEY (performed_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE public.system_settings DROP CONSTRAINT IF EXISTS system_settings_updated_by_fkey;
ALTER TABLE public.system_settings
  ADD CONSTRAINT system_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 3. The restore, stated in full
-- -----------------------------------------------------------------------------
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
    -- Empty everything, children before parents.
    -- ---------------------------------------------------------------------
    -- User triggers off: restoring posted grades must not re-fire posting side
    -- effects such as opening consultation windows or sending notifications.
    -- The data already reflects whatever those triggers did when the backup was
    -- taken. Foreign-key actions are system triggers and stay armed, which is
    -- what makes the SET NULL above happen.
    --
    -- `WHERE ctid <> '(0,0)'` satisfies Supabase's safeupdate guard, which
    -- refuses an unqualified DELETE. It cannot be written `WHERE TRUE`: the
    -- planner folds a constant-true qualification away and the guard refuses it
    -- just the same. ctid is a column reference, so the comparison survives --
    -- and it matches every row, because item offsets begin at 1.
    FOR v_rec IN
      SELECT o.table_name FROM public.aspire_backup_table_order() o
      ORDER BY o.sort_order DESC, o.table_name DESC
    LOOP
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', v_rec.table_name);
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

REVOKE ALL ON FUNCTION public.aspire_restore_backup(JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_restore_backup(JSONB, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.aspire_restore_backup(JSONB, BOOLEAN) IS
  'Destructive unless p_rehearse is true. Empties and refills every backed-up '
  'table in one transaction, verifying each table''s row count before '
  'committing. Requires maintenance mode ON and an exclusive advisory lock. '
  'Clears editing locks; preserves who performed each past backup. Touches '
  'only the public schema -- auth records are left alone, so passwords and '
  'logins are unaffected. A person created after the backup keeps their login '
  'but loses their profile row, and must be re-added.';

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_offenders TEXT;
BEGIN
  -- The reference tables must now be out of scope.
  IF EXISTS (
    SELECT 1 FROM public.aspire_backup_table_order() o
    WHERE o.table_name IN ('hosting_plan_tiers', 'maintenance_reasons', 'maintenance_note_presets')
  ) THEN
    RAISE EXCEPTION 'Verification failed: reference tables are still inside the backup set.';
  END IF;

  -- THE ASSERTION THIS WHOLE MIGRATION EXISTS FOR.
  --
  -- Any foreign key from a skipped table into a restored one will block the
  -- delete phase, and nothing before an actual restore will reveal it. Each of
  -- the four that remain is handled: the two actor columns clear themselves via
  -- ON DELETE SET NULL, and provisioning_locks is emptied by the restore. A
  -- FIFTH one appearing later must fail here, at migration time, rather than
  -- during an emergency.
  SELECT string_agg(format('%s.%s -> %s', src.relname, att.attname, tgt.relname), ', ' ORDER BY 1)
    INTO v_offenders
  FROM pg_constraint con
  JOIN pg_class src ON src.oid = con.conrelid
  JOIN pg_class tgt ON tgt.oid = con.confrelid
  JOIN pg_namespace n ON n.oid = src.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
  WHERE con.contype = 'f'
    AND src.relname = ANY (public.aspire_backup_skipped_tables())
    AND NOT (tgt.relname = ANY (public.aspire_backup_skipped_tables()))
    AND con.confdeltype NOT IN ('c', 'n')      -- cascade and set-null look after themselves
    AND src.relname <> 'provisioning_locks';   -- emptied by the restore

  IF v_offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'Verification failed: these references from skipped tables would block a restore and are not handled: %. Either add the target to the skip list, give the key ON DELETE SET NULL, or clear the rows in aspire_restore_backup.',
      v_offenders;
  END IF;

  -- The two actor keys must clear themselves, or deleting the users table
  -- fails and an admin who ever took a backup can never be deleted either.
  IF (SELECT con.confdeltype FROM pg_constraint con
      WHERE con.conname = 'backup_runs_performed_by_fkey') <> 'n' THEN
    RAISE EXCEPTION 'Verification failed: backup_runs.performed_by is not ON DELETE SET NULL.';
  END IF;
  IF (SELECT con.confdeltype FROM pg_constraint con
      WHERE con.conname = 'system_settings_updated_by_fkey') <> 'n' THEN
    RAISE EXCEPTION 'Verification failed: system_settings.updated_by is not ON DELETE SET NULL.';
  END IF;

  -- The fixes from the earlier patches must still be present in the body this
  -- migration has just written.
  IF position('DELETE FROM public.%I WHERE ctid' IN
       pg_get_functiondef('public.aspire_restore_backup(jsonb,boolean)'::regprocedure)) = 0
     OR position('is_maintenance_active' IN
       pg_get_functiondef('public.aspire_restore_backup(jsonb,boolean)'::regprocedure)) = 0
     OR position('public.audit_logs' IN
       pg_get_functiondef('public.aspire_restore_backup(jsonb,boolean)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'Verification failed: the redefined restore lost one of the earlier fixes.';
  END IF;

  RAISE NOTICE 'Restore now releases skipped-table references. Backup set is % table(s).',
    (SELECT count(*) FROM public.aspire_backup_table_order());
END
$verify$;
