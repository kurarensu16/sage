# Intervention task evidence, and the R2 migration — audit and plan

**Date:** 2026-10-31 · **Status:** Plan, not implemented
**Raised during:** QA pass A, Stage 7

Two pieces that look like one. Separating them is the main finding: the evidence
feature does **not** depend on R2, and treating it as if it did would park a
ready feature behind a storage decision.

---

## Where things actually stand

| | State |
|---|---|
| Grade-change evidence | **Working**, on Supabase Storage |
| `r2-storage` edge function | **Scaffolded only** — 236 lines, one action: `health`. Upload, signing and delete are not written |
| `grade-change-evidence` edge function | **Does not exist.** The client calls it, but only for rows where `storage = 'r2'`, and nothing writes that value |
| R2 credentials | Present in `.env` — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` |
| Intervention task evidence | **Does not exist** |

A missing `grade-change-evidence` sounds alarming and is not. `getEvidenceUrl()`
branches on where each file lives, and its own comment explains why:

> *"Branches on where the file actually lives, which is what makes a later move
> to R2 additive rather than a migration of everything already uploaded."*

Uploads default to `EVIDENCE_STORES.SUPABASE`, so the R2 branch is unreachable
today. **Stage 9 is not blocked.**

---

## Part A — Evidence on intervention tasks

### The gap

A student ticks a task; a faculty member clicks verify. **There is nothing to
verify against.** Objective 5 lists student acknowledgment and task verification
as two distinct steps, and today the only thing separating them is who clicked.

The task already *states* its artifact — `deliverable`, e.g. *"Completed
assignment with step-by-step solutions for all counting and pigeonhole
problems."* The system describes the proof and cannot receive it.

### The rule: faculty decides per task

A **require proof** toggle written by the faculty member on each task, defaulting
by `action_type`:

| `action_type` | Default |
|---|---|
| `complete_missing_work`, `correct_failed_work`, `practice_assessment` | **required** |
| `targeted_review`, `study_plan`, `performance_maintenance` | optional |
| `faculty_consultation`, `attendance_recovery` | **off** |

Required-on-everything was considered and rejected. Three of the eight action
types have no artifact by nature — *"attend a consultation with your
instructor"* cannot take a PDF, and the AI is explicitly allowed to generate
that task. A blanket rule makes it permanently un-tickable. It also blocks a
student who did the work but has no way to scan it.

Putting the decision with the instructor is also the stronger line to defend:
**only they know what the work looks like.**

### Shape

Tasks are stored as JSONB (`faculty_intervention_working_drafts.tasks`,
1–5 items), so the task object gains two fields and needs **no migration for the
shape**:

    requires_evidence: boolean
    evidence: { object_key, storage, uploaded_at, mime, size } | null

A separate `intervention_task_evidence` table is the alternative. JSONB is
chosen because the task is already a JSONB document, verification state already
lives there (`completed`, `completed_at`), and a second table would split one
record across two stores for no gain at this size.

### Upload path

Reuse the grade-change pattern exactly: upload to **Supabase Storage** with
`storage = 'supabase'`, and sign on read through the same branch. Accept image
and PDF only, with a size cap matching the evidence bucket's.

**This is why Part A does not wait for R2.** Built this way it inherits the R2
move for free, through the branch that already exists.

### Enforcement

The tick and the upload must be one server-side operation. A client that marks
`completed = true` without an `evidence` object on a `requires_evidence` task
must be refused by the RPC, not only by a disabled button — the same reasoning
as `trg_block_frozen_term_scores` in 20261031210000. A disabled control is a
courtesy; the guard is the control.

### Retention

Evidence lives as long as the intervention record, and is archived with it at
term rollover. The alternative — purge at term end, keep only the
verified/not-verified flag — was rejected: a verified outcome that can no longer
be justified is weak evidence for **Hypothesis 2**, which rests on the
<!-- SUPERSEDED 2026-11-03: there is no Hypothesis 2. The study now has one
     unified acceptability hypothesis (TAM + ISO/IEC 25010), and outcome
     tracking is functional evidence rather than a hypothesis under test. The
     retention argument below still holds, but the reason is ISO 25010
     functional correctness -- which experts score against an 80% threshold --
     not a hypothesis. Left in place because dated audits are a record. -->
baseline-to-follow-up pairing being auditable after the fact.

Storage grows per term. At this scale that is the cheaper problem.

---

## Part B — The R2 migration

Separate work, driven by cost and retention rather than by any feature.

1. Implement `r2-storage` actions beyond `health`: `sign-upload`,
   `sign-download`, `delete`. Each authorizes separately — the function's own
   comment notes that **R2 enforces nothing itself**.
2. Write `grade-change-evidence`, which the client already calls for
   `storage = 'r2'` rows.
3. Flip new uploads to `storage = 'r2'`. Existing rows stay on Supabase Storage
   and keep working, because the read path already branches.
4. Stage 9d's **R2 metering on Storage Health** becomes testable — it is on the
   "paths with no evidence" list and cannot be exercised until this lands.

Nothing needs migrating. That was designed in.

---

## Sequencing

1. **Part A, after pass A.** It touches the faculty evaluation modal and the
   student's Faculty Action Plans page — both on the Stage 7 path. Additive, and
   not blocked by anything.
2. **Part B, when the storage decision is made.** The owner has stated R2 comes
   after phase 7. Part A does not wait for it.

## Documentation

Part A is **new scope the paper does not describe**. Chapter 2's intervention
module would need the evidence step added, and it strengthens Objective 5: task
verification becomes a check against submitted work rather than a second click.

Part B is an infrastructure change and needs no paper change.
