-- =============================================================================
-- Scheduled maintenance windows, with chosen reasons
-- =============================================================================
-- Date: 2026-10-29
--
-- WHAT CHANGES
-- Maintenance mode was a single boolean plus a message the admin retyped every
-- time. It becomes a window with a start, an end, a chosen reason, and an
-- optional note -- and the message users read is composed from those rather
-- than typed from memory.
--
-- MANUAL OR AUTOMATIC, PER WINDOW (owner's decision, 2026-10-29)
--   Manual     the switch is the truth. A window, if set, is announced only.
--   Automatic  the clock opens the window; it closes at the end time.
--
-- In BOTH modes the manual switch can force maintenance ON. Automatic can only
-- ever add maintenance, never remove it. That asymmetry is deliberate: the
-- dangerous direction is the system re-opening while work is still running, so
-- the clock is not allowed to decide that on its own once someone has said
-- "stay closed".
--
-- ONE SOURCE OF TRUTH
-- is_maintenance_active() is now the only thing that answers "is the system
-- closed". The banner, the maintenance screen and the restore gate all call it.
-- Before this, the restore gate read system_settings.maintenance_mode directly;
-- with a clock-driven window that would have let the gate and the banner
-- disagree, and the gate is the one protecting a destructive operation.
--
-- NO BACKGROUND JOB
-- Nothing schedules anything. "Active" is computed from the clock at the moment
-- it is asked, so there is no cron to install, nothing to drift, and nothing
-- that can fail silently overnight.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The reasons a window can be opened for
-- -----------------------------------------------------------------------------
-- Data, not a list in the page, for the same reason the hosting tiers are: the
-- vocabulary belongs to the institution and will change without a developer.
CREATE TABLE IF NOT EXISTS public.maintenance_reasons (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('routine', 'academic', 'unplanned')),
  -- What users are told. Written for them, not for an operations log.
  message_template TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE public.maintenance_reasons IS
  'Why a maintenance window is open. message_template is shown to users, so it '
  'is written in plain language and never names a table, job or error.';

ALTER TABLE public.maintenance_reasons ENABLE ROW LEVEL SECURITY;

-- Readable by everyone signed in: the maintenance screen has to render the
-- chosen reason for the people being kept out, not only for the admin.
DROP POLICY IF EXISTS maintenance_reasons_select ON public.maintenance_reasons;
CREATE POLICY maintenance_reasons_select ON public.maintenance_reasons
  FOR SELECT TO authenticated
  USING (TRUE);

REVOKE INSERT, UPDATE, DELETE ON public.maintenance_reasons FROM authenticated;
REVOKE ALL ON public.maintenance_reasons FROM anon;

INSERT INTO public.maintenance_reasons (id, label, category, message_template, sort_order)
VALUES
  -- Routine operations
  ('scheduled',        'Scheduled maintenance',     'routine',
   'ASPIRE is closed for scheduled maintenance.', 10),
  ('system_update',    'System update',             'routine',
   'ASPIRE is being updated. Your records are safe and nothing has been lost.', 20),
  ('backup',           'Database backup',           'routine',
   'ASPIRE is closed while a backup of all records is taken.', 30),
  ('restore',          'Restoring from backup',     'routine',
   'ASPIRE is closed while records are being restored from a backup. Anything saved in the last few minutes may need to be entered again.', 40),

  -- Academic calendar
  ('term_processing',  'End-of-term grade processing', 'academic',
   'ASPIRE is closed while end-of-term grades are processed. It will reopen once all grades are final.', 50),
  ('posting_cutoff',   'Grade posting cutoff',      'academic',
   'Grade posting is closed for this term. Contact the Registrar if you need to submit a grade after the cutoff.', 60),
  ('enrollment_setup', 'Enrollment period setup',   'academic',
   'ASPIRE is closed while classes and sections are prepared for the new enrollment period.', 70),

  -- Unplanned
  ('emergency_fix',    'Emergency fix',             'unplanned',
   'ASPIRE is temporarily closed while we fix a problem. Please try again shortly.', 80),
  ('investigating',    'Investigating an issue',    'unplanned',
   'ASPIRE is temporarily closed while we look into a problem that was reported. Your records are safe.', 90),
  ('disruption',       'Service disruption',        'unplanned',
   'ASPIRE is unavailable because of a service disruption outside the system. We are waiting for it to be resolved.', 100)
ON CONFLICT (id) DO UPDATE
SET label = EXCLUDED.label,
    category = EXCLUDED.category,
    message_template = EXCLUDED.message_template,
    sort_order = EXCLUDED.sort_order;

-- -----------------------------------------------------------------------------
-- 1b. Ready-made additions to the note
-- -----------------------------------------------------------------------------
-- The reason supplies the standard wording; these are the sentences an admin
-- would otherwise retype every window. Kept as data for the same reason the
-- reasons are: whoever rewords them is not going to be a developer.
--
-- reason_id is nullable and currently always NULL. It exists so a preset can
-- later be offered only alongside a particular reason without another
-- migration; the page already filters on it.
CREATE TABLE IF NOT EXISTS public.maintenance_note_presets (
  id TEXT PRIMARY KEY,
  note_text TEXT NOT NULL,
  reason_id TEXT REFERENCES public.maintenance_reasons(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE public.maintenance_note_presets IS
  'Optional sentences an admin can add to a maintenance notice with one click, '
  'instead of typing them. Shown to users verbatim, so written for them.';

ALTER TABLE public.maintenance_note_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_note_presets_select ON public.maintenance_note_presets;
CREATE POLICY maintenance_note_presets_select ON public.maintenance_note_presets
  FOR SELECT TO authenticated
  USING (public.is_active_admin());

REVOKE INSERT, UPDATE, DELETE ON public.maintenance_note_presets FROM authenticated;
REVOKE ALL ON public.maintenance_note_presets FROM anon;

INSERT INTO public.maintenance_note_presets (id, note_text, sort_order)
VALUES
  ('no_action',       'No action is needed from you.', 10),
  ('view_only',       'You can still sign in to view your records, but saving is turned off.', 20),
  ('save_first',      'Please save any work before this time.', 30),
  ('grade_posting',   'Grade posting will be unavailable during this time.', 40),
  ('deadline',        'If this affects a deadline, contact the Registrar.', 50),
  ('update_here',     'We will post an update here if it runs longer than expected.', 60),
  ('records_safe',    'Your records are safe and nothing has been lost.', 70)
ON CONFLICT (id) DO UPDATE
SET note_text = EXCLUDED.note_text,
    sort_order = EXCLUDED.sort_order;

-- -----------------------------------------------------------------------------
-- 2. The window itself
-- -----------------------------------------------------------------------------
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS maintenance_reason_id TEXT REFERENCES public.maintenance_reasons(id),
  ADD COLUMN IF NOT EXISTS maintenance_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS maintenance_ends_at TIMESTAMPTZ,
  -- FALSE: the switch decides. TRUE: the clock may also open the window.
  ADD COLUMN IF NOT EXISTS maintenance_auto BOOLEAN NOT NULL DEFAULT FALSE;

-- A window that ends before it starts would be silently never-active, which is
-- the worst kind of wrong: the admin believes the system is closed and it is
-- open the whole time.
ALTER TABLE public.system_settings
  DROP CONSTRAINT IF EXISTS system_settings_maintenance_window_order;
ALTER TABLE public.system_settings
  ADD CONSTRAINT system_settings_maintenance_window_order
  CHECK (
    maintenance_starts_at IS NULL
    OR maintenance_ends_at IS NULL
    OR maintenance_ends_at > maintenance_starts_at
  );

-- An automatic window needs both ends, or there is nothing for the clock to
-- compare against.
ALTER TABLE public.system_settings
  DROP CONSTRAINT IF EXISTS system_settings_maintenance_auto_needs_window;
ALTER TABLE public.system_settings
  ADD CONSTRAINT system_settings_maintenance_auto_needs_window
  CHECK (
    maintenance_auto = FALSE
    OR (maintenance_starts_at IS NOT NULL AND maintenance_ends_at IS NOT NULL)
  );

-- -----------------------------------------------------------------------------
-- 3. The one answer to "is the system closed"
-- -----------------------------------------------------------------------------
-- The manual switch can only ever force maintenance ON. The clock can only ever
-- add a window. Neither can turn the other off.
--
-- That is what stops the clock re-opening the system at 10 PM while a restore
-- started at 9:55 is still running: once the switch is on, only a person turns
-- it off.
CREATE OR REPLACE FUNCTION public.is_maintenance_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT s.maintenance_mode
            OR (s.maintenance_auto
                AND s.maintenance_starts_at IS NOT NULL
                AND s.maintenance_ends_at IS NOT NULL
                AND now() >= s.maintenance_starts_at
                AND now() <  s.maintenance_ends_at)
     FROM public.system_settings s
     WHERE s.id = 1),
    FALSE   -- no settings row: the system is open, never closed by accident
  );
$$;

REVOKE ALL ON FUNCTION public.is_maintenance_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_maintenance_active() TO authenticated;

COMMENT ON FUNCTION public.is_maintenance_active() IS
  'The single source of truth for whether ASPIRE is closed. The banner, the '
  'maintenance screen and the restore gate all call this, so they cannot '
  'disagree.';

-- The message users read, composed from the reason, the window and the note.
--
-- Its own function so there is exactly one definition of that text. The admin
-- page shows a live preview before saving, and if the preview were built in
-- JavaScript it would drift from what the maintenance screen actually renders --
-- the admin would approve one wording and users would see another.
CREATE OR REPLACE FUNCTION public.aspire_compose_maintenance_message(
  p_reason_id TEXT,
  p_ends_at TIMESTAMPTZ,
  p_note TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template TEXT;
  v_note TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
  v_message TEXT;
BEGIN
  SELECT r.message_template INTO v_template
  FROM public.maintenance_reasons r WHERE r.id = p_reason_id;

  -- Composed in the order a reader needs it: what is happening, when it ends,
  -- then anything specific the admin added.
  v_message := COALESCE(v_template, v_note);
  IF v_message IS NULL THEN RETURN NULL; END IF;

  IF p_ends_at IS NOT NULL AND p_ends_at > now() THEN
    v_message := v_message
      || ' Expected back by '
      || to_char(p_ends_at AT TIME ZONE 'Asia/Manila', 'FMHH12:MI AM "on" FMMonth FMDD')
      || '.';
  END IF;

  -- The note is additional to the reason, never a replacement for it. When
  -- there is no reason the note already became the message above, so adding it
  -- again here would repeat it.
  IF v_template IS NOT NULL AND v_note IS NOT NULL THEN
    v_message := v_message || ' ' || v_note;
  END IF;

  RETURN v_message;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_compose_maintenance_message(TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_compose_maintenance_message(TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

-- Everything the maintenance screen needs, in one read: whether it is active,
-- what to tell people, and when it is expected to end.
CREATE OR REPLACE FUNCTION public.aspire_maintenance_state()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s RECORD;
  -- Scalar targets, not a RECORD: when no reason is set there is no matching
  -- row, and reading a field of a record that SELECT INTO never assigned is an
  -- error. Scalars simply come back NULL, which is the state being described.
  v_reason_label TEXT;
  v_reason_template TEXT;
  v_message TEXT;
BEGIN
  SELECT * INTO s FROM public.system_settings WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('active', FALSE, 'message', NULL);
  END IF;

  SELECT r.label, r.message_template
    INTO v_reason_label, v_reason_template
  FROM public.maintenance_reasons r
  WHERE r.id = s.maintenance_reason_id;

  v_message := public.aspire_compose_maintenance_message(
    s.maintenance_reason_id, s.maintenance_ends_at, s.maintenance_message
  );

  RETURN jsonb_build_object(
    'active', public.is_maintenance_active(),
    'message', v_message,
    'reason_id', s.maintenance_reason_id,
    'reason_label', v_reason_label,
    'note', NULLIF(BTRIM(COALESCE(s.maintenance_message, '')), ''),
    'starts_at', s.maintenance_starts_at,
    'ends_at', s.maintenance_ends_at,
    'auto', s.maintenance_auto,
    'switch_on', s.maintenance_mode,
    'updated_at', s.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_maintenance_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aspire_maintenance_state() TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Setting a window
-- -----------------------------------------------------------------------------
-- Replaces retyping a message with choosing a reason, a mode and a window. The
-- older set_maintenance_mode(boolean, text) is left in place and still works,
-- so nothing that calls it breaks mid-deploy.
CREATE OR REPLACE FUNCTION public.set_maintenance_window(
  p_switch_on BOOLEAN,
  p_reason_id TEXT,
  p_auto BOOLEAN DEFAULT FALSE,
  p_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_ends_at TIMESTAMPTZ DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_note TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an active administrator may change maintenance mode.';
  END IF;

  -- A reason is required whenever the system will be closed, by the switch or
  -- by the clock. A maintenance screen with no explanation is worse than none.
  IF (p_switch_on OR p_auto) AND p_reason_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Choose a reason so people know why the system is closed.';
  END IF;

  IF p_reason_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.maintenance_reasons r
                     WHERE r.id = p_reason_id AND r.is_active) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'That is not a reason this system offers.';
  END IF;

  IF p_auto AND (p_starts_at IS NULL OR p_ends_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'An automatic window needs both a start and an end time.';
  END IF;

  IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'The end time has to be after the start time.';
  END IF;

  -- A window that has already finished would never open, which looks like the
  -- setting simply did not save.
  IF p_auto AND p_ends_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'That window has already passed. Choose an end time in the future.';
  END IF;

  UPDATE public.system_settings
  SET maintenance_mode = p_switch_on,
      maintenance_reason_id = p_reason_id,
      maintenance_auto = COALESCE(p_auto, FALSE),
      maintenance_starts_at = p_starts_at,
      maintenance_ends_at = p_ends_at,
      maintenance_message = v_note,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = 1;

  RETURN public.aspire_maintenance_state();
END;
$$;

REVOKE ALL ON FUNCTION public.set_maintenance_window(BOOLEAN, TEXT, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_maintenance_window(BOOLEAN, TEXT, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Point the restore gate at the shared answer
-- -----------------------------------------------------------------------------
-- Previously it read system_settings.maintenance_mode directly. With a
-- clock-driven window that would let an automatic window satisfy the banner but
-- not the gate -- an admin would see the system closed and still be refused.
--
-- Patched from the live definition so the rest of the function, which is the
-- most destructive code in ASPIRE, is not retyped. The substitution count is
-- asserted, so a drifted body aborts rather than silently doing nothing.
-- The same block also repairs a defect in the deployed function: its
-- post-restore audit entry writes to public.audit_logs, which does not exist.
-- This project's audit table is public.activity_logs. Because the insert is
-- wrapped in EXCEPTION WHEN OTHERS, the failure was silent -- a restore
-- recorded nothing in the activity log while appearing to.
-- And a third defect, found when the first real restore was attempted:
--
--   SQLSTATE 21000 -- DELETE requires a WHERE clause
--
-- Supabase loads the `safeupdate` guard, which refuses any DELETE or UPDATE
-- without a qualification. The restore empties each table with a bare
-- `DELETE FROM public.<table>`, which is exactly the shape that guard exists to
-- stop.
--
-- WHY NOT `WHERE TRUE`
-- Because it does not survive. PostgreSQL folds a constant-true qualification
-- away while planning, so the executed plan has no qualification at all and the
-- guard -- which inspects the plan -- refuses it just the same. The obvious fix
-- would appear to work right up until a real restore.
--
-- `ctid <> '(0,0)'` cannot be folded: ctid is a column reference, not a
-- constant, so the comparison stays in the plan as a real qualification. And it
-- matches every row, because item offsets within a page begin at 1 -- no live
-- tuple ever has ctid (0,0). So the guard is satisfied and the set of deleted
-- rows is unchanged.
--
-- TRUNCATE would also satisfy the guard but is the wrong tool here: it cannot
-- participate in the deferred foreign-key handling this restore depends on, and
-- the ON DELETE RESTRICT keys would force a CASCADE reaching further than
-- intended.
--
-- Each of the three fixes is applied independently, so this block is safe to
-- run whether the migration is being applied for the first time or re-run after
-- an earlier version of it.
DO $patch$
DECLARE
  v_def TEXT;
  v_new TEXT;
  v_gate TEXT := 'SELECT s.maintenance_mode INTO v_maint FROM public.system_settings s WHERE s.id = 1;';
  v_audit TEXT := 'INSERT INTO public.audit_logs (actor_id, action, message, severity)';
  v_values TEXT := E'            ''critical'');';
  v_delete TEXT := 'format(''DELETE FROM public.%I'', v_rec.table_name)';
  v_count INTEGER;
BEGIN
  v_def := pg_get_functiondef('public.aspire_restore_backup(jsonb,boolean)'::regprocedure);

  IF position('is_maintenance_active' IN v_def) > 0
     AND position('public.audit_logs' IN v_def) = 0
     AND position(v_delete IN v_def) = 0 THEN
    RAISE NOTICE 'aspire_restore_backup is already patched; nothing to do.';
    RETURN;
  END IF;

  v_new := v_def;

  -- 0. Satisfy Supabase's safeupdate guard. Without this the restore fails at
  --    its first DELETE, before anything has been written.
  IF position(v_delete IN v_new) > 0 THEN
    v_count := (length(v_new) - length(replace(v_new, v_delete, ''))) / length(v_delete);
    IF v_count <> 1 THEN
      RAISE EXCEPTION
        'Aborted: aspire_restore_backup contains % unqualified delete(s), expected 1.', v_count;
    END IF;
    v_new := replace(
      v_new, v_delete,
      'format(''DELETE FROM public.%I WHERE ctid <> ''''(0,0)''''::tid'', v_rec.table_name)'
    );
  END IF;

  -- 1. One definition of "is the system closed".
  IF position('is_maintenance_active' IN v_new) = 0 THEN
    v_count := (length(v_new) - length(replace(v_new, v_gate, ''))) / length(v_gate);
    IF v_count <> 1 THEN
      RAISE EXCEPTION
        'Aborted: aspire_restore_backup contains % maintenance read(s), expected 1. '
        'The deployed body differs from what was reviewed -- re-check before applying.', v_count;
    END IF;
    v_new := replace(v_new, v_gate, 'v_maint := public.is_maintenance_active();');
  END IF;

  -- 2. Write the audit entry to the table that actually exists, naming the
  --    admin rather than leaving the actor as a bare id.
  IF position('public.audit_logs' IN v_new) > 0 THEN
    v_count := (length(v_new) - length(replace(v_new, v_audit, ''))) / length(v_audit);
    IF v_count <> 1 THEN
      RAISE EXCEPTION
        'Aborted: aspire_restore_backup contains % audit insert(s), expected 1.', v_count;
    END IF;
    v_new := replace(
      v_new, v_audit,
      'INSERT INTO public.activity_logs (actor_id, action, message, actor)'
    );
    v_new := replace(
      v_new, v_values,
      E'            COALESCE((SELECT u.first_name || '' '' || u.last_name\n'
      || E'                      FROM public.users u WHERE u.user_id = auth.uid()), ''Administrator''));'
    );
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'aspire_restore_backup patched: qualified deletes, shared maintenance check, audit entry to activity_logs.';
END
$patch$;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_reasons INTEGER;
BEGIN
  IF to_regclass('public.maintenance_reasons') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: maintenance_reasons was not created.';
  END IF;
  IF to_regprocedure('public.is_maintenance_active()') IS NULL
     OR to_regprocedure('public.aspire_maintenance_state()') IS NULL
     OR to_regprocedure('public.aspire_compose_maintenance_message(text,timestamptz,text)') IS NULL
     OR to_regprocedure('public.set_maintenance_window(boolean,text,boolean,timestamptz,timestamptz,text)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: one or more maintenance functions are missing.';
  END IF;

  SELECT count(*) INTO v_reasons FROM public.maintenance_reasons WHERE is_active;
  IF v_reasons < 3 THEN
    RAISE EXCEPTION 'Verification failed: the reason list is empty, so no window could be opened.';
  END IF;

  -- The whole point is that a routine window needs no typing. An empty preset
  -- list puts the admin back in front of a blank box.
  IF to_regclass('public.maintenance_note_presets') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: maintenance_note_presets was not created.';
  END IF;
  IF (SELECT count(*) FROM public.maintenance_note_presets WHERE is_active) < 1 THEN
    RAISE EXCEPTION 'Verification failed: no note presets were seeded.';
  END IF;

  -- All three categories must be present, or a whole class of window has no
  -- reason to choose and the admin falls back to a free-text message.
  IF (SELECT count(DISTINCT category) FROM public.maintenance_reasons) <> 3 THEN
    RAISE EXCEPTION 'Verification failed: not all three reason categories were seeded.';
  END IF;

  -- The restore gate and the banner must now be the same question.
  IF position('is_maintenance_active' IN
       pg_get_functiondef('public.aspire_restore_backup(jsonb,boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the restore gate still reads maintenance_mode directly.';
  END IF;

  -- And its audit entry must target a table that exists. The insert is wrapped
  -- in EXCEPTION WHEN OTHERS, so a wrong table name fails silently -- which is
  -- exactly why this is asserted here rather than left to be noticed.
  IF position('public.audit_logs' IN
       pg_get_functiondef('public.aspire_restore_backup(jsonb,boolean)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'Verification failed: the restore still writes to audit_logs, which does not exist.';
  END IF;

  -- Every delete must be qualified, or Supabase's safeupdate guard stops the
  -- restore at its first table. This one is only discoverable by attempting a
  -- real restore, which is the worst possible place to discover it.
  IF position('DELETE FROM public.%I WHERE ctid' IN
       pg_get_functiondef('public.aspire_restore_backup(jsonb,boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the restore still issues an unqualified DELETE, which safeupdate refuses.';
  END IF;

  -- A backwards window must be impossible, or maintenance can be set to a state
  -- that never activates while looking as though it did.
  BEGIN
    UPDATE public.system_settings
    SET maintenance_starts_at = now() + INTERVAL '2 hours',
        maintenance_ends_at = now() + INTERVAL '1 hour'
    WHERE id = 1;
    RAISE EXCEPTION 'Verification failed: a window ending before it starts was accepted.';
  EXCEPTION WHEN check_violation THEN
    NULL;   -- correct
  END;

  RAISE NOTICE 'Scheduled maintenance windows verified. % reason(s) available.', v_reasons;
END
$verify$;
