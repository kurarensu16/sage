# Phase 1 SG correction and report-export remediation

- **Date:** 2026-10-21 20:06 (Philippine time)
- **AI tool:** Codex
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** `supabase/migrations/20261021110000_sg_correction_batch_preflight.sql` (to apply)

## Files changed

- `docs/03-development/audits/PHASED_QA_AND_CODEBASE_REMEDIATION_PLAN_2026-10-21.md`
- `docs/05-operations/agents/feature-updates/2026-10-21_2006_phase-1-sg-correction-and-report-exports.md`
- `docs/README.md`
- `package.json`
- `scripts/verifySgCorrectionPosting.js`
- `src/lib/gradeCorrectionService.js`
- `src/lib/gradePostingService.js`
- `src/lib/reportsService.js`
- `src/lib/sgCorrectionPosting.js`
- `src/pages/faculty/GradeComputationPreview.jsx`
- `src/pages/faculty/ScoreInput.jsx`
- `supabase/migrations/20261021110000_sg_correction_batch_preflight.sql`

## What changed and why

Phase 1 fixes the system-wide SG correction posting failure without weakening the database guard. Both faculty posting screens now build the final SG payload from the exact approved request for the matching existing posted-grade record. A changed official SG without an exact approved, unused request is stopped with named-student feedback before atomic posting.

The final posted-grade trigger remains authoritative and the existing after-update history trigger still changes a request to `applied` only after the official grade update succeeds in the same transaction. The new preflight RPC is a usability check, not a bypass.

Class Performance and Performance Comparison XLSX workbooks now include report titles, context, timestamps, styled/wrapped headers, widths, filters, frozen heading rows, borders, printable layout, and labelled comparison sheets. Report values and official-grade export semantics were not changed.

## How to verify

1. Apply `20261021110000_sg_correction_batch_preflight.sql` using the approved Supabase migration process, then deploy the client.
2. Run `npm run verify:sg-correction`. It verifies approved, missing, already-used, and wrong class/term requests using Maritime and IT fixtures.
3. In both Maritime and IT QA data, verify: an exact approved request posts once and becomes `applied`; missing, used, and mismatched requests are rejected; and a mixed batch makes no partial official-grade/request-consumption change.
4. Check the Class Performance and Performance Comparison XLSX files open with readable titles, headers, frozen panes, filters, and unchanged metrics.
5. Local checks completed: `npm run lint` (60 pre-existing warnings, no errors), `npm run verify:grading`, `npm run verify:excel-export`, `npm run verify:csv`, `npm run verify:insights`, `npm run verify:sg-correction`, and `npm run build`.
