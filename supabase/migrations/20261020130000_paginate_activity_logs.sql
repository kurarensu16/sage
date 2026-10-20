-- Support fast, server-side paging of the immutable audit ledger. The UI reads
-- only the active page; this function provides the small set of global values
-- needed for the summary cards and filter dropdowns.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp_log_id_desc
  ON public.activity_logs (timestamp DESC, log_id DESC);

CREATE OR REPLACE FUNCTION public.get_activity_log_overview()
RETURNS TABLE (
  total_records BIGINT,
  today_actions BIGINT,
  unique_actors BIGINT,
  action_types BIGINT,
  actions TEXT[],
  sources TEXT[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH boundaries AS (
    SELECT date_trunc('day', now() AT TIME ZONE 'Asia/Manila')
      AT TIME ZONE 'Asia/Manila' AS manila_today_start
  )
  SELECT
    COUNT(*)::BIGINT AS total_records,
    COUNT(*) FILTER (
      WHERE log.timestamp >= (SELECT manila_today_start FROM boundaries)
    )::BIGINT AS today_actions,
    COUNT(DISTINCT log.actor)::BIGINT AS unique_actors,
    COUNT(DISTINCT log.action)::BIGINT AS action_types,
    COALESCE(
      ARRAY_AGG(DISTINCT log.action ORDER BY log.action) FILTER (WHERE log.action IS NOT NULL),
      ARRAY[]::TEXT[]
    ) AS actions,
    COALESCE(
      ARRAY_AGG(DISTINCT log.source ORDER BY log.source) FILTER (WHERE log.source IS NOT NULL),
      ARRAY[]::TEXT[]
    ) AS sources
  FROM public.activity_logs AS log;
$$;

REVOKE ALL ON FUNCTION public.get_activity_log_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_activity_log_overview() TO authenticated;

COMMIT;
