# SAGE — Codebase Refactoring Progress Checklist

This checklist tracks the implementation progress of all frontend refactoring and page creations defined in **[SAGE_IMPLEMENTATION_PLAN.md](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/SAGE_UPDATE_PLAN_2026-08-19/SAGE_IMPLEMENTATION_PLAN.md)**. 

The focus is strictly on the **frontend dynamic UI updates** (which can be safely tested using local state or current API mappings). Database changes are moved to the final phase for your backend developer.

---

## 📋 Overall Progress Summary

- [x] **Phase 1: Math Centralization & Clean-up** `(100%)`
- [x] **Phase 2: Portal Stubs & Admin Dropdowns** `(100%)`
- [x] **Phase 3: Faculty Dynamic Score Grid (State-Driven)** `(100%)`
- [x] **Phase 4: Student Schoology-style Detail Ledger (State-Driven)** `(100%)`
- [x] **Phase 5: Backend SQL Database Migration (Handoff to Developer)** `(100%)`

---

## 🛠️ Step-by-Step Task Checklist

### Phase 1: Core Clean-up & Math Centralization
- [x] Create central math utility file at [src/lib/gradingMath.js](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/lib/gradingMath.js)
- [x] Replace duplicate `getTransmutedGrade` function in [src/components/StudentRow.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/components/StudentRow.jsx)
- [x] Replace duplicate `getTransmutedGwa` function in [src/components/ExportPreviewModal.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/components/ExportPreviewModal.jsx)
- [x] Replace duplicate function in [src/pages/student/AcademicInsights.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/student/AcademicInsights.jsx)
- [x] Replace duplicate function in [src/pages/student/MyGradesDetail.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/student/MyGradesDetail.jsx)
- [x] Replace duplicate function in [src/pages/student/MyGradesList.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/student/MyGradesList.jsx)
- [x] Replace duplicate function in [src/pages/faculty/ScoreInput.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/faculty/ScoreInput.jsx)
- [x] Replace duplicate function in [src/pages/faculty/GradeComputationPreview.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/faculty/GradeComputationPreview.jsx)
- [x] Replace duplicate function in [src/pages/dean/AtRiskStudents.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/dean/AtRiskStudents.jsx)
- [x] Replace duplicate function in [src/pages/dean/Dashboard.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/dean/Dashboard.jsx)
- [x] Replace duplicate function in [src/lib/excelExport.js](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/lib/excelExport.js)
- [x] Refactor legacy module file `src/lib/mockdb.js` to use named exports and contain Dean portal datasets

### Phase 2: Portal Stubs & Admin dropdowns
- [x] Bind grading computation dropdown inside [src/pages/admin/SubjectForm.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/admin/SubjectForm.jsx)
- [x] Create templates builder page at [src/pages/admin/GradeComputationsList.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/admin/GradeComputationsList.jsx)
- [x] Create Departments & Dean registry page at [src/pages/admin/DepartmentsList.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/admin/DepartmentsList.jsx)
- [x] Add static option `<option value="Irregular">Irregular Student</option>` to dropdown in [src/pages/admin/UserForm.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/admin/UserForm.jsx)
- [x] Add irregular amber badge rendering list column styling in [src/pages/admin/UserList.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/admin/UserList.jsx)
- [x] Replace Student Sections Modifier stub in [src/pages/office/StudentSections.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/office/StudentSections.jsx)
- [x] Create Attendance Log Page at [src/pages/student/Attendance.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/student/Attendance.jsx)
- [x] Integrate Sidebar link for Attendance page in system configurations
- [x] Create COR Verification queue at [src/pages/faculty/VerificationQueue.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/faculty/VerificationQueue.jsx)
- [x] Integrate Sidebar link for COR Verification queue page

### Phase 3: Faculty Dynamic Score Grid (State-Driven)
- [x] Refactor [src/pages/faculty/ScoreInput.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/faculty/ScoreInput.jsx) table structure:
  - [x] Implement dynamically grouped columns based on computation templates
  - [x] Implement Totals and Percentage (%) sub-columns calculations in state
  - [x] Expose [+ Add Activity] buttons launching creation modals (updates grid state)
  - [x] Remove "Pending Setup" blocks from dashboard and auto-instantiate defaults
  - [x] Add configuration settings cog beside header columns for dynamic overrides

### Phase 4: Student Schoology-style detail gradebook
- [x] Refactor [src/pages/student/MyGradesDetail.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/student/MyGradesDetail.jsx) grid layout to Schoology-style nested column list layout
- [x] Render custom quiz/activity titles, maximum points, and teacher guidelines dynamically

### Phase 5: Backend SQL Database Migration (Handoff to Developer)
- [ ] Run the database DDL commands in Supabase console to create `class_activities` table
- [ ] Add `activity_id` to `draft_scores` table using SQL alter command
- [ ] Create foreign key performance query index on `activity_id`
- [ ] **WARNING: Wipe/delete existing related data** (or execute fresh reset) to prevent schema mismatches
- [ ] Seed Mock Datasets for Testing (Users, Templates, Enrollments)
- [ ] **Faculty Portal Integrations**
  - [ ] Connect `ScoreInput.jsx` dynamic columns to `class_activities` table
  - [ ] Wire up `VerificationQueue.jsx` approval/rejection logic to update enrollment status
- [ ] **Student Portal Integrations**
  - [ ] Connect `MyGradesDetail.jsx` ledger to query `class_activities` and `student_activity_scores`
  - [ ] Wire up `Attendance.jsx` to query actual database meeting logs
- [ ] **Admin Portal Integrations**
  - [ ] Connect `SubjectForm.jsx` to update `computation_id` foreign keys
  - [ ] Connect `GradeComputationsList.jsx` template updates to Supabase tables
- [ ] **Dean Portal Integrations**
  - [ ] Remove `mockDeanFacultyData` fallbacks in `EvalResultsOverview.jsx`
  - [ ] Remove mock fallbacks in `AtRiskStudents.jsx`, `GradeDistribution.jsx`, etc.
  - [ ] Ensure RLS policies permit Dean role queries
- [ ] **Core Grading Logic**
  - [ ] Update `gradingMath.js` to implement Summer Term Period Compression (average only Midterm + Final)
