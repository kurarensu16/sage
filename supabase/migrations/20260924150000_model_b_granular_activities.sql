-- Migration: 20260924150000_model_b_granular_activities.sql
-- Description: Add unique constraints and dynamic ordering columns for Model B granular activity model

-- 1. Add unique constraint to student_activity_scores to support upserts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'student_activity_scores_student_activity_key'
    ) THEN
        ALTER TABLE public.student_activity_scores 
          ADD CONSTRAINT student_activity_scores_student_activity_key UNIQUE (student_id, activity_id);
    END IF;
END $$;

-- 2. Add order_index and activity_type to class_activities
ALTER TABLE public.class_activities
  ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activity_type character varying DEFAULT 'formative';
