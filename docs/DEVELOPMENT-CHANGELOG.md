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
