# QA checklist: setup updated for the 2026-10-11 reset and test year

- **Date:** 2026-10-11 16:07 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish (documentation only)
- **Migration:** None

## Files changed
- `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`
- `docs/05-operations/database/TEST_YEAR_SEED_2026-2027.md`

## What changed and why
The owner asked whether the checklist was updated. Its cases were (AS-01 to AS-51), but its setup part still described the data from before the reset.

- **Header:** lists the 2026-10-11 admin setup fixes (B10c–B10e) and points to the test-year seed.
- **§0.1:** the two 2026-10-10 migrations and the four 2026-10-11 migrations are marked applied, as confirmed by the owner (restrict deletes, rollover grace, Batch 3 saves, unique subjects).
- **§0.2:** setup uses the test year. COG coverage is stated honestly: 3 of the 5 templates are in this run (General Education Core, Maritime Lecture, Maritime Laboratory).
- **New §0.4:**
  - what the reset removed and kept
  - the BSIT/BSMarE sections, COGs, faculty, deans, and student accounts
  - first-login passwords
  - which cases to run at each stage of the test year
- **Seed doc progress:** the duplicate-subject migration is marked done.

## How to verify
Open the checklist §0.1–§0.4 and the seed doc's Progress table.
