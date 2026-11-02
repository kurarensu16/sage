-- =============================================================================
-- Admin backup and restore, plus Supabase Storage usage reporting
-- =============================================================================
-- Date: 2026-10-29
--
-- WHY THIS IS RPC-ONLY AND HAS NO EDGE FUNCTION
-- The browser never holds a service-role key. Every read and write below runs
-- through a SECURITY DEFINER function gated on is_active_admin(), so the admin's
-- own JWT is the only credential in play. An edge function would have needed the
-- service-role key, which is a far larger blast radius for the same result.
--
-- WHAT A BACKUP CONTAINS
-- Every ordinary table in the public schema, discovered from the catalog rather
-- than from a hard-coded list, so a table added by a later migration is included
-- without anyone remembering to add it here. Plus login identities from
-- auth.users -- WITHOUT encrypted_password, by the owner's decision on
-- 2026-10-29: the backup file must not be an offline cracking target. After a
-- restore, accounts exist and sign in via the password reset flow.
--
-- WHAT A BACKUP DOES NOT CONTAIN
--   * Password hashes (above).
--   * Storage file bytes. Avatar images are covered by Supabase's own storage
--     backups; this backup records their metadata so a restore can report which
--     images are missing rather than silently losing track of them.
--   * system_settings, backup_runs, provisioning_locks. See the skip list below.
--
-- THE BIG RISK, STATED PLAINLY
-- Restore DELETES every row of every restored table before inserting. It is
-- gated on maintenance mode being ON, so no one else is writing while it runs,
-- and it is one transaction: it either completes or changes nothing.
--
-- WHAT PROTECTS A RESTORE
--   Rehearsal         aspire_restore_backup(payload, TRUE) performs the entire
--                     restore and then rolls it back, reporting what would have
--                     happened. The only way to prove a backup works without
--                     betting the live database on it.
--   Compatibility     every backup carries a fingerprint and a description of
--                     the database's structure. A backup taken before a
--                     migration that added a required column is refused up
--                     front, by name, instead of failing mid-restore.
--   Count checks      each table's restored row count must equal the file's,
--                     inside the transaction. A partial restore rolls back,
--                     because a partial restore looks like success.
--   Exclusive lock    one restore at a time. Two would otherwise serialise and
--                     the second would quietly overwrite the first.
--   Drift detection   aspire_backup_status() compares the newest backup's
--                     fingerprint against the live one, so the page can say
--                     that a migration has made the latest backup unusable.
--
-- The file itself is encrypted in the browser before download (AES-GCM, see
-- src/lib/backupCrypto.js). Nothing here handles the passphrase: these functions
-- see only plaintext payloads, which is why none of them can leak a key.
--
-- A NOTE ON THE GATE AND THE VERIFICATION BLOCK AT THE BOTTOM
-- is_active_admin() resolves auth.uid(), which is NULL in the SQL editor. So the
-- ordering logic lives in an ungated internal function that the verification
-- block can exercise, and the gated public function delegates to it. Without
-- that split, running this migration in the SQL editor would fail its own
-- verification.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Audit trail of exports and restores
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('export', 'restore', 'rehearsal', 'storage_cleanup')),
  performed_by UUID REFERENCES public.users(user_id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  table_count INTEGER,
  row_count INTEGER,
  backup_taken_at TIMESTAMPTZ,   -- for a restore: when the file was exported
  -- The database structure at the time. Comparing the newest export's
  -- fingerprint against the live one is how the page knows a migration has made
  -- the latest backup unrestorable, without anyone having to remember.
  schema_fingerprint TEXT,
  notes TEXT
);

COMMENT ON TABLE public.backup_runs IS
  'Who exported or restored a backup, and when. Deliberately excluded from '
  'backups: a restore must not rewrite the history of restores.';

-- -----------------------------------------------------------------------------
-- 1b. Capacity settings
-- -----------------------------------------------------------------------------
-- WHAT CAN AND CANNOT BE DETECTED
-- Usage is measurable from SQL. Which hosting tier the project is on is not:
-- Supabase exposes that only through its Management API, which needs a Personal
-- Access Token -- a full-account credential, far too much power to add to this
-- system just to read two numbers.
--
-- So the tiers themselves are data, seeded here and kept in a table rather than
-- written into the page. Choosing "Free" applies the Free tier's limits; nobody
-- types a byte count. When Supabase changes its published limits, one UPDATE
-- here fixes every project without a code change.
CREATE TABLE IF NOT EXISTS public.hosting_plan_tiers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  storage_bytes BIGINT,
  database_bytes BIGINT,
  egress_bytes BIGINT,           -- reported for reference; not measurable here
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

COMMENT ON TABLE public.hosting_plan_tiers IS
  'Published Supabase plan limits. Reference data, not configuration: the '
  'project''s own tier is recorded in system_settings.hosting_plan_tier.';

ALTER TABLE public.hosting_plan_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hosting_plan_tiers_select ON public.hosting_plan_tiers;
CREATE POLICY hosting_plan_tiers_select ON public.hosting_plan_tiers
  FOR SELECT TO authenticated
  USING (public.is_active_admin());

REVOKE INSERT, UPDATE, DELETE ON public.hosting_plan_tiers FROM authenticated;
REVOKE ALL ON public.hosting_plan_tiers FROM anon;

-- Supabase's published limits as of 2026-10-29. "custom" exists so a project on
-- terms that do not match a published tier can still be measured, rather than
-- being forced to pick a tier that is wrong.
INSERT INTO public.hosting_plan_tiers (id, label, storage_bytes, database_bytes, egress_bytes, sort_order, notes)
VALUES
  ('free',   'Free',   1073741824,    524288000,   5368709120,  1,
   'The database limit binds long before storage: records grow continuously, while photos are capped at 2 MB each, one per person.'),
  ('pro',    'Pro',    107374182400,  8589934592,  268435456000, 2,
   'Database grows beyond the included size at an additional cost per GB.'),
  ('team',   'Team',   107374182400,  8589934592,  268435456000, 3,
   'Same included capacity as Pro; the difference is support and compliance.'),
  ('custom', 'Custom', NULL,          NULL,        NULL,         9,
   'Enter the limits from your own invoice.')
ON CONFLICT (id) DO UPDATE
SET label = EXCLUDED.label,
    storage_bytes = EXCLUDED.storage_bytes,
    database_bytes = EXCLUDED.database_bytes,
    egress_bytes = EXCLUDED.egress_bytes,
    sort_order = EXCLUDED.sort_order,
    notes = EXCLUDED.notes;

-- The project's own tier, plus optional overrides for a project whose terms
-- differ from the published tier. NULL override means "use the tier's figure".
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS hosting_plan_tier TEXT REFERENCES public.hosting_plan_tiers(id),
  ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS database_quota_bytes BIGINT;

-- Defaulted to Free, the tier this project is on as stated by the owner on
-- 2026-10-29. COALESCE, not assignment: re-running this migration must not
-- overwrite a tier an admin has since changed.
UPDATE public.system_settings
SET hosting_plan_tier = COALESCE(hosting_plan_tier, 'free')
WHERE id = 1;

CREATE OR REPLACE FUNCTION public.set_hosting_plan(
  p_tier TEXT,
  p_storage_override BIGINT DEFAULT NULL,
  p_database_override BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Only an administrator can change the hosting plan.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.hosting_plan_tiers t WHERE t.id = p_tier) THEN
    RAISE EXCEPTION 'That is not a plan this system knows about.';
  END IF;

  IF p_storage_override IS NOT NULL AND p_storage_override <= 0 THEN
    RAISE EXCEPTION 'The storage limit must be greater than zero.';
  END IF;
  IF p_database_override IS NOT NULL AND p_database_override <= 0 THEN
    RAISE EXCEPTION 'The database limit must be greater than zero.';
  END IF;

  UPDATE public.system_settings
  SET hosting_plan_tier = p_tier,
      storage_quota_bytes = p_storage_override,
      database_quota_bytes = p_database_override,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.set_hosting_plan(TEXT, BIGINT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_hosting_plan(TEXT, BIGINT, BIGINT) TO authenticated;

ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backup_runs_select ON public.backup_runs;
CREATE POLICY backup_runs_select ON public.backup_runs
  FOR SELECT TO authenticated
  USING (public.is_active_admin());

-- No write policy. Rows appear only through the functions below.
REVOKE INSERT, UPDATE, DELETE ON public.backup_runs FROM authenticated;
REVOKE ALL ON public.backup_runs FROM anon;

-- -----------------------------------------------------------------------------
-- 2. Which tables are in scope, and in what order
-- -----------------------------------------------------------------------------
-- Three tables are skipped on purpose:
--   system_settings     holds maintenance mode, which gates the restore itself.
--                       Restoring it mid-restore could switch maintenance off
--                       and let users write into a half-restored database.
--   backup_runs         the history of restores must survive a restore.
--   provisioning_locks  ephemeral editing locks with a TTL. A restored lock
--                       would strand a college until it lapsed.
CREATE OR REPLACE FUNCTION public.aspire_backup_skipped_tables()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['system_settings', 'backup_runs', 'provisioning_locks']::TEXT[];
$$;

-- -----------------------------------------------------------------------------
-- 2a. Break the one foreign-key cycle, so an order exists at all
-- -----------------------------------------------------------------------------
-- The grading schema contains a deliberate mutual reference:
--
--   remark_override_requests.posted_grade_id      -> posted_grades  (ON DELETE RESTRICT)
--   posted_grades.last_correction_request_id      -> remark_override_requests (ON DELETE SET NULL)
--
-- Both are correct and neither should be removed. But a cycle has no
-- parents-first order, so without this there is no sequence in which the two
-- tables can be refilled, and backup would fail outright rather than
-- gracefully.
--
-- The fix is to make the SET NULL side DEFERRABLE INITIALLY IMMEDIATE. That
-- changes nothing in day-to-day operation -- INITIALLY IMMEDIATE means it is
-- still checked at the end of every statement -- but it lets the restore say
-- SET CONSTRAINTS ALL DEFERRED and insert the two tables in either order,
-- with the reference checked once at commit.
--
-- It has to be this side: ON DELETE RESTRICT cannot be deferred, so the other
-- direction is not an option.
DO $cycle$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.contype = 'f'
      AND con.conrelid = 'public.posted_grades'::regclass
      AND con.confrelid = 'public.remark_override_requests'::regclass
      AND NOT con.condeferrable
  LOOP
    EXECUTE format(
      'ALTER TABLE public.posted_grades ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE',
      v_name
    );
    RAISE NOTICE 'Made foreign key %I deferrable so a restore order exists.', v_name;
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  -- Neither table exists yet; nothing to break.
  NULL;
END;
$cycle$;

-- Internal: tables in foreign-key dependency order, parents first, so inserting
-- forward and deleting in reverse never trips a foreign key. Order matters
-- because a restore cannot disable Postgres's own FK triggers -- DISABLE TRIGGER
-- USER leaves system triggers armed, and disabling those needs superuser, which
-- Supabase does not grant.
--
-- DEFERRABLE foreign keys are left out of the graph: the restore defers them, so
-- they impose no ordering. That is what breaks the posted_grades <->
-- remark_override_requests cycle above.
--
-- Ungated on purpose, and revoked from every client role: it is called by the
-- gated functions below and by this migration's own verification.
CREATE OR REPLACE FUNCTION public.aspire_backup_table_order()
RETURNS TABLE (table_name TEXT, sort_order INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE tabs AS (
    SELECT c.oid, c.relname::TEXT AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT (c.relname::TEXT = ANY (public.aspire_backup_skipped_tables()))
  ),
  fk AS (
    SELECT con.conrelid AS child, con.confrelid AS parent
    FROM pg_constraint con
    WHERE con.contype = 'f'
      AND con.conrelid <> con.confrelid          -- self-reference is not a cycle
      AND NOT con.condeferrable                  -- deferred during restore, so
                                                 -- imposes no order
      AND con.conrelid IN (SELECT oid FROM tabs)
      AND con.confrelid IN (SELECT oid FROM tabs)
  ),
  depth AS (
    -- Seeds: tables with no parent inside the backup set.
    SELECT t.oid, t.name, 0 AS lvl
    FROM tabs t
    WHERE NOT EXISTS (SELECT 1 FROM fk WHERE fk.child = t.oid)
    UNION ALL
    SELECT t.oid, t.name, d.lvl + 1
    FROM tabs t
    JOIN fk ON fk.child = t.oid
    JOIN depth d ON d.oid = fk.parent
    WHERE d.lvl < 25                             -- guard against pathological depth
  )
  -- A level of -1 means the table never reached a seed, i.e. it sits in a
  -- foreign-key cycle. Surfaced rather than guessed at: ordering a cycle
  -- arbitrarily would fail quietly, halfway through a destructive restore.
  SELECT t.name, COALESCE(MAX(d.lvl), -1)::INTEGER
  FROM tabs t
  LEFT JOIN depth d ON d.name = t.name
  GROUP BY t.name
  ORDER BY COALESCE(MAX(d.lvl), -1), t.name;
$$;

REVOKE ALL ON FUNCTION public.aspire_backup_table_order() FROM PUBLIC, anon, authenticated;

-- Public, gated, and carrying row counts so the Admin page can show the size of
-- a backup before anyone downloads one.
CREATE OR REPLACE FUNCTION public.aspire_backup_manifest()
RETURNS TABLE (table_name TEXT, sort_order INTEGER, row_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec RECORD;
  v_n BIGINT;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Only an administrator can list the backup contents.';
  END IF;

  FOR v_rec IN SELECT o.table_name, o.sort_order FROM public.aspire_backup_table_order() o
  LOOP
    IF v_rec.sort_order < 0 THEN
      RAISE EXCEPTION
        'Cannot determine a safe order for the table "%". Backup is available but restore is not, until this is resolved.',
        v_rec.table_name;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I', v_rec.table_name) INTO v_n;
    RETURN QUERY SELECT v_rec.table_name, v_rec.sort_order, v_n;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_backup_manifest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_backup_manifest() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2b. The shape of the database, so a backup knows what it fits
-- -----------------------------------------------------------------------------
-- Every backup carries this. At restore time the stored shape is compared to the
-- live one, which turns the worst failure mode -- a column error halfway through
-- a destructive restore -- into a refusal before anything is touched, naming the
-- tables and columns that differ.
--
-- Migration *version* would be the obvious thing to record instead, but this
-- project's migrations are applied by hand in the SQL editor, so
-- supabase_migrations.schema_migrations is not populated and cannot be trusted.
-- The catalog is the only reliable witness to what the database actually looks
-- like, and it has the advantage of describing the difference in terms a person
-- can act on.
CREATE OR REPLACE FUNCTION public.aspire_schema_shape()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_object_agg(s.table_name, s.cols), '{}'::jsonb)
  FROM (
    SELECT o.table_name,
           jsonb_agg(
             jsonb_build_object(
               'name', a.attname,
               'type', format_type(a.atttypid, a.atttypmod),
               'required', a.attnotnull AND NOT COALESCE(d.has_default, FALSE)
             )
             ORDER BY a.attname          -- by name, not position: reordering
           ) AS cols                     -- columns is not a shape change
    FROM public.aspire_backup_table_order() o
    JOIN pg_class c ON c.relname = o.table_name
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN (
      SELECT ad.adrelid, ad.adnum, TRUE AS has_default
      FROM pg_attrdef ad
    ) d ON d.adrelid = c.oid AND d.adnum = a.attnum
    GROUP BY o.table_name
  ) s;
$$;

REVOKE ALL ON FUNCTION public.aspire_schema_shape() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.aspire_schema_fingerprint()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT md5(public.aspire_schema_shape()::TEXT);
$$;

-- Not granted to clients: the fingerprint reaches the page through the
-- admin-gated status function below, so there is no reason for anyone else to
-- be able to probe the schema's identity.
REVOKE ALL ON FUNCTION public.aspire_schema_fingerprint() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Export
-- -----------------------------------------------------------------------------
-- One call, one document, so that what the admin downloads is exactly what a
-- restore reads back.
--
-- DECLARED STABLE, AND THAT IS THE IMPORTANT PART
-- A VOLATILE function takes a fresh snapshot for every statement it runs under
-- READ COMMITTED. Reading forty tables in forty statements would therefore see
-- forty different moments: a class could be captured without the grades that
-- were posted to it a second later, and the backup would restore with broken
-- references. A STABLE function uses the calling query's single snapshot for all
-- its reads, so the whole export is one consistent picture of the database.
--
-- That is why the audit row is NOT written here -- a STABLE function must not
-- write. The page calls aspire_record_backup_run() afterwards instead.
--
-- statement_timeout is raised in the function's own SET clause rather than with
-- SET LOCAL in the body, for the same reason: no writes, no utility statements.
--
-- A row ceiling guards the one case this design cannot serve: a database large
-- enough that a single JSON document is the wrong tool. Rather than time out
-- halfway and leave the admin guessing, it says so and points at the hosting
-- provider's own backups.
CREATE OR REPLACE FUNCTION public.aspire_export_backup(p_max_rows INTEGER DEFAULT 500000)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
SET statement_timeout = '600s'
AS $$
DECLARE
  v_rec RECORD;
  v_rows JSONB;
  v_tables JSONB := '[]'::JSONB;
  v_total BIGINT := 0;
  v_count INTEGER := 0;
  v_auth JSONB;
  v_storage JSONB;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Only an administrator can create a backup.';
  END IF;

  -- One manifest pass for the ceiling check; the export loop needs only order.
  SELECT COALESCE(SUM(m.row_count), 0) INTO v_total
  FROM public.aspire_backup_manifest() m;

  IF v_total > p_max_rows THEN
    RAISE EXCEPTION
      'There are % records to back up, more than this tool handles in one file (limit %). Use the hosting provider''s own backup for a database this size.',
      v_total, p_max_rows;
  END IF;

  v_total := 0;

  FOR v_rec IN SELECT o.table_name, o.sort_order FROM public.aspire_backup_table_order() o
  LOOP
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.ctid), ''[]''::jsonb) FROM public.%I t',
      v_rec.table_name
    ) INTO v_rows;

    v_tables := v_tables || jsonb_build_object(
      'name', v_rec.table_name,
      'order', v_rec.sort_order,
      'rows', v_rows
    );
    v_total := v_total + jsonb_array_length(v_rows);
    v_count := v_count + 1;
  END LOOP;

  -- Login identities without the password hash. The email-change and recovery
  -- columns are left out for the same reason: they are credential material.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', u.id,
           'email', u.email,
           'created_at', u.created_at,
           'email_confirmed_at', u.email_confirmed_at,
           'last_sign_in_at', u.last_sign_in_at,
           'raw_user_meta_data', u.raw_user_meta_data
         ) ORDER BY u.created_at), '[]'::jsonb)
    INTO v_auth
  FROM auth.users u;

  -- Storage metadata only. The bytes stay in Supabase Storage.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket_id', o.bucket_id,
           'name', o.name,
           'size', (o.metadata->>'size')::BIGINT,
           'mimetype', o.metadata->>'mimetype',
           'created_at', o.created_at
         ) ORDER BY o.created_at), '[]'::jsonb)
    INTO v_storage
  FROM storage.objects o;

  RETURN jsonb_build_object(
    'aspire_backup_version', 2,
    'taken_at', now(),
    'taken_by', auth.uid(),
    'database_rows', v_total,
    'table_count', v_count,
    'schema_fingerprint', public.aspire_schema_fingerprint(),
    'schema_shape', public.aspire_schema_shape(),
    'excludes', jsonb_build_array(
      'auth password hashes', 'storage file contents',
      'system_settings', 'backup_runs', 'provisioning_locks'
    ),
    'tables', v_tables,
    'auth_identities', v_auth,
    'storage_objects', v_storage
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_export_backup(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_export_backup(INTEGER) TO authenticated;

-- The audit row for an export, written separately because the export itself is
-- STABLE and must not write. Carries the fingerprint, which is what lets the
-- page later notice that a migration has made this backup unrestorable.
CREATE OR REPLACE FUNCTION public.aspire_record_backup_run(
  p_kind TEXT,
  p_table_count INTEGER,
  p_row_count INTEGER,
  p_schema_fingerprint TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Only an administrator can record a backup.';
  END IF;
  IF p_kind NOT IN ('export', 'rehearsal') THEN
    -- Restores and cleanups record themselves inside their own functions, so
    -- that the record cannot be skipped by a client that simply does not call.
    RAISE EXCEPTION 'That kind of backup activity is recorded automatically.';
  END IF;

  INSERT INTO public.backup_runs (kind, performed_by, table_count, row_count, schema_fingerprint, notes)
  VALUES (p_kind, auth.uid(), p_table_count, p_row_count, p_schema_fingerprint, p_notes);
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_record_backup_run(TEXT, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_record_backup_run(TEXT, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Compatibility, validation, and restore
-- -----------------------------------------------------------------------------

-- How the backup's recorded structure differs from the database's current one.
--
-- This is what turns the worst failure mode into a refusal. Without it, a backup
-- taken before a migration that added a required column fails *during* the
-- restore, with a column error, after the tables have already been emptied --
-- recoverable only because the whole thing is one transaction. With it, the
-- admin is told before typing anything.
CREATE OR REPLACE FUNCTION public.aspire_compare_schema_shape(p_backup_shape JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH live AS (SELECT public.aspire_schema_shape() AS shape),
  live_t AS (SELECT e.key AS t, e.value AS cols FROM live, jsonb_each(live.shape) e),
  back_t AS (SELECT e.key AS t, e.value AS cols FROM jsonb_each(COALESCE(p_backup_shape, '{}'::jsonb)) e),
  live_cols AS (
    SELECT l.t, c->>'name' AS name, c->>'type' AS type, (c->>'required')::BOOLEAN AS required
    FROM live_t l, jsonb_array_elements(l.cols) c
  ),
  back_cols AS (
    SELECT b.t, c->>'name' AS name, c->>'type' AS type
    FROM back_t b, jsonb_array_elements(b.cols) c
  ),
  diffs AS (
    -- A table added since the backup. Not blocking: it simply restores empty.
    SELECT jsonb_build_object(
             'kind', 'table_added_since_backup', 'table', l.t, 'blocking', FALSE,
             'detail', 'This table did not exist when the backup was taken, so it will be left empty.'
           ) AS d
    FROM live_t l WHERE NOT EXISTS (SELECT 1 FROM back_t b WHERE b.t = l.t)

    UNION ALL
    -- A table dropped since the backup. Its records cannot come back. Not
    -- blocking -- the restore can still run -- but it is silent data loss
    -- unless someone is told, so it is reported prominently.
    SELECT jsonb_build_object(
             'kind', 'table_no_longer_exists', 'table', b.t, 'blocking', FALSE,
             'detail', 'The backup holds records for this table but the database no longer has it. Those records cannot be restored.'
           )
    FROM back_t b WHERE NOT EXISTS (SELECT 1 FROM live_t l WHERE l.t = b.t)

    UNION ALL
    -- THE BLOCKING CASE: a column that is now required and has no default, for
    -- which the backup carries no value. Every row would violate it.
    SELECT jsonb_build_object(
             'kind', 'required_column_added', 'table', lc.t, 'column', lc.name, 'blocking', TRUE,
             'detail', format('"%s" is now required, and the backup has no value for it.', lc.name)
           )
    FROM live_cols lc
    WHERE lc.required
      AND EXISTS (SELECT 1 FROM back_t b WHERE b.t = lc.t)
      AND NOT EXISTS (SELECT 1 FROM back_cols bc WHERE bc.t = lc.t AND bc.name = lc.name)

    UNION ALL
    -- A column dropped since the backup: whatever it held is lost, but the
    -- restore works, because unknown keys are ignored when rows are rebuilt.
    SELECT jsonb_build_object(
             'kind', 'column_no_longer_exists', 'table', bc.t, 'column', bc.name, 'blocking', FALSE,
             'detail', format('"%s" no longer exists, so what the backup held in it is not restored.', bc.name)
           )
    FROM back_cols bc
    WHERE EXISTS (SELECT 1 FROM live_t l WHERE l.t = bc.t)
      AND NOT EXISTS (SELECT 1 FROM live_cols lc WHERE lc.t = bc.t AND lc.name = bc.name)

    UNION ALL
    -- A changed type may still cast cleanly, so this is a warning rather than a
    -- refusal. The rehearsal below is the way to find out for certain.
    SELECT jsonb_build_object(
             'kind', 'column_type_changed', 'table', lc.t, 'column', lc.name, 'blocking', FALSE,
             'detail', format('"%s" was %s and is now %s.', lc.name, bc.type, lc.type)
           )
    FROM live_cols lc
    JOIN back_cols bc ON bc.t = lc.t AND bc.name = lc.name
    WHERE bc.type <> lc.type
  )
  SELECT COALESCE(jsonb_agg(d ORDER BY (d->>'blocking') DESC, d->>'table', d->>'column'), '[]'::jsonb)
  FROM diffs;
$$;

REVOKE ALL ON FUNCTION public.aspire_compare_schema_shape(JSONB) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Check a backup without touching anything
-- -----------------------------------------------------------------------------
-- Read-only, takes no locks, and needs no maintenance window, so it can be run
-- on a live system any time. It answers two questions:
--
--   Is the file intact?        Do the per-table row counts match what it claims?
--   Does it fit this database? Does its recorded structure still match?
--
-- What it cannot answer is whether a tightened CHECK constraint or a narrowed
-- enum would reject some row. That needs the rehearsal, which writes and rolls
-- back, and therefore needs the system closed.
CREATE OR REPLACE FUNCTION public.aspire_validate_backup(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
SET statement_timeout = '300s'
AS $$
DECLARE
  v_diffs JSONB;
  v_blocking INTEGER;
  v_declared BIGINT;
  v_actual BIGINT;
  v_tables JSONB := '[]'::JSONB;
  v_entry JSONB;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Only an administrator can check a backup.';
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

  v_diffs := public.aspire_compare_schema_shape(p_payload->'schema_shape');
  SELECT count(*) INTO v_blocking
  FROM jsonb_array_elements(v_diffs) d
  WHERE (d->>'blocking')::BOOLEAN;

  v_declared := COALESCE((p_payload->>'database_rows')::BIGINT, 0);

  SELECT COALESCE(SUM(jsonb_array_length(t->'rows')), 0) INTO v_actual
  FROM jsonb_array_elements(p_payload->'tables') t;

  FOR v_entry IN SELECT t FROM jsonb_array_elements(p_payload->'tables') t
  LOOP
    v_tables := v_tables || jsonb_build_object(
      'table', v_entry->>'name',
      'rows', jsonb_array_length(v_entry->'rows')
    );
  END LOOP;

  RETURN jsonb_build_object(
    'taken_at', p_payload->>'taken_at',
    'fingerprint_matches',
      COALESCE(p_payload->>'schema_fingerprint', '') = public.aspire_schema_fingerprint(),
    'restorable', v_blocking = 0,
    'blocking_count', v_blocking,
    'differences', v_diffs,
    -- File integrity: the header's own total against the rows actually present.
    -- A truncated download is the common cause of a mismatch here.
    'declared_rows', v_declared,
    'actual_rows', v_actual,
    'intact', v_declared = v_actual,
    'table_count', jsonb_array_length(p_payload->'tables'),
    'tables', v_tables
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_validate_backup(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_validate_backup(JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- Restore, and its rehearsal
-- -----------------------------------------------------------------------------
-- One transaction. Every restored table is emptied and refilled, children
-- deleted before parents and parents inserted before children.
--
-- p_rehearse = TRUE does the entire thing and then deliberately rolls it back,
-- reporting what would have happened. That is the only way to prove a backup is
-- restorable without betting the live database on it. It still requires
-- maintenance mode, because emptying and refilling every table holds locks on
-- all of them for the duration -- a "harmless" rehearsal would stall every user
-- in the system.
--
-- Rows whose owning login no longer exists are reported, not forced: deleting a
-- login is an Admin action with its own audit trail, and a restore silently
-- resurrecting the profile of a deleted account would undo it.
CREATE OR REPLACE FUNCTION public.aspire_restore_backup(
  p_payload JSONB,
  p_rehearse BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
SET statement_timeout = '600s'
AS $$
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
  -- into a table that has been emptied but not yet refilled.
  SELECT s.maintenance_mode INTO v_maint FROM public.system_settings s WHERE s.id = 1;
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

  -- A rehearsal runs inside this block so that raising at the end rolls back
  -- every change made within it. PL/pgSQL gives a block with an EXCEPTION
  -- clause its own subtransaction, which is exactly the undo we want.
  BEGIN
    -- Empty everything first, children before parents.
    --
    -- User triggers off: restoring posted grades must not re-fire posting side
    -- effects such as opening consultation windows or sending notifications. The
    -- data already reflects whatever those triggers did when the backup was taken.
    FOR v_rec IN
      SELECT o.table_name FROM public.aspire_backup_table_order() o
      ORDER BY o.sort_order DESC, o.table_name DESC
    LOOP
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', v_rec.table_name);
      EXECUTE format('DELETE FROM public.%I', v_rec.table_name);
    END LOOP;

    -- Refill, parents before children.
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
        -- like success. The count is checked here, inside the transaction, so a
        -- mismatch rolls the whole restore back.
        IF v_inserted <> v_expected THEN
          RAISE EXCEPTION
            'Only % of the % records in "%" could be restored, so nothing was changed. The backup may be damaged.',
            v_inserted, v_expected, v_rec.table_name;
        END IF;
      END IF;

      v_total := v_total + v_inserted;
      v_tables := v_tables + 1;
    END LOOP;

    -- Triggers back on.
    FOR v_rec IN SELECT o.table_name FROM public.aspire_backup_table_order() o
    LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', v_rec.table_name);
    END LOOP;

    -- Force every deferred foreign key to be checked NOW, while still inside
    -- this block.
    --
    -- Two reasons, and the first is the important one: a rehearsal rolls this
    -- block back and never reaches a commit, so a deferred constraint would
    -- never be checked at all and the rehearsal would pass a backup with broken
    -- references. Second, for a real restore it turns a commit-time failure
    -- into one raised here, where it is reported properly instead of surfacing
    -- as an opaque error after the function has returned.
    SET CONSTRAINTS ALL IMMEDIATE;

    v_report := jsonb_build_object(
      'rehearsal', p_rehearse,
      'tables_restored', v_tables,
      'rows_restored', v_total,
      'profiles_skipped_missing_login', v_missing_logins,
      'tables_left_empty', v_skipped,
      'advisories', v_diffs,
      'backup_taken_at', p_payload->>'taken_at'
    );

    IF p_rehearse THEN
      -- Carried out in the error message because it is the one channel certain
      -- to survive the rollback this raise is here to cause.
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
          format('Restored %s records across %s tables. %s profile row(s) skipped for missing logins.',
                 v_total, v_tables, v_missing_logins));

  -- The restored audit log is the backup's version, so it has no record of
  -- anything that happened afterwards -- including this restore. A terminal
  -- entry written now, after the triggers are back on, is what stops the gap
  -- looking like missing evidence rather than a known discontinuity.
  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, message, severity)
    VALUES (auth.uid(), 'Restored Backup',
            format('System restored from a backup taken %s. Entries after that time were replaced and are recorded only in the backup history.',
                   COALESCE(p_payload->>'taken_at', 'at an unknown time')),
            'critical');
  EXCEPTION WHEN OTHERS THEN
    -- Deliberately swallowed. This entry is a courtesy to whoever reads the
    -- audit log later; backup_runs already carries the authoritative record.
    -- Letting it fail here would roll back a restore that had already
    -- succeeded, which is the worst possible trade.
    NULL;
  END;

  RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_restore_backup(JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_restore_backup(JSONB, BOOLEAN) TO authenticated;

-- The single-argument form from the first draft of this migration would now be
-- ambiguous against the two-argument one, and would also default to a real
-- restore -- the wrong way round for a destructive action.
DROP FUNCTION IF EXISTS public.aspire_restore_backup(JSONB);

COMMENT ON FUNCTION public.aspire_restore_backup(JSONB, BOOLEAN) IS
  'Destructive unless p_rehearse is true. Empties and refills every backed-up '
  'table in one transaction, verifying each table''s row count before '
  'committing. Requires maintenance mode ON and an exclusive advisory lock. '
  'Does not restore password hashes: accounts sign in again through the '
  'password reset flow.';

-- -----------------------------------------------------------------------------
-- 5. Supabase Storage usage, for the Admin storage panel
-- -----------------------------------------------------------------------------
-- Orphans are the actionable number: an avatar whose owning account was deleted
-- still occupies space under a path named after a user who is gone. Paths are
-- owner-scoped as "user_id/...", so the first segment is the owner even where
-- storage.objects.owner was never populated.

-- Is this storage path owned by an account that no longer exists?
--
-- SECURITY DEFINER on purpose, and used by the delete policy below rather than
-- an inline subquery over public.users. An inline subquery runs under the
-- caller's RLS, so any policy that hid a users row would make that user's live
-- avatar look like an orphan -- and the policy would then permit deleting it.
-- Reading the table definitively is the difference between "no such account"
-- and "cannot see that account".
CREATE OR REPLACE FUNCTION public.aspire_is_orphan_storage_path(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT split_part(p_name, '/', 1)
           ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND NOT EXISTS (
       SELECT 1 FROM public.users u
       WHERE u.user_id::TEXT = split_part(p_name, '/', 1)
     );
$$;

REVOKE ALL ON FUNCTION public.aspire_is_orphan_storage_path(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_is_orphan_storage_path(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.aspire_storage_usage()
RETURNS TABLE (
  bucket_id TEXT,
  object_count BIGINT,
  total_bytes BIGINT,
  largest_bytes BIGINT,
  orphan_count BIGINT,
  orphan_bytes BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Only an administrator can view storage usage.';
  END IF;

  RETURN QUERY
  WITH obj AS (
    SELECT o.bucket_id::TEXT AS bucket,
           COALESCE((o.metadata->>'size')::BIGINT, 0) AS size_bytes,
           public.aspire_is_orphan_storage_path(o.name) AS is_orphan
    FROM storage.objects o
  )
  SELECT obj.bucket,
         count(*)::BIGINT,
         COALESCE(SUM(obj.size_bytes), 0)::BIGINT,
         COALESCE(MAX(obj.size_bytes), 0)::BIGINT,
         count(*) FILTER (WHERE obj.is_orphan)::BIGINT,
         COALESCE(SUM(obj.size_bytes) FILTER (WHERE obj.is_orphan), 0)::BIGINT
  FROM obj
  GROUP BY obj.bucket
  ORDER BY obj.bucket;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_storage_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_storage_usage() TO authenticated;

-- The orphan paths themselves, so the Admin page can remove them through the
-- Storage API.
--
-- IMPORTANT: this function lists; it does not delete. Deleting a row from
-- storage.objects would leave the actual file in the bucket forever, because the
-- bytes live outside the database and are removed only by the Storage API. The
-- page therefore reads paths here and calls storage.remove() with them, which is
-- what the policy below exists to permit.
CREATE OR REPLACE FUNCTION public.aspire_list_orphan_storage_objects(
  p_bucket_id TEXT,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (object_name TEXT, size_bytes BIGINT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Only an administrator can list unused files.';
  END IF;

  RETURN QUERY
  SELECT o.name::TEXT,
         COALESCE((o.metadata->>'size')::BIGINT, 0),
         o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = p_bucket_id
    AND public.aspire_is_orphan_storage_path(o.name)
  ORDER BY o.created_at
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_list_orphan_storage_objects(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_list_orphan_storage_objects(TEXT, INTEGER) TO authenticated;

-- An admin may delete an avatar whose owner no longer exists -- and only such a
-- file. The owner-only policy for everyone else stays exactly as it was, so this
-- adds a narrow cleanup path rather than a general admin override.
--
-- Wrapped in an exception handler because storage.objects is owned by
-- supabase_storage_admin, not postgres, and whether this role may add a policy
-- to it depends on how the project was provisioned. Everything else in this
-- migration is independent of it, so a refusal here must not roll back backup
-- and restore -- it only means the orphan-cleanup button cannot delete, which
-- the NOTICE says plainly and which the page reports when used.
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS avatars_admin_delete_orphans ON storage.objects';
  EXECUTE $policy$
    CREATE POLICY avatars_admin_delete_orphans ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'avatars'
        AND public.is_active_admin()
        AND public.aspire_is_orphan_storage_path(storage.objects.name)
      )
  $policy$;
  RAISE NOTICE 'Storage cleanup policy installed.';
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE WARNING
    'Could not add the storage cleanup policy to storage.objects (%). Backup and restore are unaffected. Unused-file removal will report that it cannot delete until this policy is added by a role that owns storage.objects -- the Storage policy editor in the Supabase dashboard can do it.',
    SQLERRM;
END;
$$;

-- Recording the cleanup is a write, so it needs its own gated function.
CREATE OR REPLACE FUNCTION public.aspire_record_storage_cleanup(
  p_bucket_id TEXT,
  p_removed INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Only an administrator can record a storage cleanup.';
  END IF;

  INSERT INTO public.backup_runs (kind, performed_by, row_count, notes)
  VALUES ('storage_cleanup', auth.uid(), GREATEST(COALESCE(p_removed, 0), 0),
          format('Removed %s unused file(s) from the "%s" bucket.',
                 GREATEST(COALESCE(p_removed, 0), 0), p_bucket_id));
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_record_storage_cleanup(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_record_storage_cleanup(TEXT, INTEGER) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Capacity, against the hosting plan's limits
-- -----------------------------------------------------------------------------
-- Limits resolve from the chosen tier, so nothing is typed by hand. An explicit
-- override wins when present, for a project on terms that do not match a
-- published tier; otherwise the tier's own figure applies.
CREATE OR REPLACE FUNCTION public.aspire_capacity_report()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
DECLARE
  v_settings RECORD;
  v_buckets JSONB;
  v_storage_used BIGINT;
  v_db_bytes BIGINT;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Only an administrator can view capacity.';
  END IF;

  -- COALESCE resolves the effective limit: an explicit override if one was
  -- entered, otherwise the chosen tier's published figure.
  SELECT s.hosting_plan_tier,
         COALESCE(t.label, 'Not set') AS label,
         COALESCE(s.storage_quota_bytes, t.storage_bytes) AS storage_limit,
         COALESCE(s.database_quota_bytes, t.database_bytes) AS database_limit,
         t.egress_bytes,
         t.notes,
         (s.storage_quota_bytes IS NOT NULL OR s.database_quota_bytes IS NOT NULL) AS has_override
    INTO v_settings
  FROM public.system_settings s
  LEFT JOIN public.hosting_plan_tiers t ON t.id = s.hosting_plan_tier
  WHERE s.id = 1;

  IF NOT FOUND THEN
    -- The single settings row is seeded by an earlier migration, so this means
    -- that migration has not been run. Say which, rather than failing on a
    -- NULL field access further down.
    RAISE EXCEPTION 'The system settings have not been set up yet. Apply the maintenance-mode migration first.';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', u.bucket_id,
           'object_count', u.object_count,
           'total_bytes', u.total_bytes,
           'largest_bytes', u.largest_bytes,
           'orphan_count', u.orphan_count,
           'orphan_bytes', u.orphan_bytes
         ) ORDER BY u.bucket_id), '[]'::jsonb),
         COALESCE(SUM(u.total_bytes), 0)
    INTO v_buckets, v_storage_used
  FROM public.aspire_storage_usage() u;

  v_db_bytes := pg_database_size(current_database());

  RETURN jsonb_build_object(
    'plan_tier', v_settings.hosting_plan_tier,
    'plan_label', v_settings.label,
    'plan_notes', v_settings.notes,
    'plan_has_override', v_settings.has_override,
    'storage_quota_bytes', v_settings.storage_limit,
    'storage_used_bytes', v_storage_used,
    'database_quota_bytes', v_settings.database_limit,
    -- The whole database, not just the backed-up tables: indexes, bloat and
    -- the auth schema all count against the plan even though a backup skips them.
    'database_used_bytes', v_db_bytes,
    -- Reported so the figure is visible, but it cannot be measured from SQL --
    -- the hosting dashboard is the only place that knows it.
    'egress_quota_bytes', v_settings.egress_bytes,
    'buckets', v_buckets,
    'tiers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', t.id, 'label', t.label,
               'storage_bytes', t.storage_bytes,
               'database_bytes', t.database_bytes,
               'notes', t.notes
             ) ORDER BY t.sort_order), '[]'::jsonb)
      FROM public.hosting_plan_tiers t
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_capacity_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_capacity_report() TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Is the newest backup still usable?
-- -----------------------------------------------------------------------------
-- Answers the question nobody remembers to ask: has the database changed shape
-- since the last backup was taken? A migration that adds a required column
-- silently makes every earlier backup unrestorable, and the only moment that
-- usually becomes apparent is during an emergency.
--
-- Comparing the newest export's recorded fingerprint against the live one turns
-- "remember to take a fresh backup after every migration" into something the
-- page tells you.
CREATE OR REPLACE FUNCTION public.aspire_backup_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_live TEXT;
  v_last RECORD;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Only an administrator can view the backup status.';
  END IF;

  v_live := public.aspire_schema_fingerprint();

  SELECT r.performed_at, r.schema_fingerprint, r.row_count, r.table_count
    INTO v_last
  FROM public.backup_runs r
  WHERE r.kind = 'export'
  ORDER BY r.performed_at DESC
  LIMIT 1;

  -- Guarded rather than relying on SELECT INTO leaving a usable all-NULL
  -- record: reading a field of a record that matched no row is an error, and
  -- "no backup has ever been taken" is the normal state on day one.
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'schema_fingerprint', v_live,
      'last_backup_at', NULL,
      'last_backup_rows', NULL,
      'last_backup_tables', NULL,
      'last_backup_fingerprint', NULL,
      'schema_changed_since_last_backup', NULL,
      'days_since_last_backup', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'schema_fingerprint', v_live,
    'last_backup_at', v_last.performed_at,
    'last_backup_rows', v_last.row_count,
    'last_backup_tables', v_last.table_count,
    'last_backup_fingerprint', v_last.schema_fingerprint,
    -- NULL rather than false when there is no backup at all: "no backup" and
    -- "backup still matches" are different situations and the page says so
    -- differently.
    'schema_changed_since_last_backup',
      CASE WHEN v_last.schema_fingerprint IS NULL THEN NULL
           ELSE v_last.schema_fingerprint <> v_live END,
    'days_since_last_backup',
      CASE WHEN v_last.performed_at IS NULL THEN NULL
           ELSE EXTRACT(EPOCH FROM (now() - v_last.performed_at)) / 86400 END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_backup_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_backup_status() TO authenticated;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
-- Only the ungated internal function is exercised here. is_active_admin()
-- resolves auth.uid(), which is NULL in the SQL editor, so calling a gated
-- function from this block would fail for the wrong reason.
DO $$
DECLARE
  v_unordered TEXT;
  v_tables INTEGER;
BEGIN
  IF to_regclass('public.backup_runs') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: backup_runs was not created.';
  END IF;
  IF to_regprocedure('public.aspire_backup_table_order()') IS NULL
     OR to_regprocedure('public.aspire_backup_manifest()') IS NULL
     OR to_regprocedure('public.aspire_schema_shape()') IS NULL
     OR to_regprocedure('public.aspire_schema_fingerprint()') IS NULL
     OR to_regprocedure('public.aspire_export_backup(integer)') IS NULL
     OR to_regprocedure('public.aspire_record_backup_run(text,integer,integer,text,text)') IS NULL
     OR to_regprocedure('public.aspire_compare_schema_shape(jsonb)') IS NULL
     OR to_regprocedure('public.aspire_validate_backup(jsonb)') IS NULL
     OR to_regprocedure('public.aspire_restore_backup(jsonb,boolean)') IS NULL
     OR to_regprocedure('public.aspire_storage_usage()') IS NULL
     OR to_regprocedure('public.aspire_list_orphan_storage_objects(text,integer)') IS NULL
     OR to_regprocedure('public.aspire_record_storage_cleanup(text,integer)') IS NULL
     OR to_regprocedure('public.aspire_capacity_report()') IS NULL
     OR to_regprocedure('public.aspire_backup_status()') IS NULL
     OR to_regprocedure('public.set_hosting_plan(text,bigint,bigint)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: one or more backup functions were not created.';
  END IF;

  -- The destructive one-argument form must not exist: it would be ambiguous
  -- against the two-argument version and would default to a real restore.
  IF to_regprocedure('public.aspire_restore_backup(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Verification failed: the one-argument aspire_restore_backup still exists.';
  END IF;

  -- Export must be STABLE, or it reads each table under a different snapshot and
  -- can produce a backup with broken references. This is not a style check.
  IF (SELECT p.provolatile FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.aspire_export_backup(integer)')) <> 's' THEN
    RAISE EXCEPTION 'Verification failed: aspire_export_backup must be STABLE so the whole export shares one snapshot.';
  END IF;

  -- The capacity columns must exist, or the storage panel has nothing to
  -- compare usage against.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'system_settings'
      AND column_name = 'hosting_plan_tier'
  ) THEN
    RAISE EXCEPTION 'Verification failed: system_settings.hosting_plan_tier was not added.';
  END IF;

  -- The project must start on a known tier, or the capacity panel has no
  -- limits to measure against and the admin is back to typing numbers.
  IF NOT EXISTS (
    SELECT 1 FROM public.system_settings s
    JOIN public.hosting_plan_tiers t ON t.id = s.hosting_plan_tier
    WHERE s.id = 1 AND t.storage_bytes IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Verification failed: no hosting plan tier with limits is selected.';
  END IF;

  -- The three skipped tables must be absent from the order.
  IF EXISTS (
    SELECT 1 FROM public.aspire_backup_table_order() o
    WHERE o.table_name = ANY (public.aspire_backup_skipped_tables())
  ) THEN
    RAISE EXCEPTION 'Verification failed: the backup order includes a table that must be skipped.';
  END IF;

  -- Every table must be orderable, or restore is unsafe. Naming them is the
  -- whole point: a cycle is fixable, but only if you know which tables form it.
  SELECT string_agg(o.table_name, ', ' ORDER BY o.table_name) INTO v_unordered
  FROM public.aspire_backup_table_order() o
  WHERE o.sort_order < 0;

  IF v_unordered IS NOT NULL THEN
    RAISE EXCEPTION
      'Verification failed: these tables form a foreign-key cycle and cannot be restored safely: %. Backup still works; restore will refuse.',
      v_unordered;
  END IF;

  -- The shape must describe every table in scope. A shape that silently misses
  -- a table would let an incompatible backup pass the compatibility check.
  SELECT count(*) INTO v_tables FROM public.aspire_backup_table_order();
  IF (SELECT count(*) FROM jsonb_object_keys(public.aspire_schema_shape())) <> v_tables THEN
    RAISE EXCEPTION 'Verification failed: the schema shape does not cover every table in scope.';
  END IF;

  -- A backup of the current shape must compare as compatible with itself.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.aspire_compare_schema_shape(public.aspire_schema_shape())
    ) d
  ) THEN
    RAISE EXCEPTION 'Verification failed: the current schema is reported as differing from itself.';
  END IF;

  RAISE NOTICE 'Backup and restore installed. % table(s) in scope, all orderable. Schema fingerprint %.',
    v_tables, public.aspire_schema_fingerprint();
END;
$$;
