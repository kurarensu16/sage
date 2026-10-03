-- =============================================================================
-- Dedicated guardian-delivery columns on notification_deliveries.
-- Authored: 2026-10-03. Filename timestamped 20261002080000 (same day as, and
-- deliberately just before, 20261002090000_email_notification_delivery.sql)
-- so these columns exist before that migration's trigger references them —
-- neither migration has been applied to the remote project yet, so ordering
-- was free to fix at the filename level rather than the authoring date.
--
-- notification_deliveries is already applied to the remote project (see
-- 20261001160000), so these columns are added via ALTER TABLE in their own
-- migration rather than editing that file in place.
--
-- Design: recipient_id stays the STUDENT's user_id (it has an FK to `users`,
-- and a guardian is not a `users` row) — guardian_id identifies WHICH guardian
-- this particular delivery row is for, as a real foreign key rather than a
-- JSONB blob. A row with guardian_id IS NULL is the student's own copy; a row
-- with guardian_id NOT NULL is a guardian copy, and target_address holds that
-- guardian's email instead of the student's.
--
-- honors_pace is a per-event snapshot (was this student tracking within
-- President's List GWA range at the moment this specific grade was posted),
-- locked in at queue time for the same reason target_address already is:
-- so a later grade change elsewhere doesn't retroactively alter what an
-- already-queued notification said.
-- =============================================================================

BEGIN;

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS guardian_id UUID REFERENCES public.guardians(guardian_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS honors_pace BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_deliveries_guardian
  ON public.notification_deliveries (guardian_id)
  WHERE guardian_id IS NOT NULL;

COMMIT;
