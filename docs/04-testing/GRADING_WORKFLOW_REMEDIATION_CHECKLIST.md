# ASPIRE Grading Workflow Remediation Checklist

**Prepared:** 8 October 2026  
**Last updated:** 9 October 2026  
**Scope:** Dynamic COG grading, grade posting, SG correction, student visibility, faculty interventions, audit exports, AI insight freshness, documentation, and release verification  
**Status:** Deployed; authenticated acceptance testing in progress  
**Current focus:** SQL migrations and corrected Edge Functions were deployed to the target Supabase environment on 9 October 2026. Complete authenticated end-to-end acceptance and manual spreadsheet verification. Independent server-side dynamic-COG recalculation during SG correction remains an explicit source limitation.  

## Purpose

This checklist translates the grading and QA audit findings into an implementation and verification plan. It preserves ASPIRE's authoritative dynamic Computation of Grades (COG) model while addressing workflow consistency, privacy, transactional safety, correction traceability, and documentation accuracy.

Verification labels used by the audits do not indicate whether a behavior is desirable:

- **VERIFIED** — confirmed to exist in executable source code or through an isolated function test.
- **PARTIALLY VERIFIED** — present but incomplete, inconsistent, or conditional.
- **NOT VERIFIED** — missing, contradicted by the implementation, or unsupported by evidence.

Checklist convention:

- `[x]` — implemented or verified in the repository.
- `[ ]` — not implemented, not deployed, or still requires manual/end-to-end verification.
- A completed source-code item is not automatically a production deployment sign-off.

## Confirmed Product Rules

- [x] Obtain product-owner approval for the rules in this section.
- [x] Every subject must use its assigned COG through `subjects.computation_id`.
- [x] A subject without a valid COG must not calculate or post grades.
- [x] Before first posting, a class uses the subject's current assigned COG.
- [x] First posting stores the applicable COG in `class_records.grading_formula_snapshot`.
- [x] A class formula snapshot is immutable grading history for that class.
- [x] Later global template edits affect eligible unsnapshotted or future classes only.
- [x] NULL means pending or ungraded.
- [x] Numeric zero means a recorded score and participates in grade and risk calculations.
- [x] Converting NULL to zero requires explicit faculty confirmation.
- [x] Dean approval of an SG correction grants permission to revise; it does not automatically change the student's grade.
- [x] A corrected SG becomes official only after faculty revision and successful reposting.
- [x] Every saved activity is student-visible; a separate faculty-only activity draft/release state is not part of the approved workflow.
- [x] An activity without a recorded score is displayed to the student as `Pending`.
- [x] A saved numeric score, including zero, is displayed as `Tentative` and contributes to live performance monitoring.
- [x] Only a posted MR, TFR, or SG is an official academic grade.
- [x] Only submitted or published faculty evaluations are student-visible.

## 1. SG Correction Workflow

**Implementation status:** Source and migration deployment complete except server-side formula recalculation; authenticated acceptance remains pending.

### Target feature flow

```text
Faculty posts SG
    -> SG is official and locked
    -> Faculty identifies a correction
    -> Faculty submits the exact proposal, reason, and evidence
    -> Dean reviews
        -> Reject: original SG remains locked and unchanged
        -> Approve: revision permission is granted for one student
    -> Faculty edits the authorized record
    -> Official grading engine recalculates the SG and GWA
    -> Faculty reviews before-and-after values
    -> Faculty reposts the corrected SG
    -> Transaction succeeds and the SG is relocked
    -> Request becomes Applied
    -> Student, faculty, and Dean are notified
    -> Complete correction history is retained
```

### Request data and states

- [x] Add correction states: `pending`, `approved`, `rejected`, `applied`, and `cancelled`.
- [x] Store the relevant `posted_grade_id` in every new request.
- [x] Store the original computed percentage.
- [x] Store the original effective GWA.
- [x] Store the original academic remark.
- [x] Store the exact proposed computed percentage or proposed score changes.
- [x] Store the proposed effective GWA when the selected proposal changes it.
- [x] Store the exact proposed remark.
- [x] Remove the hardcoded database value `requested_remark: 'Pending Edit'` from the request writer.
- [x] Store the faculty reason and evidence reference.
- [x] Store requester, reviewer, and applier identities.
- [x] Add the faculty cancellation action for pending and approved-but-unused requests, including cancellation identity and timestamp.
- [x] Store request, decision, and application timestamps.
- [x] Store the final applied percentage, GWA, and remark.
- [x] Link the applied repost to its approved correction request.

### Authorization and lifecycle

- [x] Permit only the assigned faculty member to submit the correction request.
- [x] Prevent more than one unresolved request for the same posted SG row.
- [x] Keep the original SG locked and student-visible while the request is pending.
- [x] On rejection, retain the original SG and its lock.
- [x] On approval, authorize revision for the affected student only.
- [x] Confirm Dean approval alone does not update `computed_grade` or `effective_grade`.
- [x] Prevent an approved request from authorizing changes to another student or class.
- [x] Prevent reuse of an already applied or cancelled approval.
- [x] Relock the SG immediately after successful reposting.
- [x] Mark the correction request `applied` only after the corrected grade commits.

### Transaction and audit

- [x] Implement final correction application inside the secured atomic milestone-posting transaction through database enforcement triggers.
- [x] Validate the approved request inside the transaction.
- [ ] Recalculate using the class's stored formula snapshot.
- [x] Preserve the previous official values before overwriting the posted row.
- [x] Roll back all mutations if any validation or write fails.
- [x] Write an immutable before-and-after correction history row.
- [x] Send Student, Faculty, and Dean notifications only after the posting transaction commits; Dean approval itself notifies Faculty only.
- [x] Add `supabase/migrations/20261008160000_sg_correction_integrity.sql` with secured submit/review/cancel RPCs, RPC-only lifecycle writes, scoped approval enforcement, application lifecycle, and immutable correction history.
- [x] Apply `20261008160000_sg_correction_integrity.sql` to the target Supabase environment.
- [ ] Run authenticated request, approve, reject, apply, replay-prevention, cross-student, and rollback acceptance tests.

## 2. Tentative Activity Visibility

**Implementation status:** Source and migration deployment complete; authenticated browser acceptance remains pending.

### Approved feature flow

```text
Faculty creates and saves an activity
    -> Student sees the activity with a Pending score
    -> Faculty records and saves a score
    -> Student sees the score labeled Tentative
    -> Running component percentage updates
    -> Running grade and current risk update
    -> Faculty may revise the tentative score
    -> Faculty posts the applicable milestone
    -> Activity result is identified as included in the posted MR, TFR, or SG
    -> The posted milestone is the official academic record
```

- [x] Remove the Faculty-only draft checkbox from activity creation and editing.
- [x] Replace `Save as Draft` wording with `Save Activity`.
- [x] Remove manual release controls from the normal Faculty workflow.
- [x] Make every successfully saved activity visible to enrolled students.
- [x] Display activities without recorded scores as `Pending`.
- [x] Display saved non-NULL scores as `Tentative` before milestone posting.
- [x] Display numeric zero as `Tentative · Recorded Zero`, not Pending.
- [x] Include every saved non-NULL score in live component and running-grade calculations.
- [x] Include recorded numeric zeros in the current recorded-zero risk factor.
- [x] Keep NULL scores excluded from grade and recorded-zero risk calculations.
- [x] Identify tentative results that were included in a posted MR, TFR, or SG.
- [x] Keep the posted milestone as the only official academic grade.
- [x] Do not notify students for every autosave keystroke.
- [x] Show Faculty `Saving…` and `Saved` state for score persistence.
- [x] Ensure students see a score only after its save succeeds.
- [x] Align Student Grade Breakdown and Academic Insights to the same tentative-activity policy.
- [x] Set new activities to visible by default during the compatibility period.
- [x] Apply the reviewed backfill in `20261008120000_automatic_activity_visibility.sql` to the target Supabase environment.
- [ ] Remove `is_released` only after all dependent queries and services have migrated.

### Source evidence

- [x] `src/pages/faculty/ScoreInput.jsx` removes the faculty release checkbox, saves activities with compatibility visibility enabled, and uses `Save Activity` / `Save All Scores` wording.
- [x] `src/components/StudentRow.jsx` automatically persists dynamic activity scores and records the latest score update timestamp.
- [x] `src/pages/student/MyGradesDetail.jsx` preserves NULL as Pending, distinguishes recorded zero, and labels saved results as Tentative or included in a posted milestone.
- [x] `src/pages/student/AcademicInsights.jsx` reads all saved activities and exposes Pending, Tentative, and Official evidence states.
- [x] Course-scoped and overall Ask ASPIRE payloads include Pending activities explicitly; an activity without a recorded score remains labeled `Pending` and is never inferred as zero or failed.
- [x] `src/lib/classRoomService.js` and `src/lib/evaluationTracking.js` count pending saved activities without using the legacy release flag.
- [x] `supabase/functions/generate-intervention-draft/index.ts` no longer filters intervention evidence by `is_released`.
- [x] Redeploy the corrected `generate-intervention-draft` function with NULL/zero handling and subject-specific dynamic COG resolution.
- [x] `supabase/functions/invoke-advisor/index.ts` consumes `pending`, `tentative`, and `official` evidence states instead of an activity-release state.
- [x] `supabase/migrations/20261008120000_automatic_activity_visibility.sql` provides the compatibility backfill and changes the legacy column default to visible.

### Local verification completed

- [x] `npm run verify:grading` — passed for five grading presets, policy scale, attendance, honors, risk boundaries, milestone identity, and summer isolation.
- [x] `node scripts/verifyEvaluationTracking.js` — passed for NULL/zero handling, dynamic activities, pending counts, risk contribution, dates, and eligibility.
- [x] `npm run lint` — completed with zero errors; existing repository warnings remain.
- [x] `npm run build` — production build completed successfully; the existing large-chunk advisory remains.
- [x] `git diff --check` — no whitespace errors.
- [ ] Run authenticated Faculty and Student browser acceptance against the target Supabase environment.
- [x] Confirm the compatibility migration was run in the target database.

### Posted-term score integrity

- [x] Treat a posted MR as covering Prelim and Midterm score cells.
- [x] Treat a posted TFR as covering Semi-Final and Final score cells.
- [x] Treat a posted SG as covering all grading-term score cells.
- [x] Allow a posted-term score to be replaced by another numeric value.
- [x] Prevent a posted-term score from being cleared to NULL in faculty grade entry.
- [x] Restore the previous recorded value and explain why the cell cannot remain empty.
- [x] Block bulk save when any posted-term cell is empty.
- [x] Add database triggers that reject posted-term score clearing or granular score deletion.
- [x] Centralize milestone-to-term coverage in `src/lib/gradeMilestones.js`.
- [x] Correct TFR coverage so it is not mislabeled as a posted SG in faculty views.
- [x] Apply `20261008130000_protect_posted_term_scores_from_null.sql` to the target Supabase environment.
- [ ] Verify replacement, clearing, blur restoration, bulk save, and direct API rejection with authenticated test accounts.

## 3. Student Evaluation Publication Privacy

- [x] Restrict Student Advising Inbox queries to submitted or acknowledged evaluations.
- [x] Exclude `draft` and `pending_review` records from Student Dashboard, Academic Insights, and Advising Inbox queries.
- [x] Require both an allowed publication status and non-NULL `published_to_student_at` before display.
- [x] Confirm faculty private notes are never selected by the audited student-facing evaluation queries.
- [x] Enforce student-visible evaluation rules through the hardened student SELECT policy in `20261008180000_grading_authorization_hardening.sql` and the secured task-completion RPC.
- [x] Restrict the task-completion RPC to legitimately published plans owned by the authenticated student.
- [x] Apply `20261008140000_student_evaluation_publication_guard.sql` to the target Supabase environment.
- [ ] Enable and verify database read isolation before marking direct-table privacy enforcement complete.

## 4. Unified Grade Posting

- [x] Create one shared milestone-posting service for Score Input and Grade Computation Preview.
- [x] Resolve `grading_formula_snapshot` first and assigned subject COG second.
- [x] Fail closed when neither a valid snapshot nor assigned COG exists.
- [x] Determine required periods consistently for MR, TFR, and SG.
- [x] Support the four-period regular-semester structure.
- [x] Support the two-period summer structure.
- [x] Detect NULL cells using the same shared logic from both Faculty pages.
- [x] Display the same blank-score review from both Faculty pages.
- [x] Preserve NULL values when faculty cancels the review.
- [x] Convert reviewed NULL values to numeric zero only after explicit confirmation in Score Input.
- [x] Recalculate affected component, term, milestone, and SG values before posting.
- [x] Generate notifications only after successful posting.
- [x] `src/lib/gradePostingService.js` is the shared Faculty posting persistence boundary.
- [x] Add the same explicit blank-score review and atomic zero-conversion interaction to Grade Computation Preview.

## 5. Atomic NULL-to-Zero Posting

- [x] Implement reviewed NULL conversion and milestone posting as one server-side transaction.
- [x] Include `student_term_scores` changes in the transaction.
- [x] Include `student_activity_scores` changes in the transaction.
- [x] Include formula snapshot creation when required.
- [x] Include `posted_grades` insert or update.
- [x] Include milestone-lock updates.
- [x] Roll back database zero conversions if posted-grade persistence fails; stage browser-cache changes until commit succeeds.
- [x] Make retries idempotent and prevent duplicate posted-grade rows by natural milestone identity.
- [x] Display a clear failure message without claiming a post succeeded.
- [x] Do not dispatch student or guardian notifications after a rolled-back attempt.
- [x] Add `supabase/migrations/20261008150000_atomic_grade_milestone_posting.sql` with the transactional RPC, authorization checks, formula validation, advisory locking, and unique milestone index.
- [x] Apply `20261008150000_atomic_grade_milestone_posting.sql` to the target Supabase environment.
- [ ] Run authenticated rollback, retry, concurrency, regular-semester, and summer acceptance tests against the migrated environment.

## 6. Faculty Intervention Draft Persistence

**Implementation status:** Source and migration deployment complete; authenticated persistence/privacy acceptance remains pending.

- [x] Persist faculty edits before official evaluation submission.
- [x] Persist manually added tasks.
- [x] Persist AI-generated additional tasks.
- [x] Persist removed tasks and task order.
- [x] Persist student-visible academic guidance.
- [x] Persist restricted faculty notes securely through assigned-faculty RPCs only.
- [x] Persist the plan deadline and referral choices.
- [x] Key drafts by faculty, class, student, and term.
- [x] Restore between one and five tasks instead of requiring exactly three.
- [x] Preserve edited drafts across modal close, page navigation, and browser refresh.
- [x] Keep unsubmitted drafts faculty-only.
- [x] Link the working draft to the official evaluation inside the submission transaction.
- [x] Add `supabase/migrations/20261008170000_faculty_intervention_working_drafts.sql` with the private working-draft table, secured save/load RPCs, and submission-link trigger.
- [x] Apply `20261008170000_faculty_intervention_working_drafts.sql` to the target Supabase environment.
- [ ] Run authenticated restore, privacy, one-to-five-task, navigation, refresh, and submission-link acceptance tests.

## 7. Admin Audit Improvements

### CSV safety

- [x] Introduce one CSV-safe field encoder.
- [x] Double embedded quote characters instead of replacing them.
- [x] Quote fields containing commas, quotes, carriage returns, or line breaks.
- [x] Encode empty and NULL values consistently.
- [x] Export a stable ISO timestamp or safely quote the formatted timestamp.
- [x] Confirm every exported row has exactly the declared number of columns.
- [ ] Verify exports containing punctuation in spreadsheet software.

### Event provenance

- [x] Display `log.source` in each Admin Audit Log card or details panel.
- [x] Distinguish application events from database-trigger events.
- [x] Include source in search and filtering.
- [ ] Verify both source types with controlled fixtures.

## 8. AI Insight Freshness

- [x] Define the evidence inputs that make an insight current.
- [x] Include posted-grade revision information in an evidence fingerprint.
- [x] Include attendance revision information.
- [x] Include saved-activity score revision information.
- [x] Include relevant evaluation revision information.
- [x] Store the fingerprint and evidence version with the generated insight.
- [x] Compare stored and current fingerprints before reusing cached text.
- [x] Regenerate or clearly label stale explanations.
- [x] Prevent outdated explanations from appearing beside current GWA or attendance evidence.

## 9. Database Authorization and Integrity

- [x] Review RLS status for the active student-facing grading and advising tables.
- [x] Add source-level RLS so students can read only their own academic records and enrolled-class configuration.
- [x] Ensure students cannot read faculty-only drafts, private notes, or SG correction requests.
- [x] Ensure faculty can change grades and grading inputs only for actively assigned classes.
- [x] Ensure Deans can review records and requests only within their authorized department.
- [x] Ensure Admin overrides require an active authorized Admin role.
- [x] Validate activity scores on the server, including `score <= max_score`.
- [x] Preserve secured RPCs for multi-table posting, evaluation, and SG-correction mutations.
- [ ] Verify authorization cannot be bypassed by direct API requests.
- [x] Add `supabase/migrations/20261008180000_grading_authorization_hardening.sql` with RLS, grants, role/scope helpers, formula-snapshot immutability, and the activity-score maximum trigger.
- [x] Apply `20261008180000_grading_authorization_hardening.sql` to the target Supabase environment.
- [ ] Run authenticated Student, assigned/unassigned Faculty, in/out-of-department Dean, Admin, anonymous, and direct-API acceptance tests.

## 10. Documentation Updates

### Include as official behavior

- [x] Document subject-specific dynamic COG assignment.
- [x] Document all five supported COG templates and their component weights.
- [x] Document failure behavior when no valid COG is assigned.
- [x] Document formula snapshot creation at first posting.
- [x] Document snapshot immutability and its historical-integrity purpose.
- [x] Document NULL versus recorded-zero semantics.
- [x] Document component normalization using total earned divided by total available points.
- [x] Document regular and summer milestone formulas.
- [x] Document MR and TFR posting or reposting behavior.
- [x] Document the faculty-Dean approval-to-revise SG workflow.
- [x] State that Dean approval does not automatically change the SG.
- [x] State that students receive the corrected SG only after successful faculty reposting.
- [x] Document universal saved-activity visibility with Pending, Tentative, and Official distinctions.
- [x] Document submitted-only evaluation visibility.

### Exclude from official feature claims

- [x] Do not document the hidden What-If simulator as an official feature.
- [x] Do not claim projected GWA simulation is implemented.
- [x] Do not claim required Final Exam forecasting is implemented.
- [x] Do not claim President's Lister target simulation is implemented.
- [x] Reclassify formula-snapshot behavior as an intended product rule rather than a defect.

## 11. Preserved Behavior — No Redesign Required

- [x] Preserve the five official dynamic COG templates.
- [x] Preserve subject-to-COG assignment through `computation_id`.
- [x] Preserve the requirement that valid template weights total 100%.
- [x] Preserve class-level formula snapshots after first posting.
- [x] Preserve point-based component normalization.
- [x] Preserve the distinction between NULL and numeric zero.
- [x] Preserve the DYCI transmutation ladder and exact boundaries.
- [x] Preserve regular and summer grading calculations.
- [x] Preserve historical faculty risk-evaluation snapshots.
- [x] Preserve the separation between Admin override and faculty-Dean SG correction in source; authenticated acceptance remains pending.

## 12. End-to-End QA Checklist

> **2026-10-10:** These cases have been merged with the 2026-10-10 update cases into `SYSTEM_TEST_CHECKLIST_2026-10-10.md`. Execute and record results there; this section is kept for reference.

### Team execution notes

Use this section as the release acceptance runbook. A checked item means the expected result was observed in the deployed environment and evidence was retained; it does not mean only that the source code exists.

> **Mandatory manual QA rule:** Every end-to-end case in this section must be performed manually by a human tester using the deployed frontend. The tester must interact with the visible controls, inspect labels, loading and saving states, validation messages, modal behavior, navigation, refresh behavior, and role-specific screens. AI must not execute, simulate, infer, or mark these frontend cases as passed. Automated scripts and AI-assisted analysis are supplementary checks only and cannot replace human visual verification of the frontend workflow.

A case may be marked `PASS` only when the assigned human tester has personally reproduced the steps, observed the expected frontend behavior, and retained the required evidence. Source-code inspection, unit-style scripts, database queries, or an AI audit alone are not sufficient to pass an end-to-end item.

> **Branch and merge control:** This update is staged on the `ghost` branch. The QA team must execute the manual end-to-end cases against the deployed `ghost` branch preview, not against `main` or the production frontend. Record the preview URL and deployed commit SHA in the test report. The `ghost` branch must not be merged into `main` until all release-blocking cases pass, failed cases are fixed and retested, and the QA lead and product owner have recorded approval.

**Before testing**

- Use a dedicated QA academic term and clearly named QA classes. Do not use real student grades or active production classes.
- Record the frontend build or commit, Supabase project, browser, tester, and test date at the top of the test report.
- Confirm the browser is using the deployed `ghost` branch preview URL and that its commit SHA matches the build under test.
- Prepare one regular-semester class and one summer class. Across the QA classes, assign all five official COG templates.
- Prepare at least two students, two faculty accounts assigned to different classes, two Dean accounts from different departments, and one Admin account.
- Use separate browser profiles or private windows for Faculty, Student, Dean, and Admin. Do not switch roles in one active session because cached authentication can invalidate the result.
- Record the class, subject, section, student, faculty, COG, and academic-term identifiers used in each test.
- Capture baseline screenshots or exports before changing grades. For database-sensitive cases, record the relevant row values before and after the action.
- Never use the Supabase service-role key for role-authorization tests. Test with the same authenticated client credentials used by the application.
- Perform the primary workflow through the rendered frontend before using direct API or database checks. Direct checks confirm enforcement but do not replace frontend verification.
- Stop a scenario after an unexpected result. Capture the browser console, failed network response, timestamp, affected identifiers, and reproduction steps before retrying.

**Result labels**

- `PASS` — the observed UI and stored data match every expected result.
- `FAIL` — the action completes incorrectly, unauthorized data is exposed, data changes unexpectedly, or different screens disagree.
- `BLOCKED` — the test cannot execute because required data, account access, configuration, or a dependent feature is unavailable. State the exact blocker.
- `NOT RUN` — no execution attempt has been made. Do not use this as a release result.

**Evidence required for every scenario**

- Before-and-after screenshots for visible behavior.
- Relevant browser Network response, including HTTP status and returned error for rejected operations.
- Read-only database confirmation for posting, correction history, draft persistence, and rollback cases.
- Defect ID and severity for every `FAIL` result.
- Tester name, execution time, and final `PASS`, `FAIL`, or `BLOCKED` decision.

Recommended result row:

| Test ID | Environment/build | Account/role | Test data IDs | Expected | Actual | Result | Evidence/defect |
|---|---|---|---|---|---|---|---|
| Example: COG-01 | Staging / commit SHA | Assigned Faculty | Class, subject, student | GenEd formula is used everywhere | Record observation | PASS/FAIL/BLOCKED | Screenshot or defect link |

### Dynamic COG

**Team notes:** Use a separate QA subject/class for each official template. Enter simple scores that can also be calculated manually in a spreadsheet. Record the assigned `computation_id`, component weights, term rating, milestone rating, and transmuted GWA. Compare Faculty Grade Entry, Grade Computation Preview, the posted record, Student Grades, reports, exports, and current risk. All surfaces must agree after accounting for the documented rounding stage. A mismatch on any surface is a failure even when the final rounded value happens to match.

For snapshot testing, post the first milestone before editing the global template. Record the saved class snapshot, make a reversible change only to a QA template, and confirm the already-snapshotted class does not change. Use a second unsnapshotted QA class to confirm that the current assigned template is resolved before first posting. Restore the QA template after evidence is collected.

- [ ] Test General Education Core.
- [ ] Test Health Sciences Theory.
- [ ] Test Health Sciences RLE or Clinical Practicum.
- [ ] Test Maritime Lecture.
- [ ] Test Maritime Laboratory or Simulator.
- [ ] Confirm grade entry, preview, posting, student display, report, export, and risk calculations use the same formula.
- [ ] Edit a global template and confirm an existing snapshotted class remains unchanged.
- [ ] Confirm an eligible unsnapshotted class uses the current assigned template.

### NULL and zero posting

**Team notes:** Use different students or record the baseline before each variation. Verify storage as well as labels: SQL `NULL` is pending, while numeric `0` is an intentional recorded score. Wait for the Faculty `Saved` indicator before checking the Student portal. Run each milestone from both Faculty Score Input and Grade Computation Preview so the two entry points are proven equivalent.

When testing cancellation, dismiss the blank-score review and refresh both portals; no NULL may have been converted. When confirming, verify the reviewed cells are stored as numeric zero and the posted milestone is committed in the same successful operation. To test failure recovery safely, use only a QA class and trigger a controlled validation failure or network interruption; verify that neither zero conversion nor posting is partially retained. On retry, there must be one natural milestone row and one set of notifications, not duplicates.

After a milestone is posted, try clearing a covered score by keyboard deletion, blur, bulk save, and a direct authenticated API request. The UI must restore or reject the empty value, and the database must reject NULL or row deletion. Replacing the score with another valid number must remain allowed through the authorized correction workflow.

- [ ] Enter a positive score and save.
- [ ] Enter numeric zero and save.
- [ ] Leave a score NULL and save.
- [ ] Cancel the blank review and confirm NULL remains NULL.
- [ ] Confirm conversion and verify numeric zero is stored.
- [ ] Force posting failure and verify the conversion rolls back.
- [ ] Retry safely without duplicate rows or notifications.
- [ ] Repeat for MR, TFR, and SG.
- [ ] Repeat for regular and summer classes.

### SG correction

**Team notes:** Use one request for rejection and a separate request for approval/application. Before submitting, record the official SG percentage, effective GWA, remark, lock state, and student-facing value. The request must contain the exact original and proposed values plus reason/evidence. While pending or merely approved, every academic screen must continue to show the original official SG.

After approval, confirm only the named student in the named class becomes editable. Attempt the approval against another student, another class, and a second time after application; each attempt must be rejected without mutation. The faculty must revise and repost before the student value changes. After successful reposting, confirm the request is `applied`, the SG is locked again, before-and-after history is immutable, and notifications exist only for committed events. Preserve screenshots from Student, Faculty, Dean, and Admin views and compare report/export output.

- [ ] Post an SG and confirm it is locked.
- [ ] Submit a correction request containing exact proposed values.
- [ ] Confirm the student still sees the original SG while pending.
- [ ] Reject one request and confirm no academic value changes.
- [ ] Approve one request and confirm approval alone does not change the SG.
- [ ] Confirm only the affected student's row is editable.
- [ ] Apply corrected scores or remarks through the official grading engine.
- [ ] Review before-and-after values.
- [ ] Repost successfully and confirm the row is relocked.
- [ ] Confirm the request changes from `approved` to `applied`.
- [ ] Confirm Student, Faculty, Dean, Admin, reports, and exports show the corrected value.
- [ ] Confirm current GWA and risk recalculate.
- [ ] Confirm historical risk-evaluation snapshots remain unchanged.

### Student privacy

**Team notes:** Keep the Student portal open in a separate authenticated session. Refresh only after the Faculty save indicator appears so the test measures persisted data rather than optimistic UI state. Pending activities must be visible without exposing a score; saved positive and zero scores must be labeled Tentative. A recorded zero must never be displayed or counted as missing.

Create two evaluations for the same QA student: one draft or pending-review record containing a unique marker in its private note, and one submitted/published record. Search the Student Dashboard, Academic Insights, Advising Inbox, browser Network payloads, and direct authenticated table response for the marker. Any exposure of the unpublished evaluation or private faculty note is a critical failure.

- [ ] Create an activity without a score and confirm the student sees `Pending`.
- [ ] Save a positive score and confirm the student sees it as `Tentative`.
- [ ] Save numeric zero and confirm the student sees `Tentative · Recorded Zero`.
- [ ] Confirm positive and zero scores update live performance and current risk appropriately.
- [ ] Confirm NULL remains excluded from grade and recorded-zero calculations.
- [ ] Modify a tentative score and confirm the student sees the saved revision.
- [ ] Post the applicable milestone and confirm the UI distinguishes the official milestone from tentative activity evidence.
- [ ] Create one draft evaluation and one submitted evaluation.
- [ ] Confirm faculty can see both.
- [ ] Confirm students can see only the submitted evaluation.
- [ ] Confirm private faculty notes never appear to students.

### Intervention drafts

**Team notes:** Generate the plan with at least two kinds of evidence, including one Pending activity and one recorded numeric zero. Confirm the AI treats Pending as missing evidence and zero as recorded low-scoring evidence. For a class without a formula snapshot, confirm the generated evidence uses the subject's assigned COG; it must not silently use a 50/10/40 fallback. A subject with no valid assigned COG must fail with a clear error.

After editing tasks, wait for persistence, refresh the browser, navigate away and back, and reopen the modal. The same task text, source, ordering, deadline/referral choices, academic guidance, and faculty-only notes must return. Before submission, attempt to read the draft as the Student and as an unassigned Faculty account; no draft or private note may be returned. After submission, verify the official evaluation preserves the final order and links to the working draft.

- [ ] Generate an initial three-task AI plan.
- [ ] Edit one AI task.
- [ ] Add a manual task.
- [ ] Add an additional AI task.
- [ ] Remove or reorder a task if supported.
- [ ] Refresh and confirm all changes remain.
- [ ] Close and reopen the modal and confirm restoration.
- [ ] Submit and verify final task order and content.

### Audit and AI

**Team notes:** Use a controlled audit value containing a comma, a double quote, and a line break. Open the CSV in both a plain-text editor and spreadsheet software. Confirm the header and every row have the same number of columns and that no value is interpreted as an extra row or column. Verify the on-screen source distinguishes application events from database-trigger events and that source filtering/search works.

Generate or view an AI insight, record its evidence fingerprint/version, then change one saved activity score, one attendance item, or one posted-grade revision. The old explanation must be marked stale or regenerated before it is shown beside current evidence. A cached narrative that contradicts the visible grade or attendance state is a failure.

- [ ] Export audit data containing commas, quotes, and line breaks.
- [ ] Confirm every CSV row has the expected number of columns.
- [ ] Confirm event source appears on screen.
- [ ] Change grade or attendance evidence.
- [ ] Confirm the previous AI explanation becomes stale or regenerates.
- [ ] Confirm the displayed explanation matches current evidence.

### Authorization and direct API

**Team notes:** Perform these checks through both the UI and direct authenticated Supabase requests. A denied request must return an authorization error or no inaccessible rows and must leave the database unchanged. Do not treat a hidden button as authorization proof. Keep the Network response and before-and-after row evidence.

- [ ] Confirm an anonymous client cannot read or mutate protected grading and advising records.
- [ ] Confirm a Student can read only their own enrolled academic records and cannot mutate grades, activities, evaluations, or corrections.
- [ ] Confirm a Student cannot retrieve another student's record by substituting an identifier in a direct request.
- [ ] Confirm an assigned active Faculty account can manage only its assigned active classes.
- [ ] Confirm an unassigned Faculty account cannot read private drafts or mutate another faculty member's class.
- [ ] Confirm a Dean can review only requests and records within the Dean's authorized department.
- [ ] Confirm an out-of-department Dean cannot retrieve or decide the request through a direct RPC/API call.
- [ ] Confirm an active Admin can perform only the documented administrative override actions.
- [ ] Confirm activity scores above `max_score`, below zero, NULL clearing for posted terms, and unauthorized row deletion are rejected by the database.
- [ ] Confirm formula snapshots cannot be changed after first posting through either table update or client manipulation.

### Completion and defect handling

**Team notes:** The QA lead reviews evidence rather than accepting verbal confirmation. Rerun a failed case after a fix using the original data shape plus one adjacent regression case. Do not check a release gate until all underlying cases pass. Any cross-user data exposure, unauthorized grade mutation, partial posting, incorrect COG, or missing correction history is release-blocking.

- [ ] Record a result and evidence link for every item in Section 12.
- [ ] Confirm every end-to-end result was executed and signed by a human tester, not generated or inferred by AI.
- [ ] Confirm all manual frontend evidence came from the deployed `ghost` branch preview and identifies the tested URL and commit SHA.
- [ ] Link every failed result to a tracked defect with owner and severity.
- [ ] Retest every resolved defect and record the build or commit containing the fix.
- [ ] Complete one final clean regression run after all release-blocking defects are closed.
- [ ] Obtain QA lead and product-owner sign-off before production release.
- [ ] Authorize merge from `ghost` to `main` only after every release-blocking requirement above is satisfied.

## 13. Release Gates

- [ ] Every saved activity follows the approved Pending/Tentative/Official visibility model in authenticated end-to-end testing. Source implementation is complete.
- [ ] Student cannot access draft or unpublished evaluations.
- [ ] NULL-to-zero conversion and posting are atomic.
- [ ] Both Faculty posting pages use one consistent workflow.
- [ ] SG correction retains complete original, proposed, decision, and final history.
- [ ] Dean approval cannot silently or automatically alter the official SG.
- [ ] Faculty intervention drafts survive refresh and restore one to five tasks.
- [ ] CSV exports are structurally valid.
- [ ] Cached AI explanations cannot contradict current evidence without a stale warning.
- [ ] Dynamic COG calculations pass for all five templates.
- [ ] Regular and summer workflows pass focused regression tests.
- [ ] Documentation describes only implemented and approved behavior.
- [ ] Human testers manually verified the deployed frontend; automated and AI-assisted checks were used only as supplementary evidence.
- [ ] The tested `ghost` preview commit is the exact commit approved for merge into `main`.
- [ ] QA lead records PASS, FAIL, or BLOCKED for every applicable case.

## Recommended Execution Order

1. Open the deployed `ghost` branch preview and record its URL, commit SHA, Supabase environment, role accounts, QA classes, and baseline values.
2. Run a role-access smoke test to confirm each account reaches only its intended portal and QA data.
3. Verify tentative activity visibility, NULL/zero semantics, and unpublished-evaluation privacy.
4. Verify all five dynamic COG templates and atomic MR, TFR, and SG posting for regular and summer classes.
5. Verify SG correction rejection, approval-without-mutation, faculty reposting, relocking, history, and notifications.
6. Verify faculty intervention draft persistence, dynamic-COG evidence, and draft privacy.
7. Verify audit CSV structure, event provenance, and AI evidence invalidation.
8. Complete the direct-API authorization matrix and database constraint tests.
9. Retest defects on the updated `ghost` preview, complete a clean regression run, obtain QA lead and product-owner sign-off, and only then authorize the merge into `main`.
