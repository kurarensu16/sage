# Developer Handoff: Performance Predictions & Warnings Refactoring Specification

This document provides a comprehensive technical handoff specification for the refactored **Performance Predictions & Warnings** module within the Dean Portal, and the newly integrated **Student Academic Insights** module.

---

## PART 1: DEAN PORTAL WARNINGS AGGREGATION

### 1.1 Architectural Shift (Aggregation & Confidentiality)
To enhance user privacy, maintain confidentiality on shared displays, and improve dashboard readability, individual student names, professor names, and specific section designations are strictly abstracted from the top-level warnings list.

Rather than mounting individual rows for every flagging record, the dashboard dynamically aggregates data logs into single summary blocks.

#### 1.1.1 Custom Priority & Coloring Sorting Hierarchy
To align with priority scoping, diagnostic cards follow a customized color-coded sorting hierarchy:
1. **Red Alert (High Priority 🔴)**: `High Academic Risk Detected` (Order 0).
2. **Yellow Alert (Medium Priority 🟡)**: `Moderate Academic Risk Detected` (Order 1), and `Low Evaluation Engagement` (Order 2 - under 50% response rate).
3. **Green Alert (Good/Low Scopes 🟢)**: `Low Academic Risk` (Order 3 - safe student GWA), and `High Evaluation Engagement` (Order 4 - outstanding >= 80% response rate).
4. **Blue Alert (Pending Notices 🔵)**: `Pending Class Grade Postings` (Order 5).

This ensures the list is anchored dynamically according to this exact Red -> Yellow -> Green -> Blue prioritization pattern, where Academic metrics are strictly positioned above Evaluation metrics.

### 1.2 Aggregation Warnings Breakdown

#### A. High Academic Risk Detected (Red Alert 🔴 - Order 0)
- **Aggregated Rule**: Checks all active student rosters. Counts unique students whose running average GWA exceeds `3.00` OR who have at least one failing grading period (`GWA > 3.00`).
- **User Interface Message**: 
  > *"There are [X] student(s) flagged at high academic risk with failing marks (GWA > 3.00) or failing periods recorded."*
- **Action Trigger**: Click redirects the Dean to `/dean/atriskstudents` (At-Risk Students Ledger) where individual details are fully disclosed.

#### B. Moderate Academic Risk Detected (Yellow Alert 🟡 - Order 1)
- **Aggregated Rule**: Counts students whose running average GWA is border-lining the passing threshold (`GWA >= 2.75` and `GWA <= 3.00`).
  - *Simulation Sample*: Simulated student Jane Doe (`usr-008`) is seeded at `2.85` GWA average to verify this alert state.
- **User Interface Message**: 
  - *"There are [Y] student(s) flagged at moderate academic risk border-lining the passing scale (GWA 2.75 - 3.00)."*
- **Action Trigger**: Click redirects the Dean to the `/dean/atriskstudents` ledger.

#### C. Low Evaluation Engagement (Yellow Alert 🟡 - Order 2)
- **Aggregated Rule**: Counts all active scheduled evaluation windows where the response rate falls below `50%` (i.e. `responsesCount / totalStudents < 0.5`).
- **User Interface Message**: 
  - *"There are [Z] class evaluation(s) with response rates below the 50% participation threshold."*
- **Action Trigger**: Click redirects the Dean to `/dean/evalresultsoverview` (Faculty Evaluation overview).

#### D. Low Academic Risk Detected (Green Success 🟢 - Order 3)
- **Aggregated Rule**: Counts students in good/outstanding academic standing with safe grade progression (`GWA < 2.75` and no failing periods).
- **User Interface Message**:
  - *"Outstanding! There are [L] student(s) in excellent academic standing (Low Risk / Safe)."*
- **Action Trigger**: Click redirects the Dean to the `/dean/atriskstudents` ledger.

#### E. High Evaluation Engagement (Green Success 🟢 - Order 4)
- **Aggregated Rule**: Counts active evaluation windows yielding exemplary student participation where the response rate is equal to or exceeds `80%` (i.e. `responsesCount / totalStudents >= 0.8`).
  - *Simulation Sample*: Evaluation window `ew-003` for Prof. John Doe is seeded at `95.2%` (40/42 responses) to verify this alert state.
- **User Interface Message**:
  - *"Outstanding! There are [H] class evaluation(s) with high student participation (>= 80% response rate)."*
- **Action Trigger**: Click redirects the Dean to `/dean/evalresultsoverview`.

#### F. Pending Class Grade Postings (Blue Notice 🔵 - Order 5)
- **Aggregated Rule**: Identifies outstanding grade postings across active classrooms (Prelim/Midterm/Finals).
- **User Interface Message**: 
  > *"There are [N] outstanding grading periods (Prelim/Midterm/Finals) awaiting submission across active classrooms."*
- **Action Trigger**: Click redirects the Dean to `/dean/gradepostingstatus`.

---

## PART 2: STUDENT PORTAL - ACADEMIC INSIGHTS

This premium dashboard fully replaces the legacy AI Counselor suggestions page, incorporating direct, multi-level dropdown filters to review overall standings, Dean's Lister award projections, and subject-specific period ratings.

### 2.1 Dropped AI Terminology & Layout Model
All legacy labels like `"AI Counselor Advice"`, `"AI Verdict"`, and `"Model Counseling Recommendations"` are deprecated. They are replaced by a clean, data-driven **Academic Insights** interface mapped directly to registered course grades.

```text
  Scope selector: [ Overall Academic Performance v ]

  +---------------------------------------------------------------------------------+
  |  🏆 EXCELLENT Standing                                                          |
  |  Dean's Lister Projections: 94% probability of 1st Class Dean's Lister          |
  |  Your current average of 1.45 qualifies you for 1st Class Dean's Lister honors!  |
  |                                                                                 |
  |  📚 CURRENT RUNNING GWA PER SUBJECT:                                            |
  |  * IT101: Introduction to Computing ....... [ 1.80 GWA ] (Posted)               |
  |  * IT201: Data Structures & Algorithms .... [ 1.50 GWA ] (Draft)                |
  |  * MATH104: Discrete Mathematics .......... [ 1.75 GWA ] (Draft)                |
  |                                                                                 |
  |  💬 Overall Insight: "All subjects are passing safely. Keep it up!"             |
  +---------------------------------------------------------------------------------+
```

### 2.2 Routing & Navigation Integration
1. **New Route**: `/student/academic-insights` registered in `src/App.jsx`.
2. **Sidebar Entry**: Added `{ to: '/student/academic-insights', icon: BrainCircuit, label: 'Academic Insights' }` under `student` links inside `Sidebar.jsx`.
3. **Backward Compatibility**: Requests to the old `/student/airecommendation` route are alias-bound and render the new `AcademicInsights` component automatically to avoid broken dashboard shortcuts.
