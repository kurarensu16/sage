-- =============================================================================
-- Two ways a student lost their right to question a grade through no fault of
-- their own
-- =============================================================================
--
-- BUG 1 — A GRADE POSTED DURING THE GRACE PERIOD WAS BORN UNDISPUTABLE
--   aspire_dispute_deadline() counted from the rollover:
--
--     aspire_add_school_days(t.ended_at, t.dispute_grace_days)
--
--   But sg_grace_days exists precisely so an instructor CAN post a Semestral
--   Grade after the rollover -- 30 days by default. An SG posted on day 23 of
--   a 22-working-day window therefore appeared with its dispute window already
--   expired. Not "a late dispute": no dispute, ever.
--
--   It landed on the students of the latest-posting instructors, who are if
--   anything the ones more likely to have made an error.
--
--   Fixed by anchoring on whichever came later, the rollover or the posting.
--   In the ordinary case -- SG posted before the term ends -- ended_at is
--   later and nothing changes: every milestone still expires together, MR with
--   the longest window and SG with exactly 22 working days. The anchor only
--   moves for a grade that did not exist at rollover, and it can only ever
--   EXTEND a window, never shorten one.
--
-- BUG 2 — LATENESS WAS JUDGED WHEN THE DEAN ACTED, NOT WHEN THE STUDENT FILED
--   dean_review_grade_change_request computed:
--
--     v_late := NOT public.aspire_dispute_window_open(v_req.class_record_id);
--
--   at APPROVAL time. A student who filed on day 22 and whose Dean happened to
--   review on day 25 was treated as late -- penalised for someone else's
--   calendar.
--
--   The owner's rule, 2026-11-03: "they can request until the 22nd day, but
--   the chain will continue until the prof changes their grade. Only the
--   application of the student will be cut on the 23rd day."
--
--   submit_grade_change_request already refuses a late filing, so the deadline
--   was never the student's problem twice. Judging from requested_at is what
--   makes the chain finish once it has legitimately started.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The deadline follows the later of the two events.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aspire_dispute_deadline(p_class_record_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.aspire_add_school_days(
    GREATEST(
      t.ended_at,
      -- The latest milestone actually posted for this class. NULL while the
      -- term is open, which keeps the window open -- the same behaviour as
      -- before, because GREATEST ignores NULLs.
      (SELECT max(pg.posted_at) FROM public.posted_grades pg
        WHERE pg.class_record_id = c.class_record_id)
    ),
    t.dispute_grace_days
  )
  FROM public.class_records c
  LEFT JOIN public.academic_terms t
    ON t.term_id = c.term_id
    OR (c.term_id IS NULL AND t.school_year = c.school_year AND t.semester::TEXT = c.semester::TEXT)
  WHERE c.class_record_id = p_class_record_id
  ORDER BY (t.term_id = c.term_id) DESC NULLS LAST
  LIMIT 1;
$$;

-- -----------------------------------------------------------------------------
-- 2. A request filed in time finishes, however long the review takes.
--
--    Patched from the deployed definition rather than re-declared from this
--    repo's copy: 20261029040940 rewrites function bodies in place, so the
--    migration file is not necessarily what the database is running. The
--    assertions make a silent no-op impossible.
-- -----------------------------------------------------------------------------
DO $patch$
DECLARE
  v_def     TEXT;
  v_old     CONSTANT TEXT := 'v_late := NOT public.aspire_dispute_window_open(v_req.class_record_id);';
  -- requested_at is TIMESTAMP (no zone) while the deadline is TIMESTAMPTZ, so
  -- a bare comparison would silently interpret the filing time in whatever the
  -- session timezone happens to be. Supabase stores UTC; saying so explicitly
  -- means the answer cannot change with the caller's connection settings.
  v_new     CONSTANT TEXT := 'v_late := (v_req.requested_at AT TIME ZONE ''UTC'') > public.aspire_dispute_deadline(v_req.class_record_id);';
  v_hits    INTEGER;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dean_review_grade_change_request';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'dean_review_grade_change_request does not exist. Run 20261030104405 first.';
  END IF;

  IF position(v_new IN v_def) > 0 THEN
    RAISE NOTICE 'Lateness is already judged from the filing date; nothing to do.';
    RETURN;
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION
      'Expected the lateness test exactly once in dean_review_grade_change_request, found %. Re-read the deployed body before re-running.',
      v_hits;
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$patch$;

-- -----------------------------------------------------------------------------
-- 3. Verify against the catalog.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_deadline TEXT;
  v_review   TEXT;
BEGIN
  v_deadline := pg_get_functiondef('public.aspire_dispute_deadline(uuid)'::regprocedure);

  IF position('GREATEST' IN v_deadline) = 0 OR position('posted_at' IN v_deadline) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a grade posted during the SG grace period would still be undisputable.';
  END IF;

  -- The grace-days setting must still be what sizes the window.
  IF position('dispute_grace_days' IN v_deadline) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the window no longer reads dispute_grace_days.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_review
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dean_review_grade_change_request';

  IF position('v_req.requested_at AT TIME ZONE' IN v_review) = 0 THEN
    RAISE EXCEPTION 'Verification failed: lateness is still judged when the Dean acts, so a slow review would penalise the student.';
  END IF;

  -- The rest of the function must have survived the patch.
  IF position('remark_override_requests' IN v_review) = 0
     OR position('dean_note' IN v_review) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the review body did not survive the patch.';
  END IF;

  -- Filing late must still be refused at the door. If this ever stops being
  -- true, the deadline stops meaning anything at all.
  IF position('aspire_dispute_window_open' IN
       pg_get_functiondef('public.submit_grade_change_request(uuid,text,text,text[],text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Verification failed: a student could file a dispute after the window closed.';
  END IF;

  RAISE NOTICE 'A late-posted grade can be disputed, and a dispute filed in time now finishes however long the review takes.';
END
$verify$;

COMMIT;
