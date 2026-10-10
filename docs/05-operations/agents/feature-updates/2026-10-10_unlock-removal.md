# Removal of the Dean class-wide unlock

- **Date:** 2026-10-10
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** None

## Files changed
- `src/pages/dean/GradePostingStatus.jsx`
- `src/pages/faculty/PostedGradesView.jsx`
- `src/pages/admin/TermManagement.jsx`

## What changed and why
Removed the Dean class-wide unlock button and its dead faculty-side code; the term rollover check counts pending remark override requests instead of unlock requests.

## How to verify
UL in `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`.
