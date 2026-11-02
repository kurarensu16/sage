# Retire the class join code

- **Date:** 2026-10-30 13:41 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish
- **Migrations:** none. No table is dropped.

Self-enrolment by classroom code is retired on both sides. Enrolment is placed
by the Registrar or the Dean's office.

## Files changed

**Deleted**
- `src/pages/faculty/EnrollmentRequests.jsx`

**Changed**
- `src/App.jsx` — `/faculty/enrollmentrequests` now redirects to My Classes
- `src/components/layout/Sidebar.jsx` — Enrollment Requests entry removed
- `src/pages/student/MySubjects.jsx` — join button, modal, pending-request cards
- `src/pages/faculty/ClassRecordsList.jsx` — classroom code display and loader
- `src/lib/classRoomService.js` — five join functions removed
- `docs/01-system/overview/ASPIRE_SYSTEM_SCOPE.md`

## Why this is now redundant rather than merely unused

The Faculty Loading plan deliberately kept this path — it says in three places
that the join-code self-join flow is "untouched" and that join codes are "not
being removed system-wide". That was correct when written.

What changed is that the same plan also added **Add Irregular Student to
Class**, letting Registrar (any college) or Dean (own college) place a student
on a roster with no code and no faculty approval. That covers exactly the cases
the join code existed for: off-block electives, irregular students, a
block-sectioned student taking one extra subject. With that path live, the code
is a second way to do something already handled, with an extra approval step.

So this is not a reversal of the plan's decision. It is the consequence of the
capability the plan introduced alongside it.

## Why both sides, not just the student's

If students cannot request, nothing can ever arrive in the faculty queue. A page
that is permanently empty by construction is worse than no page — it reads as
broken, and a reviewer cannot tell the difference between "no requests" and "not
working". The route is redirected rather than deleted so old bookmarks and links
in past notifications land on My Classes rather than a 404.

The classroom code display on My Classes went with it. A code faculty can copy
but no student can redeem would only generate support questions.

## What was kept, deliberately

- **`class_join_requests` and `class_room_join_codes` are not dropped.** They
  hold history, and dropping tables is not reversible. They are now unused,
  which the upcoming schema audit should flag — that is the right place for
  that decision, with the ERD in front of you.
- **`getOrCreateJoinCode()` and `generateJoinCode()` remain**, because
  `provisionClassroomByAdmin()` still calls the former when a class is
  finalized. Removing it would mean editing the core provisioning insert, which
  is the riskiest change in this set for no user-visible gain. The effect is
  that codes are still generated and never used — harmless, and worth deciding
  during the schema audit rather than here.

## Problems found while doing it

**An earlier edit of mine had silently done nothing.** Removing the student's
import line used an empty end-marker, and `indexOf('')` returns the start
position, so the removal spanned zero characters and reported success. Caught
because ESLint then flagged the import as unused. Worth remembering: a
marker-based cut must assert it removed something.

**`cat -A` and `sed` misreport line endings in this shell.** They showed
`MySubjects.jsx` as LF while a raw byte count showed 597 CR and 597 LF — fully
CRLF. Several replacements failed silently against `\n` patterns before the byte
count settled it. `tr -cd '\r' | wc -c` is the reliable check here.

## Known limitations

- **Any pending `class_join_requests` rows are now unreachable from the UI.**
  Nothing can create them and nothing can resolve them. On a reset database
  there are none; if any exist later they are dead rows for the Registrar to
  resolve by enrolling the student directly.
- **`ASPIRE_SYSTEM_SCOPE.md` had drift predating this change** — it still listed
  *Create Classroom*, removed by the Faculty Loading rebuild. Corrected while
  there, but the document likely has more stale entries and deserves a full
  pass of its own.

`npm run lint` 0 errors / 48 warnings (unchanged) · `npm run build` clean.
