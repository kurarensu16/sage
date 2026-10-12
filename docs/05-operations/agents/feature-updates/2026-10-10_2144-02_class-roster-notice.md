# Class Roster Update notice for professors

- **Date:** 2026-10-10 21:44 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** Part of `20261010160000_section_enrollment_sync_and_notice.sql` (**to apply**)

## Files changed
- `supabase/migrations/20261010160000_section_enrollment_sync_and_notice.sql`
- `src/lib/notificationDispatcher.js`
- `src/lib/notificationPreferences.js`
- `src/pages/faculty/Notifications.jsx`
- `docs/01-system/notifications/NOTIFICATION_SYSTEM_CATALOG.md`

## What changed and why
The owner asked that all subject professors be told when students are added to their classes by the administrator, including the **initial number of students** when a new class is created.

- New type `class_roster_added` (**Class Roster Update**), created by the statement trigger `notify_class_roster_additions` on `enrollments`:
  - One notice per class per batch, with the **number** of students added (no names, so nothing identifying shows on lock screens).
  - For a class created within the last 10 minutes: *"<subject> (<section>) was set up with N students from section enrollment."*
  - Additions within 10 minutes merge into the same unread notice (e.g., a CSV import), so professors don't get one notice per student.
  - Skipped for approved join requests (the professor decided those).
  - In-app and device alert only; never email.
- The faculty preference category becomes **"Class enrollment"** (`class_join_request`, `class_roster_added`).
- Faculty Notifications page title and icon; catalog row.
- **Paper:** an optional sentence is listed in the thesis audit §I item 11.

## How to verify
EN-02, EN-03, EN-04, EN-05, and EN-08 in `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`.
