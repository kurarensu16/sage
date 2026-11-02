# Phase 7 — Archive study plans at term rollover

- **Date:** 2026-10-30 13:30 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration (not yet applied):** `20261030130008_archive_tutor_plans_on_rollover.sql`

The last piece of the owner's retention decision for the AI Study Advising
feature: when a term ends, an unfinished plan is archived rather than deleted,
and the student's list starts clean for the new term.

## Files changed

**New**
- `supabase/migrations/20261030130008_archive_tutor_plans_on_rollover.sql`

No application code changed. `studentTutorRules.js` already carried the
`archived` status with the label "Past term", and `StudyTutor.jsx` already
groups anything that is not `active` under "Finished and past plans", so the
archived state renders correctly without a UI change.

## Why a trigger on academic_terms, not an edit to perform_semester_transition

`perform_semester_transition` is live registrar machinery that moves grades and
enrolments. Adding a study-plan concern to it would mean a bug in a plan update
could abort a semester rollover — a catastrophic trade for a feature this small.

Hooking the table is also more correct. The transition sets
`academic_terms.ended_at` (`20261011130000`, line 379), but so would a
correction made by hand in the SQL editor. Watching the column covers every way
a term can end, now and later.

## Behaviour

- Fires only on the transition from `ended_at IS NULL` to a value. A term that
  was already ended, or edited for another reason, changes nothing.
- A plan whose every item was ticked becomes `completed`, not `archived` —
  labelling it "Past term" would misreport what the student actually did.
- Plans with no `term_id` (created while no term was active) are archived only
  if they predate the ending term's `ended_at`. A later one is left alone.
- The body is wrapped in an exception handler. A problem archiving a plan can
  never abort a semester rollover.

## The cap does not depend on this

`idx_one_active_plan_per_scope` already includes `term_id`, so a new term is
never blocked by last term's plan even if this trigger never ran. Archiving
exists so the student's list reads honestly, not for correctness. That is
deliberate: the safety-critical property does not rely on a trigger that is
allowed to fail silently.

## Known limitations

- **Un-ending a term does not un-archive.** If a rollover is reversed by
  setting `ended_at` back to NULL, plans stay archived. Reversing a rollover is
  an exceptional repair action, and guessing which plans to reactivate would be
  worse than leaving them where the student can still see them.
- **No notification.** Archiving at rollover is expected housekeeping; one
  notice per student per term would be noise.

## How to verify

`docs/04-testing/page-checklists/AI_STUDY_TUTOR.md` → `TUTOR-ROLLOVER`.

The case that matters: a plan with every item ticked must end as **Finished**,
not "Past term", and an unfinished one must end as "Past term" while remaining
visible. And the rollover itself must complete normally either way.
