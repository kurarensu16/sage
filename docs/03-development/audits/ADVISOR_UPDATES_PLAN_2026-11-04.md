# Capstone advisor updates — audit and implementation plan

**Date:** 2026-11-04 · **Status:** Plan, not implemented
**Source:** Capstone adviser, plus the Registrar's Office on grading-template timing
**Audit basis:** live code and migrations, read 2026-11-04

Five changes were asked for. The audit found a sixth thing missing that nobody
had noticed, and a concurrency hole that the first change makes reachable.

| | Change | Size | Asked for, or found? |
| - | ------ | ---- | -------------------- |
| 1 | Grading template: choose which term it applies to | **large** | asked |
| 2 | General Education teaching across colleges | small | asked |
| 3 | Live conflict display, before Add | small | asked |
| 4 | Multi-subject assignment and a loading summary | medium | asked |
| 5 | Rooms, and lecture vs laboratory | medium | asked |
| 6 | **The class schedule is displayed to nobody** | **small** | **found** |
| 7 | **Two colleges can double-book one section** | small | **found** |

---

## What the audit found before anything was designed

Three findings changed the shape of this plan.

**The schedule is stored and shown to no one.** `class_records` has
`meeting_days`, `start_time` and `end_time`, and nothing outside the
provisioning workspace ever displays them. The Registrar schedules every class,
conflict detection enforces it, and then no student is told when their class
meets and no instructor sees their own timetable. The data is already there;
only the display is missing. Highest value per unit of work in this batch.

**Conflict detection is already better than expected.**
`find_schedule_conflict()` checks two kinds of clash — the same faculty
double-booked, and **the same section** double-booked — across
`faculty_load_drafts` **and** `class_records` together, across every college,
server-side. First-come-first-served including drafts is therefore already the
implemented behaviour. The gap is only that it runs on Add rather than while
picking.

**Rooms genuinely do not exist.** Migration `20261029093613` is explicit:
*"Rooms are deliberately out of scope — no room exists anywhere in the schema."*
The same file records that the one-pattern-per-class model *"cannot express a
split pattern such as lecture MW"*. Both are new work, neither is half-built.

---

## 1 — Grading template: choose which term it applies to

### What is there

Templates (`grade_computations`) have **no term column**. "Applies next term" is
not a rule anywhere — it is a side effect of
`class_records.grading_formula_snapshot`, which freezes the formula when grading
begins. Existing classes keep their frozen copy; new classes pick up whatever
the template currently says.

`passing_threshold` already exists per template (`20261029054241`, nullable,
constrained 50–94) and drives the transmutation ladder, so that part is already
data rather than a constant.

`save_grade_template` already refuses structural edits to an existing template:

> *"An existing template's components cannot be added or removed; only their
> weights can change. Create a new template for a different structure."*

### What changes

Applying to the **current** term means re-snapshotting classes that are already
being graded. That is not one operation. The rule agreed with the Registrar's
Office:

| What the class has posted | What happens |
| ------------------------- | ------------ |
| Nothing | Applies. No confirmation — there is nothing to disturb. |
| **MR or TFR** | Confirmation naming the affected classes and student count. Grades recomputed, **revisions recorded**, faculty and the Dean's Office notified. |
| **SG** | **Refused from the template screen.** Routed to the Registrar override. |

### Decisions, and why

**Structure stays locked.** Only weights and the passing threshold move. This is
already enforced and is not being loosened.

**SG-posted classes are refused, not recomputed.** ASPIRE already has the
Registrar override with Dean acknowledgement, built so that one person cannot
change an official grade without a second party seeing it. A template edit that
silently rewrote hundreds of posted Semestral Grades with one Save would be a
back door around that control — larger in effect than the thing the control
exists for, with less oversight. Once a Semestral Grade is posted, that grade
stands; the override is the only route to it.

**Students are not notified.** A CHED-mandated formula change is an
institutional policy event, communicated institutionally. Several hundred push
notifications would alarm without explaining. Faculty and the Dean's Office are
told.

**But it is not silent.** Every recomputed grade is written through
`record_posted_grade_revision` carrying a reason — *"Recomputed under updated
institutional grading policy, 4 November 2026."* Visible on inspection, not
pushed. A student who sees their grade move can find out why, and the faculty
member can answer the question.

### The confirmation

> **3 classes have already posted a Midterm Rating.**
> IT213 · BSIT-2A — 13 students
> ITC113 · BSIT-1A — 13 students
> ITP113 · BSIT-1A — 13 students
> Applying now recomputes **39 posted grades**. Each change is recorded and the
> instructors and Dean's Office are notified.
> Type APPLY to continue.

---

## 2 — General Education teaching across colleges

### What is there

`fetchLoadingCatalog(departmentId, term)` filters **faculty, programs, subjects
and sections all by the same `department_id`**. A General Education instructor
can therefore only be loaded against General Education sections — which do not
exist, because General Education teaches other colleges' students.

### What changes

The per-college lock is unchanged: General Education is a college in the
dropdown and holds its own lock. What differs is the picker **inside** the
container.

| College | Picker |
| ------- | ------ |
| Any other | faculty → program → year level → section → subject → schedule |
| **General Education** | **college → program → faculty → year level → section → subject → schedule** |

The faculty is always General Education's own staff; the college and program
select whose students are being taught.

### Decisions

**Conflict detail stays redacted, for every college.** `redact_schedule_conflict`
strips the subject and section and keeps the college and program, so a dean sees
*"Technology and Engineering College for Humanity (BSIT), MWF 9:00–10:30"* and
knows who to contact without reading another college's timetable.

Lifting it for General Education was considered and rejected: one rule for every
college is simpler to explain and to defend, and the Registrar already sees
unredacted conflicts, so an escalation path exists. The boundary is between
dean's offices, not between the system and students.

The refusal copy should name that path, so the boundary is workable rather than
a dead end — *"or ask the Registrar, who can see the full timetable."*

---

## 3 — Live conflict display

`find_schedule_conflict()` already exists and is already draft-aware. This is
calling it as the picker changes rather than on Add: debounced, and only once
faculty, section, days, start and end all exist, since before that there is
nothing meaningful to check.

Shown inline under the schedule step, with Add disabled while a clash stands.
The existing `force` path stays for a deliberate override.

**The live check is advisory; Add is authoritative.** A snapshot cannot be
otherwise, and change 7 is what makes the authoritative half trustworthy.

---

## 4 — Multi-subject assignment and the loading summary

Assigning several subjects in one pass, rather than one at a time.

**Each subject needs its own schedule.** Two subjects for the same faculty and
section almost always meet at different times, so this is several rows each
carrying their own days, times, type and room — each needing its own conflict
check. Closer to "add several lines, then review" than to a multi-select.

The summary table lists, for the whole load: faculty, subject, day, start, end,
**lecture or laboratory**, and **room**. The last two depend on change 5.

---

## 5 — Rooms, and lecture versus laboratory

### Rooms

```
rooms(room_id, code, room_type, is_active)
```

`code` is the name people use — "Room 201", "Computer Lab 1". `is_active` lets a
room under renovation leave the picker without deleting its history.

**`room_type` is exactly two values, a CHECK constraint, not a lookup table.**
Lecture or laboratory. What a particular laboratory contains — computers,
nursing equipment, a simulator — is not the system's concern, and a lookup table
for it was considered and rejected as out of scope.

**Rooms are database rows, never a map in code**, consistent with how colleges,
programs and sections are already handled.

**The picker filters twice:** by type, and by availability at the chosen time.
Choosing Laboratory and Friday 1:00–4:00 offers only the labs genuinely free
then. Nothing is offered that cannot be had — which makes a room clash nearly
impossible by construction, with change 7 closing the remaining race.

That needs one new read, `aspire_available_rooms(type, days, start, end,
school_year, semester)` — the conflict query inverted to return what is free.

**Room conflict detection ships with rooms, not after.** A room column without a
third conflict check would display authoritative-looking data while two classes
sat in one room. It is the same query shape as the two that already exist.

### Lecture versus laboratory

**The type belongs on the class record, not the subject.** A subject with both
meets twice — lecture Monday/Wednesday in a classroom, laboratory Friday in a
lab — and one schedule cannot hold that. So **one subject becomes two class
records**, each with its own type, schedule and room. This is the *"cannot
express a split pattern"* limitation `20261029093613` recorded.

**One consequence.** The picker currently excludes a subject already claimed for
a section:

```js
catalog.subjects.filter((s) => !claimed.has(`${s.subject_id}|${pickSection}`))
```

That rule must loosen to *claimed for this section **with this type***, or the
laboratory could never be added after the lecture.

---

## 6 — Show the schedule to the people in it

Day, time and room on the class card, both portals:

- **Student** — My Subjects
- **Faculty** — My Classes

No schema work. The data has been stored since `20261029093613` and displayed
nowhere.

---

## 7 — Two colleges can double-book one section

### The hole

`add_faculty_load_draft` calls `find_schedule_conflict` immediately before its
insert, and a unique index on the live slot catches the same subject being
claimed twice. Neither covers **different subjects at the same time in the same
section**:

- General Education adds GE101 to BSIT-1A, MWF 9:00
- Technology and Engineering adds ITC113 to BSIT-1A, MWF 9:00

Different subjects, so the index never fires. Both call the conflict check;
under READ COMMITTED, if both run before either commits, **both see no conflict
and both insert.** The section is double-booked and nothing reports it.

The window is milliseconds — but two offices working the same section at the
same moment is precisely what change 2 introduces. Sharing sections across
colleges creates a collision that did not previously exist.

### The fix, in three parts

**Serialise on the section**, using the pattern `aspire_restore_backup` already
uses:

```sql
PERFORM pg_advisory_xact_lock(hashtext('load_section:' || p_section_id::TEXT));
PERFORM pg_advisory_xact_lock(hashtext('load_faculty:' || p_faculty_id::TEXT));
```

Taken before the conflict check, released at commit, always section then faculty
so there is no deadlock cycle. A third lock on the room once rooms exist. This
is what makes "first" mean anything.

**Refusal copy that reads as a fact, not a fault:**

> **BSIT-1A is already booked MWF 9:00–10:30.**
> The Department of General Education claimed that slot. Choose another time, or
> contact them to coordinate.

**A courtesy notice to the section's owning college.** BSIT-1A belongs to
Technology and Engineering; General Education booking into it removes a slot
from their own planning, and they should not discover that by trying to use it.

Fires **only** when the booking college differs from the section's college —
booking your own section notifies nobody. Written in the same transaction as the
draft, like the rollover notices, so a booking that commits is always reported.
Roughly twenty notices across a term's loading.

---

## Build order

| | Step | Depends on | Ship alone? |
| - | ---- | ---------- | ----------- |
| A | Schedule on class cards (6) | — | **yes** — small, visible, no schema |
| B | Advisory locks + refusal copy (7) | — | yes — closes a live hole |
| C | Live conflict display (3) | B | yes |
| D | General Education catalogue (2) | B | yes |
| E | Courtesy notice (7) | D | yes |
| F | Rooms + lecture/lab + room conflict (5) | — | yes |
| G | Multi-subject rows and summary (4) | F | no |
| H | Grading template term targeting (1) | — | no |

**A and B first.** A is the cheapest real improvement in the batch; B closes a
hole that change 2 would otherwise make reachable.

**H last, and on its own.** It touches posted grades, so it wants its own
testing pass rather than sharing one with scheduling work.

---

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Recomputing posted MR/TFR silently rewrites records | Every change through `record_posted_grade_revision` with a reason; confirmation names the classes and counts before anything moves |
| A template edit becomes a back door around Dean acknowledgement | SG-posted classes refused from the template screen; routed to the Registrar override |
| Rooms recorded but not checked | Room conflict detection ships with rooms, never after |
| Two colleges double-book a section | Advisory locks, before the conflict check |
| A college's slot taken without their knowledge | Courtesy notice to the owning college, transactional |
| Laboratory unreachable after the lecture is added | The claimed rule keys on subject **and type** |

## Still open

**Should a laboratory class refuse a non-laboratory room, or only warn?** Not
required for any step above; decide when F is built.
