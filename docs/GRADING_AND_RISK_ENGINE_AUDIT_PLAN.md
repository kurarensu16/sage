# ASPIRE v3.1 System Audit & Implementation Plan: Grade Computation & Risk Engine

**Author**: Antigravity AI  
**Date**: September 23, 2026  
**Status**: Approved Plan (Deferred Implementation)  
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

---

## 2. Technical Audit of the 3 Grade Posting Milestones

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

| Milestone Period | DB `grade_period` Value | Target Rating Formula | Effective Transmuted Grade | Score Sheet Availability |
| :--- | :--- | :--- | :--- | :--- |
| **1. Midterm Rating** | `midterm` | $\text{MR} = \text{Math.round}\left(\frac{\text{Prelim} + \text{Midterm}}{2}\right)$<br>*(or $\text{Prelim}$ if Midterm is unencoded)* | $\text{Transmute}(\text{MR})$ | Prelim / Midterm period |
| **2. Tentative Final Rating** | `tentative_final` | $\text{TFR} = \text{Math.round}\left(\frac{\text{SemiFinal} + \text{Final}}{2}\right)$<br>*(or $\text{SemiFinal}$ if Final is unencoded)* | $\text{Transmute}(\text{TFR})$ | Semi-Final / Final period |
| **3. Semestral Grade** | `final` | $\text{SG} = \text{Math.round}\left(\frac{\text{MR} + \text{TFR}}{2}\right)$<br>*(or $\text{MR}$ if TFR is unencoded)* | $\text{Transmute}(\text{SG})$ | Full Semester complete |

---

## 3. Detailed Architectural Solution

### Rule 1: Exclude Unencoded Terms from Averages
When a term has NO encoded scores (activities/exams unentered), it must be **excluded** from term averages. Unencoded terms must **NEVER** contribute $0\%$ to a student's running grade or GWA.

- **Prelim Period Only**: Student with $97\%$ Prelim $\rightarrow$ Running $\text{MR} = 97\%$, Running $\text{SG} = 97\%$, Running $\text{GWA} = 1.00$, Risk = **LOW (On Track)**.
- **Midterm Period**: Prelim $85\%$, Midterm $89\%$ $\rightarrow$ $\text{MR} = 87\%$, Running $\text{SG} = 87\%$, Running $\text{GWA} = 1.75$, Risk = **LOW**.
- **Incomplete Midterm**: Prelim $85\%$, Midterm empty $\rightarrow$ Running $\text{MR} = 85\%$, Running $\text{SG} = 85\%$.

---

## 4. Proposed Code Modifications

### 4.1 `src/lib/gradingMath.js`
Update `calculateSemestralGrade({ prelim, midterm, semiFinal, final, isSummer })`:
```javascript
export const calculateSemestralGrade = ({ prelim = null, midterm = null, semiFinal = null, final = null, isSummer = false }) => {
  const p = prelim !== null && !isNaN(prelim) ? parseFloat(prelim) : null;
  const m = midterm !== null && !isNaN(midterm) ? parseFloat(midterm) : null;
  const sf = semiFinal !== null && !isNaN(semiFinal) ? parseFloat(semiFinal) : null;
  const f = final !== null && !isNaN(final) ? parseFloat(final) : null;

  // Compute Midterm Rating (MR)
  let mr = null;
  if (p !== null && m !== null) {
    mr = Math.round((p + m) / 2);
  } else if (p !== null) {
    mr = p;
  } else if (m !== null) {
    mr = m;
  }

  // Compute Tentative Final Rating (TFR)
  let tfr = null;
  if (sf !== null && f !== null) {
    tfr = Math.round((sf + f) / 2);
  } else if (sf !== null) {
    tfr = sf;
  } else if (f !== null) {
    tfr = f;
  }

  // Compute Running Semestral Grade (SG)
  let sg = null;
  if (mr !== null && tfr !== null) {
    sg = Math.round((mr + tfr) / 2);
  } else if (mr !== null) {
    sg = mr;
  } else if (tfr !== null) {
    sg = tfr;
  }

  const gwa = sg !== null ? getTransmutedGrade(sg).toFixed(2) : '—';
  const remarks = sg !== null ? (parseFloat(gwa) <= 3.00 ? 'Passed' : 'Failed') : '—';

  return { mr, tfr, sg, gwa, remarks };
};
```

### 4.2 `src/components/StudentRow.jsx`
- Replace inline period rating averaging (`(prelimResult.rating + midtermResult.rating)/2`) with `calculateSemestralGrade`.
- Compute `getStatus` based on running GWA so 97% Prelim students receive the green `Safe` status badge instead of red `Failing`.

### 4.3 `src/pages/faculty/ScoreInput.jsx`
- Align draft saving and `posted_grades` payloads with the 3 milestone periods:
  - Midterm posting $\rightarrow$ `grade_period: 'midterm'`, `computed_grade: mr`, `effective_grade: transmute(mr)`.
  - Tentative Final posting $\rightarrow$ `grade_period: 'tentative_final'`, `computed_grade: tfr`, `effective_grade: transmute(tfr)`.
  - Semestral Grade posting $\rightarrow$ `grade_period: 'final'`, `computed_grade: sg`, `effective_grade: transmute(sg)`.

### 4.4 `src/lib/classRoomService.js`
- Update `getClassPriorityRoster` to use running GWA from `calculateSemestralGrade`.
- Pass running GWA to `calculateAcademicRisk`. A student with 97% in Prelim will have `approxGwa = 1.00` and `failing_count = 0` $\rightarrow$ producing **Risk Score 0 (Low Risk)**.

### 4.5 `src/pages/faculty/GradeComputationPreview.jsx` & `PostedGradesView.jsx`
- Update preview calculation matrices to display "Running Grade" tags when incomplete terms exist.
- Support viewing posted records across all 3 milestone periods (`midterm`, `tentative_final`, `final`).

---

## 5. Summary Table: Before vs. After Implementation

| Scenario | Student Score | Current Behavior (Flawed) | Corrected Behavior |
| :--- | :--- | :--- | :--- |
| **Prelim Period Only** | Prelim: 97%<br>Midterm: Unencoded | Midterm treated as 0%.<br>GWA = **5.00**<br>Risk = **HIGH (Failed)** | Uses Prelim rating.<br>GWA = **1.00**<br>Risk = **LOW (On Track)** |
| **Midterm Period** | Prelim: 85%<br>Midterm: 89% | Averages all 4 terms with 0s.<br>GWA = **5.00** | $\text{MR} = \frac{85+89}{2} = 87\%$.<br>GWA = **1.75**<br>Risk = **LOW** |
| **Posted Grades** | Milestone: Midterm | Forces 4-term SG posting. | Posts official **Midterm Rating (MR)** cleanly without locking score sheet edits. |

---

## 6. Verification Plan

When you are ready to implement this plan in the future:
1. **Test 97% Prelim Scenario**: Enter 97% in Prelim for a student on a score sheet with blank Midterm/Semi-Final/Final. Confirm GWA displays `1.00` and Risk displays `LOW - 0`.
2. **Test Milestone Posting**: Save and post grades under Midterm milestone. Confirm `posted_grades` table saves `grade_period: 'midterm'` with `effective_grade: 1.00`.
3. **Build Check**: Run `npm run build` to verify 0 errors.
