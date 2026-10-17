# Consultation scheduling and the section masterlist

- **Date:** 2026-10-14 14:43 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** `20261014190000_consultation_scheduling.sql` (applied 2026-10-14)

## Files changed
- `supabase/migrations/20261014190000_consultation_scheduling.sql`
- `src/lib/classRoomService.js`
- `src/pages/faculty/ConsultationRequests.jsx`
- `src/pages/faculty/Dashboard.jsx`
- `src/pages/student/Consultations.jsx`
- `src/pages/admin/SectionMasterlist.jsx` (new)
- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`

## What changed and why

Phase 3 (ASPIRE-C02, C13).

**Consultation scheduling.** `student_consultation_requests` had no date/time and no mode column at all, so whatever a faculty member actually decided could only be typed into `faculty_notes` as prose. Added `scheduled_at`, `consultation_mode` (CHECK-constrained to `online` / `face_to_face`), `meeting_link`, `onsite_location` and the two `schedule_acknowledged_*` columns. Choosing "Scheduled" now requires both a date/time and a mode; link and location are optional and shown according to the mode. The faculty decision is final — there is no counter-proposal — but because the student opened the request they acknowledge it, which the acknowledgment columns record.

Two deliberate decisions:

- **A changed schedule clears the acknowledgment.** Otherwise the student would see "You confirmed you have seen this schedule" beside a date they never saw. This is a reset, not the intervention form's content-diff mechanism.
- **The faculty dashboard's quick-resolve modal no longer offers "Scheduled."** It has no date field, so allowing it there would recreate the exact gap C02 is about: a request marked scheduled with no schedule attached. It now offers Completed/Declined and links to Consultation Requests for scheduling.

No database CHECK requires `scheduled_at` when `status = 'scheduled'`: existing rows already sit in that state with no date, so the constraint would either fail to apply or block faculty from editing those rows until they backfilled one. The form enforces it instead.

Also fixed while here: `logActivity` was being called with an object instead of three positional arguments, so every consultation resolution wrote a garbled audit entry — the same defect as M5 in the 2026-10-11 admin audit.

**Section masterlist.** A new admin page at `/admin/sectionmasterlist` with two parts: the official masterlist, which is the section's home-assigned students (`users.section_id`) independent of any subject offering, and a companion list of irregular enrollees grouped per subject. Every existing faculty roster is untouched — this is an additional report, never a filter on official records.

`getSectionHomeRoster` and `getSectionIrregularEnrollees` were added to `classRoomService.js` rather than querying from the page, so enrollment resolution keeps one owner and the Regular/Irregular decision still runs through `getEnrollmentType`. `getClassPriorityRoster` was not reused directly because it also resolves grading formulas and computes risk scores, which is wasteful for a roster listing.

## How to verify
`docs/04-testing/CONSULTATION_REMEDIATION_TEST_GUIDE_2026-10-14.md` §8 (scheduling, including §8.8 acknowledgment reset and §8.9 the dashboard restriction) and §9 (masterlist, including §9.4: irregular students must still appear on faculty rosters).
