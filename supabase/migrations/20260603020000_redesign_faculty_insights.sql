-- 1. Drop the old table and enums if they exist
DROP TABLE IF EXISTS ai_faculty_predictions CASCADE;
DROP TYPE IF EXISTS ai_faculty_verdict CASCADE;

-- 2. Create the clean, AI-free custom ENUM
CREATE TYPE performance_verdict AS ENUM ('satisfactory', 'needs_improvement', 'excellent');

-- 3. Create the new faculty_performance_insights table
CREATE TABLE faculty_performance_insights (
    prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    school_year VARCHAR(15) NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    summary TEXT NOT NULL,
    verdict performance_verdict NOT NULL,
    strong_points TEXT,
    weak_points TEXT,
    basis_snapshot JSONB NOT NULL
);

-- 4. Disable RLS for now to match current database settings
ALTER TABLE faculty_performance_insights DISABLE ROW LEVEL SECURITY;
