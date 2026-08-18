# SAGE Implementation Plan: Chapter 1 & 2 Alignment

**Target Repository**: `c:\Users\sadia\SAGE`  
**Reference Document**: `Chapter12_With_Diagrams.docx`  
**Date**: August 5, 2026  

---

## Executive Overview

This implementation plan defines the exact technical tasks required to align the **SAGE codebase** with the updated Capstone Thesis specifications documented in **`Chapter12_With_Diagrams.docx`** (Chapters 1 & 2).

---

## 1. User Review Required

> [!IMPORTANT]
> **5th Portal & Role Integration**: Introducing the `college_office` (Department Admin) role requires adding navigation items to `Sidebar.jsx`, updating `App.jsx` routes, and enhancing the Quick Demo Accounts Selector drawer.
>
> **Grading Engine Modifications**: Adding program-specific COG templates (Health Sciences, Maritime) and Summer (2-period) term branching will modify `ScoreInput.jsx`. Existing regular 4-period Gen Ed classes will remain default.

---

## 2. Open Questions

> [!NOTE]
> 1. Should the `college_office` demo user account be added directly to the Quick Demo Accounts Selector drawer (e.g., `office.ccs@sage.edu.ph`) alongside admin, dean, faculty, and student?
> 2. For the Semestral Grade (SG) column blurring in `MyGradesList.jsx`, should completing *any* pending teacher evaluation unlock the grade, or must *all* section evaluations for the term be completed?

---

## 3. Proposed Changes

### Component 1: College Office Portal (5th Role & Routing)

Adds the 5th user portal as specified in Chapter 1 & 2 (VTOC Figs 2.14 & 2.18), including CSV roster imports and evaluation clearance auditing.

#### [NEW] [Dashboard.jsx](file:///c:/Users/sadia/SAGE/src/pages/college_office/Dashboard.jsx)
- Department-scoped overview dashboard showing section counts, active faculty, enrollment totals, and clearance audit summary metrics.

#### [NEW] [RosterImport.jsx](file:///c:/Users/sadia/SAGE/src/pages/college_office/RosterImport.jsx)
- Bulk CSV import interface for student and faculty accounts. Auto-applies the department metadata (e.g. CCS Office $\rightarrow$ Computer Studies department).

#### [NEW] [ComplianceAudit.jsx](file:///c:/Users/sadia/SAGE/src/pages/college_office/ComplianceAudit.jsx)
- Evaluation completion audit table allowing College Office staff to search student progress and sign off on physical clearance sheets.

#### [MODIFY] [App.jsx](file:///c:/Users/sadia/SAGE/src/App.jsx)
- Register `/office/*` routes wrapped in `MainLayout` with `RoleGuard` allowing `college_office` / `department_admin`.

#### [MODIFY] [Sidebar.jsx](file:///c:/Users/sadia/SAGE/src/components/layout/Sidebar.jsx)
- Add navigation tree for `college_office`: Dashboard, Roster Import, and Clearance Audit.

#### [MODIFY] [AuthContext.jsx](file:///c:/Users/sadia/SAGE/src/lib/AuthContext.jsx)
- Include demo account `office.ccs@sage.edu.ph` (CCS Department Admin) in the Quick Demo Accounts Selector drawer.

---

### Component 2: Program-Specific COG Templates & Summer Term Branching

Updates the grading engine to support program COG formulas (Gen Ed, Health Sciences Theory/RLE, Maritime) and term branching (4-term Regular vs 2-term Summer).

#### [MODIFY] [ScoreInput.jsx](file:///c:/Users/sadia/SAGE/src/pages/faculty/ScoreInput.jsx)
- Add a read-only COG Template selector badge and Term Type selector (`Regular 4-Term` | `Summer 2-Term`).
- Support Health Sciences Theory weight distribution (30% Class Standing / 60% Exam / 10% Character).
- Branch calculations: Summer terms compute `Midterm Rating (MR)` and `Final Rating (TFR)` directly into `Semestral Grade (SG)`.

#### [MODIFY] [GradeComputationPreview.jsx](file:///c:/Users/sadia/SAGE/src/pages/faculty/GradeComputationPreview.jsx)
- Display active COG template rules and term type badges in the header of the grade preview spreadsheet.

---

### Component 3: Dual-Channel Faculty Evaluation & Retaliation-Drift Analytics

Implements anti-retaliation features specified in Chapter 1 & 2 (Level 1 DFD 5.2).

#### [MODIFY] [EvaluationsFeedback.jsx](file:///c:/Users/sadia/SAGE/src/pages/faculty/EvaluationsFeedback.jsx)
- Add channel toggle buttons: `[On-Time Only (Official)]`, `[Late Only (Informational)]`, `[Combined]`.
- Add **Retaliation-Drift Card** displaying score variance between on-time and late evaluation submissions.

#### [MODIFY] [FacultyEvaluations.jsx](file:///c:/Users/sadia/SAGE/src/pages/dean/FacultyEvaluations.jsx)
- Integrate department-wide Retaliation-Drift indicators to help Deans flag suspicious rating drops.

---

### Component 4: Student Semestral Grade Blurring & Acknowledgment Reset

Enforces evaluation-gated grade visibility and acknowledgment tracking.

#### [MODIFY] [MyGradesList.jsx](file:///c:/Users/sadia/SAGE/src/pages/student/MyGradesList.jsx)
- Apply CSS `blur-sm` to the `Semestral Grade (SG)` column if evaluation surveys are pending.
- Display prompt banner: *"Complete teacher evaluation survey to unlock final semestral grade"*.

#### [MODIFY] [SubjectDetail.jsx](file:///c:/Users/sadia/SAGE/src/pages/student/SubjectDetail.jsx)
- Add "Acknowledge Grade" action button.
- Auto-reset acknowledgment status to "Pending Re-acknowledgment" when a faculty member updates posted scores.

---

### Component 5: Absence Risk Warnings & Trusted Device MFA Simulation

Implements student retention badges and MFA login simulation.

#### [MODIFY] [StudentRow.jsx](file:///c:/Users/sadia/SAGE/src/components/StudentRow.jsx)
- Display a red "At-Risk: 4+ Absences" warning pill badge when student absence count is $\ge 4$.

#### [MODIFY] [AuthContext.jsx](file:///c:/Users/sadia/SAGE/src/lib/AuthContext.jsx)
- Add trusted device fingerprint simulation (`sage_trusted_device` in `localStorage`). Show OTP verification modal if logging in from an unrecognized browser environment.

---

## 4. Verification Plan

### Automated Tests
- Run ESLint to verify no syntax or formatting regressions:
  ```bash
  npm run lint
  ```

### Manual Verification
1. **Dev Server Verification**: Verify app builds and runs cleanly on port **5175**:
   ```bash
   npm run dev
   ```
2. **College Office Portal Test**: Switch to `office.ccs@sage.edu.ph` via Demo Accounts drawer $\rightarrow$ test CSV Roster Import and Clearance Audit tables.
3. **COG Templates Test**: In `ScoreInput.jsx`, switch between General Ed (50/40/10) and Health Sciences Theory (30/60/10) $\rightarrow$ verify recalculated ratings.
4. **Evaluation Blurring Test**: Log in as a Student $\rightarrow$ verify `SG` column is blurred until evaluation survey is submitted.
5. **Dual-Channel Evaluation Test**: Log in as Dean / Faculty $\rightarrow$ toggle On-Time vs. Late filters and inspect Retaliation-Drift card.
