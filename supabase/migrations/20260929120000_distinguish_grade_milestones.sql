-- Give aggregate grade milestones durable, unambiguous identities.
-- Existing midterm/final rows are migrated using their locked milestone data.

BEGIN;

ALTER TABLE public.posted_grades
  ALTER COLUMN grade_period TYPE TEXT
  USING grade_period::TEXT;

UPDATE public.posted_grades
SET grade_period = 'midterm_rating'
WHERE grade_period IN ('midterm', 'mr');

UPDATE public.posted_grades
SET grade_period = CASE
  WHEN COALESCE(locked_milestones::TEXT, '') ILIKE '%Tentative Final Rating%'
   AND COALESCE(locked_milestones::TEXT, '') NOT ILIKE '%Semestral Grade%'
    THEN 'tentative_final_rating'
  ELSE 'semestral_grade'
END
WHERE grade_period IN ('final', 'tfr', 'sg');

ALTER TABLE public.posted_grades
  DROP CONSTRAINT IF EXISTS posted_grades_grade_period_check;

ALTER TABLE public.posted_grades
  ADD CONSTRAINT posted_grades_grade_period_check
  CHECK (grade_period IN (
    'prelim',
    'midterm',
    'semi_final',
    'final',
    'midterm_rating',
    'tentative_final_rating',
    'semestral_grade'
  ));

CREATE INDEX IF NOT EXISTS idx_posted_grades_class_period_student
  ON public.posted_grades(class_record_id, grade_period, student_id);

COMMIT;
