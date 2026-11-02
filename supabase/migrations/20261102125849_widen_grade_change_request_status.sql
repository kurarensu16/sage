-- =============================================================================
-- A student could never raise a grade dispute: the first status did not fit
-- =============================================================================
--
-- THE BUG
--   Student -> Ask About a Grade -> Send to my instructor:
--
--     POST /rest/v1/rpc/submit_grade_change_request  400
--     22001: value too long for type character varying(20)
--
--   remark_override_requests.status has been VARCHAR(20) since 2026-06-03,
--   when the only statuses were 'pending', 'approved' and 'rejected' -- the
--   longest nine characters. 20261030104405 introduced the chain and widened
--   the CHECK constraint to admit three new waiting states, each named after
--   whose desk the request is on. It never widened the column:
--
--     pending_faculty_review      22  > 20   REFUSED
--     pending_dean_review         19  <= 20  fits
--     pending_registrar_review    24  > 20   REFUSED
--
--   A CHECK constraint cannot save a value the column type rejects first. The
--   constraint said yes and the type said no.
--
-- HOW FAR THIS REACHES
--   Further than one screen. A student-raised dispute OPENS at
--   pending_faculty_review -- deliberately, so a student's request starts with
--   their instructor rather than going straight to the Dean -- so every
--   student-initiated grade change has been impossible since the chain shipped
--   on 2026-10-30. Not intermittent: impossible, every time, for every student.
--
--   pending_registrar_review is the late route, for a request that outlives the
--   dispute window. That has never been reachable either.
--
--   Only the faculty-raised correction worked, because it opens at 'pending'.
--   That is why the chain looked sound in review: the path anyone would try
--   first was the one path that fit.
--
-- WHY TEXT RATHER THAN A WIDER VARCHAR
--   VARCHAR(32) would work today and fail the next time someone names a state
--   honestly. The CHECK constraint is the real control over what may be stored
--   -- it enumerates all eight values -- so the length limit adds nothing
--   except a second, silent gate that nobody updates when the first one
--   changes. This is exactly how that gate was missed.
--
--   Every other status column written since uses TEXT with a CHECK for the same
--   reason; this one predates that habit.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Widen the column. The CHECK constraint is untouched and keeps deciding
--    which values are legal.
--
--    Postgres refuses to retype a column any policy mentions:
--
--      0A000: cannot alter type of a column used in a policy definition
--      DETAIL: policy remark_override_requests_authorized_select ... depends
--              on column "status"
--
--    So the dependent policies come off and go back on. They are rebuilt from
--    pg_policies -- the LIVE definitions -- rather than from any CREATE POLICY
--    text in this repo, because 20261029040940 rewrites policy bodies in place
--    and the deployed rule can legitimately differ from the migration that
--    first wrote it. Re-declaring from source would quietly undo that.
-- -----------------------------------------------------------------------------
DO $retype$
DECLARE
  r      RECORD;
  v_ddl  TEXT[] := '{}';
  v_stmt TEXT;
BEGIN
  -- Only the policies that actually mention the column: anything else stays
  -- untouched, so the blast radius is the smallest it can be.
  FOR r IN
    SELECT policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'remark_override_requests'
      AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) LIKE '%status%'
  LOOP
    v_stmt := FORMAT(
      'CREATE POLICY %I ON public.remark_override_requests AS %s FOR %s TO %s',
      r.policyname,
      CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      r.cmd,
      array_to_string(r.roles, ', ')
    );
    IF r.qual IS NOT NULL THEN
      v_stmt := v_stmt || FORMAT(' USING (%s)', r.qual);
    END IF;
    IF r.with_check IS NOT NULL THEN
      v_stmt := v_stmt || FORMAT(' WITH CHECK (%s)', r.with_check);
    END IF;

    v_ddl := v_ddl || v_stmt;
    EXECUTE FORMAT('DROP POLICY %I ON public.remark_override_requests', r.policyname);
    RAISE NOTICE 'Temporarily dropped policy % to retype status.', r.policyname;
  END LOOP;

  ALTER TABLE public.remark_override_requests
    ALTER COLUMN status TYPE TEXT;

  FOREACH v_stmt IN ARRAY v_ddl LOOP
    EXECUTE v_stmt;
  END LOOP;

  RAISE NOTICE 'Restored % policy/policies.', COALESCE(array_length(v_ddl, 1), 0);
END
$retype$;

-- The default survives a type change, but it is restated so a reader of this
-- file can see the end state without going back to 2026-06-03.
ALTER TABLE public.remark_override_requests
  ALTER COLUMN status SET DEFAULT 'pending';

-- -----------------------------------------------------------------------------
-- 2. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_type   TEXT;
  v_maxlen INTEGER;
  v_check  TEXT;
BEGIN
  SELECT data_type, character_maximum_length
  INTO v_type, v_maxlen
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'remark_override_requests'
    AND column_name = 'status';

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Verification failed: remark_override_requests.status is missing.';
  END IF;

  -- The point is that no length limit remains, not that the type is spelled
  -- a particular way.
  IF v_maxlen IS NOT NULL THEN
    RAISE EXCEPTION
      'Verification failed: status still caps at % characters, so pending_faculty_review (22) cannot be stored.',
      v_maxlen;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_check
  FROM pg_constraint
  WHERE conname = 'remark_override_requests_status_check'
    AND conrelid = 'public.remark_override_requests'::regclass;

  IF v_check IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the status CHECK constraint is gone. Widening the column removed the only control over what may be stored.';
  END IF;

  -- The two that did not fit, named explicitly: if a future migration rewrites
  -- this constraint and drops one, this is where it should be caught.
  IF position('pending_faculty_review' IN v_check) = 0
     OR position('pending_registrar_review' IN v_check) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the CHECK no longer admits the waiting states the chain needs.';
  END IF;

  -- The policies were dropped and rebuilt to get the type change through, so
  -- prove the one that decides who may read a request came back. Losing it
  -- would leave the table readable only by whatever policies remain -- or, if
  -- none do, by nobody, which reads on screen as "no requests" rather than as
  -- an error. B-11 is the same failure wearing a different hat.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'remark_override_requests'
      AND policyname = 'remark_override_requests_authorized_select'
  ) THEN
    RAISE EXCEPTION 'Verification failed: the request SELECT policy was not restored after the type change.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.remark_override_requests'::regclass
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Verification failed: row level security is no longer enabled on remark_override_requests.';
  END IF;

  RAISE NOTICE 'A student can now raise a grade dispute. The late route is reachable too.';
END
$verify$;

COMMIT;
