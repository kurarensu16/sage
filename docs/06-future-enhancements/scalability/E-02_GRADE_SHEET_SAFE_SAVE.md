# E-02: Grade sheet safe save

- **Priority:** P0 (build first)
- **Fixes:** F-01, F-02
- **Status:** Proposed
- **Written:** 2026-10-10
- **Last revalidated:** never
- **Effort:** Medium
- **Migration:** No
- **Depends on:** None. Uses E-01's completeness result once E-01 exists.

> Run "Before implementing a spec: audit and cross-check" in the [scalability README](README.md) before implementing.

## 1. Goal
Saving the grade sheet **only writes cells the faculty actually changed**. A score that was not loaded is never deleted, blanked, or overwritten. If the load was incomplete, saving is blocked with a clear message.

## 2. Current behavior
There are **two save paths**, and both rewrite whole rows from the local draft:

1. **Per-row auto-save:** `src/components/StudentRow.jsx`, auto-save effect (debounced).
   - Any edit re-saves that student's **entire row for all terms**.
   - Legacy slots: terms with no values have their `student_term_scores` row **deleted**.
   - Dynamic activities: every blank cell is added to `dynamicScoreDeletes`, so its `student_activity_scores` row is **deleted**.
2. **Bulk save:** `src/pages/faculty/ScoreInput.jsx`, `handleBulkSave`.
   - Iterates **every student** with a draft. Drafts are seeded for every student on load (`ScoreInput.jsx`, step "Initialize local draft caches").
   - Blank cells go to `granularScoreDeletes` / `emptyTermRows`, so the rows are **deleted**.

Drafts are seeded from what loaded. When the load was truncated (F-01), real scores appear blank, and either save path deletes them in unposted terms.

In **posted terms**, blank cells block saving (`findPostedTermEmptyCells`), and a database trigger rejects nulls. But the faculty may then type `0` into a cell that only *looks* empty, overwriting a real score (F-02). See the late-joiner decision: [`LATE_JOINER_MISSING_ACTIVITIES_2026-10-10.md`](../../02-thesis/decisions/LATE_JOINER_MISSING_ACTIVITIES_2026-10-10.md).

Other things to keep:
- `Number(rawVal) || 0` in `StudentRow.jsx` (`getActVal`) turns non-numeric input into 0. Keep the value as-is, but validate on input instead.
- Bulk save and auto-save can run at the same moment for the same student (two writers).

## 3. Changes to existing files

| File | Change |
|---|---|
| `src/components/StudentRow.jsx` | Track a per-row **baseline** (the values as loaded) and an **edited-cells set** (`term + activity key`). The auto-save builds upserts/deletes **only from edited cells**. A delete is sent only when an edited cell was **cleared** *and* its baseline had a value. Never delete a whole `student_term_scores` row unless every slot in that term was explicitly cleared. Validate numeric input; reject (don't coerce) non-numbers. |
| `src/pages/faculty/ScoreInput.jsx` | `handleBulkSave` saves only students with edited cells, using the same edited-cells rule. Keep `findPostedTermEmptyCells`, but evaluate it only for **edited** cells plus late-joiner cells (cells with no baseline row for a student whose enrollment postdates the posting). Seed drafts with a `baseline` copy and an empty `edited` set. Block **all saving** if E-01 reports `complete: false`: banner "Some scores could not be loaded. Refresh before editing." |
| `src/pages/faculty/ScoreInput.jsx` (draft restore) | When a local draft is newer than the database, merge only its **edited** cells over the database baseline, never the whole draft. |
| `src/pages/faculty/PostedGradesView.jsx` | Uses the same `sage_scores_*` drafts. Confirm it doesn't write scores; if it does, apply the same rule. |

### Draft shape (proposed)
```js
{
  baseline: { Prelim: {…}, Midterm: {…}, 'Semi-Final': {…}, Final: {…} },  // as loaded
  values:   { … same shape, current cell values … },
  edited:   ['Midterm:<activityId>', 'Final:exam', …],                     // cells changed by the faculty
  loadComplete: true,                                                       // from E-01
  savedAt: '…'
}
```
Old drafts without `baseline`/`edited` are **discarded** on load (re-seeded from the database), never saved as-is.

## 4. New files
Optional: `src/lib/scoreDraft.js`, with pure helpers shared by both save paths:
- `createDraft(dbValues, { loadComplete })`
- `markEdited(draft, term, key, value)`
- `buildSaveOperations(draft)` → `{ upserts, deletes }` (edited cells only; deletes only for cleared cells that had a baseline value)

Plus `scripts/verifyScoreDraft.js` (`npm run verify:score-draft`), which unit-tests `buildSaveOperations`:
- An unedited blank cell produces **no** delete.
- An edited cleared cell with a baseline produces a delete.
- An edited cleared cell without a baseline produces nothing.
- An edited value produces an upsert.
- An incomplete load produces no operations.

## 5. Database changes
None required. The existing posted-term trigger stays.

Optional hardening (later): reject deleting `student_activity_scores` rows for a posted term in the database too, matching the existing null-protection trigger.

## 6. Order of work
1. `scoreDraft.js` and its verify script.
2. `StudentRow.jsx` auto-save (the most frequent path).
3. `ScoreInput.jsx` bulk save and draft seeding/restore.
4. Wire E-01's completeness flag when E-01 lands.

## 7. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Old drafts in faculty browsers | Version the draft format; discard drafts without `baseline`/`edited`. |
| A legitimate "clear this score" stops working | Clearing an edited cell that had a value still deletes it, which is the only intended delete. |
| Two writers (auto-save plus bulk save) | Bulk save skips students with an auto-save in flight, or auto-save is paused during bulk save. |
| The late-joiner zero rule (posted terms) | Unchanged: cells with no baseline for a late joiner still require a number before saving, per the decision record. |

## 8. Test plan
- `npm run verify:score-draft` passes.
- Seed class (from E-01): edit **one** cell → exactly one row changes in the database (compare `updated_at`); the other 1,499 are untouched.
- Clear a cell that had a value → that row is deleted; nothing else is.
- Simulate an incomplete load → banner shown; no save possible.
- Late joiner after MR posted → empty posted-term cells still demand a number; entering 0 saves only those cells.
- Existing checklist cases (score input, posted-term protection) still pass.

## 9. Paper and evaluation-tool impact
None: the documented grade-entry flow is unchanged; it becomes safe at scale.
