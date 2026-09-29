-- =============================================================================
-- ASPIRE STUDENT RISK: CLIENT GRANT HARDENING
-- =============================================================================
-- Supabase legacy default grants included TRUNCATE, TRIGGER, and REFERENCES on
-- student_risk_evaluations. RLS does not protect TRUNCATE, so client roles keep
-- only the SELECT privilege needed by the role-specific RLS policies.

BEGIN;

REVOKE ALL ON public.student_risk_evaluations FROM anon, authenticated;
REVOKE ALL ON public.student_risk_private_notes FROM anon, authenticated;

GRANT SELECT ON public.student_risk_evaluations TO authenticated;
GRANT SELECT ON public.student_risk_private_notes TO authenticated;

COMMIT;
