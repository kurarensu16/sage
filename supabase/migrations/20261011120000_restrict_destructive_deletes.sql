-- Admin setup audit C2: deleting a section, subject, or term must never erase grades.
--
-- Before: these foreign keys were ON DELETE CASCADE, so one click on Delete in
-- Sections or Subjects removed every class of that section/subject together with its
-- scores, posted grades, attendance, and evaluations. Once term_id is saved (Batch 2B),
-- deleting a term would also have removed all of that term's classes.
--
-- After: the same foreign keys are ON DELETE RESTRICT. The database refuses the delete
-- while anything still uses the row; the admin pages check first and explain why.
-- No rows are changed by this migration. Only the delete rule of each key changes.
--
-- Changed (only where the rule is currently CASCADE):
--   class_records.section_id / subject_id / term_id
--   enrollments.section_id / subject_id
--   evaluation_windows.section_id
--   attendance_records.term_id
--   student_term_details.term_id
-- Kept: users.section_id and student_term_details.section_id (SET NULL), and every
-- child of class_records (deleting an unused class still removes its join codes).

BEGIN;

DO $$
DECLARE
  r RECORD;
  v_def TEXT;
BEGIN
  FOR r IN
    SELECT con.conname,
           con.conrelid::regclass AS child_table,
           pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    WHERE con.contype = 'f'
      AND con.confdeltype = 'c'
      AND (
        (con.conrelid = 'public.class_records'::regclass
          AND con.confrelid IN ('public.sections'::regclass, 'public.subjects'::regclass, 'public.academic_terms'::regclass))
        OR (con.conrelid = 'public.enrollments'::regclass
          AND con.confrelid IN ('public.sections'::regclass, 'public.subjects'::regclass))
        OR (con.conrelid = 'public.evaluation_windows'::regclass
          AND con.confrelid = 'public.sections'::regclass)
        OR (con.conrelid = 'public.attendance_records'::regclass
          AND con.confrelid = 'public.academic_terms'::regclass)
        OR (con.conrelid = 'public.student_term_details'::regclass
          AND con.confrelid = 'public.academic_terms'::regclass)
      )
  LOOP
    v_def := replace(r.def, 'ON DELETE CASCADE', 'ON DELETE RESTRICT');
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.child_table, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.child_table, r.conname, v_def);
    RAISE NOTICE 'Restricted %.%: %', r.child_table, r.conname, v_def;
  END LOOP;
END;
$$;

COMMIT;

-- Verify (read-only): every row should show r (RESTRICT).
-- SELECT con.conrelid::regclass AS child, con.confrelid::regclass AS parent,
--        con.conname, con.confdeltype
-- FROM pg_constraint con
-- WHERE con.contype = 'f'
--   AND con.conrelid IN ('public.class_records'::regclass, 'public.enrollments'::regclass,
--                        'public.evaluation_windows'::regclass, 'public.attendance_records'::regclass,
--                        'public.student_term_details'::regclass)
--   AND con.confrelid IN ('public.sections'::regclass, 'public.subjects'::regclass,
--                         'public.academic_terms'::regclass)
-- ORDER BY 1, 2;
