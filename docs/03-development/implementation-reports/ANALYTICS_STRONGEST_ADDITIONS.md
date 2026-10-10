# ASPIRE — Strongest Analytics Additions

**Date:** 2026-10-08  
**Status:** Implemented in code on 2026-10-08 — pending live-data UI verification  
**Source plan:** `ANALYTICS_UPGRADE_PLAN.md`  
**Scope:** Focused analytics refinement; no grading-engine changes, predictive modeling, schema-breaking changes, or RLS work

---

## 1. Recommendation

ASPIRE's current analytics are already sufficient for its core capstone purpose. The system provides grade and GWA summaries, explainable four-factor risk scoring, attendance indicators, grade distributions, cohort comparison, intervention tracking, and student guidance.

The additions below are recommended because they provide the largest improvement in clarity, actionability, and defense alignment without changing the academic rules or turning the project into a predictive analytics platform.

### Recommended implementation package

| Order | ID | Addition | Portal | Target location/module | Target files | Value | Estimated effort |
|---|---|---|---|---|---|---|---|
| 1 | CP-1 | Configured component class averages | Faculty | Reports → Class Performance → **Class Analytics panel** | `src/components/faculty/ClassAnalyticsPanel.jsx`; `src/pages/faculty/ClassPerformance.jsx`; `src/lib/reportsService.js` | High | Medium |
| 2 | CP-2 | Within-semester term progression | Faculty | Reports → Class Performance → **Class Analytics panel** | `src/components/faculty/ClassAnalyticsPanel.jsx`; `src/pages/faculty/ClassPerformance.jsx`; `src/lib/reportsService.js`; reuse roster output from `src/lib/classRoomService.js` | High | Medium |
| 3 | CP-3 | Class attendance summary | Faculty | Reports → Class Performance → **Summary KPI area**, below the existing performance cards | `src/pages/faculty/ClassPerformance.jsx`; `src/lib/reportsService.js` | High | Low |
| 4 | ST-3 | Activity weakness grouping | Student | Academic Support → Academic Insights → **Course-by-course released evidence section** | `src/pages/student/AcademicInsights.jsx` | High | Low |
| 5 | ST-6 | Honor-eligibility blockers | Student | Academic Support → Academic Insights → **Academic standing / honors eligibility area** | `src/pages/student/AcademicInsights.jsx`; reuse `getHonorTier()` from `src/lib/academicPolicy.js` | High | Low |
| 6 | PC-4 | Performance Comparison and Trend Range Excel exports | Faculty | Reports → Performance Comparison → **A/B comparison and Range-mode export actions** | `src/pages/faculty/PerformanceComparison.jsx`; `src/lib/reportsService.js` | Medium/High | Low |
| 7 | AQ-1 | Evidence coverage and insufficient-evidence states | Shared | **Shared analytics result layer** and the metric cards/charts in Class Performance and Performance Comparison | `src/lib/reportsService.js`; `src/lib/classRoomService.js`; consuming Faculty analytics components | Critical quality safeguard | Medium |

`AQ-1` is introduced by this focused brief as a shared analytics-quality requirement rather than a separate dashboard feature.

---

## 2. Why These Additions Are Strongest

These items were selected because they:

- Use data the system already records.
- Do not require machine learning or an unvalidated projection formula.
- Do not change DYCI grading rules, risk weights, or honors policy.
- Produce information that faculty and students can act on immediately.
- Close gaps between the current implementation and statements already present in Chapters 1–2.
- Can show honest pending or insufficient-evidence states when data is incomplete.
- Avoid reliance on multiple years of historical data.

They were prioritized above cosmetic additions such as additional donut charts, APK charts, or duplicate histogram styles.

---

## 3. Detailed Additions

### CP-1 — Configured Component Class Averages

**Objective:** Show which configured grading components are strongest or weakest across a selected class.

Examples may include quizzes, activities, examinations, laboratory work, projects, or another component defined by the subject's assigned COG template.

#### Requirements

- Resolve component identities from the class grading-formula snapshot or assigned computation template.
- Group scored activities by their actual `component_id`.
- Calculate the class average for each configured component from recorded scores.
- Display graded count, expected count, and coverage percentage for every component.
- Exclude NULL/ungraded scores from the numerical average without treating them as zero.
- Clearly label components with insufficient evidence.
- Do not hardcode quiz/activity/exam as universal categories.

#### Suggested locations

- `src/lib/reportsService.js`
- `src/components/faculty/ClassAnalyticsPanel.jsx`
- `src/pages/faculty/ClassPerformance.jsx`

#### Acceptance criteria

- Component labels match the selected class's configuration.
- A component with no recorded scores displays as unavailable rather than 0%.
- A partially graded component displays its coverage.
- Results match a manual calculation from the same recorded scores.

---

### CP-2 — Within-Semester Term Progression

**Objective:** Show how the selected class's raw term-rating average changes during the active semester.

#### Requirements

- Regular terms: Prelim → Midterm → Semi-Final → Final.
- Summer terms: Midterm → Final.
- Use the shared grading engine's calculated raw term ratings.
- Do not mix raw term ratings with cumulative MR, TFR, or SG values on the same unlabeled series.
- Missing terms remain unavailable and must not be plotted as zero.
- Each point displays graded count and coverage.
- Do not connect missing terms in a way that suggests continuous evidence.

#### Suggested locations

- `src/lib/reportsService.js`
- Existing roster output from `src/lib/classRoomService.js`
- `src/components/faculty/ClassAnalyticsPanel.jsx`

#### Acceptance criteria

- Regular and Summer class paths render correctly.
- Every displayed term average can be reproduced from the shared grading results.
- Incomplete terms are visibly tentative or insufficient.
- The chart is labeled as observed term progression, not prediction.

---

### CP-3 — Class Attendance Summary

**Objective:** Give faculty an immediate class-level view of recorded absences and students approaching the FDA recommendation threshold.

#### Required indicators

- Total recorded absences for the selected class record.
- Number of students with exactly three absences: **Near FDA**.
- Number of students with four or more absences: **FDA recommendation threshold reached**.

#### Policy safeguards

- Count absences per class record; never combine absences across different subjects.
- Four absences produce a recommendation for faculty review, not an automatic final FDA outcome.
- Reuse attendance thresholds from `academicPolicy.js`.

#### Suggested locations

- `src/lib/reportsService.js`
- `src/pages/faculty/ClassPerformance.jsx`

#### Acceptance criteria

- Counts match the selected class's attendance records.
- Three and four-plus absence groups are mutually clear.
- UI wording does not claim that FDA was automatically applied.

---

### ST-3 — Activity Weakness Grouping

**Objective:** Convert the student's existing released-activity evidence into a concise list of areas requiring attention.

The current Academic Insights page already displays released activities, scores, percentages, and below-75% emphasis. This addition organizes that evidence rather than introducing a new calculation.

#### Requirements

- Include only faculty-released activities.
- Group activities below 75% by subject and term.
- Display activity title, score, maximum score, percentage, and available topic/description.
- Distinguish low scores from ungraded activities.
- Do not describe a zero as a confirmed missing submission unless the stored evidence explicitly establishes that fact.
- Provide an empty state when no released weak activities exist.

#### Suggested location

- `src/pages/student/AcademicInsights.jsx`

#### Acceptance criteria

- No unreleased activity is exposed.
- An ungraded activity is not classified as below 75%.
- Every weakness entry is traceable to a displayed released score.

---

### ST-6 — Honor-Eligibility Blockers

**Objective:** Explain why a student currently qualifies or does not qualify for President's Lister consideration.

#### Requirements

- Reuse `getHonorTier()` from `academicPolicy.js`.
- Evaluate and display:
  - GWA ceiling of 1.75.
  - Individual subject-grade floor of 2.00.
  - Incomplete-grade status.
  - Minimum load of 18 units.
- Show the distance from the GWA ceiling where applicable.
- State whether the evidence is tentative or based on final official grades.
- Do not present GWA distance alone as proof of eligibility.

#### Suggested location

- `src/pages/student/AcademicInsights.jsx`

#### Acceptance criteria

- Displayed blockers match `getHonorTier()` output.
- Multiple simultaneous blockers can be shown.
- Tentative eligibility is not labeled final.

---

### PC-4 — Performance Comparison and Trend Range Excel Exports

**Objective:** Export the evidence already displayed by Faculty Performance Comparison.

Both direct A/B comparison mode and multi-term Range mode must provide an export action.

#### Workbook contents

- Target and reference class identity.
- Academic term and section.
- Class size and graded count.
- Coverage percentage.
- Passing rate.
- At-risk rate.
- Class average.
- Any component or distribution comparison implemented with this package.
- A clear unavailable value for missing evidence rather than a substituted zero.

Range-mode workbooks additionally contain one row per selected academic term with class size, graded count, coverage, passing rate, at-risk rate, and class average.

#### Suggested locations

- `src/lib/reportsService.js`
- `src/pages/faculty/PerformanceComparison.jsx`

#### Acceptance criteria

- Export values match the visible comparison.
- The Range export contains exactly the terms selected by the Range start/end controls.
- Export uses the project's existing Excel library and audit-log convention.
- Missing data is exported as unavailable, not 0.

---

### AQ-1 — Coverage and Insufficient-Evidence States

**Objective:** Prevent incomplete grading data from producing misleading analytics.

#### Required metadata

Every applicable aggregate should carry:

- Cohort/enrolled count.
- Graded count.
- Coverage percentage.
- Term or milestone represented.
- Official or tentative state.

#### Display rules

- NULL/ungraded values are excluded from averages and counted as ungraded.
- Zero is treated as a valid recorded score.
- No evidence displays as unavailable, not 0%.
- Low coverage displays an explicit warning or insufficient-evidence state.
- The minimum acceptable coverage threshold must be defined before implementation and applied consistently.

#### Applies to

- CP-1 configured component averages.
- CP-2 term progression.
- Existing Faculty Performance Comparison metrics.
- Any later Dean or Student cohort comparison.

---

## 4. Features Not Included in This Package

| Feature | Disposition | Reason |
|---|---|---|
| ST-1 Projected Semestral Grade | Hold | No approved projection method or student-facing policy. |
| DN-1 Projected at-risk count | Hold | Metric and forecast method remain undefined. |
| ST-4 Student class-average comparison | Hold | Deferred until aggregate access and RLS hardening are implemented. |
| DN-3 Semester comparison | Later phase | Requires verified comparable historical coverage. |
| DN-5 Honors trend | Later phase | Requires complete historical eligibility evidence. |
| PC-1 Persistent low-pass-rate signal | Later phase | Requires three actual consecutive comparable semesters. |
| AD-1 User growth by term | Redefine later | Academic terms currently lack effective start/end boundaries. |
| AD-3 Role donut | Optional polish | Does not materially strengthen academic analytics. |
| AD-4 APK download trend | Optional polish | Operational visualization, not academic analytics. |
| AD-5 Posting forecast | Future work | Requires sufficient historical data and validation. |

---

## 5. RLS and Database-Access Decision

RLS hardening is explicitly outside this analytics package and will be handled later using:

`docs/01-system/security-privacy/ROLE_CONNECTION_AND_RLS_HARDENING_GUIDE.md`

During planning and eventual implementation:

- Do not change RLS policies, grants, or database roles as part of these analytics tasks.
- Do not describe current permissive database access as the final security model.
- Keep student cohort comparison ST-4 on hold until secure aggregate access is available.
- Structure new database access so it can later be moved behind an authorized RPC/view without rewriting analytics calculations or UI semantics.

---

## 6. Chapters 1–2 Alignment

This package does not change the paper's research problem, objectives, theoretical framework, grading methodology, risk model, hypotheses, or delimitations.

### 6.1 Paper sections that do not require revision

The following parts may remain unchanged because this package only refines how existing academic evidence is summarized and displayed:

- Project rationale and general problem.
- General and specific research objectives.
- Theoretical and conceptual frameworks.
- Dynamic COG grading formulas and transmutation rules.
- Four-factor Academic Risk Score and risk-tier definitions.
- Human-in-the-Loop governance and non-binding AI-advising position.
- Research hypotheses and statistical treatment.
- The position that the study verifies calculations and recorded outcomes rather than proving causal academic improvement.
- The four-role scope and the exclusion of a separate guardian portal.

### 6.2 Existing paper claims that must be reconciled

The current Chapters 1–2 manuscript already describes some planned analytics as implemented. These passages must match the final code before submission.

| Paper location | Current claim | Required action |
|---|---|---|
| Chapter 1 → Scope → Faculty Portal → Reports → Class Performance | Class Performance summarizes score distribution, component averages, and grading-period trends. | Implement CP-1 and CP-2, or remove “component averages” and “grading-period trends” until implemented. |
| Chapter 1 → Scope → Faculty Portal → Reports → Performance Comparison | Performance Comparison is exportable to Excel. | Implement PC-4, or remove “exportable to Excel” until implemented. |
| Chapter 1 → Scope → Student Portal → Dashboard | Dashboard shows a live Risk Indicator Badge. | Confirm that the displayed badge comes from the complete shared four-factor risk result. If it is only an insight verdict or grade-standing label, rename the paper claim accordingly. |
| Chapter 2 → System Testing | Integration testing verified RLS enforcement per role. | Do not claim full per-role RLS verification while hardening is deferred. Replace this with a limited statement identifying only the tables/workflows actually verified, or mark full verification as pending the RLS hardening guide. |
| Chapter 2 → ISO/IEC Performance Efficiency description | Refers to Supabase real-time synchronization performance. | Replace with “database-backed synchronization and data-retrieval performance” unless the evaluated workflow actually uses and tests Supabase Realtime subscriptions. |

These corrections are required for implementation accuracy even if the focused analytics package is not implemented.

### 6.3 Paper edits after this package is implemented

This package helps align implementation with two existing Scope statements:

- Faculty Class Performance is described as providing component averages and grading-period trends.
- Faculty Performance Comparison is described as exportable to Excel.

After implementation, perform the following limited documentation synchronization:

1. **Chapter 1 → Scope → Student Academic Support**
   - Add that Academic Insights groups faculty-released activities below the passing threshold as evidence-based areas for attention.
   - Add that honors monitoring explains current blockers for GWA, individual-subject floor, INC status, and minimum units.
   - State that eligibility may be tentative until final official grades are available.

2. **Chapter 1 → Scope → Faculty Reports**
   - Retain the component-average claim only after CP-1 is verified.
   - Clarify that component averages follow the subject's configured COG components rather than fixed universal categories.
   - Clarify that grading-period progression represents observed raw term ratings and is not a forecast.
   - Retain the Performance Comparison Excel-export claim only after PC-4 is verified.

3. **Chapter 1 → Scope → Faculty Attendance**
   - Add the class summary for total absences, students with three absences, and students reaching four or more absences.
   - Use “FDA recommendation threshold reached”; do not state that FDA is automatically imposed.

4. **Chapter 2 → User Interface Design**
   - Update the Faculty Class Performance and Student Academic Insights screenshots or composite figure if these panels are visible in the evaluated build.
   - Update figure captions to distinguish observed analytics from predictive analytics.

5. **Chapter 2 → System Testing**
   - Add controlled verification cases for configured component averages.
   - Add regular four-term and Summer two-term progression cases.
   - Verify NULL versus numeric-zero handling.
   - Verify attendance counts per class record and threshold labels.
   - Verify that only released activities enter the student weakness grouping.
   - Verify all honor-eligibility blockers against `getHonorTier()`.
   - Verify displayed and exported comparison values are identical.
   - Verify coverage and insufficient-evidence behavior.

6. **Chapter 2 → Evaluation Instruments and Data Gathering**
   - Update questionnaire statements only if respondents will directly inspect these new panels.
   - Add the analytics to the orientation/demo procedure only when they are included in the final evaluated build.
   - Do not evaluate deferred features as though they were implemented.

### 6.4 Suggested replacement wording

The following wording can be used after implementation and verification.

#### Faculty Class Performance scope

> **Class Performance** — Summarizes score distribution, class attendance, configured grading-component averages, and observed raw-term progression. Each aggregate reports available evidence coverage, and missing grades are shown as unavailable rather than treated as zero. Reports are exportable to Excel.

#### Faculty Performance Comparison scope

> **Performance Comparison** — Compares observed passing rate, at-risk rate, class average, and available distribution or compatible configured-component evidence between selected class records. Comparisons display class size and grading coverage and can be exported to Excel. They describe observed cohort differences and do not establish teaching effectiveness or subject difficulty.

#### Student Academic Insights scope

> **Academic Insights / Ask ASPIRE** — Provides non-binding study guidance grounded in faculty-released academic evidence, groups released activities below the passing threshold as areas for attention, and explains current honors-eligibility blockers. Tentative evidence is distinguished from final official grades.

#### Faculty Attendance scope

> **Attendance Monitoring** — Shows attendance records and class-level counts of students approaching or reaching the four-absence FDA recommendation threshold. Reaching the threshold prompts faculty review and does not automatically assign the final FDA remark.

#### System testing and RLS wording while hardening is deferred

> Role-based route behavior and the currently protected sensitive workflows were reviewed using the applicable access controls. Full database-wide RLS hardening and per-role policy verification remain scheduled under the separate Role Connection and RLS Hardening Guide.

#### Synchronization wording

> Performance testing covers database-backed retrieval, persistence, and refresh behavior under the evaluated workflows. Supabase Realtime performance is claimed only for workflows that explicitly use and test subscription-based updates.

### 6.5 Claims that must not be introduced

Do not add any statement that the focused package provides:

- Future-grade prediction or confidence intervals.
- Projected at-risk counts.
- Validated predictive accuracy.
- Causal proof of faculty effectiveness, subject difficulty, retention improvement, or intervention success.
- Automatic FDA assignment.
- Final honors eligibility from tentative grades.
- Real-time subscription behavior where the page only fetches or refreshes a snapshot.
- Complete database-wide RLS enforcement before the hardening guide is applied and verified.

Do not add predictive, causal, or real-time claims.

---

## 7. Verification Checklist

Checked items below are verified from the current implementation and automated project validation. Unchecked items still require institutional input or live-data/manual verification before the package is called fully verified.

- [x] Shared grading and policy helpers remain the calculation sources of truth.
- [x] No DYCI formula, risk weight, or policy threshold was changed.
- [x] Dynamic component definitions are respected.
- [x] Regular and Summer term paths are implemented.
- [x] NULL and numeric zero remain semantically distinct.
- [x] Applicable aggregates include evidence counts and coverage percentages.
- [ ] Low/no coverage produces an honest unavailable or insufficient-evidence state. **No-evidence handling is complete; an institution-approved threshold for low but nonzero coverage is still pending.**
- [x] Attendance is evaluated per class record.
- [x] FDA wording describes a faculty recommendation threshold.
- [x] Only released and numerically scored student activities appear in weakness grouping.
- [x] Honor blockers use all handbook requirements through `getHonorTier()`.
- [ ] Excel values match visible values. **Both exports use the same metric objects as the UI, but the generated workbooks still require manual live-data comparison.**
- [x] New UI uses semantic design tokens and Lucide icons.
- [x] `npm run lint` passes with zero errors; existing repository warnings remain.
- [x] `npm run build` passes.
- [ ] Relevant manual calculation fixtures match system output. **Manual fixtures and live Supabase records have not yet been signed off.**

**Checklist status:** 13 of 16 items complete. The remaining items are verification or policy-decision tasks, not missing analytics screens.

---

## 8. Completion Boundary

This focused package is complete when the seven recommended additions pass the verification checklist. Deferred predictive, historical, administrative-polish, and RLS items are not required for completion and must not delay the capstone-ready analytics refinement.

### Implementation record — 2026-10-08

- CP-1 configured component class averages implemented in Faculty Class Analytics.
- CP-2 regular/Summer raw-term progression implemented in Faculty Class Analytics.
- CP-3 class-record attendance summary implemented in Faculty Class Performance.
- ST-3 released activity weakness grouping implemented in Student Academic Insights.
- ST-6 honor-eligibility blockers implemented using `getHonorTier()`.
- PC-4 coverage-aware A/B comparison and multi-term Trend Range Excel exports implemented in Faculty Performance Comparison.
- AQ-1 coverage and unavailable-evidence metadata implemented in shared faculty analytics results and comparison UI/export.
- Faculty Performance Comparison layout refined so controls, compact evidence metadata, interpretation, and the primary chart appear before supporting KPI cards and explanatory notes.
- Faculty Class Performance layout refined so report navigation and the active table/chart appear before compact performance and attendance summaries; the education note now follows the report content.
- `npm.cmd run lint` completed with zero errors; existing repository warnings remain.
- `npm.cmd run build` completed successfully.
- Live Supabase data, generated workbook values, responsive UI, and manual calculation fixtures still require verification by an authorized user in each affected portal.
- An institution-approved threshold for low but nonzero evidence coverage remains undecided; zero-evidence results already display as unavailable.
