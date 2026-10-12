# AI Study Tutor: remove duplicate "Tentative scored activities" chip

- **Date:** 2026-10-11 21:12 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish
- **Migration:** None

## Files changed
- `src/pages/student/AcademicInsights.jsx`

## What changed and why
Under "Available context" in Proactive academic guidance, the page showed a standalone "Tentative scored activities" chip. It then listed the first four advisor evidence items, which already include the same count, so the chip appeared twice (e.g., "Tentative scored activities: 24" two times). The standalone chip is removed, and the count now appears once, from the evidence list.

## How to verify
Open the AI Study Tutor (Today tab). "Available context" lists Pending activities, Tentative scored activities, the running GWA, and Attendance, each once. `npm run lint` (0 errors) and `npm run build` pass.
