-- Phase 3.1 (ASPIRE-C02) — Record a consultation's date, time and mode as real columns.
--
-- student_consultation_requests (20260914120000_aspire_pipeline_v3_1.sql:80-98) had no
-- date/time and no mode column at all. A student submitted a free-text
-- "Preferred Consultation Schedule", and anything the faculty actually decided — when,
-- online or face to face, the meeting link or the room — could only be typed into
-- faculty_notes as unstructured prose. Nothing was queryable or displayable as a schedule.
--
-- The faculty decision is final: there is no propose/counter-propose negotiation. Because
-- the student opened the request, they acknowledge the decision, which is what the two
-- schedule_acknowledged_* columns record.
--
-- meeting_link and onsite_location are both optional, and which one is meaningful follows
-- from consultation_mode.
--
-- Deliberately not enforced in the database: a CHECK requiring scheduled_at and
-- consultation_mode whenever status = 'scheduled'. Existing synthetic rows already sit in
-- 'scheduled' with neither value, so such a constraint would either fail to apply or block
-- faculty from editing those rows until they backfilled a date. The faculty form requires
-- both before it will save a 'scheduled' status.

BEGIN;

ALTER TABLE public.student_consultation_requests
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consultation_mode TEXT,
  ADD COLUMN IF NOT EXISTS meeting_link TEXT,
  ADD COLUMN IF NOT EXISTS onsite_location TEXT,
  ADD COLUMN IF NOT EXISTS schedule_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schedule_acknowledged_by UUID REFERENCES public.users(user_id);

-- Only the two modes the consultation asked for are accepted, and the check is added
-- separately because ADD COLUMN IF NOT EXISTS cannot carry one idempotently.
ALTER TABLE public.student_consultation_requests
  DROP CONSTRAINT IF EXISTS student_consultation_requests_mode_check;
ALTER TABLE public.student_consultation_requests
  ADD CONSTRAINT student_consultation_requests_mode_check
  CHECK (consultation_mode IS NULL OR consultation_mode IN ('online', 'face_to_face'));

CREATE INDEX IF NOT EXISTS idx_consultation_scheduled_at
  ON public.student_consultation_requests(scheduled_at)
  WHERE scheduled_at IS NOT NULL;

COMMIT;
