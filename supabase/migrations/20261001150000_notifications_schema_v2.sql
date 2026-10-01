-- =============================================================================
-- ASPIRE NOTIFICATIONS SCHEMA V2 & GUARDIANS TABLE SCAFFOLD
-- Date: 2026-10-01
-- Description: Adds structured columns and dedupe index to notifications table,
--              and scaffolds guardians table with RA 10173 data privacy consent fields.
-- =============================================================================

-- 1. Add structured columns to notifications table
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS title       TEXT,
  ADD COLUMN IF NOT EXISTS link        TEXT,
  ADD COLUMN IF NOT EXISTS severity    TEXT NOT NULL DEFAULT 'info'
               CHECK (severity IN ('info', 'warning', 'critical')),
  ADD COLUMN IF NOT EXISTS payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dedupe_key  TEXT,
  ADD COLUMN IF NOT EXISTS read_at     TIMESTAMPTZ;

-- 2. Idempotency index: prevents duplicate notifications on unlock -> relock
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe
  ON notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- 3. Query performance index for recipient unread inbox
CREATE INDEX IF NOT EXISTS notifications_recipient_unread
  ON notifications (recipient_id, created_at DESC)
  WHERE is_read = false;

-- 4. Guardians Table (Scaffold only — consent-gated per RA 10173)
CREATE TABLE IF NOT EXISTS guardians (
  guardian_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  full_name          TEXT NOT NULL,
  relationship       TEXT,
  email              TEXT,
  phone              TEXT,
  is_primary         BOOLEAN NOT NULL DEFAULT false,

  -- RA 10173 Compliance fields (Mandatory before sending notifications)
  consent_granted_at TIMESTAMPTZ,
  consent_source     TEXT,
  email_verified_at  TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one primary guardian per student
CREATE UNIQUE INDEX IF NOT EXISTS guardians_one_primary
  ON guardians (student_id)
  WHERE is_primary;
