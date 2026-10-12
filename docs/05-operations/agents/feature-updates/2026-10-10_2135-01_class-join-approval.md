# Class-code joins require faculty approval

- **Date:** 2026-10-10 21:35 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix (restores the documented Enrollment Requests approval step)
- **Migration:** `20261010150000_class_join_approval.sql` (**to apply**)

## Files changed
- `supabase/migrations/20261010150000_class_join_approval.sql`
- `src/lib/classRoomService.js`
- `src/pages/student/MySubjects.jsx`
- `src/pages/student/MyGradesList.jsx`
- `src/pages/faculty/EnrollmentRequests.jsx`
- `docs/03-development/implementation-reports/CLASS_JOIN_APPROVAL_2026-10-10.md`
- `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`
- `docs/02-thesis/audits/THESIS_AUDIT_2026-10-10.md`
- `docs/06-future-enhancements/LATE_JOINER_HANDLING_2026-10-10.md`
- `docs/README.md`
- `AGENTS.md`

## What changed and why
The thesis documents Enrollment Requests as a queue where the faculty approves or rejects students who joined by code before they are added to the roster and gradebook (also Figures 2.3 and 2.9). The code enrolled students immediately and never fed that queue. The owner asked to follow the paper, for wrong-code protection, privacy, and security.

- **Database:** `request_class_join` (pending request, existing duplicate rules, active code and class only), `resolve_class_join_request` (assigned faculty only; approve enrolls in the same transaction; refuses another-section duplicates), `dismiss_class_join_request`; plus tracking columns and indexes on `class_join_requests`.
- **Student:** "Request sent" message; locked request cards on My Subjects (*Waiting for approval* / *Not approved* with Dismiss).
- **Faculty:** Enrollment Requests uses the one-step decision, shows success and error messages, and shows a **late-join hint** when the class already has a posted MR/TFR/SG.
- **Docs:** implementation report; checklist cases EJ-01 to EJ-14 and the migration precondition; thesis audit §E2; late-joiner doc status (LJ-1 resolved for code joins, LJ-A partly done); index; `AGENTS.md` migration count (51).

Notifications for requests and decisions are recorded separately as an approved new feature: `2026-10-10_2135-02_class-join-notifications.md`.

## How to verify
- Apply the migration, then run EJ-01 to EJ-14.
- Checked so far: `npm run lint` (0 errors), `npm run build` (succeeds), `npm run audit:freeze`.
