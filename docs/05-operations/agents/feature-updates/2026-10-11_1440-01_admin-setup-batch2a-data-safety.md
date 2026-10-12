# Admin setup fixes, Batch 2A: import validation and delete guards

- **Date:** 2026-10-11 14:40 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** `supabase/migrations/20261011120000_restrict_destructive_deletes.sql` (to apply)

## Files changed
- `src/pages/admin/UserList.jsx`
- `src/pages/admin/SectionList.jsx`
- `src/pages/admin/SubjectList.jsx`
- `src/pages/admin/ClassroomProvisioning.jsx`
- `supabase/migrations/20261011120000_restrict_destructive_deletes.sql`
- `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`
- `docs/03-development/audits/ADMIN_SETUP_AUDIT_2026-10-11.md`

## What changed and why
Admin setup audit findings H3, M2 (import), M7, and C2. The owner approved Batches 2A and 2B together.

- **`UserList.jsx`** (import, H3/M2; filters, M7):
  - Colleges and sections are matched to the database **by exact name and saved by ID**. The import no longer guesses a section for a student; it used to pick the first section in the college containing the year digit.
  - A student row needs a section that belongs to the row's college and to the **active term**. The year level comes from the section, and a contradicting year level is rejected.
  - Every rejected row shows its reason.
  - Valid roles: admin, dean, faculty, student. **Office was removed** from the import, the role tabs, and the role filter.
  - The phone's College and Program filters now use the database lists, like desktop.
- **`SectionList.jsx`, `SubjectList.jsx`** (C2): Delete first counts what uses the row. For a section: classes, enrollments, assigned students, and term history. For a subject: classes and enrollments. Delete is refused with those counts while anything uses it.
- **`ClassroomProvisioning.jsx`** (C2): a classroom is deleted only if it has no posted grades, scores, activities, attendance, or risk evaluations. The confirm text says "permanently delete" (it wrongly said "archive").
- **Migration:** the foreign keys that cascaded a delete into grades become **RESTRICT**:
  - classes/enrollments → sections/subjects
  - evaluation windows → sections
  - classes, attendance, and term history → terms

  The database now refuses such deletes even outside the admin pages. No rows change.
- **Checklist:** cases AS-15 to AS-25. **Audit:** statuses updated, plus §5.12.

## How to verify
Run the migration, then QA cases AS-15 to AS-25. `npm run lint`: 0 errors. `npm run build`: succeeds.
