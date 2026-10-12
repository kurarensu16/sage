# Change records get a time in their file name

- **Date:** 2026-10-10 21:49 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish (documentation only; no system behavior change)
- **Migration:** None

## Files changed
- `docs/05-operations/agents/feature-updates/` (all 22 existing records renamed; date line gained the time)
- `docs/05-operations/agents/feature-updates/README.md`
- `docs/05-operations/agents/CHANGE_FREEZE_GUIDE.md`
- `docs/03-development/implementation-reports/CLASS_JOIN_APPROVAL_2026-10-10.md`
- `AGENTS.md`

## What changed and why
With several changes applied in one day, date-only names (`2026-10-10_topic.md`) sorted alphabetically and mixed up the order. The owner asked for a timestamp so the first applied change is at the top and the last at the bottom.

- **New format:** `YYYY-MM-DD_HHMM_short-topic.md` (24-hour Philippine time, from the device clock). Same-minute records get `HHMM-01`, `HHMM-02`. The date line reads `YYYY-MM-DD HH:MM (Philippine time)`.
- **One-time, owner-approved rename** of the 22 existing records, using each file's real creation time:
  - The 11 back-filled records written together at 17:35 are numbered `1735-01` to `1735-11` in their original order, and their date line says they were back-filled.
  - Same-minute pairs at 21:35 and 21:44 are numbered by creation second.
  - Record content was not changed. This is the only exception to "records are permanent", noted in the README.
- **Rules updated:**
  - `AGENTS.md` rule 4 (naming, time source, Date field)
  - `feature-updates/README.md` (naming rule, template, exception note)
  - the example in `CHANGE_FREEZE_GUIDE.md`
- References to renamed records were updated in the implementation report and two records.

## How to verify
- `docs/05-operations/agents/feature-updates/` lists the day's records in the order they were applied (17:35 → 21:49).
- No references to the old file names remain.
- `npm run audit:freeze` still reports no unlogged code changes (it reads record contents, not names).
