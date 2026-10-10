# QA evaluation data reset recorded in the test checklist

- **Date:** 2026-10-10
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish (documentation only; no system behavior change)
- **Migration:** None. The data reset was run manually by the owner in the Supabase SQL editor; no migration file was added.

## Files changed
- `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`

## What changed and why
To let QA test the 2026-10-10 intervention flow (acknowledgment, task verification, follow-up) from a clean state, the owner deleted all existing evaluation data, which was entirely legacy. That removed 4 evaluations created before the update, their 4 private notes and 2 Dean referrals, and 13 AI intervention drafts. Post-reset counts were all 0. Grades, scores, attendance, posted milestones, users, classes, and notifications were not touched.

Checklist updates:
- §0.1: migration `20261010140000_followup_requires_task_review.sql` ticked as applied, and the data reset recorded with its post-reset counts.
- FU-17 marked N/A for this run, because the legacy record it needed was removed.

## How to verify
§0.1 and FU-17 in `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`. `npm run audit:freeze` still reports no unlogged code changes, since this record covers docs only.
