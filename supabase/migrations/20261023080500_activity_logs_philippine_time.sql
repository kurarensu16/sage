-- =============================================================================
-- ASPIRE AUDIT LOG TIMEZONE NORMALIZATION
-- =============================================================================
-- activity_logs predates the migration history and was created with TIMESTAMP
-- WITHOUT TIME ZONE. The stored clock values are UTC, but PostgREST returns
-- them without an offset, causing browsers to display UTC as if it were local
-- time. Convert the column to an absolute instant while preserving every
-- existing row, then let clients render it in Asia/Manila (UTC+8).

BEGIN;

-- Remove the legacy implicit cast before changing the column type. The same
-- instant-aware default is restored after normalization.
ALTER TABLE public.activity_logs
  ALTER COLUMN "timestamp" DROP DEFAULT;

DO $migration$
DECLARE
  v_data_type TEXT;
BEGIN
  SELECT column_row.data_type
  INTO v_data_type
  FROM information_schema.columns column_row
  WHERE column_row.table_schema = 'public'
    AND column_row.table_name = 'activity_logs'
    AND column_row.column_name = 'timestamp';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42703',
      MESSAGE = 'public.activity_logs.timestamp does not exist.';
  ELSIF v_data_type = 'timestamp without time zone' THEN
    ALTER TABLE public.activity_logs
      ALTER COLUMN "timestamp" TYPE TIMESTAMPTZ
      USING "timestamp" AT TIME ZONE 'UTC';
  ELSIF v_data_type <> 'timestamp with time zone' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42804',
      MESSAGE = FORMAT(
        'public.activity_logs.timestamp has unsupported type %s.',
        v_data_type
      );
  END IF;
END;
$migration$;

ALTER TABLE public.activity_logs
  ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;

COMMENT ON COLUMN public.activity_logs."timestamp" IS
  'Absolute UTC audit instant (TIMESTAMPTZ); user interfaces display Asia/Manila / PHT (UTC+8).';

COMMIT;
