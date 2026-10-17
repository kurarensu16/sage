-- Phase 0.1 — Harden public.users: re-enable RLS and block role/status self-escalation.
--
-- Supersedes 20260531081149_disable_rls_for_now.sql, which disabled RLS on public.users
-- and was never re-enabled. Because users.role is the authorization gate for the whole
-- application (is_active_admin, is_assigned_faculty, is_authorized_dean_for_class), any
-- authenticated account could previously self-promote with a direct client call:
--   supabase.from('users').update({ role: 'admin' }).eq('user_id', <own uid>)
--
-- Scope note: SELECT stays as broad as it is today (any authenticated user can read any
-- user row). Faculty rosters (classRoomService.js) and notification fan-out
-- (notificationDispatcher.js) depend on reading other users' rows by role and section,
-- so narrowing reads requires roster-scoped policies and is deliberately left to a
-- separate change. This migration closes the write-side escalation hole only.

-- Wrapped in a transaction on purpose: if ENABLE ROW LEVEL SECURITY committed but the
-- policies below did not, every account would lose access to its own profile row and
-- nobody could sign in. All of it applies, or none of it does.
BEGIN;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_authenticated ON public.users;
CREATE POLICY users_select_authenticated ON public.users
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS users_update_self_or_admin ON public.users;
CREATE POLICY users_update_self_or_admin ON public.users
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_active_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_active_admin());

DROP POLICY IF EXISTS users_insert_admin ON public.users;
CREATE POLICY users_insert_admin ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());

-- No DELETE policy: accounts are retired by setting status = 'archived', never deleted
-- through the API. Account removal goes through the delete-admin-user edge function,
-- which uses the service-role key and bypasses RLS.
REVOKE DELETE ON public.users FROM authenticated;
REVOKE DELETE ON public.users FROM anon;

-- The UPDATE policy lets a user write their own row (contact number, photo,
-- must_change_password). This trigger is what stops that same path from being used to
-- change role or status.
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- auth.uid() IS NULL means the service-role key, a SECURITY DEFINER function, or the
  -- SQL editor, which are trusted. A logged-out client cannot reach this trigger at all,
  -- because the UPDATE policy above is granted to authenticated only.
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status)
     AND auth.uid() IS NOT NULL
     AND NOT public.is_active_admin() THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only an administrator may change a role or account status.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_role_escalation ON public.users;
CREATE TRIGGER trg_prevent_self_role_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_role_escalation();

COMMIT;
