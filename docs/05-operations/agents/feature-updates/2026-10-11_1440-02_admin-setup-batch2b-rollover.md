# Admin setup fixes, Batch 2B: safe term rollover and term history

- **Date:** 2026-10-11 14:40 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** `supabase/migrations/20261011130000_term_rollover_grace.sql` (to apply, after `20261011120000_restrict_destructive_deletes.sql`)

## Files changed
- `supabase/migrations/20261011130000_term_rollover_grace.sql`
- `src/lib/termStatus.js` (new)
- `src/pages/admin/TermManagement.jsx`
- `src/pages/faculty/ClassRecordsList.jsx`
- `src/pages/faculty/ScoreInput.jsx`
- `src/pages/faculty/ClassAttendance.jsx`
- `src/pages/student/MySubjects.jsx`
- `src/pages/student/MyGradesList.jsx`
- `src/pages/dean/GradePostingStatus.jsx`
- `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`
- `docs/03-development/audits/ADMIN_SETUP_AUDIT_2026-10-11.md`

## What changed and why
Audit findings R1, R2, R3 (the fix parts), and M6, following the approved design in audit §5.11. The grace period and labels are recorded separately in `2026-10-11_1440-03_rollover-sg-grace-period.md`.

- **R1, rollover safety (migration, `perform_semester_transition` rewritten):**
  - Admin only.
  - **Refused until the next term has sections.**
  - Each student moves to the matching next-term section of the same college (same name; next year number in a new school year). Only moved students are promoted.
  - Students with no match **keep** their section and year level. No section is ever emptied.
  - Returns a summary.
- **R2, `term_id`:** filled automatically by database triggers on new and edited sections and classes, plus a one-time back-fill. This covers the admin and faculty create paths, so `SectionForm.jsx` and `classRoomService.js` needed no change.
- **R3, history (fix part):**
  - Only classes whose SG is posted are archived.
  - Archived classes stay visible:
    - **Student My Subjects:** *Completed · Grade posted*, or *Grade not yet posted* for a previous-term class still open.
    - **Student My Grades:** archived classes are no longer hidden.
    - **Faculty Past Archives:** view only.
    - **Dean Grade Posting Status:** archived included.
  - An archived class is view only:
    - Score Input refuses saves, new activities, and MR/TFR posting.
    - The database refuses posting, **except the repost of a Dean-approved SG correction**, and SG correction requests are allowed on archived classes, so corrections keep working.
  - Attendance lists only active-term classes.
- **Term Settings (`TermManagement.jsx`, M6 done early):**
  - The pre-check lists the real classes without a posted SG, by school year and semester; it found 0 before because it matched on the empty `term_id`.
  - Reminders use the existing *Grade Submission Reminder* type and name each instructor's classes.
  - *Create next term* (inactive) so its sections can be added first; *Next Step* is blocked without sections.
  - A summary after the rollover.
  - **Removed:** the made-up sample terms and classes shown when loading failed, and the "offline" pretend rollover.
  - **One** activity log (there were two, one with a wrong column).
  - The actor name read a `userProfile` field the auth context does not provide.
- **Dean page, also fixed while there:**
  - the *Summer* filter never matched (`summer` vs `Summer`)
  - the school-year list was hard-coded
  - posted grades are loaded in pages, since one request is capped at 1,000 rows and could show posted classes as pending
  - the loading row spans all columns
- **Checklist:** cases AS-26 to AS-40.

## How to verify
- Run both migrations in order, then QA cases AS-26 to AS-40, on test data (a rollover cannot be undone).
- Checks run:
  - both migrations parsed with a PostgreSQL parser, function bodies included
  - `npm run lint`: 0 errors
  - `npm run build`: succeeds
  - `npm run verify:grading`: passes
