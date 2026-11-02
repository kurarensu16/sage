# Faculty Loading & Provisioning — shared workspace checklists

**Introduced by:** Phase 4 (Faculty Loading and Provisioning), 2026-10-29
**Prerequisite:** migration `20261029093613_faculty_loading_and_provisioning.sql`
applied, plus an active row in `academic_terms`.

The workspace is one shared component,
[`src/components/provisioning/FacultyLoadingWorkspace.jsx`](../../../src/components/provisioning/FacultyLoadingWorkspace.jsx),
rendered by two page files that each declare their own scope:

| Portal | Route | Page file | Scope |
|---|---|---|---|
| Registrar | `/registrar/facultyloading` | `src/pages/registrar/FacultyLoadingAndProvisioning.jsx` | any college |
| Dean | `/dean/facultyloading` | `src/pages/dean/FacultyLoadingAndProvisioning.jsx` | own college only |

The cases below cover behaviour that is **identical in both portals**, so they
live here once instead of being copied into each portal file. The scope-specific
cases live in `REG-LOADING` and `DEAN-LOADING`. Run this file **twice** — once
signed in as registrar, once as dean — and note which pass under which role.

> **Before running anything:** restart the dev server (`npm run dev`, port
> **5175**). Two browser profiles or an incognito window are needed for the lock
> cases, because they require two users signed in at once.

---

## College lock (editing is exclusive per college)

**ID:** `LOAD-LOCK` · **Last touched by:** Phantom lock fix, 2026-10-30

The lock is advisory and per college, held in `provisioning_locks`, refreshed by
a 60-second heartbeat, and allowed to lapse by TTL when a tab closes or crashes.

- [ ] Choosing a college shows no lock banner and the Assignment tab is editable.
      **This is the one that was broken.** Every college showed "another user is
      editing" because `acquire_provisioning_lock()` rolled back on a 42P10 from
      the notification it fires, and the UI read "not acquired" as "someone else
      has it". Check it as **registrar and as dean** — both portals share the
      component and the RPC.
- [ ] An acquire failure for any *other* reason shows the real error, not the
      holder banner. The lock state is tri-state now (`pending` / `mine` /
      `theirs`); only `theirs` may claim a colleague holds the college.
- [ ] With user A holding a college, user B opening the **same** college sees the
      lock banner naming the holder, and every editing control is disabled —
      not merely hidden.
- [ ] User B can still **read** the Load Summary for that college while locked out.
- [ ] User B opening a **different** college is unaffected.
- [ ] User A navigating away releases the lock; user B can acquire it after a refresh.
- [ ] User A closing the tab without navigating (simulating a crash) lets the lock
      lapse within its TTL, after which user B can acquire it. This is the case
      that matters most: a lock that never lapses strands a college.
- [ ] While user A is idle but the tab is open, the heartbeat keeps the lock — user
      B must still be blocked after two minutes.
- [ ] The lock banner wording is plain English and names no table or function.

---

## Scheduling (day-of-week and time, one pattern per class)

**ID:** `LOAD-SCHED` · **Last touched by:** Schedule requirement, 2026-10-30

Scheduling is **required**. It was optional until 2026-10-30, which meant
`find_schedule_conflict()` returned early and the assignment went in with
nothing able to flag a clash — the flexibility and the only double-booking
safeguard were the same switch. Rooms remain out of scope.

- [ ] **Add stays disabled** while step 6 is blank, even with faculty, section
      and subject all chosen.
- [ ] Days only → still disabled. A start time only → still disabled. Both times
      but no days → still disabled.
- [ ] Days + start + end → Add enables and the assignment drafts.
- [ ] Step 6 is labelled **required**, not optional.
- [ ] Day buttons offer Mon–Sat. There is no Sunday.
- [ ] An end time at or before the start time is refused: *"The end time has to
      be after the start time."*
- [ ] Each missing piece is named in plain English — *"Pick at least one meeting
      day."* — not reported as one generic "fill in the schedule".
- [ ] A saved schedule reads back in the Load Summary as entered.
- [ ] One pattern per class: there is no way to add a second day/time block to the
      same class. (Confirmed design decision — a lab with a different schedule is
      a separate class, not a second block on this one.)
- [ ] After a successful Add, the **times stay** and the **days clear**, so the
      next subject for the same faculty member needs a deliberate day choice.
- [ ] No message in this flow names a table, column, or constraint.

> Database-side, `faculty_load_drafts.meeting_days`, `start_time` and `end_time`
> are `NOT NULL`, so this cannot be bypassed by any caller. `class_records`
> keeps them nullable for classes that predate scheduling or were provisioned
> outside loading.

---

## Schedule conflict detection and redaction

**ID:** `LOAD-CONFLICT` · **Last touched by:** Schedule requirement, 2026-10-30

Every assignment now carries a schedule, so **this check runs on every one of
them**. Before 2026-10-30 a blank schedule skipped it silently, which is the
condition to re-test first: the overlapping load that used to be accepted must
now be refused.

Detection is **institution-wide** — general-education subjects are taught across
colleges, so a conflict confined to one college would miss the real clashes. What
the user is *told* about the conflict differs by role: `redact_schedule_conflict()`
strips `subject_code` and `section_name` for everyone who is not an active
registrar.

- [ ] A faculty member already teaching Mon 08:00–09:30 cannot be given a second
      overlapping load, even when the second load is in a **different** college.
- [ ] Touching schedules that do **not** overlap (one ends exactly when the other
      starts) are allowed.
- [ ] A conflict on a different day is allowed.
- [ ] A conflict in a different term (`school_year` / `semester`) is allowed.
- [ ] **Registrar** sees the full conflict: college, program, days, time, subject
      code and section name.
- [ ] **Dean** sees college, program, days and time, but **no** subject code and
      **no** section name.
- [ ] **Security:** the redaction happens in the data function, not the message
      text. A dean calling `find_schedule_conflict()` directly (browser console,
      `supabase.rpc`) must still get the stripped payload. If the specifics come
      back, the redaction is in the wrong layer.
- [ ] Editing an existing load does not report that load as a conflict with itself
      (`p_exclude_draft` / `p_exclude_class`).
- [ ] The conflict message is plain English and names no table or column.
- [ ] A **section** booked twice in the same hour is refused too, not only a
      double-booked faculty member.

---

## Load drafts, finalize, reassign

**ID:** `LOAD-DRAFT` · **Last touched by:** Phase 4

- [ ] A new assignment lands as a **draft** and is visibly marked as not yet final.
- [ ] Load Summary counts drafts separately from finalized loads.
- [ ] Finalize one converts a single draft into a class record.
- [ ] Finalize all converts every open draft for the chosen college and term.
- [ ] Finalize is disabled while the lock is not held.
- [ ] Reassigning a load to another faculty member re-runs conflict detection
      against the **new** faculty member, not the old one.
- [ ] A superseded draft no longer counts toward load or conflicts.
- [ ] Every finalize and reassign writes an audit log entry naming the actor.
- [ ] Export to Excel downloads and the sheet matches what the Load Summary shows.

---

## Class roster (adding a student to a finalized class)

**ID:** `LOAD-ROSTER` · **Last touched by:** Phase 4

- [ ] Opening the roster dialog lists the students currently enrolled in that class.
- [ ] Adding a student outside the block section succeeds — this is the irregular
      and cross-section case the enrollment cards count.
- [ ] Adding a student who is already enrolled is refused without creating a
      duplicate.
- [ ] Adding a non-student account is refused.
- [ ] Errors read as plain English.
