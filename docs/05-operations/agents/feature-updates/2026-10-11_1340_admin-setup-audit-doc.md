# Admin setup audit documented, with fix plan

- **Date:** 2026-10-11 13:40 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish (documentation only; no system behavior change)
- **Migration:** None

## Files changed
- `docs/03-development/audits/ADMIN_SETUP_AUDIT_2026-10-11.md`
- `docs/README.md`
- `AGENTS.md`

## What changed and why
QA reported that creating a classroom for BSIT-1A produced ACT-1A. The owner asked for a full audit of admin-side filtering and writes, then for the result as a document before any code is changed.

- **New folder `docs/03-development/audits/`** for code audits of a system area and their fix plans (work in progress). Finished work still goes to `implementation-reports/`.
- **New document `ADMIN_SETUP_AUDIT_2026-10-11.md`:**
  - the QA bug's cause (H1)
  - hard-coded colleges in the user form (C1)
  - all 320 students without a home section (C3)
  - cascading deletes (C2)
  - 4 High, 11 Medium, 3 Low findings with file evidence
  - verified-safe areas
  - a fix plan per page
  - a data-repair plan with a pending decision on roster notices
  - three batches with files and migrations
  - test outline, and the owner's query results as evidence
- `docs/README.md` and `AGENTS.md`: the folder rules gain the `03-development/audits/` row; the index lists the new audit.

## How to verify
- The audit opens from `docs/README.md` (section 03).
- `npm run audit:freeze` still reports no unlogged code changes.
