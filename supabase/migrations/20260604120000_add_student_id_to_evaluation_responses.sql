-- Migration: Add student_id to evaluation_responses and make anonymous_token optional
ALTER TABLE evaluation_responses ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE evaluation_responses ALTER COLUMN anonymous_token DROP NOT NULL;
