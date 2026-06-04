-- Migration: Create remark_override_requests table
-- This stores faculty-submitted remark change requests for Dean review.

CREATE TABLE remark_override_requests (
  request_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_record_id   UUID REFERENCES class_records(class_record_id) ON DELETE CASCADE,
  student_id        UUID REFERENCES users(user_id) ON DELETE CASCADE,
  requested_by      UUID REFERENCES users(user_id),
  requested_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  subject_name      TEXT,
  section_name      VARCHAR(100),
  faculty_name      VARCHAR(200),
  computed_grade    DECIMAL(5,2),
  effective_grade   DECIMAL(5,2),
  current_remark    VARCHAR(30),
  requested_remark  VARCHAR(30),
  note              TEXT,
  status            VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  resolved_by       UUID REFERENCES users(user_id),
  resolved_at       TIMESTAMP,
  dean_note         TEXT
);

ALTER TABLE remark_override_requests DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.remark_override_requests TO authenticated, anon;
