# Phase 1 SG Correction and Report Export QA — 2026-10-21

**Scope:** Phase 1 only: approved SG corrections and the Class Performance / Performance Comparison XLSX exports.  
**Rule:** Execute every SG case once in **Maritime** and once in **IT**. The department is test data only; expected behaviour must be identical.

## Prerequisites

1. Apply migration supabase/migrations/20261021110000_sg_correction_batch_preflight.sql.
2. Deploy the matching client build.
3. Use a faculty account assigned to a test class and the Dean account for that class's department.
4. Select students whose official SG is already posted and locked. Record the original Rating, GWA, Standing, class, and term before each test.
5. Use a fresh student/posted-grade record for each approval test. An applied request cannot be reused.

## SG correction workflow

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| SG-01 | Exact approved correction posts | Faculty requests a changed Rating, GWA, and Standing; Dean approves; faculty opens the SG confirmation and posts. | The confirmation values equal the approved proposal. Posting succeeds. The official grade changes and the request status becomes applied once. |
| SG-02 | No request is rejected | Change an already-posted SG without submitting/approving a request, then attempt to post. | Posting is blocked. The message identifies the affected student. Official grade and request state remain unchanged. |
| SG-03 | Used request is rejected | Complete SG-01, then attempt to change/repost the same official SG again without a new approval. | Posting is blocked. The prior applied request is not reused or changed. |
| SG-04 | Different class is rejected | Approve a correction for Student A in Class/Section 1. Attempt a changed post for Student A in another class/section. | Posting is blocked. The approval for Class/Section 1 is untouched. |
| SG-05 | Different term is rejected | Approve a correction attached to one posted SG, then attempt to use it for a different term/class record. | Posting is blocked. The unrelated approval is untouched. |
| SG-06 | Mixed batch is atomic | Arrange one exact approved correction and one other changed official SG without an approval in the same confirmation batch. Post. | The preflight identifies the unauthorized student. No student in the batch receives a partial official-grade update, and the valid approval remains approved rather than becoming applied. |
| SG-07 | Failed attempt does not consume | Trigger any SG-02 through SG-06 failure with a valid approved request also present. Refresh the page and inspect the request. | The valid request remains approved; only a successful official-grade update may change it to applied. |
| SG-08 | Retry safety | After a successful SG-01 post, refresh and retry the same action. | The system does not apply the request twice or create a second correction-history entry. |

## Consistency and export checks

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| ALIGN-01 | Proposal → confirmation → official post | For SG-01, compare the approved request, confirmation dialog, and final official posted grade. | Rating, GWA, and Standing match exactly at all three points. |
| ALIGN-02 | Official grade XLSX before/after post | Export the official grade workbook before the approved correction posts, then export again after SG-01. | Before posting, export shows the existing official grade. After posting, it shows the new official grade. An unposted proposal never silently replaces an official export value. |
| XLSX-01 | Class Performance Report | Export a class with several activities and students. | Workbook opens without repair prompts; title/context/timestamp are visible; headings wrap; columns are readable; header row is frozen; filter is available; displayed metrics match the portal. |
| XLSX-02 | Performance Comparison | Export target/reference comparison with distribution and component data. | Comparison, Distribution, and Components sheets are labelled and readable; headings are frozen/filtered; widths and number layouts support comparison; metrics match the portal. |

## Evidence to attach

For each department, attach:

- screenshot of the approved request and the confirmation dialog;
- screenshot or query result showing request status before and after successful posting;
- screenshot of one rejected case, including the affected-student message;
- exported XLSX files for XLSX-01 and XLSX-02; and
- a short note identifying the class/term/test student IDs used (do not include sensitive student data in public reports).

## Exit criteria

- SG-01 through SG-08 pass in Maritime and IT.
- ALIGN-01 and ALIGN-02 pass for at least one successful correction in each department.
- XLSX-01 and XLSX-02 pass with no metric mismatch.
- No test required a department-, program-, or section-specific code path.
