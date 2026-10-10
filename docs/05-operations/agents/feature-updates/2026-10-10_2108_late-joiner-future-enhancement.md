# Late-joiner handling documented as a future enhancement

- **Date:** 2026-10-10 21:08 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish (documentation only; no system behavior change)
- **Migration:** None

## Files changed
- `docs/06-future-enhancements/LATE_JOINER_HANDLING_2026-10-10.md`
- `docs/06-future-enhancements/README.md`
- `docs/README.md`

## What changed and why
The owner confirmed that the system accepts late and irregular students and that this is fine for now. They asked for the open points to be recorded as a future enhancement, and for an audit of how a student joining after the MR is handled.

The read-only code audit, recorded in the new document:
- Students join with a class code and are enrolled immediately, with no approval and no term or posted-milestone check.
- Their earlier activities are pending until the faculty enters numbers.
- The grade sheet blocks saving the class until posted-term cells have numbers.
- **Update MR** re-posts the whole class, including the late joiner, who then receives a grade-posted notification.

Four gaps are recorded (LJ-1 to LJ-4): the faculty isn't notified, a re-post refreshes every student's `posted_at`, the messages are generic, and there's a possible block on re-taking a subject. Four improvements are proposed (LJ-A to LJ-D). The zero rule and acceptance of late and irregular students are unchanged.

## How to verify
- The new document opens from `docs/README.md` and `docs/06-future-enhancements/README.md`; its links resolve.
- `npm run audit:freeze` still reports no unlogged code changes.
