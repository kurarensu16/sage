# Ask ASPIRE reply length matches the edge function

- **Date:** 2026-10-11 20:03 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish
- **Migration:** None

## Files changed
- `src/lib/openrouter.js`

## What changed and why
`invoke-advisor` now allows replies of up to 1,600 characters, so list-style answers with real scores fit (see `2026-10-11_1952-01_student-running-gwa.md`). The client still cut every reply to 1,200 characters, so a longer answer could stop mid-line. The reply limit on the client is now 1,600. The limits for actions (240), questions (600) and chat history stay the same. Saved insight summaries go to a `TEXT` column with no length limit.

## How to verify
For a student with several subjects, ask Ask ASPIRE "How are my activities?". The full list appears and ends with a complete sentence.
