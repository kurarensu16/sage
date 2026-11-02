# Phase 5 patched the wrong function — corrected

- **Date:** 2026-10-29 22:58 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** `20261029104037_grade_consultation_windows.sql` — edited in place; the failed run committed nothing

## Files changed

- `supabase/migrations/20261029104037_grade_consultation_windows.sql`

## What happened

Applying Phase 5 stopped with:

> `Phase 5 aborted: post_grade_milestone_v3 contains 0 locked-milestone guard(s), expected 2.`

The migration patches the live definition of the posting function so that a
milestone with an open consultation window stops freezing the scores behind it.
It targeted **`post_grade_milestone_v3`**, which is wrong.

`post_grade_milestone_v3` is a thin wrapper. It validates FDA selections and the
MR → TFR → SG sequence, then delegates to **`post_grade_milestone_v2`**, which
holds the posting logic and both `AND COALESCE(locked_grade.is_locked, TRUE)`
guards. v2 is defined once, in
`20261022121000_server_authoritative_grade_posting.sql`, and never redefined.

The earlier verification that reported "exactly 2 occurrences" had been run
against the migration file containing v2 while the patch was aimed at v3 — the
count was right about the codebase and wrong about the target.

## Why nothing was damaged

The migration is wrapped in `BEGIN; … COMMIT;` and the failure occurred before
`COMMIT`, so the whole transaction rolled back. No tables, functions, policies
or triggers from Phase 5 exist in the database. The corrected file can simply be
run again.

## The assertion did its job

This is the second time in this project that a substitution-count assertion has
caught a patch aimed at the wrong place. Without it the migration would have
reported success while changing nothing, and the consultation window would have
had **no effect on whether scores could be edited** — discovered only when a
faculty member tried to correct a grade during an open window and was refused
for no visible reason.

## What changed

1. **The patch now targets `post_grade_milestone_v2`**, with the error message
   naming v2.

2. **A delegation assertion.** Patching v2 only helps while v3 still routes
   through it. If a later migration inlines the posting logic into v3, the patch
   would quietly stop affecting real posting while still reporting success. The
   migration now refuses if `post_grade_milestone_v3` no longer mentions
   `post_grade_milestone_v2`.

3. **Idempotency.** Re-running the migration previously would have appended the
   extra condition a second time, because the needle survives the patch. It now
   detects `milestone_edits_frozen` in the deployed body and skips with a notice.
   This matters immediately: the owner is re-running after a failed attempt.

4. **A post-condition in the verification block** confirming the patch is
   present in the deployed body. Every other check in that block — the tables,
   the functions, the `CHECK` that rejects a semestral-grade window — would pass
   with the patch missing, so none of them proved the feature actually works.

## How to verify

Re-run the migration. Expect two notices:

```
post_grade_milestone_v2 now respects open consultation windows.
Grade consultation windows verified.
```

Then `FAC-CONSULT` in `docs/04-testing/page-checklists/FACULTY_PORTAL.md`, in
particular the cases under *Correcting scores while the window is open* — those
are the ones that exercise the patched guards, and they are the only way to tell
from the outside that the patch landed on the right function.
