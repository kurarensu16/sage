# SAGE Development Changelog

> Auto-maintained log of all development updates and changes to the SAGE project.  
> Last updated: 2026-05-28 09:01 PHT

---

## Changelog Format

Each entry follows this format:
```
### [DATE] — [CATEGORY]
**Scope:** [files/modules affected]
**Summary:** [what changed and why]
**Files Modified:**
- `path/to/file.jsx` — description of change
```

---

## Log Entries

### 2026-08-19 — Centralized Math, New Portal Pages & Block Modifier Stubs
**Scope:** Admin, Faculty, Student, and College Office Portals
**Summary:** Consolidated transmutation grading logic across 10 files into a centralized module. Resolved missing page components for Attendance log, COR Verification Queue, Departments List, Grade computation template builder, and replaced the student sections modifier stub.
**Files Modified:**
- `src/lib/gradingMath.js` — [NEW] Centralized DYCI transmutation GWA calculation engine.
- `src/pages/student/Attendance.jsx` — [NEW] Student attendance log viewer showing FDA alarms at 4+ absences.
- `src/pages/faculty/VerificationQueue.jsx` — [NEW] Faculty dashboard queue displaying student COR PDF preview iframe and join requests action buttons.
- `src/pages/admin/GradeComputationsList.jsx` — [NEW] Grading formula template builder.
- `src/pages/admin/DepartmentsList.jsx` — [NEW] College department manager and Dean assignment page.
- `src/pages/office/StudentSections.jsx` — Replaced the blank placeholder page with student block section modifier lookup tool.
- `src/pages/admin/SubjectForm.jsx` — Linked subject creation fields to central grading formulas dropdown selector.
- `src/pages/admin/UserList.jsx` & `UserForm.jsx` — Styled irregular student section mappings with amber labels.
- `src/components/layout/Sidebar.jsx` — Added navigation routes linking to the newly introduced portal screens.
- `src/lib/mockDb.js` — [DELETED] Removed dead database mock.

### 2026-06-06 — Rollover, Irregular Student Management, and Attendance Integration
**Scope:** Admin, Faculty, Dean, Student Portals, Relational Database schema  
**Summary:** Implemented transactional semester transitions, enrolled irregular student support, daily class attendance sheets, and academic policy overrides (FDA locking). Connected the frontend pages directly to the Supabase PostgreSQL database.  
**Files Modified:**
- `src/pages/faculty/ClassAttendance.jsx` — Implemented daily attendance sheets, auto-saving, history quick links, and double-confirmation dialogs.
- `src/pages/faculty/ScoreInput.jsx` — Linked grade worksheet to count student absences and sync with attendance records.
- `src/components/StudentRow.jsx` — Enforced FDA rule locking GWA equivalent grades to 5.00 and disabling remarks selectors. Fixed Bad Request errors when upserting posted grades.
- `src/pages/admin/TermManagement.jsx` — Created layman-friendly transition wizard executing database transaction.
- `src/pages/admin/ClassManagementList.jsx` — Group-sorted manual enrollments and candidate filtering.
- `SAGE_CONTEXT.md` / `SAGE_DATABASE_SCHEMA.md` / `SAGE_Development_Phases.md` — Updated master documentation.

### 2026-05-28 — Project Initialization Audit
**Scope:** Full codebase  
**Summary:** Initial development audit completed. Project baseline documented.  
**Current State:**
- 38 page components across 5 role directories (admin: 15, faculty: 9, dean: 7, student: 7, public: 3)
- 5 layout/shared components
- 1 mock database (`mockDb.js` with localStorage)
- 1 utility file (`utils.js` — `cn()` helper)
- 0 Supabase integration
- 0 authentication guards
- 0 unit tests
- 0 loading/error state components

---

*New entries will be prepended above this line as development progresses.*
