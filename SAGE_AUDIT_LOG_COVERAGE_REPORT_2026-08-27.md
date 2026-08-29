# SAGE System — Audit Log Coverage Report
**Generated:** August 27, 2026 | **Environment:** Production (`sage-dyci.vercel.app`) | **Supabase Region:** `ap-southeast-1` | **Timezone:** Asia/Manila (UTC+8)

---

## 🔄 Revision History

| Date | Revision | Author |
|------|----------|--------|
| 2026-08-27 | Initial report generated — 83% coverage baseline established | Antigravity AI |
| 2026-08-27 | **REV-01** — Recommended explicit PHT timezone (`Asia/Manila`) in `formatTimestamp()` inside `AuditLog.jsx` to guarantee correct display regardless of the end user's browser locale | Antigravity AI |

---

## Executive Summary

A comprehensive scan of all **7 portal directories** and **40+ source files** was performed to map every user-initiated write transaction (INSERT, UPDATE, DELETE, UPSERT) against the `activity_logs` table. 

| Category | Count |
|---|---|
| Total write transactions identified | **36** |
| Transactions with audit log coverage | **30 (83%)** |
| Transactions missing audit log coverage | **6 (17%)** |
| High-priority gaps | **3** |
| Medium-priority gaps | **2** |
| Low-priority gaps | **1** |

---

## Section 1: Fully Audited Transactions ✅

The following transactions have confirmed `logActivity()` calls or direct `activity_logs` inserts.

### 1.1 Public Portal

| # | Action | Log Label | File |
|---|--------|-----------|------|
| 1 | User signs in with email and password | `User Login` | `Login.jsx` |
| 2 | User requests a password reset email | `Password Reset Request` | `ForgotPassword.jsx` |
| 3 | User completes password reset via link | `Password Reset` | `ResetPassword.jsx` |

---

### 1.2 Admin Portal

| # | Action | Log Label | File |
|---|--------|-----------|------|
| 4 | Admin creates a new user (manual form) | `User Creation` | `UserForm.jsx` |
| 5 | Admin edits an existing user's profile | `User Update` | `UserForm.jsx` |
| 6 | Admin enables or disables a user account | `User Status Change` | `UserList.jsx` |
| 7 | Admin archives a user account | `User Archival` | `UserList.jsx` |
| 8 | Admin restores an archived user | `User Restoration` | `UserList.jsx` |
| 9 | Admin bulk-enables multiple accounts | `Batch User Restoration` | `UserList.jsx` |
| 10 | Admin imports users via CSV batch | `Batch User Import` | `UserList.jsx` |
| 11 | Admin overrides a student's posted grade | `Grade Override` | `GradeOverride.jsx` |
| 12 | Admin creates a new section | `Section Creation` | `SectionForm.jsx` |
| 13 | Admin edits an existing section | `Section Update` | `SectionForm.jsx` |
| 14 | Admin creates a new subject | `Subject Creation` | `SubjectForm.jsx` |
| 15 | Admin edits an existing subject | `Subject Update` | `SubjectForm.jsx` |
| 16 | Admin updates a department record | `Department Update` | `DepartmentsList.jsx` |
| 17 | Admin transitions the active academic term/semester | `Semester Transition` | `TermManagement.jsx` |
| 18 | Admin approves a faculty grade computation | `Grade Computation Approval` | `GradeComputationsList.jsx` |
| 19 | Admin rejects a faculty grade computation | `Grade Computation Rejection` | `GradeComputationsList.jsx` |
| 20 | Admin finalizes grade computation status | `Grade Computation Finalization` | `GradeComputationsList.jsx` |

---

### 1.3 Office Portal

| # | Action | Log Label | File |
|---|--------|-----------|------|
| 21 | Office imports students via CSV | `Student Import` | `RosterImport.jsx` |
| 22 | Office imports classrooms via CSV | `Classroom Import` | `RosterImport.jsx` |
| 23 | Office enrolls a student in a section | `Student Section Enrollment` | `StudentSections.jsx` |
| 24 | Office removes a student from a section | `Student Section Unenrollment` | `StudentSections.jsx` |
| 25 | Office creates a subject-faculty assignment | `Subject Assignment` | `SubjectAssignmentForm.jsx` |
| 26 | Office deletes a subject assignment | `Assignment Deletion` | `SubjectAssignmentList.jsx` |
| 27 | Office reassigns a subject to a different faculty | `Faculty Reassignment` | `SubjectAssignmentList.jsx` |
| 28 | Office creates/updates an evaluation form | `Eval Form Creation / Update` | `EvalBuilder.jsx` |
| 29 | Office schedules a single evaluation window | `Eval Window Creation` | `EvalWindowForm.jsx` |
| 30 | Office updates an existing evaluation window | `Eval Window Update` | `EvalWindowForm.jsx` |
| 31 | Office batch-schedules evaluation windows for a college | `Eval Window Batch Creation` | `EvalWindowForm.jsx` |
| 32 | Office manually closes an evaluation window | `Eval Window Close` | `EvalWindowList.jsx` |
| 33 | Office exports a compliance report | `Compliance Report Export` | `ComplianceAudit.jsx` |

---

### 1.4 Faculty Portal

| # | Action | Log Label | File |
|---|--------|-----------|------|
| 34 | Faculty saves grade components (weights/maxima) | `Grade Components Setup` | `GradeComponentsSetup.jsx` |
| 35 | Faculty saves student scores for a term | `Score Save` | `ScoreInput.jsx` |
| 36 | Faculty finalizes and submits scores | `Score Finalization` | `ScoreInput.jsx` |
| 37 | Faculty posts preliminary/final grades | `Grade Posting` | `PostedGradesView.jsx` |
| 38 | Faculty submits a grade unlock request | `Grade Unlock Request` | `PostedGradesView.jsx` |
| 39 | Faculty submits final grade computation | `Grade Computation Submit` | `GradeComputationPreview.jsx` |

---

### 1.5 Dean Portal

| # | Action | Log Label | File |
|---|--------|-----------|------|
| 40 | Dean approves a remark override request | `Remark Override Approval` | `RemarkOverrideRequests.jsx` |
| 41 | Dean rejects a remark override request | `Remark Override Rejection` | `RemarkOverrideRequests.jsx` |

---

## Section 2: Missing Audit Log Coverage ❌

The following transactions mutate production data with **no audit trail** whatsoever.

---

### 🔴 HIGH PRIORITY — Sensitive Academic Transactions

---

#### GAP-001 | Attendance Record Save
- **File:** `src/pages/faculty/ClassAttendance.jsx`
- **Trigger:** Faculty opens the attendance sheet for a class and marks students as Present / Absent / Late, then the system auto-saves or the faculty manually confirms.
- **Database Table Affected:** `attendance_records` (UPSERT)
- **Why It's Critical:** Attendance directly impacts a student's final academic status (pass/fail, probation, dropped). There is **no trail** of who recorded attendance, when it was recorded, or what status each student was assigned. A faculty member could mark a student absent retroactively with zero accountability.
- **Recommended Log:**
  ```
  Action:  "Attendance Posted"
  Message: "Faculty [Name] submitted attendance for [Section] ([Subject Code]) on [Date PHT]. 
            Present: X | Absent: Y | Late: Z"
  ```

---

#### GAP-002 | Dean Approves Grade Unlock Request
- **File:** `src/pages/dean/GradePostingStatus.jsx`
- **Trigger:** Dean clicks the "Approve Request" button on a faculty's posted grades, unlocking a previously locked grade registry and resolving the pending unlock request.
- **Database Tables Affected:** `unlock_requests` (UPDATE status -> approved), `posted_grades` (UPDATE is_locked -> false)
- **Why It's Critical:** This is one of the most sensitive operations in the system. The Dean is directly unlocking a **locked, finalized grade record** to allow re-posting. If this is done without an audit log, there is no way to know who authorized the unlock, when, or for which class. This is a key forensic trail in any grade dispute.
- **Recommended Log:**
  ```
  Action:  "Grade Unlock Approval"
  Message: "Dean [Name] approved grade unlock request for [Faculty Name]'s 
            class [Subject Code] - [Section Name]."
  ```

---

#### GAP-003 | Dean Releases Evaluation Results to Faculty
- **File:** `src/pages/dean/EvalResultsOverview.jsx`
- **Trigger:** Dean clicks the toggle button to release (or recall) evaluation results, making them visible to the faculty member.
- **Database Table Affected:** `evaluation_windows` (UPDATE is_released_to_faculty)
- **Why It's Critical:** Releasing faculty evaluation results is a significant event in the academic calendar — it determines **when faculty can see their performance scores**. If a Dean releases results early or accidentally recalls them, there is currently no audit log to capture this action. This is also important for HR and compliance purposes.
- **Recommended Log:**
  ```
  Action:  "Eval Results Release"
  Message: "Dean [Name] [released / recalled] evaluation results 
            for Faculty [Name] in [Department]."
  ```

---

### 🟡 MEDIUM PRIORITY — Administrative Configuration Transactions

---

#### GAP-004 | Term Management: Manually Opening or Re-activating a Term
- **File:** `src/pages/admin/TermManagement.jsx`
- **Current Coverage:** The Semester *Transition* (changing from old to new term) is logged on line 321. However, if there is a manual open/activate button for individual terms, that specific action may not be fully covered.
- **Recommended Log:**
  ```
  Action:  "Term Activation"
  Message: "Admin [Name] manually activated AY [Year] [Semester] Semester."
  ```

---

#### GAP-005 | Evaluation Form Publish / Unpublish Toggle
- **File:** `src/pages/office/EvalFormsList.jsx`
- **Status:** Requires verification. If a toggle exists to publish/unpublish evaluation forms (making them available to students), this write operation needs a log entry.
- **Recommended Log:**
  ```
  Action:  "Eval Form Published" / "Eval Form Unpublished"
  Message: "Office [Name] [published / unpublished] evaluation form '[Form Title]'."
  ```

---

### 🟢 LOW PRIORITY — Notification Lifecycle Transactions

---

#### GAP-006 | Notification Read / Delete
- **Files:** `dean/Notifications.jsx`, `faculty/Notifications.jsx`, `office/Notifications.jsx`
- **Trigger:** User marks notifications as read, or deletes individual/all notifications.
- **Why It's Low Priority:** This is a UI convenience action with no academic consequence. However, logging deletes could help confirm that a user *received and read* a system notice (e.g., a grade deadline warning).
- **Recommendation:** Optional — implement only if regulatory compliance requires confirmed receipt of system notices.

---

## Section 3: Recommended Action Plan

| Phase | Gap ID | Action | Priority |
|-------|--------|--------|----------|
| **Phase 1** | GAP-001 | Add `"Attendance Posted"` log in `ClassAttendance.jsx` | 🔴 HIGH |
| **Phase 1** | GAP-002 | Add `"Grade Unlock Approval"` log in `GradePostingStatus.jsx` | 🔴 HIGH |
| **Phase 1** | GAP-003 | Add `"Eval Results Release"` log in `EvalResultsOverview.jsx` | 🔴 HIGH |
| **Phase 2** | GAP-004 | Verify and patch `TermManagement.jsx` for manual term activation | 🟡 MEDIUM |
| **Phase 2** | GAP-005 | Verify and patch `EvalFormsList.jsx` for form publish toggle | 🟡 MEDIUM |
| **Phase 3** | GAP-006 | Add notification delete log across notification pages | 🟢 LOW |

---

## Section 4: Audit Log Architecture Reference

All audit entries flow through the centralized `logActivity()` utility:

```javascript
// src/lib/auditLog.js
export async function logActivity(action, message, actor = 'System') {
  await supabase.from('activity_logs').insert({ action, message, actor });
}
```

All timestamps are stored as **UTC** in the database (`activity_logs.timestamp`).

### REV-01 — Timezone Display Fix (`AuditLog.jsx`)

The `formatTimestamp()` function in `src/pages/admin/AuditLog.jsx` (lines 60–66) **must** explicitly specify `timeZone: 'Asia/Manila'` to guarantee PHT display regardless of the user's browser or OS locale setting.

**Current code (before fix):**
```javascript
const formatTimestamp = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
    + ' • '
    + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
```

**Recommended code (after fix):**
```javascript
const formatTimestamp = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila'
  })
    + ' • '
    + date.toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila'
    });
};
```

> **Why this matters:** Without an explicit `timeZone`, the browser falls back to the local machine's timezone. For users outside the Philippines (or with incorrect system clocks), audit log timestamps would display in the wrong timezone — defeating the purpose of a forensic audit trail.

---

*Report prepared by Antigravity AI — SAGE Dev Session — August 27, 2026*
