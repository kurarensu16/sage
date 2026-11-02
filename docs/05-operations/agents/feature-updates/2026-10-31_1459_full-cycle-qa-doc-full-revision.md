# Full-cycle QA checklist — complete revision

**Date:** 2026-10-31 14:59 (Philippine time)
**AI tool:** Claude Code (Opus 5)
**Approved by (device owner):** ghostbyte1014 <ghostbyte1014@gmail.com>
**Type:** Polish

## Files changed

- `docs/04-testing/ASPIRE_FULL_CYCLE_DEMO_AND_QA_2026-10-31.md`
- `docs/04-testing/import-fixtures/README.md`
- `docs/04-testing/import-fixtures/ASPIRE_Import_Users_DEMO.xlsx`
- `docs/04-testing/import-fixtures/ASPIRE_Import_Subjects_DEMO.xlsx`
- `docs/04-testing/import-fixtures/ASPIRE_Import_Sections_DEMO.xlsx`

## What changed

Rewritten whole, after the document had grown by accretion through four separate
additions in one session. Defects it was carrying:

- The QA-only stages added for objective coverage sat **after Stage 9**, although
  several of them (sign-in, the password rules) run first in a real pass.
- **Two different "Stage 0"s** — the starting state in the time budget, and the
  public-portal stage.
- The **time budget no longer summed**: the bulk-import row was inside the table
  while the total still read 20:00.
- "Paths with no evidence behind them yet" had become a **parallel list** that
  duplicated the new stages instead of pointing at them.
- Stage 1 was tagged *Admin* but contained two Registrar imports.
- The demo script and the QA checklist were interleaved with no way to tell
  which lines belonged to which pass.

Structural changes:

- Every stage is now tagged **DEMO · m:ss** or **QA only**. The nine DEMO stages
  keep their original numbers and still total 20:00; QA-only work is lettered and
  sits at its **chronological** position (0, 1b, 1c, 2b, 4b, 4c, 5b, 7b, 7c, 9b,
  9c, 9d, 10, 11, 12).
- New **"Start here"** route and a **pre-flight** section covering `lint`,
  `build` and all eleven `verify:*` scripts, so the repo is green before a
  running system is tested.
- New **objective coverage table** mapping all eight Specific Objectives to the
  stages that answer them. Objective 8 is stated as not a system feature.
- New stages for previously uncovered claims: attendance, the frozen COG
  snapshot, Prelim and TFR postings, the Dean's own loading path, Dean referral
  and baseline-to-follow-up tracking, the AI deterministic fallback, registrar
  override, notifications and preferences, admin maintenance and backup, a
  Summer term, and the Dean/Student/Registrar pages the cycle under-uses.
- Bulk-import stages added for all three workbooks, with the users import marked
  optional in the demo and an explicit table of what its 1:30 displaces.
- Faculty-loading conflict checks rewritten as a **three-draft recipe**, after
  confirming `find_schedule_conflict()` unions `faculty_load_drafts` with
  `class_records` — so both branches fire from drafts and only one class is ever
  finalized.
- Guidance corrected: **one class**, not all eight, proves the cycle in pass A.
- Late-grade-change check moved into Pass B, where `ended_at` exists, instead of
  an unactionable "wait out 30 school days".

Counts after the rewrite: **24 stages, 133 pass/fail checks**, CRLF line endings
restored.

## Legacy wording removed

At the owner's instruction, demo-facing material no longer mentions retired
features. Two places said so and now state the current rule positively instead:

- Stage 3 said the join-code request path was retired; it now says enrolment is
  an administrative act and a student cannot put themselves on a roster.
- The import-fixture README and the workbooks' `Expected outcome` sheet said an
  alias table had been removed; they now say matching is exact by design, because
  rewriting a near-miss on the importer's own authority would be a second,
  silently diverging source of truth beside the catalogue.

The three workbooks were regenerated so the crib sheet matches.

## Not changed

No code, no migrations, no thesis paper. Every coverage gap found was a feature
the system already has and the paper already claims; the gap was in the
checklist.
