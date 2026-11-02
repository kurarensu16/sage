# Faculty loading: load table, per-faculty dialog, idle countdown, and the RLS block on Finalize

**Date:** 2026-10-31 16:14 (Philippine time)
**AI tool:** Claude Code (Opus 5)
**Approved by (device owner):** ghostbyte1014 <ghostbyte1014@gmail.com>
**Type:** Fix, and New feature (approved outside the documented flow)

## Files changed

- `src/components/provisioning/FacultyLoadingWorkspace.jsx`
- `src/lib/facultyLoadingService.js`
- `supabase/migrations/20261031161500_delete_draft_and_teaching_hours.sql` (applied by owner)
- `supabase/migrations/20261031174000_update_faculty_load_draft_schedule.sql` (**not yet applied**)
- `supabase/migrations/20261031183000_allow_loading_roles_to_provision_classes.sql` (**not yet applied**)

Both portals get all of this from one component: `dean/FacultyLoadingAndProvisioning.jsx`
and `registrar/FacultyLoadingAndProvisioning.jsx` both render
`FacultyLoadingWorkspace`, differing only in the `canChooseCollege` and
`fixedDepartmentId` props.

## The bug this batch found

Finalizing a draft fails with a 403 for **both** the Dean and the Registrar:

```
POST /rest/v1/class_records -> 403
new row violates row-level security policy for table "class_records"
```

`class_records_faculty_insert` was written on 2026-10-08, three weeks before
faculty loading existed. It admits `is_active_admin()` — which is role `admin`
**only** — or a faculty member inserting a class where `faculty_id = auth.uid()`.
Faculty loading provisions the class with a direct client insert, and nobody in
that flow satisfies either arm. The feature could never have completed from
either portal.

It survived because the Dean path had never been run end to end — it was item 1
on the "paths with no evidence" list in the QA checklist — and the Registrar
path stops at exactly the same policy.

Fixed in `20261031183000` by adding a third arm using
`can_load_faculty_for_department()`, the function the draft RPCs already use as
the single authority for who may load faculty. A Dean stays confined to their own
college, because that function resolves to `is_active_dean_for_department()` for
them. The college is read from the section.

**Not fixed:** the insert is still a direct client write where AGENTS.md asks for
a SECURITY DEFINER RPC. Moving it means rebuilding the grading snapshot in SQL,
and `provisionClassroomByAdmin()` warns explicitly that it must not be a
reimplementation — `post_grade_milestone_atomic` compares snapshots with an
order-sensitive JSONB `<>`, so a divergence would surface much later at the first
posting. The authorization boundary is corrected; the move is left as its own
change.

## Also fixed

- `fetchLoadState()` selected `class_records` without `meeting_days`,
  `start_time`, `end_time`, so the new days column would have been permanently
  blank for provisioned classes.
- The **Add** button sat inside the step 1–5 grid, above step 6, so reading in
  order reached a disabled button before the schedule that disables it. Moved
  below step 6, with a "Still needed: …" line naming what is missing.

## New

- **Load summary becomes a table**: header row, and columns for Days in school,
  Status (amber `N draft` / green `N open`), Classes, Units, Load. Columns share
  width proportionally rather than crowding against the right edge.
- **Per-faculty Load dialog** behind `View`. Drafts can be edited, reassigned,
  deleted or finalized there; already-open classes are shown read-only with the
  roster button, because retiming a class students are enrolled in is a
  different act with people to tell. The inline chips under each name are gone.
- **Finalize at three scopes**, all through one dialog that lists what is about
  to go live: per subject, **per faculty** (new), and the whole college.
  "Finalize 4 draft(s)?" cannot be checked by the person clicking it; four named
  subjects can. Finalize-all moved up beside the tab row.
- **Delete a draft** — `delete_faculty_load_draft()`, refused once a class record
  exists behind it.
- **Edit a draft's schedule** — `update_faculty_load_draft()`. This is what
  `find_schedule_conflict`'s long-unused `p_exclude_draft` parameter was for: a
  row being edited must not be reported as clashing with itself. Until that
  migration is applied, Edit fails with a plain sentence rather than a raw error.
- **Teaching hours 07:00–20:00**, as a column CHECK, an RPC guard, a service
  guard, and `min`/`max`/`step=300` on the inputs. Free-form minutes had produced
  `13:44–18:48`, which reads as a real class and is almost always a mistyped hour.
- **Idle countdown**: the lock release at two minutes is no longer silent. After
  30 seconds of inactivity a banner counts down the remaining 90 seconds, and any
  input cancels it.

## Already correct, verified rather than changed

Overlap detection needed no work. `find_schedule_conflict` uses the half-open
test `x.start_time < p_end AND p_start < x.end_time`, gated on a shared day:
07:00–10:00 against 09:30–12:30 is refused, 07:00–10:00 followed by 10:00–13:00
is allowed. Duplicate subject-plus-section is blocked by the
`uniq_faculty_load_slot_live` partial unique index across live drafts, and the
picker hides claimed slots via `buildClaimedSlotKeys`, which reads drafts as well
as classes.

## Verification

`npm run lint` 0 errors / 48 warnings (baseline), `npm run build` passes, CRLF
preserved. `ConfirmModal` became unused and its import was removed.

Manual test guide: `docs/04-testing/PROVISIONING_LOCK_IDLE_TEST_2026-10-31.md`
covers the lock; the countdown and this batch's table and dialog still need their
own pass.
