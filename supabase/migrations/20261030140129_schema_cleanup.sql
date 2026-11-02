-- Schema cleanup — remove dead tables and orphaned functions
-- =============================================================================
-- 2026-10-30. Owner took a full backup before this was applied.
--
-- Every object dropped here was verified unreachable three ways: no application
-- or edge-function reference, no Postgres function body reference, and no
-- incoming foreign key. The owner's live catalog queries supplied the second
-- and third; a sweep of src/ and supabase/functions/ supplied the first.
--
-- WHAT IS NOT HERE, DELIBERATELY
-- student_term_scores keeps its act1..act6 repeating group. It is a genuine 1NF
-- violation and the reason the system caps a term at six activities, but it is
-- live in six call sites and four functions, and restructuring grade storage
-- days before a defense is not a cleanup. Recorded instead in
-- docs/03-development/audits/SCHEMA_NORMALIZATION_AUDIT_2026-10-30.md.
--
-- A NOTE ON WHY SO FEW OBJECTS ARE DROPPED
-- The first pass looked like a dozen candidates. Six of them --
-- post_grade_milestone_v3, post_grade_milestone_atomic,
-- apply_approved_sg_correction_v2, apply_admin_grade_override and its v3, and
-- apply_approved_milestone_correction -- are called from the application
-- through variables rather than string literals, so a naive grep for
-- .rpc('name') missed them entirely. Dropping post_grade_milestone_v3 would
-- have broken grade posting. Everything below was checked by name against the
-- code, not inferred from a pattern.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The retired class join code
-- -----------------------------------------------------------------------------
-- Retired 2026-10-30. Registrar and Dean now place students on a class roster
-- directly (Faculty Loading & Provisioning, and Add Irregular Student to
-- Class), which covers every case the join code existed for. The student and
-- faculty screens were removed in the same change, so these functions have no
-- callers left anywhere.
DROP FUNCTION IF EXISTS public.request_class_join(TEXT);
DROP FUNCTION IF EXISTS public.dismiss_class_join_request(UUID);
DROP FUNCTION IF EXISTS public.resolve_class_join_request(UUID, TEXT);

DROP TABLE IF EXISTS public.class_join_requests;
DROP TABLE IF EXISTS public.class_room_join_codes;

-- -----------------------------------------------------------------------------
-- 2. Superseded score storage
-- -----------------------------------------------------------------------------
-- Created by 20261007130000_dynamic_grade_sheet_v2.sql and never used since.
-- Its only mentions anywhere are its own CREATE TABLE, constraints and indexes.
-- student_activity_scores(student_id, activity_id, score) is the form the
-- system actually writes.
DROP TABLE IF EXISTS public.student_component_scores;

-- -----------------------------------------------------------------------------
-- 3. Orphaned functions
-- -----------------------------------------------------------------------------
-- Superseded by registrar_set_student_records (singular), which is live. The
-- bulk variant was granted to authenticated but never called from anywhere.
DROP FUNCTION IF EXISTS public.registrar_bulk_set_student_records(JSONB);

-- Defined by 20261022120000_grade_posting_p0_foundation.sql, then REVOKEd from
-- PUBLIC, anon and authenticated and never granted to anyone. Nothing could
-- call it even if something wanted to.
DROP FUNCTION IF EXISTS public.aspire_assert_sg_basis_mutable(UUID, UUID);

-- -----------------------------------------------------------------------------
-- 4. A table the code expects but the database never had
-- -----------------------------------------------------------------------------
-- The reverse of a dead table. AuthContext.jsx upserts here whenever a device
-- registers for push notifications, but the table does not exist: its migration
-- is named 20260829_user_push_tokens.sql -- the only one in the project whose
-- filename omits the time component -- which is almost certainly why it was
-- never applied in order. The write sits inside a try/catch and only runs on
-- the APK, so it has been failing silently and push tokens have been discarded.
--
-- Created here rather than by renaming that file, so this is fixed by applying
-- one migration in the normal order rather than by re-running an old one.
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(user_id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT CHECK (platform IN ('android', 'ios', 'web')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id
  ON public.user_push_tokens (user_id);

-- The original migration had no row level security, which would leave every
-- device token in the system readable by any signed-in account. A push token is
-- a routing address for a person's phone.
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_push_tokens_own ON public.user_push_tokens;
CREATE POLICY user_push_tokens_own ON public.user_push_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_push_tokens_own_write ON public.user_push_tokens;
CREATE POLICY user_push_tokens_own_write ON public.user_push_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- A device re-registers with the same token and a new timestamp, so the upsert
-- needs UPDATE as well as INSERT.
DROP POLICY IF EXISTS user_push_tokens_own_update ON public.user_push_tokens;
CREATE POLICY user_push_tokens_own_update ON public.user_push_tokens
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- A person may unregister a device.
DROP POLICY IF EXISTS user_push_tokens_own_delete ON public.user_push_tokens;
CREATE POLICY user_push_tokens_own_delete ON public.user_push_tokens
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.user_push_tokens FROM anon;

-- -----------------------------------------------------------------------------
-- 5. Verification
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_name TEXT;
BEGIN
  -- Gone.
  FOREACH v_name IN ARRAY ARRAY[
    'class_join_requests', 'class_room_join_codes', 'student_component_scores'
  ] LOOP
    IF to_regclass('public.' || v_name) IS NOT NULL THEN
      RAISE EXCEPTION 'Verification failed: % was not dropped.', v_name;
    END IF;
  END LOOP;

  IF to_regprocedure('public.request_class_join(text)') IS NOT NULL
     OR to_regprocedure('public.registrar_bulk_set_student_records(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Verification failed: an orphaned function survived.';
  END IF;

  -- Present, and protected.
  IF to_regclass('public.user_push_tokens') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: user_push_tokens was not created.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'user_push_tokens' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Verification failed: user_push_tokens has no row level security. Device tokens would be readable by any signed-in account.';
  END IF;

  -- Still here. These looked like orphans in a first pass and are not: they are
  -- called from the application through variables rather than string literals.
  -- If this ever fails, grade posting has been broken by a cleanup.
  -- Looked up by name in pg_proc rather than with to_regproc(): that function
  -- RAISES on an ambiguous name instead of returning null, so an overload would
  -- fail this migration for entirely the wrong reason. It also means the exact
  -- argument list does not have to be guessed.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('post_grade_milestone_v3', 'apply_approved_sg_correction_v2')
    HAVING count(DISTINCT p.proname) = 2
  ) THEN
    RAISE EXCEPTION 'Verification failed: a live grade-posting function is missing. A cleanup has removed something it should not have.';
  END IF;

  RAISE NOTICE 'Schema cleanup complete. 3 tables and 2 functions dropped; user_push_tokens created with owner-only access.';
END;
$verify$;

COMMIT;
