# SAGE — Complete Frontend Implementation & UI Refactor Plan

This document outlines the step-by-step implementation blueprint to resolve all missing pages, stubs, and dynamic scoring layouts across the SAGE application. 

Since all underlying database tables for these pages (such as `attendance_logs`, `enrollments`, and `departments`) already exist, these updates can be deployed directly on the frontend. The development team will only need to verify and tweak the API queries.

---

## 1. Student Portal Tasks

### 1.1 [NEW] Attendance Log Page (`src/pages/student/Attendance.jsx`)
* **Objective**: Enable students to view their attendance status per enrolled subject.
* **Database Connection**: Reads from existing `attendance_logs` table (queries `student_id`, `class_record_id`, `date`, `status`).
* **UI & Components**:
  * Grid of card objects for each enrolled subject.
  * Summary counts: `Present`, `Late`, and `Absent`.
  * **FDA Absence Badge**: If a student accumulates **4 or more absences** in a subject, render a yellow caution badge: `"⚠️ FDA Advisory (4+ Absences)"` as specified in the scope warning guidelines.

### 1.2 [MODIFY] Grade Breakdown UI (`src/pages/student/MyGradesDetail.jsx`)
* **Objective**: Refactor the raw grid boxes into a nested, dynamic list layout.
* **UI & Components**:
  * Remove the 6 card grids representing formative assessments.
  * Replace with a **Schoology-style Nested List Layout** where component categories (e.g. Class Standing) expand downward.
  * Loop rows dynamically based on the activities created by the professor for that course.
  * Render the custom `Title` and `Description/Guideline` for each assessment column block.

---

## 2. Faculty Portal Tasks

### 2.1 [NEW] Roster & COR Verification Queue (`src/pages/faculty/VerificationQueue.jsx`)
* **Objective**: Enable professors to approve or reject student join requests and inspect PDF Certificate of Registration (COR) uploads.
* **Database Connection**: Queries `enrollments` table where `status = 'pending_verification'` and joins with `users` (to get names and `latest_cor_url`).
* **UI & Components**:
  * List of pending student enrollments.
  * **Iframe Modal**: Clicking a student row opens their uploaded COR PDF inside a secure iframe preview.
  * **Action Buttons**: Render `[Approve]` (triggers a Supabase update setting enrollment status to `active`) and `[Reject]` (sets status to `rejected`).

### 2.2 [MODIFY] Dynamic Score Entry Matrix (`src/pages/faculty/ScoreInput.jsx` & `GradeComponentsSetup.jsx`)
* **Objective**: Convert the static 6 Formative Assessments table into a polymorphic matrix.
* **UI & Components**:
  * **Remove "Pending Setup"**: Eliminate dashboard blocked screens. Default columns are automatically seeded immediately when a class is created.
  * **Component Group Header**: Group columns under the parent component name. Automatically append **Total** and **Percentage (%)** columns at the end of a group if it has more than one active column.
  * **Add Activity Button & Modal**: Expose action buttons corresponding to customizable components (e.g. `[+ Add Class Standing Activity]`). Clicking this triggers an inputs modal prompting for:
    * **Title** (e.g., "Quiz 1")
    * **Max Items** (e.g., 20)
    * **Description / Guideline** (e.g., "Covers Chapter 1...")
  * **Score Input Settings**: Add a settings icon beside columns to adjust maximum points without locking score entry blocks.

---

## 3. College Office Portal Tasks

### 3.1 [MODIFY] Student Section Modifier (`src/pages/office/StudentSections.jsx`)
* **Objective**: Replace the blank stub page with a functional lookup and section modifier tool.
* **Database Connection**: Queries `users` and updates `section_id` in the database.
* **UI & Components**:
  * Search lookup input to locate a student by ID number or name.
  * Card rendering selected student's profile details.
  * **Section Dropdown**: Pre-loads sections under the office's department.
  * **Modifier Action**: Allows the admin to select a block section or select `"Irregular"` (updates `section_id` to null in the database).

---

## 4. System Admin Portal Tasks

### 4.1 [MODIFY] User Management Directory & Form (`UserList.jsx` & `UserForm.jsx`)
* **Objective**: Re-introduce the UI handling for irregular student section mappings from the legacy `sage2` code.
* **UI & Component Changes**:
  * **Dropdown Configuration (`UserForm.jsx`)**: In the student's Block Section selector, include the static option: `<option value="Irregular">Irregular Student</option>`.
  * **Table Label Styling (`UserList.jsx`)**: If the student's `section_id` is null, display the section label as `"Irregular"` using the amber badge style:
    ```jsx
    stud.section === 'Irregular' 
      ? 'bg-amber-50 text-amber-700 border border-amber-100 rounded px-2.5 py-0.5 text-xs font-semibold' 
      : 'bg-slate-100 text-slate-600 rounded px-2.5 py-0.5 text-xs font-semibold'
    ```
  * **Manual Class Enrollments**: Ensure class list enrollments support manual registration of these irregular/unassigned students.

### 4.2 [NEW] Grade Computation Templates Builder (`src/pages/admin/GradeComputationsList.jsx`)
* **Objective**: Allow administrators to configure dynamic grading formula weights centrally.
* **Database Connection**: Manages rows in `grade_computations` and `grade_computation_components`.
* **UI & Components**:
  * Grid list of formula templates (e.g. General Education, Maritime Lecture).
  * Interactive form builder to add grading components (e.g., Exams weight 40%, Class Standing weight 50%, Character weight 10%), validating that the total weights sum to 100%.

### 4.3 [NEW] Departments & Dean Management (`src/pages/admin/DepartmentsList.jsx`)
* **Objective**: Allow administrators to manage colleges and assign Dean accounts.
* **Database Connection**: Queries `departments` and updates Dean associations in the `users` directory.
* **UI & Components**:
  * List of college departments with Dean profiles linked.
  * Form inputs to register new departments and update the bound Dean user ID.

---

## 5. Technical Debt & Code Clean-Up

### 5.1 Math Engine Centralization
* **File to Create**: `src/lib/gradingMath.js`
* **Details**: Abstract the copy-pasted `getTransmutedGrade` scale formula into this single file. Import and use it across all student, faculty, and dean portals to eliminate rounding bugs.

### 5.2 Remove Dead Modules
* **Details**: Delete `src/lib/mockDb.js` to ensure the codebase remains clean and completely reliant on Supabase client calls.

---

## 6. Required Database Changes

To support the dynamic addition of columns and customizable quizzes in the score entry sheets, run the following SQL script inside the Supabase SQL editor:

```sql
-- 1. Create class_activities table to store column metadata
CREATE TABLE class_activities (
    activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_record_id UUID REFERENCES class_records(class_record_id) ON DELETE CASCADE,
    component_id UUID REFERENCES grade_computation_components(component_id) ON DELETE CASCADE,
    term term_period NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    max_score DECIMAL(6,2) NOT NULL CHECK (max_score > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add activity_id to draft_scores to link student score records to dynamic columns
ALTER TABLE draft_scores ADD COLUMN activity_id UUID REFERENCES class_activities(activity_id) ON DELETE CASCADE;

-- 3. Create foreign key index to optimize grade queries
CREATE INDEX idx_draft_scores_activity_id ON draft_scores(activity_id);
```
