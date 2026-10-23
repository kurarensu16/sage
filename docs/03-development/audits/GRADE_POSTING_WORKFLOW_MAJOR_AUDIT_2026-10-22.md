# Grade Posting Workflow Major Audit - 2026-10-22

**Status:** P0 remediation is implemented locally; both new migrations and live database acceptance remain pending. P1 consolidation and operational improvements remain open.  
**Release posture:** **Code complete for the P0 controls, but not production-certified until the migrations are applied and live database acceptance evidence is recorded.**  
**Scope:** Score persistence, local preview, MR/TFR/SG posting, reposting, Dean-approved SG corrections, administrative overrides, locking, archived classes, notifications, audit history, student/dean views, exports, RLS, migrations, and test coverage.  
**Related documents:** [Server-authoritative grading audit](SERVER_AUTHORITATIVE_GRADING_MAJOR_AUDIT_2026-10-21.md), [Phase 1 remediation plan](PHASED_QA_AND_CODEBASE_REMEDIATION_PLAN_2026-10-21.md), and [Phase 1 live QA](../../04-testing/PHASE_1_SG_CORRECTION_AND_REPORT_EXPORT_QA_2026-10-21.md).

## Executive verdict

The feature has several strong database controls, but it is not yet one coherent, server-authoritative posting system. It is a collection of two faculty posting clients, a transaction that persists client-calculated results, separate correction and override workflows, and downstream readers that do not always agree on what the official result means.

The reported Phase 1 failure is one symptom of that split. An unrelated administrative override was recomputed by the faculty client, included in the whole-class SG payload, and then correctly rejected by the SG-correction trigger because no Dean approval authorized that change. The local Phase 1 patch prevents an active administrative override from being included in an unrelated faculty repost. That removes the immediate blocker, but it does not eliminate the architectural conditions that produced it.

The audit found six release-blocking issues:

1. The browser, not the database, still supplies the official computed grade, effective GWA, remark, and milestone lock list.
2. Dean approval unlocks the live SG row; the faculty score editor then autosaves changes outside the final correction transaction and outside the approved score delta.
3. The posting RPC accepts a non-empty subset of the roster, while Dean posting status treats any posted row as a posted class.
4. Multiple downstream pages derive Passed/Failed from GWA and discard the official stored remark, which can misreport INC, FDA, Dropped, or a deliberate administrative outcome.
5. The administrative override RPC does not enforce the official grade ladder/range or grade-to-remark consistency on the server.
6. There is no database integration suite covering the actual RPCs, triggers, RLS rules, concurrency, rollback, and retry behavior.

The required direction is a single server projection and posting engine, one faculty posting path, a correction transaction that never unlocks live scores for ordinary autosave, and one shared official-grade resolver used by every screen, report, notification, and export.

### 2026-10-22 implementation update

The six P0 findings below are implemented in the local code and migrations. See [Grade Posting P0 Hardening](../implementation-reports/GRADE_POSTING_P0_HARDENING_2026-10-22.md) for the exact controls, migration order, and mandatory live release gate. Score-delta SG corrections are deliberately disabled rather than permitted through live autosave; the supported correction operation recalculates against the unchanged locked score basis.

Policy clarification: MR and TFR are consultation/progress ratings, not correction-controlled final grades. The assigned faculty may revise and re-post either milestone until SG is posted. The SG transaction is the final lock boundary; afterward MR/TFR inputs and reposts are blocked and SG changes require the audited correction workflow.

## Audit method and evidence

This was a source-level and migration-level audit. It traced:

- `ScoreInput.jsx`, `GradeComputationPreview.jsx`, `PostedGradesView.jsx`, `StudentRow.jsx`;
- `gradePostingService.js`, `gradeCorrectionService.js`, `sgCorrectionPosting.js`, `gradingMath.js`, `academicPolicy.js`, `gradeMilestones.js`, and `exportGradeResolver.js`;
- Dean review, posting-status, distribution, summary-report, and at-risk views;
- student grade list/detail/dashboard consumers;
- the atomic posting, SG correction, administrative override, RLS hardening, score-protection, class archive, roster closure, audit, and notification migrations; and
- the available grading, correction, Excel, CSV, lint, and production-build checks.

This audit did **not** connect to or mutate a deployed Supabase instance. Findings about deployed data, installed migration order, production RLS state, and live concurrency remain subject to the live acceptance gate.

### Verification baseline

| Check | Result | What it proves | What it does not prove |
| --- | --- | --- | --- |
| `npm run verify:grading` | Pass | Shared JavaScript grading fixtures and policy boundaries pass. | Database calculation or transaction behavior. |
| `npm run verify:sg-correction` | Pass | Client SG planner handles exact approvals and the local admin-override preservation case. | Trigger/RLS behavior on a real database. |
| `npm run verify:excel-export` | Pass | Current Excel fixture expectations pass. | Cross-screen agreement for every official remark/override. |
| `npm run verify:csv` | Pass | CSV fixture expectations pass. | Live roster, authorization, or correction behavior. |
| `npm run lint` | Pass with 60 warnings | No lint errors. | Runtime correctness; relevant hook warnings remain in `StudentRow.jsx` and posting pages. |
| `npm run build` | Pass | Production bundle compiles. | Workflow correctness; the main bundle remains about 4.76 MB before gzip. |

## Current workflow map

| Workflow | Current behavior | Primary authority |
| --- | --- | --- |
| Score entry | `StudentRow` debounces to local storage and directly upserts score tables. `Save All Scores` is a second persistence path. | Browser plus score-table RLS. |
| Preview | Both faculty pages calculate terms, MR, TFR, SG, GWA, and remarks in JavaScript. | Browser. |
| MR/TFR/SG post | Client sends calculated posted-grade rows to `post_grade_milestone_atomic`. The RPC validates ranges, identity, formula shape, and authorization, then persists the supplied results. | Client result, database persistence guard. |
| SG correction request | Faculty manually enters exact proposed SG percentage, GWA, remark, reason, and optional evidence URL. `proposed_score_changes` is supported by SQL but not populated by this UI. | Manual proposal. |
| Dean approval | Approval validates the official baseline and sets `posted_grades.is_locked = false`. | Database request state. |
| Correction application | Live score edits autosave first. During repost, the client replaces its calculated result with the exact approved proposal; triggers consume the approval and write immutable history. | Approved manual result, not a server recalculation. |
| Admin override | Admin RPC creates a synthetic approved request, updates effective GWA/remark, and lets correction triggers record history. | Admin-supplied result. |
| Notifications | Client dispatches after the official transaction. Dedupe keys reduce duplicates. | Best-effort client follow-up. |
| Official display/export | Most export paths use stored SG/GWA/remark, but several student/dean analytics re-derive standing from numeric GWA. | Mixed. |

## Controls that are already strong

The remediation should preserve these controls:

- `post_grade_milestone_atomic` is `SECURITY DEFINER`, checks the active assigned faculty, locks the class, uses a per-class/milestone advisory transaction lock, and commits reviewed blank-to-zero substitutions with the posted rows atomically.
- The class COG snapshot is checked for a valid component array and a weight total of 100%, and a conflicting submitted snapshot is rejected.
- Posted rows have a unique class/milestone/student identity and duplicate student IDs in one payload are rejected.
- Direct authenticated INSERT/DELETE access to `posted_grades` is revoked; reads are RLS-scoped, and ordinary direct updates are limited to active admins.
- Locked SG changes require an approved request with exact proposed values, must relock in the same update, and produce immutable `grade_correction_history`.
- Administrative override goes through an audited RPC and a synthetic correction request instead of bypassing correction history.
- Existing non-null posted-term scores cannot be cleared, and scored activity columns cannot be deleted.
- The class roster closes once an SG exists, reducing late-enrollee ambiguity.
- Notification dedupe keys prevent the common duplicate-delivery case.
- The Phase 1 client patch preserves unrelated active administrative overrides during faculty SG correction batches.

These are meaningful safeguards. The findings below concern the remaining gaps between authorization, calculation, inputs, downstream meaning, and recoverability.

## Findings register

### P0-01 - Official results are client-authoritative

**Status:** Implemented locally; migration and live acceptance pending.  
**Evidence:** `gradePostingService.js:28-35`; `GradeComputationPreview.jsx:898-943`; `ScoreInput.jsx:1521-1593`; `20261011130000_term_rollover_grace.sql:697-753`.

The RPC validates that `computed_grade` is 0-100 and that SG has an effective grade, but it never recalculates MR/TFR/SG from persisted scores. A stale client, duplicated calculation defect, browser modification, or crafted RPC call can submit a numerically valid result that does not match the score ledger. `remarks` and `locked_milestones` are client-supplied too.

**Required control:** The server must load the frozen calculation contract and persisted inputs, calculate the result, and write only that result. The client may submit the milestone, reviewed zero substitutions, correction request ID, and an idempotency key—not authoritative grades.

### P0-02 - Approved correction unlocks unrestricted live score mutation

**Status:** Implemented locally; migration and live acceptance pending.  
**Evidence:** `20261008160000_sg_correction_integrity.sql:338-383`; `StudentRow.jsx:75-215`; `StudentRow.jsx:362-366`; `20261008180000_grading_authorization_hardening.sql:340-374`.

Dean approval changes `posted_grades.is_locked` to false. The UI interprets that as permission to edit every score cell for the student, and each edit debounces directly into `student_term_scores` and `student_activity_scores`. Score RLS checks assigned-faculty ownership but does not enforce the official SG lock or bind the write to an approved request.

Consequences:

- score changes can persist even if the final SG repost fails;
- the faculty can change more cells than the Dean reviewed;
- the live score basis may diverge from the still-official SG during the revision window;
- a direct API client can bypass the UI lock; and
- canceling an approved request relocks the SG but does not roll back score edits already saved.

**Required control:** Approval must leave the official row and live score ledger locked. Correction edits must be staged separately and submitted to one `apply_sg_correction_v2` transaction that validates the request, applies only the approved delta, recalculates, writes the new official revision, consumes approval, records history, and queues notifications atomically.

### P0-03 - The approved result is substituted, not recalculated

**Status:** Implemented locally with containment: server recalculation is required and unstaged score-delta corrections are disabled.  
**Evidence:** `PostedGradesView.jsx:1371-1398`; `sgCorrectionPosting.js:27-33`; `sgCorrectionPosting.js:73-78`; `20261014130000_admin_grade_override_audited.sql:97-124`.

The UI tells faculty to enter values expected after the official engine recalculates corrected scores. At application time, however, `applyProposal` overwrites the locally calculated row with those manually entered values. The trigger proves only that the update equals the approved proposal; it does not prove that the proposal equals the score-derived result. `proposed_score_changes` exists in SQL, but the faculty UI does not send it.

**Required control:** The request should describe the intended score delta and exceptional standing reason. The server should calculate the resulting SG/GWA. Dean approval should be tied to the baseline revision, proposed delta, and resulting server projection hash.

### P0-04 - Partial roster posting is accepted and can be reported as complete

**Status:** Implemented locally; migration and live acceptance pending.  
**Evidence:** `20261011130000_term_rollover_grace.sql:512-514`; `20261011130000_term_rollover_grace.sql:686-756`; `GradePostingStatus.jsx:138-159`.

The atomic RPC requires only one posted row. It verifies enrollment per supplied student but never compares the first-post payload with the active enrolled roster. The Dean page labels a milestone “Posted” when at least one row exists. A crash, stale roster, filtered payload, crafted call, or future client defect can therefore create a partial official class while the oversight screen says complete.

The database already contains `get_term_sg_status`, which returns enrolled and posted counts, but the Dean page does not use it.

**Required control:** On first MR/TFR/SG posting, the server must require exactly one row/result for every active enrolled student. Corrections must use a distinct single-request operation. Posting status must show `0/n`, `partial`, `n/n`, unlocked correction count, and failed/queued notification state.

### P0-05 - Official remarks are not consistently honored downstream

**Status:** Implemented locally for identified official-grade consumers; cross-role live acceptance pending.  
**Evidence:** `MyGradesList.jsx:279-304`; `reportsService.js:231-248`; `reportsService.js:389-424`; `GradeDistribution.jsx:216-245`; `SummaryReports.jsx:185-207`.

Several consumers determine pass/fail solely from numeric GWA. This discards the stored official `remarks` value and can show INC, FDA, Dropped, or an exceptional administrative outcome as Passed/Failed. `reportsService` also compares `posted.period === 'SG'`, while canonical storage is `semestral_grade`, causing an official row to remain labelled tentative in that path.

**Required control:** Introduce one `resolveOfficialGradeState` contract returning canonical milestone, rating, GWA, official remark, source, revision, and official/tentative state. All student, Dean, risk, notification, export, and report consumers must use it. Numeric pass-rate metrics must explicitly define whether exceptional remarks are excluded, failed, or separately counted.

### P0-06 - Administrative override validation is UI-only

**Status:** Implemented locally; direct-RPC live acceptance pending.  
**Evidence:** `GradeOverride.jsx:194-210`; `20261020110000_cast_admin_override_remarks.sql:24-38`; `20261020110000_cast_admin_override_remarks.sql:74-81`.

The page limits overrides to the DYCI grade steps, but the RPC only checks that a numeric grade exists and that the remark casts to the enum. A direct authenticated admin call can store an out-of-range/non-ladder GWA or a semantically contradictory grade/remark pair.

**Required control:** Validate `1.00-5.00`, enforce the permitted grade ladder unless an explicit policy says otherwise, and validate or explicitly classify exceptional remarks. Store `source = 'admin_override'` and the policy exception type.

### P1-01 - Two faculty posting implementations can drift

**Status:** Confirmed.  
**Evidence:** `GradeComputationPreview.jsx:779-1087`; `ScoreInput.jsx:1441-1785`.

Both pages independently implement blank review, computation, payload construction, SG planning, preflight, change detection, atomic posting, audit text, notifications, and success/error handling. `ScoreInput` calculates from local-storage drafts; Preview builds from loaded page state. Only `ScoreInput` notifies the reviewing Dean after a correction is applied.

**Required control:** One posting orchestrator and one confirmation component. Both routes must call the same server projection and operation API, or one route should redirect to the other.

### P1-02 - Preflight and final trigger implement different correction rules

**Status:** Confirmed and directly related to the reported failure.  
**Evidence:** `20261021110000_sg_correction_batch_preflight.sql:66-84`; `20261014130000_admin_grade_override_audited.sql:97-124`; `sgCorrectionPosting.js:91-98`.

Preflight demands non-null exact proposed computed grade, effective grade, and remark. The final trigger permits any proposal field to be null, meaning “unchanged from baseline.” Administrative override intentionally creates a synthetic request with `proposed_computed_grade = NULL`. This mismatch forced the client to special-case active admin overrides and omit them from unrelated repost payloads.

**Required control:** Move planning into the database and use one matcher for preflight and apply. A preflight response should be generated from the same locked records and rule function used by the write transaction. Prefer eliminating the separate preflight/write race by returning a projection token consumed by the posting RPC.

### P1-03 - The score/configuration basis is not reproducible

**Status:** Confirmed design gap.  
**Evidence:** `post_grade_milestone_atomic` stores the COG snapshot but not a complete input snapshot; class activities, maximum scores, attendance, and score rows remain mutable.

The system can retain the official numeric result, but it cannot always reconstruct exactly why that result was produced at posting time. Formula weights are frozen, while activity membership, activity maximums, legacy column maximums, attendance context, and source score values are not versioned with the posted revision.

**Required control:** Store a normalized calculation-input snapshot or an immutable hash plus a versioned revision record for every post. At minimum record formula version, activity definitions/maxima, score inputs, attendance inputs relevant to standing, calculation-engine version, roster revision, and result.

### P1-04 - Score and configuration writes are insufficiently guarded by official state

**Status:** Confirmed.  
**Evidence:** `20261008180000_grading_authorization_hardening.sql:324-390`; `20261008130000_protect_posted_term_scores_from_null.sql:40-121`; `20261014160000_protect_class_activities_from_deletion.sql:22-53`.

Current controls stop clearing or deleting protected data, but they still allow assigned faculty to replace posted score values and update grading configuration directly. Legacy `student_term_scores` has no migration-level nonnegative/maximum validation comparable to dynamic activity score validation. UI input clamping is not an integrity boundary.

**Required control:** Database triggers/RPCs must reject score/config changes covered by a locked milestone. MR/TFR revisions and SG corrections need explicit operations. Add database constraints or validated write RPCs for nonnegative scores, configured maxima, valid term, class ownership, and immutable posted calculation configuration.

### P1-05 - Notification completion is not part of the posting outcome

**Status:** Confirmed.  
**Evidence:** posting succeeds before `notifyGradePosted`/`notifyGradeChanged`; client dispatch occurs afterward in both posting pages.

If the tab closes, the device loses connectivity, or the client crashes after commit, the grade is official but notifications may never be queued. Dedupe handles retry duplicates but there is no durable server-side retry intent tied to the posting operation.

**Required control:** Insert notification outbox events in the same transaction as the posting/correction/override. Delivery remains asynchronous and retryable. The operation record must expose `committed`, `notifications_queued`, and delivery state so UI messaging is truthful.

### P1-06 - Autosaved score edits are not reliably audited

**Status:** Confirmed.  
**Evidence:** `20261020140000_reduce_audit_score_noise.sql:104-124`; `StudentRow.jsx:75-215`; `ScoreInput.jsx:1375-1393`.

Row-level audit triggers were removed from score tables to reduce noise, relying on one application “Score Batch Save” event. Debounced `StudentRow` autosaves do not write that event. Therefore score changes can become durable without a corresponding score-batch audit, especially during a failed correction attempt.

**Required control:** Use a server batch-save RPC that records one immutable operation event with actor, class, affected students/cells, before/after hashes, reason, and operation ID. Do not depend on a later optional Save button.

### P1-07 - Administrative override provenance has ambiguous lifetime

**Status:** Confirmed design ambiguity.  
**Evidence:** admin RPC sets `override_by`/`override_at`; ordinary atomic repost updates grade fields and `remarks_set_at` but does not clear override metadata. The local Phase 1 patch infers activity using `override_at >= remarks_set_at`.

The timestamp inference fixes current display/repost behavior, but provenance should not require inference. A later Dean-approved faculty correction creates a new official source while old override metadata remains on the row.

**Required control:** Add explicit revision/source fields (`faculty_post`, `dean_correction`, `admin_override`), a monotonic revision, and immutable revision history. The current row should point to the active revision.

### P1-08 - Historical and oversight reporting can be incomplete or misleading

**Status:** Confirmed.  
**Evidence:** `SummaryReports.jsx:124-130` loads only active class records even though previous-term classes are archived after SG completion; `GradePostingStatus.jsx` ignores the existing count-based status RPC.

**Required control:** Reporting must query by academic term and authorization, not active lifecycle status. Use canonical milestone helpers and roster/post counts from database views/RPCs.

### P1-09 - No durable idempotent posting operation exists

**Status:** Confirmed design gap.

The advisory lock serializes concurrent calls, and unique indexes prevent duplicate rows, but there is no caller-supplied idempotency key or operation record. A network timeout after commit cannot tell the client whether to report success or safely retry. Replays can update timestamps and initiate follow-up behavior again.

**Required control:** Persist a `grade_posting_operations` record keyed by actor/class/milestone/idempotency key. Retrying returns the original result. Include input/projection hash, counts, status, error code, commit time, and notification outbox IDs.

### P2-01 - Error contracts are not structured end to end

Client planning produces student-specific reasons, while database preflight mainly returns IDs and a generic reason. Pages rely on alerts and string messages. Operational support cannot consistently distinguish stale preview, incomplete roster, invalid score, missing approval, already-consumed approval, or committed-with-notification-pending.

**Required control:** Define stable error codes and structured per-student violations. Render a blocking summary with remediation links and an operation ID; reserve generic alerts for unexpected faults.

### P2-02 - Relevant React hook warnings remain

`StudentRow` autosave has missing dependencies, and `ScoreInput` has a missing `periodsList` dependency. They are warnings, not proof of a current defect, but stale closure behavior in a score editor is material enough to resolve before the workflow is certified.

## Required target state

### State machine

| State | Scores/config | Official result | Allowed transition |
| --- | --- | --- | --- |
| Draft | Editable by assigned faculty through validated batch RPC | None | Server projection, MR post |
| MR/TFR posted | Covered inputs versioned; edits require a milestone revision operation | Posted progress snapshot | Reproject/repost, next milestone |
| SG official | Locked in database | Official SG revision | Request correction or admin override |
| Correction pending | Live ledger remains locked; proposed delta stored separately | Existing SG remains official | Dean reject/approve/cancel |
| Correction approved | Live ledger still locked; approval bound to baseline and proposed delta/hash | Existing SG remains official | Atomic apply or cancel/expire |
| Correction applied | Approved delta, new server result, history, source, and notifications committed together | New locked official revision | New correction request if needed |
| Admin override | Live score basis unchanged; exceptional effective result explicitly sourced | New locked admin revision | New correction/override with full history |

The key rule is that **approval grants one transaction, not an unlocked editing period**.

### Server APIs

1. `get_class_grade_projection(class_record_id, milestone, student_ids?)`
   - loads canonical roster, frozen formula/configuration, scores, and relevant attendance;
   - returns completeness diagnostics and server-calculated results;
   - returns a projection/input hash and roster revision.

2. `post_grade_milestone_v2(class_record_id, milestone, reviewed_zero_changes, projection_hash, roster_revision, idempotency_key)`
   - verifies the hash/revision is current;
   - requires full active roster on first post;
   - calculates and stores results, revisions, audit operation, and notification outbox atomically.

3. `submit_sg_correction_v2(posted_grade_id, baseline_revision, proposed_score_changes, exceptional_remark, reason, evidence)`
   - validates a real change and generates the server result preview/hash.

4. `review_sg_correction_v2(request_id, decision, expected_projection_hash, note)`
   - keeps live records locked and binds approval to the reviewed result.

5. `apply_sg_correction_v2(request_id, idempotency_key)`
   - locks request/grade/scores, revalidates baseline and proposal, applies the staged delta, recalculates, records the new revision/history/outbox, and commits once.

6. `apply_admin_grade_override_v2(posted_grade_id, official_grade_step, remark, policy_exception, reason, idempotency_key)`
   - enforces server policy and creates an explicit admin-source revision.

### Shared read contract

Every consumer should receive or derive this shape from one shared resolver/view:

```text
class_record_id
student_id
milestone
rating
gwa
remark
is_official
source
revision
posted_at
posted_by
calculation_version
input_snapshot_hash
correction_request_id
```

No page should infer the official remark from GWA when an official remark exists.

## Phased remediation plan

### Phase A - Immediate containment and consistency (P0)

- Fix all downstream consumers to honor canonical stored remarks and milestone names.
- Change Dean posting status to roster-aware complete/partial counts using `get_term_sg_status` or its replacement.
- Add server validation to administrative override: grade range/ladder, remark compatibility, active actor, unchanged-value rejection, and idempotency.
- Add locked-milestone guards to score/config mutation paths. Until the new correction RPC exists, do not allow approved SG correction edits to autosave into live tables.
- Align preflight and trigger matching rules in one SQL helper.
- Add live SQL tests for authorization, rollback, partial roster rejection, correction isolation, and admin override.

**Exit gate:** No partial class can look complete; no locked official basis can be mutated outside an authorized operation; all official consumers show the same remark/source.

### Phase B - Server-authoritative projection and posting (P0)

- Implement the server calculation engine described in the related server-authoritative audit.
- Replace client-supplied grade values with server-calculated results.
- Enforce full-roster first posting and stale-preview detection.
- Introduce posting operation IDs/idempotency and immutable posted revisions/input hashes.
- Put notification outbox records in the posting transaction.

**Exit gate:** A crafted client cannot make an official value disagree with persisted inputs and policy.

### Phase C - Atomic SG correction redesign (P0/P1)

- Stop setting the official SG row to unlocked on Dean approval.
- Stage proposed score changes separately.
- Approve a baseline revision plus server projection hash.
- Apply the entire correction in one database transaction.
- Expire or invalidate approval when the baseline/configuration changes.
- Remove client-side proposal substitution and administrative-override omission logic once the server owns planning.

**Exit gate:** Failed/cancelled corrections leave both scores and official grades unchanged; successful corrections create exactly one revision/history/outbox set.

### Phase D - Client consolidation and operational UX (P1)

- Collapse `ScoreInput` and `GradeComputationPreview` posting orchestration into one module/path.
- Remove authoritative local-storage reads from posting. Local storage may remain a recoverable draft only and must show sync state.
- Use structured errors, operation IDs, retry/resume, and committed-but-delivery-pending states.
- Show official source badges and revision history in faculty, Dean, admin, and student views.

**Exit gate:** Both navigation paths produce the same projection, confirmation, RPC, audit, notification, and error behavior.

### Phase E - Reproducibility, observability, and cleanup (P1/P2)

- Store calculation/input version metadata and expose reconciliation reports.
- Add scheduled checks for roster count mismatch, official-result/input-hash drift, stuck approved corrections, and failed notification outbox items.
- Resolve relevant lint hook warnings and code-split large routes.
- Retire superseded RPCs only after telemetry and rollback windows pass.

## Mandatory acceptance matrix

The feature is not certified until these are executed against a migrated test database with evidence.

| ID | Scenario | Required result |
| --- | --- | --- |
| GP-01 | First MR for complete roster | Exactly `n/n` rows; server results match fixtures; one operation. |
| GP-02 | First TFR and SG | Canonical milestone identities; SG locks roster and official inputs. |
| GP-03 | One student omitted on first post | Whole transaction rejects with `ROSTER_INCOMPLETE`; no rows written. |
| GP-04 | Extra/non-enrolled/duplicate student | Whole transaction rejects; no rows written. |
| GP-05 | Blank-to-zero review | Confirmed zeros and posted results commit together; cancel writes nothing. |
| GP-06 | Score/config changes after preview | Stale projection rejects and requires refresh. |
| GP-07 | Two simultaneous posts | One deterministic operation; retry returns same result. |
| GP-08 | Network loss after commit | Client resumes by operation ID and shows committed state, without duplicate notifications. |
| GP-09 | Unauthorized faculty/student/Dean | RPC and direct table attempts are denied by role/RLS. |
| GP-10 | Locked SG score/config direct write | Database rejects, even if UI is bypassed. |
| GC-01 | Correction request with exact score delta | Dean sees baseline, delta, server result, and evidence. |
| GC-02 | Approval | Live score/SG rows remain locked. |
| GC-03 | Apply approved correction | Score delta, server result, revision, history, audit, and outbox commit once. |
| GC-04 | Apply with stale baseline | Rejects with no score or grade changes. |
| GC-05 | Apply with changed/unapproved cell | Rejects with no score or grade changes. |
| GC-06 | Cancel/reject/expire | No live data changes; request lifecycle is auditable. |
| GC-07 | Rivera correction plus unrelated Pangan admin override | Rivera applies; Pangan remains unchanged; batch is not blocked. |
| GC-08 | Two approved corrections in one class | Each is independently deterministic and consumed once. |
| AO-01 | Valid admin override | Official ladder value, compatible remark, explicit source, history, and outbox. |
| AO-02 | Out-of-range/non-ladder/mismatched override | Server rejects direct RPC call. |
| AO-03 | Later Dean correction after admin override | New source/revision is explicit; no stale active-override inference. |
| DS-01 | Passed/Failed/INC/FDA/Dropped | Faculty, student, Dean, reports, notifications, and exports agree exactly. |
| DS-02 | Partial roster seeded deliberately | Dean status shows partial, never posted/complete. |
| DS-03 | Archived historical class | Included in selected-term reports and exports. |
| NF-01 | Notification service unavailable | Grade commits with durable queued outbox and visible delivery status. |
| RB-01 | Exception at every write stage | Transaction rollback leaves no partial score, grade, history, or operation state. |

Run the existing JavaScript verification suites in addition to—not instead of—these database tests.

## Release gates

### Must be true before production certification

- [ ] The database calculates official results from persisted, versioned inputs.
- [ ] First posting is full-roster and roster-aware status reports `n/n`.
- [ ] Locked score/config data cannot be mutated through direct authenticated table calls.
- [ ] SG correction never exposes live autosave; application is one transaction.
- [ ] Admin override is server-validated and explicitly sourced.
- [ ] Every official consumer uses canonical milestone, GWA, remark, source, and revision semantics.
- [ ] Posting/correction/override has durable idempotency and a notification outbox.
- [ ] SQL integration tests cover RPC, trigger, RLS, concurrency, rollback, and retries.
- [ ] Maritime and IT live QA evidence is attached for normal post, correction, override, archive, reports, and exports.
- [ ] A database backup and rollback migration have been rehearsed.

### Operational monitoring after release

- roster count versus posted count by class/milestone;
- approved corrections older than the allowed application window;
- official rows whose input snapshot hash no longer matches an allowed revision;
- notification outbox retry/failure age;
- rejected posting error codes by class and actor;
- correction/admin override volume and repeated overrides for the same student/class; and
- reconciliation differences across official view/export/report queries.

## Recommended implementation order

Do not begin with UI polish. The safest order is:

1. database integration harness and failing P0 tests;
2. official read contract plus downstream remark/status fixes;
3. locked-input guards and admin override validation;
4. server projection and roster-complete posting v2;
5. atomic staged correction v2;
6. operation/outbox/retry handling;
7. client consolidation and UX cleanup;
8. live acceptance, reconciliation, rollout, and retirement of v1 paths.

This order creates a trustworthy boundary first, then simplifies the clients around it.

## Final assessment

The current implementation is substantially safer than a direct CRUD grade sheet: authorization, atomic persistence, exact SG approval matching, immutable correction history, and archive/roster protections are already present. However, official calculation and correction input handling still cross the browser/database boundary in ways that can produce inconsistent or unreproducible records.

The feature should be strengthened around one invariant:

> An official grade is a server-calculated, full-roster, versioned result of persisted inputs; any later change is a separately authorized, atomic, immutable revision.

When that invariant is enforced in the database and consumed consistently everywhere, the workflow will be both smoother for faculty and defensible as the system's official grading record.
