# Rule: audit and cross-check a spec before implementing it

- **Date:** 2026-10-10 21:02 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish (documentation only; no system behavior change)
- **Migration:** None

## Files changed
- `docs/06-future-enhancements/scalability/README.md`
- `docs/06-future-enhancements/scalability/E-01_PAGED_READ_HELPER.md`
- `docs/06-future-enhancements/scalability/E-02_GRADE_SHEET_SAFE_SAVE.md`
- `docs/06-future-enhancements/scalability/E-03_REMOVE_MOCK_SCORE_SEED.md`
- `docs/06-future-enhancements/scalability/E-04_DEAN_DEPARTMENT_DB_FUNCTIONS.md`

## What changed and why
Features and fixes keep being made through the change-freeze process. A change made after a spec was written can make that spec partly wrong or unnecessary. At the owner's request, the scalability README now requires an **audit and cross-check before implementing any spec**:
1. Read the spec and the overview.
2. Review the change records dated after the spec.
3. Audit the current code and migrations, read-only.
4. Cross-check against the thesis flows and decisions.
5. Record the result in the spec (still fits / updated / rejected or superseded).
6. Report the findings before any code change.

The spec template gained **Written** and **Last revalidated** fields. The four existing specs (E-01–E-04) received the same two fields (`Last revalidated: never`), and their warning line now points to the audit section. This consistency change to E-01–E-04 went beyond the README the owner named, and was disclosed to the owner.

## How to verify
- `scalability/README.md` contains "Before implementing a spec: audit and cross-check", and the template includes the two new fields.
- E-01–E-04 headers show `Written: 2026-10-10` and `Last revalidated: never`.
- `npm run audit:freeze` still reports no unlogged code changes.
