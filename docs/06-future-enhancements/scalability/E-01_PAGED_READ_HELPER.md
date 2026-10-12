# E-01: Paged read helper

- **Priority:** P0
- **Fixes:** F-01, F-03, F-04
- **Status:** Proposed
- **Written:** 2026-10-10
- **Last revalidated:** never
- **Effort:** Medium
- **Migration:** No
- **Depends on:** None. Ship together with, or after, [E-02](E-02_GRADE_SHEET_SAFE_SAVE.md).

> Run "Before implementing a spec: audit and cross-check" in the [scalability README](README.md) before implementing.

## 1. Goal
Every read on a table that grows with enrollment returns **all** matching rows, never a silently truncated first 1,000. Long ID filters never exceed safe URL length.

## 2. Current behavior
- The data API returns at most **1,000 rows per request** (`supabase/config.toml` → `[api] max_rows = 1000`; the hosted project uses the same default). A larger result is cut off **without an error**.
- Except for Evaluated Students (`evaluationService.js`, `.range()`), every read loads in a single request.
- `.in('student_id', [...])` and `.in('activity_id', [...])` put every ID in the URL (about 37 characters per UUID).

Reads on growing tables, by scope (from the 2026-10-10 audit):

| Scope | File | Reads at risk |
|---|---|---|
| Faculty grade sheet | `src/pages/faculty/ScoreInput.jsx` | `student_activity_scores` by `activity_id` list; `student_term_scores`; `posted_grades`; `attendance_records`; `enrollments` |
| Faculty roster / risk | `src/lib/classRoomService.js` (class roster with risk) | `student_term_scores`, `class_activities`, `student_activity_scores`, `posted_grades`, `attendance_records` |
| Faculty class analytics | `src/lib/reportsService.js` | `class_activities`, `student_activity_scores`, `posted_grades`, `attendance_records` |
| Faculty posting | `src/pages/faculty/PostedGradesView.jsx`, `GradeComputationPreview.jsx` | `student_term_scores`, `student_activity_scores`, `posted_grades`, `attendance_records` |
| Faculty dashboard / records | `src/pages/faculty/Dashboard.jsx`, `ClassRecordsList.jsx` | `posted_grades`, `student_term_scores`, `enrollments` |
| Admin lists | `src/pages/admin/UserList.jsx` (**all users in one request**), `ClassroomProvisioning.jsx` (all `enrollments`, all `posted_grades`), `DepartmentsList.jsx`, `GradeOverride.jsx` | `users`, `enrollments`, `posted_grades` |
| Student pages | `src/pages/student/*` | Scoped to one student, so normally small. Use the helper anyway for `student_activity_scores` (many activities × subjects). |
| Dean pages | `src/pages/dean/*` | Covered by [E-04](E-04_DEAN_DEPARTMENT_DB_FUNCTIONS.md) (database functions); use this helper only as an interim fix. |

## 3. Changes to existing files
Replace each at-risk read with the helper (section 4). The pattern:

```js
// Before
const { data } = await supabase
  .from('student_activity_scores')
  .select('student_id, activity_id, score')
  .in('activity_id', actIds);

// After
const data = await fetchAllInBatches(actIds, ids =>
  supabase.from('student_activity_scores')
    .select('score_id, student_id, activity_id, score')
    .in('activity_id', ids),
  { orderBy: 'score_id' });
```

| File | Change |
|---|---|
| `ScoreInput.jsx` | Activity-score load (the `granularScores` read), term scores, posted grades, attendance → helper. Feed the **completeness result** to E-02. |
| `classRoomService.js` | All reads in the class-roster-with-risk function → helper; `.in('student_id', studentIds)` → batched. |
| `reportsService.js` | Activity scores, posted grades, attendance → helper. |
| `PostedGradesView.jsx`, `GradeComputationPreview.jsx` | Same reads → helper. |
| `admin/UserList.jsx` | Interim: helper ordered by `user_id`. Better: **server-side pagination** (`.range()` per page of 50 plus search filters in the query) so the list never downloads every user. |
| `admin/ClassroomProvisioning.jsx` | `enrollments` and `posted_grades` → filter by the selected section/term instead of reading everything; helper for what remains. |

**Ordering rule:** always order by the table's primary key (`score_id`, `posted_grade_id`, `attendance_id`, `activity_id`, `user_id`; for `enrollments`, check the key column name). Without a unique, stable order, pages can overlap or skip rows.

## 4. New files

### `src/lib/pagedQuery.js`
```js
export const PAGE_SIZE = 1000;      // must not exceed the API max_rows
export const ID_BATCH_SIZE = 100;   // keeps .in() URLs well under common limits

// Reads every row for a query. `build` must return a NEW query builder each call.
export async function fetchAllRows(build, { orderBy, pageSize = PAGE_SIZE, verifyCount = false } = {});
// → { rows, complete } ; complete = false if verifyCount is on and the row count differs

// Splits a long ID list into batches, runs fetchAllRows for each, merges the results.
export async function fetchAllInBatches(ids, buildForBatch, options = {});
```
Behavior:
- Loop `.order(orderBy).range(from, from + pageSize - 1)` until a page returns fewer than `pageSize` rows.
- With `verifyCount: true`, request `{ count: 'exact' }` on the first page and compare it with the rows received; return `complete: false` on a mismatch. The grade sheet uses this (E-02).
- Throw on any page error. Never return partial data as if it were complete.
- Remove duplicate IDs before batching.

### `scripts/verifyPagedQuery.js` (+ `npm run verify:paging`)
A Node check with a fake query builder:
- 2,500 rows → all returned exactly once.
- Exactly 1,000 rows → two requests, still complete.
- 250 IDs → 3 batches.
- A count mismatch → `complete: false`.
- A page error → throws.

## 5. Database changes
None.

## 6. Order of work
1. Write `pagedQuery.js` and its verify script.
2. Convert `ScoreInput.jsx` together with E-02.
3. Convert `classRoomService.js` and `reportsService.js`.
4. Convert the remaining faculty pages, then the admin pages.
5. One change record per step, under the freeze.

## 7. Risks and mitigations
| Risk | Mitigation |
|---|---|
| More requests for very large classes | 1,000 rows per page keeps it to a few requests per class; E-09 (summaries) removes most of them later. |
| Inconsistent data if rows change between pages | Order by primary key; the grade sheet re-checks completeness (E-02). |
| Missed call sites | Search for `.from('student_activity_scores')` and the other growing tables after conversion; the verify script covers the helper itself. |

## 8. Test plan
- `npm run verify:paging` passes.
- Seed a test class with **50 students × 30 activities = 1,500 score rows**. The grade sheet, roster, and class analytics show every score; the loaded count equals `SELECT count(*)`.
- Admin User List shows every account with 1,200 seeded users (or pages correctly with server-side pagination).
- Add checklist cases (e.g., `SC-01…`) to the active test runbook when implemented.

## 9. Paper and evaluation-tool impact
None: behavior is unchanged except that results become complete. Optional: mention paged data access in the thesis's technical description if it is updated.
