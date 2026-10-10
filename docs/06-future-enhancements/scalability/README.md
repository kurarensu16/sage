# Scalability implementation specs

One **implementation spec** per enhancement in the roadmap of [`../SCALABILITY_AND_DATA_HANDLING_2026-10-10.md`](../SCALABILITY_AND_DATA_HANDLING_2026-10-10.md). The overview explains *what* is wrong and *why*; each spec explains *how* to build the fix: files, functions, new files, migrations, order, and tests.

**Status of all specs: Proposed.** Nothing here is implemented. These enhancements are triggered by **institutional adoption**; the research prototype doesn't require them.

> **Specs can go out of date.** Features and fixes keep being made through the change-freeze process (recorded in [`05-operations/agents/feature-updates/`](../../05-operations/agents/feature-updates/README.md)), and a change made after a spec was written may make the spec partly wrong, or no longer needed. **Never implement a spec as written without the audit below.** Implementation itself follows the change-freeze process ([`CHANGE_FREEZE_GUIDE.md`](../../05-operations/agents/CHANGE_FREEZE_GUIDE.md)): file-by-file approval and a change record in `feature-updates/`.

## Before implementing a spec: audit and cross-check

Do this every time, whether a person or an AI agent implements the spec.

1. **Read** the spec and the overview ([`SCALABILITY_AND_DATA_HANDLING_2026-10-10.md`](../SCALABILITY_AND_DATA_HANDLING_2026-10-10.md)), including the finding(s) it fixes.
2. **Check what changed since the spec was written.** List the change records in `05-operations/agents/feature-updates/` dated after the spec's date (or after its *Last revalidated* date). For each one, check whether it touched any file, function, table, or flow the spec relies on.
3. **Audit the current code**, read-only:
   - Every file, function, and line reference in the spec still exists and does what the spec says.
   - Search again for call sites (e.g., `grep -rn "from('student_activity_scores')" src/`); new pages may need the same change.
   - Check `supabase/migrations/` for tables, columns, or functions added since the spec date that change the design (e.g., a new enrollment rule, a new index, an existing function that already does the job).
   - Run `npm run lint`, `npm run audit:freeze`, and the `verify:*` scripts to record a clean starting point.
4. **Cross-check against the documented system.** Make sure the spec still matches the thesis flows and any decisions in `02-thesis/decisions/` (e.g., the late-joiner zero rule), and doesn't introduce something outside the documented flow.
5. **Decide and record the result** at the top of the spec:
   - **Still fits:** add `Last revalidated: YYYY-MM-DD, <device owner>`, then implement.
   - **Partly out of date:** update the spec first (with the owner's approval), add the revalidation line, then implement.
   - **No longer needed or superseded:** set the status to `Rejected` or `Superseded`, with the reason and the change record that made it unnecessary. Update the index below.
6. **Report** the audit findings to the developer before any code change, under the freeze rules.

## Index

| ID | Priority | Spec | Fixes | Migration | Effort | Status |
|---|---|---|---|---|---|---|
| E-01 | P0 | [Paged read helper](E-01_PAGED_READ_HELPER.md) | F-01, F-03, F-04 | No | Medium | Proposed |
| E-02 | P0 | [Grade sheet safe save](E-02_GRADE_SHEET_SAFE_SAVE.md) | F-01, F-02 | No | Medium | Proposed |
| E-03 | P0 | [Remove mock score seed](E-03_REMOVE_MOCK_SCORE_SEED.md) | F-12 | No | Small | Proposed |
| E-04 | P0 | [Dean department database functions](E-04_DEAN_DEPARTMENT_DB_FUNCTIONS.md) | F-03, F-04, F-09 | Yes | Large | Proposed |
| E-05 | P1 | Remove notification polling | F-05 | No | Small | Spec not written yet |
| E-06 | P1 | Realtime sizing / Broadcast | F-06 | Maybe | Medium | Spec not written yet |
| E-07 | P1 | Load the profile once per login | F-13 | No | Small | Spec not written yet |
| E-08 | P1 | Index review | F-03, F-09 | Yes | Small | Spec not written yet |
| E-09 | P2 | Pre-computed per-student summaries | F-09 | Yes | Large | Spec not written yet |
| E-10 | P2 | Transactional email and digests | F-07 | Maybe | Medium | Spec not written yet |
| E-11 | P2 | AI Study Tutor results in the database | F-08 | Yes | Medium | Spec not written yet |
| E-12 | P2 | Route-level code splitting | F-10 | No | Medium | Spec not written yet |
| E-13 | P2 | Sign-out storage cleanup | F-11 | No | Small | Spec not written yet |
| E-14 | P2 | Versioned service worker cache | F-13 | No | Small | Spec not written yet |
| E-15 | P3 | Capacity sizing and load test | All | No | Medium | Spec not written yet; see [Hosting tiers and cost](HOSTING_TIERS_AND_COST.md) |

Also: [Hosting tiers and cost](HOSTING_TIERS_AND_COST.md): free vs. paid limits, and the number of users at which each paid tier becomes necessary.

**Recommended build order:** E-02 → E-01 → E-03 → E-04, then P1, then P2, then E-15 before launch. E-02 comes first because it stops data loss even before reads are fixed.

## Spec template

Copy into `E-NN_SHORT_NAME.md`:

```markdown
# E-NN: <Title>

- **Priority:** P0 | P1 | P2 | P3
- **Fixes:** F-NN (see the overview's findings table)
- **Status:** Proposed
- **Written:** YYYY-MM-DD
- **Last revalidated:** never (run the audit in the scalability README before implementing)
- **Effort:** Small | Medium | Large
- **Migration:** Yes | No | Maybe
- **Depends on:** E-NN, or None

> Run "Before implementing a spec: audit and cross-check" (scalability README) before implementing.

## 1. Goal
## 2. Current behavior
## 3. Changes to existing files
## 4. New files
## 5. Database changes (migration outline and rollback)
## 6. Order of work
## 7. Risks and mitigations
## 8. Test plan (checklist cases, seed data, verify script)
## 9. Paper and evaluation-tool impact
```
