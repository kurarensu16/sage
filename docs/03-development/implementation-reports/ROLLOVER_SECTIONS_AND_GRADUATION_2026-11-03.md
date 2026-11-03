# Term rollover, sections and graduation — implementation report

**Date:** 2026-11-03 · **Status:** Implemented
**Migrations:** 9 · **Deferred:** maintenance read-only
**Test guide:** [`ROLLOVER_SECTIONS_AND_GRADUATION_TEST_2026-11-03.md`](../../04-testing/ROLLOVER_SECTIONS_AND_GRADUATION_TEST_2026-11-03.md)

Everything built in this batch, shown through the situations it was built for.
Each phase ends with what to click.

| Phase | What it covers |
| ----- | -------------- |
| 1 | An intervention ends with its grading period |
| 2 | Everyone learns the term ended |
| 3 | A dispute window a student can actually use |
| 4 | Sections carry forward on their own |
| 5 | Graduation |

---

## Phase 1 — An intervention ends with its grading period

An action plan belongs to a grading period. Nothing enforced that, so a plan
written for Prelim stayed editable long after the Midterm Rating was final —
collecting work that could no longer change anyone's grade.

**What changed**

- **Finalizing a milestone closes its plans.** The database refuses every write
  to them afterwards, for student and instructor alike.
- **Two closing states, not one.** `closed_tasks_verified` and `unfinished` —
  a student who did everything must not be filed alongside one who did nothing.
- **The rollover is the backstop.** Anything never finalized closes then,
  tagged `term_rollover`.
- **Students are warned when the milestone is posted**, not when it is
  finalized — posting has a date, finalizing does not.

### Scenario · Three tasks, one finished, Prelim goes final

Her instructor gave her three catch-up tasks. She completed one, then the
Midterm Rating was finalized and her scores froze.

| | |
| --- | --- |
| **Before** | Dashboard: "Action Items Awaiting Completion · 3". Ticking a box failed silently. The count could never reach zero. |
| **After** | Plan closes as `unfinished`. Tile reads **CLOSED · Prelim period finalized**. The card explains it closed with the period and nothing further is required. |

### Scenario · All three done and verified

A second student completed every task and her instructor verified each one
before finalizing.

| | |
| --- | --- |
| **Result** | Closes as `closed_tasks_verified`. She is told she completed everything — a different message from the one above, on purpose. |

### Scenario · The instructor posts but never finalizes

One class had its Midterm Rating posted and then left open all semester.

| | |
| --- | --- |
| **Before** | The plan stayed open forever, outliving the term it belonged to. |
| **After** | The rollover closes it, tagged `term_rollover`. This is the only path that fires at rollover rather than at finalization. |

**QA.** Student dashboard after a hard reload: banner gone, tile reads CLOSED
with a padlock, and the Faculty Action Plans card must **not** say "Great job,
all completed". That wrong message was the real risk here — filtering closed
plans out of the count alone would have produced it.

---

## Phase 2 — Everyone learns the term ended

The rollover starts two clocks and archives a term's work. Faculty and deans
were told it happened. Nobody else was, and nobody was told what it meant for
them.

**What changed**

- **Instructors are told which grades they still owe** — one notice per class,
  naming the subject, the section, how many students are waiting, and the
  posting deadline in Philippine time.
- **Students are told the term ended** and, where they have a posted grade,
  that they have 22 **school** days to question it.
- **Registrar and admin** now receive the term-activated notice too.
- **Classes with an unposted grade stay visible** on the instructor's
  current-term view instead of disappearing into the archive.

### Scenario · Two classes still without a Semestral Grade

ITC113 and ITP113 both sit at `SG 0/13` when the term rolls over.

| | |
| --- | --- |
| **Before** | The rollover counted three such classes and returned the number `3`. Nobody was told whose. The instructor would find out when a student asked. |
| **After** | Two notices, one per class: "ITC113 BSIT-1A — 13 students still have no Semestral Grade. You can post until Friday, 03 December 2026." |

### Scenario · He taps the notification

| | |
| --- | --- |
| **Before** | Landed on a **404**. The link named a route that does not exist — and even at the right page the class was missing: the list loaded strictly by term, and his class belonged to the term that had just ended. |
| **After** | Lands on My Classes, where ITC113 and ITP113 appear with **Pending · SG due in 30 days** and a working **Finish Grading & Post SG**. IT213, already posted, stays archived. |

### Scenario · A student with posted grades

| | |
| --- | --- |
| **Before** | No notification of any kind. The window to challenge a grade opened and closed in silence. |
| **After** | "Your Grades Are Final Unless You Question Them" — with the exact date, the words *school days*, and a link to Grade Change Requests. |

### Scenario · A student with no posted grades

| | |
| --- | --- |
| **Result** | Gets the plain version: the term ended, her classes are closed, new ones appear once instructors set them up. No deadline she cannot use. |

**Why a database trigger, not a notification call.** The existing notifier
swallows failures into a `console.warn`. Acceptable for a line that carries no
deadline; not for one a student loses a right by missing. These notices are
written inside the rollover transaction — if the rollover committed, they exist.

**QA.** Sign in as each role after a rollover and open the bell. Instructors:
one notice per outstanding class. Students: the right one of two messages.
Registrar and admin: the term-activated line. Follow every link — none should
404.

---

## Phase 3 — A dispute window a student can actually use

Two ways a student lost the right to question a grade through no fault of their
own.

### Scenario · Her Semestral Grade arrives on day 25 of the grace period

Instructors have 30 calendar days after the rollover to post. Hers posted on
day 25.

| | |
| --- | --- |
| **Before** | The 22-working-day window counted from the rollover, so her grade appeared with its window **already expired**. Not a late dispute — no dispute, ever. It landed hardest on the students of the latest-posting instructors. |
| **After** | The clock anchors on whichever came later, the rollover or the posting. In the ordinary case nothing changes; the anchor only ever moves to extend a window. |

### Scenario · She files on day 22; the Dean reviews on day 25

| | |
| --- | --- |
| **Before** | Lateness was judged when the **Dean acted**. She was marked late for someone else's calendar. |
| **After** | Judged on when she **filed**. Filing late is still refused at the door, so the deadline still means something — but a request that started in time now finishes, however long the review takes. |

**QA.** Hardest part to test, because it needs a grade posted during the grace
period. Worth at least confirming a normal dispute still submits and the chain
reaches the Dean.

---

## Phase 4 — Sections carry forward on their own

A block section row belongs to one term, but a cohort spans an academic year and
climbs across years. Every term therefore needed its sections rebuilt by hand —
sixteen identical forms, the day this was found.

**What changed**

- **Within a school year:** carry all sections forward, same names, same
  colleges, one click.
- **Across a school year:** the ladder — `BSIT-1A → BSIT-2A` — shown before it
  runs.
- **Sections with no year above them** are listed separately rather than
  silently carried, so a graduating cohort is never put back into the same year
  level.
- **No student may be left behind.** The rollover refuses while anyone has no
  section to move into.
- **CSV import now actually imports.** It previously parsed, validated,
  reported success and wrote nothing.

### Scenario · Second semester needs its eight sections

| | |
| --- | --- |
| **Before** | "The next term has no sections." The form creates one at a time, so eight for 2nd Semester and eight for Summer meant sixteen forms — and the message pointed at a button named **Add Section** that does not exist. |
| **After** | The plan appears in the wizard: eight rows, `BSIT-1A → BSIT-1A`, unchanged because the school year has not changed. One button creates all eight with the colleges copied across. |

### Scenario · A section deleted by mistake

One section never got recreated. Eleven students are pointed at it.

| | |
| --- | --- |
| **Before** | Those students **kept their old section**, which belonged to a term that had ended. They matched no class in the new term and vanished from every roster — still active, still enrolled, invisible. The rollover reported success. |
| **After** | The wizard names each student and the section they need. **Next Step is disabled.** One button creates what is missing. There is no "continue anyway". |

### Scenario · 2026–2027 becomes 2027–2028

| | |
| --- | --- |
| **Shown first** | **Moving up:** BSIT-1A→2A, BSIT-1B→2B, BSIT-2A→3A, BSA-1A→2A, BSMARE-1A→2A… **Not carried:** any final-year section — its students stay put until marked graduated. |
| **Still manual** | New first-year sections for the incoming intake. The system cannot know how many freshmen are coming, so it does not guess. CSV import covers them in bulk. |

### Scenario · One CSV row names a college that does not exist

| | |
| --- | --- |
| **Before** | "Successfully parsed 8 section records", then Save did nothing at all. |
| **After** | Refused, listing the valid college names. **Nothing imports** — not seven of eight. A section with no college is one the rollover can never match, and nothing would report it. |

**QA.** Delete one Summer section that has students, reopen the wizard, and
confirm Next Step is disabled and the students are named. Then import a CSV with
one bad college and confirm the *good* rows were not created either.

---

## Phase 5 — Graduation

Year levels climb 1st → 2nd → 3rd → 4th. There is no fifth rung, so a student
who finished stayed a 4th year forever — on every roster, counted as having work
outstanding.

**What changed**

- **Nothing graduates automatically.** Finishing 4th year is not graduating;
  only the Registrar knows who completed their requirements.
- **Recorded on `year_level`, never `status`.** A graduate stays `active` and
  keeps every record.
- **Matched on ID number**, with a preview before anything is written.
- **One unmatched ID stops the whole batch.**

### Scenario · Twenty-eight fourth-years; twenty-five finished

Three still owe a subject. The Registrar uploads the list of twenty-five.

| | |
| --- | --- |
| **Result** | Twenty-five become `Graduated` and are each notified. The three left off stay 4th years, keep their section, and re-enrol in what they failed. |

### Scenario · One ID number is wrong in the spreadsheet

| | |
| --- | --- |
| **Result** | Red block naming the unmatched ID; the Record button stays disabled. Graduating 24 of 25 and reporting success would read as done, and the one missed would surface months later. |

### Scenario · He finished 4th year owing a third-year subject

| | |
| --- | --- |
| **Result** | Stays 4th year, keeps BSIT-4A as his home section, enrols in the third-year class — and shows as **Irregular** there automatically. Nobody sets a flag; irregular is derived from being enrolled outside your own section. |

**Why not a new status value.** `users.status` is read as `= 'active'` by the
rollover, class lists, rosters and the RLS policies. A fourth value there would
not raise an error — graduated students would simply disappear from all of them
at once. That silent shape is the one this release spent the day removing.

**QA.** Record one graduation, then check the admin user record: `year_level` is
Graduated and `status` is still active. Sign in as that student — the portal must
still work.

---

## Before QA

**Migration still to run**

```
20261103170601_mark_students_as_graduated.sql
```

The other eight from this batch are already applied. Each migration verifies
itself against the live catalog and refuses rather than half-applying.

**Back up before the Summer rollover.** `perform_semester_transition` has no
reverse. It ends the term, moves every student, archives classes and fires four
triggers. The backup is the only way back.

---

## Not in this batch

Maintenance read-only and the announced countdown — planned, documented and
deliberately deferred. See
[`MAINTENANCE_READ_ONLY_PLAN_2026-11-03.md`](../audits/MAINTENANCE_READ_ONLY_PLAN_2026-11-03.md).
