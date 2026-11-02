-- =============================================================================
-- ASPIRE: SYSTEM SETTINGS AND MAINTENANCE MODE (Phase 2)
-- =============================================================================
-- Adds the single-row settings table behind Admin's Maintenance Mode toggle, the
-- RPC that writes it, and the Realtime publication needed to push a flip to open
-- tabs.
--
-- Reference: docs/03-development/audits/SYSTEM_MAINTENANCE_AND_HEALTH_WORKFLOW_PLAN_2026-10-28.md
--            docs/03-development/audits/POST_DEFENSE_IMPLEMENTATION_PHASING_2026-10-29.md
--
-- CONFIRMED DECISIONS REFLECTED HERE
--   * Normalized rather than one catch-all settings row: this table holds
--     maintenance state only. R2 credentials live in supabase/.env and are read
--     by the edge function, so no storage-config table is needed at all.
--   * Writes go through a SECURITY DEFINER RPC that checks the caller's role
--     server-side, rather than trusting a client-side admin check. Admin keeps
--     this capability -- maintenance is Admin's remit, not Registrar's.
--   * Readable by every authenticated role, because every session needs to know
--     the flag in order to show the banner or the maintenance screen.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.system_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforces a single row
  maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
  maintenance_message TEXT,
  updated_by UUID REFERENCES public.users(user_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.system_settings IS
  'Single-row maintenance state. Storage/R2 configuration is deliberately NOT '
  'kept here: those credentials live in supabase/.env, server-side only.';

INSERT INTO public.system_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Read: everyone authenticated. A student who cannot read the flag cannot be
-- shown the maintenance screen.
DROP POLICY IF EXISTS system_settings_select_authenticated ON public.system_settings;
CREATE POLICY system_settings_select_authenticated ON public.system_settings
  FOR SELECT TO authenticated
  USING (TRUE);

-- No INSERT/UPDATE/DELETE policy at all: the table is written only through the
-- SECURITY DEFINER RPC below, which bypasses RLS and enforces the role check
-- itself. Leaving no write policy means a direct client write is refused even if
-- a caller tries, rather than relying on the UI to not offer it.
REVOKE INSERT, UPDATE, DELETE ON public.system_settings FROM authenticated;
REVOKE ALL ON public.system_settings FROM anon;

CREATE OR REPLACE FUNCTION public.set_maintenance_mode(
  p_enabled BOOLEAN,
  p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only an active administrator may change maintenance mode.';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An enabled flag is required.';
  END IF;

  -- A maintenance screen with no explanation is worse than none: the whole point
  -- of the feature is replacing an ambiguous failure with a deliberate message.
  IF p_enabled AND NULLIF(BTRIM(COALESCE(p_message, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'A message is required when turning maintenance mode on.';
  END IF;

  UPDATE public.system_settings
  SET maintenance_mode = p_enabled,
      maintenance_message = CASE
        WHEN p_enabled THEN BTRIM(p_message)
        -- Keep the last message on the row when switching off, so the Admin page
        -- can still show what was announced without re-typing it next time.
        ELSE maintenance_message
      END,
      updated_by = v_actor,
      updated_at = now()
  WHERE id = 1;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'maintenance_mode', p_enabled,
    'updated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_maintenance_mode(BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_maintenance_mode(BOOLEAN, TEXT) TO authenticated;

COMMENT ON FUNCTION public.set_maintenance_mode(BOOLEAN, TEXT) IS
  'Admin-only: flips maintenance mode and records who changed it and when.';

-- Realtime: the client subscribes to postgres_changes on this table, reusing the
-- pattern AuthContext.jsx already uses for notifications. Without the table in
-- the publication, the subscription silently never fires and the UI would depend
-- entirely on its polling fallback.
DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'system_settings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
      RAISE NOTICE 'Added public.system_settings to the supabase_realtime publication.';
    ELSE
      RAISE NOTICE 'public.system_settings is already in the supabase_realtime publication.';
    END IF;
  ELSE
    RAISE NOTICE
      'No supabase_realtime publication found. Maintenance mode will still work '
      'through the client polling fallback; add the table to Realtime in the '
      'Supabase dashboard to get instant propagation.';
  END IF;
END
$realtime$;

-- -----------------------------------------------------------------------------
-- Post-conditions
-- -----------------------------------------------------------------------------
DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.system_settings WHERE id = 1) THEN
    RAISE EXCEPTION 'Verification failed: the single system_settings row is missing.';
  END IF;

  IF to_regprocedure('public.set_maintenance_mode(boolean,text)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: set_maintenance_mode() was not created.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'system_settings'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Verification failed: no SELECT policy on system_settings.';
  END IF;

  -- There must be no write policy: writes are the RPC's job alone.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'system_settings'
      AND cmd <> 'SELECT'
  ) THEN
    RAISE EXCEPTION
      'Verification failed: system_settings has a write policy. Writes must go '
      'only through set_maintenance_mode().';
  END IF;

  RAISE NOTICE 'system_settings and maintenance-mode RPC verified.';
END
$verify$;

COMMIT;
