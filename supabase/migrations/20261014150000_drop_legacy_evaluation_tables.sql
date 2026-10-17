-- Phase 0.4 — Drop the legacy, UI-unreferenced tables that still had RLS disabled.
--
-- These were reachable over PostgREST by any authenticated client and had no policies.
-- Rather than write policies for tables nothing uses, they are removed. Confirmed before
-- writing this migration: zero references in src/ and scripts/, and the only mentions in
-- supabase/ are the original CREATE/DISABLE statements plus the audit-trigger DO block in
-- 20261007160000_system_wide_activity_audit.sql, which is guarded by TO_REGCLASS and
-- simply skips tables that no longer exist.
--
-- The data these held is synthetic, per the thesis's own Delimitation section.
--
-- RUN ORDER MATTERS: 20261011120000_restrict_destructive_deletes.sql references
-- public.evaluation_windows by regclass, so it must be applied before this migration.
-- Applying migrations in filename/timestamp order satisfies that.
--
-- Deliberately NOT dropped: public.student_component_scores, which is the live dynamic
-- grade-sheet table created in 20261007130000_dynamic_grade_sheet_v2.sql. Only the
-- unrelated legacy public.component_scores is removed below.

BEGIN;

-- Child tables first so the foreign keys between them resolve without CASCADE. No
-- CASCADE anywhere here on purpose: if an unexpected dependency exists, this should fail
-- loudly so it can be investigated rather than quietly dropping something still in use.
DROP TABLE IF EXISTS public.evaluation_comments;
DROP TABLE IF EXISTS public.evaluation_ratings;
DROP TABLE IF EXISTS public.evaluation_responses;
DROP TABLE IF EXISTS public.evaluation_windows;
DROP TABLE IF EXISTS public.evaluation_criteria;
DROP TABLE IF EXISTS public.evaluation_forms;

DROP TABLE IF EXISTS public.faculty_performance_insights;
DROP TABLE IF EXISTS public.unlock_requests;
DROP TABLE IF EXISTS public.class_faculty_log;

DROP TABLE IF EXISTS public.component_scores;
DROP TABLE IF EXISTS public.grade_components;

COMMIT;
