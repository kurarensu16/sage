# Admin setup audit: rollover findings, reset plan, and evidence

- **Date:** 2026-10-11 14:02 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish (documentation only; no system behavior change)
- **Migration:** None

## Files changed
- `docs/03-development/audits/ADMIN_SETUP_AUDIT_2026-10-11.md`

## What changed and why
The owner's database results (queries 4–12) showed that the semester rollover QA ran on 2026-10-11 07:50 PH had promoted every student and emptied every student's home section, because no sections existed for the new term. They also showed that no section or class stores `term_id`. The owner approved the plan: fix all code (Batches 1–3), then a partial reset (keep colleges, programs, subjects, COG templates, and all accounts) and a rebuild through the fixed admin pages.

- New findings:
  - **R1** (rollover wipes sections and promotes without next-term sections)
  - **R2** (`term_id` never saved)
  - **R3** (once archiving works, unposted grades get stuck, and students lose previous-term classes; pending the owner's choice of Option 1 or 2)
- **C3** cause updated (mainly R1).
- **§6** rewritten as the partial-reset plan.
- **§7:** R1–R3 added to Batch 2, plus a Reset step after Batch 3.
- **Evidence:** queries 4–12 added to §9.
- **Statuses:** Batch 1 items marked done (code), pending QA.

## How to verify
Open the audit: findings R1–R3 in §4, the partial-reset plan in §6, queries 4–12 in §9, and Batch 1 statuses updated.
