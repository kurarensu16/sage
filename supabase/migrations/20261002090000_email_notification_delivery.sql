-- =============================================================================
-- Email notification delivery: fan-out trigger, email queue, and SMTP drain.
-- Scope (per team decision, 2026-10-02): only `grade_posted` and `grade_changed`
-- send email for now. Every other notification type stays in-app only, per the
-- routing matrix in docs/update_plan/NOTIFICATION_DELIVERY_ARCHITECTURE.md §5.
--
-- NOTE: this migration targets the notification_deliveries schema actually
-- deployed in 20261001160000_notification_deliveries_and_preferences.sql
-- (target_address, status IN ('pending','processing','sent','failed','cancelled'),
-- attempts/max_attempts, last_attempt_at/sent_at/failed_at/error_message) rather
-- than the earlier design draft in NOTIFICATION_DELIVERY_ARCHITECTURE.md, which
-- used different column names (destination, next_attempt_at, template_key,
-- status 'sending') that were never actually built.
-- =============================================================================

BEGIN;

-- Best-effort: on a Supabase-hosted project these are usually pre-authorized for
-- the migration role. If this fails, enable pg_cron and pg_net from the Dashboard
-- (Database -> Extensions) and re-run the rest of this file.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── 1. Fan-out trigger ──────────────────────────────────────────────────────
-- Single place that decides which delivery rows a notification gets. Replaces
-- the inline in_app insert that used to live inside dispatch_notifications()
-- (redefined below) — consolidating this into a trigger means ANY future
-- insert path into `notifications`, not just dispatch_notifications(), fans
-- out correctly. No ON CONFLICT / unique constraint needed here: this trigger
-- fires exactly once per row insert, and dispatch_notifications() already
-- guarantees a row only gets inserted once per dedupe_key (ON CONFLICT ...
-- DO NOTHING on the notifications table itself, upstream of this trigger) —
-- so a duplicate delivery row for the same notification is not reachable.
CREATE OR REPLACE FUNCTION public.fan_out_notification_deliveries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email TEXT;
  v_email_enabled BOOLEAN;
  v_guardian_id UUID;
  v_guardian_email TEXT;
  v_honors_pace BOOLEAN;
BEGIN
  -- in_app is always delivered immediately; this is the inbox row itself — never
  -- gated by notification_preferences. There's no UI yet to opt out of the inbox
  -- itself (only per-channel push/email toggles are modeled), and per
  -- NOTIFICATION_DELIVERY_ARCHITECTURE.md §5's standing rule, a user may mute a
  -- channel but may not mute the record entirely.
  INSERT INTO public.notification_deliveries (
    notification_id, channel, recipient_id, status, attempts, sent_at
  ) VALUES (
    NEW.notification_id, 'in_app', NEW.recipient_id, 'sent', 1, CURRENT_TIMESTAMP
  );

  -- Email: scoped to grade_posted/grade_changed only, per the team decision above.
  -- target_address is resolved NOW (queue time), not at send time, so a later
  -- email change on the account doesn't retroactively alter where this one sent.
  IF NEW.type IN ('grade_posted', 'grade_changed') THEN
    -- Resolution order (matches §3.4's documented intent): exact (user_id, type) row
    -- -> no row at all -> default true. There's no wildcard '*' row support here
    -- since notification_preferences has no such convention in its real schema;
    -- add one if a preferences UI is ever built that needs it.
    SELECT email INTO v_email_enabled
    FROM public.notification_preferences
    WHERE user_id = NEW.recipient_id AND notification_type = NEW.type;

    IF v_email_enabled IS NULL THEN
      v_email_enabled := true; -- no preference row yet (no UI exists to create one) -> default on
    END IF;

    IF v_email_enabled THEN
      SELECT email INTO v_email FROM public.users WHERE user_id = NEW.recipient_id;

      IF v_email IS NOT NULL AND v_email <> '' THEN
        INSERT INTO public.notification_deliveries (
          notification_id, channel, recipient_id, status, target_address, attempts
        ) VALUES (
          NEW.notification_id, 'email', NEW.recipient_id, 'pending', v_email, 0
        );
      END IF;
    END IF;

    -- Guardian copy (product decision, 2026-10-03): required field, no consent checkbox,
    -- so this is NOT gated by notification_preferences — that table models a user's own
    -- channel opt-outs, not a guardian opt-out, and there is deliberately no such control.
    -- recipient_id stays the STUDENT's user_id (satisfies the FK on notification_deliveries;
    -- guardians are not `users` rows) — target_address is the guardian's own email, and the
    -- dedicated guardian_id column (20261002080000) tells the send-email function to use the
    -- formal guardian template instead of the student's privacy-safe one, and lets it join
    -- back to `guardians` for the current name/relationship at send time rather than this
    -- trigger snapshotting a copy of that identity data. Only the primary guardian is
    -- notified (one row per student, not fanned out to every contact on file).
    SELECT guardian_id, email
      INTO v_guardian_id, v_guardian_email
      FROM public.guardians
     WHERE student_id = NEW.recipient_id AND is_primary = true
     LIMIT 1;

    IF v_guardian_email IS NOT NULL AND v_guardian_email <> '' THEN
      -- Conservative honors-pace insight from this student's OTHER posted grades. This
      -- intentionally duplicates ONLY the transmutation ladder from
      -- src/lib/academicPolicy.js's TRANSMUTATION_LADDER (a short, stable lookup table) —
      -- not the full getHonorTier() policy (18-unit floor, §3.8.4 subject floor, INC
      -- exclusion), which this trigger has no practical way to share with the JS module
      -- across runtimes. The guardian-facing wording below is phrased as a conditional
      -- "may qualify" against the plain GWA threshold, never a confident tier claim, so
      -- this approximation can't overstate an eligibility this trigger can't fully verify.
      SELECT AVG(gwa) <= 1.75 INTO v_honors_pace
        FROM (
          SELECT DISTINCT ON (pg.class_record_id)
            CASE
              WHEN pg.effective_grade IS NOT NULL THEN pg.effective_grade
              WHEN pg.computed_grade >= 98 THEN 1.00
              WHEN pg.computed_grade >= 95 THEN 1.25
              WHEN pg.computed_grade >= 92 THEN 1.50
              WHEN pg.computed_grade >= 89 THEN 1.75
              WHEN pg.computed_grade >= 86 THEN 2.00
              WHEN pg.computed_grade >= 83 THEN 2.25
              WHEN pg.computed_grade >= 80 THEN 2.50
              WHEN pg.computed_grade >= 77 THEN 2.75
              WHEN pg.computed_grade >= 75 THEN 3.00
              ELSE 5.00
            END AS gwa
          FROM public.posted_grades pg
          WHERE pg.student_id = NEW.recipient_id
            AND (pg.effective_grade IS NOT NULL OR pg.computed_grade IS NOT NULL)
          ORDER BY pg.class_record_id, pg.posted_at DESC
        ) latest_per_class;

      INSERT INTO public.notification_deliveries (
        notification_id, channel, recipient_id, status, target_address, attempts,
        guardian_id, honors_pace
      ) VALUES (
        NEW.notification_id, 'email', NEW.recipient_id, 'pending', v_guardian_email, 0,
        v_guardian_id, COALESCE(v_honors_pace, false)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fan_out_notification_deliveries ON public.notifications;
CREATE TRIGGER trg_fan_out_notification_deliveries
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.fan_out_notification_deliveries();

-- ── 2. dispatch_notifications(): remove the now-redundant inline in_app insert ──
-- Identical to the version in 20261001170000_secure_notification_access.sql except
-- the manual notification_deliveries insert is gone — the trigger above handles
-- it (and now email too, which the old inline code never did at all).
CREATE OR REPLACE FUNCTION public.dispatch_notifications(p_notifications JSONB)
RETURNS SETOF public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT;
  v_item JSONB;
  v_recipient_id UUID;
  v_type TEXT;
  v_message TEXT;
  v_title TEXT;
  v_link TEXT;
  v_severity TEXT;
  v_payload JSONB;
  v_dedupe_key TEXT;
  v_notification public.notifications;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to dispatch notifications.';
  END IF;

  SELECT role::TEXT INTO v_actor_role
  FROM public.users
  WHERE user_id = v_actor_id;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'The authenticated user has no application role.';
  END IF;

  IF jsonb_typeof(p_notifications) <> 'array'
     OR jsonb_array_length(p_notifications) = 0
     OR jsonb_array_length(p_notifications) > 100 THEN
    RAISE EXCEPTION 'Notifications must be a non-empty array of at most 100 items.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_notifications)
  LOOP
    v_recipient_id := NULLIF(v_item->>'recipient_id', '')::UUID;
    v_type := lower(trim(COALESCE(v_item->>'type', 'system')));
    v_message := trim(COALESCE(v_item->>'message', ''));
    v_title := NULLIF(trim(COALESCE(v_item->>'title', '')), '');
    v_link := NULLIF(trim(COALESCE(v_item->>'link', '')), '');
    v_severity := lower(trim(COALESCE(v_item->>'severity', 'info')));
    v_payload := COALESCE(v_item->'payload', '{}'::JSONB);
    v_dedupe_key := NULLIF(trim(COALESCE(v_item->>'dedupe_key', '')), '');

    IF v_recipient_id IS NULL
       OR v_type !~ '^[a-z][a-z0-9_]{0,63}$'
       OR v_message = ''
       OR char_length(v_message) > 1000
       OR (v_title IS NOT NULL AND char_length(v_title) > 160)
       OR (v_link IS NOT NULL AND (left(v_link, 1) <> '/' OR char_length(v_link) > 255))
       OR v_severity NOT IN ('info', 'warning', 'critical')
       OR jsonb_typeof(v_payload) <> 'object'
       OR (v_dedupe_key IS NOT NULL AND char_length(v_dedupe_key) > 255) THEN
      RAISE EXCEPTION 'A notification contains invalid data.';
    END IF;

    IF NOT public.can_dispatch_notification(v_actor_id, v_actor_role, v_recipient_id, v_type) THEN
      RAISE EXCEPTION 'Not authorized to send notification type % to this recipient.', v_type;
    END IF;

    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      v_recipient_id, v_type, v_title, v_link, v_severity, v_message, v_payload, v_dedupe_key, FALSE
    )
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING * INTO v_notification;

    IF FOUND THEN
      RETURN NEXT v_notification;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_notifications(JSONB) TO authenticated;

-- ── 3. claim_email_deliveries(): atomic batch claim for the send-email worker ──
-- FOR UPDATE SKIP LOCKED so two overlapping cron runs never send the same email
-- twice. service_role only — never callable by an authenticated client. Backoff
-- is computed from attempts/last_attempt_at (there is no next_attempt_at column
-- on this table) — exponential: 1, 2, 4 minutes, capped by each row's own
-- max_attempts (default 3).
CREATE OR REPLACE FUNCTION public.claim_email_deliveries(batch_size INT DEFAULT 25)
RETURNS TABLE (
  delivery_id UUID,
  notification_id UUID,
  target_address TEXT,
  notification_type TEXT,
  payload JSONB,
  attempts INTEGER,
  max_attempts INTEGER,
  guardian_id UUID,
  guardian_name TEXT,
  guardian_relationship TEXT,
  honors_pace BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH claimed AS (
    SELECT d.delivery_id
    FROM public.notification_deliveries d
    WHERE d.channel = 'email'
      AND d.status IN ('pending', 'failed')
      AND d.attempts < d.max_attempts
      AND (
        d.last_attempt_at IS NULL
        OR d.last_attempt_at <= CURRENT_TIMESTAMP
             - (POWER(2::double precision, d.attempts::double precision) * INTERVAL '1 minute')
      )
    ORDER BY d.created_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_deliveries d
     SET status = 'processing',
         last_attempt_at = CURRENT_TIMESTAMP
    FROM claimed c
   WHERE d.delivery_id = c.delivery_id
  RETURNING
    d.delivery_id,
    d.notification_id,
    d.target_address,
    (SELECT n.type FROM public.notifications n WHERE n.notification_id = d.notification_id),
    (SELECT n.payload FROM public.notifications n WHERE n.notification_id = d.notification_id),
    d.attempts,
    d.max_attempts,
    d.guardian_id,
    -- Joined live at claim/send time (not snapshotted at queue time) so a guardian's
    -- corrected name/relationship is reflected even if it changed after the notification
    -- was queued — only the FK (guardian_id) needs to stay stable, not a copy of their data.
    (SELECT g.full_name FROM public.guardians g WHERE g.guardian_id = d.guardian_id),
    (SELECT g.relationship FROM public.guardians g WHERE g.guardian_id = d.guardian_id),
    d.honors_pace;
$$;

REVOKE ALL ON FUNCTION public.claim_email_deliveries(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_email_deliveries(INT) TO service_role;

-- ── 4. complete_email_delivery(): worker reports outcome back ──────────────
-- Centralizes the attempts/status/error bookkeeping so the Edge Function body
-- stays simple and can't accidentally write an inconsistent row.
CREATE OR REPLACE FUNCTION public.complete_email_delivery(
  p_delivery_id UUID,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL,
  p_provider_message_id TEXT DEFAULT NULL
)
RETURNS public.notification_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.notification_deliveries;
BEGIN
  IF p_success THEN
    UPDATE public.notification_deliveries
       SET status = 'sent',
           sent_at = CURRENT_TIMESTAMP,
           error_message = NULL,
           provider_message_id = p_provider_message_id
     WHERE delivery_id = p_delivery_id
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.notification_deliveries
       SET status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END,
           attempts = attempts + 1,
           failed_at = CASE WHEN attempts + 1 >= max_attempts THEN CURRENT_TIMESTAMP ELSE failed_at END,
           error_message = left(COALESCE(p_error_message, 'Unknown error'), 500)
     WHERE delivery_id = p_delivery_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_email_delivery(UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_email_delivery(UUID, BOOLEAN, TEXT, TEXT) TO service_role;

-- ── 5. Reaper: a delivery stuck in 'processing' for 10+ minutes means the
-- worker died mid-batch. Reset it so the next drain picks it back up. ──────
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'reap-stuck-emails';
SELECT cron.schedule(
  'reap-stuck-emails',
  '*/10 * * * *',
  $$
    UPDATE public.notification_deliveries
       SET status = 'pending'
     WHERE channel = 'email'
       AND status = 'processing'
       AND last_attempt_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes';
  $$
);

-- ── 6. Cron drain: calls the send-email Edge Function every minute. ─────────
-- IMPORTANT (manual step, not in this file): before this job can actually send
-- anything, run the following ONCE in the Supabase SQL editor (never commit the
-- real value to a migration file, since migrations are checked into git):
--
--   ALTER DATABASE postgres SET app.worker_secret = '<the same value you set as
--   the WORKER_SECRET Edge Function secret>';
--
-- Generate that value with: openssl rand -hex 32
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'drain-email-queue';
SELECT cron.schedule(
  'drain-email-queue',
  '* * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://ettnwknyhdhehoclrwwh.supabase.co/functions/v1/send-email',
      headers := jsonb_build_object(
                   'Content-Type',    'application/json',
                   'x-worker-secret', current_setting('app.worker_secret', true)
                 ),
      body    := '{}'::jsonb
    );
  $$
);

COMMIT;
