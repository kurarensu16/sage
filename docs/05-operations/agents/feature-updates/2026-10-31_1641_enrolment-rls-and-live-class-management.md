# Dean enrolment RLS, the swallowed failure, and managing provisioned classes

**Date:** 2026-10-31 16:41 (Philippine time)
**AI tool:** Claude Code (Opus 5)
**Approved by (device owner):** ghostbyte1014 <ghostbyte1014@gmail.com>
**Type:** Fix, and New feature (approved outside the documented flow)

## Files changed

- `src/lib/classRoomService.js`
- `src/lib/facultyLoadingService.js`
- `src/components/provisioning/FacultyLoadingWorkspace.jsx`
- `supabase/migrations/20261031190000_allow_dean_to_enroll_block_section.sql` (applied)
- `supabase/migrations/20261031193000_manage_provisioned_classes.sql` (applied)
- `docs/04-testing/ASPIRE_FULL_CYCLE_DEMO_AND_QA_2026-10-31.md` (bug log B-02)

Both loading portals get all of this from one shared component.

## B-02: a Dean's finalize created a class nobody was in

`enrollments_faculty_mutation` admits `is_active_admin()`, `is_active_registrar()`
and the class's assigned faculty. A Dean is none of those, so the auto-enrolment
step inside `provisionClassroomByAdmin()` was refused.

Worse than the refusal: the client caught it and called `console.warn`, then
returned as though provisioning had completed. Finalize reported success and the
class looked real. The only symptom was an empty roster found later — which is
exactly how it was found.

Diagnosed against live data rather than by reading code. The owner's query
returned BSIT-1A section membership **12** and IT213 · BSIT-1A enrolments **0**,
which separated the two concepts cleanly:

- **Section membership** is `users.section_id` — the home-section roster, which
  Section Rosters shows and which has been 12 since seeding.
- **Enrolment** is an `enrollments` row per student per subject per section.

The registrar screen showing 12 and the Dean screen showing 0 were both correct
and were not in conflict. Worth remembering, because the two screens look alike.

Fixed in `20261031190000`: the same `can_load_faculty_for_department()` arm used
for `class_records` in `20261031183000`, resolved through the section's college,
plus a backfill that enrolled the block section into every class that had none.

The silence is fixed too. `provisionClassroomByAdmin()` now returns `enrolled`
and `enrollmentError` instead of warning to the console, `finalizeDraft()`
forwards them, and the workspace reports: *"N class(es) are now open, but no
students were enrolled in X. Add the section from Enrollment Management."* The
class is still kept on failure — it exists and can be enrolled into — but a
half-finished job no longer reads as a clean one.

## New: reassign, retime and remove a provisioned class

The three correction actions used to stop at the draft boundary. Timetable
clashes do not: a room moves, a faculty member drops a load, two colleges find
they booked the same person.

`20261031193000` adds `update_class_schedule()`, `reassign_class_faculty()` and
`delete_class_record()`, plus a shared `can_manage_class_record()` guard. RPCs
rather than widened policies, because `class_records_faculty_update` is
admin-only and opening it would expose every column of a live class, including
`school_year`, `semester` and the frozen `grading_formula_snapshot`.

Delete is refused once any posted grade or score exists — a class that has been
taught is not a scheduling mistake. When allowed it clears the enrolments and
returns the originating draft to `draft` status, so the slot is not stranded.

### Two things caught while wiring the UI

- **Reassign already worked for finalized drafts.** `reassign_faculty_load()`
  supersedes the draft *and* repoints the class it produced. So the UI branches
  on whether a draft row exists, not on the Draft/Open label; the new RPC is only
  for classes provisioned outside this page.
- **Retiming a live class would have left a ghost.** `find_schedule_conflict()`
  unions `faculty_load_drafts WHERE status <> 'superseded'` — which includes
  `'finalized'` — with `class_records`. Updating only the class would leave the
  finalized draft on the old slot, still blocking that hour for everyone else at
  a time nothing meets. `update_class_schedule()` now moves the draft with the
  class. Caught before the migration ran.

### A corrected error of my own

The delete guard originally queried `student_scores`, which does not exist. There
are two score tables — `student_activity_scores`, reached through
`class_activities`, and `student_term_scores`, keyed directly — and the guard now
checks both. Found by checking the client's own queries rather than assuming the
name.

## Verification

`npm run lint` 0 errors / 48 warnings (baseline), `npm run build` passes, CRLF
preserved. Confirmed working by the owner after applying both migrations.
