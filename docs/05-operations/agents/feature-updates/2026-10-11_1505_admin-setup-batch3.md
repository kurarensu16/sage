# Admin setup fixes, Batch 3: Grade Override, COG saves, Activity Logs, college deans

- **Date:** 2026-10-11 15:05 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** `supabase/migrations/20261011140000_admin_batch3_atomic_saves.sql` (to apply)

## Files changed
- `supabase/migrations/20261011140000_admin_batch3_atomic_saves.sql`
- `src/pages/admin/GradeOverride.jsx`
- `src/pages/admin/GradeComputationsList.jsx`
- `src/pages/admin/AuditLog.jsx`
- `src/pages/admin/ClassroomProvisioning.jsx`
- `src/pages/admin/DepartmentsList.jsx`
- `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`
- `docs/03-development/audits/ADMIN_SETUP_AUDIT_2026-10-11.md`

## What changed and why
These are admin setup audit findings H2, M3, M4, M5, and M10. The owner approved Batch 3 as a whole on 2026-10-11 and asked that all of its edits be applied without per-file prompts.

- **Grade Override (`GradeOverride.jsx`):**
  - H2:
    - The search lists **every** matching student, with ID number, college, and section, and the admin picks one. It used to open the first match, so a shared surname could override the wrong student.
    - Searching by ID number also works.
  - M4:
    - Only the **SG** can be overridden; MR and TFR are shown read-only.
    - The new grade is chosen from the **DYCI grade steps** (1.00 … 3.00, 5.00). Any decimal was accepted before.
    - The previous remark note is kept in the activity log.
- **Grading Formulas (`GradeComputationsList.jsx`, M3):**
  - Saving goes through `save_grade_template`, **one transaction**. Creating a template inserts the header and its components together. Editing updates all weights or none, so a template can no longer be left at a total other than 100%.
  - Delete first checks how many subjects use the template. It now says it **can't be deleted** while subjects use it; the old text claimed subjects would "fall back to default".
- **Activity Logs (`AuditLog.jsx`, M5):** all entries load in pages of 1,000, so search, filters, and the export cover every entry, not just the newest 1,000.
- **Classrooms (`ClassroomProvisioning.jsx`, M5):** the create and delete log entries passed their arguments in the wrong order (actor, action, and message were swapped). They now record the right action, the admin's name, and a readable message.
- **Colleges (`DepartmentsList.jsx`, M10):** the dean is saved through `assign_department_dean`, one transaction. The previous dean is unassigned, errors are shown, and **No Dean** unassigns the current dean.
- **L2 (programs seed-only) and L3 (inactive students stay on rosters):** decided with no code change. The reasons are in the audit.
- **Checklist:** section B10e, cases AS-41 to AS-49. **Audit:** statuses updated and §5.13 added.

## How to verify
- Run the migration, then QA cases AS-41 to AS-49.
- Checks run:
  - the migration parsed with a PostgreSQL parser, function bodies included
  - `npm run lint`: 0 errors
  - `npm run build`: succeeds
  - `npm run verify:grading`: passes
