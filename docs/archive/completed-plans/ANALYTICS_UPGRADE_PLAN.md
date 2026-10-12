# ASPIRE Analytics Upgrade Plan

**Date:** 2026-10-05 (revised 2026-10-08 against current `ghost` implementation)
**Branch:** `ghost`
**Author:** ghostbyte1014
**Scope:** Analytics layer only — no grading engine changes, no schema breaking changes, no ML.

> **Revision note (2026-10-08):** This plan was re-audited against the current `ghost` implementation after the October 7 dynamic-grade-sheet, intervention, and audit-log changes. The runtime portals are now Supabase-backed; `src/lib/mockDb.js` is no longer present. DN-4 is already complete, ST-3 is substantially present, CP-4 already exists, and CP-5 is mostly present. Historical, cross-cohort, and student comparison items now carry explicit data-coverage and authorization gates. ST-1 and DN-1 remain on **Hold**. The Office portal remains explicitly outside this plan.

### 1.1 Current implementation baseline (2026-10-08)

- Student, Faculty, Dean, and Admin pages covered by this plan query Supabase directly.
- Analytics must reuse the shared grading, policy, milestone, and risk helpers rather than recreate their calculations in page components.
- Aggregate results must report cohort size, graded count, coverage, milestone, and official/tentative status where applicable.
- Student-facing cohort comparisons require an authorized aggregate-only RPC or view. The browser must not fetch classmates' individual scores to calculate an average.
- Archived class records make historical analytics structurally possible, but the presence of enough complete and comparable semesters must be verified before enabling history-dependent signals.
- Regular terms use four raw terms; Summer uses a two-term path. All progression features must support both.

---

## 1. Analytics Type Definitions

| Type | Question It Answers | Example in ASPIRE |
|---|---|---|
| **Descriptive** | What happened? | GWA is 2.75 |
| **Diagnostic** | Why did it happen? | Risk score 78 — 4 absences + 3.4 GWA |
| **Comparative** | How does this compare to another period or group? | This semester's passing rate vs. last semester |
| **Predictive** | What will likely happen? | Projected Semestral Grade: 3.00–3.25 |
| **Prescriptive** | What should we do? | "Review Chapter 3 before the next quiz" |
| **Real-time monitoring** | What is happening now? | Live risk tier badge in ScoreInput.jsx |

---

## 2. Why Rule-Based, Not Machine Learning

**Cold-start problem:** A first-year student in Prelim has zero personal history. A per-student ML model has nothing to learn from until at least two terms of data exist. Rule-based works on day one.

**Labeled outcome data does not exist:** Supervised ML for academic risk requires records tagged with outcomes — did the student fail, shift, or recover? That longitudinal labeled dataset does not exist in ASPIRE at launch.

**Policy thresholds are already known:** The passing cut-off is 3.00. The FDA threshold is 4 absences. The scholarship floor is 2.00. These are not patterns to discover — they are written DYCI policy. ML would spend compute to approximate rules the institution already specifies exactly.

**Explainability is a hard requirement:** Any academic risk decision can be challenged by a student. Rule-based produces a full `factors` breakdown (GWA points, attendance points, trajectory points). A neural net cannot produce this.

**Defense one-liner (revised per audit F12 — removed unsupported absolutes about universal training minimums and neural-net explainability):**
> *"ASPIRE currently presents descriptive summaries, cohort comparisons, explainable risk indicators, and prescriptive study guidance. Its risk engine evaluates observed grades, attendance, missing work, and term-to-term decline against explicit rules. Decline detection is an early-warning indicator; it is not a validated future-grade forecast. Proposed projection features will remain clearly separated from official grades and will require a defined method, permitted evidence, and evaluation. Rule-based policy evaluation was selected for transparency and consistency with institutional requirements. Machine learning is outside the current implementation scope."*

---

## 3. Current Analytics Inventory

What the system already has and how each piece is classified, before any changes.

| Layer | Analytics Type | Location | Status |
|---|---|---|---|
| Grade transmutation | Descriptive | `gradingMath.js`, `academicPolicy.js` | Complete |
| Risk scoring (GWA + attendance + missing work) | Diagnostic | `riskEngine.js` | Complete |
| Trajectory delta (term-over-term decline) | **Diagnostic / early-warning trend** (revised per audit F1 — compares two observed ratings, does not estimate a future grade, horizon, or probability) | `riskEngine.js:134–156` | Complete — explainable trend indicator, not a forecast |
| Dean multi-term trajectory line chart | Real-time monitoring | `dean/Dashboard.jsx` | Complete |
| Academic health donut (Honors / Good / Warning / Critical) | Descriptive | `dean/Dashboard.jsx` | Complete |
| Dean section performance bar chart | Diagnostic | `dean/Dashboard.jsx` | Complete |
| Faculty cohort comparison (passing rate, at-risk rate delta) | Comparative / Diagnostic | `reportsService.js` | Complete |
| Student running GWA + standing label | Descriptive | `student/AcademicInsights.jsx` | Complete |
| Student academic verdict (continue / at_risk / shift) | Diagnostic | `student/AcademicInsights.jsx` | Complete |
| Student what-if GWA simulator | Prescriptive | `student/AcademicInsights.jsx` | Complete |
| Ask ASPIRE AI advisory panel | Prescriptive | `student/AcademicInsights.jsx` | Complete |
| Admin user / section / subject counts | Descriptive (Operational) | `admin/Dashboard.jsx` | Complete |

**Gap:** The system is strong at diagnosing the present and detecting decline. What is missing is forward-looking projection — where is the student, the cohort, or the subject heading?

---

## 4. What NOT to Implement

| Feature | Reason to Exclude |
|---|---|
| ML-based grade prediction | Cold-start problem; no labeled outcome data; policy thresholds are already known rules |
| Faculty fitness prediction from evaluation trends | `evaluation_forms/windows/criteria` tables are dormant — delimited out of scope in ¶P163 |
| Per-student dropout probability model | Requires multi-year longitudinal data beyond one semester |
| Admin enrollment volume forecast | Requires 2+ years of registration history that does not exist at launch |

---

## 5. Student Portal — Analytics Improvement Plan

### 5.1 Current State

| Feature | Page | Analytics Type | Status |
|---|---|---|---|
| Current GWA + standing label | `Dashboard.jsx` | Descriptive | Complete |
| Enrolled subjects list | `Dashboard.jsx` | Descriptive | Complete |
| Pending advising tasks count | `Dashboard.jsx` | Descriptive | Complete |
| AI insight verdict (continue / at_risk / recommend_shift) | `Dashboard.jsx` + `AcademicInsights.jsx` | Diagnostic | Complete |
| Per-term grade breakdown (Prelim, MR, TFR, SG) | `AcademicInsights.jsx` | Descriptive | Complete |
| What-if GWA simulator | `AcademicInsights.jsx` | Prescriptive | Complete |
| Ask ASPIRE AI panel | `AcademicInsights.jsx` | Prescriptive | Complete |
| Honor eligibility check | `AcademicInsights.jsx` | Diagnostic | Complete |
| Attendance tracking per subject | `AcademicInsights.jsx` | Descriptive | Complete |
| Academic verdict + dynamic insight text | `AcademicInsights.jsx` | Diagnostic + Prescriptive | Complete |

**Gap:** The student sees their grade and verdict but cannot see how they compare to classmates, which activities are pulling their grade down, or where their grade is likely to land before the Final term.

### 5.2 Planned Improvements

| ID | Improvement | What It Adds | Target File | Analytics Type | Priority |
|---|---|---|---|---|---|
| ST-1 | **Projected Semestral Grade range** — **HOLD (audit F2, F3)** | Conflicts with the current student-facing policy: the what-if simulator is intentionally hidden (`aria-hidden="true"`, [AcademicInsights.jsx:1513](../../src/pages/student/AcademicInsights.jsx#L1513)), and no projection method is defined. Before implementing: get policy sign-off on what students may see, then define the method — project raw term ratings through the shared `gradingMath.js` helper (preserving nested rounding), transmute only afterward, and label any range as a scenario bound, not a confidence interval. | `riskEngine.js` + `AcademicInsights.jsx` | Predictive (pending method definition) | Hold |
| ST-2 | **Per-subject risk badge on Dashboard** (revised per audit F9) | Each enrolled subject gets a standing badge. Must use the shared risk model's full four tiers (Low / Moderate / High / **Critical**) through a student-scoped risk result, or be explicitly labeled a grade-standing indicator if derived from grade alone. Show evidence coverage, tentative/official state, and "insufficient evidence" when incomplete. | `student/Dashboard.jsx` + shared risk service | Diagnostic | High |
| ST-3 | **Activity-level weakness breakdown — PARTIALLY COMPLETE (2026-10-08)** | `AcademicInsights.jsx` already displays faculty-released activities, raw/max score, percentage, term/topic, and below-75% emphasis. Remaining scope: add a dedicated below-75% grouping/summary by subject and term; do not expose unreleased evidence. | `AcademicInsights.jsx` | Diagnostic | Low |
| ST-4 | **Class average comparison — ACCESS GATE** | Shows how the student's standing compares to an approved class aggregate. Implement only through an authorized aggregate-only RPC/view returning the aggregate, cohort size, graded count, coverage, milestone, and official/tentative state. The student client must not fetch classmates' individual score rows. | database RPC/view + `AcademicInsights.jsx` | Comparative | Hold until access contract |
| ST-5 | **Within-semester milestone trend** | A sparkline using consistently defined points. Prefer official cumulative milestones (MR → TFR → SG); if raw terms are shown, label them separately and do not mix raw term ratings with cumulative ratings on one unlabeled series. Support the Summer two-term path. | `AcademicInsights.jsx` | Historical/current-snapshot monitoring | Medium |
| ST-6 | **Honor eligibility distance indicator** (revised per audit F9) | Reuse `getHonorTier()` from `academicPolicy.js`; show GWA-ceiling distance plus remaining blockers for subject floor, INC, and unit count. State whether evidence is final. | `AcademicInsights.jsx` | Prescriptive | Low |

### 5.3 Before vs. After

| Data / Signal | Before | After |
|---|---|---|
| Current GWA + standing | ✅ | ✅ |
| Per-term grade breakdown | ✅ | ✅ |
| Academic verdict | ✅ | ✅ |
| What-if simulator | ✅ | ✅ |
| Ask ASPIRE AI | ✅ | ✅ |
| Projected Semestral Grade range | ❌ | ✅ ST-1 |
| Per-subject risk badge on Dashboard | ❌ | ✅ ST-2 |
| Released activity evidence with below-75% emphasis | ✅ | ✅ |
| Dedicated weakness grouping | ❌ | ✅ ST-3 enhancement |
| Class average comparison | ❌ | Conditional — ST-4 access gate |
| GWA trend line (semester arc) | ❌ | ✅ ST-5 |
| Honor eligibility distance | ❌ | ✅ ST-6 |

---

## 6. Dean Portal — Analytics Improvement Plan

### 6.1 Current State

| Feature | Page | Analytics Type | Status |
|---|---|---|---|
| Multi-term GWA trajectory line chart | `dean/Dashboard.jsx` | Real-time monitoring | Complete |
| Academic health donut (Honors / Good / Warning / Critical) | `dean/Dashboard.jsx` | Descriptive | Complete |
| Grade distribution histogram (6-bracket) | `dean/Dashboard.jsx` | Descriptive | Complete |
| Section performance & risk index bar chart | `dean/Dashboard.jsx` | Diagnostic | Complete |
| At-risk student triage (4 tabs: at-risk, PL-risk, discussion queue, outcomes) | `AtRiskStudents.jsx` | Diagnostic | Complete |
| Per-class grade distribution with program/year filters | `GradeDistribution.jsx` | Descriptive | Complete |
| Summary Reports (grade-distribution, at-risk audit, intervention outcomes) | `SummaryReports.jsx` | Descriptive + Diagnostic | Complete — PDF/print and Excel export |

**Gap:** The Dean sees the current state of the college but has no validated forward-looking signal, no consolidated faculty cohort-support context, and no coverage-qualified semester-over-semester college comparison.

### 6.2 Planned Improvements

| ID | Improvement | What It Adds | Target File | Analytics Type | Priority |
|---|---|---|---|---|---|
| DN-1 | **Projected at-risk count dotted line** — **HOLD (audit F4)** | The trajectory chart currently counts `GWA > 3.00` (failing grade), which differs from the Dean triage's composite risk model (grade + attendance + missing work). Extrapolating the simpler metric and labeling it a risk projection is inconsistent. Before implementing: either label the chart's projected metric as a "failing-grade count" (not risk), or compute milestone composite risk consistently; define a stable comparable cohort, preserve actual milestone spacing when data is missing, show coverage, and bound the projected count between 0 and cohort size. | `DeanCharts.jsx` + `dean/Dashboard.jsx` | Predictive (pending metric definition) | Hold |
| DN-2 | **Faculty cohort support overview** (renamed per audit F5, was "Faculty accountability view") | A table showing each faculty member's cohort context — class size, graded coverage, at-risk rate, class average — across their sections. Presents support context, not an effectiveness ranking. Must show class size, coverage, milestone, semester, and official/tentative state. Prefer a shared/server-side aggregate instead of extending the Dean dashboard's existing client-side query fan-out. | shared aggregate service/RPC + `dean/Dashboard.jsx` or new `dean/FacultyOverview.jsx` | Diagnostic | High |
| DN-3 | **Semester-over-semester college comparison — DATA GATE** | Compare the current semester with the previous completed comparable semester. Current Dean Dashboard queries active classrooms only, so historical class records must be queried deliberately. Define stable cohort, coverage, and official-grade rules before enabling the delta. | shared aggregate service + `dean/Dashboard.jsx` | Comparative | Hold until history verified |
| DN-4 | **Excel export for Summary Reports — COMPLETE (2026-10-08)** | `SummaryReports.jsx` already exports all report types through `xlsx-js-style` and records an export audit event. No implementation work remains unless the workbook format itself is expanded. | `SummaryReports.jsx` | Descriptive | Complete |
| DN-5 | **Honors trend tracker — DATA GATE** | Historical fully eligible count by semester. Reuse `getHonorTier()` and distinguish grade-ceiling candidates from full eligibility. Enable only after historical subject grades, INC state, units, and final-grade coverage are verified for every compared semester. | shared aggregate service + `dean/Dashboard.jsx` | Comparative (historical trend) | Hold until history verified |
| DN-6 | **Subjects flagged for review** (renamed per audit F5, was "Subject difficulty leaderboard") | A ranked list of subjects with elevated at-risk rates for the current semester, flagged for curriculum review. Does not claim the subjects are inherently difficult — pass-rate alone does not establish cause. | `dean/Dashboard.jsx` or `SummaryReports.jsx` | Diagnostic | Low |

### 6.3 Before vs. After

| Data / Signal | Before | After |
|---|---|---|
| Multi-term GWA trajectory | ✅ | ✅ |
| Academic health distribution | ✅ | ✅ |
| At-risk triage (4 tabs) | ✅ | ✅ |
| Grade distribution per class | ✅ | ✅ |
| PDF and Excel summary reports | ✅ | ✅ |
| Projected at-risk count (Final term) | ❌ | Hold — DN-1 |
| Faculty cohort support overview | ❌ | ✅ DN-2 |
| Semester-over-semester college delta | ❌ | Conditional — DN-3 data gate |
| Excel export for summary reports | ✅ | ✅ DN-4 complete |
| Honors trend tracker | ❌ | Conditional — DN-5 data gate |
| Subjects flagged for review | ❌ | ✅ DN-6 |

---

## 7. Faculty Portal — Analytics Improvement Plan

### 7.1 Current State

| Feature | Page | Analytics Type | Status |
|---|---|---|---|
| Per-student GWA (official/tentative), absence count, risk level | `ClassPerformance.jsx` | Descriptive + Diagnostic | Complete |
| Activity scores per student with performance status | `ClassPerformance.jsx` | Descriptive | Complete |
| Summary cards (total, at-risk count, well/avg/struggling) | `ClassPerformance.jsx` | Descriptive | Complete |
| Pivot panel + Excel export | `ClassPerformance.jsx` | Descriptive | Complete |
| A vs. B class comparison (passing rate, at-risk rate, class average delta) | `PerformanceComparison.jsx` | Comparative / Diagnostic | Complete |
| Multi-semester trend line chart (range mode) | `PerformanceComparison.jsx` | Comparative | Complete |
| Plain-language trend summary | `PerformanceComparison.jsx` | Descriptive | Complete |

**Gap — Class Performance:** no component-level breakdown, no within-semester progression, no class-level attendance summary, no distribution chart on the faculty side.
**Gap — Performance Comparison:** no component-level diff, no distribution shape comparison, no subject difficulty flag, no export.

### 7.2 Class Performance — Planned Improvements

| ID | Improvement | What It Adds | Where to Implement | Priority |
|---|---|---|---|---|
| CP-1 | **Configured component class averages** | Break down the class average using the subject's configured dynamic grading components. Do not hardcode quiz/activity/exam: component identities and weights vary by grading template. Report graded count and coverage for each component. | `reportsService.js` + `ClassAnalyticsPanel.jsx` | High |
| CP-2 | **Within-semester term progression** | Chart the class average across raw terms using the existing roster `term_ratings`. Keep raw-term ratings distinct from cumulative MR/TFR/SG milestones and support the Summer two-term path. | `reportsService.js` → new `buildTermProgressionSeries()`; render in `ClassAnalyticsPanel.jsx` | High |
| CP-3 | **Attendance summary card** (label corrected per audit F9) | Class-level attendance: total absences logged, students at 3 absences (near-FDA), students at 4+ absences. Four absences trigger an **FDA recommendation for faculty choice**, not an automatic FDA outcome — label as "FDA recommendation threshold reached," not "FDA triggered." Absences must be evaluated per class record; do not sum across subjects. | `buildSummaryCards()` → add `nearFdaCount`, `recommendationThresholdCount`; surface as stat tiles in `ClassPerformance.jsx` | Medium |
| CP-4 | **Score distribution histogram — EXISTING** | `ClassAnalyticsPanel.jsx` already implements a nine-band percentage histogram. A shared GWA-band adapter is optional only if cross-portal visual consistency is required. | `ClassAnalyticsPanel.jsx`; optional adapter to `GradeDistributionHistogram` | Complete / optional |
| CP-5 | **Struggling student quick action — PARTIALLY COMPLETE** | `ClassPerformance.jsx` already filters at-risk/struggling students. Remaining scope is only a one-click action to open the Student Risk modal from that existing view. | Existing filtered view → Student Risk modal | Low |

### 7.3 Performance Comparison — Planned Improvements

| ID | Improvement | What It Adds | Where to Implement | Priority |
|---|---|---|---|---|
| PC-1 | **Persistent low-pass-rate review signal — DATA GATE** | When 3+ **actual consecutive** semesters of the same subject, aggregated across sections with a minimum coverage requirement, fall below a 70% passing rate, show a review banner. First define canonical school-year/semester ordering and verify three completed comparable semesters exist; current history ordering by school-year string alone does not prove adjacency. The threshold is a documented heuristic, not policy. | aggregate RPC/service + `PerformanceComparison.jsx` | Hold until history verified |
| PC-2 | **Grade distribution shape comparison** | Side-by-side distribution shape for two selected classes. The service already returns the aggregated student collection, so distribution counts can be derived without a schema change. Include ungraded count and coverage rather than silently excluding incomplete records. | Extend `fetchTermCohortMetrics()` output; render grouped bar chart | Medium |
| PC-3 | **Configured component-level comparison** | Compare like-for-like configured component averages between two classes. Only compare components with compatible identities/formulas; otherwise show that the grading structures are not directly comparable. Currently only the overall average is compared. | Extend `compareCohortMetrics()` to diff compatible component-level averages; add a second panel in `PerformanceComparison.jsx` | Medium |
| PC-4 | **Export to Excel** | `ClassPerformance.jsx` has Excel export. `PerformanceComparison.jsx` has none. Add export of the comparison table and trend chart data. | `reportsService.js` → new `exportComparisonToExcel()`; add Download button | Medium |
| PC-5 | **Cross-subject comparison mode** | Optional mode to compare two different subjects handled by the same faculty in the same semester. Describes observed cohort differences; it must not label one subject inherently harder without controlling for cohort, coverage, formula, and assessment differences. | New mode in `PerformanceComparison.jsx`; reuse `fetchTermCohortMetrics` | Low |

### 7.4 Before vs. After

| Data Type | Class Performance (before) | Class Performance (after) | Performance Comparison (before) | Performance Comparison (after) |
|---|---|---|---|---|
| Per-student GWA & risk | ✅ | ✅ | ✅ (aggregated) | ✅ (aggregated) |
| Activity-level scores | ✅ | ✅ | — | — |
| Component-level averages | ❌ | ✅ CP-1 | ❌ | ✅ PC-3 |
| Within-semester progression | ❌ | ✅ CP-2 | ✅ (multi-sem) | ✅ (multi-sem) |
| Attendance summary (class-level) | ❌ | ✅ CP-3 | — | — |
| Grade distribution shape | ✅ (percentage bands) | ✅ / optional shared adapter | ❌ | ✅ PC-2 |
| Struggling student quick list | ✅ (filtered view) | ✅ CP-5 modal shortcut | — | — |
| Persistent low-pass-rate review flag | — | — | ❌ | Conditional — PC-1 data gate |
| Export | ✅ (basic) | ✅ (extended) | ❌ | ✅ PC-4 |
| Cross-subject comparison | — | — | ❌ | ✅ PC-5 |

---

## 8. Admin Portal — Analytics Improvement Plan

### 8.1 Current State

| Feature | Page | Analytics Type | Status |
|---|---|---|---|
| Total user count + role breakdown | `admin/Dashboard.jsx` | Descriptive | Complete |
| Department, subject, section counts | `admin/Dashboard.jsx` | Descriptive | Complete |
| Active academic term display | `admin/Dashboard.jsx` | Descriptive | Complete |
| Recent audit log entries (last 6) | `admin/Dashboard.jsx` | Descriptive | Complete |
| APK download count (total + today) | `admin/Dashboard.jsx` | Descriptive | Complete |

**Context:** Admin manages infrastructure — users, terms, subjects, and system configuration. It does not own academic outcome data. Predictive analytics is the weakest fit here and only becomes meaningful after multi-semester history accumulates.

### 8.2 Planned Improvements

| ID | Improvement | What It Adds | Target File | Analytics Type | Priority |
|---|---|---|---|---|---|
| AD-1 | **User growth chart — METHOD GATE** | The current `academic_terms` schema has no start/end dates, so `users.created_at` cannot be reliably grouped by academic term. Either show monthly account growth, or first add an approved term-boundary source. Do not infer term membership from the term row's creation timestamp. | shared aggregate + `admin/Dashboard.jsx` | Descriptive | Hold pending definition |
| AD-2 | **Grade posting compliance rate** | Show submitted expected milestones divided by total expected milestones for the active term. Reuse a centralized version of Dean posting-status logic; do not duplicate the full query and calculation in Admin Dashboard. Define the expected milestone denominator for regular and Summer terms. | shared posting-status service/RPC + `admin/Dashboard.jsx` | Diagnostic | Medium |
| AD-3 | **Role distribution donut** | Visual donut of role breakdown (students / faculty / deans / admins) replacing the current plain number tiles. No new data — purely a visual upgrade. | `admin/Dashboard.jsx` — wrap `metrics.roleCounts` in a `PieChart` | Descriptive | Low |
| AD-4 | **APK download trend** | Group the already-fetched APK audit events by day over 7 or 30 days. Label this as download activity, not adoption: a download does not prove installation or active use. | `admin/Dashboard.jsx` | Descriptive | Low |
| AD-5 | **Grade posting compliance forecast** *(future work)* | Based on historical posting patterns across 2+ semesters, predict how many faculty are likely to miss the deadline this semester. Only meaningful after the system accumulates multi-semester data. | `admin/Dashboard.jsx` | Predictive | Future work |

### 8.3 Before vs. After

| Data / Signal | Before | After |
|---|---|---|
| User & role counts | ✅ | ✅ |
| Active term display | ✅ | ✅ |
| Recent audit log | ✅ | ✅ |
| APK download count | ✅ | ✅ |
| User growth chart | ❌ | Conditional — AD-1 method gate |
| Grade posting compliance rate | ❌ | ✅ AD-2 |
| Role distribution donut | ❌ | ✅ AD-3 |
| APK adoption trend | ❌ | ✅ AD-4 |
| Posting compliance forecast | ❌ | ✅ AD-5 (future work) |

---

## 9. Master Overview — All Portals

### 9.1 Analytics Feature Count by Portal

> **Revised per audit F6, F11:** The original counts treated CP-4, CP-5, and parts of the current-state inventory as net-new when they already exist in part (see F6). Office is an existing portal not covered by this plan at all — explicitly out of scope here, not an oversight to silently ignore (F11).

| Portal | Current Features | Planned Additions | Of Which Net-New (not enhancements) |
|---|---|---|---|
| **Student** | 10 plus released activity evidence | 6 (ST-1 to ST-6) | 3 net-new; ST-3 is an enhancement, ST-1 and ST-4 are gated |
| **Dean** | 7 plus Excel export | 6 (DN-1 to DN-6) | 3 net-new; DN-4 is complete, DN-1/DN-3/DN-5 are gated |
| **Faculty — Class Performance** | Includes histogram, status donut, activity timeline, and risk filters | 5 (CP-1 to CP-5) | 3 net-new; CP-4 exists and CP-5 is an enhancement |
| **Faculty — Performance Comparison** | 3 | 5 (PC-1 to PC-5) | 4 net-new; PC-1 is data-gated |
| **Admin** | 5 | 5 (AD-1 to AD-5) | 3 net-new now; AD-1 is method-gated and AD-5 is future work |
| **Office** | — | — | **Not addressed by this plan.** Decide explicitly whether to scope it in or state the exclusion in the defense. |

### 9.2 Analytics Type Coverage — All Portals After Upgrades

> **Revised per audit F1, F7:** "Real-time monitoring" is relabeled — no page in this plan has a `channel()`/`subscribe()` live-update mechanism; what exists is snapshot fetch-on-load plus historical trend charts. Predictive is marked "Hold" where the feature itself is on hold (ST-1, DN-1), and removed from Faculty (PC) since PC-1 is a historical review flag, not a forecast.

| Analytics Type | Student | Dean | Faculty (CP) | Faculty (PC) | Admin |
|---|---|---|---|---|---|
| Descriptive | ✅ | ✅ | ✅ | ✅ | ✅ |
| Diagnostic | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comparative | Conditional ST-4 | Conditional DN-3/DN-5 | — | ✅ (PC-1 conditional) | — |
| Predictive | Hold (ST-1) | Hold (DN-1) | — | — | Future (AD-5) |
| Prescriptive | ✅ | — | — | — | — |
| Current-snapshot / historical-trend monitoring | ✅ ST-5 | ✅ | — | — | — |

### 9.3 Current disposition by readiness (2026-10-08)

| Readiness | IDs | Meaning |
|---|---|---|
| **Complete / already present** | DN-4, CP-4 | Remove from net-new implementation scope unless enhancing format or visual consistency. |
| **Small enhancements** | ST-3, CP-5, ST-6, AD-3, AD-4 | Existing data or UI capability covers most of the work. |
| **Implementation-ready with current data** | ST-2, ST-5, DN-2, DN-6, CP-1, CP-2, CP-3, PC-2, PC-3, PC-4, PC-5, AD-2 | Proceed with coverage, tentative/official, dynamic-component, and Summer-term rules stated above. |
| **Access-gated** | ST-4 | Requires an authorized aggregate-only data contract before UI work. |
| **History/data-gated** | DN-3, DN-5, PC-1 | Requires verified completed comparable semesters and canonical semester ordering. |
| **Method/policy hold** | ST-1, DN-1, AD-1 | Projection or grouping method is not yet valid under the current evidence/schema. |
| **Future work** | AD-5 | Requires accumulated history and validation. |

---

## 10. Implementation Order for Capstone

The order below reflects the current implementation and removes DN-4, which is already complete.

| # | ID | Feature | Portal | Effort | Note |
|---|---|---|---|---|---|
| 1 | CP-3 | Attendance summary card | Faculty | Low | Existing per-class absence counts; use policy labels. |
| 2 | ST-6 | Honor eligibility distance/blockers | Student | Low | Reuse `getHonorTier()`. |
| 3 | ST-3 | Dedicated weakness grouping | Student | Low | Released evidence and threshold styling already exist. |
| 4 | CP-5 | Student Risk modal shortcut | Faculty | Low | Existing filtered list. |
| 5 | AD-3 / AD-4 | Role donut and APK download trend | Admin | Low | Existing dashboard data; label downloads accurately. |
| 6 | CP-2 | Within-semester term progression | Faculty | Low/Medium | Reuse roster `term_ratings`; support Summer. |
| 7 | ST-2 | Per-subject risk badge | Student | Medium | Use student-scoped full risk result with coverage. |
| 8 | CP-1 | Configured component averages | Faculty | Medium | Dynamic components; no hardcoded categories. |
| 9 | PC-2 / PC-3 / PC-4 | Comparison distributions, components, export | Faculty | Medium | Extend shared metrics once. |
| 10 | DN-6 | Subjects flagged for review | Dean | Medium | Coverage-aware, non-causal framing. |
| 11 | DN-2 / AD-2 | Shared Dean/Admin institutional aggregates | Dean/Admin | Medium/High | Prefer server-side/shared aggregation over duplicated page queries. |
| 12 | ST-4 | Student class comparison | Student | Medium | Only after aggregate authorization contract exists. |
| 13 | DN-3 / DN-5 / PC-1 | Historical comparisons and review signal | Dean/Faculty | Medium/High | Only after historical coverage audit. |
| — | ST-1 / DN-1 | Projection features | Student/Dean | — | **Hold** — method, policy, validation, and disclosure gates remain unmet. |
| — | AD-1 | User growth by academic term | Admin | — | **Hold/redefine** — use monthly growth or establish real term boundaries. |
| — | AD-5 | Posting compliance forecast | Admin | — | **Future work**. |

State explicitly in the defense whether Office is in scope. If not, say so rather than letting its absence look like an oversight (F11).

---

## 10.1 Cross-Cutting Implementation Gates

These gates apply to every new analytics panel:

1. **Authorization:** Student comparisons must consume aggregate-only authorized results. Do not calculate peer averages in the student browser from individual classmate records.
2. **Coverage:** Return and display enrolled count, graded count, coverage percentage, represented milestone, and official/tentative state. Low coverage must produce "insufficient evidence," not a definitive comparison.
3. **Shared math:** Use `gradingMath.js`, `academicPolicy.js`, `gradeMilestones.js`, and `riskEngine.js` as the calculation sources of truth. Do not reproduce grading or risk thresholds inside chart components.
4. **Dynamic formulas:** Analytics must use the configured grading components and formula snapshot for each class. Do not assume all subjects use identical quiz/activity/exam categories.
5. **Term model:** Support both the regular four-term path and the Summer two-term path. Distinguish raw term ratings from cumulative MR/TFR/SG milestones.
6. **Historical comparability:** A missing semester is unavailable, not zero, passing, or failing. Historical signals require canonical chronological ordering and comparable completed cohorts.
7. **Performance:** Prefer shared or server-side aggregates for Dean/Admin and multi-semester pages; avoid adding repeated full-roster and full-score downloads to already query-heavy dashboards.
8. **Design system:** New analytics must use semantic Tailwind tokens and avoid arbitrary hex colors and inline layout/color styles, including when extending older chart components that predate the current rule.

---

## 11. Defense Framing Summary

> **Revised per audit F12** — original wording made unsupported universal claims (every student needs a personal model, two terms is a universal training minimum, neural nets categorically cannot explain). Removed.

When asked about analytics in the defense, use the replacement statement from Section 2:

> *"ASPIRE currently presents descriptive summaries, cohort comparisons, explainable risk indicators, and prescriptive study guidance. Its risk engine evaluates observed grades, attendance, missing work, and term-to-term decline against explicit rules. Decline detection is an early-warning indicator; it is not a validated future-grade forecast. Proposed projection features will remain clearly separated from official grades and will require a defined method, permitted evidence, and evaluation. Rule-based policy evaluation was selected for transparency and consistency with institutional requirements. Machine learning is outside the current implementation scope."*

If pressed on *why not ML specifically*, ground the answer in this project's concrete constraints rather than general claims: academic policy thresholds (passing cut-off, FDA threshold, scholarship floor) are already specified by DYCI policy rather than needing to be discovered; the dataset available at launch has not been audited for labeled longitudinal outcomes; and explainability to students is a project requirement this implementation satisfies directly via the `factors` breakdown. Avoid asserting these as universal truths about ML — they are the reasons for *this* system, at *this* stage.

---

*End of plan — ASPIRE Analytics Upgrade, 2026-10-05 (revised per team audit, same date)*
