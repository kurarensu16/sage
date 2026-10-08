# ASPIRE Agent Context & System Overview

This document provides a permanent technical context and reference for AI agents working on the **Academic Support and Performance Advising with Intervention, Risk, and Evaluation (ASPIRE)** repository.

---

## 1. Project Overview & Tech Stack
* **Institution:** Dr. Yanga's Colleges, Inc. (DYCI)
* **System Name:** ASPIRE
* **Purpose:** Automate class record management, grade computations, student performance tracking, faculty evaluations, clearance auditing, and AI counseling recommendations.
* **Technology Stack:**
  * **Frontend:** React 19, Vite, Tailwind CSS, Lucide Icons, SheetJS (`xlsx`).
  * **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions).
  * **AI:** Google Gemini 2.5 Flash API.

---

## 2. Directory Structure & Key Files
* **[`src/App.jsx`](../src/App.jsx):** Main React router configuration mapping all role portals.
* **`src/pages/`:** Contains role-specific directories:
  * `admin/` — User accounts, class creation, evaluation builders/windows, grade overrides, and audit logs.
  * `dean/` — Department auditing dashboards, AI faculty predictions, at-risk rosters, summary reports, and evaluation release controls.
  * `faculty/` — Class record setup, score inputs, computation previews, posted grades, evaluation feedback, and grade resubmission requests.
  * `student/` — Personal grades list/breakdowns, survey submissions, and AI academic recommendations.
* **[`src/lib/mockDb.js`](../src/lib/mockDb.js):** LocalStorage-based persistent mock database. Serves as runtime source of truth for Admin/Dean pages before full Supabase cutover.
* **[`src/lib/excelExport.js`](../src/lib/excelExport.js):** Shared module generating formatted grade spreadsheets with SheetJS.
* **[`src/lib/constants.js`](../src/lib/constants.js):** DYCI college and program listing constants.
* **[`docs/design/capstone-system-design-v2.md`](design/capstone-system-design-v2.md):** Main Capstone System Design documentation.
* **[`docs/reports/CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md`](reports/CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md):** Formal Capstone 1 Defense panel rulings and institutional policy specifications.

---

## 3. Relational Database Design (21 Tables)
ASPIRE runs on a Supabase Postgres schema with 21 tables:
* **User/Organization:** `departments`, `profiles`
* **Class & Enrollment:** `subjects`, `sections`, `class_enrollments`, `class_records`
* **Grading:** `grade_computations`, `grade_computation_components`, `draft_scores`, `posted_grades`, `grade_change_requests`
* **Evaluations:** `evaluation_criteria`, `evaluation_windows`, `evaluation_responses`, `evaluation_ratings`, `evaluation_comments`
* **AI, Logs & Clearances:** `ai_counseling_logs`, `attendance_logs`, `audit_logs`, `academic_terms`, `clearance_records`

### ⚠️ Key Schema Extensions (Capstone Defense Alignment)
* **`evaluation_responses`**: Contains `submitted_timely BOOLEAN DEFAULT true` (enforces Fairness Clause).
* **`evaluation_windows`**: Contains `is_released_to_faculty BOOLEAN DEFAULT false` (Dean access control gatekeeper).
* **`departments`**: Contains dynamic weights for program COG flexibility.
* **`grade_change_requests`**: Stores locked grade change requests (`class_record_id`, `student_id`, `faculty_id`, `reason`, `evidence_url`, `status`).

---

## 4. Key Domain Rules & Logics

### 4.1 Dynamic, Subject-Specific Grade Computation

Each subject selects its dedicated grading computation through `subjects.computation_id`. The engine resolves that subject's components from `grade_computations` and `grade_computation_components`; it does not substitute a universal COG. A template is valid only when every component has a positive weight and maximum score, component keys are unique, and the weights total exactly 100% within the engine tolerance. A subject with no assigned computation, an empty computation, or an invalid total fails closed: grade calculation and posting remain unavailable and the UI reports the configuration error.

| Supported template | Implemented components and weights |
|---|---|
| General Education Core | Class Standing (Formative) 50%; Major Examination 40%; Character Rating 10% |
| Health Sciences (Theory) | Class Standing (Formative) 30%; Major Examination 60%; Character Rating 10% |
| Health Sciences (RLE / Clinical Practicum) | Checklist Rating 50%; Nursing Care Plan & Case Study 20%; Rubric Assessment 20%; Quizzes & Written Outputs 10% |
| Maritime Studies (Lecture) | Class Standing 60%; Major Examination 40% |
| Maritime Studies (Laboratory / Simulator) | Systematic Exercises 40%; Demonstration of Competence 60% |

For a component with one or more scored items, normalization is point-based rather than an average of percentages:

$$\text{Component Percentage} = \frac{\sum \text{Earned Points}}{\sum \text{Available Points}} \times 100$$
$$\text{Weighted Contribution} = \frac{\text{Component Percentage}}{100} \times \text{Component Weight}$$
$$\text{Term Rating} = \text{ROUND}\left(\sum \text{Weighted Contributions}, 0\right)$$

A database `NULL` or absent score means not yet graded and is excluded as missing evidence. Numeric `0` is an intentionally recorded score: it remains part of the calculation and must never be converted back to `NULL` by blank-score handling.

#### Formula snapshots and historical integrity

At the first successful posting for a class, the system copies the assigned subject computation into `class_records.grading_formula_snapshot`. Every posted row also stores that effective snapshot. Once established, these snapshots are immutable. Later edits to a global COG template affect eligible classes that have not started posting; they do not retroactively change the calculation identity of an already snapshotted class.

#### The grading progression chain

Regular semesters use four term ratings. Intermediate averages are rounded at each milestone:

$$\text{MR} = \text{ROUND}(\text{AVERAGE}(\text{Prelim}, \text{Midterm}), 0)$$
$$\text{TFR} = \text{ROUND}(\text{AVERAGE}(\text{Semi-Final}, \text{Final}), 0)$$
$$\text{SG} = \text{ROUND}(\text{AVERAGE}(\text{MR}, \text{TFR}), 0)$$

Summer terms use the compressed two-term path:

$$\text{MR} = \text{ROUND}(\text{Midterm}, 0)$$
$$\text{TFR} = \text{ROUND}(\text{Final}, 0)$$
$$\text{SG} = \text{ROUND}(\text{AVERAGE}(\text{MR}, \text{TFR}), 0)$$

Posting MR or TFR writes the complete selected milestone atomically for the class. Reposting the same milestone updates the existing unique row rather than creating a duplicate, using the class's effective snapshot. Posting fails and rolls back when required scores remain missing. A posted term also rejects an accidental attempt to clear a previously saved score.

#### SG correction workflow

An official locked SG can be revised through either of two separate authorities:

1. An authorized Admin may perform the existing logged official override.
2. The assigned faculty may submit an exact proposed SG correction, reason, and optional HTTPS evidence reference. The Dean for the class's department may approve or reject it. Approval only authorizes the correction and unlocks the row; it does not change the student's official SG. The assigned faculty must apply the exact approved percentage, GWA, and remark by successfully reposting. Only that committed repost updates the student-facing grade, relocks it, marks the request applied, records immutable correction history, and sends notifications.

The grade correction does not rewrite or delete an already submitted faculty risk evaluation; its historical baseline and follow-up snapshots remain unchanged.

#### Student-visible activity and advising states

Every saved activity is visible to enrolled students. An activity is **Pending** when it has no score, **Tentative** when a score is saved but is not covered by the applicable posted milestone (or was changed after that posting), and **Official** when the saved score is covered by the applicable posted milestone. Faculty-only activity drafts are not part of this workflow.

Student risk evaluations are visible only after official submission/publication (`submitted` or `acknowledged_by_student` with `published_to_student_at`). Faculty working drafts, raw AI drafts, and private notes remain restricted.

#### Transmutation Scale (GWA)
* **98 – 100:** `1.00` (Passed) | **95 – 97:** `1.25` (Passed) | **92 – 94:** `1.50` (Passed)
* **89 – 91:** `1.75` (Passed) | **86 – 88:** `2.00` (Passed) | **83 – 85:** `2.25` (Passed)
* **80 – 82:** `2.50` (Passed) | **77 – 79:** `2.75` (Passed) | **75 – 76:** `3.00` (Passed)
* **Below 75:** `5.00` (Failed)

---

### 4.2 Institutional Governance & Capstone Defense Policies

1. **Fairness Clause (Evaluation Retaliation Prevention):**
   * Evaluations submitted *after* the designated timeline are flagged as `submitted_timely = false`.
   * Late submissions are **excluded** from faculty effectiveness ratings and top-performer rankings to prevent post-grade retaliation.
2. **Evaluation Perks & Clearance Requirements:**
   * Completing evaluations signs student clearance at end of term.
   * Incomplete evaluations leave clearance unsigned and lock student grade summary visibility.
3. **Student Grade & Activity Visibility:**
   * Students see only committed posted-grade milestones as official grades; unposted running grade calculations remain advisory or faculty-facing.
   * Every saved activity is visible with an explicit **Pending**, **Tentative**, or **Official** evidence state. Activity names **must be written in full** (no shortened abbreviations like `Q1`).
4. **Absence Policy (FDA Remarks):**
   * 4 absences trigger an **FDA (Failure Due to Absences)** remark as an **advisory recommendation** for faculty review, NOT an automatic hard fail/lockout.
5. **Department Evaluation Metrics & Comparative Ratings:**
   * Displays respondent participation counts per department and comparative instructor score distributions across departments.
6. **Dynamic Department Grading Flexibility:**
   * Supports custom weight distributions per department program (e.g. Nursing clinicals vs IT labs vs GenEd lectures) and term branching (4-term regular vs 2-term summer).
7. **Top Performing Faculty Hierarchy:**
   * Featured on Dean/Admin dashboards using **on-time** evaluation scores exclusively.
8. **Dean Controlled Access to Evaluation Results:**
   * Evaluation scores/comments are hidden from faculty until released by the Dean (`is_released_to_faculty` toggle per instructor or bulk).
9. **SG Correction Workflow (Exact Proposal + Dean Authorization):**
   * The assigned faculty submits the original and exact proposed SG values, a valid reason, and an optional HTTPS evidence reference for review by the authorized Dean.
   * Dean approval authorizes the change but does not itself modify the official SG. The student receives the corrected result only after the assigned faculty successfully reposts the exact approved values.

---

### 4.3 Excel Export Choices
Both `PostedGradesView` and `GradeComputationPreview` support grade exports using SheetJS:
* **Record Sheet:** Outputs full grading sheet detailing raw scores and live Excel formulas so averages, rating transmutations, and remarks recalculate automatically.
* **Report of Grades:** Registrar print layout sheet. Features GWA transmutation table, registrar metadata, and a **symmetrical 30-row split student roster** (Left column 1-30, Right column 31-60) linked back to the `Record Sheet` tab via formulas.
