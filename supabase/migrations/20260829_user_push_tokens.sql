-- Migration: User Push Notification Tokens
-- Tracks device push notification tokens for Android (FCM) and iOS (APNs)

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(user_id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT CHECK (platform IN ('android', 'ios', 'web')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast token lookups by recipient
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id ON public.user_push_tokens(user_id);
