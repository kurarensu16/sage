# Phased QA and Codebase Remediation Plan — 2026-10-21

**Status:** Phase 1 implemented locally on 2026-10-21; awaiting manual application of migration `20261021110000_sg_correction_batch_preflight.sql` and live acceptance QA. Phase 2 remains planned.  
**Scope:** The QA findings reported for SG correction and report exports, followed by the broader codebase-audit findings.  
**Evidence basis:** Static source review, supplied QA screenshots, local build/lint/verification scripts, and migration review. The production database was not queried during this audit.

## Implementation status

Phase 1 now has a shared approved-correction payload planner in both faculty posting screens, a server-side preflight RPC, formatted Class Performance and Performance Comparison workbooks, and a department-agnostic automated verification using Maritime and IT fixtures. The existing posted-grade trigger remains the final guard and remains responsible for consuming a request only after a successful grade update.

Before live use, the device owner must apply `supabase/migrations/20261021110000_sg_correction_batch_preflight.sql` through the approved Supabase migration process, deploy the client, and execute the Phase 1 Maritime and IT acceptance cases against the live QA data. No remote migration or production-data action was performed in this change.

## Objective

Resolve the reported grading and export defects without weakening official-grade controls, then address the underlying integrity, security, and maintainability risks that could cause future regressions.

The work is deliberately divided into two phases:

| Phase | Purpose | Release gate |
| --- | --- | --- |
| **Phase 1 — QA defect remediation** | Fix the confirmed issues reported in QA: SG correction posting, corrected-grade consistency, and readable XLSX reports. | All Phase 1 workflow and two-department acceptance tests pass. |
| **Phase 2 — codebase hardening** | Make official grades server-authoritative, close access-control/audit gaps, and reduce duplicate workflow paths. | Security, migration, regression, and performance checks pass. |

## Non-negotiable rules

- Do not add department-, program-, or section-specific rules. The SG issue is system-wide; Maritime was only the QA dataset.
- Do not remove or weaken the approved-and-unused correction-request guard. A changed official SG must remain rejected unless its approved request precisely authorizes it.
- Consume a correction request only when the related official-grade update succeeds, in the same database transaction.
- Create new timestamped migrations for database changes; do not rewrite already-applied migrations.
- Preserve posted-grade history and existing request records during any data repair or migration.
- Treat the current official posted grade as the exported grade until an approved correction has been successfully posted. An unposted proposal must not silently replace the official value in exports.

## Confirmed findings and planned disposition

| ID | Phase | Priority | Finding | Planned outcome |
| --- | --- | --- | --- | --- |
| QA-GRADE-01 | 1 | Critical | A roster-level post can contain multiple changed students, while an approved correction request authorizes one existing posted grade. A later unmatched student causes the atomic post to fail with the generic “approved, unused SG correction request” error. | Add a clear per-student correction preflight and align the batch payload with the approved request(s), while retaining atomic posting. |
| QA-GRADE-02 | 1 | Critical | The request proposal, preview, and posting path can derive grade values from different sources. An approved proposal can therefore disagree with the master grade, preview, or grade submitted for posting. | Establish one correction payload contract and validate the same approved values at preview and posting time. |
| QA-EXPORT-01 | 1 | High | Class Performance XLSX is a raw, crowded worksheet with no report structure, widths, filters, or frozen headers. | Produce a readable, formatted worksheet without changing report data semantics. |
| QA-EXPORT-02 | 1 | High | Performance Comparison XLSX sheets are minimally formatted and difficult to compare. | Add report titles, consistent layouts, number formats, readable widths, filters, and frozen headers. |
| AUDIT-GRADE-01 | 2 | Critical | The official-grade posting RPC accepts client-supplied computed/effective grade values instead of calculating the authoritative result from persisted scores and the approved grading configuration. | Move official-grade computation and validation to the server-side transaction. |
| AUDIT-AUTH-01 | 2 | Critical | A user can update broad portions of their own profile row; current protection principally prevents role/status changes. | Limit self-service fields through an allowlist RPC or database trigger and review sensitive directory visibility. |
| AUDIT-WORKFLOW-01 | 2 | High | Consultation updates and client-created audit logs are too permissive for the intended workflow/audit model. | Separate allowed participant actions from privileged resolution actions, and generate audit events server-side. |
| AUDIT-MAINT-01 | 2 | High | Duplicate grade-posting paths and mixed browser/DB score state increase the chance of workflow drift. | Consolidate official posting and use the database as the canonical workflow state. |
| AUDIT-QUALITY-01 | 2 | Medium | The build passes, but lint has existing warnings, the main client bundle is large, and one local referral verification script has an unresolved dependency. | Remove warnings, split heavy client paths where practical, and restore repeatable verification. |

## Phase 1 — QA defect remediation

### 1. Define and enforce the SG correction contract

Document and implement one shared contract for an official SG correction:

- The request must identify the exact existing posted-grade record for the student, class/section offering, and term.
- The request must be in the approved, unused state and must exactly match the final corrected computed grade, effective grade, and remark/standing that will be posted.
- Posting must evaluate every changed student in the submitted roster. If any changed student lacks a matching approved request, preflight must identify that student and the database transaction must apply no grade updates and consume no requests.
- A successful update must mark only the request(s) used by that successful update as applied/consumed, in the same transaction.
- A failed, cancelled, retried, or preview-only operation must not consume a request.

This phase will use the existing correction-request identity, status, proposed-value, and applied-history fields. **No new database column is planned initially.** A new column would not correct the current mismatch, which is caused by inconsistent use of existing data.

### 2. Align request, master grade, preview, and post

Refactor the correction flow so that the same approved correction data is used consistently by:

1. the faculty request screen;
2. the dean approval screen;
3. the grade computation/master view;
4. the “Confirm Official Semestral Grade (SG) Update” preview;
5. the final post request; and
6. the official-grade XLSX export after a successful post.

The implementation must also remove or route the duplicate client-side posting path through the same validation/payload builder. The final server-side guard remains the authoritative enforcement point.

### 3. Improve XLSX report readability

Apply a reusable workbook formatting standard to the Class Performance and Performance Comparison exports:

- descriptive report title, context (class/term), and generated timestamp;
- grouped, readable headings with wrapping;
- sensible column widths and row heights;
- bold, filled header rows with borders;
- frozen heading rows and auto-filters where appropriate;
- consistent percentage and numeric formats;
- separate, labelled comparison/distribution/component sheets where applicable; and
- printable layout that does not alter the source metrics.

The current source routes place these reports under Faculty pages. Before changing role ownership or navigation, confirm whether “Dean Portal” describes the intended role or only the QA test account/location.

### 4. Phase 1 acceptance tests

Add automated database/integration tests and execute the end-to-end acceptance scenarios in at least two departments: **Maritime** and **IT**. Use equivalent test data only; do not branch behavior by department.

| Test | Expected result |
| --- | --- |
| Approved request for the exact student/class/term/final values | Post succeeds; official values update; that request becomes applied/used once. |
| No request | Post is rejected; no grade/request state changes. |
| Already-used request | Post is rejected; no second use is possible. |
| Approved request for another class or term | Post is rejected; unrelated approval is never accepted. |
| Batch containing one authorized correction and one unauthorized changed student | Preflight identifies the unauthorized student; the atomic post makes no partial grade changes and consumes no request. |
| Approved correction values versus master/preview/final post | All show the same final grade, GWA/effective grade, and standing. |
| Export before and after successful correction | Before post, XLSX shows the current official record; after post, it shows the newly posted official record. |
| Class Performance and Comparison XLSX | Workbook opens cleanly, headers remain visible, data is legible, and metrics match the UI source data. |

Phase 1 quality gate:

- relevant migration/RPC integration tests pass;
- Maritime and IT workflows both pass;
- project build passes;
- existing grading, CSV, XLSX, insights, and evaluation verification scripts pass or any unrelated environment failure is documented separately;
- no department-specific condition is introduced; and
- a failed batch leaves no partial official-grade or request-consumption state.

## Phase 2 — Codebase hardening and workflow improvements

### 5. Make official grades server-authoritative

Move the calculation of computed grade, effective grade/GWA, remark, and standing into the server-side posting transaction. The server must derive the result from persisted reviewed scores and the active approved grading configuration, then compare it with the correction authorization where a correction is required.

This is sequenced after the Phase 1 contract alignment because it is a wider behavioural change. It must rerun all Phase 1 grade tests after implementation.

### 6. Consolidate workflow and data ownership

- Adopt one official grade-posting route and retire or redirect duplicate client implementations.
- Use database-backed score/review state as canonical; browser storage may support a recoverable draft only, never authoritative posting state.
- Add clear server preflight/result details for mixed-success candidate batches, while keeping final official posting atomic.
- Define correction-request state transitions and idempotency rules in developer documentation.

### 7. Harden authorization, privacy, and auditability

- Limit self-profile updates to explicitly approved personal fields; keep role, status, department assignment, and other privileged attributes protected.
- Review broad user-directory reads and disclose only the profile data each role needs.
- Restrict consultation updates to the exact action allowed for the current participant; route faculty/dean resolution through an audited privileged action.
- Stop accepting arbitrary client-created audit events as authoritative history. Create material audit records within server-side workflow transactions.
- Add positive and negative authorization tests for each changed policy/RPC.

### 8. Improve operational quality

- Resolve existing lint warnings, especially hook dependency and unused-import warnings in active workflow screens.
- Repair the local referral-verification environment/dependency so the verification suite is reproducible.
- Split large client modules/lazy-load non-critical views where practical, then measure build-size improvement.
- Standardize exported-workbook helpers so future reports inherit readable defaults.
- Document release, rollback, data-validation, and monitoring steps for database migrations.

## Delivery order and dependencies

| Order | Work item | Depends on | Completion evidence |
| --- | --- | --- | --- |
| 1 | Baseline datasets and correction-flow trace | None | Reproducible Maritime and IT fixtures; documented request-to-post identifiers. |
| 2 | Phase 1 SG contract and batch preflight | 1 | Automated positive/negative/atomicity tests pass. |
| 3 | Phase 1 value alignment | 2 | Request, master, preview, post, and XLSX regression tests agree. |
| 4 | Phase 1 XLSX formatting | 1 | Visual workbook review plus metric parity checks pass. |
| 5 | Phase 1 release validation | 2–4 | All Phase 1 acceptance tests and build checks pass. |
| 6 | Phase 2 server-authoritative computation | 5 | Server-derived grade integration tests and Phase 1 regression tests pass. |
| 7 | Phase 2 workflow/auth/audit hardening | 5–6 | Policy/RPC negative tests and migration validation pass. |
| 8 | Phase 2 quality/performance work | 5–7 | Cleaned verification outcomes and measured build/lint improvements. |

## Current-state impact

| Area | During planning | After Phase 1 | After Phase 2 |
| --- | --- | --- | --- |
| Existing posted grades | No change. | Preserved; only successfully authorized corrections update them. | Preserved; posting calculation becomes server-derived. |
| Existing correction requests | No change. | Remain usable if they match the final proposed values; no blanket reset or automatic consumption. | State-transition/audit rules are further hardened. |
| Database schema | No change and no new column planned for Phase 1. | New migration(s) only if RPC/trigger corrections require them; existing history retained. | New migration(s) for server authority and authorization hardening, with rollback/data-validation plans. |
| Faculty workflow | No change. | Clear per-student correction feedback; valid batch corrections post reliably. | One canonical posting workflow with more reliable drafts/state. |
| Dean workflow | No change. | Approval remains required and applies only to the exact correction. | More constrained privileged workflow and stronger audit evidence. |
| XLSX exports | No change. | Readability/formatting improves; official data semantics stay unchanged. | Shared export standards reduce future drift. |

## Decisions recorded

1. Phase 1 is limited to the original QA findings. The broader audit is Phase 2.
2. The SG fix is system-wide. No department-specific implementation is authorized or required.
3. The guard stays strict; the fix is correct matching, consistent payloads, useful preflight feedback, and transactional consumption.
4. Do not add a correction-request column unless implementation demonstrates that an existing field cannot express a required invariant.
5. “Used” means successfully applied to an official grade update, not merely approved, previewed, or attempted.
6. Report-export changes are presentation improvements; they must not recalculate or silently substitute unposted proposed grades.

## Definition of done

Phase 1 is complete only when every listed SG scenario passes in Maritime and IT, the corrected values are identical across master/preview/post/export at the appropriate state, requests are consumed only after successful posting, and both XLSX reports are readable and data-accurate.

Phase 2 is complete only when official grades are server-derived, privileged updates and audits are constrained to intended actors, duplicate workflow paths are removed or routed through one canonical path, and the relevant automated checks provide repeatable evidence of those guarantees.
