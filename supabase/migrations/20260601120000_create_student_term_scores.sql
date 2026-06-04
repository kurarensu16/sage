-- Migration: Create student_term_scores table
CREATE TABLE student_term_scores (
  score_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_record_id UUID REFERENCES class_records(class_record_id) ON DELETE CASCADE,
  student_id     UUID REFERENCES users(user_id) ON DELETE CASCADE,
  term           VARCHAR(20) NOT NULL,
  act1           INT DEFAULT 0,
  act2           INT DEFAULT 0,
  act3           INT DEFAULT 0,
  act4           INT DEFAULT 0,
  act5           INT DEFAULT 0,
  act6           INT DEFAULT 0,
  char_rating    INT DEFAULT 0,
  exam           INT DEFAULT 0,
  saved_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  saved_by       UUID REFERENCES users(user_id),
  UNIQUE(class_record_id, student_id, term)
);

ALTER TABLE student_term_scores DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_term_scores TO authenticated, anon;
