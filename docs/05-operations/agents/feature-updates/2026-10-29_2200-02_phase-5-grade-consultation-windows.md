# Phase 5 — Grade consultation windows and the three-state milestone badge

- **Date:** 2026-10-29 22:00 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** `20261029104037_grade_consultation_windows.sql` (to apply)

## Files changed

- `supabase/migrations/20261029104037_grade_consultation_windows.sql`
- `src/lib/milestoneState.js` *(new)*
- `src/lib/gradeConsultationService.js`
- `src/pages/faculty/GradeConsultationLog.jsx` *(new)*
- `src/pages/student/ConsultationHistory.jsx` *(new)*
- `src/pages/faculty/ConsultationRequests.jsx` *(deleted)*
- `src/pages/student/Consultations.jsx` *(deleted)*
- `src/pages/student/MyGradesList.jsx`
- `src/pages/student/MyGradesDetail.jsx`
- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`
- `scripts/verifyGradingMath.js`
- `docs/04-testing/page-checklists/FACULTY_PORTAL.md`
- `docs/04-testing/page-checklists/STUDENT_PORTAL.md`
- `docs/04-testing/page-checklists/README.md`
- `docs/README.md`

## What changed and why

Posting a progress grade used to lock it immediately, which left no room for the
consultation that actually happens between a faculty member and a student. The
window is that room.

**Scope, per the owner's decision:** Midterm Rating and Tentative Final Rating
get a window; Semestral Grade does **not**. SG is the summary of those two, so
the consultation belongs at the milestones that feed it rather than being
repeated on the total. SG posts and locks exactly as before.

| Milestone | Window | Free revision while open | Finalize |
|---|---|---|---|
| Midterm Rating | yes | yes (Prelim / Midterm scores) | yes |
| Tentative Final Rating | yes | yes (Semi-Final / Final scores) | yes |
| Semestral Grade | no | no | no — locks on post |

The window opens by itself, via an `AFTER INSERT` trigger on `posted_grades`
rather than a change inside the posting function: posting is the most
load-bearing code in the system and this leaves it untouched. `Finalize` closes
it, after which a change needs a formal grade change request.

The student-initiated consultation request feature was retired and replaced by a
faculty-driven **record**. "Nobody reached out" is a legitimate outcome, stored
as zero notes — that is what makes the log evidence either way rather than a
complaints box.

Students now see three states, derived rather than stored: **Tentative**,
**Posted — Not Finalized**, **Finalized**.

### Two defects found and fixed during the build

1. **A posted milestone with no window read as "Not Finalized".** Every grade
   posted before this migration has no window row, and `milestone_edits_frozen()`
   treats a missing window as frozen. The page would therefore have told students
   an old grade was still open to correction while the database refused every
   change. The JS now matches the SQL: no window means finalized. Asserted in
   `verify:grading` so the two cannot drift.

2. **The pure state logic could not be tested.** It lived beside the Supabase
   client, which cannot be imported outside the browser. Split into
   `src/lib/milestoneState.js` (re-exported from the service, so no call site
   changed) and now covered by fixtures asserting the JS against
   `milestone_edits_frozen()`'s behaviour.

## Consequence recorded for Phase 6

A student Grade Change Request gates on `finalized_at` for MR and TFR, but on
**posted** for SG, because SG never acquires a `finalized_at`.

## Known gap, left deliberately

The Faculty **Dashboard** still shows a consultation-resolution panel reading the
old `student_consultation_requests` table. Students can no longer create those
requests, so it shows only historical rows. Removing it would hide that history,
so it is flagged for a decision rather than deleted. Noted in `FAC-CONSULT`.

## How to verify

- `npm run verify:grading` — now covers the three states, including the
  no-window-reads-as-final regression guard.
- `FACULTY_PORTAL.md`: `FAC-CONSULT`.
- `STUDENT_PORTAL.md`: `STU-CONSULT`, `STU-GRADES`, `STU-GRADEDETAIL`.
