-- Phase 7 — Approved search destinations
-- =============================================================================
-- 2026-10-30. Owner's decision: the places a student can be sent to search are
-- a list the institution maintains, not something hard-coded in an edge
-- function and not something the model chooses.
--
-- WHY THIS EXISTS
-- When an instructor has attached no materials for a topic, the tutor offers
-- search terms rather than a dead end. The model supplies KEYWORDS ONLY and
-- never a URL: a model with no browsing tool can only recall links, and
-- recalled links are routinely dead or point somewhere other than they claim.
-- The link is then built by filling one of these templates with the encoded
-- keyword, so every link a student sees is, by construction, a working search
-- page on an approved site.
--
-- That split is the point. Keywords are safe for a model to invent -- a weak
-- keyword gives weak results the student judges for themselves. A fabricated
-- link looks authoritative and is not.
--
-- Separate migration rather than folded into 20261030121641 so it applies
-- cleanly whether or not that one has already been run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.search_destinations (
  destination_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(60) NOT NULL,
  -- {q} is replaced with the URL-encoded keyword. Both constraints matter:
  -- https so a student is never sent over plain http, and the placeholder so a
  -- template cannot silently become a fixed link to one page.
  url_template TEXT NOT NULL
    CHECK (url_template ~* '^https://' AND url_template LIKE '%{q}%'),
  -- Shown to the student on the button, e.g. "Find a video".
  action_label VARCHAR(40) NOT NULL DEFAULT 'Search',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_search_destinations_active
  ON public.search_destinations (sort_order)
  WHERE is_active;

ALTER TABLE public.search_destinations ENABLE ROW LEVEL SECURITY;

-- Readable by anyone signed in: it is a list of public websites, and the
-- student's page needs it. Nothing here is personal.
DROP POLICY IF EXISTS search_destinations_read ON public.search_destinations;
CREATE POLICY search_destinations_read ON public.search_destinations
  FOR SELECT TO authenticated
  USING (TRUE);

-- Curated by the administrator or the Registrar. Deliberately not faculty:
-- this is an institution-wide list, and a per-class resource belongs on the
-- activity instead.
DROP POLICY IF EXISTS search_destinations_manage ON public.search_destinations;
CREATE POLICY search_destinations_manage ON public.search_destinations
  FOR ALL TO authenticated
  USING (public.is_active_admin() OR public.is_active_registrar())
  WITH CHECK (public.is_active_admin() OR public.is_active_registrar());

REVOKE ALL ON public.search_destinations FROM anon;

-- Two to start with. ON CONFLICT DO NOTHING so re-running this migration never
-- undoes a change made in the SQL editor -- if the owner removes YouTube or
-- edits a label, it stays removed or edited.
INSERT INTO public.search_destinations (name, url_template, action_label, sort_order)
VALUES
  ('Google',  'https://www.google.com/search?q={q}',          'Search the web', 1),
  ('YouTube', 'https://www.youtube.com/results?search_query={q}', 'Find a video',   2)
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_count INTEGER;
BEGIN
  IF to_regclass('public.search_destinations') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: search_destinations was not created.';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.search_destinations WHERE is_active;
  IF v_count = 0 THEN
    RAISE WARNING 'No active search destinations. The tutor will show keywords without links until at least one is added.';
  END IF;

  -- A template without the placeholder would send every student to the same
  -- page regardless of what they searched for.
  IF EXISTS (
    SELECT 1 FROM public.search_destinations WHERE url_template NOT LIKE '%{q}%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: a destination has no {q} placeholder.';
  END IF;

  RAISE NOTICE 'Search destinations installed (% active). Add or remove them with ordinary INSERT/UPDATE.', v_count;
END;
$verify$;

COMMIT;
