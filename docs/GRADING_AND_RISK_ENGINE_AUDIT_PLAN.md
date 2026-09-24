# ASPIRE v3.1→v4.0 System Audit & Implementation Plan: Grade Computation & Risk Engine

**Author**: Antigravity AI  
**Date**: September 23–24, 2026  
**Status**: ✅ COMPLETED  
**Target Repository**: `c:\Users\JC Gabriel\Downloads\New ASPIRE\sage`

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Issue
When a student has a **97% grade in Prelim** (and no scores encoded yet for Midterm, Semi-Final, or Final), the system flags the student as **Failed (5.00 GWA)** and **HIGH RISK** across the Score Sheet, Grade Computation Preview, Evaluate Students, and Overview Dashboard.

### 1.2 The Root Cause
Across `StudentRow.jsx`, `ScoreInput.jsx`, `GradeComputationPreview.jsx`, and `classRoomService.js`:
1. Terms without encoded scores evaluate to `0%` rating.
2. The Semestral Grade (`SG`) formula unconditionally computes:
   $$\text{MR} = \frac{\text{Prelim (97)} + \text{Midterm (0)}}{2} = 48.5\%$$
   $$\text{TFR} = \frac{\text{SemiFinal (0)} + \text{Final (0)}}{2} = 0\%$$
   $$\text{SG} = \frac{\text{MR} + \text{TFR}}{2} = \frac{48.5 + 0}{2} = 24.25\%$$
3. $24.25\%$ transmutes to **5.00 GWA (Failed)** on the DYCI transmutation scale.
4. Because the GWA is $5.00$, `calculateAcademicRisk` applies a heavy GWA penalty, driving the risk score high and flagging top-performing students as **HIGH RISK**.

### 1.3 Resolution Status: ✅ RESOLVED
**Fix Applied**: `gradingMath.js` → `calculateSemestralGrade()` now uses Available-Term Non-Null Averaging. Unencoded terms return `null` and are excluded from all averages.

---

## 2. Technical Audit of the 3 Grade Posting Milestones — ✅ RESOLVED

The ASPIRE system supports 3 grade posting periods per DYCI academic guidelines:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ACADEMIC PROGRESSION MAP                        │
├───────────────────┬───────────────────────────┬────────────────────────┤
│ 1. MIDTERM RATING │ 2. TENTATIVE FINAL RATING │   3. SEMESTRAL GRADE   │
│       (MR)        │           (TFR)           │          (SG)          │
├───────────────────┼───────────────────────────┼────────────────────────┤
│ (Prelim + Midterm)│    (Semi-Final + Final)   │       (MR + TFR)       │
│        / 2        │            / 2            │          / 2           │
└───────────────────┴───────────────────────────┴────────────────────────┘
```

---

## 3. Bugs Discovered & Fixed During Audit

### 3.1 Ghost Student False Positive (Chloe Castro Case) — ✅ RESOLVED
**Bug**: In `classRoomService.js` and `riskUtils.js`, JavaScript `||` operator treated configured activity maximums of `0` as falsy, defaulting them to `20`. This inflated the denominator, tanking scores from 93 to a failing GWA.

**Fix**: Changed `||` to `??` (nullish coalescing) in all column configuration lookups:
```diff
- const actMax = termColSetup[key] || 20;
+ const actMax = termColSetup[key] ?? 0;
```

### 3.2 Scholarship Grade Floor Breach Applied Globally — ✅ RESOLVED
**Bug**: The `hasGradeBelow200` flag was being applied to ALL students, adding +15 risk points to anyone with a subject grade above 2.00. Per DYCI Handbook Sec 3.8.4 / 5.2.5.1, this rule applies ONLY to PL/scholarship candidates (GWA ≤ 1.75).

**Fix**: Moved the check inside `computeUnifiedRisk()` with a guard:
```javascript
const isPlCandidate = avgGwa !== null && avgGwa <= 1.75;
const hasGradeBelow200 = isPlCandidate && individualSubjectGrades.some(g => g > 2.00);
```

### 3.3 Stale Posted Grades Overriding Live Data — ✅ RESOLVED
**Bug**: The `posted_grades` table contained frozen snapshots of incorrect 5.00 GWA values from before the bug fixes. `classRoomService.js` prioritized these stale records over live calculations, causing the At-Risk page to show GWA 5.00 while the class record showed correct passing grades.

**Fix**: Cleared erroneous entries from the `posted_grades` table. The system now correctly falls back to dynamic grade computation.

### 3.4 Risk Engine Duplication — ✅ RESOLVED
**Bug**: Risk logic was split between `riskEngine.js` (core math) and `riskUtils.js` (wrapper + helpers). This created confusion about which file was the "source of truth."

**Fix**: Consolidated everything into a single `riskEngine.js`. The old `riskUtils.js` is now a thin re-export shim for backwards compatibility.

---

## 4. V4 Risk Matrix Transition — ✅ IMPLEMENTED

### Problem
The old risk matrix used percentage-based weights (35% GWA, 30% Assessment, 15% Attendance, 20% Trajectory) that produced a maximum effective GWA penalty of only 35 points. This meant a student with a **failing 5.00 GWA** could score as low as 45 points (Moderate/Watch), which is counter-intuitive and indefensible to a panel.

### Solution
The V4 Risk Matrix uses **direct point allocation anchored to the DYCI Transmutation Scale**:

| Factor | Max Points | Key Threshold |
| :--- | :--- | :--- |
| GWA Deficit | 60 | Failing GWA (5.00) = 60 pts → Instant HIGH RISK |
| Attendance / FDA | 50 | 4+ absences = 50 pts → FDA recommendation trigger |
| Missing Work | 15 | 3+ zeros on configured activities |
| Grade Decline | 10 | >15% drop between terms |

**Total potential**: 135 pts, **capped at 100**.

See `docs/ASPIRE_GRADING_AND_RISK_RULES_DEFENSE_GUIDE.md` for the complete V4 specification and panel defense arguments.

---

## 5. Verification Checklist

| # | Test Case | Expected Result | Status |
| :--- | :--- | :--- | :--- |
| 1 | Student with 97% Prelim, no other terms | GWA = 1.00, Risk = LOW (0) | ✅ |
| 2 | Student with GWA 5.00 (failing), 0 absences | Risk ≥ 50 (HIGH) | ✅ |
| 3 | Student with GWA 2.25, 0 absences | Risk ~12 (MODERATE Watch) | ✅ |
| 4 | Student with GWA 1.50, 4 absences | Risk = 50 (HIGH — FDA trigger) | ✅ |
| 5 | Student with GWA 3.00 (borderline), 4 absences | Risk = 75 (CRITICAL) | ✅ |
| 6 | Chloe Castro (unconfigured activities) | GWA = 1.50, Risk = LOW | ✅ |
| 7 | All portals show consistent risk levels | Dean = Faculty = Admin = Student | ✅ |
