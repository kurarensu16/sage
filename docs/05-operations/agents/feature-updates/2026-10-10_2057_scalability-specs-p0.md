# Scalability implementation specs (P0 batch) and hosting tiers

- **Date:** 2026-10-10 20:57 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish (documentation only; no system behavior change)
- **Migration:** None

## Files changed
- `docs/06-future-enhancements/README.md`
- `docs/06-future-enhancements/SCALABILITY_AND_DATA_HANDLING_2026-10-10.md`
- `docs/06-future-enhancements/scalability/README.md`
- `docs/06-future-enhancements/scalability/E-01_PAGED_READ_HELPER.md`
- `docs/06-future-enhancements/scalability/E-02_GRADE_SHEET_SAFE_SAVE.md`
- `docs/06-future-enhancements/scalability/E-03_REMOVE_MOCK_SCORE_SEED.md`
- `docs/06-future-enhancements/scalability/E-04_DEAN_DEPARTMENT_DB_FUNCTIONS.md`
- `docs/06-future-enhancements/scalability/HOSTING_TIERS_AND_COST.md`
- `docs/README.md`

## What changed and why
The scalability overview said *what* to improve but not *how*. The owner asked for implementation-level documentation, documented but not implemented, for use if the school adopts ASPIRE.

- **Adoption framing:** the 06 README and the overview now state that these enhancements are triggered by institutional adoption. The prototype is complete for its research scope (synthetic data, free tiers).
- **Spec index and template** (`scalability/README.md`), with an index of E-01–E-15, effort, migration needs, and status.
- **P0 implementation specs:**
  - **E-01:** `src/lib/pagedQuery.js` design, every at-risk call site, ordering rule, verify script.
  - **E-02:** both save paths (`StudentRow.jsx` auto-save and `ScoreInput.jsx` bulk save), edited-cells-only design, draft format, verify script.
  - **E-03:** exact mock block and a read-only data check.
  - **E-04:** six department-scoped database functions with authorization, SQL outline, totals-based rating with an equality proof, page conversions.
- **Hosting tiers and cost:** free-tier limits, three adoption tiers with required enhancements and rough costs, and questions for the school.
- **Overview:** an adoption-readiness note; roadmap rows E-01–E-04 and E-15 link to their specs.

Audit details found while writing the specs, recorded in them:
- Wide unfiltered reads also exist in `dean/SummaryReports.jsx`, `dean/GradePostingStatus.jsx`, `admin/UserList.jsx`, and `admin/ClassroomProvisioning.jsx`.
- The per-row auto-save in `StudentRow.jsx` deletes blank cells across all terms on every edit, so it's the main E-02 target.
- Roster membership is `enrollments` matched on `section_id` + `subject_id`.

## How to verify
- Every new file opens from `docs/README.md` and `docs/06-future-enhancements/README.md`, and all relative links resolve.
- `npm run audit:freeze` still reports no unlogged code changes (docs only).
