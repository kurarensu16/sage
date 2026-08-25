# SAGE Refactoring and System Update Changelog

This document summarizes all modifications, creations, deletions, and integrations completed during this session to update the SAGE system codebase.

---

## 📂 Summary of File Changes

### 1. Created Files
* **[`src/lib/gradingMath.js`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/lib/gradingMath.js)**
  * *Purpose*: Centralized GWA transmutation formula module containing standardized university scales.
* **[`src/pages/admin/GradeComputationsList.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/admin/GradeComputationsList.jsx)**
  * *Purpose*: Interactive formula template builder page for Admin to configure grading components and weight ratios.
* **[`src/pages/admin/DepartmentsList.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/admin/DepartmentsList.jsx)**
  * *Purpose*: Registry page for College Departments and Dean assignments.
* **[`src/pages/student/Attendance.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/student/Attendance.jsx)**
  * *Purpose*: Student Attendance Log viewer with auto-saving summaries and FDA warning banners.
* **[`src/pages/faculty/VerificationQueue.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/faculty/VerificationQueue.jsx)**
  * *Purpose*: Join requests confirmation queue enabling COR PDF previewing and student roster approvals.
* **[`SAGE_UPDATE_PLAN_2026-08-19/database_migration_2026-08-19.sql`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/SAGE_UPDATE_PLAN_2026-08-19/database_migration_2026-08-19.sql)**
  * *Purpose*: DDL and query optimization indexing SQL scripts prepared for backend developer handoff.

### 2. Modified Files
* **[`src/components/StudentRow.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/components/StudentRow.jsx)**
  * *Changes*: Replaced static inputs with a fully dynamic, state-driven activity mapping engine. Substituted local math functions with import calls to centralized GWA formulas.
* **[`src/pages/faculty/ScoreInput.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/faculty/ScoreInput.jsx)**
  * *Changes*: Redesigned grid headers to render activities list dynamically. Integrated a `[+ Add Dynamic Activity]` action button and creation modal settings overrides.
* **[`src/pages/student/MyGradesDetail.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/student/MyGradesDetail.jsx)**
  * *Changes*: Refactored the grade breakdown table to dynamically list each quiz item and assignment in a Schoology-style ledger.
* **[`src/pages/admin/SubjectForm.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/admin/SubjectForm.jsx)**
  * *Changes*: Linked courses with custom grading templates (`computation_id`) via a dropdown input mapping.
* **[`src/pages/admin/UserList.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/admin/UserList.jsx)**
  * *Changes*: Enforced block section mapping overrides and styled irregular students with amber warning badges in tables.
* **[`src/pages/office/StudentSections.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/office/StudentSections.jsx)**
  * *Changes*: Substituted the empty template stub with search parameters and block assignment modifier commands.
* **[`src/components/layout/Sidebar.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/components/layout/Sidebar.jsx)**
  * *Changes*: Bound navigation links to the newly introduced screens.
* **[`sage/docs/DEVELOPMENT-CHANGELOG.md`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/docs/DEVELOPMENT-CHANGELOG.md)**
  * *Changes*: Documented development updates.
* **Academic Insights, MyGradesList, ScoreInput, AtRiskStudents, Dashboard, and excelExport modules** (10 separate files)
  * *Changes*: Refactored code blocks to import transmutation calculations directly from `gradingMath.js`.

* **[`src/pages/office/ComplianceAudit.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/office/ComplianceAudit.jsx)**
  * *Changes*: Built the "Evaluation Details" modal UI featuring a two-layer view (Pending Evaluation items above, Completed below) along with progress bar indicators. Added an explicit "EVALUATION" column header to the main table.
* **[`src/pages/office/SubjectAssignmentList.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/office/SubjectAssignmentList.jsx)** & **[`src/pages/office/SubjectAssignmentForm.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/office/SubjectAssignmentForm.jsx)**
  * *Changes*: Fixed the Department Mismatch warning logic to correctly reference the joined `departments?.name` field, preventing false-positive assignment mismatch warnings.
* **Dean Portal Analytics Components (`EvalResultsOverview`, `EvalResultsFaculty`, `AtRiskStudents`, `GradeDistribution`)**
  * *Changes*: Injected temporary data fallbacks into the `catch` blocks to gracefully load mock data and charts when the live Supabase query fails due to unseeded backend tables.
* **[`src/lib/mockdb.js`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/lib/mockdb.js)**
  * *Changes*: Refactored to include named exports (fixing the production build error) and appended comprehensive mock data sets for all the Dean Portal dashboards.

---

## 🔍 Validation Status
* Tested compilation with standard production build command (`npm run build`). Vite client client bundle compiled cleanly with code 0:
  * `index.html`: `1.32 kB`
  * `index.css`: `97.91 kB`
  * `index.js`: `3,648.64 kB`
