# Database reset (owner-run) and test-year seed for 2026-2027

- **Date:** 2026-10-11 15:17 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish (documentation and test data; no system code change)
- **Migration:** None. The owner ran the reset SQL in the Supabase SQL editor; the seed SQL in the new doc is run by the owner.

## Files changed
- `docs/05-operations/database/TEST_YEAR_SEED_2026-2027.md` (new)
- `docs/README.md`
- `docs/03-development/audits/ADMIN_SETUP_AUDIT_2026-10-11.md`

## What changed and why
After Batches 1–3, the owner chose a clean start instead of repairing the old data. That data had 320 students whose sections were emptied by the QA rollover, mostly without enrollments.

- **Reset (owner-run, 2026-10-11).** The SQL was given in the session, and the owner confirmed the result counts.
  - **Removed:** all 320 students and their logins; terms; sections; classes and everything under them; enrollments; term history; notifications; AI insights.
  - **Kept:** admin, deans, faculty, colleges, programs, subjects, COG templates, and `activity_logs`. The reset itself is recorded in the logs.
- **Seed doc.** The owner chose two programs: **BSIT** (General Education Core COG) and **BSMarE** (Maritime Lecture and Laboratory COGs). The doc contains:
  - 7 new subjects
  - the first term
  - 4 sections per regular term, with BSMarE-only Summer sections
  - a 40-student import CSV (10 per section)
  - the 8/8/4 class plan with instructors
  - SQL checks
  - the built-in rollover tests: one unposted class with a 30-day grace, then one with a 0-day grace
- **Audit:** new finding **L4**. With no terms at all, Term Settings cannot create the first term, so the seed creates it by SQL. The fix is to be decided.
- **Index:** the seed doc is listed in `docs/README.md`.

## How to verify
Follow the doc's stages in order. Each stage ends with a read-only check query and its expected result.
