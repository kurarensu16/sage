# Subjects: refuse duplicate codes and duplicate names in a college

- **Date:** 2026-10-11 15:32 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** `supabase/migrations/20261011150000_unique_subjects.sql` (to apply **after** the owner's subject cleanup)

## Files changed
- `supabase/migrations/20261011150000_unique_subjects.sql`
- `src/pages/admin/SubjectForm.jsx`
- `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`
- `docs/05-operations/database/TEST_YEAR_SEED_2026-2027.md`

## What changed and why
While seeding, the owner found the same subject registered twice in one college under different codes: "Data Structures and Algorithms" as both DSA123 and DSA213, and "Seamanship" alongside "Seamanship 1". The owner asked that the system refuse duplicate subjects. The owner also asked to keep only the 10 seeded subjects; that cleanup is SQL the owner runs, not a code change.

- **Migration:**
  - unique indexes on the subject code, ignoring case and spaces
  - unique indexes on the subject name within a college, ignoring case and spaces
  - the same name is still allowed in a different college
  - if duplicates already exist, it stops and lists them; no rows are changed
- **`SubjectForm.jsx`:**
  - Before saving (add or edit), it checks for a code already in use, or the same name in the same college, and names the existing subject.
  - A database duplicate error now shows a clear message on both add and edit. Before, only the add path handled it, and only for codes.
- **Seed doc:** records the subject cleanup and the owner's change of the student emails to `@dyci.edu.ph`.
- **Checklist:** AS-50, AS-51.

## How to verify
- Run the owner's subject cleanup first, then the migration, then QA cases AS-50 and AS-51.
- Checks run:
  - the migration parsed with a PostgreSQL parser
  - `npm run lint`: 0 errors
  - `npm run build`: succeeds
