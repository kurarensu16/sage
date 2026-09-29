# ASPIRE Student Risk Module — Revised Implementation Plan

**Status:** Recommended implementation baseline  
**Version:** 2.0  
**Updated:** September 26, 2026  
**Primary privacy framework:** Republic Act No. 10173, the Philippine Data Privacy Act of 2012, its Implementing Rules and Regulations, and applicable National Privacy Commission issuances  
**Risk engine:** ASPIRE v4.0

---

## 1. Executive Decision

The Student Risk Module should become a privacy-safe, explainable, and closed-loop intervention workflow. The implementation must prioritize data protection and intervention accountability before introducing asynchronous risk snapshots.

The revised delivery order is:

1. Contain the current private-note exposure.
2. Separate student-visible feedback from restricted faculty/dean notes.
3. Normalize intervention tasks and secure student completion actions.
4. Make every risk surface consume one complete v4.0 evaluation result.
5. Resolve and test trajectory-policy decisions.
6. Reorganize the faculty interface around intervention workflow.
7. Benchmark current roster performance.
8. Add durable risk snapshots only when measurement demonstrates a need.

This order reduces immediate institutional risk while avoiding premature infrastructure complexity.

---

## 2. Non-Negotiable Product Rules

### 2.1 Privacy and access

- Student-visible feedback and restricted internal notes must not share a student-queryable record.
- Private faculty/dean notes must never be sent to the student portal, Ask ASPIRE, notification bodies, exports, or student-accessible database views.
- New risk and intervention tables must have Row Level Security enabled before production use.
- Access must follow least privilege, purpose limitation, data minimization, and auditable disclosure.
- Private notes should contain academically relevant observations only. Avoid unsupported psychological, medical, character, or disciplinary conclusions.

### 2.2 Academic authority

- `src/lib/riskEngine.js` remains the single source of truth for institutional risk computation.
- The AI may explain an authoritative risk result but may not calculate or modify it.
- Absences do not deduct numerical grade points.
- Four or more absences may trigger an FDA recommendation, but faculty retains the official decision.
- Unencoded future terms are `null` and must never default to zero.
- Student-facing early guidance may use released activity evidence but must not present an unofficial term grade.

### 2.3 Intervention authority

- Faculty assigns or modifies intervention tasks.
- Students may report task completion but may not alter task wording, deadlines, ownership, escalation state, or evaluation evidence.
- Dean escalation is an explicit, reasoned, auditable faculty action. An overdue task does not automatically prove refusal or misconduct.

---

## 3. Verified Current-State Findings

### 3.1 Private-note exposure

The current `professor_notes` field is written by faculty and selected directly by multiple student pages. Some interface copy explicitly tells faculty that qualitative observations will be delivered to the student. This creates a genuine risk that internal observations will be disclosed beyond their intended audience.

### 3.2 Student-controlled JSON plan

The student advising inbox updates the complete `advising_plan` JSON value when a task is checked. Without restrictive database policies, a student request could modify fields other than completion status.

### 3.3 Inconsistent risk recomputation

The roster evaluates missing work, attendance, grades, and trajectory. The evaluation modal recomputes risk with a smaller input set. A faculty user can therefore see a different score after opening the same student.

### 3.4 Missing-work ambiguity

A numerical zero is not sufficient evidence that work is missing. It may represent an earned zero, an ungraded activity, a future activity, or a true non-submission. Ghost-student detection requires explicit activity availability, deadline, and submission status.

### 3.5 Performance claim not yet demonstrated

`getClassPriorityRoster` performs several database reads and calculates the roster in the client. It may need optimization, but no benchmark currently demonstrates that asynchronous snapshots are required.

---

## 4. Phase 0 — Immediate Privacy Containment

### Goal

Stop new internal observations from appearing in student-facing surfaces while the safe schema is introduced.

### Actions

- Change faculty form wording so it clearly distinguishes student-visible feedback from restricted notes.
- Remove `professor_notes` from all student queries and displays.
- Remove private notes and raw faculty risk-evaluation objects from Ask ASPIRE context.
- Keep existing records available only to authorized faculty/dean workflows during migration.
- Audit notifications, exports, reports, and logs for copied note text.

### Acceptance criteria

- No student route requests or renders the legacy `professor_notes` field.
- Ask ASPIRE receives only explicitly student-visible feedback and released evidence.
- Faculty sees a clear disclosure label before submitting student-visible feedback.

---

## 5. Phase 1 — Privacy-Safe Notes Architecture

### 5.1 Recommended schema

Use separate tables rather than two columns on one broadly queried table.

#### Student-safe evaluation record

Add to `student_risk_evaluations`:

- `shared_academic_feedback TEXT`
- `published_to_student_at TIMESTAMPTZ`
- `published_by UUID`

#### Restricted note record

Create `student_risk_private_notes`:

| Column | Purpose |
|---|---|
| `note_id UUID PRIMARY KEY` | Stable record identity |
| `evaluation_id UUID` | Parent risk evaluation |
| `author_id UUID` | Faculty/dean author |
| `note_text TEXT` | Restricted academically relevant note |
| `created_at TIMESTAMPTZ` | Audit timestamp |
| `updated_at TIMESTAMPTZ` | Audit timestamp |
| `retention_class TEXT` | Retention/disposition category |

### 5.2 Access model

- Students may select only their published evaluation fields and shared feedback.
- Students receive no access to `student_risk_private_notes`.
- Assigned faculty may access notes for their own class records.
- The authorized dean may access notes for students within the dean's department.
- Administrative access must be explicitly justified and logged.
- The application must not rely on hidden UI controls as access control.
- Enable RLS on every newly introduced risk, note, task, and escalation table from its first deployment. The existing development posture of disabled RLS is legacy debt, not a precedent for new sensitive data.
- Removing a field from the student interface or Ask ASPIRE payload is immediate containment only; it is not a complete security boundary while direct database access remains possible.
- Revoke unnecessary direct table privileges and expose student mutations only through narrowly scoped operations.
- Any `SECURITY DEFINER` function must validate `auth.uid()`, authorize access to the parent record, set a fixed `search_path`, and update only the permitted columns.
- Seed and migration operations that require elevated access must use the service role rather than weakening student-facing policies.

### 5.3 Safe migration sequence

Do not add, copy, and drop the legacy column in one migration.

1. Add the new shared field and restricted notes table.
2. Enable and test RLS policies.
3. Backfill existing `professor_notes` into the restricted table by default.
4. Update faculty and dean writes/reads.
5. Update every student read path to use `shared_academic_feedback` only.
6. Run a cross-role access test using real authenticated sessions.
7. Monitor for legacy-column reads.
8. Remove the old column in a later migration after verification.

### 5.4 Required migration safety

- Migrations must be additive and idempotent where practical.
- Foreign keys must define deletion behavior intentionally.
- Backfill counts must be recorded before and after migration.
- A rollback or restoration query must be documented before legacy-column removal.

---

## 6. Phase 2 — Normalized Intervention Workflow

### 6.1 Evaluation-owned tasks

Create `intervention_tasks` with:

| Column | Purpose |
|---|---|
| `task_id UUID PRIMARY KEY` | Stable task identity |
| `evaluation_id UUID NOT NULL` | Parent evaluation |
| `description TEXT NOT NULL` | Faculty-authored action |
| `target_term TEXT` | Academic milestone context |
| `due_date DATE` | Target completion date |
| `assigned_by UUID NOT NULL` | Faculty owner |
| `assigned_at TIMESTAMPTZ NOT NULL` | Assignment timestamp |
| `started_at TIMESTAMPTZ` | Optional student start signal |
| `student_completed_at TIMESTAMPTZ` | Student completion claim |
| `faculty_verified_at TIMESTAMPTZ` | Optional faculty verification |
| `revision_requested_at TIMESTAMPTZ` | Faculty request for changes |
| `revision_note TEXT` | Student-visible explanation of required changes |
| `revision_due_date DATE` | Revised deadline when changes are requested |
| `cancelled_at TIMESTAMPTZ` | Faculty cancellation |
| `updated_at TIMESTAMPTZ NOT NULL` | Audit timestamp |

### 6.2 Task state

Persist only durable workflow facts. Derive display states:

- `assigned`: no start or completion timestamp and the effective due date has not passed
- `in_progress`: started but not submitted, and the effective due date has not passed
- `overdue`: the effective due date has passed and no student completion submission exists
- `pending_faculty_review`: the student submitted completion and no later revision request or faculty verification exists
- `revision_required`: the latest faculty revision request is newer than the latest student completion submission
- `completed`: faculty verification exists and is newer than the latest student submission or revision request
- `cancelled`: cancellation timestamp exists

The effective due date is `revision_due_date` when present; otherwise it is the original `due_date`.

A task submitted by the student before or after its due date immediately becomes `pending_faculty_review`, not `overdue`. Delayed faculty review must not penalize the student or create an automatic dean escalation. When faculty requests changes, a student-visible reason and a new deadline are required.

Do not persist `overdue` as a manually maintained status because it becomes stale as time passes.

### 6.3 Student update boundary

Students must not update task rows directly with arbitrary payloads. Use a narrow RPC or Edge Function such as:

- `start_intervention_task(task_id)`
- `complete_intervention_task(task_id)`

Each operation must verify that the authenticated student owns the parent evaluation and may update only the permitted timestamp.

Faculty-only operations should separately handle verification and revision requests, for example:

- `verify_intervention_task(task_id)`
- `request_intervention_task_revision(task_id, revision_note, revision_due_date)`

Direct client updates to the task row must not be the authorization mechanism.

### 6.4 Migration from JSON

1. Create the normalized table and policies.
2. Backfill each `advising_plan` array item while preserving legacy `task_id`, description, due date, and completion timestamp.
3. Temporarily dual-read normalized tasks with a legacy fallback.
4. Verify task counts and completion counts per evaluation.
5. Stop JSON writes.
6. Remove the JSON field only after every faculty, student, dean, dashboard, notification, and report consumer is migrated.

---

## 7. Phase 3 — Dean Escalation as an Auditable Event

Create `intervention_escalations` instead of placing a single notification timestamp on a task.

| Column | Purpose |
|---|---|
| `escalation_id UUID PRIMARY KEY` | Stable event identity |
| `evaluation_id UUID NOT NULL` | Intervention being escalated |
| `task_id UUID` | Optional related overdue task |
| `requested_by UUID NOT NULL` | Faculty actor |
| `reason TEXT NOT NULL` | Human-entered rationale |
| `requested_at TIMESTAMPTZ NOT NULL` | Audit timestamp |
| `status TEXT` | `pending`, `acknowledged`, `resolved`, or `dismissed` |
| `resolved_by UUID` | Dean actor |
| `resolved_at TIMESTAMPTZ` | Resolution timestamp |
| `resolution_note TEXT` | Dean disposition |

### Escalation rules

- Show `Notify Dean` only to authorized faculty.
- An overdue task may enable the action but must not submit it automatically.
- Require a reason and confirmation before submission.
- Do not describe an overdue task as intentionally ignored.
- Notify the relevant dean only after the escalation record is committed.
- Preserve every escalation event for audit instead of overwriting a single field.

---

## 8. Phase 4 — Risk Consistency and Engine Governance

### 8.1 One complete evaluation object

`calculateAcademicRisk` must be called once with a complete input contract. The resulting object should be passed to the roster, modal, dean view, and reports.

The evaluation modal should use `student.risk_analysis` from the roster rather than recomputing with missing factors.

### 8.2 Engine versioning

Add a constant such as `RISK_ENGINE_VERSION = '4.0.0'` and record it with persisted evaluations or snapshots. A historical decision must remain explainable even after the engine changes.

### 8.3 Missing-work rule

Count missing work only when all conditions are true:

1. The activity is configured and released.
2. Its submission deadline has passed.
3. The student's submission status is explicitly `missing` or no submission exists under an approved rule.
4. The record is not excused, waived, or awaiting faculty grading.

Until these fields exist, label zero scores as zero scores—not confirmed missing submissions.

### 8.4 Separate academic progression risk from honors opportunity

The current language sometimes treats loss of honors eligibility as academic risk. These are different student conditions and must be displayed separately:

- **Academic progression risk** asks whether the student is in danger of failing, becoming ineligible to progress, or requiring urgent intervention.
- **Honors opportunity** asks whether the student remains eligible for President's List, Dean's List, or another recognition threshold.

Recommended policy, subject to academic-owner approval:

- A general-track GWA of `2.25` remains Low academic risk when no other risk factors exist.
- A GWA of `2.25` may be shown as below a selected honors target, but it must not be described as Moderate academic risk solely for that reason.
- Honors eligibility indicators should not silently add academic-risk points. If an institution-approved scholarship-retention rule requires intervention, identify it as a distinct policy factor.
- A grade-only failure maps to High risk under the current composite model.
- Critical risk is reserved for compounded conditions such as failure combined with severe attendance, confirmed missing work, or sustained decline, unless the academic owner approves a specific automatic-Critical rule.

The approved policy must be reflected consistently in the formula, evaluation context, test cases, interface labels, AI explanations, and defense guide.

---

## 9. Phase 5 — Trajectory Policy Rework

### Decision principle

Do not present two- or three-point trajectory as statistical outlier detection. These observations are insufficient for reliable outlier analysis. Use an explainable two-level decline rule that supports Midterm intervention and recognizes sustained decline later in the term sequence.

### Recommended rule

1. Build a chronological array from non-null term ratings only.
2. With two available ratings, calculate the latest-term delta so Prelim-to-Midterm decline can trigger early support.
3. Score the absolute latest decline using the approved thresholds:
   - greater than 5: 3 points
   - greater than 10: 7 points
   - greater than 15: 10 points
4. With three or more ratings, also examine the latest three ratings as two consecutive segments.
5. When both segments decline, calculate sustained-decline severity from the total decline across those three ratings using the same thresholds.
6. Set the trajectory contribution to the higher of the latest-decline score and sustained-decline score, capped at 10 points. Never add both scores and double-count the same evidence.
7. If the latest rating improves or remains stable, record the recovery. Any remaining sustained-decline result must be explained from the exact approved rule rather than inferred as an outlier.
8. Store the ratings, each delta, the latest-decline score, the sustained-decline flag and score, and the final capped contribution in the risk breakdown.

### Required test vectors

- Three steadily declining ratings
- One low middle-term rating followed by recovery
- One sudden latest-term drop
- Prelim-to-Midterm decline with only two ratings
- Two consecutive small declines whose combined decline crosses a threshold
- Severe latest decline combined with a sustained decline, proving the result remains capped at 10
- Tied ratings
- Missing middle term
- Zero as an encoded rating versus `null` as unencoded
- Threshold boundaries at exactly 5, 10, and 15 points of decline

No trajectory change should be released until the academic owner approves the expected result for every vector.

---

## 10. Phase 6 — Faculty Workflow Redesign

Use one Student Risk workspace with three workflow views:

### Priority Queue

- High and Critical students without an active intervention
- Sorted by risk score and oldest unaddressed signal
- Clear explanation of contributing factors
- Primary action: `Create Intervention`

### Active Interventions

- Evaluations with at least one active task
- Completion, overdue, and faculty-verification indicators
- Contextual `Notify Dean` action
- Primary action: `Review Progress`

### Full Class Roster

- All enrolled students
- Risk, GWA, attendance, missing-work confidence, and intervention state
- Faculty may evaluate any student, including Low or Moderate cases

Moderate students should appear as a watch state rather than being silently mixed with High/Critical priority cases.

---

## 11. Phase 7 — Performance Measurement Before Snapshots

### Benchmark first

Measure `getClassPriorityRoster` using representative classes of 30, 60, and 100 students.

Capture:

- number of database requests
- total rows transferred
- risk-computation time
- median and p95 page-load time
- repeated-load cache effectiveness

First optimize query selection, parallel fetches, indexing, and memoization. Introduce snapshots only when the measured result exceeds the agreed performance budget.

### Suggested performance budget

- p95 roster data load below 800 ms on a representative connection
- risk calculation below 100 ms for 100 students
- no unbounded row fetches
- no duplicated roster request during a single page render

---

## 12. Conditional Phase 8 — Durable Risk Snapshots

If benchmarks justify snapshots, use a durable database queue rather than in-memory Edge Function debouncing.

### Snapshot requirements

`risk_score_snapshots` should include:

- `snapshot_id`
- `student_id`
- `class_record_id`
- `term`
- `engine_version`
- `composite_score`
- `risk_level`
- `snapshot_data`
- `source_updated_at`
- `computed_at`
- `input_hash`

Add a unique constraint on student, class record, term, and engine version.

### Queue requirements

`risk_recompute_queue` should include:

- unique student/class/term target
- `requested_at`
- `not_before`
- attempt count
- last error
- processing/completion timestamps

Database triggers should upsert queue targets, not call the provider or recompute risk synchronously. A scheduled worker claims due rows, calculates with the shared engine, upserts snapshots, and records failures. The nightly job remains a reconciliation mechanism rather than the primary update path.

### Source-of-truth requirement

The frontend and worker must consume the same runtime-neutral risk core and the same versioned test suite. Do not copy the formula into an Edge Function.

---

## 13. Testing and Security Gates

### Cross-role privacy tests

- Student cannot select restricted notes through the API.
- Student sees only published shared feedback for their own evaluation.
- Faculty cannot access another faculty member's unrelated classes.
- Dean access is limited to the authorized department.
- Ask ASPIRE payload contains no restricted notes.

### Intervention authorization tests

- Student can mark only their own task complete.
- Student cannot change task text, due date, faculty owner, evaluation, or escalation state.
- Faculty can modify tasks only for assigned class records.
- Dean escalation produces an immutable audit event.

### Risk regression tests

- Non-null term averaging
- V4 grade-factor boundaries
- Attendance thresholds at 1, 2, 3, and 4 absences
- Missing-work confidence rules
- Composite cap at 100
- Tier boundaries at 24/25, 49/50, and 74/75
- Approved trajectory vectors
- Identical risk output in roster, modal, dean view, and persisted snapshot

### Migration verification

- Record counts before and after backfill
- No orphan tasks or notes
- No student-visible restricted field
- Legacy reads reduced to zero before column removal
- Rollback instructions tested in a non-production environment

---

## 14. Delivery Milestones

| ID | Deliverable | Priority | Status | Completion evidence |
|---|---|---:|---|---|
| SR-001 | Student note-exposure containment | Critical | Deployed | Student code and anonymous-access audit passes |
| SR-002 | Restricted notes table and RLS | Critical | Deployed; signed-in role walkthrough pending | Live RLS, grants, backfill, and build verification pass |
| SR-003 | Normalized intervention tasks and review state machine | High | Planned | Tampering, overdue, pending-review, revision, and verification tests pass |
| SR-004 | Auditable dean escalations | High | Planned | Escalation lifecycle test passes |
| SR-005 | Risk input consistency | High | Planned | Same student produces identical results across portals |
| SR-006 | Approved two-level trajectory policy | Medium | Planned | Academic owner signs off two-term and sustained-decline test vectors |
| SR-007 | Workflow-based faculty UI | Medium | Planned | Faculty usability walkthrough passes |
| SR-008 | Roster performance benchmark | Medium | Planned | Benchmark report completed |
| SR-009 | Risk snapshots and durable queue | Conditional | Conditional | Implement only if performance budget is missed |

---

## 15. Final Recommendation

Adopt the privacy separation, normalized intervention tasks, auditable dean escalation, risk consistency, and workflow-oriented interface.

Do not:

- drop the legacy notes column in the first migration;
- treat UI hiding as privacy enforcement;
- postpone RLS on newly introduced sensitive tables because older tables still have it disabled;
- allow students to update an entire intervention JSON document;
- penalize a student while a submitted task is waiting for faculty review;
- conflate honors eligibility with academic progression risk;
- describe a two- or three-point rule as reliable outlier detection;
- double-count latest decline and sustained decline;
- count every numerical zero as a missing submission;
- duplicate risk formulas in an Edge Function;
- introduce snapshot infrastructure before measuring the current bottleneck.

The revised design gives ASPIRE a defensible privacy posture, a clearer faculty workflow, and an intervention trail that can be evaluated without weakening institutional academic authority.
