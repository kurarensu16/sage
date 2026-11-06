# Advisor updates — click-through test

**Date:** 2026-11-05 · **Status:** Current — run before the 2nd → Summer rollover
**Covers:** the five adviser changes plus the two the audit found
**Plan:** [`ADVISOR_UPDATES_PLAN_2026-11-04.md`](../03-development/audits/ADVISOR_UPDATES_PLAN_2026-11-04.md)

Run as the demo users (`DemoPassword123!`). Sections follow the build order, and
each one works on its own.

## Migrations to run, in this order

```
20261104193131_student_account_handover_batches.sql
20261104205834_first_come_first_served_actually_holds.sql
20261104210354_colleges_that_teach_across_colleges.sql
20261104210923_rooms_and_lecture_or_laboratory.sql
20261105134630_apply_a_grading_template_to_the_current_term.sql
```

Order matters in one place: `20261104210354` asserts that `20261104205834` ran,
and refuses otherwise. That is deliberate — General Education sharing sections is
what makes the double-booking race reachable, so the lock must exist first.

## Two setup steps before testing

**Mark General Education as teaching across colleges.** The flag is deliberately
not inferred from the name:

```sql
UPDATE public.departments
SET teaches_across_colleges = TRUE
WHERE name ILIKE '%General Education%';   -- confirm the name first
```

**Create a few rooms**, since none exist yet:

```sql
SELECT public.save_room(NULL, 'Room 201', 'lecture', TRUE);
SELECT public.save_room(NULL, 'Room 202', 'lecture', TRUE);
SELECT public.save_room(NULL, 'Computer Lab 1', 'laboratory', TRUE);
```

---

## 1 · The schedule is finally visible

| # | Step | Expect |
| - | ---- | ------ |
| 1.1 | Faculty → My Classes | Each card shows **MWF 9:00 AM – 10:30 AM** under the enrolment count |
| 1.2 | A class with no schedule set | **"Schedule not set"** in grey — not a blank line |
| 1.3 | Student → My Subjects | Same line on each subject card, under the instructor |
| 1.4 | | Times read in Philippine hours regardless of the device clock |

**Why 1.4 matters:** a `TIME` has no date and no zone. Formatting it through a
`Date` would silently shift a 9:00 AM class for anyone whose machine is not on
Philippine time, so it is formatted from the parts instead.

---

## 2 · First-come-first-served actually holds

### 2a. The availability panel

| # | Step | Expect |
| - | ---- | ------ |
| 2.1 | Registrar → Faculty Loading, take the lock, Assign tab | — |
| 2.2 | Pick a faculty member who already teaches | **"Already booked this term"** listing their days and times |
| 2.3 | Pick a section that already has classes | A second list under **"This section"** |
| 2.4 | Pick a free faculty member and section | "Nothing booked yet for this faculty member or section." |

### 2b. The live conflict

| # | Step | Expect |
| - | ---- | ------ |
| 2.5 | Choose days and times that clash with something in 2.2 | A red panel appears **as you type**, naming the clash |
| 2.6 | | **Add is disabled** while it stands |
| 2.7 | Change the time to something free | The panel clears, Add enables |

### 2c. The race — the point of the whole phase

| # | Step | Expect |
| - | ---- | ------ |
| 2.8 | Two browsers, two colleges, **same section, same time, different subjects** | — |
| 2.9 | Click Add in both as close to simultaneously as possible | **Exactly one succeeds** |
| 2.10 | The loser | A refusal naming the college that took the slot |

**Before this migration both would have succeeded.** Different subjects meant
the unique index never fired, and both conflict checks ran before either
committed. The advisory lock is what makes "first" mean anything.

---

## 3 · General Education

| # | Step | Expect |
| - | ---- | ------ |
| 3.1 | Faculty Loading → choose **General Education** | A step 2 appears: **"Teaching for"** |
| 3.2 | | The college list excludes General Education itself |
| 3.3 | Pick Technology and Engineering → program → year → section | BSIT sections are reachable |
| 3.4 | Choose any other college instead | **No "Teaching for" step** — the picker is unchanged |
| 3.5 | Complete a General Education assignment into BSIT-1A | Saves |
| 3.6 | Sign in as the **Technology and Engineering dean** | Notification: *"A Class Was Added to Your Section"* naming General Education |
| 3.7 | Assign within your own college | **No** such notification — booking your own section is not news |
| 3.8 | As a dean, hit a cross-college conflict | College and program named; **subject and section withheld** |

---

## 4 · Rooms, and lecture versus laboratory

| # | Step | Expect |
| - | ---- | ------ |
| 4.1 | Assign tab → Class type | **Lecture** / **Laboratory** |
| 4.2 | Lecture selected | Room list shows Room 201, Room 202 — not the lab |
| 4.3 | Switch to Laboratory | Computer Lab 1 only |
| 4.4 | Pick a time, then book a room at that time in another assignment | That room **disappears** from the list for the clashing slot |
| 4.5 | Have a room selected, then change the time so it is taken | The selection **clears itself** rather than being refused later |
| 4.6 | Add the same subject twice — once Lecture, once Laboratory | **Both are accepted** |
| 4.7 | Add the same subject twice with the **same** type | Refused — "already exists for this term" |

**4.6 is the one to watch.** Before this migration the unique index keyed on
subject and section alone, so the laboratory could never be added after the
lecture.

### 4b. The summary table

| # | Step | Expect |
| - | ---- | ------ |
| 4.8 | Scroll below the picker | **Loading summary** — faculty, subject, section, day, time, type, room, state |
| 4.9 | | Sorted by **day then start time**, not by faculty: a timetable is read in that order |
| 4.10 | An assignment with no schedule | Sorts **last**, shows `—` rather than reading as a midnight class |

### 4c. Several subjects in one pass

| # | Step | Expect |
| - | ---- | ------ |
| 4.11 | Add an assignment, then look at the picker | Faculty, program, year and **section are kept** |
| 4.12 | | **Subject and days are cleared**; times, type and room are kept |

Adding a four-subject load is now four short iterations rather than four full
passes through seven steps. Subject and days clear because an unchanged subject
or an identical slot is the one thing this screen must not make easy.

---

## 5 · Applying a grading template to the current term

**The most consequential section. Take a backup first.**

### 5a. Nothing posted

| # | Step | Expect |
| - | ---- | ------ |
| 5.1 | Registrar → Grade Computations → edit a template used by a class with no posted grades | A **"When does this take effect"** block appears |
| 5.2 | | **"From the next term"** is selected by default |
| 5.3 | Choose **"Now"** | Preview: the classes, and `0` posted ratings |
| 5.4 | Save | Applies. Snapshot re-pinned, nothing recalculated |

### 5b. MR or TFR posted

| # | Step | Expect |
| - | ---- | ------ |
| 5.5 | Edit a template used by a class with a **posted Midterm Rating**, choose "Now" | Amber preview naming the classes and the posted count |
| 5.6 | Change a component weight and save | Success message: *N class(es) updated, N posted rating(s) recalculated* |
| 5.7 | Faculty → notifications | *"Grading Formula Updated"*, naming their class |
| 5.8 | Dean → notifications | One summary with the totals |
| 5.9 | **Student → notifications** | **Nothing.** By design |
| 5.10 | Check the student's grade | It moved, under the new weights |

```sql
-- Every change is attributable
SELECT grade_period, revision_number, computed_grade, official_source, recorded_at
FROM posted_grade_revisions
WHERE official_source = 'policy_update'
ORDER BY recorded_at DESC;
```

### 5c. SG posted — the refusal

| # | Step | Expect |
| - | ---- | ------ |
| 5.11 | Edit the template used by **IT213**, whose Semestral Grade is posted, choose "Now" | **Red** preview: *"N class(es) already have a posted Semestral Grade"* |
| 5.12 | Save anyway | **Refused**, naming the class and pointing at the Registrar override |
| 5.13 | Check that class's grades | **Unchanged** — nothing partially applied |

**Why a refusal and not a warning.** ASPIRE already has a control for changing
an official grade: the Registrar override, with Dean acknowledgement. A template
edit rewriting hundreds of Semestral Grades with one click would be a larger
action than that control governs, with nobody watching. The template screen must
not become a way around it.

### 5d. The guard still guards

```sql
-- Should FAIL: 'A grading formula snapshot is immutable after it is established.'
UPDATE class_records
SET grading_formula_snapshot = '{"version":1}'::jsonb
WHERE grading_formula_snapshot IS NOT NULL
LIMIT 1;
```

The guard admits exactly one reason — a transaction that has declared itself a
policy application — and only `aspire_apply_template_to_term` sets that flag.
If this `UPDATE` succeeds, the protection is gone and that is a stop-everything
finding.

---

## Not covered here

Maintenance read-only and the announced countdown — planned, not built. See
[`MAINTENANCE_READ_ONLY_PLAN_2026-11-03.md`](../03-development/audits/MAINTENANCE_READ_ONLY_PLAN_2026-11-03.md).
