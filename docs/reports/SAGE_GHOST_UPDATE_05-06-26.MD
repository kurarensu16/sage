# SAGE GHOST UPDATE LOG — 05-06-2026

This document registers all recent core changes, enhancements, and system design/database updates completed in the SAGE (Smart Academic Grading & Evaluation) application workspace.

---

## 📂 Summary of File Changes

| File Path | Type of Change | Purpose / Description |
| :--- | :--- | :--- |
| [SAGE_DATABASE_SCHEMA.md](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/SAGE_DATABASE_SCHEMA.md) | **Modified** | Updated schema for `posted_grades`, added `unlock_requests` table, ERD updates, and enum additions (`fda`, `dropped`). |
| [capstone-system-design-v2.md](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/docs/design/capstone-system-design-v2.md) | **Modified** | Updated system architecture diagrams description, processes (P3, P7), DFD components, and screens (S20, S27, S30, S31, S32). |
| [App.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/App.jsx) | **Modified** | Added router mapping for the new Dean Remark Override Requests page. |
| [Sidebar.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/components/layout/Sidebar.jsx) | **Modified** | Added **Remark Requests** navigation item with a dynamic badge indicating pending requests under the Dean Portal section. |
| [StudentRow.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/components/StudentRow.jsx) | **Modified** | Removed the Action column. Implemented a debounced (800ms) automatic localStorage save mechanism (`sage_scores_{classCode}_{studentId}`) with clean UI indicator animations (☁ Saving… / ✓ Saved). Added grade logic: `INC` sets grade to failing (`5.00`); switching from `INC` to `Passed` caps the maximum grade at `3.00` (grace Pass). Standardized color-coding to style `fda`, `inc`, `drop`, `fail` in distinct premium red. |
| [GradePostingStatus.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/dean/GradePostingStatus.jsx) | **Modified** | Added the top-level **Dean's Registry Unlock Override Dashboard** enabling active override control per milestone. |
| [ClassRecordsList.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/faculty/ClassRecordsList.jsx) | **Modified** | Adjusted Actions card layouts to display both "Input Scores" and "View Posted" buttons side-by-side. |
| [Dashboard.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/faculty/Dashboard.jsx) | **Modified** | Removed deprecated mock items or unnecessary handlers. |
| [GradeComputationPreview.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/faculty/GradeComputationPreview.jsx) | **Modified** | Removed the Action column header and improved the milestone selective posting modal UI. |
| [ScoreInput.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/faculty/ScoreInput.jsx) | **Modified** | Removed the Action column header from the grading tables. |
| [PostedGradesView.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/faculty/PostedGradesView.jsx) | **Modified** | Removed the Action column header. Added a brand-new **"Request Remark Change"** flow for locked posted grades where faculty can select a student, provide a mandatory explanation note, and submit to the Dean. |
| [RemarkOverrideRequests.jsx](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/dean/RemarkOverrideRequests.jsx) | **New (Untracked)** | Core page for the Dean to review, approve/unlock, or reject pending remark override requests with real-time audit logs and stats. |

---

## 🛠️ Detailed Change Logs

### 1. Database Schema & System Architecture Documentation
* **Entity Relationship Diagram & Tables**:
  * Incorporated `unlock_requests` as a first-class relational table in `SAGE_DATABASE_SCHEMA.md` detailing the relationship between `class_records` and `users` (requested/resolved by).
  * Extended `posted_grades` table columns to track `effective_grade`, `remarks_note`, `remarks_set_by`, `remarks_set_at` (audit-trail for remark changes), and `locked_milestones` (selective term lock state array).
  * Registered `fda` (Failure due to Absences) and `dropped` as valid enum remarks values.
* **System Design Spec (`capstone-system-design-v2.md`)**:
  * Added Process P7 descriptions for Dean Override capabilities.
  * Added Process P3 descriptions for Milestone Unlock Requests.
  * Updated UI screen definitions (S20, S27, S30, S31, S32) to formally define these new features.

### 2. Auto-Saving & Student Grading Experience (`StudentRow.jsx`)
* **Real-time Debounced Auto-Saving**:
  * Changes to scores, custom remarks, or notes trigger an automatic debounced local save (800ms of typing inactivity).
  * Grade edits write directly to `sage_scores_{classCode}_{studentId}` in `localStorage`.
  * Renders visual indicators in the Remarks column: `☁ Saving…` (pulsing text during debounce) and `✓ Saved` (emerald checkmark for 2s after successful storage flush).
  * Automatically restores the student's saved state on component mount, avoiding loss of data on refresh or navigation.
* **Remark-Grade Business Logic Rules**:
  * When a student's remark is assigned as **INC**, their grade is set to their failing grade (`5.00`).
  * If their remark is then switched to **Passed**, their maximum grade is capped at **`3.00`** (the standard grace passing limit).
* **Color-Coded Statuses**:
  * Enhanced CSS classes for badging. The statuses `fda`, `inc`, `drop` / `dropped`, and `fail` / `failed` are styled with custom, eye-catching text and background colors in shades of rose/red to quickly flag outstanding cases, rather than only highlighting failed students.

### 3. Faculty Remark Overrides (`PostedGradesView.jsx`)
* **"Request Remark Change" Flow**:
  * Added a prominent violet **"Request Remark Change"** button on the posted grades lock banner.
  * Opens an interactive modal where faculty select a student, specify the current remark, select the proposed new remark (`INC`, `FDA`, `Passed`, `Dropped`), and provide a **required reason note**.
  * Shows a special alert if a Grace Pass is requested (changing from failing/incomplete to `Passed` grade capped at `3.00`).
  * Writes the request object directly to `remark_override_requests` inside `localStorage`.

### 4. Dean Override Dashboard (`RemarkOverrideRequests.jsx` & `GradePostingStatus.jsx`)
* **Dashboard Control**:
  * Created `RemarkOverrideRequests.jsx` with search capabilities, status filters (All, Pending, Approved, Rejected), and stat cards detailing the volume of override cases.
  * Built an approval interface: Clicking **"Approve & Unlock"** transitions the request status to approved and issues a timestamped resolution.
  * Rejection interface: Permits the Dean to supply custom review notes explaining the rejection.
  * Links seamlessly from the Dean Sidebar, showing a red number indicator of currently pending requests.

### 5. Table Layout Optimization (Remove Action Column)
* **Visual Cleanup**:
  * Removed the redundant `Action` column headers (`<th>`) and cell entries (`<td>`) across `StudentRow.jsx`, `ScoreInput.jsx`, `PostedGradesView.jsx`, and `GradeComputationPreview.jsx` to reduce visual clutter and finalize layout alignment.

---

*Log compiled successfully on:* **2026-05-29**
