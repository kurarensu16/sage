# SAGE — Comprehensive System Audit & Grading Configuration Plan

This document presents the **finalized and corrected audit** of the **SAGE** system. It reviews the active codebase **[c:\Users\SAGE\sage](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage>)** against the official specifications in **[SAGE_SYSTEM_SCOPE.md](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/SAGE_SYSTEM_SCOPE.md>)** to identify all existing implementations, intentional naming abstractions, and critical functional gaps.

---

## 1. Executive Summary & Purpose

> [!IMPORTANT]
> **Audit Context & Scope Focus**:
>
> * **Primary Objective**: Verify that the core guidelines and specifications outlined in the **[SAGE_SYSTEM_SCOPE.md](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/SAGE_SYSTEM_SCOPE.md>)** are fully met and applied in the live **[sage](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage>)** codebase.
> * **Audit Baseline**: The **[SAGE_Roster_Import_Review.md](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/SAGE_Roster_Import_Review.md>)** document represents the audit accomplished by the user's team member, which focuses strictly on the mechanics of the College Office Portal (`RosterImport.jsx`) and System Admin Portal (`UserImport.jsx` / `UserList.jsx`).

Based on a complete file scanning and codebase audit:

1. **Roster / User Imports**: The system is functional but diverges slightly from the file structure outlined in the System Scope (using a modal inside [UserList.jsx](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/admin/UserList.jsx>) instead of a dedicated `UserImport.jsx` page).
2. **The Roster Import Review Findings**: All six issues identified in the review document are **valid** and represent areas where the codebase leaves mechanics implicit (such as static/weak credentials and lack of robust, granular error tracking for failed rows).
3. **Overall System-Scope Alignment**: The active codebase generally matches the architectural layout of the 5 portals and the 21-table database schema defined in the System Scope document, with minor implementation details consolidated into modular layouts (e.g., modals vs. separate pages).

> [!NOTE]
> **Static Demo Credentials Note**: The presence of the hardcoded password (`DemoPassword123!`) in the imports is intentionally disregarded for local testing purposes. This static fallback will be removed and replaced with secure invitation links or dynamic passwords prior to deployment to production or official staging environments.

---

## 2. Portal-by-Portal Frontend Page Verification & Gaps

Below is a complete verification mapping of every page specified in the **[SAGE_SYSTEM_SCOPE.md](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/SAGE_SYSTEM_SCOPE.md>)** against the active files in the **[sage](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage>)** codebase.

### 2.1 Student Portal (`/student/*`)

* **Dashboard** (`src/pages/student/Dashboard.jsx`) $\rightarrow$ **Met**. Displays GWA, enrolled course list, and clearance banner.
* **My Grades Ledger** (`src/pages/student/MyGradesList.jsx`) $\rightarrow$ **Met (with UI divergence)**. Displays official registrar grades ledger.
  * *Audit Gap*: Spec requested clearance blurring to show as `🔒.🔒🔒`. The codebase instead displays a single lock emoji (`🔒`) when evaluations are pending.
* **Grade Breakdown Detail** (`src/pages/student/MyGradesDetail.jsx`) $\rightarrow$ **Met**. Shows raw and weighted milestone scores.
* **Faculty Evaluation List** (`src/pages/student/EvalList.jsx`) $\rightarrow$ **Met**. Lists evaluation windows.
* **Faculty Evaluation Form** (`src/pages/student/EvalForm.jsx`) $\rightarrow$ **Met**. Evaluates rating criteria and comments.
* **AI Student Advisor** (`src/pages/student/AcademicInsights.jsx`) $\rightarrow$ **Met**. Counsel recommendations connected to Gemini API.
* **Academic Documents** (`src/pages/shared/Settings.jsx` tab) $\rightarrow$ **Met**. Handles PDF COR uploads.
* **Attendance Log** (`src/pages/student/Attendance.jsx`) $\rightarrow$ 🔴 **Missing / Unimplemented**. No file exists in the student directory. Students cannot track their attendance logs.

---

### 2.2 Faculty Portal (`/faculty/*`)

* **Dashboard** (`src/pages/faculty/Dashboard.jsx`) $\rightarrow$ **Met**. Displays active courses and tasks.
* **My Class Records** (`src/pages/faculty/ClassRecordsList.jsx`) $\rightarrow$ **Met**. Course list showing generated join codes.
* **Score Entry Matrix** (`src/pages/faculty/ScoreInput.jsx`) $\rightarrow$ **Met**. Unified score sheet supporting activity updates.
* **Grade Posting Submission** (`ScoreInput.jsx` / `GradeComputationPreview.jsx`) $\rightarrow$ **Met**. finalizes and locks milestones via modals.
* **Posted Grades Ledger** (`src/pages/faculty/PostedGradesView.jsx`) $\rightarrow$ **Met**. Shows locked grades and handles resubmission triggers.
* **Evaluation Results** (`src/pages/faculty/EvalResultsMy.jsx`) $\rightarrow$ **Met**. Anonymized student feedback review.
* **Roster / COR Verification** (`src/pages/faculty/VerificationQueue.jsx`) $\rightarrow$ 🔴 **Missing / Unimplemented**. No file exists. Professors cannot inspect student CORs or approve join requests (they must manually bypass/enroll them elsewhere).

---

### 2.3 Dean Portal (`/dean/*`)

* **Dean Dashboard** (`src/pages/dean/Dashboard.jsx`) $\rightarrow$ **Met**. Displays pending corrections and metrics.
* **Department Grade Matrix** (`src/pages/dean/GradePostingStatus.jsx`) $\rightarrow$ **Met**. Maps section posting statuses.
* **Grade Distribution** (`src/pages/dean/GradeDistribution.jsx`) $\rightarrow$ **Met**. Bar charts and grade brackets.
* **Remark Override Requests** (`src/pages/dean/RemarkOverrideRequests.jsx`) $\rightarrow$ **Met**. Handles correction review approval/rejection.
* **Evaluation Results Overview** (`src/pages/dean/EvalResultsOverview.jsx`) $\rightarrow$ **Met**. Evaluation release controls.
* **Faculty Evaluation Drilldown** (`src/pages/dean/EvalResultsFaculty.jsx`) $\rightarrow$ **Met**. Drilldown charts per professor.
* **At-Risk Students** (`src/pages/dean/AtRiskStudents.jsx`) $\rightarrow$ **Met**. Tracks FDA absence badges and low grade averages.
* **Summary Reports** (`src/pages/dean/SummaryReports.jsx`) $\rightarrow$ **Met**. Handles report exports and A4 printer setups.

---

### 2.4 College Office Portal (`/office/*`)

* **Department Dashboard** (`src/pages/office/Dashboard.jsx`) $\rightarrow$ **Met**. Stats sandboxed to uploader's college.
* **CSV Account Import** (`src/pages/office/RosterImport.jsx`) $\rightarrow$ **Met**. Bulk registers accounts.
* **Clearance Compliance Audit** (`src/pages/office/ComplianceAudit.jsx`) $\rightarrow$ **Met**. Checkoff list of student surveys.
* **Subject Assignment** (`src/pages/office/SubjectAssignmentList.jsx`) $\rightarrow$ **Met**. Links faculty to scheduled subjects.
* **Evaluation Builder** (`src/pages/office/EvalBuilder.jsx`) $\rightarrow$ **Met**. Questionnaire items manager.
* **Evaluation Windows** (`src/pages/office/EvalWindowList.jsx`) $\rightarrow$ **Met**. Window timelines configurations.
* **Student Section Modifier** (`src/pages/office/StudentSections.jsx`) $\rightarrow$ 🔴 **Blank Stub / Unimplemented**. The file is a blank placeholder page (927 bytes) with no code. Department Admins cannot modify block sections or set irregular statuses.

---

### 2.5 System Admin Portal (`/admin/*`)

* **Admin Dashboard** (`src/pages/admin/Dashboard.jsx`) $\rightarrow$ **Met**. Global database metrics.
* **Users Management** (`src/pages/admin/UserList.jsx`) $\rightarrow$ **Met**. Directory with user form inputs.
* **Bulk User CSV Import** (`UserList.jsx` modal) $\rightarrow$ **Met**. Embedded as a modal rather than a standalone page (matches spec requirements).
* **Subjects Catalog** (`src/pages/admin/SubjectList.jsx`) $\rightarrow$ **Met**. pre-loads courses and unit specifications.
* **Sections Management** (`src/pages/admin/SectionList.jsx`) $\rightarrow$ **Met**. Creates sections SY/semester.
* **System Audit Logs** (`src/pages/admin/AuditLog.jsx`) $\rightarrow$ **Met**. immutable ledger logs list.
* **Database & Settings** (`src/pages/admin/TermManagement.jsx`) $\rightarrow$ **Met**. Set active terms parameters.
* **Grade Computation Templates** (`src/pages/admin/GradeComputationsList.jsx`) $\rightarrow$ 🔴 **Missing / Unimplemented**. No file exists. Admin cannot configure dynamic grading weights via the frontend.
* **Departments Management** (`src/pages/admin/DepartmentsList.jsx`) $\rightarrow$ 🔴 **Missing / Unimplemented**. No file exists. College/department mappings must be manipulated directly in the database.

---

## 3. Core Database & Architecture Audit

### 3.1 Layman vs Developer Table Mapping

The mapping between layman terms in `SAGE_SYSTEM_SCOPE.md` (exposed on the UI) and developer tables in the database is intentional and aligns as follows:

* `profiles` $\rightarrow$ `users`
* `class_enrollments` $\rightarrow$ `enrollments`
* `audit_logs` $\rightarrow$ `activity_logs`
* `grade_change_requests` $\rightarrow$ `unlock_requests` and `remark_override_requests`
* `ai_counseling_logs` $\rightarrow$ `student_academic_insights`

### 3.2 Subject Pre-load & Grading Templates Gap

* **Critical Mismatch**: While `SAGE_DATABASE_SCHEMA.md` lists `computation_id` inside the `subjects` table, the admin's [SubjectForm.jsx](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/subjectform.jsx>) lacks a selection field.
* **Impact**: Subjects are saved without a grading template. The faculty portal is forced to fallback to a hardcoded preset (50% CS / 40% Exam / 10% Character) for all records, rendering central database formulas inoperable.

### 3.3 Math Engine & Transmutation Scale Duplication

* **Technical Debt**: The calculation logic `getTransmutedGrade` is duplicated across **10 different frontend files**.
* **Impact**: Introduces high maintenance risk. If the institution adjusts its transmutation scale, developers must update 10 different coordinates, which increases the likelihood of floating-point rounding bugs or calculation drift.

---

## 4. Planned Changes: Centralized Grading Systems Builder

To integrate centralized, flexible grading setups (using [Computation of Grades.docx](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/Computation%20of%20Grades.docx>) rules and [SAGE_Grading_System_Mock.xlsx](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/SAGE_Grading_System_Mock.xlsx>) configurations) without changing the code yet, here is the technical blueprint of the changes:

### 4.1 Required Changes (Files to Modify/Create)

```
SAGE Grading Refactoring Plan
├── 1. [NEW] Admin Template Builder (/admin/gradecomputationslist)
├── 2. [MODIFY] Admin Subject Form (SubjectForm.jsx)
├── 3. [MODIFY] Faculty Score Setup & Grading Sheets (GradeComponentsSetup.jsx, ScoreInput.jsx)
└── 4. [MODIFY] Student Grade Breakdown UI (MyGradesDetail.jsx)
```

#### A. [NEW] `src/pages/admin/GradeComputationsList.jsx`

* **Purpose**: Provide the Administrator with a dedicated UI to manage custom grading computations (create, update, or remove formulas and components).
* **UI Structure**:
  * Table of existing formulas (e.g., "General Education", "Maritime Lecture", "Health Sciences Theory", etc.).
  * Interactive builder to add components (e.g. Class Standing = 50%, Major Exams = 40%, Character/Values = 10%) validating that the total weights sum to 100%.

#### B. [MODIFY] `src/pages/admin/SubjectForm.jsx`

* **Changes**:
  * Fetch grading formulas (`grade_computations` table) inside the initial data-load `useEffect` block.
  * Add a form dropdown selector: `"Grading Computation Template"`.
  * Append `computation_id` inside the `payload` when calling `supabase.from('subjects').insert()/update()`.

#### C. [MODIFY] `src/pages/faculty/GradeComponentsSetup.jsx` & `Dashboard.jsx`

* **Changes**:
  * **Remove "Pending Setup"**: Eliminate the forced dashboard warnings and blocked status for new subjects.
  * **Auto-Instantiation**: When a classroom/section is scheduled, automatically initialize its columns and maximum item limits based on the defaults defined in the subject's bound grading template.
  * **Optional Adjustments**: The professor can click a settings icon to modify maximum points (e.g. changing a quiz from 20 to 30 points) without blocking score entry or rendering "Pending Setup" badges.

#### D. [MODIFY] `src/pages/faculty/ScoreInput.jsx` (Dynamic Score Entry Refactor)

* **Changes**:
  * **Dynamic Columns Grouping**: Group columns under the parent component name (e.g., Class Standing). Automatically append **Total** (sums raw scores of active columns) and **Percentage (%)** columns at the end of the group block when more than one column is present.
  * **Create Activity Prompt Modal**: Expose action buttons matching the template components (e.g. `[+ Add Class Standing Activity]`). Clicking this pops up a dialog prompting for: `Title`, `Max Points`, and `Description`.
  * **Dynamic Calculations**: Automatically recalculate Group Totals, Group Percentages, and final Term Grades based on the weight factors of the bound templates, adjusting when columns are added or modified.

#### E. [MODIFY] `src/pages/student/MyGradesDetail.jsx` (Student Grade Breakdown Refactor)

* **Changes**:
  * **Refactor Layout from Grid to Column List**: Remove the 6 card grids representing formative assessments inside the Class Standing component.
  * **Dynamic Content Loading**: The gradebook list items will load dynamically based on the assessments the professor actually created/added in their gradebook (supporting multiple activities/quizzes and exactly one Major Examination), rather than assuming a static format.
  * **Schoology-style Nested List**: Implement a clean vertical list table stack where categories (Class Standing, Examination, Character Rating) expand downward as vertical line items with scores, weight percentages, and contributions structured cleanly on the right side.
  * **Metadata Visibility**: Render the specific `Title` and `Description/Guideline` typed by the professor under each list row to provide immediate context during student grade consultations.

---

## 5. Key Database Updates

To support the dynamic creation of custom quizzes/activities under central components, the following schema addition is defined:

### New Table: `class_activities`

| Column Name         | Data Type        | Constraints / Description                                            |
| :------------------ | :--------------- | :------------------------------------------------------------------- |
| `activity_id`     | `UUID`         | Primary Key,`default gen_random_uuid()`                            |
| `class_record_id` | `UUID`         | Foreign Key`REFERENCES class_records(class_record_id)`             |
| `component_id`    | `UUID`         | Foreign Key`REFERENCES grade_computation_components(component_id)` |
| `term`            | `term_period`  | Enum (`prelim`, `midterm`, `semi_final`, `final`)            |
| `title`           | `VARCHAR(150)` | Custom name (e.g., "Quiz 1: Control Flow")                           |
| `description`     | `TEXT`         | Custom description guidelines                                        |
| `max_score`       | `DECIMAL(6,2)` | Maximum items/points count                                           |
| `created_at`      | `TIMESTAMP`    | Timestamp of column addition                                         |

The `draft_scores` table is then updated to reference `activity_id` instead of hardcoded column slots, ensuring a relational connection.

---

## 6. Developer Implementation Guide & Flaw Remediation Checklist

This guide outlines step-by-step developer actions. It incorporates structural solutions for all identified flaws and gaps to prevent breaking changes during system updates:

### 🛠️ DB & Setup Migration Checklist

#### 1. Table Naming Mismatch Safety Guard

* **The Flaw**: The database references the table name `users` but the scope calls it `profiles`; it uses `enrollments` instead of `class_enrollments`, and `activity_logs` instead of `audit_logs`.
* **Developer Action**: **Do NOT rename existing database tables** to match the scope layout. Doing so will break all queries across the entire React application. Maintain the database naming convention and treat the scope naming convention solely as a UI layman mapping layer.

#### 2. Centralized Math Engine Refactoring (Eliminating Duplicate Scaling)

* **The Flaw**: The transmutation grading formula (`getTransmutedGrade`) is duplicated in 10 different files.
* **Developer Action**:
  1. Create a new utility helper at `src/lib/gradingMath.js`.
  2. Implement the standard scale function:
     ```javascript
     export const getTransmutedGrade = (score) => {
       if (score >= 98) return 1.00;
       if (score >= 95) return 1.25;
       if (score >= 92) return 1.50;
       if (score >= 89) return 1.75;
       if (score >= 86) return 2.00;
       if (score >= 83) return 2.25;
       if (score >= 80) return 2.50;
       if (score >= 77) return 2.75;
       if (score >= 75) return 3.00;
       return 5.00; // Failed
     };
     ```
  3. Import this helper across all 10 frontend calculation scopes, removing the duplicate local functions.

#### 3. Database Schema Migration (SQL)

Run the following script to deploy the dynamic activities table and link scores:

```sql
-- Create class_activities metadata store
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

-- Safely link draft_scores to class_activities to support dynamic columns
ALTER TABLE draft_scores ADD COLUMN activity_id UUID REFERENCES class_activities(activity_id) ON DELETE CASCADE;
```

---

### 🖥️ Frontend Files Modification Instructions

#### 4. Subject Formulation & Grading Link

Update **[`SubjectForm.jsx`](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/admin/SubjectForm.jsx>)**:

* Query grading templates (`grade_computations`) in the loading `useEffect` block.
* Render a select element for template binding.
* Map `computation_id` into the payload during insert/update calls.

#### 5. Dynamic Grid Matrix Setup

Update **[`ScoreInput.jsx`](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/faculty/ScoreInput.jsx>)**:

* Fetch `grade_computation_components` for the subject.
* Build table headers dynamically based on these components. If a component has multiple columns, dynamically add a `Total` and `%` summary column at the end.
* Replace the `[Setup Grade Weights]` button on the dashboard. Instead, when a classroom starts, run a database hook to automatically seed the default columns (e.g. 20pt FAs / 40pt Exam) immediately.
* Add a configuration icon allowing the professor to optionally change the max items without locking score entry.

#### 6. Student Grade Breakdown UI (Grid to Column List)

Update **[`MyGradesDetail.jsx`](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/student/MyGradesDetail.jsx>)**:

* Delete the grid layout card display.
* Implement a vertical table stack mapping the nested categories (Class Standing, Exams) with guidelines, titles, and score values aligned on the right.

#### 7. Resolve Blank Student Sections Stub

Update **[`StudentSections.jsx`](<file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/office/StudentSections.jsx>)**:

* Replace the placeholder stub text.
* Create a simple student lookup dropdown.
* Include dropdown options to assign a block section or update the profile `section_id` to null/irregular in the database.

#### 8. Attendance Log Implementation

Create **`src/pages/student/Attendance.jsx`**:

* Query the `attendance_logs` table for the logged-in student.
* Group records by subject and display summaries (Present, Late, Absent).
* Add a yellow warning indicator if absences reach 4 or more.

#### 9. COR Verification Queue Implementation

Create **`src/pages/faculty/VerificationQueue.jsx`**:

* Query `enrollments` where `status = 'pending_verification'`.
* Display student requests.
* Render the PDF COR file inside an iframe, offering "Approve" (sets enrollment status to active) and "Reject" (sets status to rejected) buttons.

---

## 7. Key Recommendations & Action Plan

1. **Retain Dual-Naming Mapping**: Keep the current mapping as documented. The frontend handles the translation of database technical terms into readable terminology for academic administrators, deans, faculty, and students.
2. **Remove Dead Mock Files**: Safely remove `src/lib/mockDb.js` since all pages and auth managers have successfully completed transition to Supabase live clients.
3. **Consolidate Importer Modals**: While functional, compile the CSV parsing functions from [UserList.jsx](file:///c:/Users/JC Gabriel/Downloads/SAGE/sage/src/pages/admin/UserList.jsx) and [RosterImport.jsx](file:///c:/Users/JC Gabriel/Downloads/SAGE/sage/src/pages/office/RosterImport.jsx) into a single helper block to reduce duplication.
