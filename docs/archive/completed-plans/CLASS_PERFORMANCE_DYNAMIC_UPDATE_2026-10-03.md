# Class Performance Dynamic Grade Implementation Plan

**Date:** 2026-10-03
**Objective:** Re-align the `ClassPerformance.jsx` module so that it leverages the dynamic, database-driven grading formulas (via `riskEngine.js` and `classRoomService.js`) instead of a legacy unweighted average. It will accurately display live (tentative) grades while explicitly labeling them as tentative until officially posted.

---

## 1. Core Problem
Currently, the Class Performance report has two major discrepancies from the Score Sheet:
1. **Unweighted Average:** It calculates the "Overall Average" by taking a flat average of all graded activities, ignoring the dynamic database grading formulas (e.g., component weights).
2. **Strictly Official Data:** It only displays a GWA if it has been officially committed to the `posted_grades` table. Live, "Saved" drafts on the Score Sheet are ignored, causing the report to look outdated or incorrect (e.g., showing a 2.75 Midterm grade when the live Score Sheet shows a 5.00 Final grade).

## 2. Solution Architecture
We will use the **Single Source of Truth (SSOT)** approach. Instead of duplicating grading math inside `reportsService.js`, we will hook into `getClassPriorityRoster` (from `classRoomService.js`), which already fetches the dynamic grading configurations and computes real-time tentative grades.

---

## 3. Implementation Steps

### Step 1: Expose Tentative Data in `classRoomService.js`
Modify `getClassPriorityRoster()` to expose the un-transmuted Semestral Grade (SG) percentage so the report has a numerical value to display.

**Changes:**
- Add `sg_percentage: tentativeDetails.semesterResult?.sg ?? null` to the student payload.
- Add `is_complete: tentativeDetails.isComplete` to flag if all terms are finished.

### Step 2: Update Data Aggregation in `reportsService.js`
Connect the Class Performance dataset to the dynamic roster.

**Changes:**
- Import `getClassPriorityRoster` into `reportsService.js`.
- In `fetchClassReportDataset`, fetch the priority roster and map the data by `student_id`.
- In `aggregateByStudent`, remove the legacy `Math.round(totalPercentage / gradedCount)` unweighted math.
- Map the `overallPercentage` directly to the `sg_percentage` provided by the roster.
- Map the GWA to the `current_gwa` provided by the roster.
- Introduce an `isTentative` boolean flag: if the `gwaByStudent` (from `posted_grades`) is null but the roster has a computed GWA, `isTentative` becomes `true`.

### Step 3: UI & UX Updates in `ClassPerformance.jsx`
Make sure faculty clearly understand which grades are final and which are working drafts.

**Changes:**
- **Grid Headers:** Rename "Overall Average" to "Overall Grade (SG)" and "Official Grade (GWA)" to "Grade (GWA)".
- **Grid Cells:** If a student's record is marked `isTentative`, append a small, distinct badge (e.g., `<span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded">Tentative</span>`) next to their grade.
- **Excel Export:** Update the `exportClassPerformanceToExcel` function to append `(Tentative)` to the GWA value if it hasn't been officially posted.

---

## 4. Expected Outcome
- Faculty will see real-time, dynamic grade updates in the Class Performance report the moment they hit "Save" on the Score Sheet.
- The Overall Grade will accurately respect institutional grade weights from the database.
- The Student Risk module and Class Performance module will have identical, synchronized data.
- The distinction between working drafts and official records is preserved visually.
