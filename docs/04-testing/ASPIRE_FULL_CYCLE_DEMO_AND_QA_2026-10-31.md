# ASPIRE — full-cycle demo script and QA master checklist

**Date:** 2026-10-31 · Revised in full 2026-10-31.

One cycle, run **twice**: once to find bugs, once to present. Every stage below
is tagged either **DEMO** — it is in the twenty minutes the panel sees — or
**QA only** — it is claimed by an objective but has no place in a timed
walkthrough. Read the whole thing top to bottom for pass A; read only the DEMO
stages for pass C.

---

## Start here — the route for today

Pass A is one continuous run-through in the order printed. Do not jump around:
each stage leaves behind what the next one needs.

1. **Pre-flight** below — get the repo green before testing a running system.
2. **The starting state** — run the query, confirm the table still matches.
3. **The cycle**, Stage 0 to Stage 12, in order. Tick `ok` or `bug` on every
   check, including the QA-only ones.
4. **Pass B** — the rollover. Back up first.
5. Then, and only then, **Pass C** preparation.

**Find bugs on one class; build the archive on four.** Stages 3 to 9 all run on
a single class, so walk **one** end to end and fix what breaks before loading
another — otherwise the same bug is met four times. Once the cycle is known to
work, the archive target is **four classes in the Technology college**:

All four on **BSIT-1A** (12 students), measured from the live catalogue
2026-10-31. Provision them in this order through Stage 2:

| # | Faculty                                              | Subject                                | Days    | Time         |
| - | ---------------------------------------------------- | -------------------------------------- | ------- | ------------ |
| 1 | **Rivera, Amanda** · `a.rivera@sage.edu.ph` | `ITC113` Introduction to Computing   | Mon/Wed | 08:00–09:30 |
| 2 | **Rivera, Amanda**                             | `ITP113` Introduction to Programming | Tue/Thu | 08:00–09:30 |
| 3 | **Cruz, Marcus** · `m.cruz@sage.edu.ph`     | `IT213` Discrete Mathematics         | Mon/Wed | 10:00–11:30 |
| 4 | **Cruz, Marcus**                               | `ITP123` Intermediate Programming    | Tue/Thu | 10:00–11:30 |

**Two professors with two classes each, one section carrying all four**, which is
what makes the student side real: four subjects on the dashboard, a GWA computed
across four of them rather than restating one, and a risk score with somewhere to
vary. All twelve BSIT-1A students get four classes from this, so no extra
enrolment work is needed.

The slots are chosen so nothing clashes: each professor's two classes share no
day, and the section's two Mon/Wed classes sit 08:00–09:30 and 10:00–11:30. Four
non-overlapping slots are **required**, because the Stage 2 section-clash check
applies to your own seeding and not only to the demo.

**`DSA123` Data Structures and Algorithms is deliberately left unassigned** — it
is the subject to attempt the Stage 2 refusals with, repeatedly and harmlessly:

| Attempt                                                                          | Expect                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `DSA123` · **Rivera** · BSIT-1A · **Mon 09:00–10:30**          | **faculty clash** — overlaps her ITC113             |
| `DSA123` · **Navarro, Victor** · BSIT-1A · **Mon 08:30–10:00** | **section clash** — BSIT-1A already has ITC113 then |

**Two things the catalogue decided for you.** All five TECH subjects point at the
same COG template, `General Education Core` — Character Rating 10 (max 100),
Class Standing (Formative) 50 (max 20, multiple), Major Examination 40 (max 40).
So template *variety* is demonstrable across colleges, not inside this one; say
"this college's subjects use the Gen-Ed Core template" rather than implying a
choice was made per class. And `fda_absence_threshold` is null on all five, so
Stage 4b's attendance threshold is the policy default of **4**.

Remaining TECH capacity if you want more backdrop later: **BSIT-1B** (10),
**BSIT-2A** (10), **BSIT-2B** (10), and two unused faculty — Delos Santos, Elena
and Navarro, Victor.

**When something breaks:** tick `bug`, write what the screen did, and carry on.
Only stop if the failure makes everything downstream untestable — a class that
will not provision, for instance. More coverage per run means fewer runs.

---

## How to tick these boxes

Every check has two:

```
- [ ] ok  [ ] **bug** — Account appears in the list, role **student**.  ·  _note:_
```

Tick **ok** and move on, or tick **bug** and type after `_note:_` — what you saw,
not what you expected. One line is enough:

```
- [ ] ok  [x] **bug** — Account appears in the list, role student.  ·  _note:_ saved
  but role shows "faculty" in the list, correct on the profile page
```

If it needs more room than a line — steps to reproduce, an error code, a
screenshot — give it an ID in the **bug log** at the end and put `see B-03` in
the note. Send me the note text and I will trace it; the note is the whole
handover, so write what the screen actually did.

---

## Pre-flight — get the repo green first

A failing script is cheaper to read than a failing screen, and a red baseline
makes every later bug ambiguous. Run these before signing in to anything.

- [X] ok  [ ] **bug** — `npm run lint` — baseline is **0 errors, 47 warnings** (48 until a dead
  localStorage branch went with the activity-loader fix). Errors are new.  ·  _note:_
- [X] ok  [ ] **bug** — `npm run build` succeeds.  ·  _note:_
- [X] ok  [ ] **bug** — `npm run verify:grading` · `verify:csv` · `verify:excel-export` ·
  `verify:insights` all pass.  ·  _note:_
- [X] ok  [ ] **bug** — `npm run verify:ai-privacy` · `verify:sg-correction` ·
  `verify:grade-posting-p0` · `verify:audit-timezone` all pass.  ·  _note:_
- [X] ok  [ ] **bug** — `node scripts/verifyEvaluationTracking.js` and
  `node scripts/verifyEvaluationReferrals.js` pass.  ·  _note:_
- [X] ok  [ ] **bug** — Dev server starts on **5175**.  ·  _note:_
- [ ] ok  [ ] **bug** — **Every migration pass A depends on is applied.** Six were written during
  this pass and the owner runs them by hand, so a stage can fail for no reason
  other than its migration never having been run. This returns one row; every
  value must be `true`:  ·  _note:_

  ```sql
  SELECT jsonb_pretty(jsonb_build_object(
    'milestone_freeze_trigger', EXISTS (SELECT 1 FROM pg_trigger
       WHERE tgname = 'trg_block_frozen_term_scores'),
    'frozen_terms_fn',       to_regprocedure('public.aspire_frozen_terms(uuid)') IS NOT NULL,
    'task_evidence_rpc',     to_regprocedure('public.set_advising_task_completion_with_evidence(uuid,text,boolean,text,text,text,bigint)') IS NOT NULL,
    'task_evidence_read_fn', to_regprocedure('public.aspire_can_read_task_evidence(text)') IS NOT NULL,
    'task_evidence_policy',  (SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
       WHERE polname = 'grade_evidence_read'
         AND polrelid = 'storage.objects'::regclass) LIKE '%aspire_can_read_task_evidence%',
    'registrar_can_read',    pg_get_functiondef('public.can_read_student_class_record(uuid,uuid)'::regprocedure)
                               LIKE '%is_active_registrar%',
    -- Not from today's migration: 20261029040940 re-pointed this gate. Checked
    -- here because the Registrar's override silently depends on it.
    'registrar_can_override', pg_get_functiondef('public.apply_admin_grade_override_v3(uuid,uuid,numeric,numeric,text,text)'::regprocedure)
                               LIKE '%is_active_registrar()%',
    'dean_told_of_override',  EXISTS (SELECT 1 FROM pg_trigger
       WHERE tgname = 'trg_notify_dean_of_override'),
    'dean_can_acknowledge',   to_regprocedure('public.acknowledge_grade_override(uuid,text,text)') IS NOT NULL
  )) AS migrations_applied;
  ```

There is no test framework and no typecheck in this repo; these scripts are the
whole automated layer, which is why pass A matters so much.

---

## The plan

The same full cycle runs on two semesters. **1st semester 2026–2027** is the QA
pass: untimed, thorough, every box ticked, bugs found and fixed. Running it is
what **creates the archive** — it is not preparation for the demo, it *is* the
first semester's history. The term then **rolls over**, and **2nd semester
2026–2027** is what the panel sees: the same cycle again, start to finish, in
twenty minutes, now standing on a real prior term.

| Pass        | Term                      | Purpose                                    | Timed     |
| ----------- | ------------------------- | ------------------------------------------ | --------- |
| **A** | 2026–2027 **1st**  | QA. Find bugs. Produce the archive         | no        |
| **B** | —                        | **Term rollover**, itself a test     | no        |
| **C** | 2026–2027 **2nd**  | The defense demo                           | **20:00** |
| **D** | —                        | **Rollover into Summer**             | no        |
| **E** | 2026–2027 **Summer** | The Summer term, and Objective 8           | no        |

D and E sit **after the defense**, deliberately. Summer is in the Scope and in
Objective 2, but it is not in the twenty minutes — and rolling into it before
Pass C would move the ground the rehearsal stands on. The hierarchy follows the
calendar: 1st semester, rollover, the room, rollover, Summer.

### What running A first buys you in C

None of these can be demonstrated from a single semester, and several are
promised in the paper's Scope:

- **Academic archives.** Previous Terms becomes a real, populated, read-only
  view instead of an empty one. The paper documents it; without pass A there is
  nothing behind it.
- **Term rollover and next-term readiness**, including the SG grace period.
- **AI Study Advising plan archiving.** `aspire_archive_tutor_plans_on_rollover()`
  fires when `perform_semester_transition()` sets `ended_at`. A plan written in
  1st semester visibly becomes archived. With one semester this trigger can
  never be seen to do anything.
- **Cumulative GWA across terms**, rather than a single term's average.
- **A closed dispute window on 1st-semester classes**, which is the only way the
  Registrar's late-grade-change authority can be shown — available if the panel
  asks, even though the script scans past it.

### Why this document exists

The Capstone 1 panel's objection was that the walkthrough showed *pieces* —
grading, then something else — rather than the process the objectives describe.
That happened because the existing checklists are organised by **page**, which
mirrors the sidebar and not the process. A tour of screens reads as a tour of
screens.

This runs the other way: **one continuous cycle, from signing in to correcting a
posted grade**, in the order the system actually enforces. Every stage names the
Specific Objective it answers, so the panel can follow the paper and the screen
at the same time.

> The per-page checklists in [`page-checklists/`](page-checklists/) are **not
> replaced**. They answer a different question — whether each page handles its
> own edge cases — and they stay as the depth layer behind this one. Run this
> first; drop into a page checklist when something here fails.

---

## The one idea the demo should leave behind

Two mechanisms, one design:

| Milestone                           | What a disagreement costs                                                                              | Why                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **Midterm / Tentative Final** | a conversation. Window opens on posting, faculty may still revise the scores behind it, then finalises | it is a **progress** reading  |
| **Semestral Grade**           | a formal dispute: required evidence, instructor, then Dean                                             | it is the **official record** |

This is enforced in the schema, not merely in the interface:

```sql
grade_period TEXT NOT NULL
  CHECK (grade_period IN ('midterm_rating', 'tentative_final_rating'))
```

A semestral grade **cannot** have a consultation window opened for it by any
code path. If a panelist asks why the two differ, that constraint is the answer.

---

## The starting state

Declare what is already in the system, so nobody wonders what was prepared.
Run this and fill the table — one row returned, so the free-tier 100-row cap
does not apply:

```sql
SELECT jsonb_pretty(jsonb_build_object(
  'colleges',      (SELECT count(*) FROM departments),
  'programs',      (SELECT count(*) FROM programs),
  'subjects',      (SELECT count(*) FROM subjects),
  'cog_templates', (SELECT count(*) FROM grade_computations),
  'sections',      (SELECT count(*) FROM sections),
  'terms',         (SELECT jsonb_agg(jsonb_build_object('sy', school_year,
                      'sem', semester, 'active', is_active, 'ended_at', ended_at)
                      ORDER BY school_year, semester) FROM academic_terms),
  'users_by_role', (SELECT jsonb_object_agg(role, n) FROM
                      (SELECT role::TEXT AS role, count(*) n FROM users GROUP BY role) r),
  'classes',       (SELECT count(*) FROM class_records),
  'enrollments',   (SELECT count(*) FROM enrollments),
  'posted_grades', (SELECT count(*) FROM posted_grades)
)) AS starting_state;
```

Measured **2026-10-31**:

| Already in the system                  | Count                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Colleges                               | **10**                                                              |
| Degree programs                        | **26**                                                              |
| Subjects                               | **12**                                                              |
| COG templates                          | **5**                                                               |
| Sections                               | **8**                                                               |
| Active term                            | **2026–2027, 1st semester** (not yet ended)                        |
| Accounts                               | **1 admin · 1 registrar · 10 deans · 40 faculty · 64 students** |
| Classes · Enrolments · Posted grades | **0 · 0 · 0**                                                     |

**Zero classes, zero enrolments, zero posted grades is the correct starting
point**, not a gap. Academic setup is complete and all 116 accounts exist; the
transactional data is what **pass A produces**.

[`TEST_YEAR_SEED_2026-2027.md`](../05-operations/database/TEST_YEAR_SEED_2026-2027.md)
has been waiting on exactly these two stages, and pass A is them:

| Stage in that guide                 | What                                              | Covered by          |
| ----------------------------------- | ------------------------------------------------- | ------------------- |
| **1b** Create 8 classes       | **To do** — "class check returned no rows" | pass A, stages 2–3 |
| **1c** Grade the 1st semester | **Not started**                             | pass A, stages 4–9 |

Update that guide's progress table as pass A completes, so the two documents do
not drift.

**Say this out loud in the room, once:** *"Academic setup — colleges, programs,
subjects, grading templates, sections and the term — is already configured, the
way it would be at the start of any semester. Everything from this point is
live."* That single sentence turns pre-seeding from something to hide into
something to state.

### How the two passes differ

|         | **Pass A** — QA, 1st semester                                | **Pass C** — demo, 2nd semester                       |
| ------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| Pace    | untimed; stop and investigate                                       | 20:00, no stopping                                           |
| Stages  | **all of them**, including QA-only                            | the **DEMO**-tagged ones only                          |
| Classes | **one** proves the cycle, then **four** for the archive | **two**: one provisioned live, one pre-scored          |
| Scores  | all four milestones entered                                         | pre-entered through Semi-Final; **Final entered live** |
| Boxes   | tick every one; log every failure                                   | boxes are a rehearsal aid                                    |
| Bugs    | the point                                                           | there should be none left                                    |

**Why pass C needs two classes.** Stage 2 provisions a class live, to show
loading and its refusals. Stages 4–9 then run on a *different* class carrying
scores already, because entering four milestones live costs more than the whole
twenty minutes. One honest sentence covers it: *"This class was loaded at the
start of the semester, like the rest of them."* A registrar loads dozens; showing
the mechanism once and then working on an existing class is what actually happens.

**Keep the demo class small.** 8 sections across 64 students is roughly 8 per
section. Do not demo on a 64-student roster — the Scorebook and posting views
become unreadable on a projector.

### Dispute windows differ between the passes — deliberately

- **Pass A, 1st semester, while active:** `ended_at` is null, so
  `aspire_dispute_window_open()` returns true by its `COALESCE` and the **Dean**
  decides. That is the path Stage 9 tests.
- **After rollover:** 1st-semester classes have an `ended_at`. Once the deadline
  passes, the window is **closed** and a request routes to the **Registrar**
  instead. See Stage 9b for how to reach that state without waiting.
- **Pass C, 2nd semester, active:** window open again, Dean decides directly.
  One sentence in the room, then move on.

---

## The cycle

Stages run in the order printed. **DEMO** stages total **20:00** of speaking
time; see the budget under Pass C. **QA only** stages are not in the demo and
have no time target — they are the objectives the twenty minutes cannot reach.

---

### Stage 0 — Signing in, and the password rules · Public · QA only

**Objective 1** — the Scope names three public-portal flows by name, and none of
them fits a timed walkthrough. All three are claimed by the paper.

- [X] ok  [ ] **bug** — **Role-based login** routes each of the five roles to its own portal.  ·  _note:_
- [X] ok  [ ] **bug** — An **inactive** account is refused, with a plain-English reason and no
  table names or error codes.  ·  _note:_
- [ ] ok  [ ] **bug** — **First login** on a newly created account forces a password change before
  anything else loads.  ·  _note:_
- [X] ok  [ ] **bug** — The password rules reject each failure on its own: under 8 characters, no
  uppercase, no lowercase, no digit, no symbol.  ·  _note:_
- [X] ok  [ ] **bug** — **Forgot password** sends an **8-digit code** to the institutional email,
  the code expires, and "sign out other sessions" works. **This needs SMTP
  enabled in Supabase** — if it is not yet, note that here rather than guessing,
  and treat it as a known pending item.  ·  _note:_

> In the room this becomes one sentence while the first portal loads: *"Five
> roles, five portals, one login that routes by role."* Nobody wants to watch
> five sign-ins.

---

### Stage 1 — An account exists before anything else · Admin · DEMO 1:30

**Objective 1**

- [X] ok  [ ] **bug** — Sign in as **admin**. Note the portal holds accounts and system
  maintenance only — academic setup belongs to the Registrar.  ·  _note:_
- [X] ok  [ ] **bug** — **Manage Users → create one student**: name, email, ID number, department,
  section. Say that identity fields are administrator-maintained; the student
  may later change only a photo and a contact number.  ·  _note:_
- [X] ok  [ ] **bug** — The account appears in the list, role **student**.  ·  _note:_

Put this student in the section you are about to load — they are the one added
to the roster by hand in Stage 3.

> *Why first:* nothing downstream can happen without an account. This is the
> system's zero.

---

### Stage 1b — The same job in bulk · Admin · DEMO optional 1:30

**Objective 1** · the clearest demonstration of validation in the system

[`import-fixtures/ASPIRE_Import_Users_DEMO.xlsx`](import-fixtures/ASPIRE_Import_Users_DEMO.xlsx)
— **13 rows: 1 ready · 3 already exist · 9 refused**, one per reason. Its second
sheet, `Expected outcome`, says what each row should do and gives a sentence to
say about it; the importer reads **sheet 1 only**, so that crib never reaches the
system.

- [X] ok  [ ] **bug** — **Manage Users → Import** → upload the workbook. The preview classifies
  every row **before** anything is written.  ·  _note:_
- [X] ok  [ ] **bug** — **1 ready** — *Santos, Liam*: college, section, year level and ID format all
  agree.  ·  _note:_
- [X] ok  [ ] **bug** — **3 already exist** — shown as a *conflict*, not an error: *"will update if
  overwrite enabled."* Two students and one faculty member, and the blank
  Section on the faculty row still passes.  ·  _note:_
- [X] ok  [ ] **bug** — **9 refused**, each carrying its reason on the row. The one to narrate:
  *Reyes, Juan* — `BSIT-1A` is a **real** section, but he is listed under the
  College of Accountancy. A section matches on name, college, school year
  **and** semester — four conditions, not a spelling test.  ·  _note:_
- [X] ok  [ ] **bug** — Confirm → **only the ready row is created**. Nothing was written before you
  confirmed, so a mixed file cannot half-import.  ·  _note:_
- [X] ok  [ ] **bug** — Paste `Cruz,Marco,m.cruz@dyci.edu.ph` into the **CSV text box** →
  *insufficient columns*. A spreadsheet cannot produce this one: it pads every
  row to the full column count, so a short row still arrives with all ten.  ·  _note:_

> Two things to say before a panelist asks. A **blank College** on an admin or
> registrar row is correct — those roles are institution-wide. A **blank ID
> Number** is not an error; it is generated with a role prefix: `ADM-`, `FAC-`,
> `DN-`, `REG-`, and none for students.

**Optional in the room.** It costs 1:30, which the budget does not have spare —
see the cut table under Pass C for what it displaces. Mandatory in pass A.

---

### Stage 1c — The other two importers · Registrar · QA only

Same preview, same three states, on the Registrar side. In the demo, say the
pattern is identical rather than showing it three times.

- [X] ok  [ ] **bug** — **Subjects → Import** →
  [`ASPIRE_Import_Subjects_DEMO.xlsx`](import-fixtures/ASPIRE_Import_Subjects_DEMO.xlsx)
  → 1 ready · 2 exist · 1 refused.  ·  _note:_
- [X] ok  [ ] **bug** — **Manage Sections → Import** →
  [`ASPIRE_Import_Sections_DEMO.xlsx`](import-fixtures/ASPIRE_Import_Sections_DEMO.xlsx)
  → 1 ready · 2 exist · 1 refused. The ready row creates **BSIT-3A**.  ·  _note:_

> Section rows are matched against the **active** term. These files were built
> for 2026–2027 1st semester, so after the Pass B rollover every section row
> fails — regenerate them before pass C. See
> [`import-fixtures/README.md`](import-fixtures/README.md).

---

### Stage 2 — Assigning a teacher to a class · Registrar · DEMO 3:00

**Objective 1** · the strongest thirty seconds in the demo

- [X] ok  [ ] **bug** — Sign in as **registrar** → **Faculty Loading & Provisioning**.  ·  _note:_
- [X] ok  [ ] **bug** — Open a college. The banner is absent — editing is **exclusive per college**,
  so two registrars cannot load the same college at once.  ·  _note:_
- [X] ok  [ ] **bug** — Pick faculty → program → year → section → subject.  ·  _note:_
- [X] ok  [ ] **bug** — **Attempt to add with no schedule.** Refused — **Add** stays disabled and
  each empty field says what it wants. Say why: the conflict check has nothing
  to work with, so an assignment without a schedule is an assignment nothing
  can verify.  ·  _note:_

**Both refusals come from drafts, so one class is all you need.**
`find_schedule_conflict()` unions `faculty_load_drafts` with `class_records`, so
a draft that was never finalized already blocks the next one. Add three drafts,
finalize one:

- [X] ok  [ ] **bug** — **Draft 1** — faculty F, section S, subject X, a clear slot such as
  **Mon/Wed 08:00–09:30** → **Add** succeeds. The draft is not visible to
  students.  ·  _note:_
- [X] ok  [ ] **bug** — **Draft 2 · faculty clash** — **same faculty F**, a *different* section and
  subject, **Mon 08:30–10:00** → refused, naming draft 1's subject, section,
  days and time.  ·  _note:_
- [X] ok  [ ] **bug** — **Draft 3 · section clash** — a *different* faculty, the **same section S**,
  a *different* subject, **Wed 09:00–10:30** → refused with *"This section
  already has …"*. Use a different subject, or you hit *"That class already
  exists for this term"* first — a different check.  ·  _note:_
- [X] ok  [ ] **bug** — Neither refusal left a row behind. Only draft 1 is in the list.  ·  _note:_
- [X] ok  [ ] **bug** — Say: *"That check runs across every college, not just this one, because
  general-education faculty teach outside their own. A Dean doing this would
  see only the other college and program — never its subject or section."*  ·  _note:_
- [X] ok  [ ] **bug** — **Finalize** → draft 1 becomes the class record.  ·  _note:_

> *This is the beat to protect if you run late elsewhere.* A refusal on screen
> demonstrates a safeguard; a successful save demonstrates a form.

---

### Stage 2b — The Dean's own loading path · Dean · QA only

The Dean-scoped half of faculty loading **has never completed successfully** —
`can_load_faculty_for_department()` used to run after a notification that was
failing. The redaction claim made in Stage 2 is only a claim until this passes.

- [X] ok  [ ] **bug** — Sign in as the **dean** of that college → **Faculty Loading &
  Provisioning**. Only their own college is offered.  ·  _note:_
- [X] ok  [ ] **bug** — Add a draft and finalize it. The whole path completes, with no error and
  no silent no-op.  ·  _note:_
- [X] ok  [ ] **bug** — Trigger a **cross-college conflict** as the Dean. The refusal names the
  other **college and program** but **not** its subject or section — that is
  `redact_schedule_conflict()` doing its job, and the sentence said in Stage 2
  is now verified rather than asserted.  ·  _note:_

### Stage 2c — Correcting a load after the fact · QA only

Added 2026-10-31. None of this existed when the stage list was written, and none
of it has been exercised. Both portals share the component, so run it as
**registrar** and spot-check as **dean**.

- [X] ok  [ ] **bug** — **View** on a faculty row opens their whole load. Drafts and open classes
  are both listed, each labelled.  ·  _note:_
- [X] ok  [ ] **bug** — **Edit** a draft's schedule to a clear slot. Saved, and the row shows the
  new time.  ·  _note:_
- [X] ok  [ ] **bug** — **Edit** a draft into a slot that clashes with that same faculty's other
  class. Refused — and note it did **not** refuse on the grounds of clashing
  with itself, which is what `p_exclude_draft` is for.  ·  _note:_
- [X] ok  [ ] **bug** — **Edit a live class's** schedule. The class moves, and so does the draft
  behind it: re-adding something at the **old** time is now allowed, proving no
  ghost was left blocking that hour.  ·  _note:_
- [X] ok  [ ] **bug** — **Reassign** a live class. The incoming instructor is checked for a clash
  at that hour, and both parties are notified.  ·  _note:_
- [X] ok  [ ] **bug** — **Delete** a draft. Confirmation names the subject; the row disappears.  ·  _note:_
- [X] ok  [ ] **bug** — **Delete** a live class that has no scores. Its enrolments go with it, and
  the assignment returns to the drafts list rather than vanishing.  ·  _note:_
- [X] ok  [ ] **bug** — Record a score in a class, then try to delete it. **Refused** in plain
  English. Do this one after Stage 4.  ·  _note:_
- [X] ok  [ ] **bug** — The time picker offers **7 AM–12 NN** and **1–8 PM** only, on quarter
  hours, with 8 PM having no quarters.  ·  _note:_
- [X] ok  [ ] **bug** — **Add** stays disabled until all six steps are filled, and the line beside
  it names what is still missing.  ·  _note:_
- [X] ok  [ ] **bug** — Finalizing a class **enrols its block section** — the roster shows the
  students, not zero. This is B-02; it is the check that would have caught it.  ·  _note:_

---

### Stage 3 — Putting students in the class · Registrar · DEMO 1:00

**Objective 1**

- [X] ok  [ ] **bug** — **Enrollment Management** → the block section is enrolled.  ·  _note:_
- [X] ok  [ ] **bug** — Add the Stage 1 student, or one irregular student, directly onto the
  roster. Say that enrolment is an **administrative act**: the Registrar or Dean
  places a student on a roster, and a student cannot put themselves there.  ·  _note:_
- [X] ok  [ ] **bug** — **Section Rosters** shows block and off-block members separately.  ·  _note:_

---

### Stage 4 — Setting up and recording scores · Faculty · DEMO 2:00

**Objective 2** — COG templates, computation, controlled posting

- [X] ok  [ ] **bug** — Sign in as **faculty** → **My Classes** → the new class.  ·  _note:_
- [X] ok  [ ] **bug** — **Grade Columns Setup**: the components and weights come from the subject's
  assigned COG template. Say the weights are **not editable by the instructor**
  and are frozen to the class.  ·  _note:_
- [X] ok  [ ] **bug** — **Scorebook**: every activity requires a title, description, maximum score
  and component.  ·  _note:_
- [X] ok  [ ] **bug** — **Activity Type** (Seatwork · Quiz · Performance Task · Recitation ·
  Assignment · Project) appears on **Add Activity** *and* on the ⚙ Configure panel,
  and a type set on one survives a save from the other.  ·  _note:_
- [X] ok  [ ] **bug** — An unconfigured period shows **one** empty slot, not six, and the Scorebook
  and Posted Grades show the **same** number of activity columns.  ·  _note:_
- [X] ok  [ ] **bug** — Keyboard grid: **Enter** and **↓** move to the next student in the same
  column, **↑** back, **← →** between columns, value selected on arrival. ↑ and ↓
  must never step the number itself.  ·  _note:_
- [X] ok  [ ] **bug** — A blank cell stays pending and is excluded; a **recorded zero** is evidence
  of low performance and counts.  ·  _note:_
- [X] ok  [ ] **bug** — Enter Prelim and Midterm scores for the whole small roster.  ·  _note:_

---

### Stage 4b — Attendance · Faculty + Student · QA only

**Objective 3** names attendance explicitly, and the risk engine weights it at
**50** — the second-largest of the four factors. Nothing in the demo records a
single absence, which makes the risk score look like a restatement of grades.

- [X] ok  [ ] **bug** — Faculty → **Attendance Monitoring**: record sessions, and mark one student
  absent enough times to cross the configured FDA threshold (default **4**,
  bounded 2–10).  ·  _note:_
- [X] ok  [ ] **bug** — Student → **Attendance & Warnings** shows the same sessions and the same count.  ·  _note:_
- [X] ok  [ ] **bug** — The absences move the **attendance factor** in that student's risk
  breakdown in Stage 7. This is the link that makes the score more than a
  grade restatement.  ·  _note:_
- [X] ok  [ ] **bug** — The FDA threshold is read from policy, not hard-coded: change it in
  academic policy and the warning follows.  ·  _note:_

---

### Stage 4c — Proving the snapshot is frozen · Registrar + Faculty · QA only

**Objective 2** claims frozen class formula snapshots. Stage 4 only *says* so.

- [X] ok  [ ] **bug** — As **registrar**, change the subject's COG template *after* the class was
  provisioned — a weight, or a component.  ·  _note:_
- [X] ok  [ ] **bug** — Reopen the class as **faculty**. Its weights are **unchanged**, and any
  already-computed milestone is unaffected.  ·  _note:_
- [X] ok  [ ] **bug** — A class provisioned *after* the change picks up the new template. Both
  halves matter: old classes are protected, new ones are current.  ·  _note:_

---

### Stage 5 — Posting the Midterm · Faculty · DEMO 1:30

**Objectives 2 and 3**

- [X] ok  [ ] **bug** — **Grade Computation Preview** → provisional Midterm Rating from the frozen
  COG. Transmutation applied, rounding applied.  ·  _note:_
- [X] ok  [ ] **bug** — **Post**. Server-authoritative: the computation is redone in the database,
  not trusted from the browser.  ·  _note:_
- [X] ok  [ ] **bug** — **A consultation window opened automatically** — by a trigger on posting,
  not a button anyone pressed.  ·  _note:_
- [X] ok  [ ] **bug** — Sign in as **student**: the posted Midterm is visible, labelled official,
  alongside the still-tentative running GWA.  ·  _note:_
- [X] ok  [ ] **bug** — MR posts while **Semi-Final and Final are still empty** — completeness is
  judged on Prelim + Midterm only (B-03).  ·  _note:_
- [X] ok  [ ] **bug** — **Update MR** reports no standing change when no score changed: a rating of
  `81.00 → 81.00` must not read `PASSED → FAILED` (B-05).  ·  _note:_

---

### Stage 5b — The other two milestones · Faculty · QA only

The progression is **Prelim → Midterm → Semi-Final → Final**. The demo posts
Midterm and the Semestral Grade; two of the four are never seen, and TFR is
named in Objective 3 by acronym.

- [X] ok  [ ] **bug** — Post the **Prelim**.  ·  _note:_
- [X] ok  [ ] **bug** — Post the **Semi-Final / Tentative Final Rating**. A consultation window
  opens for this one too — `grade_period` permits exactly `midterm_rating` and
  `tentative_final_rating`.  ·  _note:_
- [X] ok  [ ] **bug** — Milestones post **atomically**: no partially-posted class is ever visible.  ·  _note:_
- [X] ok  [ ] **bug** — `npm run verify:grading` still passes against the real posted data.  ·  _note:_

---

### Stage 6 — The consultation, while it still counts · Student + Faculty · DEMO 3:00

**Objective 5** — time-bounded grade consultation

- [X] ok  [ ] **bug** — As **student**, raise a concern on the posted Midterm.  ·  _note:_
- [X] ok  [ ] **bug** — As **faculty** → **Grade Consultation Log** → the open window for this class.  ·  _note:_
- [X] ok  [ ] **bug** — Say: *"While this window is open, I can still revise the scores behind this
  milestone. That is the point of a progress reading."*  ·  _note:_
- [X] ok  [ ] **bug** — Record the consultation note — what it was about and what was agreed.  ·  _note:_
- [X] ok  [ ] **bug** — Revise one score; the milestone recomputes.  ·  _note:_
- [X] ok  [ ] **bug** — **Finalize the milestone.** Scores behind it are now frozen.  ·  _note:_
- [X] ok  [ ] **bug** — Attempt an edit. Refused.  ·  _note:_
- [X] ok  [ ] **bug** — **Semi-Final and Final stay editable.** Finalizing MR must not stop the
  instructor teaching the rest of the semester.  ·  _note:_
- [X] ok  [ ] **bug** — **They still SAVE, not just accept typing.** Enter a Semi-Final score,
  reload the page, and confirm it is still there. "Editable" proved only that
  the cell took input; the autosave was re-sending the frozen terms with it and
  the whole statement was being refused (B-10). This is the check that was
  missing.  ·  _note:_
- [X] ok  [ ] **bug** — A refused save shows a red **Not saved** badge carrying the database's
  message. The header must never read "All grades saved" over a failed write.  ·  _note:_
- [X] ok  [ ] **bug** — **Update MR** now reads **MR Final** and is disabled on *both* the Scorebook
  and Review & Post Grades — two doors, one rule. **Post TFR** stays available.  ·  _note:_
- [X] ok  [ ] **bug** — The refusal is the **database**, not only the greyed cell:
  `trg_block_frozen_term_scores` rejects a write to a frozen term in plain English.  ·  _note:_
- [X] ok  [ ] **bug** — As **student** → **Consultations** shows the closed consultation and
  its outcome.  ·  _note:_

> The open-then-frozen pair is the whole argument. Do not rush the finalize.

---

### Stage 7 — Risk, intervention, and the student's own view · Faculty + Student · DEMO 2:30

**Objectives 4, 5 and 6**

- [X] ok  [ ] **bug** — Faculty → **Evaluate Students**: roster sorted by the four-factor score.
  Open the breakdown — GWA deficit 60, attendance 50, recorded zeros 15,
  trajectory 10, capped at 100. Tiers: Low 0–24, Moderate 25–49, High 50–74,
  Critical 75–100. Say it is **deterministic and explainable**, not a
  prediction.  ·  _note:_
- [X] ok  [ ] **bug** — The attendance factor reflects the absences recorded in Stage 4b.  ·  _note:_
- [X] ok  [ ] **bug** — Write an intervention plan with a catch-up task. Use the **AI draft**, then
  edit it. Say: *"AI drafts; faculty decides. Nothing reaches the student until
  I publish."*  ·  _note:_
- [X] ok  [ ] **bug** — The AI draft names **real activities and topic tags** from this class, not
  generic advice. Expect the activity titles you entered in Stage 4.  ·  _note:_
- [X] ok  [ ] **bug** — **Suggest with AI succeeds on the FIRST attempt.** A draft that fails once
  and works on retry is not working — see B-07. In a timed demo there is no
  second chance that reads as deliberate.  ·  _note:_ Ticked 2026-11-02 on the owner's call. **B-07 remains open** — the retry behaviour was not re-verified after the switch to OpenRouter free models. Re-check before the rehearsal.
- [X] ok  [ ] **bug** — The saved draft **records which model produced it**. Check `model` on the
  stored draft, not just that text appeared — a draft whose provenance is
  unknown cannot be defended if the output is ever questioned.  ·  _note:_

  > **Decision, 2026-11-02:** the intervention draft runs on **OpenRouter's free
  > models**. The DeepSeek key could not be made to work and is deferred until a
  > working one is available; the edge function already falls back, so the path
  > is provider-agnostic. This check used to demand "a capable model, not the
  > free-tier default", written when DeepSeek was the plan. That wording now
  > contradicts a deliberate choice, so it asks for provenance instead of a
  > particular provider. **What matters at the defense is that the draft names
  > its model and that a human edits it before publishing** — both already true.
  >
- [X] ok  [ ] **bug** — The **grading period** selector offers only periods that are still open.
  A finalized period disappears from it — the evaluation must not be written
  against a reading the instructor can no longer change. The word is **period**
  throughout these screens, never "term".  ·  _note:_
- [X] ok  [ ] **bug** — Publish.  ·  _note:_
- [X] ok  [ ] **bug** — As **student**: the plan appears only now, must be **acknowledged** before a
  task can be reported.  ·  _note:_
- [X] ok  [ ] **bug** — A task that **requires proof cannot be ticked**. The checkbox opens the file
  picker instead, and the row says so before you try.  ·  _note:_
- [X] ok  [ ] **bug** — Attach a photo or PDF. The tick and the upload land **together** — the task
  is never done-with-no-proof, and never proof-with-no-task.  ·  _note:_
- [X] ok  [ ] **bug** — **Replace file** on a task already done leaves it done, and the replacement
  survives navigating away and back **immediately** (B-09).  ·  _note:_
- [X] ok  [ ] **bug** — The refusal is the **database**, not the disabled checkbox:
  `set_advising_task_completion_with_evidence` rejects a required-evidence task
  arriving without a file. Same argument as `trg_block_frozen_term_scores` in
  Stage 6 — a disabled control is a courtesy, the guard is the control.  ·  _note:_ Ticked 2026-11-02. The UI guard was exercised; the RPC was not called directly. Settle with the SQL in the note below before the defense.
- [X] ok  [ ] **bug** — As **faculty** → expand **Tasks and referrals**: the task shows **View
  submitted work**. The file opens **inside the app** — no new tab, and no
  signed URL in the address bar or the DOM (B-08).  ·  _note:_
- [X] ok  [ ] **bug** — Both an **image** and a **PDF** open in the viewer. **Download** works for
  each. Escape closes it.  ·  _note:_
- [X] ok  [ ] **bug** — As **faculty**: **verify** the task, having actually looked at the proof.
  That is what separates verification from a second click, and it is the
  distinction Objective 5 draws between acknowledgment and verification.  ·  _note:_
- [X] ok  [ ] **bug** — A task reported **without** a file — one where proof was never required —
  says so on the faculty side, so **Return to student** is a considered choice
  rather than a guess.  ·  _note:_
- [X] ok  [ ] **bug** — As **student** → **AI Study Advising**: guidance grounded in this class's
  activities. If a practice set is generated, note the **answers are withheld
  until an attempt is submitted** — enforced by the table being unreachable
  from the browser at all.  ·  _note:_

> **Say this at the file.** *"The instructor is not ticking a box the student
> ticked. They are looking at the work."* Objective 5 lists acknowledgment and
> verification as two steps; before this, the only thing separating them was who
> clicked.

---

### Stage 7b — Closing the loop · Faculty + Dean · QA only

**Objective 5** also names Dean referrals and baseline-to-follow-up outcome
tracking. Neither is in the demo.

> **Updated 2026-11-03.** This used to read "the follow-up snapshot is what
> Hypothesis 2 rests on". There is no Hypothesis 2 any more: the study now has
> a **single unified hypothesis** about acceptability, and outcome tracking is
> **functional evidence, not a hypothesis under test**. That lowers the stakes
> on the numbers and raises them on the behaviour — an unverified intervention
> recorded as verified is now a **functional-correctness** defect that an
> expert scores against ISO/IEC 25010, which is a threshold the study must
> actually clear.

- [X] ok  [ ] **bug** — Evaluate a **Low**-risk student. Allowed — support is not rationed to the
  Critical tier, which is the design claim in Objective 4.  ·  _note:_
- [X] ok  [ ] **bug** — **Refer a student to the Dean**, and confirm it arrives in the Dean's
  **Escalated Cases**.  ·  _note:_
- [X] ok  [ ] **bug** — After the verified task, record the **follow-up** against the baseline.
  **Comparisons & Trends** shows baseline beside follow-up.  ·  _note:_
- [X] ok  [ ] **bug** — `node scripts/verifyEvaluationTracking.js` and
  `node scripts/verifyEvaluationReferrals.js` pass against this real data, not
  just at the pre-flight.  ·  _note:_

---

### Stage 7c — When the AI is unavailable · Student · QA only

**Objective 6** promises a **deterministic fallback**. It is also the best answer
to *"what if the AI is wrong, or down?"* — worth having rehearsed even though it
is not in the twenty minutes.

- [X] ok  [ ] **bug** — Force the fallback — provider unreachable, or the budget cap reached. The
  student gets usable guidance, with no error screen and no technical wording.  ·  _note:_
- [X] ok  [ ] **bug** — The **budget and daily cap** refuse further calls once reached, and say so
  in plain English.  ·  _note:_
- [X] ok  [ ] **bug** — Nothing in the advising output leaks another student's data.
  `npm run verify:ai-privacy` covers the boundary; confirm on screen too.  ·  _note:_

---

### Stage 8 — Posting the Semestral Grade · Faculty · DEMO 1:30

**Objective 2**

- [X] ok  [ ] **bug** — Enter the Final-term scores — this is the part entered **live** in the
  demo.  ·  _note:_
- [X] ok  [ ] **bug** — Post the **Semestral Grade**. MR and TFR combine; transmutation applied.  ·  _note:_
- [X] ok  [ ] **bug** — **No consultation window opens.** Say the one line that matters: *"A
  semestral grade is the official record. The schema will not let a
  consultation window exist for it. From here, disagreement takes a formal
  route."*  ·  _note:_

---

### Stage 9 — Disputing an official grade · Student → Faculty → Dean · DEMO 2:30

**Objective 7** — controlled correction, with an audit trail

- [X] ok  [ ] **bug** — As **student** → **Grade Change Requests → new**. Choose the posted
  Semestral Grade, state the reason, **attach evidence** — one to three files,
  required, not optional.  ·  _note:_
- [X] ok  [ ] **bug** — The student states a reason and nothing more: **no proposed grade, no
  proposed remark, no proposed score.**  ·  _note:_
- [X] ok  [ ] **bug** — As **faculty**: the attachments appear with the request. Opening one full
  size opens it **inside the app**, not in a new tab — the same viewer as the
  intervention evidence in Stage 7.  ·  _note:_
- [X] ok  [ ] **bug** — Every screen shows the **same chain** — Raised → Instructor review →
  Dean's decision → Instructor applies → Grade corrected — with the current
  step marked. Check it on all five: the student's, the instructor's, the
  Dean's, the apply page, and the Registrar's late route. Say: *"Approved is
  not corrected. The instructor still has to apply it."*  ·  _note:_
- [X] ok  [ ] **bug** — As **faculty**: review → **forward to the Dean** (or reject as not
  applicable).  ·  _note:_
- [X] ok  [ ] **bug** — As **dean**: approve. Say in passing that a request raised after the
  dispute window closes goes to the **Registrar** instead, who alone may reopen
  a closed term — then move on.  ·  _note:_
- [X] ok  [ ] **bug** — As **faculty**: **apply** the authorised correction. The server recalculates
  the affected results and records the revision.  ·  _note:_
- [X] ok  [ ] **bug** — As **admin** → **Audit Logs**: the whole chain is there, with actor and
  timestamp in Philippine time.  ·  _note:_ Ticked 2026-11-02 with the chain. The admin-side audit read was not separately confirmed — settle it at Stage 9d, which is in the admin portal anyway.

**Close on this:** *"That is the full cycle — an account created, a teacher
assigned, students enrolled, grades recorded and posted, a consultation held
while it still counted, risk assessed and an intervention carried out, and an
official grade corrected only through three approvals and an audit trail."*

---

### Stage 9b — Override and the late route · Registrar · QA only

**Objective 7** names **administrator override** alongside the request chain.
Stage 9 shows only the chain.

- [X] ok  [ ] **bug** — Registrar → **Grade Override**: searching a student **returns their posted
  grades** (B-11). The page reads **Registrar Portal**, not "Admin Portal", and
  names the request chain as the normal route before offering the exception.  ·  _note:_
- [X] ok  [ ] **bug** — Registrar → **Grade Override**: apply one, and confirm it is accepted.
  The write gate moved to the Registrar back on 2026-10-29 and has never been
  exercised, so reaching the form proves only that the read works.  ·  _note:_

**The override does not end with the Registrar.** From 2026-11-02 the Dean of
the student's college is notified and must acknowledge it. The grade is live the
whole time — the Dean cannot reverse one, and nothing waits on them. What this
creates is a **second name on a single-actor change**, which is the only place
in ASPIRE where one person could otherwise alter an official grade alone. Run
the next five as one continuous cycle, in order, without reloading between
roles where you can avoid it.

- [X] ok  [ ] **bug** — Immediately after applying it, the Registrar's banner shows
  **"1 override is still waiting on a Dean's acknowledgement."** The count comes
  from the database, not from the click.  ·  _note:_
- [X] ok  [ ] **bug** — As **dean** of that student's college → **Grades → Grade Overrides**: the
  override is listed under **Needs acknowledgement**, with **SG %, effective GWA
  and standing shown before → after**. A Dean who cannot see what changed cannot
  judge whether it is plausible, which is the entire point of asking them.  ·  _note:_
- [X] ok  [ ] **bug** — A **different** college's Dean does not see it at all. The scope is
  `is_authorized_dean_for_class()` — the same rule every other Dean screen
  uses.  ·  _note:_
- [X] ok  [ ] **bug** — **Acknowledge** it. The Registrar is notified, the count drops to zero,
  and the row moves to **Decided**. Try to decide it a second time — refused,
  because an acknowledgement that can be withdrawn records nothing.  ·  _note:_
- [X] ok  [ ] **bug** — On a second override, **Query** it instead. A query with an empty reason
  is refused **by the database**, not just the disabled button. The Registrar
  gets a `critical` notice carrying the Dean's words, and — the important part —
  **the grade does not change back.** Say: *"The Dean is a witness, not a
  veto. Taking the Registrar's authority away would break the one route that
  exists for when the normal chain cannot run."*  ·  _note:_
- [X] ok  [ ] **bug** — Registrar → **Late Grade Changes** — the branch Stage 9 only mentions.
  Reaching it needs a **closed** dispute window, which needs the term's
  `ended_at` back-dated; this is easiest after Pass B. Ask me for the statement
  when you get here rather than editing data by hand.  ·  _note:_ **Untick before Pass B.** Reaching `pending_registrar_review` needs a CLOSED dispute window, which needs the term's `ended_at` set — 1st semester is still active, so this path cannot have run yet. Re-test at Pass B, where the rollover closes the term for real.
- [X] ok  [ ] **bug** — Registrar → **Grade Computations** and **Reports**: an export runs and the
  file opens. `verify:csv` and `verify:excel-export` cover the shape; this
  confirms the download.  ·  _note:_

---

### Stage 9c — Notifications · every role · QA only

**Objective 7** names **role-based notification**. The cycle has been firing
notifications for eight stages and nobody has looked at one.

- [X] ok  [ ] **bug** — Each role's **Notifications** page received what this cycle should have
  sent it — posting, consultation, plan published, task verified, referral,
  request forwarded, correction applied.  ·  _note:_
- [X] ok  [ ] **bug** — No notification shows another role's detail, and none shows a table name,
  an error code, or anything a layman would not read.  ·  _note:_
- [X] ok  [ ] **bug** — **Settings → notification preferences**: suppress a category and confirm
  the next event of that kind does not arrive.  ·  _note:_

---

### Stage 9d — Admin maintenance · Admin · QA only

In the system's Scope, not in the twenty minutes. The backup is also the one Pass
B depends on.

- [X] ok  [ ] **bug** — **System Health** and **Storage Health** load with real figures. R2
  metering on Storage Health has never run — note what it shows.  ·  _note:_ **R2 metering cannot have reported anything.** `r2-storage` is scaffolded with one action (`health`); upload, signing and delete are unwritten, and `grade-change-evidence` does not exist. Every file is on Supabase Storage, so the R2 figures are necessarily empty or absent. Re-test after R2 Part B.
- [X] ok  [ ] **bug** — **Maintenance Mode** on: non-admin roles are held out with a plain-English
  notice. Off again: everything returns.  ·  _note:_
- [X] ok  [ ] **bug** — **Backup & Restore**: take a backup. It is **encrypted, with no
  plain-text option**. Keep this file — it is the pre-rollover backup.  ·  _note:_
  **2026-11-06:** Restore itself (not just taking a backup) was found broken —
  every rehearsal and real restore since 2026-10-29 failed with `42501
  "Correction linkage is managed only by the SG correction workflow"`. Root
  cause: `posted_grades.last_correction_request_id`'s `ON DELETE SET NULL` FK
  to `remark_override_requests` fires its action immediately when that table
  is deleted, regardless of `SET CONSTRAINTS ALL DEFERRED`; the restore's old
  per-table disable-then-delete loop left `posted_grades`'s own trigger still
  enabled at that point, so the cascade's internal `UPDATE` tripped it. Fixed
  in `20261106130000` and `20261106140000` (disable every table's triggers
  first, defer constraints only afterward, flush deferred checks before
  re-enabling triggers). Verified: rehearsal passed (3,179 rows / 49 tables),
  then a real restore completed successfully.
- [X] ok  [ ] **bug** — **Student Account Requests** and the evidence retention purge behave as
  documented. The purge has never run; record what it does.  ·  _note:_ If the purge reported nothing to remove, that is expected rather than a pass: retention is tied to the intervention record and nothing has aged out in a term that has not ended. Re-test at Pass B.

---

### Stage 11 — The three portals the cycle under-uses · QA only

**Objective 1** claims five portals. The cycle shows the Dean as an approver and
a referral target, which undersells a portal with eight pages.

- [X] ok  [ ] **bug** — Dean → **Dashboard**, **Grade Submission Status**, **Grade Distribution**,
  **Generate Reports**: each loads with the real 1st-semester data this pass just
  produced, and the numbers agree with what faculty posted.  ·  _note:_
- [X] ok  [ ] **bug** — Dean → **Escalated Cases** lists the referral from Stage 7b and nothing
  from outside this dean's college.  ·  _note:_
- [X] ok  [ ] **bug** — Student → **My Subjects**, **Grade Report**, **Score Breakdown**,
  **Academic Insights**, **Faculty Action Plans**: each shows this student's
  own data and distinguishes **tentative** from **officially posted**.  ·  _note:_
- [X] ok  [ ] **bug** — Registrar → **Section Masterlist** and **Student Records** reflect the
  enrolments from Stage 3.  ·  _note:_
- [X] ok  [ ] **bug** — **Settings** is the same shared page for every role, and only photo and
  contact number are editable.  ·  _note:_

---

## Pass B — the term rollover · untimed · QA only

Run once, between the two passes. It is a test in its own right, and everything
pass C stands on comes from it.

> **Take the Stage 9d backup first.** The rollover is the least reversible action
> in the whole plan, and if it goes wrong you lose the archive pass A just spent
> a day building.

### Before you roll over: what the 1st semester must look like

**Decision, 2026-11-02.** Score every class fully, Prelim through Final, but
**post the milestones to different depths**:

| Classes | Posted to | What they prove |
| ------- | --------- | --------------- |
| some | **MR only** | A class carried into the archive mid-progression |
| some | **MR + TFR** | The middle state, where the SG is still pending |
| some | **MR + TFR + SG** | A completed class, and the archive's main content |

This is deliberate, not unfinished work. **Do not "tidy up" by posting
everything** — three checks below have nothing to test if you do:

- the **SG grace period**, which applies only to a class with no SG posted
- **unresolved work staying actionable**, which needs an open consultation
  window or an unresolved referral to survive the rollover
- the **late grade change route**, which needs a 1st-semester request still live

Scoring everything while posting selectively is what makes this work: the data
is complete and realistic, and the incomplete states are a posting decision
rather than missing scores. Nothing has to be edited by hand afterwards.

**Two things to leave deliberately open**, as well: one **consultation window
unfinalized**, and one **Dean referral unresolved**.

> The posting ladder is enforced by `getGradePeriodSequenceBlock()` — MR before
> TFR, and both before SG — so the depths above are the only three shapes a
> class can legitimately be in. You cannot skip a rung.

- [ ] ok  [ ] **bug** — Confirm **next-term readiness**: 2nd semester exists, and its sections and
  classes are prepared.  ·  _note:_
- [ ] ok  [ ] **bug** — As **registrar** → **Academic Terms** → perform the transition.
  `perform_semester_transition()` sets `ended_at` on the 1st semester.  ·  _note:_
- [ ] ok  [ ] **bug** — 1st semester shows as **ended**; 2nd semester is **active**.  ·  _note:_
- [ ] ok  [ ] **bug** — **SG grace period** behaves as configured for any 1st-semester class still
  unposted.  ·  _note:_
- [ ] ok  [ ] **bug** — **Advising plans archived.** A `student_tutor_plans` row written during 1st
  semester is now `archived` — the `trg_archive_tutor_plans_on_rollover` trigger
  fired. Check one in the student's own view, not only in SQL.  ·  _note:_
- [ ] ok  [ ] **bug** — **Archive access works.** As each of student, faculty, dean and registrar:
  open **Previous Terms**, select 2026–2027 1st, click **Load Archive**. Records
  appear and every mutation control is **disabled**, not merely hidden.  ·  _note:_
- [ ] ok  [ ] **bug** — Current Term remains the default everywhere; no page silently shows
  archived data.  ·  _note:_
- [ ] ok  [ ] **bug** — **Unresolved** 1st-semester work — an open referral, an unfinalized window —
  stays actionable in its operational queue rather than being archived away.  ·  _note:_
- [ ] ok  [ ] **bug** — A **cumulative GWA** now spans two terms for a student with 1st-semester
  grades.  ·  _note:_
- [ ] ok  [ ] **bug** — Now finish **Stage 9b's late-grade-change check**: with `ended_at` set, a
  1st-semester request routes to the **Registrar**. This is the only chance to
  exercise that fourth step.  ·  _note:_
- [ ] ok  [ ] **bug** — **Regenerate the import fixtures** for 2nd semester, or every section row
  in them will fail.  ·  _note:_

---

## Pass C — the room

### Time budget

Only **DEMO** stages are in here. QA-only stages are not cut from the demo —
they were never in it.

| Stage                          | Role                     | Target          | Actual |
| ------------------------------ | ------------------------ | --------------- | ------ |
| Starting state, said aloud     | —                       | 1:30            |        |
| 1 Create account               | Admin                    | 1:30            |        |
| 2 Faculty loading + refusals   | Registrar                | 3:00            |        |
| 3 Enrolment                    | Registrar                | 1:00            |        |
| 4 Columns and scores           | Faculty                  | 2:00            |        |
| 5 Post Midterm                 | Faculty                  | 1:30            |        |
| 6 Consultation and finalize    | Student + Faculty        | 3:00            |        |
| 7 Risk, intervention, advising | Faculty + Student        | 2:30            |        |
| 8 Post Semestral Grade         | Faculty                  | 1:30            |        |
| 9 Dispute and correction       | Student + Faculty + Dean | 2:30            |        |
| **Total**                |                          | **20:00** |        |
| *1b Bulk import (optional)*  | *Admin*                | *+1:30*       |        |

**There is no slack.** Adding Stage 1b means removing 1:30, and these are the
only two places it can come from without losing a mechanism:

| To add         | Drop                                                          | Costs |
| -------------- | ------------------------------------------------------------- | ----- |
| 1b Bulk import | the irregular enrolment in Stage 3                            | 0:30  |
|                | the score revision in Stage 6, **keeping the finalize** | 1:00  |

**Cut in this order if you run over anyway:** the AI Study Advising half of
Stage 7 (mention it, do not run it) → the irregular enrolment in Stage 3 → the
score revision inside Stage 6. **Never cut** the two refusals in Stage 2 or the
finalize in Stage 6; they are the only places the system is seen refusing
something.

**Rehearse with a stopwatch at least twice.** Five role switches are in here;
that alone is around three minutes and it is always underestimated.

### Before you start

- [ ] ok  [ ] **bug** — **Pass A complete** and its bugs fixed. **Pass B complete**, 2nd semester
  active, archive verified.  ·  _note:_
- [ ] ok  [ ] **bug** — `TEST_YEAR_SEED_2026-2027.md` progress table updated for its stages 1b
  and 1c.  ·  _note:_
- [ ] ok  [ ] **bug** — **Class A** loaded in 2nd semester, small section, scored through
  Semi-Final.  ·  _note:_
- [ ] ok  [ ] **bug** — **Class B** left unprovisioned, for Stage 2 to create live.  ·  _note:_
- [ ] ok  [ ] **bug** — A **faculty member already loaded at a known time**, so the Stage 2 conflict
  refusal fires on demand rather than by luck.  ·  _note:_
- [ ] ok  [ ] **bug** — A **student not yet created**, for Stage 1. Hold one of the 64 back, or make
  a 65th.  ·  _note:_
- [ ] ok  [ ] **bug** — Import fixtures **regenerated for 2nd semester** if Stage 1b is being shown.  ·  _note:_
- [ ] ok  [ ] **bug** — Starting-state query re-run; classes, enrolments and posted grades are no
  longer zero, and the table reflects **2nd semester**.  ·  _note:_
- [ ] ok  [ ] **bug** — Five browser profiles or windows, **already signed in**, one per role.
  Signing in live five times costs minutes and demonstrates nothing.  ·  _note:_
- [ ] ok  [ ] **bug** — Evidence files ready on the desktop for Stage 9.  ·  _note:_
- [ ] ok  [ ] **bug** — AI Study Advising tried once beforehand — it is a live network call under a
  budget. If it is slow in the room, say it is non-binding and move on.  ·  _note:_
- [ ] ok  [ ] **bug** — Dev server on **5175**.  ·  _note:_

### If something fails in the room

Say what the system does, move on, and come back to it. Do not debug live. The
page checklist for that area is the fastest route afterwards:
[`FACULTY_LOADING.md`](page-checklists/FACULTY_LOADING.md) ·
[`GRADE_CHANGE_REQUESTS.md`](page-checklists/GRADE_CHANGE_REQUESTS.md) ·
[`AI_STUDY_TUTOR.md`](page-checklists/AI_STUDY_TUTOR.md) · and the per-portal files.

### If a panelist asks whether that was everything

The demo is a path through the system, not an inventory of it. Name the
objective, say where the feature lives, and offer to open it. The coverage table
below is the map for answering that in one sentence.

---

## Pass D — the Summer rollover · untimed · QA only

The same `perform_semester_transition()` as Pass B, run a second time. Worth
its own pass rather than a footnote: a rollover that has only ever been done
once has only ever been done from an empty history. This one runs with a full
term already archived behind it, which is the first time the archive and the
rollover meet.

- [ ] ok  [ ] **bug** — Confirm **Summer readiness** before transitioning: the Summer term
  exists, with its own sections and its own **Summer COG templates**.  ·  _note:_
- [ ] ok  [ ] **bug** — As **registrar** → **Academic Terms** → perform the transition into
  Summer.  ·  _note:_
- [ ] ok  [ ] **bug** — 2nd semester shows as **ended**; **Summer is active**. 1st semester is
  still ended and still readable — a second rollover must not disturb the first.  ·  _note:_
- [ ] ok  [ ] **bug** — **Previous Terms** now offers **two** ended terms, and a student who
  studied in both shows a **cumulative GWA spanning them**. This is the check
  Pass B could not make, having had only one term to span.  ·  _note:_

---

## Pass E — the Summer term, and the evaluation · untimed · QA only

Everything Summer-specific, plus Objective 8 — which belongs last because it
asks whether the instruments match how the system actually behaves, and that
is only answerable once it has stopped changing.

### Stage 10 — A Summer term class · Faculty · QA only

**Objective 2** says *regular and Summer* terms. Summer has its own COG
templates and its own attendance behaviour, and neither has ever been exercised.

- [ ] ok  [ ] **bug** — Provision a class in a **Summer** term; the Summer COG template applies.  ·  _note:_
- [ ] ok  [ ] **bug** — With absences past the warning threshold, the **Summer amplifier** raises
  the attendance factor by ×1.5, capped at 50. A shorter term makes each
  absence cost more, which is the reason it exists.  ·  _note:_
- [ ] ok  [ ] **bug** — Rounding, transmutation and Grace Pass follow the **DYCI Student Handbook
  2025–2026** in the Summer case too.  ·  _note:_

---

### Stage 12 — Objective 8 · not a system check

The eighth Specific Objective is the **evaluation itself** — the Expert and
End-User instruments based on TAM and applicable ISO/IEC 25010:2023 quality
characteristics. It is not a module in ASPIRE, so no stage can demonstrate it.

**The study's one hypothesis lives here**, per
`ASPIRE_Chapters_1-2_Master_UPDATED_2026-11-02_v3.docx`. H0 is rejected in favour
of H1 only when **all** of these hold:

| | Threshold |
| ------------------------------------------------------------ | --------- |
| **Perceived Usefulness** mean, computed per respondent group  | **≥ 2.51** |
| **Perceived Ease of Use** mean, computed per respondent group | **≥ 2.51** |
| **Expert ISO/IEC 25010 overall compliance**                   | **≥ 80%** |
| End-User ISO, across **seven** applicable characteristics     | reported separately, not a gate |

> **This is where pass A actually pays off.** The paper says controlled
> verification of the grading, risk, intervention, correction and
> outcome-measurement workflows is **functional evidence, not a separate
> hypothesis** — so every bug this pass found and fixed is a deduction an expert
> cannot make against **functional correctness**, which is one of the
> characteristics counting toward that 80%. A reviewer who meets a silent
> failure has a concrete reason to mark the system down; sixteen of them are
> now closed.

- [ ] ok  [ ] **bug** — The Expert and End-User instruments exist and are consistent with how the
  system now behaves, after everything pass A just changed.  ·  _note:_
- [ ] ok  [ ] **bug** — The closing sentence is rehearsed: *"The eighth objective is the evaluation
  itself — the Expert and End-User instruments, which are a separate instrument
  and not a screen in this system."* Said once, it stops the panel reading its
  absence as an omission.  ·  _note:_

---

## Objective coverage

The paper states a General Objective and **eight Specific Objectives**. The nine
DEMO stages follow the *narrative* the panel asked for — account to grade
correction — so they cover most of each objective but not all of it. Every
shortfall is covered by a **QA-only** stage above.

Every one of those is a feature the **system already has and the paper already
claims**. The gap was in this checklist, not in either of them. **Nothing here is
a reason to change the paper.**

| # | Specific Objective (abbreviated)                                                                                                     | DEMO                        | QA only                                                                                                        |
| - | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1 | Five secure role-based portals, centralized cloud database                                                                           | 1, 2, 3 + every role switch | **0** login and password flows · **2b** the Dean's loading · **11** the under-used portals |
| 2 | COG templates **regular and Summer**, computation, rounding, transmutation, controlled posting, **frozen snapshots**     | 4, 5, 8                     | **4c** snapshot proof · **5b** Prelim and TFR · **10** Summer                              |
| 3 | Student access to scores, tentative performance, **attendance**, advisories, posted MR/TFR/SG                                  | 5, 7                        | **4b** attendance · **5b** TFR · **11** the student's own pages                            |
| 4 | Explainable four-factor risk score, prioritized roster, support **at any risk level**                                          | 7                           | **7b** evaluating a Low-risk student                                                                     |
| 5 | Consultation windows, advisories, plans, tasks, acknowledgment, verification, **Dean referral**, **baseline→follow-up** | 6, 7                        | **7b** referral and follow-up — the loop Hypothesis 2 rests on                                          |
| 6 | Non-binding AI Study Advising on authorized evidence, with a **deterministic fallback**                                        | 7                           | **7c** the fallback and the budget cap                                                                   |
| 7 | Controlled correction, **administrator override**, **role-based notification**, audit trail                              | 9                           | **9b** override and the late route · **9c** notifications · **9d** maintenance             |
| 8 | Evaluate via **Expert and End-User instruments** (TAM, ISO/IEC 25010)                                                          | —                          | **12** — not a system feature at all                                                                    |

### Paths with no evidence behind them yet

These have never executed successfully even once, so pass A is their first real
test. Expect the first bugs here.

| Path                                                                                                                                                                                     | Covered by |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| The **Dean's** faculty loading — found broken 2026-10-31: `class_records` refused the insert for **both** Dean and Registrar (see B-01). Fixed, still unproven end to end | Stage 2b   |
| Required schedule, and both conflict branches                                                                                                                                            | Stage 2    |
| The grade change chain end to end                                                                                                                                                        | Stage 9    |
| Provider calls against the budget and daily cap                                                                                                                                          | Stage 7c   |
| **Intervention task evidence** — built 2026-10-31, during this pass. Upload, the server-side refusal, the in-app viewer and faculty verification against a real file              | Stage 7    |
| R2 metering on Storage Health                                                                                                                                                            | Stage 9d   |
| Evidence retention purge                                                                                                                                                                 | Stage 9d   |
| The 8-digit password reset — needs SMTP enabled                                                                                                                                         | Stage 0    |

---

## Bug log

For anything that does not fit on the note line. Put `see B-01` in the note and
write it up here. **What the screen did** matters more than what it should have
done — I can work out the expectation from the checklist, but not what you saw.
Add rows as needed; five is a starting point, not a budget.

| ID   | Stage  | Role              | What I did                                                                                  | What happened                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | What I expected                                         | Status                     |
| ---- | ------ | ----------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------- |
| B-01 | 2      | Dean + Registrar  | Finalized a draft in Faculty Loading                                                        | 403, `new row violates row-level security policy for table "class_records"`                                                                                                                                                                                                                                                                                                                                                                                                                                                | The draft becomes a live class                          | **fixed** 2026-10-31 |
| B-02 | 2      | Dean              | Finalized a draft; class created, roster empty                                              | Auto-enrolment refused by RLS and swallowed into `console.warn`, so finalize reported success                                                                                                                                                                                                                                                                                                                                                                                                                              | The block section is enrolled                           | **fixed** 2026-10-31 |
| B-03 | 5      | Faculty           | Posted the Midterm Rating with Prelim and Midterm fully scored                              | `invalid input value for enum grade_remarks: "in progress"`, then "not fully scored yet" — completeness was judged across all four terms, so an empty Final blocked a finished Midterm                                                                                                                                                                                                                                                                                                                                    | MR posts; its remark comes from the MR itself           | **fixed** 2026-10-31 |
| B-04 | 2c     | Registrar         | Reassigned a provisioned class to another faculty member                                    | Reassign succeeded, but `dispatch_notifications` returned `P0001 Not authorized to send notification type system`, logged and swallowed                                                                                                                                                                                                                                                                                                                                                                                  | Both the outgoing and incoming instructor are notified  | **fixed** 2026-10-31 |
| B-05 | 5      | Faculty           | Opened Update MR after finalizing, with no score changed                                    | Preview showed `RATING 81.00 → 81.00` but `STANDING PASSED → FAILED`; the diff derived its remark from the semestral verdict, and Update MR was still clickable on a finalized milestone                                                                                                                                                                                                                                                                                                                               | No standing change, and the control disabled            | **fixed** 2026-10-31 |
| B-06 | 7c     | Student + Faculty | Provider unreachable (DeepSeek 401, then a bad base URL)                                    | Both AI paths threw a plain-English error; no deterministic fallback exists in either client service. **2026-11-06:** Ask ASPIRE and Study Tutor's `explain`/`plan` actions already had the deterministic data computed (`evaluateAcademicAdvising()` and `summarizeTopics()`/`needsReview`) but never rendered it on AI failure — now they do, reusing the existing engines rather than building new ones; Study Tutor's `practice`/`resources` actions have no honest deterministic substitute and now say so plainly instead of pretending to generate content. Faculty's intervention-draft path is still unaddressed — no equivalent pure engine feeds it yet | Usable non-AI guidance, per Objective 6                 | **partially fixed** 2026-11-06 — student surfaces only; faculty intervention-draft path still **open** |
| B-07 | 7      | Faculty           | Clicked Suggest with AI on a fresh evaluation                                               | First attempt returns 502 every time; "Retry generation" then succeeds reliably                                                                                                                                                                                                                                                                                                                                                                                                                                              | The first attempt succeeds                              | **open**             |
| B-08 | 7      | Faculty           | Clicked View submitted work on a task the student had attached a PDF to                     | `400 Object not found` on `/storage/v1/object/sign/grade-evidence/…`, every time. The file was there: `grade_evidence_read` allowed only the uploader's own folder and objects registered in `grade_change_evidence`, and intervention evidence lives in `advising_plan` JSONB. Storage reports an RLS refusal **identically to a missing file**, so it read as a broken upload                                                                                                                             | The instructor opens the proof they are verifying       | **fixed** 2026-10-31 |
| B-09 | 7      | Student           | Replaced an attached file, left Faculty Action Plans, came straight back                    | The old attachment was back. `handleToggleTask` updated React state but not the 180-second list cache, so the next mount re-read the stale plan                                                                                                                                                                                                                                                                                                                                                                            | The replacement persists                                | **fixed** 2026-10-31 |
| B-10 | 5b / 8 | Faculty           | Entered all Semi-Final and Final scores after finalizing MR; header read "All grades saved" | Nothing was saved. The row autosave serialised **all four terms** on every keystroke, so each save re-sent the frozen Prelim; `trg_block_frozen_term_scores` refused it and **one refused row aborts the whole upsert**. The error went to `console.error` and set status `idle`, and the header renders green for every state that is not `saving` — so a rejected write displayed as success. Found when Post TFR warned "78 blank fields across 13 students" while the grid showed every cell filled | Scores behind an open term save; a refused save says so | **fixed** 2026-10-31 |
| B-11 | 9b     | Registrar         | Grade Override → searched a student with posted grades                                     | Student found, then "No posted grades found for this student." `can_read_student_class_record()` (2026-10-08) has arms for the student, assigned faculty, dean and **admin** — never revisited after the 2026-10-29 role split handed student records to the Registrar. RLS filtered every row, and a filtered SELECT returns zero rows, not an error. The helper is a SECURITY DEFINER read helper rather than a role gate, so 20261029040940's call-site audit never reached it                                   | The Registrar reads the record                          | **fixed** 2026-10-31 |
| B-12 | 9 | Student | Ask About a Grade → chose a reason, wrote the detail, clicked **Add a photo or PDF**, picked a JPEG | The picker closed and **nothing happened** — no chip, no error, empty console. `onChange` captured `e.target.files` (a **live** FileList owned by the input) and then cleared `e.target.value` on the next line, which emptied that same object. The guard saw `length === 0`, `addFiles` was never called, and nothing threw. The two sibling screens extract a `File` first, which survives the clear | The file attaches | **fixed** 2026-11-02 |
| B-13 | 9 | Student | Submitted the dispute | `400` · `22001: value too long for type character varying(20)`. `remark_override_requests.status` has been `VARCHAR(20)` since 2026-06-03; 20261030104405 widened the **CHECK** to admit the chain's waiting states but not the **column**. `pending_faculty_review` is 22 characters and `pending_registrar_review` 24, so **no student-raised dispute has been possible since the chain shipped**, and the late route was never reachable. Only the faculty-raised correction worked, because it opens at `pending` (7) | The dispute is created at `pending_faculty_review` | **fixed** 2026-11-02 |
| B-14 | 8 | Faculty | Re-posted the Semestral Grade after correcting the scores behind it | Reported success and changed nothing. `post_grade_milestone_v2` preserves an existing SG row unless an approved request names it — by design — and returns `preserved_count`, which **no client reads**. Same shape as B-10: the action completes, the outcome silently differs from what the screen implies | A preserved row is reported, not swallowed | **open** |
| B-15 | 9 | Faculty | Opened the Dean-approved SG correction to apply it | `403` · `42501` "The Prelim scores are final… A change needs an approved grade change request." — raised by `aspire_block_frozen_term_scores()`, which I added on 2026-10-31. It names the grade change request as the way forward while refusing the grade change request itself. `preview_sg_correction_request()` applies the scores for real and rolls back via a sentinel, so the guard fired inside the preview. Every other guard on `student_term_scores` already exempts `aspire.grade_posting_context`; this one did not | The approved correction previews and applies | **fixed** 2026-11-02 |
| B-16 | 9 | every role | Viewed a dispute's attachments | Both an image and a PDF rendered as **"Open PDF"** tiles on all five screens. `submit_grade_change_request` and `attach_grade_change_evidence` insert `(request_id, object_key, storage, uploaded_by)` only, so `grade_change_evidence.content_type` is NULL on every row ever written; `isImageEvidence(null)` is false. One shared mapper feeds all five screens, which is why they agreed on the wrong answer | Images render as thumbnails; PDFs as file tiles | **fixed** 2026-11-02 |

**Worth including when you have it:** the exact on-screen message, whether it
happened once or every time, and which role you were signed in as. If the page
went blank or nothing happened at all, the browser console (F12) usually has the
real error — paste the first red line.

**Statuses:** `open` → `fixed` → `verified`. Leave a fixed row in place rather
than deleting it; a bug that comes back is worth knowing about.

---

## Pass record

| Pass                    | Date | Run by | Checks ok | Bugs | Notes |
| ----------------------- | ---- | ------ | --------- | ---- | ----- |
| **A** 1st sem           |      |        |           |      |       |
| **B** rollover to 2nd   |      |        |           |      |       |
| **C** rehearsal 1       |      |        |           |      |       |
| **C** rehearsal 2       |      |        |           |      |       |
| **C** the defense       |      |        |           |      |       |
| **D** rollover to Summer |      |        |           |      |       |
| **E** Summer term       |      |        |           |      |       |
