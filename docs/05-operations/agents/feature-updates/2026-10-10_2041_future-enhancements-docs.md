# Future-enhancements documentation: scalability plan, late-joiner decision, defense Q&A

- **Date:** 2026-10-10 20:41 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish (documentation only; no system behavior change)
- **Migration:** None

## Files changed
- `docs/06-future-enhancements/README.md`
- `docs/06-future-enhancements/SCALABILITY_AND_DATA_HANDLING_2026-10-10.md`
- `docs/02-thesis/decisions/LATE_JOINER_MISSING_ACTIVITIES_2026-10-10.md`
- `docs/02-thesis/defense/SCALABILITY_DEFENSE_QA_2026-10-10.md`
- `docs/README.md`
- `AGENTS.md`

## What changed and why
A read-only scalability audit (2026-10-10) asked whether ASPIRE can serve 1,000+ users at once and how it caches and handles data per user. The owner decided to **document** the findings and the improvement plan, without implementing them yet.

- New folder `docs/06-future-enhancements/` for planned improvements that are documented but not built. It feeds the thesis Recommendations / Future Work and excludes the owner's deferred items.
- Scalability plan: current data flow, 13 findings with file evidence (including P0 data-correctness risks in the grade sheet), target design, roadmap E-01–E-15, acceptance tests, capacity estimates.
- Decision record: late joiners get `0` for missing posted-term work so their risk is visible (the current behavior, kept by the owner); the per-student pending alternative was rejected.
- Defense Q&A for panel questions on scale, data handling, caching, and late joiners.
- `docs/README.md` (new 06 section, decision and defense rows, folder-table row) and `AGENTS.md` (folder-table row) updated.

## How to verify
- The new files open from `docs/README.md`, and all their relative links resolve.
- `npm run audit:freeze` still reports no unlogged code changes (docs only).
