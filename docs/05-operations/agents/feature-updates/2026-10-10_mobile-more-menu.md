# Mobile More menu opens the full sidebar

- **Date:** 2026-10-10
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** None

## Files changed
- `src/components/layout/BottomNav.jsx`
- `src/components/layout/MainLayout.jsx`
- `src/components/layout/Sidebar.jsx`

## What changed and why
Mobile navigation: **More** opens the full sidebar menu, so every page is reachable on phones (several pages were unreachable). Student Attendance moved from the bottom bar into the menu.

## How to verify
LB-07, LB-08 in `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`.
