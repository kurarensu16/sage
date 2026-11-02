# One activity loader for the gradebook, and Posted Grades renamed

**Date:** 2026-10-31 18:54 (Philippine time)
**AI tool:** Claude Code (Opus 5)
**Approved by (device owner):** ghostbyte1014 <ghostbyte1014@gmail.com>
**Type:** Fix, and Polish

## Files changed

- `src/lib/classRoomService.js`
- `src/pages/faculty/ScoreInput.jsx`
- `src/pages/faculty/PostedGradesView.jsx`
- `src/components/faculty/ClassWorkflowNav.jsx`

## The bug: six activity columns for a class that had none

The Scorebook showed **one** activity column for IT213 · BSIT-1A. Posted Grades
showed **six**, named FA 1 to FA 6.

Neither number came from the class. The class has no activities at all.

- `ScoreInput` renders a single empty placeholder slot for an unconfigured
  period. That was the one column.
- `PostedGradesView` initialised `activities` to a hard-coded six slots and then
  tried to replace them from **three** sources in turn: the COG template's
  `is_multiple` components, the `class_activities` table, then a
  `localStorage` cache. With no activities and no cache, all three missed and
  the hard-coded default showed through.

Two screens reconstructing the same list from different code will disagree, and
here they disagreed out loud about something as basic as how many columns a
class has.

## The fix

`loadClassActivities(classRecordId, semester)` in `classRoomService.js` is now
the only place that answers the question, and both pages call it. An
unconfigured period returns exactly **one** empty placeholder, never six — the
number of activities is the instructor's to decide, and a gradebook should not
invent five columns nobody asked for.

Removed with it:

- The hard-coded `FA 1`–`FA 6` initial state.
- The `localStorage` fallback in both pages. Caching gradebook **structure** per
  browser is precisely how a screen came to show columns the class did not have.
  An empty period is honest and a reload fixes it.
- `PostedGradesView`'s COG-components branch, which seeded activity columns from
  template components — a different thing wearing the same shape.

Summer is handled by the loader (`Midterm`, `Final`) rather than by each caller,
which `ScoreInput` had only got right in its error path.

`fetchedDbActs`, still needed downstream for loading scores, is rebuilt from the
loader's output instead of a second query. Placeholder slots carry no `dbId` and
are skipped.

## Renames

"Posted Grades **& Corrections**" claimed the whole correction workflow while
owning one narrow slice of it. Now:

| Was | Now |
|---|---|
| `Posted Grades & Corrections` (page header, `ClassWorkflowNav`) | **Posted Grades** |
| `Class Record Registry & Remark Management` | **Posted Grade Ledger** |

## What was considered and deliberately not done

Moving "Request SG Correction" out of the gradebook into Grade Change Requests
was proposed, agreed, scoped — and then dropped, because the audit showed the
two flows are **different by design**, not by accident:

```sql
ADD COLUMN submitted_by_role VARCHAR(10) DEFAULT 'faculty'
  CHECK (submitted_by_role IN ('student', 'faculty'))
```

Both write to `remark_override_requests`. A **student**-raised dispute starts at
`pending_faculty_review`, so the instructor screens it before the Dean sees it. A
**faculty**-raised correction starts at `pending`, straight to the Dean — because
an instructor cannot screen their own request without reviewing themselves. The
status CHECK permits both vocabularies on purpose, and the one-open-dispute index
is scoped `WHERE submitted_by_role = 'student'` so the two cannot collide.

Relocating the faculty entry point next to the student queue would imply one
route where there are deliberately two. The separation is a separation-of-duties
property worth defending, not an inconsistency to tidy away.

## Verification

`npm run lint`: 0 errors, **47 warnings** — one fewer than the 48 baseline, since
the dead `localStorage` branch went with it. `npm run build` passes.
`verify:grading` and `verify:excel-export` both pass.

One error was caught during the work: the new loader's `.map(` was left unclosed,
which ESLint reported as a parse error before anything ran.

`PostedGradesView.jsx` is LF at HEAD, not CRLF; its line endings were preserved
rather than normalised.
