# Schema normalization audit — 2026-10-30

**Scope:** all 56 tables in `public` on the live Supabase project, after the
Phase 7 build and the hard reset.
**Method:** live catalog queries for primary keys, multi-valued columns,
numbered columns and text-copies-beside-a-foreign-key, cross-referenced against
application code, edge functions and Postgres function bodies.
**Why it exists:** the ERD going into the thesis paper should be defensible, and
a panel will ask about any denormalization in it.

## Summary

| Check | Result |
|---|---|
| Every table has a primary key | **Pass** — no table lacks one |
| 3NF: text copy stored beside a foreign key | **Pass** — zero findings |
| 1NF: repeating groups | **One violation** — `student_term_scores` |
| 1NF: multi-valued (`jsonb` / `ARRAY`) columns | 25 columns, **24 defensible**, categorised below |
| Unused tables | One — `student_component_scores` |

The "no text copy beside an id" result is worth stating at a defense: it is the
most common 3NF failure in student projects and this schema does not have it.

## The one real violation: `student_term_scores`

```
student_term_scores(class_record_id, student_id, term, act1, act2, act3, act4, act5, act6, ...)
```

`act1` through `act6` are a **repeating group** — the textbook 1NF violation.
Three consequences, in increasing order of seriousness:

**1. It caps the system at six activities per term.** Not a soft limit — a
structural one. `ScoreInput.jsx:1187` refuses a seventh activity and
`ScoreInput.jsx:2881` marks the term full, because there is no `act7` column.

**2. The same score is stored twice.** `student_activity_scores(student_id,
activity_id, score)` is the normalized form of the same fact, and it exists and
is populated.

**3. Both are written from the browser, in the same save, without a
transaction.**

| Writer | Writes |
|---|---|
| `ScoreInput.jsx:1401` | `student_term_scores` (flat row) |
| `ScoreInput.jsx:1409` | `student_activity_scores` (per activity) |
| `StudentRow.jsx:161` | `student_term_scores` |
| `StudentRow.jsx:199` | `student_activity_scores` |

These are separate PostgREST calls. If the first succeeds and the second fails —
a dropped connection, a closed laptop — the two representations of the same
score diverge silently, and nothing detects it. That is an update anomaly, which
is precisely what normal form exists to prevent.

### Options

**A. Retire `student_term_scores`; make `student_activity_scores` the single
source.** Correct, and removes the six-activity cap. Costs: six call sites read
it (`StudentRow`, `classRoomService`, `collegeRiskService`, `studentRunningGrade`,
`evaluationTracking`, `excelExport`) plus four Postgres functions. This is real
work and touches grade reading — not something to attempt in the week before a
defense.

**B. Keep it, and make it honest.** Declare it a denormalized read model derived
from `student_activity_scores`, and maintain it with a **database trigger**
rather than a second client write. The divergence risk disappears because one
write becomes the source of the other. The six-activity cap stays.

**C. Document and defer.** Change nothing; record it as known technical debt
with the reason.

**Recommendation: B if there is time, C if there is not.** B removes the
correctness problem — the part a panel can actually criticise — without touching
any read path. A is the right end state but is a migration project, not a fix.

Whichever is chosen, the six-activity cap should be stated in the paper as a
known limitation rather than discovered by a panel member asking what happens
with seven quizzes.

## The 25 multi-valued columns

Flagged automatically; most are correct design, and each category has a
different answer.

### Immutable snapshots — denormalization is *required* here (6)

`class_records.grading_formula_snapshot` · `posted_grades.grading_formula_snapshot` ·
`student_risk_evaluations.baseline_snapshot` · `.followup_snapshot` ·
`student_academic_insights.basis_snapshot` · `faculty_intervention_drafts.snapshot`

These freeze what a formula or a student's standing looked like **at a moment in
time**. Normalizing them into related tables would make them change when the
source changes, which destroys their purpose: a grade posted under last term's
formula must stay computed under last term's formula. A foreign key here would
be a bug, not an improvement.

### Opaque audit and result payloads (7)

`admin_grade_override_operations.result` · `grade_posting_operations.result` ·
`sg_correction_operations.result` · `notification_deliveries.metadata` ·
`notifications.payload` · `student_tutor_log.request` · `.response`

Written once, read for diagnostics, never joined or filtered on their internals.
Giving each a table would create relations nothing queries relationally.

### Change-set documents (3)

`remark_override_requests.proposed_score_changes` ·
`grade_correction_history.applied_score_changes` · `.applied_milestone_changes`

These describe a *proposed or applied transaction*, not entities with
independent identity. They are meaningful only as a complete set.

### Owned child collections — defensible, could be tables (6)

`student_tutor_plans.items` · `student_tutor_practice_sets.questions` ·
`faculty_intervention_drafts.generated_tasks` ·
`faculty_intervention_working_drafts.tasks` ·
`student_risk_evaluations.advising_plan`

The honest answer: these *could* be child tables. They are documents because
nothing queries across them — no feature asks "which students have ticked item
3". They are always read and written as a whole, with their parent.

`student_tutor_practice_sets.questions` has an additional reason: it holds the
correct answers, and the table has RLS enabled with no policy so no student can
read it. Splitting the questions into rows would widen that surface for no gain.

### Closed-domain sets (3)

`class_records.meeting_days` · `faculty_load_drafts.meeting_days` ·
`posted_grades.locked_milestones`

The academically weakest category. A strict reading says a day-of-week set
belongs in a child table. The practical argument is that the domain is small,
closed and never independently queried. If a panel presses on any
denormalization, it will be this one — worth having the answer ready rather
than being surprised.

## Unused table

`student_component_scores` — 0 rows, no incoming foreign keys, no Postgres
function reference, no application reference. Its only mentions anywhere are its
own `CREATE TABLE`, constraints and indexes in
`20261007130000_dynamic_grade_sheet_v2.sql`. Superseded by
`student_activity_scores`. Safe to drop.

## Not a normalization issue, but found here

**`user_push_tokens` does not exist in the database.** Its migration is
`20260829_user_push_tokens.sql` — the only migration whose filename omits the
time component, which is almost certainly why it was never applied.
`AuthContext.jsx:28` upserts to it when a device registers for push. The write
is inside a `try/catch`, so it fails silently, and only on the APK. Push tokens
are being discarded.

**`public.audit_logs` — already fixed, no action needed.** The restore function
originally wrote to a table of that name, which does not exist (the real one is
`activity_logs`). `20261029230608_scheduled_maintenance_windows.sql` patched the
live definition and asserts the old reference is gone, so the only remaining
mentions are in the superseded original text of
`20261029215500_backup_and_restore.sql`. Recorded here because grepping the
migrations still finds it and it looks like a live bug.

## A note for the ERD

Internal table names and student-facing names deliberately differ in one place:
the `student_tutor_*` tables are displayed to students as **AI Study Advising**.
"Tutor" was kept in the schema because this system has two AI features and
`invoke-advisor` already owns the word "advising" in the codebase — a
`student_advising_plans` table would read as the advisor's. Worth one line in
the ERD legend.
