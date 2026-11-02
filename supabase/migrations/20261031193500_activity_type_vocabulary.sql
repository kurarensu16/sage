-- =============================================================================
-- Give class_activities.activity_type a vocabulary, and a reason to exist
-- =============================================================================
--
-- WHAT WAS ALREADY THERE
--   20260924150000 added activity_type with a default of 'formative', and
--   nothing ever set it to anything else. The column has been carried on every
--   row since, always reading 'formative'.
--
--   It is not unused, though: generate-intervention-draft already selects it
--   alongside name, description, max_score and topic_tag, so the AI drafting a
--   faculty intervention has been handed the same constant for every activity a
--   student has ever taken. Giving it real values makes that context mean
--   something -- "failing the quizzes, passing the seatwork" is a different
--   intervention from "failing everything".
--
-- WHAT THIS IS NOT
--   activity_type is NOT a weight. The COG component an activity belongs to
--   decides what it is worth; this describes what it is. If the two are ever
--   conflated -- "quizzes are 30%" -- the result is a second grading formula
--   that silently disagrees with the frozen snapshot, and
--   post_grade_milestone_atomic compares that snapshot with a strict JSONB <>.
--
--   Nothing in gradingMath.js, the posting path, or any verifier reads this
--   column, and nothing should start.
--
-- 'formative' IS KEPT
--   Every existing row holds it. Dropping it from the vocabulary would make
--   this migration fail on its own data, and backfilling a guess onto activities
--   an instructor already created would be inventing a fact.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_unknown INT;
BEGIN
  SELECT count(*) INTO v_unknown
  FROM public.class_activities
  WHERE activity_type IS NOT NULL
    AND activity_type NOT IN (
      'formative', 'seatwork', 'quiz', 'performance_task',
      'recitation', 'assignment', 'project'
    );

  IF v_unknown > 0 THEN
    RAISE EXCEPTION
      'Aborting: % activity row(s) hold an activity_type outside the vocabulary. Inspect them before constraining the column.', v_unknown;
  END IF;
END $$;

ALTER TABLE public.class_activities
  DROP CONSTRAINT IF EXISTS class_activities_activity_type_check;

ALTER TABLE public.class_activities
  ADD CONSTRAINT class_activities_activity_type_check
  CHECK (activity_type IN (
    'formative', 'seatwork', 'quiz', 'performance_task',
    'recitation', 'assignment', 'project'
  ));

COMMENT ON COLUMN public.class_activities.activity_type IS
  'What kind of work this is: seatwork, quiz, performance_task, recitation, '
  'assignment or project. Descriptive only -- the activity''s COG component '
  'decides its weight, never this. ''formative'' is the legacy default carried '
  'by rows created before the field was offered in the UI.';

DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conname = 'class_activities_activity_type_check'
    AND conrelid = 'public.class_activities'::regclass;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the activity_type constraint was not created.';
  END IF;
  IF position('performance_task' IN v_def) = 0 OR position('formative' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the vocabulary is incomplete.';
  END IF;

  RAISE NOTICE 'activity_type now has a vocabulary. Existing rows keep ''formative''.';
END $$;

COMMIT;
