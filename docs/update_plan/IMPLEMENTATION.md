# ASPIRE — Master Implementation Plan & Technical Architecture Reference

> **Document Version:** 2.1.0  
> **Last Updated:** 2026-10-01  
> **Prepared by:** ASPIRE Core Engineering Team  
> **Based on:**
> - `docs/update_plan/ASPIRE_UNIFY_ACADEMIC_RULES_IMPLEMENTATION_AUDIT.md` (Implementation Audit & Pre-implementation Baseline)
> - `docs/update_plan/IMPLEMENTATION_CORRECTIONS.md` (Verified Corrections & Codebase Reality)
> - `docs/update_plan/Unify-Academic-Rules-Across-ASPIRE.md` (Confirmed Rules C1–C18, Stages A–E / Steps 0–22)
> - `docs/update_plan/Reports-and-Notifications-Analysis.md` (Reports & Notifications Gap Analysis)
> - `docs/update_plan/NOTIFICATION_DELIVERY_ARCHITECTURE.md` (Multi-Channel Delivery, Idempotency, Schema v2, Brevo SMTP)
> - `docs/update_plan/Reports-Module-Plan-Faculty-Side.md` (Faculty Reports Architecture, Datasets, Class Performance & Comparison)
> - `docs/update_plan/ASPIRE_DEV_VALIDATION_CHECKS_AND_REPORT_TEMPLATE.md` (Validation Gates & Verification Template)
> - Live Codebase State (HEAD: `db848f0`, working tree changes, migration `20261001090000_unify_academic_policy_templates.sql`)
>
> **Purpose:** Authoritative, end-to-end technical reference and execution roadmap across all phases.
> Complete all items in order — later steps depend strictly on earlier foundations.

---

## Executive Summary & Audit Baseline Reconciliation

### The Audit Baseline
The `ASPIRE_UNIFY_ACADEMIC_RULES_IMPLEMENTATION_AUDIT.md` audited commit `b71b83b` and recorded **0 of 22 execution steps applied**. That audit represents the clean pre-implementation baseline where:
- All 18 confirmed defects (C1–C18) were live in the codebase.
- The existing green `npm run verify:grading` run was identified as a **false readiness signal** (covering legacy 50/10/40 fallback behavior rather than unified academic policies).
- Stage A step 0 through Stage E step 22 were fully documented with line-by-line defect sites.

### Current Codebase Evolution
The repository has since moved to HEAD `db848f0` with active development in the working tree. Key components have been authored:
1. `src/lib/academicPolicy.js` has been created as the canonical policy module.
2. `supabase/migrations/20261001090000_unify_academic_policy_templates.sql` has been generated to enforce grading template consistency.
3. In `src/lib/riskEngine.js`, the GWA piecewise step-discontinuity curve at 2.00 (Rule C13) is implemented.
4. `SubjectForm.jsx` and `GradeComponentsSetup.jsx` have been updated to prevent NOT NULL violations and remove legacy template fallbacks.
5. In `gradingMath.js`, `calculateSemestralGrade` preserves `{ mr, tfr, sg, gwa, remarks }` and returns `{ termsExpected, termsEncoded, isComplete }`. `toEffectiveGradeForPosting` is implemented as a null guard conforming to Decision D3.

### Critical Implementation Rule
Before any new notification or reporting features can be reliably deployed, **the academic rules unification (Stages A through E) must be verified and fully consistent**. Grade posting write paths, completeness states, and attendance calculations feed directly into notifications and analytics.

---

# PART I — Academic Rules Unification & Audit Integration (Stages A–E / Rules C1–C18)

---

## SECTION 1: Stage A — Foundation & Core Engines (Steps 0–7)

### Step 0 — Database Migration for Grading Templates (Rules C14, C15)
**File:** `supabase/migrations/20261001090000_unify_academic_policy_templates.sql`  
**Problem:** `subjects.computation_id` was nullable, and a duplicate "General / Professional Education Scale" template existed in `grade_computations`.  
**Action:**
1. Backfill all subjects with `computation_id IS NULL` to point to the canonical template (`General Education Core`).
2. Repoint subjects assigned to the duplicate template to the canonical template.
3. Delete the duplicate template row.
4. Alter `subjects.computation_id` to `SET NOT NULL` and change foreign key to `ON DELETE RESTRICT`.
5. Add `UNIQUE` constraint on `grade_computations.name`.

> **UI Coupling & Execution Order Warning:**
> - Step 0 must be executed in the same pass as the UI fixes in `SubjectForm.jsx` and `GradeComponentsSetup.jsx`. If `SubjectForm` continues writing `computation_id || null`, every save will violate the NOT NULL constraint.
> - Step 0 must land before Step 3a (fail-closed formula resolution). Failing closed on missing formulas before backfilling database nulls will break grade calculation for those subjects.
> - Step 3a and Step 10a must land together: three render paths (`StudentRow.jsx:185`, `excelExport.js:89`, `ExportPreviewModal.jsx:31`) pass null formulas; they must receive real formulas before the engine fails closed.

---

### Step 1 — Canonical Academic Policy Module (Rules C1, C2, C6, C13)
**File:** `src/lib/academicPolicy.js` (Created)  
**Responsibilities:**
- Canonical transmutation ladder (75.00 -> 3.00, 99.00 -> 1.00).
- Plain-mean official GWA resolver (`resolveOfficialGwa`) and cohort mean (`computeStudentGwa`).
- President's List eligibility gate (`isPresidentsListEligible` / `getHonorTier`) enforcing 18-unit minimum, §3.8.4 floor (2.00), and no FDA/INC/Dropped.
- Attendance policy constants and status evaluator (`getAttendanceFlags`: Late = attended, Excused = attended, FDA threshold >= 4 unexcused absences).
- Unified risk score ranges and tier labels (`LOW` < 25, `MODERATE` 25–49, `HIGH` 50–74, `CRITICAL` 75+).
- Explicitly contains **no per-subject component weights** (weights belong strictly to database templates).

---

### Step 2 — Additive Completeness Fields in `gradingMath.js`
**File:** `src/lib/gradingMath.js`  
**Why:** Unencoded components or terms were defaulting to 0 / 5.00 / Failed / High Risk. The engine must distinguish "zero score" from "not yet encoded".

#### Task 2.1 — Add Fields to `calculateWeightedTermRating()` (line 348)
`calculateWeightedTermRating` already returns `isComplete` and `missingComponents`. Add the two missing fields from the existing normalized `contributions` array:
```js
// Add to calculateWeightedTermRating return object:
const encodedWeight = contributions
  .filter(c => c.hasData)
  .reduce((sum, c) => sum + (c.weight || 0), 0);

const ratingOnEncoded = encodedWeight > 0
  ? Math.min(100, Math.max(0, Math.round((rawRating / encodedWeight) * 100)))
  : null;

return {
  ok: true,
  rating: rawRating === null ? null : Math.min(100, Math.max(0, Math.round(rawRating))),
  rawRating,
  hasData,
  isComplete: missingComponents.length === 0,
  missingComponents,
  contributions,
  encodedWeight,     // sum of weights for components with data
  ratingOnEncoded,   // score normalized against encoded portion only
  error: null
};
```

#### Task 2.2 — `calculateSemestralGrade()` Completeness
Keep all existing fields (`mr`, `tfr`, `sg`, `gwa`, `remarks`) and add `{ termsExpected, termsEncoded, isComplete }`:
- Regular semester: `termsExpected: 4` (Prelim, Midterm, Semi-Final, Final).
- Summer term: `termsExpected: 2` (Midterm, Final).
- When `!isComplete`, `remarks` must be `'In Progress'`.

#### Task 2.3 — Export `WEIGHT_TOLERANCE` and `toEffectiveGradeForPosting`
`toEffectiveGradeForPosting` must be a **pure null-guard** conforming to Decision D3:
```js
export const WEIGHT_TOLERANCE = 0.01;

// Pure null-guard conforming to Decision D3 (does not block tentative milestone posting):
export const toEffectiveGradeForPosting = (rating) => {
  if (rating === null || rating === undefined || rating === '' || Number.isNaN(Number(rating))) {
    return null;
  }
  return toGwaOrNull(rating);
};
```

---

### Step 3 — Fix Confirmed `gradingMath.js` Bugs (Rules C3, C1)
1. **Rule C3 Bug (`gradingMath.js:498`):**  
   Existing: `if (isIrregular && units < 18)` — Regular students carrying under 18 units were silently exempted from the unit floor.  
   Correction: The 18-unit minimum for honors applies to **all** students:
   ```js
   if (units < 18) return { eligible: false, reason: 'Minimum 18 units required' };
   ```
2. **`getPresidentsListTier`:**  
   Delegate directly to `getHonorTier` in `academicPolicy.js`.

---

### Step 3a — Fail-Closed Grading Formula Resolution
**File:** `src/lib/gradingMath.js`  
**Action:**
- In `resolveGradingFormula`, remove the legacy fallback (`LEGACY_GRADING_COMPONENTS`).
- If `formula` is null or invalid, return `{ ok: false, error: 'NO_TEMPLATE_ASSIGNED' }`.
- Do not silently substitute 50/10/40.

---

### Step 4 — Risk Engine Completeness & Advising Thresholds (Rules C12, C13)
**File:** `src/lib/riskEngine.js`  
**Action:**
1. Check `isComplete` before generating high risk alerts. A student with partial prelim scores is **not** at risk of failure solely due to unencoded exams.
2. Re-derive advising thresholds from canonical attendance semantics in `academicPolicy.js`.

---

### Step 5 — Clean Dead Parameters from `calculateAcademicRisk` (Rule C12)
**File:** `src/lib/riskEngine.js`  
**Problem:** `failingSubjectsCount`, `majorExamAverage`, and `hasGradeBelow200` were destructured at `riskEngine.js:73-78` and never referenced anywhere in scoring logic (lines 80–175).  
**Action:**
- Remove the three dead parameters from the `calculateAcademicRisk` function signature and documentation.
- Update callers in `computeUnifiedRisk` and `classRoomService.js` to eliminate dead derivations.

---

### Step 6 — Delete Dead `riskUtils.js`
**Action:** Delete `src/lib/riskUtils.js`. Verify zero active imports remain repo-wide.

---

### Step 7 — Comprehensive Assertion Suite
**File:** `scripts/verifyGradingMath.js`  
**Action:**
- Replace the legacy 50/10/40 fallback assertion (`resolveGradingFormula(null) -> ok: true`) with fail-closed assertion (`ok: false`).
- Expand assertions (~50 total) covering:
  - Additive completeness fields (`encodedWeight`, `ratingOnEncoded`, `isComplete`, `missingComponents`).
  - Summer term 2-term expectation (`termsExpected === 2`).
  - Incomplete semester yields remark `'In Progress'`.
  - Null-safe grade posting (`toEffectiveGradeForPosting` returns `null` on incomplete/null).
  - President's List 18-unit rule applied to both regular and irregular students.
  - §3.8.4 subject floor (2.00).

---

## SECTION 2: Stage B — Libraries & Domain Logic (Steps 8–10b)

### Step 8 — Honors & President's List Unification (Rules C1/D1, C2, C3)
**Files:** `src/pages/student/AcademicInsights.jsx`, `src/pages/student/Dashboard.jsx`, `src/pages/student/MyGradesList.jsx`, `src/pages/dean/AtRiskStudents.jsx`  
**Actions:**
1. **Remove 1.45 ladder:** Remove arbitrary `1.45` cutoff and "1st/2nd Class Dean's Lister" tiers.
2. **Remove fabricated probabilities:** Remove hardcoded `dlProbability = 94` and `dlProbability = 85` from `AcademicInsights.jsx` (lines 634, 638, 676, 938, 1018). Never feed fabricated probabilities to AI advisor context.
3. **Fix §3.8.4 Subject Floor in `dean/AtRiskStudents.jsx:484`:**
   ```js
   // BEFORE: highestGradeItem.val > 1.75
   // AFTER (per §3.8.4 policy floor is 2.00):
   highestGradeItem.val > 2.00
   ```

---

### Step 9 — Attendance Semantics & Scope Correction (Rules C6, C10)
**File:** `src/pages/student/AcademicInsights.jsx` (lines 236–248)  
**Defects Corrected:**
1. **Scope error (C10):** Attendance was queried without `class_record_id` grouping, summing cross-course absences into single false-positive FDA warnings.  
   *Fix:* Group records by `class_record_id` and evaluate FDA per course.
2. **Late attendance (C6):** Late was half-credited (`lateAtt * 0.5`).  
   *Fix:* Late counts as present/attended for institutional attendance rate.
3. **Excused absences (C6):** Excused was omitted from numerator.  
   *Fix:* Excused sessions are recognized as attended and exempt from FDA penalty.

---

### Step 10 — GWA Risk Curve Recalibration (Rule C13)
**File:** `src/lib/riskEngine.js` (lines 91–104)  
**Why a continuous curve was rejected:** A continuous linear ramp leaves GWA 2.25 and 2.50 in `LOW`, contradicting the §3.3 zone table and Defense Guide Q4. Crossing 2.00 is categorical (it immediately breaches the §3.8.4 honors floor).  
**Correct Implementation (Step Discontinuity at 2.00):**
```js
if (gwa <= 2.00) {
  // Safe zone. 2.00 is the §3.8.4 subject floor — still honors-eligible.
  gwaPoints = 0;
  gwaDetail = `GWA ${gwa.toFixed(2)} — On track (honors eligible)`;
} else if (gwa <= 3.00) {
  // Watch zone. Step to 25 at band entry: crossing 2.00 is categorical,
  // so the band opens inside MODERATE (25–35 pts) per §3.3.
  gwaPoints = 25 + Math.round(((gwa - 2.00) / 1.00) * 10);
  gwaDetail = `GWA ${gwa.toFixed(2)} — Watch zone`;
} else {
  // Failing zone (3.01–5.00): opens inside HIGH (50–60 pts).
  gwaPoints = 50 + Math.round(((gwa - 3.01) / 1.99) * 10);
  gwaDetail = `GWA ${gwa.toFixed(2)} — Failing (below 75% cut-off)`;
}
```

Target test pins in `scripts/verifyGradingMath.js`:
- `2.00 -> 0 (LOW)`
- `2.01 -> 25 (MODERATE)`
- `2.25 -> 28 (MODERATE)`
- `2.50 -> 30 (MODERATE)`
- `3.00 -> 35 (MODERATE)`
- `3.01 -> 50 (HIGH)`
- `4.00 -> 55 (HIGH)`
- `5.00 -> 60 (HIGH)`

---

### Step 10a — Thread Formulas to Render Paths (Rules C14, C15)
**Files:** `src/components/faculty/StudentRow.jsx`, `src/lib/excelExport.js`, `src/components/faculty/ExportPreviewModal.jsx`  
**Action:** In all three files, replace `resolveGradingFormula(null, { formulaAssigned: false })` by passing the actual subject formula from the database/state. Failing closed without threading the formula causes these views to render blank.

---

### Step 10b — `getEnrollmentType` SQL Twin Alignment (Rule C18)
**File:** `src/lib/classRoomService.js` (lines 15–19)  
**Problem:** Evaluated `!classSectionId` to `'Regular'`, while database SQL migration (`20260606164500_add_attendance_and_semester_transition.sql`) evaluated to `'Irregular'`.  
**Action:** Align JavaScript function to match SQL twin:
```js
export function getEnrollmentType(studentSectionId, classSectionId) {
  if (!studentSectionId || !classSectionId) return 'Irregular';
  return studentSectionId === classSectionId ? 'Regular' : 'Irregular';
}
```
> **Behavior Note:** Any class with no `section_id` now evaluates to 'Irregular'. Check demo data to ensure sections are assigned.

---

## SECTION 3: Stage C — Write-Path Safety (Steps 11–13, Highest Consequence)

> **CRITICAL:** These paths persist data to the database. An unhandled null here writes `5.00` to a student's permanent transcript record.

### Step 11 — Null-Safe Grade Posting in Faculty Views
**Files:** `src/pages/faculty/ScoreInput.jsx` (lines 1374, 1384), `src/pages/faculty/GradeComputationPreview.jsx` (line 739)  
**Action:**
```js
// BEFORE:
const rawGWA = getTransmutedGrade(finalSG);
const effectiveGrade = getTransmutedGrade(computedTermGrade);

// AFTER (null-safe guard via toEffectiveGradeForPosting):
const rawGWA = toEffectiveGradeForPosting(finalSG);
const effectiveGrade = toEffectiveGradeForPosting(computedTermGrade);
```
Stop coercing `mr`, `tfr`, and `fRate` to `0` when components are unencoded.

---

### Step 12 — Grade Override Remarks & Display
**File:** `src/pages/admin/GradeOverride.jsx` (lines 165, 321)  
**Action:**
1. Replace inline ternary (`parsedGrade <= 3.00 ? 'passed' : 'failed'`) with canonical `toDbRemark(getRemarks(parsedGrade))`.
2. Fix status display at line 321. Stop reducing all non-`passed` records to "Failed". Display `Passed`, `Failed`, `Incomplete (INC)`, `FDA`, or `Dropped` accurately.

---

### Step 13 — Bare-Subscript Formula Substitution Guard
**Files:** `src/pages/dean/Dashboard.jsx` (lines 346, 540), `src/pages/dean/AtRiskStudents.jsx` (line 431)  
**Action:** Guard `classConfigMap[id]`. When a formula is missing, log a warning and mark status as unconfigured rather than silently falling back to 50/10/40.

---

## SECTION 4: Stage D — Read-Path Correctness (Steps 14–18b)

### Step 14 — Fix Student Dashboard (Worst Live Defect)
**File:** `src/pages/student/Dashboard.jsx` (lines 153, 155)  
**Defects Corrected:**
1. Line 153 read `e.subjects?.credit_units || 3.0` — `credit_units` does not exist on `subjects` (the column is `units`), silently pinning all course weights to 3.0.  
   *Fix:* Use `e.subjects?.units || 3.0`.
2. Line 155 displayed raw percentage `computed_grade` on a 1.00–5.00 GWA scale.  
   *Fix:* Display transmuted official grade resolved via `resolveOfficialGwa`.

---

### Step 14b — Fix the ~18 Scale-Comparison Sites Repo-Wide
**Files:** `dean/GradeDistribution.jsx:38-41`, `dean/Dashboard.jsx:50,331,411,530`, `SummaryReports.jsx:107,109,179,221`, `AtRiskStudents.jsx:411`, `MyGradesList.jsx`, `MyGradesDetail.jsx:249`, `AcademicInsights.jsx`.  
**Defect:** Comparing raw 0–100 percentage (`computed_grade`) against `3.00` cutoff, misclassifying passing students as Failed.  
**Fix:** Always resolve scale via `resolveOfficialGwa` before comparing against `3.00`.

---

### Step 15 — Canonical Plain-Mean GWA (Rule C11) & Reference Call Sites
**Files:** `src/lib/classRoomService.js` (lines 578–586), `MyGradesList.jsx:383-384,408`, `AcademicInsights.jsx:486-487,578-580`, `faculty/Dashboard.jsx:311-320`.  
**Actions:**
1. Migrate student views from credit-weighted averaging to plain-mean averaging (`computeStudentGwa`).
2. Relabel `faculty/Dashboard.jsx:311-320` to *"Average Term Rating (%)"*.
3. **PR #41 Protection:** In `classRoomService.js:getClassPriorityRoster`, preserve returning `home_section_id`, `enrollment_type`, and `is_irregular` so Irregular student badges are retained.

---

### Step 16 — Dean Dashboard Unified Risk Parameter Completeness
**File:** `src/pages/dean/Dashboard.jsx` (line 374)  
**Action:** Pass complete parameter context to `computeUnifiedRisk` (incorporating attendance, trajectory, and missing assignments), rather than truncating to 2-of-10 parameters (`avgGwa`, `failingCount`).

---

### Step 17 — Delete LocalStorage Absence Cache
**Files:** `src/pages/faculty/ScoreInput.jsx` (lines 187, 603), `src/components/faculty/StudentRow.jsx` (line 231), `src/pages/faculty/PostedGradesView.jsx` (line 201)  
**Action:** Remove local storage write/read cache for absences. Read authoritative attendance counts directly from Supabase `attendance_records`.

---

### Step 18 — Fix Class Attendance FDA Filter
**File:** `src/pages/faculty/ClassAttendance.jsx` (line 477)  
**Action:**
```js
// BEFORE (allowed 2 absences to pass the FDA filter):
if (statusFilter === 'fda') return student.absences >= 4 || student.absences >= 2;

// AFTER (enforces institutional FDA threshold >= 4, matching fdaCount):
if (statusFilter === 'fda') return student.absences >= 4;
```

---

### Step 18a — Remove Fabricated Attendance Data
**File:** `src/pages/student/Attendance.jsx` (lines 82–87)  
**Problem:** The file injected 4 hardcoded fake log entries dated 2026-08-13 through 2026-08-20 with invented remarks ("Arrived 10 mins late") whenever a class had no records.  
**Action:** Delete the fabricated fallback array entirely. Render clean empty state ("No attendance sessions recorded yet") when zero records exist.

---

### Step 18b — Per-Course Advising Attendance Aggregation
**File:** `src/lib/advisingEngine.js` (line 50)  
**Action:** Track attendance per course rather than summing across courses, preventing single-course absence accumulation from triggering global advising alerts.

---

## SECTION 5: Stage E — Consolidate, Documents & Phase 9 (Steps 19–22)

### Step 19 — Excel Export Formula-Aware Weights & Ladder
**File:** `src/lib/excelExport.js` (lines 377–380, 460+)  
**Action:**
1. Replace hardcoded `*50`, `*40`, `*0.1` multiplier strings with dynamic values from the subject's active template.
2. Replace duplicate inline transmutation ladders with import from `src/lib/academicPolicy.js`.

---

### Step 20 — AI Advisor Edge Function Payload Parity
**File:** `supabase/functions/invoke-advisor/index.ts` (lines 98–143)  
**Action:**
1. Include client-sent `description` in subject activity mapper.
2. Map per-course absences in `courses[]` payload.
3. Sanitize diagnostics payload before LLM prompt assembly.

---

### Step 21 — Phase 9: Scholarship, Historical Trends & Streaks
**Database & Logic:**
- Requires `student_risk_history` table and `student_semester_summary` materialized view.
- Implements `getScholarshipStanding(studentId)` and `getStreakLength(studentId)`.
- Deferred to subsequent phases (historical term data must be migrated before state machines are activated).

---

### Step 22 — Documentation Synchronization
**Files:**
- `docs/ASPIRE_GRADING_AND_RISK_RULES_DEFENSE_GUIDE.md`: Remove false claim "no duplicated risk logic anywhere"; document single canonical policy architecture in §1.4 & §1.5.
- `docs/ASPIRE-System-Scope-SRS-and-Architecture.md`: Update §3.8.4 per-subject floor from 1.75 to 2.00; correct transmutation table labels.
- `docs/update_plan/Implementation-Plan-ASPIRE-Major-System-Update.md`: Correct honors tier conflation.

---

# PART II — Notification Delivery Architecture & Schema v2

---

## SECTION 6: Immediate Safe Notification Steps (No Email Required)

These steps from `NOTIFICATION_DELIVERY_ARCHITECTURE.md` can be applied immediately without external SMTP dependencies.

### Task 6.1 — Schema Columns & Idempotency Index
**File:** `supabase/migrations/20261001150000_notifications_schema_v2.sql`

```sql
-- Add new notification columns
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS title       TEXT,
  ADD COLUMN IF NOT EXISTS link        TEXT,
  ADD COLUMN IF NOT EXISTS severity    TEXT NOT NULL DEFAULT 'info'
               CHECK (severity IN ('info', 'warning', 'critical')),
  ADD COLUMN IF NOT EXISTS payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dedupe_key  TEXT,
  ADD COLUMN IF NOT EXISTS read_at     TIMESTAMPTZ;

-- Idempotency index: prevents duplicate notifications on unlock -> relock
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe
  ON notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Query performance index for recipient inbox
CREATE INDEX IF NOT EXISTS notifications_recipient_unread
  ON notifications (recipient_id, created_at DESC)
  WHERE is_read = false;
```

---

### Task 6.2 — Bulk & Idempotent Grade Dispatchers with `.upsert()`
**File:** `src/lib/notificationDispatcher.js`  
> **Supabase-js v2 Correction:** Use `.upsert()`, NOT `.insert()`. In supabase-js v2, `onConflict` and `ignoreDuplicates` are upsert options. Calling `insert()` ignores them and raises a 23505 unique constraint violation on unlock -> relock.

```js
export async function notifyGradePosted({ classRecordId, term, students, subject }) {
  if (!students?.length) return;

  const rows = students.map((s) => ({
    recipient_id: s.student_id,
    type:         'grade_posted',
    severity:     'info',
    title:        'New Grade Posted',
    link:         '/student/grades',
    // In-app full detail (behind authentication):
    message:      `Your ${term} grade for ${subject.name} (${subject.code}) has been posted.`,
    payload: {
      subject_code:    subject.code,
      subject_name:    subject.name,
      term,
      remark:          s.remark,
      class_record_id: classRecordId,
    },
    dedupe_key: `grade_posted:${classRecordId}:${term}:${s.student_id}`,
  }));

  const { error } = await supabase
    .from('notifications')
    .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true });

  if (error) throw error;
}

export async function notifyGradeChanged({ classRecordId, term, studentId, subject, remark, revision }) {
  const { error } = await supabase
    .from('notifications')
    .upsert([{
      recipient_id: studentId,
      type:         'grade_changed',
      severity:     'warning',
      title:        'Grade Updated',
      link:         '/student/grades',
      message:      `Your ${term} grade for ${subject.name} (${subject.code}) has been updated.`,
      payload: {
        subject_code:    subject.code,
        subject_name:    subject.name,
        term,
        remark,
        class_record_id: classRecordId,
        revision,
      },
      dedupe_key: `grade_changed:${classRecordId}:${term}:${studentId}:rev${revision}`,
    }], { onConflict: 'dedupe_key', ignoreDuplicates: true });

  if (error) throw error;
}
```

---

### Task 6.3 — Wire Grade Locking to Dispatcher
**File:** `src/pages/faculty/PostedGradesView.jsx`  
After successful lock confirmation:
```js
await notifyGradePosted({
  classRecordId: classRecord.class_record_id,
  term: selectedMilestone,
  students: enrolledStudents.map(s => ({
    student_id: s.student_id,
    remark:     s.remarks ?? 'Posted',
  })),
  subject: {
    code: classRecord.subject_code,
    name: classRecord.subject_name,
  },
});
```

---

### Task 6.4 — Clean Emoji from Notification Titles & Lock Screen Privacy
In `src/lib/notificationDispatcher.js`, clean emoji from all 23 `NOTIFICATION_TITLES` entries. Comply with AGENTS.md: use `lucide-react` in UI components rather than raw emoji characters in database strings. Never surface student failing status or remarks in push banners that appear on lock screens.

---

## SECTION 7: Guardians Table & RA 10173 Compliance Scaffold

**Migration Additions:**
```sql
CREATE TABLE IF NOT EXISTS guardians (
  guardian_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name          TEXT NOT NULL,
  relationship       TEXT,
  email              TEXT,
  phone              TEXT,
  is_primary         BOOLEAN NOT NULL DEFAULT false,

  -- RA 10173 Compliance fields (Mandatory before sending)
  consent_granted_at TIMESTAMPTZ,
  consent_source     TEXT,
  email_verified_at  TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS guardians_one_primary
  ON guardians (student_id) WHERE is_primary;
```

> **Legal Constraint (RA 10173 Data Privacy Act):** HEI students are predominantly legal adults. Grades may not be delivered to third parties without verified email and recorded explicit student consent.

---

# PART III — Faculty Reports Module

---

## SECTION 8: Reports Module Foundation

### Task 8.1 — Faculty Routes & Navigation
**File:** `src/App.jsx`
```jsx
<Route path="/faculty/reports/class-performance" element={<ClassPerformance />} />
<Route path="/faculty/reports/comparison"         element={<PerformanceComparison />} />
```
Add sidebar items with `BarChart2` and `TrendingUp` icons from `lucide-react`.

---

### Task 8.2 — Institutional Cutoffs in `constants.js`
**File:** `src/lib/constants.js`
```js
export const PASSING_GRADE = 75;  // 3.00 on DYCI scale
export const HIGH_CUTOFF   = 85;  // "Performed Well" threshold
export const SAME_MARGIN   = 2;   // +/- 2 pts = "About the same"
```
Replace hardcoded `75` in `src/components/analytics/FacultyCharts.jsx` with `PASSING_GRADE`.

---

### Task 8.3 — Unified `reportsService.js`
**File:** `src/lib/reportsService.js`  
**Architectural Rules:**
1. Consume `isStudentAtRisk` from `riskEngine.js` — never define local duplicate risk formulas.
2. Only count `class_enrollments` where `approval_status = 'approved'`.
3. Exclude `null` scores from averages (show as "ungraded", never as zero).

Functions to implement:
- `fetchClassReportDataset(classRecordId)`: Queries student x activity scores.
- `aggregateByStudent(rows)`: Computes overall score and status band.
- `buildSummaryCards(students)`: Tallies total, at-risk, performed well, average, and struggling.
- `buildActivityBreakdown(rows)`: Per-activity difficulty diagnostics.

---

### Task 8.4 — `ClassPerformance.jsx` & `PerformanceComparison.jsx`
- **`ClassPerformance.jsx`:** Dropdown filters, summary metric cards, responsive scoresheet table stub.
- **`PerformanceComparison.jsx`:** Initial placeholder view preventing 404 navigation errors.
- **Cross-check:** Verify at-risk count on summary card exactly matches `StudentRisk.jsx` for the same class section.

---

# PART IV — Subsequent Sprints (Production Hardening)

---

## SECTION 9: RLS Enforcement on Notifications
**Effort:** Medium (2–3 days)  
**Prerequisite:** Audit all client-side inserts (`from('notifications').insert`). Move write operations to server-side `SECURITY DEFINER` stored procedures or Edge Functions using `SUPABASE_SERVICE_ROLE_KEY` before turning on RLS.

---

## SECTION 10: SMTP Email Delivery Stack (Brevo + Deno + pg_cron)
- Enable `pg_cron` and `pg_net` extensions in Supabase.
- Deploy `supabase/functions/send-email/index.ts` using `denomailer`.
- Implement atomic batch claim using `FOR UPDATE SKIP LOCKED`.
- Schedule 1-minute cron queue drain and 10-minute stuck-email reaper.
- Store Brevo credentials securely via `supabase secrets set`.

---

## SECTION 11: Notification Delivery & Preference Tables
Deploy `notification_deliveries` and `notification_preferences` with RLS (service-role only).

---

## SECTION 12: Guardian Consent Flow & Tokenized Read Links
- Implement Student Portal consent checkbox and guardian email confirmation workflow.
- Generate time-limited (7-day) signed read-only summary URLs for guardian email delivery.

---

## SECTION 13: Full Faculty Reports Features
- Dynamic pivot analysis grid (test `react-pivottable` on React 19; deploy custom lightweight 2D aggregate table fallback if peer dependency conflicts occur).
- Multi-term trajectory comparison with historical section analysis.
- Excel/CSV export with institutional headers and audit log integration.

---

## SECTION 14: Admin Notification Delivery Dashboard
**Route:** `/admin/notifications` (live status counts, diagnostics, manual requeue).

---

# PART V — Master Execution Checklist

```
PHASE 1: ACADEMIC RULES UNIFICATION & SAFETY GATES
  [x] 1.1   Database migration 20261001090000 applied / validated (C14, C15)
  [x] 1.2   academicPolicy.js complete with official GWA, honors, and attendance semantics
  [x] 1.3   gradingMath.js calculateWeightedTermRating returns encodedWeight, ratingOnEncoded, isComplete
  [x] 1.4   gradingMath.js calculateSemestralGrade preserves mr, tfr, sg, gwa and returns termsExpected, termsEncoded, isComplete
  [x] 1.5   toEffectiveGradeForPosting() implemented as pure null guard (Decision D3)
  [x] 1.6   WEIGHT_TOLERANCE exported as public constant
  [x] 1.7   gradingMath.js:498 fixed (18-unit floor applied to regular & irregular students alike)
  [x] 1.8   gradingMath.js:480 getPresidentsListTier wired to policy
  [x] 1.9   resolveGradingFormula fails closed on null template (legacy fallback removed)
  [x] 1.10  riskEngine.js completeness gate & advising thresholds updated
  [x] 1.11  Dead parameters (failingSubjectsCount, majorExamAverage, hasGradeBelow200) removed from riskEngine.js
  [x] 1.12  riskUtils.js deleted; zero imports confirmed
  [x] 1.13  Honors 1.45 ladder and fake 94%/85% probabilities removed from AcademicInsights.jsx & student views
  [x] 1.14  dean/AtRiskStudents.jsx:484 floor updated to 2.00
  [x] 1.15  AcademicInsights.jsx attendance scoped per class_record_id; Late/Excused counted as attended
  [x] 1.16  riskEngine.js GWA piecewise step-discontinuity curve calibrated to match §3.3 zone table
  [x] 1.17  Formula passed to StudentRow.jsx, excelExport.js, ExportPreviewModal.jsx
  [x] 1.18  classRoomService.js getEnrollmentType aligned with SQL twin
  [x] 1.19  ScoreInput.jsx & GradeComputationPreview.jsx protected with toEffectiveGradeForPosting
  [x] 1.20  admin/GradeOverride.jsx remarks mapped via toDbRemark; INC/FDA display bug fixed
  [x] 1.21  dean/Dashboard.jsx & AtRiskStudents.jsx bare-subscript formulas guarded
  [x] 1.22  student/Dashboard.jsx units column bug and raw grade scale bug resolved
  [x] 1.23  classRoomService.js resolveOfficialGwa adopted (preserving home_section_id, enrollment_type, is_irregular)
  [x] 1.24  dean/Dashboard.jsx computeUnifiedRisk parameter set completed
  [x] 1.25  LocalStorage absence cache deleted from ScoreInput, StudentRow, PostedGradesView
  [x] 1.26  ClassAttendance.jsx FDA filter fixed to student.absences >= 4
  [x] 1.27  student/Attendance.jsx fabricated attendance records completely deleted
  [x] 1.28  advisingEngine.js attendance aggregated per course
  [x] 1.29  excelExport.js formula-aware weights and canonical ladder applied
  [x] 1.30  scripts/verifyGradingMath.js updated with assertions; npm run verify:grading GREEN
  [x] 1.31  Regression checks and build gates pass (npm run lint, npm run build)
  [x] 1.32  Verification report generated: docs/reports/ACADEMIC_RULES_VERIFICATION_RESPONSE_2026-10-01.md
  [x] 1.33  Working tree academic rules changes cleanly committed to git

PHASE 2: IMMEDIATE NOTIFICATIONS & REPORT FOUNDATION
  [x] 2.1   Migration 20261001150000: notification schema v2 + guardians table scaffold
  [x] 2.2   notifyGradePosted() & notifyGradeChanged() implemented with upsert() and dedupe_key
  [x] 2.3   notifyGradePosted() wired into ScoreInput / GradeComputationPreview lock handlers
  [x] 2.4   NOTIFICATION_TITLES stripped of raw emoji strings
  [x] 2.5   NOTIFICATION_SYSTEM_CATALOG.md updated
  [x] 2.6   Faculty reports routes added to App.jsx (/faculty/reports/class-performance, /faculty/reports/comparison)
  [x] 2.7   constants.js: PASSING_GRADE, HIGH_CUTOFF, SAME_MARGIN exported; FacultyCharts.jsx updated
  [x] 2.8   reportsService.js built on single source of truth (isStudentAtRisk)
  [x] 2.9   ClassPerformance.jsx skeleton created (dropdown, filters, summary cards, table stub)
  [x] 2.10  PerformanceComparison.jsx placeholder created
  [x] 2.11  ClassPerformance at-risk card verified against StudentRisk.jsx

PHASE 3: SUBSEQUENT SPRINTS (EMAIL, ADVANCED ANALYTICS, RLS)
  [ ] 3.1   Client notification insert audit completed; write RPCs deployed
  [ ] 3.2   RLS enabled on notifications table with authenticated user policies
  [ ] 3.3   Supabase pg_cron and pg_net configured
  [ ] 3.4   send-email Edge Function deployed with denomailer and worker secret
  [ ] 3.5   Brevo SMTP credentials configured in remote Supabase vault
  [x] 3.6   notification_deliveries and notification_preferences migrations applied
  [ ] 3.7   Student Settings guardian consent capture UI built (RA 10173 compliance)
  [ ] 3.8   Tokenized signed view links generated for guardian grade delivery
  [ ] 3.9   react-pivottable React 19 compatibility verified or custom pivot fallback deployed
  [x] 3.10  Multi-term trajectory comparison and Excel export completed in Faculty Reports
  [x] 3.11  Admin notification delivery dashboard (/admin/notifications) deployed
  [ ] 3.12  Phase 9 scholarship history and streak tracking deployed
```
