# ASPIRE — Reports Module & Grade Notification Analysis
> **Prepared for:** Development Team  
> **Date:** October 1, 2026  
> **Based on:** Sir Michael's Transcription + `Reports-Module-Plan-Faculty-Side.md` + Codebase Review  
> **Analyst:** Antigravity AI (via Gemini)

---

## Part A — Grade Posted Notification: Student + Parent/Guardian

### What Sir Michael Said

> "Once grades are posted, both the student and their parent or guardian should be notified simultaneously. This will help them understand the student's academic standing, including whether the student is failing or may need to shift to a different course."

### Current State (Codebase Finding)

The existing `NOTIFICATION_SYSTEM_CATALOG.md` defines a `grade_posted` notification type for the **Student Portal** only:

| Type | Target | Trigger |
|---|---|---|
| `grade_posted` | Student | Faculty posts/updates term grades |

**There is no parent/guardian notification in the current schema.** The `profiles` table stores user accounts, but there is no `guardian_contact` or linked parent profile in the current 21-table schema.

The `notifyUnlockRequested` and `notifyOverrideRequested` dispatchers exist in `src/lib/notificationDispatcher.js`, but there is no `notifyGradePosted` function yet.

---

### Insights & Gaps

1. **No parent/guardian table exists yet.** The `profiles` table currently handles `student`, `faculty`, `dean`, `admin`, and `office` roles. A guardian contact record does not exist.
2. **No `guardian_contact` field** exists in the `profiles` schema — not even a basic `guardian_email` or `guardian_phone` column.
3. **The notification system only supports in-app delivery + Capacitor local notifications.** It does not support SMS or email dispatch. If the parent does not have the ASPIRE app installed, they cannot receive in-app notifications.
4. **"Failing" and "needs to shift" are policy-level terms.** The DYCI transmutation scale already maps `< 75 = 5.00 = Failed` — but the system must surface this clearly in notification content.

---

### Suggestions & Improvements

#### 1. Add a `guardians` Table (Minimal Schema)

```sql
CREATE TABLE guardians (
  guardian_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  relationship  TEXT,              -- e.g., 'Mother', 'Father', 'Guardian'
  email         TEXT,
  phone         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

> **Important:** Even if guardian notifications are out-of-scope for Capstone 1 defense, adding the `guardians` table now prevents a costly schema migration later. The table can remain empty in production until the feature is activated.

#### 2. Add `notifyGradePosted()` Dispatcher

In `src/lib/notificationDispatcher.js`, add:

```js
// Notify student + insert a guardian_email_queue entry for async sending
export async function notifyGradePosted({ studentId, subjectName, termPeriod, remarkText, failFlag }) {
  const message = failFlag
    ? `Your official grade for ${subjectName} (${termPeriod}) has been posted. Remarks: ${remarkText}. Please consult your adviser.`
    : `Your official grade for ${subjectName} (${termPeriod}) has been posted. Remarks: ${remarkText}.`;

  // 1. Insert in-app notification for student
  await supabase.from('notifications').insert({
    recipient_id: studentId,
    type: 'grade_posted',
    message,
  });

  // 2. (Future) Queue guardian email/SMS via Supabase Edge Function
}
```

#### 3. Trigger Point: `PostedGradesView.jsx`

The trigger point already exists in `src/pages/faculty/PostedGradesView.jsx`. When a faculty member locks/posts a grade milestone, `notifyGradePosted()` should be called per student in the class roster.

**Recommended trigger flow:**

```
Faculty clicks "Post/Lock Grade" in PostedGradesView
   For each student in class roster:
       Insert notification (type: grade_posted) to student
       If student has guardian record:
           Queue email/SMS to guardian via Edge Function
```

#### 4. Notification Content Requirements

The notification message must include:
- Subject name and code (e.g., `Capstone Project 1 - IT401`)
- Term period (e.g., `Midterm`, `Final`)
- Remarks (e.g., `Passed`, `Failed`, `INC`)
- A failing flag message if `remark = 'Failed'` or `GWA = 5.00`
- Advisory message if student is at-risk (linked to EWS data)
- A note that the student may need to consult their adviser about shifting programs (advisory, not automated — per Sir Michael)

#### 5. Delivery Channel Recommendation

| Channel | Feasibility | Notes |
|---|---|---|
| In-App (current system) | ✅ Immediate | Works for students already logged in |
| Android Push (Capacitor Local Notifications) | ✅ Active | Already in progress — extend to cover `grade_posted` events |
| Email to guardian | 🔄 Future | Requires Supabase Edge Function + email provider (Resend/SendGrid) |
| SMS to guardian | 🔄 Future | Requires Twilio or a Philippine SMS gateway |

> **Tip:** For the Capstone defense, demonstrate in-app notification first. Guardian email can be framed as a "Phase 2 feature" with the database schema already scaffolded.

---

## Part B — Reports Module (Faculty Side): Analysis & Improvements

### Plan Summary Recap

The `Reports-Module-Plan-Faculty-Side.md` defines **two pages**:

1. **Class Performance** — score sheet + pivot table + summary cards
2. **Performance Comparison** — current term vs. past terms of the same `course_code`

Both pages share a subject dropdown and academic year filter.

---

### Codebase Alignment Findings

#### What Already Exists

| Component | File | Purpose |
|---|---|---|
| `FacultyPerformanceTrajectoryChart` | `src/components/faculty/FacultyCharts.jsx` | Line chart: class GWA, pass rate, exam average across terms |
| `StudentRiskInterventionDonut` | `src/components/faculty/FacultyCharts.jsx` | Donut chart: risk level distribution (On Track / Moderate / Critical / Escalated) |
| `AssessmentComponentDistributionBar` | `src/components/faculty/FacultyCharts.jsx` | Bar chart: CS, Exam, Character component averages vs. 75% benchmark |
| `StudentRisk.jsx` | `src/pages/faculty/StudentRisk.jsx` | At-risk roster with GWA, absences, risk level/score, and evaluation modal |
| `PostedGradesView.jsx` | `src/pages/faculty/PostedGradesView.jsx` | Posted grades grid with student rows, lock milestones, Excel/PDF export |
| `excelExport.js` | `src/lib/excelExport.js` | SheetJS-based grade sheet + report of grades export |

#### What Is Missing / Not Yet Built

| Feature | Status | Notes |
|---|---|---|
| Dedicated **Reports** nav section in faculty sidebar | Not built | No `/faculty/reports/class-performance` or `/faculty/reports/comparison` routes in `App.jsx` |
| **Class Performance page** (score sheet + summary cards) | Not built | Patterns exist in `PostedGradesView` but not a standalone Reports page |
| **Pivot table** panel | Not built | `react-pivottable` not yet installed |
| **Per-activity performance breakdown** (well/average/struggling counts) | Not built | No per-activity aggregation shown currently |
| **At-risk count card** in Reports | Partial | `StudentRisk.jsx` shows the roster but not as a summary card in Reports |
| **Performance Comparison page** | Not built | No route, no UI, no cross-year data query |
| **Academic year filter** shared across both report pages | Not built | — |
| **Status bands** settings table | Not built | Cutoffs are hardcoded (`75%` in `FacultyCharts.jsx` line 426) |

---

### Insights on the Plan

#### Strengths

1. **Clear data model.** The "one row per student per activity" dataset design enables both the grid and pivot to share the same source of truth.
2. **Preset pivot layouts** (At-risk students, Whole class, Per activity, By section) reduce cognitive load for non-technical faculty.
3. **Reuse of `StudentRisk` module** for at-risk logic ensures consistent numbers across all pages — critical for credibility.
4. **Export to Excel/CSV** is already partially built (`excelExport.js`) and can be extended for report pages.
5. **`FacultyCharts.jsx` already implements** the Performance Trajectory chart — maps directly to the Performance Comparison page with minor data-source changes.

#### Gaps & Risks

| # | Issue | Risk Level | Recommendation |
|---|---|---|---|
| 1 | **Pivot library compatibility.** `react-pivottable` compatibility with React 19 is unverified. | High | Test in a branch first. Fallback to a custom simple pivot (one row field, one column field, count/sum/average). |
| 2 | **Hardcoded 75% cutoff** in `FacultyCharts.jsx` (line 426). | Medium | Move `PASSING_GRADE` and `HIGH_CUTOFF` to `constants.js` or a `settings` table. |
| 3 | **"Class" vs. "Section" ambiguity.** One `class_record` = one section, but faculty may teach the same subject in multiple sections. | Medium | Add a section filter dropdown. Default to all sections of the subject. |
| 4 | **Dropped/incomplete students** skew averages and pass rates. | Medium | Count only `class_enrollments` with `approval_status = 'approved'`. Show a footnote on each report. |
| 5 | **No academic year filter** in current faculty pages. | Low-Medium | Use `sections.school_year` column. Persist filter in URL query params when navigating between report pages. |
| 6 | **Ungraded activities treated as zero.** `PostedGradesView.jsx` initializes placeholder activities without scores. | Low-Medium | Handle `null` scores as excluded from averages everywhere — not counted as 0. |
| 7 | **Changed grading setups across years** can make comparisons misleading. | Low | Show the grade template name beside each comparison row so faculty can contextualize the delta. |

---

### Suggested Implementation Order (Refined from Plan Section 9)

| Step | Task | Codebase Entry Point | Priority |
|---|---|---|---|
| 1 | Create `/faculty/reports/` routes in `App.jsx` | `src/App.jsx` | First |
| 2 | Build shared dataset query (student x activity, from `draft_scores` + `posted_grades` + `class_enrollments`) | New `reportsService.js` in `src/lib/` | First |
| 3 | Build **Class Performance page** skeleton: subject dropdown, year filter, summary cards | New `ClassPerformance.jsx` in `src/pages/faculty/` | High |
| 4 | Build the **score sheet grid** (reuse patterns from `PostedGradesView.jsx`): students as rows, activities as columns, status + risk flag | Part of `ClassPerformance.jsx` | High |
| 5 | Add **per-activity performance section**: performed well / average / struggling counts + activity average | Part of `ClassPerformance.jsx` | Medium |
| 6 | Add **pivot panel** (`react-pivottable` or custom) with 4 presets | Part of `ClassPerformance.jsx` | Medium |
| 7 | Wire **Export** (extend `excelExport.js` for the score sheet) | `src/lib/excelExport.js` | Later |
| 8 | Build **Performance Comparison page**: reuse `FacultyPerformanceTrajectoryChart`, load same course code across academic years | New `PerformanceComparison.jsx` in `src/pages/faculty/` | Medium |
| 9 | Add `better / worse / about the same` labels per metric | Part of `PerformanceComparison.jsx` | Medium |
| 10 | Move cutoffs to **settings** (configurable, not hardcoded) | `src/lib/constants.js` or new `settings` table | Later |
| 11 | Polish: empty states, loading skeletons, mobile two-tab layout (Data | Pivot), error states | All report pages | Polish |

---

### Specific Improvements from Sir Michael's Transcription

#### 1. "Show number of at-risk students" — Add to Summary Cards

Make the **at-risk count** card prominent, not buried in a table. Use the exact same `risk_flag` logic from `StudentRisk.jsx` (students where `risk_score >= 20` OR `risk_level` is `moderate`, `high`, or `critical`).

Recommended summary card layout:

```
[ Total Students: 42 ]  [ At-Risk: 8 (19%) ]  [ Performed Well: 18 ]  [ Average: 12 ]  [ Struggling: 12 ]
```

#### 2. "Per activity: how many performed well / had difficulties" — Activity Performance Breakdown

Add a collapsible or tab-based **per-activity breakdown panel** below the score sheet:

| Activity | Performed Well | Average | Struggling | Activity Average |
|---|---|---|---|---|
| FA 1 (Quiz 1) | 20 (48%) | 12 (29%) | 10 (24%) | 78.4% |
| Midterm Exam | 15 (36%) | 14 (33%) | 13 (31%) | 74.1% |

Note: The `AssessmentComponentDistributionBar` in `FacultyCharts.jsx` already shows component-level averages (Class Standing, Exam, Character). The per-activity breakdown is more granular. Both can coexist — use the component bar as a summary chart and the per-activity table below it.

#### 3. "Indicate academic year and allow comparisons" — Performance Comparison Page

The `FacultyPerformanceTrajectoryChart` already plots data across terms. Extend it to:
- Accept an academic year as the primary axis (not just "term")
- Show `better / worse / about the same` labels per metric column
- Include a plain-language summary line

Example: *"Passing rate is up 6 points vs. 2025-2026."*

Use `sections.school_year` and `sections.semester` to group data by academic year in the query.

#### 4. "Help faculty adjust teaching strategies" — Narrative Summary Block

Add a plain-text **narrative block** at the top of the Performance Comparison page:

> *"Compared to A.Y. 2025-2026, the passing rate for IT401 improved by +6 points (from 68% to 74%). At-risk rate decreased by 4 points. Exam average remained about the same (+/-2%). These are trend indicators based on different student cohorts, not proof of teaching effectiveness."*

---

### Design System Compliance Notes

Per the project AGENTS.md rules, all new report pages must follow:

- Use `sage-*` semantic tokens only — no arbitrary hex codes. Note: `FacultyCharts.jsx` currently uses raw hex strings (e.g., `'#1e3a8a'`, `'#10b981'`). These should be reconciled with the `@theme` directive in `index.css`.
- Use `lucide-react` for all icons — no emoji as status indicators in report tables.
- Use `JetBrains Mono` for all grade values, percentages, and counts in the score sheet.
- No `dark:` Tailwind variants.
- All filter dropdowns and interactive elements must have unique IDs (required for browser testing per the Definition of Done).

---

### Open Questions (from the Plan) — Answered from the Codebase

| Open Question | Answer |
|---|---|
| Exact passing grade for status cutoffs? | 75 = 3.00 (Passed), below 75 = 5.00 (Failed) — from the DYCI transmutation scale in `ASPIRE_CONTEXT.md`. This is the `PASSING_GRADE`. |
| Whether overall grade is weighted? | Yes. `PostedGradesView.jsx` resolves `gradingFormula` from `grading_formula_snapshot` or `grade_computation_components`. Use the same resolved formula for Reports. |
| "Class" = one section or all sections? | Currently one `class_record` = one section. Recommend: default to all sections of the subject, with a section filter dropdown. |
| Dropped/incomplete students counted? | Count only `class_enrollments` with `approval_status = 'approved'`. Show a footnote on each report. |
| Who besides the instructor can view reports? | Faculty see only their own `class_records` (Supabase RLS). Consider a read-only Reports view in the Dean portal as a later phase. |
| The "about the same" margin? | Start at +/-2 percentage points. Store in `constants.js` or a `settings` table so it can be adjusted after testing with real data. |

---

## Part C — Combined Action Items for the Team

### Immediate (Before Next Sprint)

| # | Task | Owner |
|---|---|---|
| C1 | Add `notifyGradePosted()` call in `PostedGradesView.jsx` that inserts a `notifications` row per student when a grade milestone is locked | Backend dev |
| C2 | Create `guardians` table SQL migration (can be empty for now) and document the schema | Backend dev |
| C3 | Create `/faculty/reports/class-performance` and `/faculty/reports/comparison` routes in `App.jsx` | Frontend dev |
| C4 | Create `reportsService.js` — shared dataset query (student x activity, with status bands computed) | Backend / Frontend dev |
| C5 | Move the hardcoded `75%` passing cutoff in `FacultyCharts.jsx` to `constants.js` | Frontend dev |

### Next Sprint

| # | Task | Owner |
|---|---|---|
| C6 | Build `ClassPerformance.jsx` with summary cards, score sheet grid, and per-activity breakdown table | Frontend dev |
| C7 | Build `PerformanceComparison.jsx` reusing `FacultyPerformanceTrajectoryChart` with academic year as the axis | Frontend dev |
| C8 | Add academic year filter (from `sections.school_year`) to both report pages; persist selection in URL query params | Frontend dev |
| C9 | Install and test `react-pivottable` for React 19 compatibility; if it fails, implement a simple custom pivot | Frontend dev |
| C10 | Add `section` filter dropdown to both report pages | Frontend dev |

### Later / Polish

| # | Task | Owner |
|---|---|---|
| C11 | Build guardian email queue (Supabase Edge Function + Resend/SendGrid) for grade posted notifications | Backend dev |
| C12 | Add export to Excel/CSV for the Reports score sheet (extend `excelExport.js`) | Frontend dev |
| C13 | Add plain-language narrative summary block to Performance Comparison page | Frontend dev |
| C14 | Add export audit logging (who exported + timestamp + subject) to `audit_logs` | Backend dev |
| C15 | Mobile layout for Class Performance (two tabs: Data | Pivot) | Frontend dev |

---

## Appendix: Key File Map

| File | Purpose | Relevant To |
|---|---|---|
| `docs/update_plan/Reports-Module-Plan-Faculty-Side.md` | Full plan specification | All |
| `src/components/faculty/FacultyCharts.jsx` | 3 chart components (trajectory, donut, bar) | Class Performance, Comparison |
| `src/pages/faculty/StudentRisk.jsx` | At-risk roster + `getClassPriorityRoster()` | At-risk logic reuse |
| `src/pages/faculty/PostedGradesView.jsx` | Grade posting, lock milestones, existing grid patterns | Score sheet, notification trigger |
| `src/lib/notificationDispatcher.js` | Notification dispatcher functions | `notifyGradePosted()` addition |
| `src/lib/excelExport.js` | SheetJS export engine | Reports export extension |
| `docs/NOTIFICATION_SYSTEM_CATALOG.md` | Full notification catalog by role | Parent/guardian notification design |
| `docs/ASPIRE_CONTEXT.md` | Grading scale, transmutation, domain rules | Status band cutoffs |
| `docs/ASPIRE_DATABASE_SCHEMA.md` | 21-table schema + ERD | Guardian table planning |
| `docs/TASKS.md` | SDLC master task tracker | Prioritization reference |

---

*This document was generated by cross-referencing Sir Michael's transcription, the Reports Module Plan, and a live analysis of the ASPIRE codebase (React 19 + Supabase + Capacitor). All file paths are relative to the SAGE/ workspace root.*
