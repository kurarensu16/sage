-- Phase 7 — AI Study Tutor: tables
-- =============================================================================
-- 2026-10-30. Build order item #1 from
-- docs/03-development/audits/AI_STUDY_TUTOR_WORKFLOW_PLAN_2026-10-26.md,
-- with the hardening decisions the owner made on 2026-10-30.
--
-- THE PRIVACY BOUNDARY IS THE POINT OF THIS FILE
-- The tutor and the evaluation/advising system are two separate data worlds
-- that share one page. Enforced here, in both directions:
--
--   * Faculty, Dean and admin have NO visibility into tutor data. The four
--     student_tutor_* tables are owner-only. There is deliberately no dean or
--     admin read policy -- not now, and not as a "later" option. The
--     verification block at the end asserts this, so a later migration that
--     adds one fails loudly instead of quietly undoing the decision.
--   * The tutor reads no evaluation data. Nothing here references
--     student_risk_evaluations or any faculty-authored advising plan.
--
-- OWNER'S DECISIONS RECORDED HERE
--   * Resources attach to the ACTIVITY, not to a global topic table. Faculty
--     already enter the topic tag on the activity form, so the material is in
--     hand at that moment; a separate page asks them to recall it weeks later,
--     which is how that page ends up empty. It also scopes better -- two
--     sections of one subject may use different materials.
--   * Links now, uploads after R2. `kind` allows 'file' but nothing writes it
--     yet. Faculty PDFs would grow faster than the grade evidence that needed
--     a retention sweep in Phase 6c, and unlike evidence a course resource has
--     no natural expiry, so that cleanup pattern would not save it.
--   * Practice answers are withheld until the student submits. That is why
--     student_tutor_practice_sets exists and why it has RLS enabled with NO
--     policy: the correct answers must live somewhere no student can read.
--   * subject_id, not subject_code. A text copy of a value that already has a
--     primary key goes stale the moment a code is corrected.
--
-- Rollover archiving is deliberately NOT in this file. It touches
-- perform_semester_transition, which is live registrar machinery, and a problem
-- there must not be able to block the tutor tables. It follows as its own
-- migration.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Faculty-curated resources, attached to the activity
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_resources (
  resource_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.class_activities(activity_id) ON DELETE CASCADE,
  label VARCHAR(150) NOT NULL,
  -- http/https only. Students click these, so a javascript: or data: URL would
  -- be a scripting hole dressed as a reading list. Refused at the column
  -- because the faculty form is not the only possible writer.
  url TEXT NOT NULL CHECK (url ~* '^https?://'),
  kind VARCHAR(10) NOT NULL DEFAULT 'link' CHECK (kind IN ('link', 'file')),
  -- One line from the instructor on what this covers. Human-written, costs no
  -- tokens, and lets the tutor say "read section 3, it covers 3NF" instead of
  -- handing over a bare link -- today, with no document reading at all. It is
  -- also the fallback when extraction later fails on a scanned PDF.
  note VARCHAR(300),
  -- Reserved for the model migration. Null until a provider that reads
  -- documents is chosen; filled once, at attach time, never per request --
  -- re-reading a 30-page PDF for every student question would cost tens of
  -- thousands of tokens each time.
  content_extract TEXT,
  extracted_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_resources_activity
  ON public.activity_resources (activity_id, sort_order);

ALTER TABLE public.activity_resources ENABLE ROW LEVEL SECURITY;

-- Readable by the instructor of the class and the students in it, resolved
-- through the activity so there is one definition of "this class" rather than a
-- copied class_record_id that could drift.
DROP POLICY IF EXISTS activity_resources_select ON public.activity_resources;
CREATE POLICY activity_resources_select ON public.activity_resources
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_activities a
      WHERE a.activity_id = activity_resources.activity_id
        AND (
          public.is_assigned_faculty(a.class_record_id)
          OR public.is_student_enrolled_in_class(auth.uid(), a.class_record_id)
        )
    )
  );

-- Only the assigned instructor curates. Written as three policies rather than
-- FOR ALL so the WITH CHECK on insert and update is explicit.
DROP POLICY IF EXISTS activity_resources_insert ON public.activity_resources;
CREATE POLICY activity_resources_insert ON public.activity_resources
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.class_activities a
      WHERE a.activity_id = activity_resources.activity_id
        AND public.is_assigned_faculty(a.class_record_id)
    )
  );

DROP POLICY IF EXISTS activity_resources_update ON public.activity_resources;
CREATE POLICY activity_resources_update ON public.activity_resources
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_activities a
      WHERE a.activity_id = activity_resources.activity_id
        AND public.is_assigned_faculty(a.class_record_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.class_activities a
      WHERE a.activity_id = activity_resources.activity_id
        AND public.is_assigned_faculty(a.class_record_id)
    )
  );

DROP POLICY IF EXISTS activity_resources_delete ON public.activity_resources;
CREATE POLICY activity_resources_delete ON public.activity_resources
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_activities a
      WHERE a.activity_id = activity_resources.activity_id
        AND public.is_assigned_faculty(a.class_record_id)
    )
  );

REVOKE ALL ON public.activity_resources FROM anon;

-- -----------------------------------------------------------------------------
-- 2. Study plans
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_tutor_plans (
  plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  -- NULL is the overall scope, across every subject. Left nullable rather than
  -- using a literal sentinel so a real subject can never collide with it.
  subject_id UUID REFERENCES public.subjects(subject_id) ON DELETE SET NULL,
  -- The term the plan belongs to. Carried so last term's plans can be archived
  -- at rollover, and so the cap below cannot be blocked by a stale row.
  term_id UUID REFERENCES public.academic_terms(term_id) ON DELETE SET NULL,
  topic VARCHAR(150),
  -- The tag the plan was built from. The until_next_assessment horizon has no
  -- calendar date: it ends when a NEW graded activity carrying this same tag
  -- gets a score. Without storing it, that event is undetectable.
  topic_tag VARCHAR(100),
  horizon VARCHAR(30) NOT NULL
    CHECK (horizon IN ('this_week', 'until_next_assessment')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(12) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'superseded', 'archived', 'deleted')),
  -- Set only for this_week (created_at + 7 days). until_next_assessment leaves
  -- it NULL on purpose -- no syllabus table knows when "next" is, so inventing
  -- a date would be worse than having none.
  deadline_at TIMESTAMPTZ,
  -- When the plan was first noticed to be possibly out of date. Stored rather
  -- than computed on read so the notification can fire on the TRANSITION only:
  -- faculty saving scores for a 40-student class must not produce 40 notices
  -- every time they re-save.
  stale_since TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The cap: one ACTIVE plan per scope key per term. A student with N subjects
-- can hold N + 1 at once -- one per subject, plus one overall. Enforced here
-- rather than in the edge function so a second tab, or a retry, cannot slip
-- past it.
--
-- COALESCE on both nullable columns because NULL never equals NULL in a unique
-- index: without it a student could stack unlimited overall plans.
DROP INDEX IF EXISTS idx_one_active_plan_per_scope;
CREATE UNIQUE INDEX idx_one_active_plan_per_scope
  ON public.student_tutor_plans (
    student_id,
    (COALESCE(subject_id::TEXT, '__overall__')),
    (COALESCE(term_id::TEXT, '__noterm__'))
  )
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_student_tutor_plans_student
  ON public.student_tutor_plans (student_id, status, created_at DESC);

-- Used by the staleness trigger, which runs on every score save.
CREATE INDEX IF NOT EXISTS idx_student_tutor_plans_fresh
  ON public.student_tutor_plans (student_id, subject_id)
  WHERE status = 'active' AND stale_since IS NULL;

ALTER TABLE public.student_tutor_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_tutor_plans_own ON public.student_tutor_plans;
CREATE POLICY student_tutor_plans_own ON public.student_tutor_plans
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- The student checks items off, marks a plan done, and may discard one. The
-- WITH CHECK stops a row being reassigned to somebody else on the way through.
DROP POLICY IF EXISTS student_tutor_plans_own_update ON public.student_tutor_plans;
CREATE POLICY student_tutor_plans_own_update ON public.student_tutor_plans
  FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Rows are created by invoke-study-tutor, which holds the service role and is
-- not subject to RLS. No INSERT policy, so a student cannot hand-write a plan;
-- no DELETE policy, so discarding is a status change and history is kept.
REVOKE INSERT, DELETE ON public.student_tutor_plans FROM authenticated;
REVOKE ALL ON public.student_tutor_plans FROM anon;

-- -----------------------------------------------------------------------------
-- 3. Generated practice sets -- server-side only
-- -----------------------------------------------------------------------------
-- This table exists because the owner chose to withhold answers until the
-- student submits. The correct answers therefore cannot live anywhere the
-- student can read: putting them on the attempts table would let a student
-- query their own rows and read every answer before answering.
--
-- RLS is ENABLED and there is deliberately NO POLICY. That denies every
-- authenticated account outright. Only invoke-study-tutor, through the service
-- role, ever sees it. An empty policy list is the security control here, not an
-- oversight -- the verification block asserts it stays that way.
CREATE TABLE IF NOT EXISTS public.student_tutor_practice_sets (
  set_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(subject_id) ON DELETE SET NULL,
  topic VARCHAR(150),
  -- The full set as generated, questions AND answers.
  questions JSONB NOT NULL,
  difficulty VARCHAR(20),
  -- 24 hours, single use: long enough to finish a sitting or come back later
  -- the same day, short enough that abandoned sets do not pile up.
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tutor_practice_sets_student
  ON public.student_tutor_practice_sets (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tutor_practice_sets_expiry
  ON public.student_tutor_practice_sets (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.student_tutor_practice_sets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_tutor_practice_sets FROM authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4. Practice attempts
-- -----------------------------------------------------------------------------
-- What makes practice adaptive rather than a canned set: the next run skips
-- what was already answered correctly and leans toward what was not.
CREATE TABLE IF NOT EXISTS public.student_tutor_practice_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  set_id UUID REFERENCES public.student_tutor_practice_sets(set_id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.subjects(subject_id) ON DELETE SET NULL,
  topic VARCHAR(150),
  question TEXT NOT NULL,
  chosen_answer TEXT,
  -- Written at submission, once revealing it is correct.
  correct_answer TEXT,
  is_correct BOOLEAN,
  difficulty VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tutor_attempts_student_topic
  ON public.student_tutor_practice_attempts (student_id, topic, created_at DESC);

ALTER TABLE public.student_tutor_practice_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_tutor_attempts_own ON public.student_tutor_practice_attempts;
CREATE POLICY student_tutor_attempts_own ON public.student_tutor_practice_attempts
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Written only by the function, at submission. A student-side insert would let
-- somebody declare their own answers correct, and an attempt is the evidence
-- the next question set is chosen from.
REVOKE INSERT, UPDATE, DELETE ON public.student_tutor_practice_attempts FROM authenticated;
REVOKE ALL ON public.student_tutor_practice_attempts FROM anon;

-- -----------------------------------------------------------------------------
-- 5. The log
-- -----------------------------------------------------------------------------
-- Every interaction, all four actions. explain and resources have no lifecycle
-- and nothing to score, so this is the only place they land; plan and practice
-- write here as well, which keeps it a complete history rather than a partial
-- one.
CREATE TABLE IF NOT EXISTS public.student_tutor_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(subject_id) ON DELETE SET NULL,
  topic VARCHAR(150),
  action VARCHAR(20) NOT NULL
    CHECK (action IN ('explain', 'plan', 'practice', 'resources')),
  shape VARCHAR(40),
  -- FALSE when the answer came from the database rather than the model: the
  -- resources action is a lookup, and a returned existing plan costs nothing.
  -- The daily cap counts only rows where this is TRUE, so a student is never
  -- charged for an answer no model produced.
  used_ai BOOLEAN NOT NULL DEFAULT TRUE,
  request JSONB,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_tutor_log_student
  ON public.student_tutor_log (student_id, created_at DESC);

-- Reads the daily cap in one index hit.
CREATE INDEX IF NOT EXISTS idx_student_tutor_log_daily_cap
  ON public.student_tutor_log (student_id, created_at)
  WHERE used_ai;

ALTER TABLE public.student_tutor_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_tutor_log_own ON public.student_tutor_log;
CREATE POLICY student_tutor_log_own ON public.student_tutor_log
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.student_tutor_log FROM authenticated;
REVOKE ALL ON public.student_tutor_log FROM anon;

-- -----------------------------------------------------------------------------
-- 6. Staleness
-- -----------------------------------------------------------------------------
-- A plan is built from one snapshot of performance. New scores, or a new
-- activity, can make it out of date.
--
-- SAFETY FIRST: these triggers fire when FACULTY SAVE SCORES. If one ever
-- raised, grade entry would stop. Every body below is wrapped so that a problem
-- flagging a plan can never block a grade. A missed banner is a small loss; a
-- blocked grade save is not.
--
-- Flagged, never archived: a stale plan is still worth finishing. "Stale" means
-- "check this", not "discard it".
CREATE OR REPLACE FUNCTION public.aspire_mark_tutor_plans_stale(
  p_student_id UUID,
  p_subject_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan_ids UUID[];
  v_plan_id UUID;
BEGIN
  -- The flagging and the telling are kept apart on purpose. Looping directly
  -- over an UPDATE ... RETURNING while opening a subtransaction per row is
  -- murky; collecting the ids first is plainly correct and costs nothing.
  --
  -- An overall-scope plan (subject_id IS NULL) reads across every subject, so
  -- new work anywhere can date it too.
  WITH flagged AS (
    UPDATE public.student_tutor_plans p
    SET stale_since = now(), updated_at = now()
    WHERE p.student_id = p_student_id
      AND p.status = 'active'
      AND p.stale_since IS NULL
      AND (p.subject_id = p_subject_id OR p.subject_id IS NULL)
    RETURNING p.plan_id
  )
  SELECT array_agg(plan_id) INTO v_plan_ids FROM flagged;

  FOREACH v_plan_id IN ARRAY COALESCE(v_plan_ids, ARRAY[]::UUID[])
  LOOP
    BEGIN
      INSERT INTO public.notifications (
        recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
      ) VALUES (
        p_student_id, 'system',
        'Your study plan may be out of date',
        '/student/academic-insights', 'info',
        'New scores or activities were recorded since this plan was made. Open it to check, or ask for a new one.',
        jsonb_build_object('plan_id', v_plan_id),
        -- One notice per plan, ever. The UPDATE above already fires only on the
        -- transition, and this is the belt to that braces.
        FORMAT('tutor-stale:%s', v_plan_id),
        FALSE
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- The flag is what the page reads; the notification is a courtesy. Never
      -- let the courtesy cost somebody their grade entry.
      NULL;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.aspire_mark_tutor_plans_stale(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- A score was recorded or changed.
CREATE OR REPLACE FUNCTION public.aspire_tutor_stale_on_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subject_id UUID;
BEGIN
  BEGIN
    SELECT c.subject_id INTO v_subject_id
    FROM public.class_activities a
    JOIN public.class_records c ON c.class_record_id = a.class_record_id
    WHERE a.activity_id = NEW.activity_id;

    IF v_subject_id IS NOT NULL THEN
      PERFORM public.aspire_mark_tutor_plans_stale(NEW.student_id, v_subject_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;   -- never block a score save
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tutor_stale_on_score ON public.student_activity_scores;
CREATE TRIGGER trg_tutor_stale_on_score
  AFTER INSERT OR UPDATE OF score ON public.student_activity_scores
  FOR EACH ROW EXECUTE FUNCTION public.aspire_tutor_stale_on_score();

-- A new activity appeared in a class.
CREATE OR REPLACE FUNCTION public.aspire_tutor_stale_on_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student RECORD;
BEGIN
  BEGIN
    FOR v_student IN
      SELECT e.student_id, c.subject_id
      FROM public.class_records c
      JOIN public.enrollments e
        ON e.section_id = c.section_id
       AND e.subject_id = c.subject_id
      WHERE c.class_record_id = NEW.class_record_id
        AND COALESCE(e.status::TEXT, 'active') = 'active'
    LOOP
      PERFORM public.aspire_mark_tutor_plans_stale(v_student.student_id, v_student.subject_id);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    NULL;   -- never block creating an activity
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tutor_stale_on_activity ON public.class_activities;
CREATE TRIGGER trg_tutor_stale_on_activity
  AFTER INSERT ON public.class_activities
  FOR EACH ROW EXECUTE FUNCTION public.aspire_tutor_stale_on_activity();

-- -----------------------------------------------------------------------------
-- 7. Verification
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_count INTEGER;
BEGIN
  IF to_regclass('public.activity_resources') IS NULL
     OR to_regclass('public.student_tutor_plans') IS NULL
     OR to_regclass('public.student_tutor_practice_sets') IS NULL
     OR to_regclass('public.student_tutor_practice_attempts') IS NULL
     OR to_regclass('public.student_tutor_log') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: one or more study tutor tables are missing.';
  END IF;

  -- RLS on all five. A table without it is readable by any signed-in account,
  -- which for the tutor tables is the entire concern.
  SELECT COUNT(*) INTO v_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('activity_resources', 'student_tutor_plans',
                      'student_tutor_practice_sets',
                      'student_tutor_practice_attempts', 'student_tutor_log')
    AND c.relrowsecurity;
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'Verification failed: row level security is not enabled on all five tables (% of 5).', v_count;
  END IF;

  -- The privacy decision, asserted rather than trusted. If a later migration
  -- adds a faculty or dean read path to a tutor table, this is what catches it.
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('student_tutor_plans', 'student_tutor_practice_attempts',
                      'student_tutor_log')
    AND COALESCE(qual, '') NOT LIKE '%auth.uid()%';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Verification failed: a tutor table has a policy that is not scoped to the owning student.';
  END IF;

  -- The answer-withholding control. Any policy at all on this table would hand
  -- correct answers to the student before they answer.
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'student_tutor_practice_sets';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Verification failed: student_tutor_practice_sets has a policy. It must have none, so only the service role can read generated answers.';
  END IF;

  -- The cap. Without COALESCE the overall scope (NULL) would never collide and
  -- a student could stack unlimited overall plans.
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'idx_one_active_plan_per_scope'
    AND indexdef LIKE '%COALESCE%'
    AND indexdef LIKE '%active%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Verification failed: the one-active-plan-per-scope cap is missing or not scoped correctly.';
  END IF;

  -- Students click these links, so the scheme is constrained at the column.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.activity_resources'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%https?%'
  ) THEN
    RAISE EXCEPTION 'Verification failed: activity_resources.url is not restricted to http/https.';
  END IF;

  -- Both staleness triggers present. Missing one means a plan silently never
  -- goes stale, which looks like nothing at all rather than like a fault.
  SELECT COUNT(*) INTO v_count
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname IN ('trg_tutor_stale_on_score', 'trg_tutor_stale_on_activity');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Verification failed: the staleness triggers are not both installed (% of 2).', v_count;
  END IF;

  RAISE NOTICE 'Phase 7 tables installed. Tutor data is owner-only, generated answers are server-only, and resources are curated per activity.';
END;
$verify$;

COMMIT;
