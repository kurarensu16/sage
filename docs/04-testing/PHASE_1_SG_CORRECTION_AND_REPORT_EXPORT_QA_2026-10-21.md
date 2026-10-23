# Phase 1 SG Correction and Report Export QA — 2026-10-21

**Last updated:** 2026-10-22
**Scope:** Server-authoritative P0 SG corrections and the Class Performance / Performance Comparison XLSX exports, plus Admin Grade Override regression coverage.
**Rule:** Execute every SG case once in **Maritime** and once in **IT**. The department is test data only; expected behaviour must be identical.

**Safety rule:** The posting payload intentionally carries the roster. Verify from official rows/revisions that only the student with an approved correction changes; every unrelated SG must be preserved.

## Prerequisites

1. Apply migrations `20261022120000_grade_posting_p0_foundation.sql`, `20261022121000_server_authoritative_grade_posting.sql`, and `20261023073500_enforce_sg_basis_lock.sql` in that order.
2. Deploy the matching client build.
3. Use a faculty account assigned to a test class and the Dean account for that class's department.
4. Select students whose official SG is already posted and locked. Record the original Rating, GWA, Standing, class, and term before each test.
5. Use a fresh student/posted-grade record for each approval test. An applied request cannot be reused.
6. Confirm `to_regprocedure('post_grade_milestone_v2(uuid,uuid,text,jsonb,jsonb,jsonb)')` and `to_regprocedure('get_class_grade_projection(uuid,uuid[])')` resolve, reload the PostgREST schema, then sign out, hard-refresh, and sign in again before testing.

## Deployment validation

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| ENV-01 | Authoritative posting RPC is available | Open Post Grades and inspect the browser console and network log. | No `404` occurs for `/rpc/post_grade_milestone_v2`; the request reaches the secured transaction. |

## SG correction workflow

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| SG-01 | Exact approved correction posts | Faculty requests a changed Standing against the locked official score basis; Dean approves; faculty posts SG. | The server recalculates Rating/GWA, validates the approval, changes only authorized official values, keeps the row locked, and marks the request applied once. |
| SG-02 | No request is preserved | Cause the live preview to differ from an already-posted SG without an approved request, then post the roster. | The server preserves that official SG byte-for-byte. No authorized correction or new revision is created. |
| SG-03 | Used request is not reused | Complete SG-01, retry with the same operation ID, then post again without a new approval. | The retry returns the committed result; the later post preserves the SG. No second correction-history entry is created. |
| SG-04 | Different class is rejected | Approve a correction for Student A in Class/Section 1. Attempt a changed post for Student A in another class/section. | Posting is blocked. The approval for Class/Section 1 is untouched. |
| SG-05 | Different term is rejected | Approve a correction attached to one posted SG, then attempt to use it for a different term/class record. | Posting is blocked. The unrelated approval is untouched. |
| SG-06 | Mixed roster isolates authorization | Arrange one exact approved correction and one unrelated drifted official SG without approval in the same roster. Post. | The approved correction is applied atomically; the unrelated SG is preserved with the same revision and provenance. |
| SG-07 | Failed attempt does not consume | Make the approved percentage/GWA disagree with the server projection and post. | The transaction rolls back, official SG and notifications remain unchanged, and the request remains approved. |
| SG-08 | Retry safety | After a successful SG-01 post, refresh and retry the same action. | The system does not apply the request twice or create a second correction-history entry. |

## MR/TFR revision and SG lock boundary

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| PROG-01 | Revise MR before SG | Post MR, change one Prelim/Midterm score, then select Update MR. | No override request is required. The server recalculates MR, updates only changed official rows/revisions, and queues the normal grade-change notification. |
| PROG-02 | Revise TFR before SG | Post TFR, change one Semi-Final/Final score, then select Update TFR. | No override request is required. The server recalculates TFR and queues the normal grade-change notification. |
| PROG-03 | SG freezes progress ratings | Finalize SG, then attempt direct score edits and direct RPC reposts for MR and TFR. | UI controls are read-only/disabled and database calls reject. MR, TFR, SG, attendance basis, and revisions remain unchanged. |
| PROG-04 | Locked SG does not autosave | With browser developer tools open, load and refresh a class whose SG is posted. | No POST/DELETE request is sent directly to `student_term_scores` or `student_activity_scores`; no 403 lock errors appear. The server values remain displayed even if the browser previously held a `pendingSync` draft. |

## Consistency and export checks

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| ALIGN-01 | Proposal → confirmation → official post | For SG-01, compare the approved request, confirmation dialog, and final official posted grade. | Rating, GWA, and Standing match exactly at all three points. |
| ALIGN-02 | Official grade XLSX before/after post | Export the official grade workbook before the approved correction posts, then export again after SG-01. | Before posting, export shows the existing official grade. After posting, it shows the new official grade. An unposted proposal never silently replaces an official export value. |
| XLSX-01 | Class Performance Report | Export a class with several activities and students. | Workbook opens without repair prompts; title/context/timestamp are visible; headings wrap; columns are readable; header row is frozen; filter is available; displayed metrics match the portal. |
| XLSX-02 | Performance Comparison | Export target/reference comparison with distribution and component data. | Comparison, Distribution, and Components sheets are labelled and readable; headings are frozen/filtered; widths and number layouts support comparison; metrics match the portal. |

## Supplemental Admin Grade Override regression

These cases protect the separate audited Admin Override workflow. They do not replace the faculty-to-Dean SG correction approval path.

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| ADMIN-01 | Execute an official override | Admin changes one already-posted SG GWA/Standing and supplies a reason. | The official posted grade changes, a correction-history record is created, the administrative request is applied, and underlying activity/term scores remain unchanged. |
| ADMIN-02 | Student and Admin views agree | Reopen the student grade and Admin Grade Override record. | Both views display the new official GWA/Standing. |
| ADMIN-03 | Faculty preview preserves the official override | Open Grade Computation Preview for the same class and record both the score-derived and official overridden values. | The official override is clearly preserved and is not presented as an unapproved faculty change. |
| ADMIN-04 | Roster repost preserves unrelated overrides | Post a roster containing an unrelated active Admin Override. | The Admin Override is preserved with the same revision/source unless it has its own approved correction. |
| ADMIN-05 | Official export reflects the override | Export immediately before and after the successful override. | The post-override official XLSX contains the overridden GWA/Standing and does not substitute the old score-derived result. |

## Evidence to attach

For each department, attach:

- screenshot of the approved request and the confirmation dialog;
- screenshot or query result showing request status before and after successful posting;
- screenshot of one rejected case, including the affected-student message;
- browser console/network capture showing ENV-01 and any failure response;
- exported XLSX files for XLSX-01 and XLSX-02; and
- official grade values before and after ADMIN-01, plus the ADMIN-03 comparison; and
- a short note identifying the class/term/test student IDs used (do not include sensitive student data in public reports).

## Exit criteria

- ENV-01 passes with no RPC `404`.
- SG-01 through SG-08 pass in Maritime and IT.
- ALIGN-01 and ALIGN-02 pass for at least one successful correction in each department.
- XLSX-01 and XLSX-02 pass with no metric mismatch.
- ADMIN-01 through ADMIN-05 pass before the Admin Grade Override workflow is released.
- No test required a department-, program-, or section-specific code path.
