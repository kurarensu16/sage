# SAGE Agent Context & System Overview

This document provides a permanent technical context and reference for AI agents working on the **Smart Academic Grading and Evaluation System (SAGE)** repository.

---

## 1. Project Overview & Tech Stack
* **Institution:** Dr. Yanga's Colleges, Inc. (DYCI)
* **Purpose:** Automate class record management, grade computations, student performance tracking, faculty evaluations, and AI counseling recommendations.
* **Technology Stack:**
  * **Frontend:** React 19, Vite, Tailwind CSS, Lucide Icons, SheetJS (`xlsx`).
  * **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions).
  * **AI:** Claude API (Anthropic).

---

## 2. Directory Structure & Key Files
* **[`src/App.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/App.jsx):** Main React router configuration mapping all 41 pages across role portals.
* **`src/pages/`:** Contains role-specific directories:
  * `admin/` — User accounts, class creation, evaluation builders/windows, grade overrides, term transitions, and audit logs.
  * `dean/` — Department auditing dashboards, AI faculty predictions, at-risk rosters, and summary reports.
  * `faculty/` — Class record setup, score inputs, computation previews, posted grades, evaluation feedback, daily class attendance, and notifications.
  * `student/` — Personal grades list/breakdowns, survey submissions, and AI academic recommendations.
* **[`src/lib/mockDb.js`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/lib/mockDb.js):** LocalStorage-based persistent mock database. Serves as the source of truth before Supabase migration.
* **[`src/lib/excelExport.js`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/lib/excelExport.js):** Shared module generating formatted grade spreadsheets with SheetJS.
* **[`src/lib/constants.js`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/lib/constants.js):** DYCI college and program listing constants.

---

## 3. Relational Database Design (26 Tables)
SAGE runs on a Supabase Postgres schema with RLS enabled:
* **User/Organization:** `departments`, `programs`, `users`
* **Class & Enrollment:** `subjects`, `sections`, `enrollments`, `class_records`, `class_faculty_log`
* **Term State & History:** `academic_terms`, `student_term_details`
* **Grading & Attendance:** `grade_components`, `class_grading_columns`, `component_scores`, `posted_grades`, `unlock_requests`, `attendance_records`
* **Evaluations:** `evaluation_forms`, `evaluation_criteria`, `evaluation_windows`, `evaluation_responses`, `evaluation_ratings`, `evaluation_comments`
* **AI & Messaging:** `ai_student_recommendations`, `ai_faculty_predictions`, `notifications`, `activity_logs`

### ⚠️ Supabase Security Update
* **Behavior:** New tables in the `public` schema are not exposed to the REST Data API automatically.
* **Requirement:** Migration scripts must explicitly issue Postgres grants to the `anon`, `authenticated`, and `service_role` roles:
  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.my_table TO authenticated, anon;
  ```

---

## 4. Key Domain Rules & Logics

### 4.1 Grade Computation
Term grades (Prelim, Midterm, Semi-Final, Final) are calculated out of **100 points** using a **50% / 10% / 40%** weight distribution:
1. **Class Standing (50%):** Sum of 6 activity/quiz columns divided by total max score (typically 110), scaled to 50: `(CS_Sum / CS_Max) * 50`.
2. **Character (10%):** Conduct score (out of 100) multiplied by 0.1: `Char_Score * 0.1`.
3. **Term Exam (40%):** Raw exam score divided by max score (typically 40), scaled to 40: `(Exam_Raw / Exam_Max) * 40`.

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

### 4.2 Semester Transitions (Rollover)
* Changing academic terms requires auditing active records and running a database-safe transaction via `perform_semester_transition`.
* Unsubmitted grades of the archived semester are automatically flagged as `"Late Submissions"`.
* Students are promoted to the next year level (1st &rarr; 2nd &rarr; 3rd &rarr; 4th &rarr; Graduating) during School Year rollovers, archiving previous details in `student_term_details`.

---

### 4.3 Attendance & FDA Policy
* **20% Absenteeism Limit**: For subjects scheduled for 3 hours per session, students trigger **FDA (Failure Due to Absences)** upon reaching their **4th absence**.
* **Worksheet Grade Lock**: Triggering FDA automatically overrides computed ratings, locking the Equivalent GWA to **5.00** and Remarks to **FDA**. The grading remarks dropdown is disabled and can only be unlocked if the instructor reduces the absences count in the attendance ledger.
* **Double-Confirmation Flow**: Initializing attendance sheets for new dates requires a confirmation check to protect against accidental auto-saves.

---

### 4.4 Irregular Students
* Irregular students (`users.section_id` set to `NULL` or mapped to an irregular section) can be dynamically enrolled in custom class catalogs via the manual student enrollment bridge (`enrollments` table).
* Dashboards query the `enrollments` table to correctly fetch classes, grades, and surveys for irregular students, preventing dashboard lockouts.

---

### 4.5 Evaluation Windows
* Form scheduled per Section (College $\rightarrow$ Program $\rightarrow$ Section selector hierarchy).
* **Batch Scheduling (Create Mode):** Automatically schedules windows for **all active instructors** teaching in the selected section, updating duplicates if they exist to protect student response counts.
* **Edit Mode:** Targets and modifies the single targeted instructor's entry.

---

### 4.6 Excel Export Choices
Both `PostedGradesView` and `GradeComputationPreview` support grade exports using SheetJS:
* **Record Sheet:** Outputs the full grading sheet detailing raw scores and live Excel formulas so that averages, rating transmutations, and remarks recalculate automatically.
* **Report of Grades:** Registrar print layout sheet. Features the GWA transmutation table, registrar metadata, and a **symmetrical 30-row split student roster** (Left column for 1-30, Right column for 31-60) linked back to the `Record Sheet` tab via cell formulas.
