# SAGE — Audit Log Implementation Plan
**Document Type:** Phased Development Plan  
**Status:** Pending Implementation  
**Created:** August 27, 2026  
**Author:** Antigravity AI  
**References:** `SAGE_AUDIT_LOG_COVERAGE_REPORT_2026-08-27.md`

---

## Overview

This document provides a detailed, developer-ready implementation guide for adding the **6 missing audit log entries** identified in the SAGE Audit Log Coverage Report. Each phase contains exact file paths, current code context, line numbers where changes should be made, recommended code snippets, and notes on potential risks or edge cases.

> **Ground Rule:** All audit log entries must use the shared `logActivity()` utility from `src/lib/auditLog.js` and the `resolveActorName()` helper to ensure consistent actor name resolution across all portals.

```javascript
// Standard imports required for every file that needs audit logging:
import { logActivity, resolveActorName } from '../../lib/auditLog';
// Note: useAuth() must already be imported to provide `user` and `profile`
```

---

## Phase 1 — HIGH PRIORITY (Implement First) 🔴

These 3 gaps involve sensitive academic data mutations with zero audit trail. They should be implemented immediately before any production use.

---

### GAP-001 | Faculty Attendance Save
**File:** `src/pages/faculty/ClassAttendance.jsx`  
**Estimated Effort:** 30 minutes  
**Risk Level:** Low — additive change only, no logic modification

#### Background
`ClassAttendance.jsx` has **two save pathways:**
1. **Auto-save (silent):** `handleSaveAttendanceSilent()` — fires via debounce every ~1.2s when roster changes. This runs silently in the background.
2. **Manual save:** `handleSaveAttendance()` at line 424 — called when faculty clicks the explicit "Save" button. This calls `handleSaveAttendanceSilent()` internally.

**Decision:** Log only on the **manual save (`handleSaveAttendance`)**, NOT on the auto-save. Auto-save debounces many times during a single session — logging every debounce would produce thousands of noise entries per class per session and render the audit log unusable.

#### What's Available in Scope at Line 424
At the point of `handleSaveAttendance()`, the following variables are available:
- `roster` — Array of student objects with `.status` (Present/Absent/Late/Excused)
- `selectedDate` — ISO date string `"YYYY-MM-DD"` of the attendance session
- `activeClass` — **Confirmed derived variable at line 91:** `const activeClass = classesList.find(c => c.id === selectedClass) || null;` — has `.code` (subject code) and `.section` (section name)
- `user` — Auth user object (from `useAuth()`, confirmed at line 24)
- `profile` is NOT in scope — the file uses `const { user } = useAuth()` only. Use `user?.email` directly as actor.

#### Import Changes Required
Add `logActivity` to imports at the top of the file. **Note:** `resolveActorName` is not needed here since `profile` is unavailable.

```javascript
// ADD to existing imports at line 18 (after supabase import):
import { logActivity } from '../../lib/auditLog';
```

#### Code Change — `handleSaveAttendance()` (Line 424)

**Current code (lines 423–434):**
```javascript
// Save attendance log manually (explicit Save Button)
const handleSaveAttendance = async () => {
  if (!selectedClass || roster.length === 0) return;
  setSaveStatus('saving');
  try {
    await handleSaveAttendanceSilent();
    showToast('Attendance records saved successfully.');
  } catch (err) {
    setSaveStatus('error');
    showToast('Failed to save attendance: ' + err.message, 'error');
  }
};
```

**After change:**
```javascript
// Save attendance log manually (explicit Save Button)
const handleSaveAttendance = async () => {
  if (!selectedClass || roster.length === 0) return;
  setSaveStatus('saving');
  try {
    await handleSaveAttendanceSilent();
    showToast('Attendance records saved successfully.');

    // === AUDIT LOG: Attendance Posted ===
    const presentCount = roster.filter(s => s.status === 'Present').length;
    const absentCount  = roster.filter(s => s.status === 'Absent').length;
    const lateCount    = roster.filter(s => s.status === 'Late').length;
    const excusedCount = roster.filter(s => s.status === 'Excused').length;
    const actorName    = user?.email || 'Faculty';
    const subjectCode  = activeClass?.code || 'N/A';
    const sectionName  = activeClass?.section || 'N/A';
    const displayDate  = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-PH', {
      timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric'
    });

    await logActivity(
      'Attendance Posted',
      `${actorName} saved attendance for ${subjectCode} — ${sectionName} on ${displayDate}. ` +
      `Present: ${presentCount} | Absent: ${absentCount} | Late: ${lateCount} | Excused: ${excusedCount}.`,
      actorName
    );
    // ====================================

  } catch (err) {
    setSaveStatus('error');
    showToast('Failed to save attendance: ' + err.message, 'error');
  }
};
```

#### Edge Cases to Watch
- If `activeClass` is null (no class selected), the log will show `N/A` for subject/section — acceptable fallback.
- The date formatting adds `T00:00:00` to avoid timezone-off-by-one when interpreting the ISO date string as midnight local time.
- Do NOT log inside `handleSaveAttendanceSilent()` — that function is called repeatedly by the auto-save debounce.

---

### GAP-002 | Dean Approves Grade Unlock Request
**File:** `src/pages/dean/GradePostingStatus.jsx`  
**Estimated Effort:** 45 minutes  
**Risk Level:** Medium — needs additional data fetch to build a descriptive log message

#### Background
`handleApproveUnlock()` at line 115 runs two Supabase updates:
1. Updates `unlock_requests` → `status: 'approved'`
2. Updates `posted_grades` → `is_locked: false`

The function only receives `classRecordId` as a parameter. To build a meaningful log message, we need the faculty name and subject/section for that class — which ARE already loaded in the component's `classrooms` state array.

#### What's Available in Scope at Line 115
- `user` — Auth user object (from `useAuth()`)
- `classrooms` — Array of classroom objects fetched from Supabase. Each classroom has:
  - `faculty.first_name`, `faculty.last_name`
  - `subject.code`, `subject.title`
  - `section.name`
- `classRecordId` — the specific class being unlocked

**`profile` is NOT in scope** — line 8 is `const { user } = useAuth()` only. Use `user?.email` as actor.

> **Verified:** `classrooms` array maps `class_record_id` → `.id` at line 85 (`id: c.class_record_id`). The find `c.id === classRecordId` in the log code is correct.

#### Import Changes Required
```javascript
// ADD to existing imports at line 4:
import { logActivity } from '../../lib/auditLog';
```

#### Code Change — `handleApproveUnlock()` (Line 115)

**Current code (lines 115–138):**
```javascript
const handleApproveUnlock = async (classRecordId) => {
  try {
    const resolvedAt = new Date().toISOString();
    const resolvedBy = user?.id;

    // 1. Resolve pending unlock requests in Supabase
    await supabase
      .from('unlock_requests')
      .update({ status: 'approved', resolved_by: resolvedBy, resolved_at: resolvedAt })
      .eq('class_record_id', classRecordId)
      .eq('status', 'pending');

    // 2. Unlock posted grades if locked
    await supabase
      .from('posted_grades')
      .update({ is_locked: false })
      .eq('class_record_id', classRecordId);

    // Refresh data
    await loadPostingData();
  } catch (dbErr) {
    console.error('Error approving unlock request:', dbErr);
  }
};
```

**After change:**
```javascript
const handleApproveUnlock = async (classRecordId) => {
  try {
    const resolvedAt = new Date().toISOString();
    const resolvedBy = user?.id;

    // 1. Resolve pending unlock requests in Supabase
    await supabase
      .from('unlock_requests')
      .update({ status: 'approved', resolved_by: resolvedBy, resolved_at: resolvedAt })
      .eq('class_record_id', classRecordId)
      .eq('status', 'pending');

    // 2. Unlock posted grades if locked
    await supabase
      .from('posted_grades')
      .update({ is_locked: false })
      .eq('class_record_id', classRecordId);

    // === AUDIT LOG: Grade Unlock Approval ===
    const classroom   = classrooms.find(c => c.id === classRecordId);
    const facultyName = classroom
      ? `${classroom.faculty?.last_name}, ${classroom.faculty?.first_name}`
      : 'Unknown Faculty';
    const subjectCode = classroom?.subject?.code || 'N/A';
    const sectionName = classroom?.section?.name || 'N/A';
    const deanActor   = user?.email || 'Dean';

    await logActivity(
      'Grade Unlock Approval',
      `Dean ${deanActor} approved grade unlock request for ${facultyName}'s ` +
      `class ${subjectCode} — Section ${sectionName}.`,
      deanActor
    );
    // ========================================

    // Refresh data
    await loadPostingData();
  } catch (dbErr) {
    console.error('Error approving unlock request:', dbErr);
  }
};
```

#### Edge Cases to Watch
- `classrooms` is built from `loadPostingData()`, so it will always be populated before the Dean sees the "Approve" button.
- The `classroom` find uses `c.id`. Verify that the `classrooms` array maps `class_record_id` to `.id` in the data mapping (check around line 60-90 of the file).
- Log is written **before** `loadPostingData()` refresh so that the classroom data is still in local state.

---

### GAP-003 | Dean Releases / Recalls Evaluation Results
**File:** `src/pages/dean/EvalResultsOverview.jsx`  
**Estimated Effort:** 30 minutes  
**Risk Level:** Low — clean toggle function with all needed data in scope

#### Background
`toggleReleaseStatus()` at line 126 receives `facultyId` and `currentStatus`. It then:
1. Toggles `is_released_to_faculty` on `evaluation_windows`
2. Updates local React state

The faculty list is already in state as `facultyList`, each item containing `firstName`, `lastName`, and `email`.

#### What's Available in Scope at Line 126
- `profile` — Dean's profile from `useAuth()`. Includes `profile.first_name`, `profile.last_name`, `profile.departments.name`
- `facultyList` — Array of faculty, each with `id`, `firstName`, `lastName`, `email`
- `facultyId` — The specific faculty being toggled
- `currentStatus` — Boolean, the current value of `is_released_to_faculty`
- `nextStatus = !currentStatus` — The new state after toggle

#### Import Changes Required
```javascript
// ADD to existing import at line 5 (after supabase import):
import { logActivity, resolveActorName } from '../../lib/auditLog';
```

**Verified:** `useAuth` is already imported at line 6. `user` must be added to the destructure:
```javascript
// Line 10 — confirmed current code:
const { profile } = useAuth();
// Change to:
const { profile, user } = useAuth();
```

> **Note:** `profile?.departments?.name` is safe — the `users` query at line 26–38 already joins `departments ( name )`, so `profile.departments.name` will be populated for the Dean.

#### Code Change — `toggleReleaseStatus()` (Line 126)

**Current code (lines 126–139):**
```javascript
const toggleReleaseStatus = async (facultyId, currentStatus) => {
  const nextStatus = !currentStatus;
  try {
    // Update Supabase evaluation_windows for this faculty
    await supabase
      .from('evaluation_windows')
      .update({ is_released_to_faculty: nextStatus })
      .eq('faculty_id', facultyId);

    setFacultyList(prev => prev.map(f => f.id === facultyId ? { ...f, isReleased: nextStatus } : f));
  } catch (err) {
    console.error('Error toggling release status:', err);
  }
};
```

**After change:**
```javascript
const toggleReleaseStatus = async (facultyId, currentStatus) => {
  const nextStatus = !currentStatus;
  try {
    // Update Supabase evaluation_windows for this faculty
    await supabase
      .from('evaluation_windows')
      .update({ is_released_to_faculty: nextStatus })
      .eq('faculty_id', facultyId);

    setFacultyList(prev => prev.map(f => f.id === facultyId ? { ...f, isReleased: nextStatus } : f));

    // === AUDIT LOG: Eval Results Release / Recall ===
    const faculty     = facultyList.find(f => f.id === facultyId);
    const facultyName = faculty
      ? `${faculty.lastName}, ${faculty.firstName}`
      : 'Unknown Faculty';
    const department  = profile?.departments?.name || 'Unknown Department';
    const actorName   = resolveActorName(profile, user);
    const actionVerb  = nextStatus ? 'released' : 'recalled';

    await logActivity(
      'Eval Results Release',
      `Dean ${actorName} ${actionVerb} evaluation results for ${facultyName} ` +
      `(${department}).`,
      actorName
    );
    // ================================================

  } catch (err) {
    console.error('Error toggling release status:', err);
  }
};
```

#### Edge Cases to Watch
- `facultyList` state is used to look up faculty name — this is safe since the toggle button only appears after the list is loaded.
- `profile?.departments?.name` requires Supabase to join `departments` on the `users` table query. Verify this join exists in the data loading query (check lines 26–38 of the file — it does: `departments ( name )`).
- The log correctly differentiates between "released" and "recalled" using `nextStatus`.

---

## Phase 2 — MEDIUM PRIORITY (Implement After Phase 1) 🟡

---

### GAP-004 | Term Management — Evaluation Window Toggle
**File:** `src/pages/admin/TermManagement.jsx`  
**Estimated Effort:** 20 minutes  
**Risk Level:** Low

#### Investigation Findings
After reviewing the full file, the **Semester Transition** (via RPC `perform_semester_transition`) is already logged at line 321 using **both** `supabase.from('activity_logs').insert()` directly AND `logActivity()`. This is redundant but not harmful.

However, `TermManagement.jsx` also has a secondary toggle: **`is_evaluation_open`** — a boolean on the `academic_terms` table that controls whether the evaluation window is open for the current term. This toggle IS shown in the UI (line 380 onward) but no `update()` Supabase call for it exists in the currently loaded file view.

#### Action Required
1. Search `TermManagement.jsx` for any button that toggles `is_evaluation_open` (look for buttons around lines 380–600 of the file).
2. If such a toggle exists and makes a Supabase `.update()` call, add a log entry:

```javascript
await logActivity(
  'Evaluation Window Toggle',
  `Admin ${actorName} ${nextEvalState ? 'opened' : 'closed'} the evaluation window for AY ${term.schoolYear} (${term.semester} Sem).`,
  actorName
);
```

3. Also note the duplicate direct insert at line 314 — **remove** the raw `supabase.from('activity_logs').insert()` call and keep only the `logActivity()` helper at line 321 for consistency.

---

### GAP-005 | Evaluation Form Deletion
**File:** `src/pages/office/EvalFormsList.jsx`  
**Estimated Effort:** 20 minutes  
**Risk Level:** Low

#### Investigation Findings
After reviewing `EvalFormsList.jsx` in full:
- There is **no publish/unpublish toggle** in this file. Forms are not published/unpublished — they are simply created, edited (via redirect to `EvalBuilder`), or deleted.
- **GAP-005 is partially incorrect.** The actual missing log here is the **Evaluation Form Deletion** on line 65.
- When a form is deleted, it removes the form and all its linked criteria from `evaluation_forms`. There is no audit log for this action.

#### Import Changes Required
```javascript
// ADD to existing imports at line 5-6:
import { useAuth } from '../../lib/AuthContext';
import { logActivity } from '../../lib/auditLog';
```

#### Destructure auth inside component:
```javascript
// ADD at the top of EvalFormsList() component body:
const { user, profile } = useAuth();
```

#### Code Change — `handleDeleteTemplate()` (Line 64)

**Current code (lines 64–72):**
```javascript
if (confirm(`Are you sure you want to delete the "${title}" evaluation template? This will erase all criteria fields.`)) {
  const { error } = await supabase
    .from('evaluation_forms')
    .delete()
    .eq('form_id', tmplId);

  if (error) throw error;
  loadTemplates();
}
```

**After change:**
```javascript
if (confirm(`Are you sure you want to delete the "${title}" evaluation template? This will erase all criteria fields.`)) {
  const { error } = await supabase
    .from('evaluation_forms')
    .delete()
    .eq('form_id', tmplId);

  if (error) throw error;

  // === AUDIT LOG: Eval Form Deletion ===
  const actorName = user?.email || 'Office Staff';
  await logActivity(
    'Eval Form Deletion',
    `${actorName} deleted evaluation form template "${title}".`,
    actorName
  );
  // =====================================

  loadTemplates();
}
```

> **Note for GAP-004 update:** `EvalFormsList.jsx` does NOT have a publish toggle. Update the audit report (`SAGE_AUDIT_LOG_COVERAGE_REPORT_2026-08-27.md`) to correct GAP-005 description from "Evaluation Form Publish/Unpublish" to **"Evaluation Form Deletion"**.

---

## Phase 3 — LOW PRIORITY (Optional) 🟢

---

### GAP-006 | Notification Deletion Logging
**Files:** 
- `src/pages/dean/Notifications.jsx` (line 120 — `.delete()`)
- `src/pages/faculty/Notifications.jsx` (line 120 — `.delete()`)
- `src/pages/office/Notifications.jsx`

**Estimated Effort:** 30 minutes (all 3 files)  
**Risk Level:** Very Low

#### Recommendation
This is optional and should only be implemented if the school requires **confirmed receipt** of system notifications for regulatory or HR compliance. The notification read/unread toggle (line 106, 136) should NOT be logged — only deletion.

If implemented, the pattern for each file is:
```javascript
await logActivity(
  'Notification Deleted',
  `${actorName} deleted a system notification.`,
  actorName
);
```

**Defer this until Phase 1 and Phase 2 are confirmed stable in production.**

---

## Implementation Checklist

```
Phase 1 — HIGH PRIORITY
[ ] GAP-001: ClassAttendance.jsx — Add import + log inside handleSaveAttendance()
[ ] GAP-002: GradePostingStatus.jsx — Add import + log inside handleApproveUnlock()
[ ] GAP-003: EvalResultsOverview.jsx — Add import + user destructure + log inside toggleReleaseStatus()
[ ] Verify all 3 files build and hot-reload correctly in local dev server
[ ] Commit: "feat(audit): add attendance, grade unlock, and eval release logs"

Phase 2 — MEDIUM PRIORITY
[ ] GAP-004: TermManagement.jsx — Locate is_evaluation_open toggle button and add log
[ ] GAP-004: TermManagement.jsx — Remove duplicate raw activity_logs insert at line 314
[ ] GAP-005 (Revised): EvalFormsList.jsx — Add import + log inside handleDeleteTemplate()
[ ] Update SAGE_AUDIT_LOG_COVERAGE_REPORT: Correct GAP-005 description
[ ] Commit: "feat(audit): add term toggle and eval form deletion logs"

Phase 3 — LOW PRIORITY (Defer)
[ ] GAP-006: dean/Notifications.jsx — Add deletion log (if required by compliance)
[ ] GAP-006: faculty/Notifications.jsx — Add deletion log (if required by compliance)
[ ] GAP-006: office/Notifications.jsx — Add deletion log (if required by compliance)
[ ] Commit: "feat(audit): add notification deletion logs"

Final
[ ] Push all changes to ghost branch
[ ] Open pull request to main
[ ] Update revision history in SAGE_AUDIT_LOG_COVERAGE_REPORT_2026-08-27.md
```

---

## Reference: `logActivity()` Utility

```javascript
// src/lib/auditLog.js
export async function logActivity(action, message, actor = 'System') {
  const { error } = await supabase.from('activity_logs').insert({ action, message, actor });
  if (error) console.error('[AuditLog] Failed to write activity log:', error);
}

export function resolveActorName(profile, user) {
  if (profile?.first_name && profile?.last_name) {
    return `${profile.first_name} ${profile.last_name}`;
  }
  return user?.email || 'System';
}
```

---

*Plan prepared by Antigravity AI — SAGE Dev Session — August 27, 2026*
