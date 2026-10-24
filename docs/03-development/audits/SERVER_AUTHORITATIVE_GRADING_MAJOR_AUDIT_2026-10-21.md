# Server-Authoritative Grading Major Audit - 2026-10-21

**Status:** Design audit only. No implementation, schema, production-data, or policy change is included.  
**Related plan:** Phase 2 in PHASED_QA_AND_CODEBASE_REMEDIATION_PLAN_2026-10-21.md.  
**Scope:** Make the server the authoritative calculator for tentative grades, posted MR/TFR, official SG, GWA, and standing while preserving the present milestone workflow.

## Executive decision

Yes, the server can and should calculate a student's standing before the SG is posted.

This does not make an unposted grade official. The system needs two explicitly different result types:

| Result type | Written to posted grades | Purpose | Student-facing label |
| --- | --- | --- | --- |
| Running calculation | No | Read-only result calculated from persisted scores and the class COG snapshot. | Tentative / In progress |
| Posted milestone snapshot | Yes | Consultation or official record produced by the same server calculation. | MR, TFR, or Official SG |

The final state rules remain:

1. Saved scores may change the running calculation.
2. MR and TFR are posted snapshots and may be updated by their existing milestone workflow.
3. SG is an official, locked snapshot.
4. A changed official SG still requires the exact Dean-approved, unused correction request. The server must calculate/validate the final result inside the same transaction that applies and consumes the request.

No department, program, or section condition is needed. The class record, its roster, term, and frozen COG snapshot define the calculation boundary.

## Current-state audit

### Current authoritative data

| Data | Current source | Required role after Phase 2 |
| --- | --- | --- |
| Class formula | class_records.grading_formula_snapshot, with subject configuration as legacy fallback | Immutable calculation contract for the class. |
| Legacy score slots | student_term_scores | Persisted input to server calculation. |
| Dynamic activity scores | class_activities plus student_activity_scores | Persisted input to server calculation. |
| Attendance/FDA inputs | attendance_records and existing academic policy | Persisted input to standing calculation where policy requires it. |
| Posted milestones | posted_grades | Historical snapshots only; never the source of a new calculation. |
| SG correction approval | remark_override_requests and grade_correction_history | Narrow authorization to replace one locked official SG. |

### Current calculation split

The same grading rules are currently executed in several browser modules:

- src/lib/gradingMath.js contains formula normalization, term rating, milestone arithmetic, and related helpers.
- src/lib/academicPolicy.js contains transmutation and standing policy.
- src/pages/faculty/GradeComputationPreview.jsx and src/pages/faculty/ScoreInput.jsx each calculate payload values before calling the posting RPC.
- src/lib/studentRunningGrade.js and student grade-detail screens calculate tentative results in the browser.
- classRoomService, riskEngine, exportGradeResolver, reportsService, and Dean analytics repeat parts of the calculation for different views.

The posting RPC currently validates client-supplied computed grade, effective grade, and remarks but does not derive them from persisted scores. This is the Phase 2 integrity gap. It can allow a stale browser calculation, duplicated client logic, or a crafted RPC payload to disagree with the actual stored scores.

## Target architecture

### 1. One database calculation engine

Create a SECURITY DEFINER database calculation function with two safe public entry points:

| Entry point | Caller | Output | Writes |
| --- | --- | --- | --- |
| get_class_grade_projection | Assigned faculty, enrolled student for own data, authorized Dean/Admin | Batched read-only rows for a class: component status, MR, TFR, SG, GWA, standing, completeness, and calculation diagnostics. | None |
| post_grade_milestone_atomic | Assigned faculty only | Counts and posted milestone result. | Reviewed score substitutions, posted milestone snapshots, SG correction history when applicable. |

The calculation engine must:

1. load and validate the class formula snapshot;
2. load the active enrolled roster and persisted score/attendance rows;
3. calculate component coverage and weighted term results;
4. calculate MR, TFR, and SG according to normal or summer progression;
5. apply transmutation and standing rules;
6. return tentative/incomplete reasons without creating a posted-grade row; and
7. provide final values to the posting transaction after it has saved any reviewed blank-to-zero substitutions.

The client may retain a lightweight provisional calculation for responsive editing, but it must label it as local preview and replace it with the server projection before display/export/post confirmation. The client must not submit computed/effective/remark values as authoritative posting input.

### 2. State flow

    Persisted scores + formula snapshot + attendance
                         |
                         v
              Server grade projection (read only)
                 |                      |
                 |                      +--> student tentative view
                 +--> faculty/dean/risk/report views
                 |
                 v
          Faculty selects MR / TFR / SG post
                         |
                         v
     Atomic RPC persists reviewed scores, recalculates on server,
     then writes the corresponding posted-grades snapshot
                         |
                         +--> MR/TFR: normal milestone replacement rules
                         |
                         +--> SG: locked; changed snapshot requires exact
                              approved correction and consumes it on success

### 3. Standing semantics

| Condition | Server projection output | Posted behavior |
| --- | --- | --- |
| Incomplete required terms/components | Tentative rating may be partial; standing is In progress and includes missing components. | Block milestone posting unless the faculty explicitly reviews permitted blanks as zero. |
| Complete scores, no SG post | Tentative SG/GWA/standing. | Read-only only; no official record is created. |
| MR/TFR post | Milestone-specific calculated result. | Save/update that milestone snapshot. |
| SG first post | Final SG/GWA/standing. | Save locked official snapshot. |
| SG correction | Final values calculated/validated against the approved proposal. | Update one existing official snapshot and apply request/history atomically. |

## Planned database changes

### New migration(s)

Do not edit old migrations. The implementation should add timestamped Phase 2 migrations, in this dependency order:

| Migration responsibility | Purpose | Schema effect |
| --- | --- | --- |
| Internal calculation helpers | Validate COG JSON, collect persisted score inputs, calculate term/milestone values, transmutation, and standing. | Functions only. |
| Read projection RPC | Return batched tentative results with role-aware scope. | Functions and execute grants only. |
| Atomic posting replacement | Replace post_grade_milestone_atomic so it ignores client grade values and writes server-derived values after score persistence. | Function replacement only. |
| Authorization tightening, if required by the calculation path | Remove direct score writes that can bypass class/role validation and route material writes through secured RPCs. | RLS/policy/function changes, separately reviewed. |

### Column/table recommendation

No new persistent tentative-grade table or new posted_grades column is required for the first implementation.

Reasons:

- Tentative values are derivable from existing persisted scores, attendance, and class formula snapshot.
- A tentative cache table creates invalidation and privacy risks whenever a score changes.
- posted_grades already stores the correct historical snapshot, formula snapshot, lock state, and correction linkage.

Optional future metadata, not part of the first delivery:

| Optional field | Value | Reason to defer |
| --- | --- | --- |
| calculation_engine_version on posted_grades | Server calculator version that produced the snapshot. | Useful audit metadata, but existing formula snapshot and audit history already provide the required Phase 2 integrity controls. |
| calculation_trace JSONB | Component-level explanation captured at posting time. | Increases data volume and privacy surface; use read-only projection diagnostics first. |

### Required database invariants

- Grade calculation loads the class formula snapshot, not a mutable client formula.
- Posting queries the active enrollment roster itself; the client cannot introduce an arbitrary student.
- The server ignores or rejects client computed_grade, effective_grade, and remarks fields for authoritative posts.
- The final SG correction trigger remains in force after RPC refactoring.
- Request status changes from approved to applied only after the official posted-grade update succeeds in the same transaction.
- Read projection does not write posted_grades, correction requests, or audit history.
- Student projection queries may return only that authenticated student's class rows; faculty/dean scope remains class/department authorized.

## Application files expected to change

### Required implementation files

| File or area | Change | Purpose |
| --- | --- | --- |
| supabase/migrations/new Phase 2 migration(s) | Add calculation/projection functions; replace atomic posting function. | The server becomes the calculation authority. |
| src/lib/gradePostingService.js | Send score-review input and milestone intent only; consume server result. | Remove client grade values as trusted posting input. |
| src/lib/gradeProjectionService.js (new) | Call batched projection RPC and normalize its response. | One client read boundary for tentative and authoritative calculated values. |
| src/pages/faculty/GradeComputationPreview.jsx | Display server projection; submit milestone intent rather than browser-generated grade payload. | Align preview, confirmation, and post. |
| src/pages/faculty/ScoreInput.jsx | Use the same projection/posting service or route official posting to the preview flow. | Eliminate duplicated calculation/post paths. |
| src/lib/studentRunningGrade.js | Replace browser-only running grade source with server projection. | Student tentative values match faculty/dean values. |
| src/pages/student/MyGradesDetail.jsx | Render server tentative projection and posted snapshot distinction. | Preserve the Tentative versus Official explanation. |
| src/components/StudentRow.jsx | Stop treating local/browser calculation as authoritative; use protected score-write path. | Prevent score-state/calculation drift. |
| scripts/verifyGradingMath.js | Expand canonical vectors to compare client-display utilities and server projection fixtures. | Detect arithmetic/policy drift. |
| scripts/new server-grade verification | Add direct RPC integration scenarios for normal, summer, incomplete, MR, TFR, SG, and correction states. | Prove database authority. |
| docs/04-testing/new Phase 2 runbook | Add manual and two-department acceptance cases. | Release evidence. |

### Consumers to inventory and migrate in the same program

These areas should not be changed blindly in the first commit, but each must be assessed against the projection contract before release:

| File or area | Current relationship | Required decision |
| --- | --- | --- |
| src/lib/exportGradeResolver.js and src/lib/excelExport.js | Mix progress calculations with official posted-SG values. | Use server projection for progress fields; continue using posted snapshots for official export fields. |
| src/lib/riskEngine.js | Recalculates academic signals from score inputs. | Either consume projection metrics or prove its internal arithmetic is intentionally distinct. |
| src/lib/classRoomService.js | Builds class-grade data from score tables in the browser. | Move staff-facing computed values to batch projection. |
| src/lib/reportsService.js | Aggregates class performance. | Choose projection for live/tentative report metrics and posted grades for official historical metrics. |
| src/pages/dean/Dashboard.jsx and AtRiskStudents.jsx | Independently calculate class/at-risk data. | Use scoped batched projection to prevent dashboard/faculty disagreement. |
| src/pages/student/AcademicInsights.jsx and Dashboard.jsx | Mix posted and running data. | Preserve privacy policy while using server-defined tentative values. |
| src/pages/admin/GradeOverride.jsx | Performs exceptional official SG changes. | Retain its separate audited override workflow; validate it against the new calculation/correction contract. |

## API contract proposal

### Read-only projection response

The projection RPC should return one row per requested authorized student with:

| Field group | Examples |
| --- | --- |
| Identity | class_record_id, student_id, calculation_scope |
| Formula | formula_snapshot_id/version or snapshot hash, is_summer |
| Term results | prelim, midterm, semi_final, final; completion/missing-component diagnostics |
| Milestones | mr, tfr, sg |
| Academic result | effective_grade, standing, is_tentative, is_complete |
| Evidence | attendance/FDA condition, calculation warnings |
| Official state | current posted MR/TFR/SG values and lock state, kept separate from tentative values |

Do not expose another student's detailed projection to a student client. Do not expose correction-request metadata through the projection response.

### Atomic posting input

The client supplies:

- class record ID;
- requested milestone;
- reviewed term/activity score changes, if any; and
- optional roster/version expectation for stale-screen detection.

The client does not supply:

- computed grade;
- effective GWA;
- standing/remarks;
- lock state;
- formula snapshot to override the class snapshot; or
- correction status.

The RPC returns the server-derived posted results, affected students, and safe diagnostics for the caller. Notifications and exports consume that response or re-read the authoritative record.

## Data migration and backward compatibility

| Item | Strategy |
| --- | --- |
| Existing posted grades | Preserve unchanged. They are historical snapshots and must not be recalculated in bulk. |
| Existing COG snapshots | Validate at runtime; repair only invalid/missing snapshots through a separately approved data migration. |
| Existing score data | Read in place; do not duplicate into a tentative-grade table. |
| Existing SG correction requests | Preserve. Existing Phase 1 matching/consumption trigger continues to govern any SG update. |
| Legacy classes without a valid formula snapshot | Fail closed with an actionable faculty/admin repair message; do not silently apply a default formula. |
| Browser local drafts | Continue as recoverable drafts only. Server projection reflects persisted scores; the UI must clearly label unsaved local edits. |

## Quiet rollout plan

1. Build database calculation helpers and deterministic test vectors without changing existing UI reads.
2. Add the read-only projection RPC behind a feature flag or internal comparison mode.
3. For selected QA classes, compare server results against the current browser calculator for all enrolled students; record every mismatch before switching display.
4. Change faculty preview and student tentative views to read the server projection.
5. Change the atomic posting RPC to derive values on the server, retaining the Phase 1 SG correction guard.
6. Run Maritime and IT acceptance cases, including normal and summer classes where available.
7. Monitor RPC errors, calculation mismatch counts, response time, and attempted unauthorized SG changes.
8. Retire duplicated client posting calculation only after parity and release gates pass.

### Rollback

- Before the posting-RPC cutover, disable the new read path and return UI to the existing calculator; no official data is changed by projection reads.
- After cutover, do not roll back posted-grade data. Roll back the function version only if server-calculated output is proven wrong, preserve audit logs, and investigate with captured input snapshots.
- Never bypass the SG correction trigger as a rollback shortcut.

## Test matrix

| Category | Required cases |
| --- | --- |
| Formula | Dynamic multi-component formula, legacy slot mapping, invalid/missing snapshot, normal term, and summer term. |
| Completeness | No scores, partial scores, reviewed blanks converted to zero, and fully complete scores. |
| Milestones | First and repeat MR, first and repeat TFR, first SG, archived class correction. |
| Authorization | Student own projection only; assigned faculty; department Dean; unrelated faculty/Dean denied; anonymous denied. |
| SG corrections | Exact approved correction succeeds and applies once; no request, applied request, other class, other term, and mixed batch all fail atomically. |
| Consistency | Server projection, faculty preview, student tentative view, Dean analytics, notification payload, and export timing agree with their defined state. |
| Performance | Class projection for a realistic roster; batched Dean/dashboard load; no N-plus-one student RPC pattern. |

Every grading workflow case must run in Maritime and IT. That is a coverage requirement, not a code branch.

## Risks and controls

| Risk | Control |
| --- | --- |
| SQL and JavaScript policy drift during transition | Canonical fixed vectors, comparison mode, and a single server posting authority before retiring duplicate client paths. |
| Incorrect formula interpretation | Fail closed on invalid snapshot; test dynamic component identities and normal/summer term rules. |
| Tentative data mistaken for official grade | Separate fields and labels in API/UI; official exports continue to use posted snapshot values. |
| Slow dashboard/class loads | Batch projection by class/authorized roster, index source tables, and measure response times before rollout. |
| New RPC broadens data visibility | SECURITY DEFINER functions with explicit actor/roster checks and narrow returned fields. |
| SG correction guard bypassed during refactor | Keep existing trigger active; test correction application inside the replacement atomic posting transaction. |
| Legacy data lacks required inputs | No blanket backfill; inventory failures, repair under separate approval, and show actionable errors. |

## Approval decisions needed before implementation

1. Confirm that server projection is the single authoritative result for all portals, while the browser may show unsaved input only as a clearly labelled local preview.
2. Confirm whether the first cutover must include Dean analytics and risk reports, or whether those move after faculty/student/posting parity is proven.
3. Confirm the stale-screen policy: recommended default is warn/reload when server projection input version changes before posting.
4. Confirm whether optional calculation-engine metadata is required now. Recommendation: no new persistent column in the first Phase 2 delivery.
5. Confirm release ownership for the migration, feature flag/comparison period, and live QA evidence.

## Definition of done

Phase 2 server-authoritative grading is complete only when:

- a server projection produces tentative results without creating official records;
- MR, TFR, and SG snapshots are derived inside the database posting transaction;
- the client cannot authoritatively choose computed grade, GWA, or standing;
- SG remains locked and correction-gated after its first post;
- all agreed consuming portals use the defined projection or posted-snapshot contract;
- parity, authorization, performance, and correction tests pass in Maritime and IT; and
- migration, rollback, monitoring, and QA evidence are documented.
