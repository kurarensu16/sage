-- =============================================================================
-- ASPIRE v3.1 PIPELINE SCHEMA EXTENSION
-- =============================================================================

-- 1. Student Risk Evaluations & Intervention Outcomes Table
CREATE TABLE IF NOT EXISTS public.student_risk_evaluations (
    evaluation_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_record_id    UUID NOT NULL REFERENCES public.class_records(class_record_id) ON DELETE CASCADE,
    student_id         UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    faculty_id         UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    term               VARCHAR(20) NOT NULL CHECK (term IN ('Prelim', 'Midterm', 'Semi-Final', 'Final')),
    
    -- Evaluation Intent Context
    evaluation_context VARCHAR(30) NOT NULL CHECK (evaluation_context IN ('passing_recovery', 'pl_retention')),
    
    -- Risk Classification at Time of Evaluation
    risk_level         VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'moderate', 'high', 'critical')),
    risk_score         NUMERIC(5,2) NOT NULL,
    risk_breakdown     JSONB NOT NULL DEFAULT '{}'::jsonb, 
    -- Structure: { gwaFactor, assessmentFactor, attendanceFactor, trajectoryFactor, rawFactors }
    
    -- Faculty Qualitative Assessment & Action Plan
    professor_notes    TEXT NOT NULL,
    advising_plan      JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Structure: [
    --   { task_id, description, target_term, due_date, completed, completed_at }
    -- ]
    
    -- Outcome Evaluation Snapshots
    baseline_snapshot  JSONB NOT NULL DEFAULT '{}'::jsonb,
    followup_snapshot  JSONB DEFAULT NULL,
    
    -- Collaboration & Status Flags
    refer_to_dean      BOOLEAN DEFAULT FALSE,
    requires_tutoring  BOOLEAN DEFAULT FALSE,
    status             VARCHAR(30) DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'acknowledged_by_student')),
    
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(class_record_id, student_id, term)
);

-- 2. Class Room Join Codes (For Irregular Student Enrollment)
CREATE TABLE IF NOT EXISTS public.class_room_join_codes (
    code_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_record_id UUID NOT NULL REFERENCES public.class_records(class_record_id) ON DELETE CASCADE,
    join_code       VARCHAR(10) UNIQUE NOT NULL, -- e.g. "CS3A-8X92"
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Class Join Requests (Irregular Verification Queue)
CREATE TABLE IF NOT EXISTS public.class_join_requests (
    request_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_record_id UUID NOT NULL REFERENCES public.class_records(class_record_id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    status          VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_record_id, student_id)
);

-- 4. Ensure class_activities has title & description columns
ALTER TABLE IF EXISTS public.class_activities 
ADD COLUMN IF NOT EXISTS title VARCHAR(150) NOT NULL DEFAULT 'Untitled Activity',
ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT 'General Subject Assessment';

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_risk_eval_student ON public.student_risk_evaluations(student_id);
CREATE INDEX IF NOT EXISTS idx_risk_eval_class ON public.student_risk_evaluations(class_record_id);
CREATE INDEX IF NOT EXISTS idx_risk_eval_dean_queue ON public.student_risk_evaluations(refer_to_dean) WHERE refer_to_dean = TRUE;
CREATE INDEX IF NOT EXISTS idx_join_code_lookup ON public.class_room_join_codes(join_code) WHERE is_active = TRUE;

-- 6. RLS Configuration (Consistent with project dev policy)
ALTER TABLE IF EXISTS public.student_risk_evaluations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.class_room_join_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.class_join_requests DISABLE ROW LEVEL SECURITY;

-- 7. Student Consultation Requests (Direct Faculty Consultations)
CREATE TABLE IF NOT EXISTS public.student_consultation_requests (
    consultation_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id         UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    faculty_id         UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    class_record_id    UUID REFERENCES public.class_records(class_record_id) ON DELETE CASCADE,
    concern_category   VARCHAR(50) NOT NULL,
    preferred_schedule VARCHAR(100) NOT NULL,
    message            TEXT NOT NULL,
    status             VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'completed', 'declined')),
    faculty_notes      TEXT,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consultation_student ON public.student_consultation_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_consultation_faculty ON public.student_consultation_requests(faculty_id);
CREATE INDEX IF NOT EXISTS idx_consultation_class ON public.student_consultation_requests(class_record_id);

ALTER TABLE IF EXISTS public.student_consultation_requests DISABLE ROW LEVEL SECURITY;

