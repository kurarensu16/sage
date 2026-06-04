-- 1. Drop the old table and enums if they exist
DROP TABLE IF EXISTS ai_student_recommendations CASCADE;
DROP TYPE IF EXISTS ai_student_verdict CASCADE;

-- 2. Create the clean, AI-free custom ENUM
CREATE TYPE academic_verdict AS ENUM ('continue', 'at_risk', 'recommend_shift');

-- 3. Create the new student_academic_insights table
CREATE TABLE student_academic_insights (
    insight_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    summary TEXT NOT NULL,
    verdict academic_verdict NOT NULL,
    basis_snapshot JSONB NOT NULL
);
