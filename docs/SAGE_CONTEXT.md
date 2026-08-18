# SAGE Agent Context & System Overview

This document provides a permanent technical context and reference for AI agents working on the **Smart Academic Grading and Evaluation System (SAGE)** repository.

---

## 1. Project Overview & Tech Stack
* **Institution:** Dr. Yanga's Colleges, Inc. (DYCI)
* **System Name:** SAGE
* **Purpose:** Automate class record management, grade computations, student performance tracking, faculty evaluations, clearance auditing, and AI counseling recommendations.
* **Technology Stack:**
  * **Frontend:** React 19, Vite, Tailwind CSS, Lucide Icons, SheetJS (`xlsx`).
  * **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions).
  * **AI:** Google Gemini 2.5 Flash API.

---

## 2. Directory Structure & Key Files
* **[`src/App.jsx`](file:///c:/Users/sadia/SAGE/src/App.jsx):** Main React router configuration mapping all role portals.
* **`src/pages/`:** Contains role-specific directories:
  * `admin/` — User accounts, class creation, evaluation builders/windows, grade overrides, and audit logs.
  * `dean/` — Department auditing dashboards, AI faculty predictions, at-risk rosters, summary reports, and evaluation release controls.
  * `faculty/` — Class record setup, score inputs, computation previews, posted grades, evaluation feedback, and grade resubmission requests.
  * `student/` — Personal grades list/breakdowns, survey submissions, and AI academic recommendations.
* **[`src/lib/mockDb.js`](file:///c:/Users/sadia/SAGE/src/lib/mockDb.js):** LocalStorage-based persistent mock database. Serves as runtime source of truth for Admin/Dean pages before full Supabase cutover.
* **[`src/lib/excelExport.js`](file:///c:/Users/sadia/SAGE/src/lib/excelExport.js):** Shared module generating formatted grade spreadsheets with SheetJS.
* **[`src/lib/constants.js`](file:///c:/Users/sadia/SAGE/src/lib/constants.js):** DYCI college and program listing constants.
* **[`docs/design/capstone-system-design-v2.md`](file:///c:/Users/sadia/SAGE/docs/design/capstone-system-design-v2.md):** Main Capstone System Design documentation.
* **[`docs/reports/CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md`](file:///c:/Users/sadia/SAGE/docs/reports/CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md):** Formal Capstone 1 Defense panel rulings and institutional policy specifications.

---

## 3. Relational Database Design (21 Tables)
SAGE runs on a Supabase Postgres schema with 21 tables:
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

### 4.1 Grade Computation
Term grades (Prelim, Midterm, Semi-Final, Final) are calculated out of **100 points** using centralized subject weight templates:
1. **General Ed**: 50% Class Standing + 40% Exams + 10% Character.
2. **Health Sciences (Theory)**: 30% Class Standing + 60% Exams + 10% Character.
3. **Health Sciences (RLE)**: 50% Checklist Rating + 20% NCP & Case Study + 20% Rubric Assessment + 10% Quizzes.
4. **Maritime (Lecture)**: 60% Class Standing + 40% Exams.
5. **Maritime (Laboratory)**: 40% Systematic Exercises + 60% Demonstration of Competence.

#### The Grading Progression Chain
Intermediate averages are computed and rounded at each step:
$$\text{Term Rating} = \text{ROUND}(\text{Class Standing}_{50} + \text{Char}_{10} + \text{Exam}_{40}, 0)$$
$$\text{Midterm Rating (MR)} = \text{ROUND}(\text{AVERAGE}(\text{Prelim Grade}, \text{Midterm Grade}), 0)$$
$$\text{Tentative Final Rating (TFR)} = \text{ROUND}(\text{AVERAGE}(\text{Semi-Final Grade}, \text{Final Grade}), 0)$$
$$\text{Semestral Grade (SG)} = \text{ROUND}(\text{AVERAGE}(\text{MR}, \text{TFR}), 0)$$

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
   * Real-time term grade recalculation summaries are hidden. Students see finalized **Midterm** and **Final** grade summaries only.
   * Activity breakdown items remain accessible. Activity names **must be written in full** (no shortened abbreviations like `Q1`).
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
9. **Grade Resubmission Workflow (Valid Reason + Evidence File):**
   * Locked grade modifications require a formal resubmission request with a **valid reason** and **attached evidence file** (`evidence_url` stored in Supabase Storage) for Dean review and approval.

---

### 4.3 Excel Export Choices
Both `PostedGradesView` and `GradeComputationPreview` support grade exports using SheetJS:
* **Record Sheet:** Outputs full grading sheet detailing raw scores and live Excel formulas so averages, rating transmutations, and remarks recalculate automatically.
* **Report of Grades:** Registrar print layout sheet. Features GWA transmutation table, registrar metadata, and a **symmetrical 30-row split student roster** (Left column 1-30, Right column 31-60) linked back to the `Record Sheet` tab via formulas.
