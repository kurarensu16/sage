# Faculty loading: the schedule is now required

- **Date:** 2026-10-30 18:38 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migrations:** `20261030183805_require_faculty_load_schedule.sql` — **not yet applied**

Meeting days, start time and end time were optional on a faculty load
assignment. They are now mandatory at all three layers — form, service, and
database.

## Files changed

- `supabase/migrations/20261030183805_require_faculty_load_schedule.sql`
- `src/components/provisioning/FacultyLoadingWorkspace.jsx`
- `src/lib/facultyLoadingService.js`

## Why the original decision does not hold

`20261029093613` made the schedule nullable on purpose, documented in three
places as *"a college can adopt timetabling at its own pace without blocking
loading."* The problem is the first statement of `find_schedule_conflict()`:

```sql
IF p_days IS NULL OR array_length(p_days, 1) IS NULL
   OR p_start IS NULL OR p_end IS NULL THEN RETURN NULL;
```

That function is the **only** thing in the system standing between a registrar
and loading one faculty member into two classes in the same hour, or booking one
section twice. So an optional schedule did not mean "checked later" — it meant
**the check was switched off by leaving three fields blank**, and the assignment
went in with nothing able to flag the clash. The flexibility and the safeguard
were the same switch.

Worse, it failed silently in the direction that looks like success: the
assignment was accepted, so there was no signal that nothing had been verified.

## What changed

| Layer | Before | Now |
|---|---|---|
| Form (step 6) | labelled *— optional*; Add enabled with it blank | labelled *— required*; Add disabled until days + both times are set |
| Form validation | all-or-nothing: three together, or all three blank | each missing piece named: *"Pick at least one meeting day."* |
| `addDraft()` | passed `null` through when blank | refuses before the RPC, naming the missing field |
| `add_faculty_load_draft()` | went straight to the conflict check | rejects a blank schedule, a backwards time range, and an unrecognised day set |
| `faculty_load_drafts` columns | `meeting_days`/`start_time`/`end_time` **NULL** | **NOT NULL** |
| Two CHECK constraints | written as `start_time IS NULL OR …` | the `IS NULL` escapes removed |

Three layers rather than one on purpose: the form stops it before a click, the
service names the field in plain words, and the columns make it structurally
impossible for any future caller to get around.

## Deliberately left alone

- **`class_records.meeting_days` / `start_time` / `end_time` stay nullable.**
  Classes created before scheduling existed, or provisioned outside faculty
  loading, have no pattern, and making those columns `NOT NULL` would require
  inventing a schedule for every one of them. `finalize_faculty_load_draft()`
  copies the pattern onto the class it provisions, so everything coming through
  loading from here on carries one.
- **`find_schedule_conflict()`'s NULL guard stays.** It still receives rows from
  `class_records`, which may legitimately have no pattern. A guard that drafts
  can no longer trigger costs nothing.
- **The split lecture/lab limitation is unchanged.** One day set plus one time
  range per class still cannot express *lecture MW 08:00–09:00 plus lab F
  13:00–16:00*. That needs a child table of meetings, which is a migration, not
  a redesign — and it is a separate decision from this one.

## Notes on the migration

It **aborts rather than half-applying** if any existing draft has no schedule,
and says what to do about it — a draft without one cannot have one guessed for
it. The table currently holds 0 rows, so no backfill is expected.

`add_faculty_load_draft()` is **restated in full** rather than patched from its
live definition, because this inserts a block rather than substituting a string.
Drift is ruled out a different way: the migration first asserts the live body
still contains three anchor strings from `20261029093613`, so if something has
changed that function since, it aborts instead of quietly reverting the change.
The verification block then checks the new guard is present **and** that the
original checks all survived the restatement — a restated function that lost a
check would otherwise read as success.

## How to verify

As **registrar**, then as **dean**:

1. Faculty Loading → open a college → pick faculty, program, year, section,
   subject. **Add must be disabled** with step 6 blank.
2. Pick days only → still disabled. Add a start time only → still disabled.
3. Set days + both times → Add enabled, assignment drafts.
4. Set an end time at or before the start → *"The end time has to be after the
   start time."*
5. Load the same faculty member into a second class overlapping the first →
   refused, with the clash described. **This is the path that silently succeeded
   before.** Registrar sees the clashing subject and section; dean sees only the
   college and program.
6. Same for one section booked twice in the same hour.

No error message anywhere in this flow names a table, column, or constraint.

`npm run lint` 0 errors / 48 warnings (unchanged) · `npm run build` clean.
