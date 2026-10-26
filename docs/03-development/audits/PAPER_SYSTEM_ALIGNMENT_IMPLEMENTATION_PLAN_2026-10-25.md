# Paper-System Alignment Implementation Plan - 2026-10-25

**Status:** Implemented locally on 2026-10-25; database application, deployment, and manual acceptance QA remain pending.  
**Scope:** Classroom joining, FDA faculty discretion, intervention counts, Dean academic-risk reporting, faculty outcome reporting, and non-causal intervention language.  
**Evidence basis:** Read-only review of the current React source, shared calculation helpers, Supabase migrations, verification scripts, and the revised ASPIRE Chapters 1-2 paper. The remote database was not queried and no production data was changed.

## Objective

Bring the running ASPIRE system into conformity with the revised paper. The paper is the target specification because it contains the finer and more defensible rules: class-code joining requires faculty approval; four absences trigger an FDA recommendation rather than an automatic grade; academic risk uses four factors; intervention outcomes are descriptive rather than causal; and pass rate alone does not measure faculty effectiveness.

This plan does not add predictive analytics. ASPIRE remains a deterministic, explainable academic-monitoring and early-intervention system.

The implementation adds a forward-only FDA migration, an explicit faculty FDA decision with a required reason, a shared college risk service, true active-intervention counts, corrected join messaging, neutral faculty class-outcome reporting, current intervention status summaries, and descriptive non-causal comparison language. The migration has not been applied remotely.

## Audit conclusion

At the time of the audit, all six reported gaps remained in the codebase. Two were broader than their visible wording suggested:

1. FDA is automatically derived by both the client and the server-authoritative grade calculation, so it requires a coordinated frontend and database correction.
2. GWA-only or partially populated risk calculations appear in the Dean report, Risk and Honors page, and dashboard, so renaming only one report would not make the system conform to the paper.

The Faculty risk roster already supplies GWA, attendance, recorded numeric-zero scores, and trajectory to the shared risk engine. It is the closest existing reference for the intended Dean implementation.

## Paper-to-system implementation matrix

| ID | Area | Existing system | Paper requirement | Planned change | Files to change | Expected effect | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALIGN-JOIN-01 | Classroom join approval | The database RPC creates a pending request, but My Grades says students are immediately enrolled and uses Enroll/Enrolling button text. | A student submits a class-code request and enters the class only after faculty approval. | Replace immediate-enrollment language with request-and-approval language. Rename the action to Send Join Request and its progress state to Sending Request. Remove the stale Instant Enrollment service comment. | `src/pages/student/MyGradesList.jsx`; `src/lib/classRoomService.js` | The visible workflow matches the already-correct approval transaction. No database change. | P1 |
| ALIGN-JOIN-02 | Join-code description | The generator displays codes such as `DSAA-C25S`: eight alphanumeric symbols plus a hyphen. Another screen calls this a 6-8 character code. | The paper requires a classroom code but does not prescribe a numeric-only format. | Standardize wording to an 8-character alphanumeric classroom code displayed as `XXXX-XXXX`. Preserve existing codes. Treat an eight-numeric-digit requirement, if later chosen, as a separate compatibility decision. | `src/lib/classRoomService.js`; `src/pages/student/MyGradesList.jsx`; `src/pages/student/MySubjects.jsx` | Removes contradictory length and format descriptions without invalidating active codes. | P2 |
| ALIGN-FDA-01 | Student FDA warning | Four absences are presented as an FDA designation. | Four absences trigger an FDA recommendation for instructor review; no grade is changed automatically. | Present the threshold as FDA Recommendation or FDA Review Required and state that the official decision remains with the instructor. Use recommendation-oriented state names where practical. | `src/pages/student/Attendance.jsx`; `src/pages/student/AcademicInsights.jsx`; `src/pages/student/Dashboard.jsx` | Students receive an accurate warning without being told that an official FDA was already assigned. | P0 |
| ALIGN-FDA-02 | Faculty FDA warning | The Attendance page says FDA is mandatory and the final grade is locked to 5.00. Threshold badges and filters use final-status wording. | Attendance contributes to risk and triggers review; faculty makes the final FDA decision. | Correct the policy paragraph and rename threshold badges, filters, and counts to FDA Recommendation/FDA Review. | `src/pages/faculty/ClassAttendance.jsx`; `src/pages/faculty/GradeComputationPreview.jsx`; `src/pages/faculty/ClassRecordsList.jsx` | Faculty sees an actionable advisory rather than an automatic academic decision. | P0 |
| ALIGN-FDA-03 | Client grade presentation | `StudentRow` derives FDA from four absences, displays 5.00, and disables the faculty remark selector. The read-only posted-grade table can therefore visually disagree with the saved official record. | An attendance threshold is not itself an official grade. | Remove automatic FDA/5.00 derivation from the shared row. Preserve the score-derived result and display a separate recommendation badge. Add an explicit FDA decision during SG review/posting with a required reason. | `src/components/StudentRow.jsx`; `src/pages/faculty/GradeComputationPreview.jsx`; `src/pages/faculty/PostedGradesView.jsx`; `src/components/ExportPreviewModal.jsx` | Tentative, posted, and exported views no longer manufacture an FDA result from attendance alone. | P0 |
| ALIGN-FDA-04 | Server-authoritative grade calculation | `aspire_calculate_student_grade` returns `fda` and 5.00 at four absences. The posting transaction treats that projection as authoritative. | Faculty must explicitly decide FDA after reviewing the recommendation. | Add a new migration that returns the score-derived remark/GWA plus `fda_recommended` and absence evidence. Accept FDA on SG posting only when explicitly selected by the assigned faculty, the attendance threshold is met, and a reason is supplied. | New `supabase/migrations/<timestamp>_fda_faculty_discretion.sql`; `src/pages/faculty/GradeComputationPreview.jsx`; `src/lib/gradePostingService.js` if the payload contract must change | The authoritative transaction enforces faculty discretion instead of contradicting it. | P0 |
| ALIGN-COUNT-01 | Intervention dashboard count | When the real evaluation count is zero, the dashboard substitutes the entire student count. The query also counts all evaluation rows while the help text describes students whose risk triggered intervention. | Counts must reflect real intervention data, including a true zero; faculty may evaluate students at any risk level. | Remove the fallback. Define the card as Active Intervention Cases: published evaluations without a recorded follow-up. Select the fields required for that definition and update the help text. | `src/pages/faculty/Dashboard.jsx` | Zero displays as `0`; historical, closed, and unrelated roster counts do not inflate the KPI. | P1 |
| ALIGN-RISK-01 | Shared risk inputs | The Faculty roster supplies all four factors, while Dean consumers rebuild partial risk inputs independently. | One explainable four-factor Academic Risk Score should be used consistently. | Extract or reuse the Faculty roster's factor-input construction in a batch-capable college risk service. Keep `src/lib/riskEngine.js` as the scoring source of truth. | `src/lib/classRoomService.js`; proposed `src/lib/collegeRiskService.js`; `src/lib/riskEngine.js` only if a non-breaking shared input helper is required | Prevents formula drift and gives Dean screens the same evidence as Faculty screens. | P0 foundation |
| ALIGN-RISK-02 | Dean Risk and Honors view | The live Academic At-Risk roster calls the shared engine with aggregate GWA and completeness only. | Academic risk combines current standing, attendance, recorded zeros, and Prelim-to-Midterm trajectory. | Calculate risk per student-class, display the associated subject and factor breakdown, and aggregate a student's college-level status from the highest active course risk without mixing factors across subjects. | `src/pages/dean/AtRiskStudents.jsx`; proposed `src/lib/collegeRiskService.js` | Faculty and Dean obtain the same score and tier for the same student-class evidence. | P0 |
| ALIGN-RISK-03 | Dean dashboard | The dashboard supplies GWA and worst-course attendance but omits recorded zeros and trajectory. | Dashboard risk monitoring must use the documented model or clearly disclose a different descriptive measure. | Consume the shared college risk dataset. Count distinct students by their highest active student-class risk and preserve the responsible subject for drill-down. | `src/pages/dean/Dashboard.jsx`; proposed `src/lib/collegeRiskService.js` | Removes conflicting risk counts across Dean screens. | P0 |
| ALIGN-RISK-04 | Dean printable at-risk report | The report calls `calculateAcademicRisk` with GWA only but labels results as formal High/Critical risk. | Formal risk classifications use all four factors. | Replace the GWA-only calculation with the shared student-class dataset. Include subject, composite score, tier, GWA contribution, absences, numeric-zero count, and trajectory. | `src/pages/dean/SummaryReports.jsx`; proposed `src/lib/collegeRiskService.js` | Onscreen, PDF, and Excel risk reports match the paper and Faculty view. | P0 |
| ALIGN-FACULTY-01 | Faculty performance ranking | The report sorts by pass rate, assigns rank numbers, highlights winners, uses an award icon, shows Top Performer, and says the first faculty member leads. | Pass rate is descriptive and cannot establish faculty effectiveness. | Rename the report Faculty Class Outcome Summary. Remove competitive ordering, rank, award, winner highlighting, Top Performer, and leads language. Use alphabetical or neutral grouping. | `src/pages/dean/SummaryReports.jsx` | The report summarizes class outcomes without evaluating teaching effectiveness. | P1 |
| ALIGN-FACULTY-02 | Pass-rate denominator | Passed results are divided by total enrollment, including learners without applicable posted results. | Descriptive statistics must state and use the evidence population consistently. | Calculate pass rate from applicable graded records. Show Enrolled, Graded, and Pending/Not Yet Graded separately and add a short interpretation disclaimer. | `src/pages/dean/SummaryReports.jsx` | Pass-rate values become reproducible and defensible. Historical displayed percentages may change. | P1 |
| ALIGN-OUTCOME-01 | Intervention language | The executive summary says students showed measurable GWA improvement; other labels use Recovered and Baseline Recovery Tracker. | Baseline-to-follow-up differences are recorded observations, not proof that ASPIRE caused improvement. | Use recorded-change language, such as "a more favorable follow-up GWA was recorded." Add a non-causation note and rename the tracker Baseline-to-Follow-up Outcome Tracker. | `src/pages/dean/SummaryReports.jsx`; `src/pages/dean/AtRiskStudents.jsx` | Aligns system language with the study design and unified hypothesis. | P1 |
| ALIGN-OUTCOME-02 | Outcome status counts | The shared helper returns Improved, Unchanged, Worsened, In intervention, Follow-up due, and Escalated to Dean. The report searches for obsolete values such as Recovered / GWA Improved and Stabilized. | Reports must accurately summarize stored baseline and follow-up states. | Adopt the helper's current taxonomy across the KPI, chart, table, PDF, and Excel. Keep numeric GWA change separate from risk-tier transition. | `src/lib/evaluationTracking.js`; `src/pages/dean/SummaryReports.jsx`; `scripts/verifyEvaluationTracking.js` | Prevents valid cases from being counted as zero or omitted from charts. | P1 |
| ALIGN-LANGUAGE-01 | Other analytics claims | Some comparison summaries say trends indicate improved mastery or academic retention. | The current study measures recorded system values, not causal learning or retention effects. | Replace claims with neutral observations: recorded pass rate increased, or recorded at-risk proportion decreased. | `src/pages/faculty/PerformanceComparison.jsx`; `src/lib/reportsService.js` | Removes unsupported claims from secondary analytics. | P2 |

## Target FDA decision workflow

```text
Four absences recorded in one subject
                |
                v
FDA recommendation contributes to the Academic Risk Score
                |
                v
Faculty sees "FDA Review Required"
                |
                v
Faculty reviews attendance and relevant context
                |
                +--> Retain score-derived Passed/Failed result
                |
                +--> Explicitly select FDA and provide a reason
                              |
                              v
                 Server validates and posts the decision
```

The server projection should retain the score-derived result and return separate attendance evidence, conceptually:

```js
{
  effective_grade: scoreDerivedGwa,
  remarks: scoreDerivedRemark,
  absences: 4,
  fda_recommended: true
}
```

The database must not return `fda` or `5.00` solely because the absence count reached four.

Existing official FDA records must not be automatically rewritten. They are historical academic records and require authorized individual review if a correction is necessary.

## Target Dean risk model

Attendance, recorded-zero scores, and trajectory belong to a specific class. The Dean dataset must therefore calculate one risk result per student-class rather than combining unrelated subject evidence into a single synthetic score.

For college-level dashboard totals:

1. Calculate all active student-class risk records with the shared engine.
2. Group results by student.
3. Use the student's highest active course risk for the distinct-student KPI.
4. Preserve the class/subject that produced that risk.
5. Show all student-class rows and factor contributions in the detailed view and export.

This rule prevents, for example, attendance from one subject being combined with a performance trajectory from another subject.

## Implementation phases

### Phase 1 - FDA policy correction

1. Add the forward-only Supabase migration; do not edit an already-applied migration.
2. Correct server grade projection and official-posting validation.
3. Add the explicit faculty FDA decision during SG review.
4. Remove automatic FDA/5.00 client presentation.
5. Correct student, faculty, and AI policy wording and threshold badges.
6. Add automated and manual regression coverage.

**Release gate:** A passing student with four absences retains the score-derived official grade unless faculty explicitly selects FDA. The recommendation remains visible and contributes to risk.

**Deployment note:** The database migration and compatible frontend must be deployed as one coordinated release. The device owner applies the migration manually through the approved Supabase process.

### Phase 2 - Shared college risk calculation

1. Extract a reusable factor-input builder from the working Faculty roster path.
2. Implement batched student-class risk loading for the Dean's college scope.
3. Update Risk and Honors, the Dean dashboard, and Summary Reports.
4. Add factor-level display and export fields.
5. Compare Dean and Faculty results for the same student-class fixtures.

**Release gate:** Identical evidence produces identical score, tier, and factor contributions in Faculty and Dean views.

### Phase 3 - Dashboard and reporting corrections

1. Replace the intervention-count fallback with the defined active-case count.
2. Align outcome KPI/chart filters with the shared status helper.
3. Replace causal and recovery claims with recorded-change wording.
4. Convert Faculty Performance Ranking into Faculty Class Outcome Summary.
5. Correct the pass-rate denominator and disclose graded/pending counts.
6. Confirm that screen, PDF, and Excel content use the same labels and values.

**Release gate:** A true zero displays as zero; all current intervention statuses appear in the report; and no faculty-effectiveness or intervention-causation claim remains.

### Phase 4 - Classroom join wording

1. Correct My Grades instructions and action labels.
2. Correct stale service comments.
3. Standardize the displayed code-format description.
4. Confirm that existing active codes remain valid and that approval creates enrollment exactly once.

**Release gate:** Every student-facing join entry point states that the request requires instructor approval.

### Phase 5 - Documentation and defense evidence

1. Extend `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md` with the acceptance cases below.
2. Recapture screenshots containing replaced labels or old calculations.
3. Replace affected Chapter 2 screenshots and captions if the old text is visible in the embedded image.
4. Retain the current written paper rules; they already describe the intended target behavior.

## Acceptance tests

| ID | Scenario | Expected result |
| --- | --- | --- |
| QA-JOIN-01 | Student submits a valid classroom code. | A pending request is created; the student is not enrolled yet. |
| QA-JOIN-02 | Assigned faculty approves the request. | Enrollment is created exactly once and the student can open the class. |
| QA-JOIN-03 | Student submits the same code while the request is pending. | The existing pending request is reported; no duplicate request or enrollment is created. |
| QA-FDA-01 | A student with a passing score reaches four absences. | FDA recommendation appears; score-derived GWA and remark remain unchanged. |
| QA-FDA-02 | Faculty posts SG without selecting FDA. | The server posts the score-derived Passed/Failed result. |
| QA-FDA-03 | Faculty explicitly selects FDA at or above the threshold and supplies a reason. | The server accepts FDA and posts the institutionally valid FDA result. |
| QA-FDA-04 | Faculty attempts FDA below the threshold or without a reason. | The server rejects the request without changing any official grade. |
| QA-FDA-05 | Student has three absences. | Near-FDA warning appears; no recommendation or official-grade change occurs. |
| QA-COUNT-01 | Faculty has enrolled students but no active interventions. | Dashboard displays `0`. |
| QA-COUNT-02 | A published intervention has no follow-up. | It counts as one active intervention case. |
| QA-COUNT-03 | A follow-up is recorded. | The case leaves the active count but remains available in history/results. |
| QA-RISK-01 | The same student-class evidence is opened by Faculty and Dean. | Composite score, tier, and all factor contributions match. |
| QA-RISK-02 | GWA is acceptable but the class has four absences. | Attendance risk is reflected in both portals. |
| QA-RISK-03 | A configured activity has a recorded numeric zero. | The zero-score factor is present; an ungraded/null activity is not counted as zero. |
| QA-RISK-04 | Midterm performance declines from Prelim. | The trajectory contribution is present and uses percentage-point change. |
| QA-RISK-05 | One student has risks in multiple subjects. | Dashboard uses the highest active course risk while the detailed view preserves separate subject rows. |
| QA-FACULTY-01 | Faculty outcome report is opened or exported. | No ranking, winner, leads, award, or effectiveness wording appears. |
| QA-FACULTY-02 | Some enrolled students have no applicable posted result. | Pass rate uses graded records; enrolled, graded, and pending totals are disclosed separately. |
| QA-OUTCOME-01 | Improved, unchanged, worsened, active, due, and escalated cases exist. | KPI, chart, table, PDF, and Excel count every status consistently. |
| QA-OUTCOME-02 | A follow-up GWA is more favorable than baseline. | Report describes the recorded change and does not state or imply that ASPIRE caused it. |

## Verification commands

Run the following after implementation:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run verify:grading
npm.cmd run verify:csv
npm.cmd run verify:insights
node scripts/verifyEvaluationTracking.js
node scripts/verifyEvaluationReferrals.js
```

The post-implementation automated run on 2026-10-25 passed the production build, ESLint with zero errors, grading, CSV export, insight freshness, and evaluation-tracking checks. The referral verifier remains unavailable because its isolated local PGlite fixture dependency is missing. Manual acceptance QA and remote migration application remain pending.

The 2026-10-25 audit baseline was:

- `verify:grading`: passed, but it did not test the faculty-discretion requirement for official FDA posting.
- `verify:insights`: passed.
- `verifyEvaluationTracking.js`: passed.
- ESLint: zero errors and 60 existing warnings.
- `verifyEvaluationReferrals.js`: could not start because its local PGlite dependency was missing.

The missing referral-verifier dependency must be restored before that script can be used as release evidence. Dependency changes require separate review and authorization.

## Data and rollout effects

| Effect area | Expected impact | Control |
| --- | --- | --- |
| Existing classroom codes | No change under the recommended wording-only format correction. | Do not regenerate active codes. |
| Existing join requests | No change. | Preserve pending, approved, rejected, and dismissed records. |
| Existing official FDA grades | No automatic correction. | Review individually through authorized grade-correction processes if required. |
| New FDA postings | Change from automatic derivation to explicit faculty decision. | Server validation, threshold evidence, reason requirement, and audit record. |
| Dean at-risk counts | Counts may change when all four factors and class-level evidence are included. | Compare fixtures against the Faculty roster and disclose the aggregation rule. |
| Faculty pass rates | Percentages may change because only applicable graded records form the denominator. | Display enrolled, graded, and pending counts beside the rate. |
| Intervention charts | Previously omitted statuses will become visible. | Use one shared taxonomy and regression-test all categories. |
| Paper screenshots | Some embedded UI images may become outdated. | Recapture affected screens after acceptance QA. |

## Non-goals

- No predictive analytics or machine-learning risk prediction.
- No automatic academic decision by AI.
- No automatic rewriting of historical official grades.
- No ranking or effectiveness scoring of faculty.
- No claim that recorded follow-up changes were caused by ASPIRE.
- No remote migration, deployment, production-data repair, commit, or push as part of this planning document.

## Definition of done

This plan is complete only when:

1. the authoritative FDA workflow preserves faculty discretion;
2. all Dean risk consumers use the documented four-factor evidence or are explicitly labeled as a different descriptive measure;
3. true-zero counts and current intervention statuses are accurate;
4. faculty reports are neutral and mathematically transparent;
5. intervention language remains descriptive and non-causal;
6. classroom-join wording consistently describes faculty approval;
7. screen, PDF, and Excel outputs agree;
8. automated checks and the manual acceptance cases pass; and
9. affected Chapter 2 screenshots are refreshed after the system changes are verified.
