-- =============================================================================
-- Stop a run of corrections becoming a run of emails
-- =============================================================================
-- Date: 2026-10-30
--
-- THE PROBLEM
-- While a consultation window is open, faculty may still correct a grade
-- directly -- that is the whole point of the window. Every correction re-posts
-- the milestone, and post_grade_milestone_v2 raises a 'grade_changed'
-- notification whose dedupe key ends in the official revision number. A new
-- revision means a new key, which means a new notification, which means a new
-- email.
--
-- So an instructor who fixes three scores for one student in one sitting sends
-- that student -- and their guardian -- three emails saying the same thing.
--
-- WHAT IS AND IS NOT SUPPRESSED
-- The in-app notification is NEVER suppressed. It is the record of what
-- happened, and per the delivery architecture's standing rule a channel may be
-- muted but the record may not. A student opening their inbox still sees every
-- correction in order.
--
-- Only the EMAIL for a REPEATED 'grade_changed' about the SAME class and the
-- same grading period, within a short window, is skipped. Scoping by class and
-- period matters: three corrections to one subject are one piece of news, but a
-- correction in two different subjects is two.
--
-- 'grade_posted' is deliberately never coalesced. A first posting is the email
-- that actually tells someone their grade exists.
--
-- WHY HERE AND NOT IN THE POSTING FUNCTION
-- post_grade_milestone_v2 is the most load-bearing function in the system and
-- has already been patched from its live definition twice. This is a property
-- of delivery, not of posting, and it belongs with the rest of the fan-out
-- logic -- where it also covers any future caller that raises the same
-- notification type without knowing this rule exists.
-- =============================================================================

BEGIN;

-- The coalescing lookup runs on every notification insert, so it needs to be
-- cheap. Without this it is a sequential scan over every delivery ever made.
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_recent_email
  ON public.notification_deliveries (recipient_id, channel, created_at DESC);

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
  v_recent_email BOOLEAN := FALSE;
  -- Long enough to cover one sitting at a gradebook, short enough that a
  -- correction made later the same day still reaches the student.
  v_coalesce_window CONSTANT INTERVAL := INTERVAL '15 minutes';
BEGIN
  -- in_app is always delivered immediately; this is the inbox row itself — never
  -- gated by notification_preferences, and never coalesced. There's no UI yet to
  -- opt out of the inbox itself (only per-channel push/email toggles are
  -- modeled), and per NOTIFICATION_DELIVERY_ARCHITECTURE.md §5's standing rule,
  -- a user may mute a channel but may not mute the record entirely.
  INSERT INTO public.notification_deliveries (
    notification_id, channel, recipient_id, status, attempts, sent_at
  ) VALUES (
    NEW.notification_id, 'in_app', NEW.recipient_id, 'sent', 1, CURRENT_TIMESTAMP
  );

  -- Email: scoped to grade_posted/grade_changed only, per the team decision.
  -- target_address is resolved NOW (queue time), not at send time, so a later
  -- email change on the account doesn't retroactively alter where this one sent.
  IF NEW.type IN ('grade_posted', 'grade_changed') THEN

    -- Has this person already been emailed about this same class and period in
    -- the last few minutes? Only repeats of a CHANGE are folded together; a
    -- first posting always sends.
    IF NEW.type = 'grade_changed' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.notification_deliveries d
        JOIN public.notifications n ON n.notification_id = d.notification_id
        WHERE d.recipient_id = NEW.recipient_id
          AND d.channel = 'email'
          AND d.created_at > CURRENT_TIMESTAMP - v_coalesce_window
          AND n.type = 'grade_changed'
          AND COALESCE(n.payload->>'class_record_id', '') = COALESCE(NEW.payload->>'class_record_id', '')
          AND COALESCE(n.payload->>'grade_period', '') = COALESCE(NEW.payload->>'grade_period', '')
      ) INTO v_recent_email;
    END IF;

    IF NOT v_recent_email THEN
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
      -- It IS gated by the coalescing above: a guardian receiving the same message three
      -- times in five minutes is the version of this problem that looks worst from outside
      -- the institution.
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
  END IF;

  RETURN NEW;
END;
$$;

-- The trigger itself is unchanged; re-asserted so this migration is complete on
-- its own rather than depending on an earlier one still being in place.
DROP TRIGGER IF EXISTS trg_fan_out_notification_deliveries ON public.notifications;
CREATE TRIGGER trg_fan_out_notification_deliveries
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.fan_out_notification_deliveries();

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.fan_out_notification_deliveries()'::regprocedure);

  -- The in-app record must still be written unconditionally. If a future edit
  -- ever moves that insert inside the email branch, every inbox silently stops
  -- recording grade changes -- and nobody would notice until someone went
  -- looking for a notification that was never written.
  IF position('''in_app''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the in-app delivery insert is missing.';
  END IF;

  IF position('v_coalesce_window' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: email coalescing was not installed.';
  END IF;

  -- A first posting must never be folded away.
  IF position('IF NEW.type = ''grade_changed'' THEN' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: coalescing is not restricted to grade_changed.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_fan_out_notification_deliveries'
      AND tgrelid = 'public.notifications'::regclass
  ) THEN
    RAISE EXCEPTION 'Verification failed: the fan-out trigger is not attached.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_notification_deliveries_recent_email'
  ) THEN
    RAISE EXCEPTION 'Verification failed: the coalescing lookup has no index.';
  END IF;

  RAISE NOTICE 'Repeat grade-change emails are now coalesced within 15 minutes. In-app records are unaffected.';
END
$verify$;
