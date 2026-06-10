-- Migration Fallback / Rollback Script
-- Reverts all changes introduced by the Academic Terms, Semester Transition, and Attendance Tracking features.

DROP FUNCTION IF EXISTS perform_semester_transition(UUID, UUID);
DROP FUNCTION IF EXISTS get_class_attendance_roster(UUID);
DROP TABLE IF EXISTS attendance_records CASCADE;
DROP TABLE IF EXISTS student_term_details CASCADE;
DROP TABLE IF EXISTS academic_terms CASCADE;

ALTER TABLE posted_grades DROP COLUMN IF EXISTS is_late_submission;
ALTER TABLE class_records DROP COLUMN IF EXISTS term_id;
ALTER TABLE sections DROP COLUMN IF EXISTS term_id;

DROP TYPE IF EXISTS attendance_status;
DROP TYPE IF EXISTS semester_period;
