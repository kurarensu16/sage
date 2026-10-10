# Follow-up requires reviewed tasks; student badge counts verified tasks

- **Date:** 2026-10-10
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** `20261010140000_followup_requires_task_review.sql` (**to apply**)

## Files changed
- `supabase/migrations/20261010140000_followup_requires_task_review.sql`
- `src/pages/faculty/EvaluatedStudents.jsx`
- `src/pages/student/FacultyAdvisingInbox.jsx`

## What changed and why
Task verification flow fix: a follow-up cannot be recorded while a student-reported task is unreviewed (it was frozen as "awaiting verification"); the student badge and progress bar count verified tasks, matching the faculty view and the Dean's results; legacy closed plans label such tasks "Not verified before the plan closed".

## How to verify
TV-01, TV-10, FU-15–17 in `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`.
