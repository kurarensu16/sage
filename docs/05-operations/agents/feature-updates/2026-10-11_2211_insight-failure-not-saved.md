# AI insight: a failed generation is no longer saved as the insight

- **Date:** 2026-10-11 22:11 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** None

## Files changed
- `src/lib/openrouter.js`

## What changed and why
When every AI model failed during overall insight generation, `getAiAcademicInsight` returned a placeholder ("Ask ASPIRE is temporarily unavailable…"). The AI Study Tutor then saved it to `student_academic_insights` as if it were the student's insight. Under the keep-until-a-grade-is-posted rule (`2026-10-11_2039_academic-insight-format-and-refresh.md`), that placeholder would stay on the dashboard until the next posting unless the student clicked Refresh.

Now:
- A failed generation returns nothing. Nothing is cached or saved, and the AI Study Tutor shows no new explanation.
- With no saved insight, the next visit generates automatically again.
- Both callers already skip saving when there is no result.
- `getDeterministicFallback` is now chat-only (the evidence summary added in `2026-10-11_2207_ask-aspire-reliability-and-structure.md`). Its unused insight branch was removed.

## How to verify
1. With the AI unavailable (e.g., an invalid `ADVISOR_MODEL` and no working fallback), open the AI Study Tutor for a student with no insight. No placeholder appears, and no new row is saved in `student_academic_insights`.
2. Restore the models and reopen the AI Study Tutor. The insight generates automatically.
3. `npm run lint` (0 errors), `npm run verify:insights`, and `npm run build` pass.
