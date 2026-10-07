# ASPIRE Analytics Upgrade Plan

**Date:** 2026-10-05 (revised 2026-10-05 per team audit)
**Branch:** `ghost`
**Author:** ghostbyte1014
**Scope:** Analytics layer only — no grading engine changes, no schema breaking changes, no ML.

> **Revision note:** This plan was audited by the team (`ANALYTICS_UPGRADE_PLAN_AUDIT-dev.md`, 2026-10-05) against the current implementation. The audit's High-priority findings are incorporated below: the trajectory delta is reclassified from predictive to early-warning trend, ST-1 and DN-1 are moved to **Hold** pending a defined projection method and policy sign-off, DN-2/PC-1 are reframed to avoid causal claims, and the ML defense statement is revised to remove unsupported absolutes. See the audit for full findings (F1–F12) and item-by-item disposition.

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
| ST-2 | **Per-subject risk badge on Dashboard** (revised per audit F9) | Each enrolled subject gets a standing badge. Must use the shared risk model's full four tiers (Low / Moderate / High / **Critical** — original omitted Critical) or be explicitly labeled a grade-standing indicator rather than a full composite risk assessment if derived from subject GWA alone. Show "insufficient evidence" when data is incomplete. | `student/Dashboard.jsx` | Diagnostic | High |
| ST-3 | **Activity-level weakness breakdown** | Shows which activities the student scored below 75% on, grouped by subject and term. Connects the advising output to the actual evidence. Data is already fetched — just needs surfacing. | `AcademicInsights.jsx` | Diagnostic | Medium |
| ST-4 | **Class average comparison** — access dependency (per audit F8) | Shows how the student's GWA compares to the class average for each subject. Current student queries only retrieve the signed-in user's own scores — class averages require a separately authorized aggregate endpoint that returns approved aggregates without exposing classmates' individual records. Implement only after that access contract exists. | `AcademicInsights.jsx` | Comparative | Medium |
| ST-5 | **GWA trend line within the semester** | A sparkline showing GWA movement from Prelim → Midterm → Semi-Final as milestones are posted. The student sees their trajectory visually, not just as a number. Data already available from the milestone list. | `AcademicInsights.jsx` | Real-time monitoring | Medium |
| ST-6 | **Honor eligibility distance indicator** (revised per audit F9) | Shows GWA-ceiling distance (`max(0, GWA - 1.75)`), but ceiling distance alone does not establish eligibility — President's List also requires a 2.00 per-subject floor and 18+ units ([academicPolicy.js:10](../../src/lib/academicPolicy.js#L10)). Must display remaining blockers (subject floor, unit count) and whether the underlying evidence is final. | `AcademicInsights.jsx` | Prescriptive | Low |

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
| Activity-level weakness breakdown | ❌ | ✅ ST-3 |
| Class average comparison | ❌ | ✅ ST-4 |
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
| Summary Reports (grade-distribution, at-risk audit, intervention outcomes) | `SummaryReports.jsx` | Descriptive + Diagnostic | Complete — PDF only |

**Gap:** The Dean sees the current state of the college but has no forward-looking signal, no faculty-level accountability view, and no semester-over-semester college comparison.

### 6.2 Planned Improvements

| ID | Improvement | What It Adds | Target File | Analytics Type | Priority |
|---|---|---|---|---|---|
| DN-1 | **Projected at-risk count dotted line** — **HOLD (audit F4)** | The trajectory chart currently counts `GWA > 3.00` (failing grade), which differs from the Dean triage's composite risk model (grade + attendance + missing work). Extrapolating the simpler metric and labeling it a risk projection is inconsistent. Before implementing: either label the chart's projected metric as a "failing-grade count" (not risk), or compute milestone composite risk consistently; define a stable comparable cohort, preserve actual milestone spacing when data is missing, show coverage, and bound the projected count between 0 and cohort size. | `DeanCharts.jsx` + `dean/Dashboard.jsx` | Predictive (pending metric definition) | Hold |
| DN-2 | **Faculty cohort support overview** (renamed per audit F5, was "Faculty accountability view") | A table showing each faculty member's cohort context — class size, graded coverage, at-risk rate, class average — across their sections. Presents support context, not an effectiveness ranking: pass rates and class averages alone do not establish that a faculty member's teaching causes risk outcomes. Must show class size, coverage, milestone, and semester alongside any rate. | `dean/Dashboard.jsx` or new `dean/FacultyOverview.jsx` | Diagnostic | High |
| DN-3 | **Semester-over-semester college comparison** | Compares the current semester's college-wide passing rate, at-risk rate, and honors count against the previous semester as a delta row below the KPI cards. | `dean/Dashboard.jsx` | Comparative | Medium |
| DN-4 | **Excel export for Summary Reports** | `SummaryReports.jsx` currently only exports PDF. Add Excel export using the `xlsx` library already in the project for the grade-distribution and at-risk-audit report types. | `SummaryReports.jsx` + `reportsService.js` | Descriptive | Medium |
| DN-5 | **Honors trend tracker** (reclassified per audit F1) | A historical counter of honors-eligible student count semester over semester. This is a descriptive/comparative trend, not a prediction — no future term is estimated. Must distinguish grade-ceiling candidates from fully eligible students (per F9, eligibility also requires the subject floor and unit count). | `dean/Dashboard.jsx` | Comparative (historical trend) | Medium |
| DN-6 | **Subjects flagged for review** (renamed per audit F5, was "Subject difficulty leaderboard") | A ranked list of subjects with elevated at-risk rates for the current semester, flagged for curriculum review. Does not claim the subjects are inherently difficult — pass-rate alone does not establish cause. | `dean/Dashboard.jsx` or `SummaryReports.jsx` | Diagnostic | Low |

### 6.3 Before vs. After

| Data / Signal | Before | After |
|---|---|---|
| Multi-term GWA trajectory | ✅ | ✅ |
| Academic health distribution | ✅ | ✅ |
| At-risk triage (4 tabs) | ✅ | ✅ |
| Grade distribution per class | ✅ | ✅ |
| PDF summary reports | ✅ | ✅ |
| Projected at-risk count (Final term) | ❌ | ✅ DN-1 |
| Faculty accountability view | ❌ | ✅ DN-2 |
| Semester-over-semester college delta | ❌ | ✅ DN-3 |
| Excel export for summary reports | ❌ | ✅ DN-4 |
| Honors trend tracker | ❌ | ✅ DN-5 |
| Subject difficulty leaderboard | ❌ | ✅ DN-6 |

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
| CP-1 | **Component-level class average** | Class average broken down by grading component: quiz %, activity %, exam %. Shows which component type is dragging the class down. | `reportsService.js` → extend `buildSummaryCards`; surface in `ClassAnalyticsPanel.jsx` | High |
| CP-2 | **Within-semester term progression** | A chart showing how class average evolved across Prelim → Midterm → Semi-Final → Final within the selected class. Shows momentum, not just final standing. | `reportsService.js` → new `buildTermProgressionSeries()`; render in `ClassAnalyticsPanel.jsx` | High |
| CP-3 | **Attendance summary card** (label corrected per audit F9) | Class-level attendance: total absences logged, students at 3 absences (near-FDA), students at 4+ absences. Four absences trigger an **FDA recommendation for faculty choice**, not an automatic FDA outcome — label as "FDA recommendation threshold reached," not "FDA triggered." Absences must be evaluated per class record; do not sum across subjects. | `buildSummaryCards()` → add `nearFdaCount`, `recommendationThresholdCount`; surface as stat tiles in `ClassPerformance.jsx` | Medium |
| CP-4 | **Score distribution histogram — enhancement, not new** (per audit F6) | `ClassAnalyticsPanel.jsx:16–44, 83–98` already implements a percentage histogram. This item adds a shared GWA-band adapter (`GradeDistributionHistogram` expects `brackets`, not raw aggregated rows) rather than introducing the capability from scratch. | Build adapter from `aggregatedStudents` → `brackets`; reuse `GradeDistributionHistogram` from `DeanCharts.jsx` | Medium |
| CP-5 | **Struggling student quick list — partial duplicate** (per audit F6) | `ClassPerformance.jsx:150–168, 440–484` already filters at-risk/struggling students. Scope this item to the net-new piece only: a one-click action to open the Student Risk modal from that existing filtered view. | Add action/route from existing filtered `aggregatedStudents` view to Student Risk modal | Low |

### 7.3 Performance Comparison — Planned Improvements

| ID | Improvement | What It Adds | Where to Implement | Priority |
|---|---|---|---|---|
| PC-1 | **Persistent low-pass-rate review signal** (renamed per audit F5, was "Subject difficulty flag") | When 3+ **actual consecutive** semesters of the same subject (aggregated across sections, with a minimum coverage requirement) fall below a 70% passing rate, show a review banner. Does not distinguish curriculum difficulty from classroom management — pass rate alone can't establish cause; it's a flag for review, not a diagnosis. The 70% threshold is a documented heuristic, not a policy-derived rule — state that explicitly. Missing semesters count as unavailable, not passing or failing. | `reportsService.js` → new `detectLowPassRateSignal()`; render as advisory banner in `PerformanceComparison.jsx` | High |
| PC-2 | **Grade distribution shape comparison** | Side-by-side distribution shape (Honors / Passing / Failing counts) for the two selected classes. Catches cases where averages are equal but one class has more extreme outliers. | Extend `fetchTermCohortMetrics()` to return `gradeDistribution`; render as grouped bar chart | Medium |
| PC-3 | **Component-level comparison** | Compare quiz, activity, and exam averages between two classes. Answers: *"Did exam difficulty increase, or did activities drop?"* Currently only the overall average is compared. | Extend `compareCohortMetrics()` to diff component-level averages; add a second panel in `PerformanceComparison.jsx` | Medium |
| PC-4 | **Export to Excel** | `ClassPerformance.jsx` has Excel export. `PerformanceComparison.jsx` has none. Add export of the comparison table and trend chart data. | `reportsService.js` → new `exportComparisonToExcel()`; add Download button | Medium |
| PC-5 | **Cross-subject comparison mode** | Optional mode to compare two different subjects by the same faculty in the same semester (e.g., IT101 vs. IT102). Identifies which subject is consistently harder. | New comparison mode in `PerformanceComparison.jsx`; reuses `fetchTermCohortMetrics` — no service changes needed | Low |

### 7.4 Before vs. After

| Data Type | Class Performance (before) | Class Performance (after) | Performance Comparison (before) | Performance Comparison (after) |
|---|---|---|---|---|
| Per-student GWA & risk | ✅ | ✅ | ✅ (aggregated) | ✅ (aggregated) |
| Activity-level scores | ✅ | ✅ | — | — |
| Component-level averages | ❌ | ✅ CP-1 | ❌ | ✅ PC-3 |
| Within-semester progression | ❌ | ✅ CP-2 | ✅ (multi-sem) | ✅ (multi-sem) |
| Attendance summary (class-level) | ❌ | ✅ CP-3 | — | — |
| Grade distribution shape | ❌ | ✅ CP-4 | ❌ | ✅ PC-2 |
| Struggling student quick list | ❌ | ✅ CP-5 | — | — |
| Subject difficulty flag | — | — | ❌ | ✅ PC-1 |
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
| AD-1 | **User growth chart** | Bar chart showing registered accounts grown across academic terms. Tracks system adoption over time. | `admin/Dashboard.jsx` — query `users.created_at` grouped by term; render as `BarChart` | Descriptive | Medium |
| AD-2 | **Grade posting compliance rate** | A progress bar showing: of all expected postings for the active term, what percentage are submitted. Currently only visible to the Dean. | `admin/Dashboard.jsx` — replicate the posting-status query from the Dean side as a summary stat | Diagnostic | Medium |
| AD-3 | **Role distribution donut** | Visual donut of role breakdown (students / faculty / deans / admins) replacing the current plain number tiles. No new data — purely a visual upgrade. | `admin/Dashboard.jsx` — wrap `metrics.roleCounts` in a `PieChart` | Descriptive | Low |
| AD-4 | **APK adoption trend** | Extends the APK download count into a trend: downloads per day over the last 7 or 30 days. Shows whether mobile adoption is growing or plateauing. Raw data is already fetched from `activity_logs`. | `admin/Dashboard.jsx` | Descriptive | Low |
| AD-5 | **Grade posting compliance forecast** *(future work)* | Based on historical posting patterns across 2+ semesters, predict how many faculty are likely to miss the deadline this semester. Only meaningful after the system accumulates multi-semester data. | `admin/Dashboard.jsx` | Predictive | Future work |

### 8.3 Before vs. After

| Data / Signal | Before | After |
|---|---|---|
| User & role counts | ✅ | ✅ |
| Active term display | ✅ | ✅ |
| Recent audit log | ✅ | ✅ |
| APK download count | ✅ | ✅ |
| User growth chart | ❌ | ✅ AD-1 |
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
| **Student** | 10 | 6 (ST-1 to ST-6) | 5 — ST-1 is on Hold |
| **Dean** | 7 | 6 (DN-1 to DN-6) | 5 — DN-1 is on Hold |
| **Faculty — Class Performance** | 4 (undercounted — panel also has a status donut and activity-average timeline not listed in 7.1) | 5 (CP-1 to CP-5) | 3 — CP-4, CP-5 are enhancements to existing features, not new capabilities |
| **Faculty — Performance Comparison** | 3 | 5 (PC-1 to PC-5) | 5 |
| **Admin** | 5 | 5 (AD-1 to AD-5) | 4 — AD-5 is future work |
| **Office** | — | — | **Not addressed by this plan.** Decide explicitly whether to scope it in or state the exclusion in the defense. |

### 9.2 Analytics Type Coverage — All Portals After Upgrades

> **Revised per audit F1, F7:** "Real-time monitoring" is relabeled — no page in this plan has a `channel()`/`subscribe()` live-update mechanism; what exists is snapshot fetch-on-load plus historical trend charts. Predictive is marked "Hold" where the feature itself is on hold (ST-1, DN-1), and removed from Faculty (PC) since PC-1 is a historical review flag, not a forecast.

| Analytics Type | Student | Dean | Faculty (CP) | Faculty (PC) | Admin |
|---|---|---|---|---|---|
| Descriptive | ✅ | ✅ | ✅ | ✅ | ✅ |
| Diagnostic | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comparative | ✅ ST-4 (access-dependent) | ✅ DN-3 | — | ✅ | — |
| Predictive | Hold (ST-1) | Hold (DN-1) | — | — | Future (AD-5) |
| Prescriptive | ✅ | — | — | — | — |
| Current-snapshot / historical-trend monitoring | ✅ ST-5 | ✅ | — | — | — |

### 9.3 All Planned Items by Priority

> Priorities below are **proposed**, per audit F11 — not implementation-ready confirmations. Hold items are listed separately.

| Priority | ID | Feature | Portal |
|---|---|---|---|
| **High** | ST-2 | Per-subject risk badge on Dashboard | Student |
| **High** | DN-2 | Faculty cohort support overview | Dean |
| **High** | CP-1 | Component-level class average | Faculty (CP) |
| **High** | CP-2 | Within-semester term progression | Faculty (CP) |
| **High** | PC-1 | Persistent low-pass-rate review signal | Faculty (PC) |
| **Medium** | ST-3 | Activity-level weakness breakdown | Student |
| **Medium** | ST-4 | Class average comparison (access-dependent) | Student |
| **Medium** | ST-5 | GWA trend line (semester arc) | Student |
| **Medium** | DN-3 | Semester-over-semester college delta | Dean |
| **Medium** | DN-4 | Excel export for Summary Reports | Dean |
| **Medium** | DN-5 | Honors trend tracker (reclassified: historical trend, not predictive) | Dean |
| **Medium** | CP-3 | Attendance summary card | Faculty (CP) |
| **Medium** | CP-4 | Score distribution histogram (enhancement) | Faculty (CP) |
| **Medium** | PC-2 | Grade distribution shape comparison | Faculty (PC) |
| **Medium** | PC-3 | Component-level comparison | Faculty (PC) |
| **Medium** | PC-4 | Export to Excel | Faculty (PC) |
| **Medium** | AD-1 | User growth chart | Admin |
| **Medium** | AD-2 | Grade posting compliance rate | Admin |
| **Low** | ST-6 | Honor eligibility distance indicator | Student |
| **Low** | DN-6 | Subjects flagged for review | Dean |
| **Low** | CP-5 | Struggling student quick list (partial duplicate) | Faculty (CP) |
| **Low** | PC-5 | Cross-subject comparison mode | Faculty (PC) |
| **Low** | AD-3 | Role distribution donut | Admin |
| **Low** | AD-4 | APK adoption trend | Admin |
| **Future work** | AD-5 | Grade posting compliance forecast | Admin |
| **Hold — prerequisite gates unmet** | ST-1 | Projected Semestral Grade range | Student |
| **Hold — prerequisite gates unmet** | DN-1 | Projected at-risk dotted line | Dean |

---

## 10. Implementation Order for Capstone

> **Revised per audit F11:** the original seven-item sequence claimed "every portal" but had no Admin item, and both its two highest-profile items (ST-1, DN-1) are now Hold pending prerequisite gates. The sequence below follows the audit's recommended order — clean, low-risk items first, Hold items last and conditional.

| # | ID | Feature | Portal | Effort | Note |
|---|---|---|---|---|---|
| 1 | CP-1 | Component-level class average | Faculty | Low | Clean — no policy or access dependency |
| 2 | CP-2 | Within-semester term progression | Faculty | Low | Clean |
| 3 | CP-3 | Attendance summary card | Faculty | Low | Label corrected per F9 |
| 4 | ST-2 | Per-subject risk badge on Dashboard | Student | Low | Use full 4-tier model or label as grade-standing |
| 5 | ST-3 | Activity-level weakness breakdown | Student | Low | Grouping only — evidence already visible |
| 6 | DN-4 | Excel export for Summary Reports | Dean | Low | Reuse existing `xlsx-js-style` export path |
| 7 | PC-4 | Export to Excel | Faculty | Low | Same export path as DN-4 |
| 8 | DN-2 | Faculty cohort support overview | Dean | Medium | Reframed as support context, not ranking |
| 9 | PC-1 | Persistent low-pass-rate review signal | Faculty | Medium | Requires 3-consecutive-semester + coverage logic |
| 10 | AD-2 | Grade posting compliance rate | Admin | Medium | Include Admin explicitly if "every portal" is claimed |
| — | ST-1 | Projected Semestral Grade range | Student | — | **Hold** — needs policy sign-off + projection method first |
| — | DN-1 | Projected at-risk dotted line | Dean | — | **Hold** — needs metric definition first |

State explicitly in the defense whether Office is in scope. If not, say so rather than letting its absence look like an oversight (F11).

---

## 11. Defense Framing Summary

> **Revised per audit F12** — original wording made unsupported universal claims (every student needs a personal model, two terms is a universal training minimum, neural nets categorically cannot explain). Removed.

When asked about analytics in the defense, use the replacement statement from Section 2:

> *"ASPIRE currently presents descriptive summaries, cohort comparisons, explainable risk indicators, and prescriptive study guidance. Its risk engine evaluates observed grades, attendance, missing work, and term-to-term decline against explicit rules. Decline detection is an early-warning indicator; it is not a validated future-grade forecast. Proposed projection features will remain clearly separated from official grades and will require a defined method, permitted evidence, and evaluation. Rule-based policy evaluation was selected for transparency and consistency with institutional requirements. Machine learning is outside the current implementation scope."*

If pressed on *why not ML specifically*, ground the answer in this project's concrete constraints rather than general claims: academic policy thresholds (passing cut-off, FDA threshold, scholarship floor) are already specified by DYCI policy rather than needing to be discovered; the dataset available at launch has not been audited for labeled longitudinal outcomes; and explainability to students is a project requirement this implementation satisfies directly via the `factors` breakdown. Avoid asserting these as universal truths about ML — they are the reasons for *this* system, at *this* stage.

---

*End of plan — ASPIRE Analytics Upgrade, 2026-10-05 (revised per team audit, same date)*
