-- =============================================================================
-- ASPIRE MULTI-CHANNEL NOTIFICATION DELIVERIES & PREFERENCES SCHEMA
-- Date: 2026-10-01
-- Reference: docs/update_plan/NOTIFICATION_DELIVERY_ARCHITECTURE.md §3.2, §3.3
-- =============================================================================

-- 1. Multi-channel delivery records (in_app, push, email)
CREATE TABLE IF NOT EXISTS notification_deliveries (
  delivery_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id      UUID NOT NULL REFERENCES notifications(notification_id) ON DELETE CASCADE,
  channel              TEXT NOT NULL CHECK (channel IN ('in_app', 'push', 'email')),
  recipient_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  target_address       TEXT,
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts             INTEGER NOT NULL DEFAULT 0,
  max_attempts         INTEGER NOT NULL DEFAULT 3,
  last_attempt_at      TIMESTAMPTZ,
  sent_at              TIMESTAMPTZ,
  failed_at            TIMESTAMPTZ,
  error_message        TEXT,
  provider_message_id  TEXT,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index for active delivery queue draining
CREATE INDEX IF NOT EXISTS idx_deliveries_pending_channel
  ON notification_deliveries (channel, created_at ASC)
  WHERE status = 'pending';

-- Delivery audit trail index per recipient
CREATE INDEX IF NOT EXISTS idx_deliveries_recipient
  ON notification_deliveries (recipient_id, created_at DESC);

-- 2. User notification channel preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id            UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  notification_type  TEXT NOT NULL,
  in_app             BOOLEAN NOT NULL DEFAULT true,
  push               BOOLEAN NOT NULL DEFAULT true,
  email              BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_type)
);

-- 3. Automatic updated_at timestamp trigger
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deliveries_updated_at ON notification_deliveries;
CREATE TRIGGER trg_deliveries_updated_at
  BEFORE UPDATE ON notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_preferences_updated_at ON notification_preferences;
CREATE TRIGGER trg_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_timestamp();
