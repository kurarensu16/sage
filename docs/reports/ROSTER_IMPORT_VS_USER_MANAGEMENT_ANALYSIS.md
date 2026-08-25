# SAGE — User Management vs. Department Roster Import Analysis

> **Document Type**: Architecture Decision Record & Capstone Defense Guide  
> **Audience**: SAGE Capstone Team & System Architects  
> **Target Roles**: System Administrator (`/admin/*`) vs. College Office / Department Admin (`/office/*`)  
> **Date**: August 25, 2026  
> **Status**: Approved Reference  

---

## 1. Executive Summary

This document addresses the structural and operational distinctions between **User Management** in the System Admin Portal and **Roster Import** in the College Office Portal. It details:
1. Why both features exist and how their institutional scopes differ.
2. Why batch CSV/Excel spreadsheet uploads are utilized for semester onboarding.
3. Architectural weaknesses, risks, and trade-offs of departmental user management.
4. Conflict resolution strategies (preventing cross-portal administrative collisions).
5. Ready-to-use Capstone Defense talking points.

---

## 2. Admin User Management vs. College Office Roster Import

The distinction between the two modules is rooted in **Role-Based Access Control (RBAC)** and **Institutional Separation of Concerns**:

| Architectural Dimension | System Administrator (`/admin/users`) | College Office / Dept. Admin (`/office/rosterimport`) |
| :--- | :--- | :--- |
| **Institutional Boundary** | **Global / System-Wide**: Full governance across all colleges (CCS, CBA, CAS, CED, etc.). | **Department-Sandboxed**: Strictly restricted to their assigned college (e.g., CCS Office). |
| **Role Authority** | Can create, modify, suspend, and archive **all 4 roles** (`admin`, `dean`, `faculty`, `student`). | Can **only** onboard **`student`** and **`faculty`** for their own department. Cannot access Admin/Dean accounts. |
| **Department Association** | Explicitly assigns or reassigns any user to any college in the institution. | **Implicit / Injected**: Any uploaded user is automatically tagged with the staff's `department_id`. |
| **Primary Operational Focus** | **Lifecycle & Security Governance**: Credential management, role changes, emergency deactivations, global audit logs. | **Semester Onboarding & Operations**: Ingesting approved class rosters and managing classroom allocations. |

```
                       [ SYSTEM ADMINISTRATOR ]
                                  │
          ┌───────────────────────┴───────────────────────┐
          ▼                                               ▼
  [ Global User Governance ]                      [ System Configurations ]
  • All Colleges (CCS, CBA, CAS)                  • Grading Formulas (COG)
  • All Roles (Admin, Dean, Faculty, Student)     • Terms & Academic Years
  • Account Suspensions & Master Overrides        • Master Course Catalog
                                  │
                                  ▼
                    [ COLLEGE OFFICE (DEPT ADMIN) ]
                                  │
          ┌───────────────────────┴───────────────────────┐
          ▼                                               ▼
  [ Department Roster Operations ]                [ Academic Logistics ]
  • Sandboxed to Specific College                 • Section Scheduling
  • Only 'Student' & 'Faculty' Roles              • Faculty Subject Assignments
  • CSV / Excel Batch Onboarding                  • Evaluation Clearance Auditing
```

---

## 3. Why Batch Uploads (CSV & Excel) Are Used

1. **Alignment with Central SIS / Registrar Workflows**:
   * Master student registrations and official class lists originate from the university's central Registrar or SIS.
   * Class rosters are exported in bulk as spreadsheets (**`.xlsx` / `.csv`**).
2. **Elimination of Administrative Bottlenecks**:
   * Manual single-account entry for thousands of students at the beginning of each semester is error-prone and inefficient.
   * Batch processing parses hundreds of records in seconds, automatically detecting ID patterns (`YYYY-XXXXX` for students, `FAC-YYYY-XXXXX` for faculty) and mapping students to their respective year levels and sections.
3. **Format Versatility**:
   * While labeled "CSV Import", the underlying implementation utilizes the `xlsx` parsing engine, enabling direct drag-and-drop ingestion of standard Microsoft Excel workbooks, comma-separated values, and raw clipboard text.

---

## 4. Real-World Operations & The "Department Roster" Upgrade

### The Operational Gap in Current Codebase
* **Admin Portal** has full CRUD capabilities: User Directory Table, Search/Filters, Single User Creation Modal ([UserForm.jsx](file:///c:/Users/sadia/SAGE/src/pages/admin/UserForm.jsx)), and Batch Import Modal.
* **College Office Portal** currently only has a standalone CSV dropzone ([RosterImport.jsx](file:///c:/Users/sadia/SAGE/src/pages/office/RosterImport.jsx)), with no directory table or single-user creation for late enrollees.

### Recommended Architectural Strategy: "Department Roster"
Upgrade `/office/rosterimport` into a comprehensive **Department Roster** page:
1. **Department Directory Table**: Filtered view of students and faculty belonging exclusively to that college.
2. **`[ + Add User ]` Modal**: Allows adding individual late enrollees or newly hired lecturers (with department locked).
3. **`[ 📥 Batch Import ]` Modal**: Retains spreadsheet drag-and-drop for full class lists.

---

## 5. Potential Weaknesses & Trade-Offs

| Weakness / Risk | Technical Root Cause | Mitigation Strategy |
| :--- | :--- | :--- |
| **Code Duplication** | Maintaining separate user tables/forms in `admin/` and `office/`. | Extract parsing and validation logic into a shared utility (`rosterImportHelper.js`). |
| **Cross-Department Leakage** | Row-Level Security (RLS) is currently disabled; scoping is handled in JavaScript. | Enforce strict `department_id` query constraints and backend Edge Functions for account writes. |
| **Dual Authority Collision** | Both Admin and Office modifying user account statuses simultaneously. | Implement **Hierarchical Locks** (see Section 6). |
| **Irregular Student Friction** | Cross-enrolled students taking subjects across different departments. | Restrict College Office scope to section enrollments rather than global account ownership. |

---

## 6. Strategies to Prevent Administrative Conflicts

When multiple administrative tiers have access to user accounts, conflicts can occur (e.g., Central IT suspends a student, but College Office reactivates them). The following mechanisms resolve these collisions:

### 1. Hierarchical Lock Pattern (`is_admin_locked` / Status Precedence)
* If **Central IT (Admin)** deactivates an account (e.g., disciplinary action, tuition hold), a `system_locked = true` flag is set.
* In the **College Office Portal**, status toggles for this account become disabled with an indicator:  
  🔒 *`Locked by Central IT (Admin Override)`*.
* Department staff cannot override a Superadmin lock.

### 2. Separation of Concerns: Global Account vs. Academic Enrollment
* **System Admin** governs the **Global User Identity** (`users.status` $\rightarrow$ `active`, `suspended`, `archived`).
* **College Office** governs **Classroom Enrollment** (`enrollments.status` $\rightarrow$ `enrolled`, `withdrawn`, `dropped`, `loa`).
* *Result*: A department can withdraw a student from their classes without corrupting the student's central system identity.

### 3. Granular Field-Level RBAC Matrix

```
┌──────────────────────────────┬───────────────┬──────────────────┐
│ Field / Action               │ System Admin  │ College Office   │
├──────────────────────────────┼───────────────┼──────────────────┤
│ Email & Password Reset       │ Full Access   │ Read-Only        │
│ Global Status (Active/Lock)  │ Full Access   │ Read-Only        │
│ College / Department Binding │ Full Access   │ Locked to Self   │
│ Section & Year Level         │ Full Access   │ Full Access      │
│ Classroom Enrollment Load    │ Full Access   │ Full Access      │
└──────────────────────────────┴───────────────┴──────────────────┘
```

### 4. Immutable Audit Trail Attribution
Every modification is recorded in `audit_logs` capturing `actor_id`, `actor_role`, `target_user_id`, and `action_type`, ensuring complete accountability across all portals.

---

## 7. Capstone Defense Reference Guide

### Q1: *"Why do you have user creation in both Admin and College Office portals?"*
> **Defense Answer**:  
> *"We follow standard institutional delegation. Central IT (System Admin) oversees system-wide governance, global accounts, and security policies. The College Office handles day-to-day academic logistics—such as onboarding semester class rosters and adding late enrollees—without requiring elevated root privileges over the entire institution."*

### Q2: *"Why is the College Office tool designed for CSV/Excel uploads instead of manual entry?"*
> **Defense Answer**:  
> *"At the start of every term, official class lists are exported in bulk from the University Registrar. Batch spreadsheet ingestion eliminates manual data-entry bottlenecks, reduces human error, and automatically derives section and year-level associations."*

### Q3: *"What prevents a College Office user from reactivating a student suspended by Central IT?"*
> **Defense Answer**:  
> *"We implement a Hierarchical Lock model. Actions performed by System Administrators carry higher permission precedence. When Central IT places an administrative lock or suspension on an account, reactivation controls are disabled within the College Office portal and can only be released by Central IT."*
