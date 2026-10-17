-- Phase 0.3 — Re-enable RLS on the remaining live tables that were left open.
--
-- Each of these was explicitly disabled (20260531081149_disable_rls_for_now.sql,
-- 20260914120000_aspire_pipeline_v3_1.sql:98, 20260531084000_create_programs_table.sql:8)
-- and never re-enabled, so any authenticated client could read and write every row
-- directly through PostgREST regardless of what the UI allowed.
--
-- Policies are written against how the app actually reads these tables, verified call
-- site by call site, so no legitimate screen loses access. Note that students reach join
-- codes only through the SECURITY DEFINER request_class_join RPC
-- (src/lib/classRoomService.js:88) and never select the code table, so codes can be
-- restricted to the owning faculty without breaking the irregular-student join flow.

BEGIN;

-- ---------------------------------------------------------------------------
-- activity_logs — admin-only to read, append-only for everyone else
-- ---------------------------------------------------------------------------
-- Only an administrator may read the audit ledger. The faculty dashboard's "Recent
-- Activity Logs" panel was removed in the same change, since it was the one non-admin
-- reader. Inserts stay open to any signed-in user, because every portal appends its own
-- entries and a ledger that only admins could write to would record almost nothing.
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_logs_select_own_or_admin ON public.activity_logs;
DROP POLICY IF EXISTS activity_logs_select_admin ON public.activity_logs;
CREATE POLICY activity_logs_select_admin ON public.activity_logs
  FOR SELECT TO authenticated
  USING (public.is_active_admin());

DROP POLICY IF EXISTS activity_logs_insert_authenticated ON public.activity_logs;
CREATE POLICY activity_logs_insert_authenticated ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- No UPDATE or DELETE policy, and the grants are withdrawn: an audit entry must not be
-- editable or removable through the API by anyone, including an admin.
REVOKE UPDATE, DELETE ON public.activity_logs FROM authenticated;
REVOKE ALL ON public.activity_logs FROM anon;

-- ---------------------------------------------------------------------------
-- student_consultation_requests
-- ---------------------------------------------------------------------------
ALTER TABLE public.student_consultation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultation_select_participants ON public.student_consultation_requests;
CREATE POLICY consultation_select_participants ON public.student_consultation_requests
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR faculty_id = auth.uid()
    OR public.is_active_admin()
  );

-- A student may only file a request in their own name.
DROP POLICY IF EXISTS consultation_insert_own ON public.student_consultation_requests;
CREATE POLICY consultation_insert_own ON public.student_consultation_requests
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Faculty resolve and schedule; the student updates only to acknowledge the schedule
-- (Phase 3.1). The WITH CHECK keeps either party from reassigning a request to someone
-- else, since both identity columns must still point at a participant afterwards.
DROP POLICY IF EXISTS consultation_update_participants ON public.student_consultation_requests;
CREATE POLICY consultation_update_participants ON public.student_consultation_requests
  FOR UPDATE TO authenticated
  USING (
    student_id = auth.uid()
    OR faculty_id = auth.uid()
    OR public.is_active_admin()
  )
  WITH CHECK (
    student_id = auth.uid()
    OR faculty_id = auth.uid()
    OR public.is_active_admin()
  );

REVOKE DELETE ON public.student_consultation_requests FROM authenticated;
REVOKE ALL ON public.student_consultation_requests FROM anon;

-- ---------------------------------------------------------------------------
-- class_room_join_codes — issuing faculty and admin only
-- ---------------------------------------------------------------------------
ALTER TABLE public.class_room_join_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS join_codes_faculty_admin_select ON public.class_room_join_codes;
CREATE POLICY join_codes_faculty_admin_select ON public.class_room_join_codes
  FOR SELECT TO authenticated
  USING (public.is_assigned_faculty(class_record_id) OR public.is_active_admin());

DROP POLICY IF EXISTS join_codes_faculty_admin_insert ON public.class_room_join_codes;
CREATE POLICY join_codes_faculty_admin_insert ON public.class_room_join_codes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_assigned_faculty(class_record_id) OR public.is_active_admin());

DROP POLICY IF EXISTS join_codes_faculty_admin_update ON public.class_room_join_codes;
CREATE POLICY join_codes_faculty_admin_update ON public.class_room_join_codes
  FOR UPDATE TO authenticated
  USING (public.is_assigned_faculty(class_record_id) OR public.is_active_admin())
  WITH CHECK (public.is_assigned_faculty(class_record_id) OR public.is_active_admin());

REVOKE ALL ON public.class_room_join_codes FROM anon;

-- ---------------------------------------------------------------------------
-- class_join_requests
-- ---------------------------------------------------------------------------
ALTER TABLE public.class_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS join_requests_select_participants ON public.class_join_requests;
CREATE POLICY join_requests_select_participants ON public.class_join_requests
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_assigned_faculty(class_record_id)
    OR public.is_active_admin()
  );

-- Requests are normally created through request_class_join (SECURITY DEFINER, which
-- validates the code); this policy only covers a student acting in their own name.
DROP POLICY IF EXISTS join_requests_insert_own ON public.class_join_requests;
CREATE POLICY join_requests_insert_own ON public.class_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS join_requests_update_faculty_admin ON public.class_join_requests;
CREATE POLICY join_requests_update_faculty_admin ON public.class_join_requests
  FOR UPDATE TO authenticated
  USING (public.is_assigned_faculty(class_record_id) OR public.is_active_admin())
  WITH CHECK (public.is_assigned_faculty(class_record_id) OR public.is_active_admin());

REVOKE ALL ON public.class_join_requests FROM anon;

-- ---------------------------------------------------------------------------
-- departments / sections / programs — readable by every signed-in user, because
-- dropdowns in all four portals depend on them; writable only by an admin
-- ---------------------------------------------------------------------------
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_select_authenticated ON public.departments;
CREATE POLICY departments_select_authenticated ON public.departments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS departments_admin_write ON public.departments;
CREATE POLICY departments_admin_write ON public.departments
  FOR ALL TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS sections_select_authenticated ON public.sections;
CREATE POLICY sections_select_authenticated ON public.sections
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sections_admin_write ON public.sections;
CREATE POLICY sections_admin_write ON public.sections
  FOR ALL TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS programs_select_authenticated ON public.programs;
CREATE POLICY programs_select_authenticated ON public.programs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS programs_admin_write ON public.programs;
CREATE POLICY programs_admin_write ON public.programs
  FOR ALL TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

REVOKE ALL ON public.departments FROM anon;
REVOKE ALL ON public.sections FROM anon;
REVOKE ALL ON public.programs FROM anon;

COMMIT;
