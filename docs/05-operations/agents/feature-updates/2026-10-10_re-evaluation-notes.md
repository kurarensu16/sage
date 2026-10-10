# Re-evaluation guidance on Evaluate and Evaluated Students

- **Date:** 2026-10-10
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** None

## Files changed
- `src/pages/faculty/StudentRisk.jsx`
- `src/pages/faculty/EvaluatedStudents.jsx`
- `src/components/faculty/RiskEducationNote.jsx`
- `src/lib/evaluationService.js`

## What changed and why
Re-evaluation guidance (evaluation flow): Evaluate Students shows **Closed** for a term whose follow-up is recorded, instead of a "Review / edit" that failed on save; closed cases and both help notes explain re-evaluating in a later term.

## How to verify
FU-11–14 in `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`.
