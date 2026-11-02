# Reset transactional data (keep users and academic structure)

**Purpose:** clear mock transactional data before testing the post-defense
phases, while keeping accounts and the academic catalog so classes can be
provisioned immediately.
**Run by:** the developer, in the Supabase SQL editor.
**Destructive and irreversible.** There is no undo. Confirm you are pointed at
the intended project before running.

## What is kept vs cleared

| Kept | Cleared |
|---|---|
| `users`, `notification_preferences` | `class_records`, `enrollments`, `student_term_details` |
| `departments`, `programs`, `sections` | `class_activities`, `class_grading_columns`, all `student_*_scores` |
| `subjects` | `posted_grades`, `posted_grade_revisions`, `grade_correction_history` |
| `grade_computations`, `grade_computation_components` | `remark_override_requests`, operation-idempotency tables |
| `academic_terms` | `attendance_records`, risk/insight/evaluation/intervention tables |
| `system_settings` | `consultations`, `student_consultation_requests` |
| | `class_join_requests`, `class_room_join_codes`, `guardians` |
| | `activity_logs`, `notifications`, `notification_deliveries` |

Two consequences worth accepting deliberately:

- **You lose the Phase 3 regression evidence.** Proving "no already-posted grade
  changed" needs posted grades that predate the migration. After this reset that
  proof rests on `npm run verify:grading` instead, which compares the JS and SQL
  ladders across 2807 combinations.
- **Guardians are cleared**, so `GuardianInfoGate` will prompt affected students
  again. Remove `guardians` from the list below if you would rather keep them.

## Why TRUNCATE rather than DELETE

`DELETE` is the wrong tool here:

- `grade_correction_history` has `ON DELETE RESTRICT` on five foreign keys, so
  deleting `posted_grades` or `class_records` first simply errors.
- Several grading integrity triggers fire on row deletes.

`TRUNCATE ... CASCADE` avoids both: it resolves the FK ordering itself and fires
only `TRUNCATE` triggers, which none of the grading guards use. `CASCADE` cannot
reach the kept catalog, because no kept table references a cleared one — the
dependencies all point the other way (`users.section_id → sections`,
`subjects.computation_id → grade_computations`, `sections.term_id → academic_terms`,
all within the kept set).

## Script

Skips any table that does not exist, so it is safe to run against a database
where a later phase's tables have not been created yet.

```sql
BEGIN;

DO $reset$
DECLARE
  v_targets TEXT[] := ARRAY[
    -- grading and scores
    'grade_correction_history', 'posted_grade_revisions', 'posted_grades',
    'remark_override_requests', 'student_term_scores', 'student_component_scores',
    'student_activity_scores', 'class_activities', 'class_grading_columns',
    -- idempotency / audit of grading operations
    'grade_posting_operations', 'sg_correction_operations',
    'admin_grade_override_operations', 'grade_audit_events',
    -- enrolment and classes
    'enrollments', 'class_join_requests', 'class_room_join_codes',
    'student_term_details', 'class_records',
    -- attendance
    'attendance_records',
    -- advising, risk, evaluation
    'student_risk_private_notes', 'student_risk_evaluations',
    'student_academic_insights', 'student_evaluation_referral_requests',
    'student_evaluation_referrals', 'faculty_intervention_working_drafts',
    'faculty_intervention_drafts',
    -- consultations (old and current)
    'student_consultation_requests', 'consultations',
    -- guardians (drop this line to keep them)
    'guardians',
    -- notifications and audit
    'notification_deliveries', 'notifications', 'activity_logs'
  ];
  v_existing TEXT[] := '{}';
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY v_targets LOOP
    IF to_regclass('public.' || quote_ident(v_table)) IS NOT NULL THEN
      v_existing := v_existing || ('public.' || quote_ident(v_table));
    ELSE
      RAISE NOTICE 'Skipping %, it does not exist.', v_table;
    END IF;
  END LOOP;

  IF array_length(v_existing, 1) IS NULL THEN
    RAISE EXCEPTION 'No target tables found. Check you are on the right database.';
  END IF;

  EXECUTE 'TRUNCATE TABLE ' || array_to_string(v_existing, ', ') || ' CASCADE';
  RAISE NOTICE 'Cleared % table(s).', array_length(v_existing, 1);
END
$reset$;

COMMIT;
```

## After running

Confirm the catalog survived and the transactional side is empty:

```sql
select 'users' t, count(*) from users
union all select 'departments', count(*) from departments
union all select 'programs', count(*) from programs
union all select 'sections', count(*) from sections
union all select 'subjects', count(*) from subjects
union all select 'grade_computations', count(*) from grade_computations
union all select 'academic_terms', count(*) from academic_terms
union all select 'class_records', count(*) from class_records
union all select 'enrollments', count(*) from enrollments
union all select 'posted_grades', count(*) from posted_grades
order by 1;
```

The first seven must be non-zero; the last three must be `0`.

Then re-check the students-without-home-section count, because `users` was kept
while `sections` was also kept — so existing links should be intact:

```sql
select count(*) from users
where role = 'student' and status = 'active' and section_id is null;
```

If that number jumped, something in the kept set was cleared unintentionally.

## Where this fits in the test run

1. Capture nothing — the baseline step is moot after a reset.
2. Run this script.
3. Apply the five migrations in order: `20261029034500`, `20261029040940`,
   `20261029044752`, `20261029052220`, `20261029054241`.
4. Create the registrar account (Admin → Manage Users), then edit and re-save it
   to confirm the role does not revert to `student`.
5. Work the checklists in `docs/04-testing/page-checklists/`, starting with
   `REG-TERM` — it is the highest-risk Phase 1 case.
6. Provision fresh classes to exercise Phase 3's threshold freeze.
7. Test maintenance mode (`ADM-MAINT`) **last**, since it deliberately blocks
   non-admins and would obstruct everything above.
