# Faculty Evaluated Students and Ghost Student Implementation Plan

Date: October 6, 2026 (Asia/Manila)  
Status: Implemented and validated locally; deployment/setup reported complete by the user, with remote state and live workflow verification still pending. See [completion report](../reports/FACULTY_TRACKER_AND_GHOST_STUDENT_IMPLEMENTATION_REPORT.md).

## Scope and references

Implement the ghost-student activity-zero fix and the revised faculty evaluated-students workflow. The supplied documents are specifications to assess against current source, rather than commands to deploy or alter academic records.

References:
- `C:/Users/sadia/Downloads/Ghost_Student_Detection_Fix_Plan.md`
- `C:/Users/sadia/Downloads/faculty_evaluated_students_plan-1.md`
- [Repository tracker specification](faculty_evaluated_students_plan.md)
- [Tracker audit](../reports/FACULTY_EVALUATED_STUDENTS_PLAN_AUDIT_2026-10-06.md)
- [Repository instructions](../../AGENTS.md)

Preserve existing unrelated working-tree changes. Follow semantic sage tokens, Lucide icons, Tailwind layout classes, and institutional grading/rounding rules.

## Verified starting point and decisions

- `StudentRisk.jsx` reads Supabase and `getClassPriorityRoster()`; the older repository data-layer description is outdated for this page.
- The activity-zero counter still requires another positive activity score, shielding all-zero students from missing-work points.
- The current roster evaluation lookup is keyed by student and omits term/task details. It cannot be the tracker case source or establish selected-term evaluation coverage.
- The tracker page/route does not yet exist. Keep Evaluate Students and move unevaluated-student triage there before replacing At-Risk navigation.
- Existing local migrations define secure evaluation submission/review and notification RPCs. Remote application, grants, and RLS remain unverified.
- Evaluation status, student-reported task completion, and referral lifecycle must stay independent.
- Blank scores remain ungraded; explicit numeric zero remains a valid score. On the institutional GWA scale, failure is greater than 3.00, not less than 3.00 as stated in the ghost plan. Reuse shared policy functions.
- Nearby exam-average code also excludes explicit zero. Inspect its consumers and grade/risk effects before deciding whether a correction belongs in this scope; do not assume removing the activity gate fixes every null-versus-zero path.

## Phase 1 — Ghost student detection

- [x] Inspect configured activity sources and score value types, including generic components, to establish what the existing counter covers.
- [x] Remove `hasEnteredActivity` and count numeric zeros for configured activities with positive maxima, including students whose activities are all zero.
- [x] Retain exclusion of null, undefined, empty cells, and unconfigured activities. Avoid changes to grading weights or thresholds.
- [x] Check all-zero, all-blank, mixed zero/positive/blank, and disabled-activity cases with a focused executable regression check using the actual implementation path where practical. Do not introduce a test framework.
- [x] Verify risk points follow the shared risk engine and distinguish activity missing-work signals from exam/character grading.

Primary files: `src/lib/classRoomService.js`, shared grading/policy/risk utilities as context.

## Phase 2 — Referral persistence and authorization

- [x] Inspect current schema, RPC signatures, notification delivery triggers, and department ownership joins before writing an additive migration.
- [x] Add a referral-event table with evaluation/request/actor identity, reason, pending/resolved state, timestamps, resolution actor/note, and explicit legacy metadata provenance.
- [x] Enforce one pending event per evaluation and unique actor/request identity. Enable RLS and RPC-only writes; limit restricted reasons/notes to authorized faculty, department Deans, and admins.
- [x] Implement `refer_student_evaluation_to_dean(p_evaluation_id UUID, p_reason TEXT, p_request_id UUID)` returning the case/referral summary and notification identities.
- [x] Authenticate with `auth.uid()`. Authorize current assigned faculty, active class, and published evaluation. Require a trimmed reason of 1–2000 characters, mirrored in UI/backend.
- [x] Lock the case and resolve active Deans from the evaluation class section department. No Dean must produce an actionable error and no partial writes.
- [x] Return an existing pending event without duplicate notifications. Reusing a request ID after resolution must return its original result without reopening it; reject reuse for a different case.
- [x] Atomically create the event, set the referral flag, and persist one privacy-safe `dean_referral` notification per responsible Dean with an event/recipient dedupe key and authorized case link.
- [x] Keep the internal notification helper unavailable as a public client RPC. Preserve restrictive general notification permissions and existing delivery pipeline behavior.
- [x] Preserve guidance, tasks/completion, private notes, risk, baseline, and acknowledgment during referral.
- [x] Preserve existing true referral flags as legacy pending events without invented actor/time/reason or duplicate backfill notices.

Primary files: new `supabase/migrations/<timestamp>_faculty_evaluation_referrals.sql`; existing evaluation and notification migrations for reference.

## Phase 3 — Evaluation submission and Dean resolution

- [x] Extend submission contract and modal with reason/request identity for creation-time referrals, using the same server helper in the submission transaction.
- [x] Prevent ordinary evaluation upserts from clearing a pending referral or reopening a resolved one. Preserve student task updates during evaluation editing.
- [x] Remove faculty-self Dean referral notices; retain the separate student advising notification without duplicate Dean notices.
- [x] Extend Dean review to resolve the event and clear the flag atomically, recording actor/time/note without fabricating student acknowledgment.
- [x] Support case selection by evaluation ID from notification links with server authorization and clear unavailable-case feedback.
- [x] Refresh Dean queue/counters on entry, focus, and explicit refresh; reuse suitable existing notification subscriptions.

Primary files: `src/pages/faculty/StudentRiskEvaluationModal.jsx`, `src/pages/dean/AtRiskStudents.jsx`, shared evaluation/referral service, additive migration.

## Phase 4 — Evaluated Students tracker

- [x] Add a shared service for explicit case reads and referral calls; omit restricted note text from table queries.
- [x] Default to current assigned classes and active academic period. Empty allowed-class sets return empty results without unscoped fallback.
- [x] Offer authored history only where existing read policies allow it. History/reassigned/inactive/draft cases cannot be referred.
- [x] Use one row per `evaluation_id`; retain class, subject, section, academic period, and grading term identities.
- [x] Add search, class/period/term/referral filters, All Terms, server pagination, stable ordering with ID tie-breaker, and stale-request/account-change protection.
- [x] Batch current standings by visible classes. Display stored evaluated risk/baseline separately from current subject standing with term/date and Posted/Tentative/Pending labels.
- [x] Add keyboard-operable row expansion with task description, target term, due date, reported completion/time, and counts. Show No tasks assigned and No deadline explicitly.
- [x] Derive overdue only for pending tasks with valid dates using Asia/Manila calendar boundaries.
- [x] Add referral reason form with exact case/task summary. Preserve reason and request ID across retries; disable duplicate submissions and use returned server state on success.
- [x] Label task status Reported complete/Pending. Explain Already referred and ineligible actions. Distinguish persisted in-app referral from external delivery.
- [x] Verify loading/error/empty states and usable narrow-screen layout.

Primary files: new `src/pages/faculty/EvaluatedStudents.jsx`, new shared service under `src/lib/`.

## Phase 5 — Term-aware triage and navigation

- [x] Resolve creation terms from class/term state, requiring explicit selection when unavailable; use stored terms for existing cases.
- [x] Query evaluations by class/student/term. Add Needs evaluation count/filter for unevaluated students at `RISK_TIERS.MODERATE.min` or higher in the selected term.
- [x] Keep full roster access, including low-risk/retention evaluations, and cross-page class/term context.
- [x] Add `/faculty/evaluatedstudents` while retaining the StudentRisk import and `/faculty/evaluatestudent` route.
- [x] Redirect `/faculty/atriskstudents` to the implemented needs-evaluation view, preserving supported class/term query context.
- [x] Update Sidebar to Evaluate Students and Evaluated Students. Add both through BottomNav's More mechanism and check old-route consumers.

Primary files: `src/pages/faculty/StudentRisk.jsx`, `src/App.jsx`, `src/components/layout/Sidebar.jsx`, `src/components/layout/BottomNav.jsx`.

## Phase 6 — Validation and rollout

- [x] Run `npm run lint` and `npm run build`. Document unrelated baseline failures separately. Do not run `npm test` or `tsc`.
- [x] Run focused regression checks for zeros/blanks and term coverage; use the existing grading verification script if shared grading logic changes.
Completed local checks (synthetic data; not live rollout approval):

- [x] Apply the actual privacy/grant/referral migrations to isolated PostgreSQL/PGlite; exercise RPC signatures, grants, and referral/private-note RLS against synthetic prerequisite tables.
- [x] Exercise authorized/unauthorized faculty, former evaluator after reassignment, responsible/other department Dean, admin, and student boundaries in that isolated database.
- [x] Verify repeated referrals, retry after resolution, re-referral with a new identity, no-Dean failure, and notification persistence failure rollback in isolated PostgreSQL.
- [x] Verify referral preserves tasks, guidance, baseline, risk, publication metadata, and acknowledgment. Verify students cannot select restricted referral/private-note rows or the request ledger, and notification content omits restricted reasons/notes.
- [x] Verify atomic creation-time referrals, legacy pending backfill without duplicate notices, recipient deduplication, and Dean email opt-out in isolated PostgreSQL.
- [x] Verify Dean link selection/resolution and queue refresh using the actual React pages with synthetic services.
- [x] Verify selected-term coverage, blank standing, Manila overdue boundaries, pagination, search, keyboard expansion, modal dismissal/focus return, and mobile navigation locally. Browser checks used an isolated harness on port 5176 because 5175 was occupied; app configuration remains strict port 5175.
- [x] Record local implementation separately from applied remote migrations and verified live behavior in the completion report.

Remaining staging/live checks:

- [ ] Verify the full target prerequisite schema, real notification/delivery triggers, PostgREST signatures/relationships, and applied grants/RLS before rollout. The isolated fixture used a synthetic in-app delivery trigger.
- [ ] Repeat the role/access matrix against representative Supabase accounts, including archived/reassigned history and restricted content through embedded reads/RPCs/notification links.
- [ ] Exercise genuinely concurrent requests using separate PostgreSQL connections, including submission/referral/student-task interleavings. PGlite's single connection does not establish concurrency safety.
- [ ] Explicitly compare private-note rows before/after referral and resolution; verify all preservation/privacy expectations end-to-end against the target environment.
- [ ] Deploy and exercise the email worker; verify external delivery, retry/deduplication, and real notification subscription/queue refresh behavior.
- [ ] Verify distinct classes/terms, student-reported task refresh, slow/rapid filters, account changes, server search/pagination, keyboard/mobile behavior, and full portal integration on the normal app at port 5175.
- [ ] Independently confirm which deployment steps the user completed and verify applied migration history and worker/application compatibility. Read-only follow-up checks failed DNS lookup; deployment completion is currently user-reported.

Evidence and limitations: [completion report](../reports/FACULTY_TRACKER_AND_GHOST_STUDENT_IMPLEMENTATION_REPORT.md). Checked local items do not substitute for the remaining staging/live checks.

## Completion report — write after implementation and validation

Create `docs/reports/FACULTY_TRACKER_AND_GHOST_STUDENT_IMPLEMENTATION_REPORT.md` after work concludes. Do not prefill successful outcomes or claim unperformed checks.

The report must include:

1. Completion date, branch/revision, scope delivered, and any incomplete items.
2. Changed files and migrations, with the concrete behavior each changes.
3. Ghost-student/null-versus-zero outcomes and any discovered limitations.
4. Tracker ownership, term coverage, task labels, and grading display behavior.
5. Referral authorization, idempotency, legacy handling, notification privacy/delivery, and Dean resolution behavior.
6. Commands/checks actually run, results, and relevant evidence; separate pre-existing failures from regressions.
7. Migration deployment status, live permissions/browser scenarios verified, and checks that remain unverified.
8. Remaining risks, follow-up work, and rollback notes. Disabling new UI must not delete referral history; assess database dependencies before reverting RPC definitions.

Implementation is complete only when required application changes and applicable validation are finished. Deployment and live verification must be reported with their own actual status.
