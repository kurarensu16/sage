-- =============================================================================
-- SAGE RELATIONAL SCHEMA MIGRATION: DYNAMIC GRADING SYSTEM
-- Date: 2026-08-19
-- Target Platform: Supabase / PostgreSQL
-- =============================================================================

BEGIN;

-- 1. Create class_activities table
-- Represents dynamic custom activities created by instructors under specific terms
CREATE TABLE IF NOT EXISTS public.class_activities (
    activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_record_id UUID NOT NULL REFERENCES public.class_records(class_record_id) ON DELETE CASCADE,
    term VARCHAR(20) NOT NULL CHECK (term IN ('Prelim', 'Midterm', 'Semi-Final', 'Final')),
    name VARCHAR(150) NOT NULL,
    max_score NUMERIC(6,2) NOT NULL DEFAULT 20.00 CHECK (max_score > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying activities per class record
CREATE INDEX IF NOT EXISTS idx_class_activities_class 
ON public.class_activities(class_record_id, term);


-- 2. Create student_activity_scores table
-- Stores individual grades for each dynamic activity
CREATE TABLE IF NOT EXISTS public.student_activity_scores (
    score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES public.class_activities(activity_id) ON DELETE CASCADE,
    score NUMERIC(6,2) NOT NULL DEFAULT 0.00 CHECK (score >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_student_activity UNIQUE (student_id, activity_id)
);

-- Index for querying individual student activity scores
CREATE INDEX IF NOT EXISTS idx_student_activity_scores_student
ON public.student_activity_scores(student_id);

CREATE INDEX IF NOT EXISTS idx_student_activity_scores_activity
ON public.student_activity_scores(activity_id);


-- 3. Add is_multiple column to grade_computation_components table
ALTER TABLE public.grade_computation_components 
ADD COLUMN IF NOT EXISTS is_multiple BOOLEAN DEFAULT FALSE;

-- 4. Add status column to enrollments table
ALTER TABLE public.enrollments 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'pending_verification', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_enrollments_status 
ON public.enrollments(status);


-- 3. Migration instructions for backend developers:
-- Once this schema is applied:
-- - The frontend state in ScoreInput.jsx and MyGradesDetail.jsx is prepared to read from these tables.
-- - For backward compatibility, the current student_term_scores table can continue storing term totals
--   (Prelim GWA, Midterm GWA, etc.) or be deprecated in favor of dynamically summing student_activity_scores
--   and applying the configured weights in grade_computations.

COMMIT;
