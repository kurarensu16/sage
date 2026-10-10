# In-app notifications for class join requests and decisions

- **Date:** 2026-10-10 21:35 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** Part of `20261010150000_class_join_approval.sql` (**to apply**)

## Files changed
- `supabase/migrations/20261010150000_class_join_approval.sql`
- `src/lib/notificationDispatcher.js`
- `src/lib/notificationPreferences.js`
- `src/pages/student/Notifications.jsx`
- `src/pages/faculty/Notifications.jsx`
- `docs/01-system/notifications/NOTIFICATION_SYSTEM_CATALOG.md`

## What changed and why
The thesis describes the Enrollment Requests approval step, but not notifications for it. The owner explicitly approved adding them, so faculty know a request is waiting and students know the outcome. **In-app and device alerts only; email stays off.**

| Type | To | When |
|---|---|---|
| `class_join_request` (new) | Class's faculty | A student enters the class code. The message carries no student name, so lock-screen alerts don't expose identities. |
| `class_enrolled` (existing type, now actually sent) | Student | The faculty approves the request |
| `class_join_declined` (new) | Student | The faculty rejects the request |

- The notifications are created inside `request_class_join` / `resolve_class_join_request`, with deduplication keys. The general dispatch rules were not loosened, since not-yet-enrolled students can't be messaged through them.
- Preference categories: student "Class enrollment" (`class_enrolled`, `class_join_declined`); faculty "Enrollment requests" (`class_join_request`). No email option.
- Notification pages show proper titles and icons. The notification catalog is updated.
- **Paper:** an optional sentence is listed in the thesis audit §I item 10.

## How to verify
EJ-06, EJ-07, EJ-08, and EJ-13 in `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`.
