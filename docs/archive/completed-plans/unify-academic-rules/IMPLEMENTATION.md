# ASPIRE — Master Implementation Plan & Technical Architecture Reference

> **Document Version:** 2.2.0**Last Updated:** 2026-10-03**Prepared by:** ASPIRE Core Engineering Team**Based on:**
>
> - `docs/update_plan/ASPIRE_UNIFY_ACADEMIC_RULES_IMPLEMENTATION_AUDIT.md` (Implementation Audit & Pre-implementation Baseline)
> - `docs/update_plan/IMPLEMENTATION_CORRECTIONS.md` (Verified Corrections & Codebase Reality)
> - `docs/update_plan/Unify-Academic-Rules-Across-ASPIRE.md` (Confirmed Rules C1–C18, Stages A–E / Steps 0–22)
> - `docs/update_plan/Reports-and-Notifications-Analysis.md` (Reports & Notifications Gap Analysis)
> - `docs/update_plan/NOTIFICATION_DELIVERY_ARCHITECTURE.md` (Multi-Channel Delivery, Idempotency, Schema v2, Brevo SMTP)
> - `docs/update_plan/Reports-Module-Plan-Faculty-Side.md` (Faculty Reports Architecture, Datasets, Class Performance & Comparison)
> - `docs/update_plan/ASPIRE_DEV_VALIDATION_CHECKS_AND_REPORT_TEMPLATE.md` (Validation Gates & Verification Template)
> - `docs/update_plan/UPDATE_PLAN_AUDIT_2026-10-03.md` (Independent re-audit: 1 live bug found & fixed,
>   1 duplicated-constant risk closed, 7 stale citations/samples corrected — see Part V's
>   "Independent re-audit 2026-10-03" note for the full pointer)
> - Live Codebase State (HEAD: `447df61`, working tree changes, migrations through
>   `20261002090000_email_notification_delivery.sql`)
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

**File:** `supabase/migrations/20261001090000_unify_academic_policy_templates.sql`**Problem:** `subjects.computation_id` was nullable, and a duplicate "General / Professional Education Scale" template existed in `grade_computations`.**Action:**

1. Backfill all subjects with `computation_id IS NULL` to point to the canonical template (`General Education Core`).
2. Repoint subjects assigned to the duplicate template to the canonical template.
3. Delete the duplicate template row.
4. Alter `subjects.computation_id` to `SET NOT NULL` and change foreign key to `ON DELETE RESTRICT`.
5. Add `UNIQUE` constraint on `grade_computations.name`.

> **UI Coupling & Execution Order Warning:**
>
> - Step 0 must be executed in the same pass as the UI fixes in `SubjectForm.jsx` and `GradeComponentsSetup.jsx`. If `SubjectForm` continues writing `computation_id || null`, every save will violate the NOT NULL constraint.
> - Step 0 must land before Step 3a (fail-closed formula resolution). Failing closed on missing formulas before backfilling database nulls will break grade calculation for those subjects.
> - Step 3a and Step 10a must land together: three render paths (`StudentRow.jsx:185`, `excelExport.js:89`, `ExportPreviewModal.jsx:31`) pass null formulas; they must receive real formulas before the engine fails closed.

---

### Step 1 — Canonical Academic Policy Module (Rules C1, C2, C6, C13)

**File:** `src/lib/academicPolicy.js` (Created)**Responsibilities:**

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

As implemented (corrected here 2026-10-03), this collapses to a one-line delegation rather than a
standalone inline guard, since `toGwaOrNull` in `academicPolicy.js` already performs the exact same
null/undefined/''/non-finite check internally:

```js
export const toEffectiveGradeForPosting = (rating) => toGwaOrNull(rating);
```

Behaviorally identical to the snippet above for every input — confirmed by execution (null,
undefined, '', NaN, and real ratings all resolve the same way through either form).

---

### Step 3 — Fix Confirmed `gradingMath.js` Bugs (Rules C3, C1)

1. **Rule C3 Bug (`gradingMath.js:498`):**Existing: `if (isIrregular && units < 18)` — Regular students carrying under 18 units were silently exempted from the unit floor.Correction: The 18-unit minimum for honors applies to **all** students:
   ```js
   if (units < 18) return { eligible: false, reason: 'Minimum 18 units required' };
   ```
2. **`getPresidentsListTier`:**
   Delegate directly to `getHonorTier` in `academicPolicy.js`.

---

### Step 3a — Fail-Closed Grading Formula Resolution

**File:** `src/lib/gradingMath.js`**Action:**

- In `resolveGradingFormula`, remove the legacy fallback (`LEGACY_GRADING_COMPONENTS`).
- If `formula` is null or invalid, fail closed with `{ ok: false, error: <message> }`. As
  implemented, `error` is a human-readable sentence ("No grading template assigned to this
  subject.") rather than the literal code `'NO_TEMPLATE_ASSIGNED'` — no caller anywhere in the
  codebase pattern-matches on the exact error string (confirmed by repo-wide grep), only on `.ok`,
  so this is a cosmetic deviation from the original spec, not a behavioral one. Corrected here
  2026-10-03 to describe what's actually implemented.
- Do not silently substitute 50/10/40.

---

### Step 4 — Risk Engine Completeness & Advising Thresholds (Rules C12, C13)

**File:** `src/lib/riskEngine.js`**Action:**

1. Check `isComplete` before generating high risk alerts. A student with partial prelim scores is **not** at risk of failure solely due to unencoded exams.
2. Re-derive advising thresholds from canonical attendance semantics in `academicPolicy.js`.

---

### Step 5 — Clean Dead Parameters from `calculateAcademicRisk` (Rule C12)

**File:** `src/lib/riskEngine.js`**Problem:** `failingSubjectsCount`, `majorExamAverage`, and `hasGradeBelow200` were destructured at `riskEngine.js:73-78` and never referenced anywhere in scoring logic (lines 80–175).**Action:**

- Remove the three dead parameters from the `calculateAcademicRisk` function signature and documentation.
- Update callers in `computeUnifiedRisk` and `classRoomService.js` to eliminate dead derivations.

---

### Step 6 — Delete Dead `riskUtils.js`

**Action:** Delete `src/lib/riskUtils.js`. Verify zero active imports remain repo-wide.

---

### Step 7 — Comprehensive Assertion Suite

**File:** `scripts/verifyGradingMath.js`**Action:**

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

**Files:** `src/pages/student/AcademicInsights.jsx`, `src/pages/student/Dashboard.jsx`, `src/pages/student/MyGradesList.jsx`, `src/pages/dean/AtRiskStudents.jsx`**Actions:**

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

**File:** `src/pages/student/AcademicInsights.jsx` (lines 236–248)**Defects Corrected:**

1. **Scope error (C10):** Attendance was queried without `class_record_id` grouping, summing cross-course absences into single false-positive FDA warnings.*Fix:* Group records by `class_record_id` and evaluate FDA per course.
2. **Late attendance (C6):** Late was half-credited (`lateAtt * 0.5`).*Fix:* Late counts as present/attended for institutional attendance rate.
3. **Excused absences (C6):** Excused was omitted from numerator.
   *Fix:* Excused sessions are recognized as attended and exempt from FDA penalty.

---

### Step 10 — GWA Risk Curve Recalibration (Rule C13)

**File:** `src/lib/riskEngine.js` (lines 81–95 as implemented; corrected 2026-10-03 from an earlier
91–104 citation that had drifted from the actual code)
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

**Files:** `src/components/StudentRow.jsx`, `src/lib/excelExport.js`, `src/components/ExportPreviewModal.jsx`
(corrected 2026-10-03 — neither `StudentRow.jsx` nor `ExportPreviewModal.jsx` live under a
`faculty/` subdirectory; an earlier citation had drifted from the actual paths.)
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

**File:** `src/pages/admin/GradeOverride.jsx` (lines 165, 321)**Action:**

1. Replace inline ternary (`parsedGrade <= 3.00 ? 'passed' : 'failed'`) with canonical `toDbRemark(getRemarks(parsedGrade))`.
2. Fix status display at line 321. Stop reducing all non-`passed` records to "Failed". Display `Passed`, `Failed`, `Incomplete (INC)`, `FDA`, or `Dropped` accurately.

---

### Step 13 — Bare-Subscript Formula Substitution Guard

**Files:** `src/pages/dean/Dashboard.jsx` (lines 346, 540), `src/pages/dean/AtRiskStudents.jsx` (line 431)
**Action:** Guard `classConfigMap[id]`. When a formula is missing, log a warning and mark status as unconfigured rather than silently falling back to 50/10/40.

---

## SECTION 4: Stage D — Read-Path Correctness (Steps 14–18b)

### Step 14 — Fix Student Dashboard (Worst Live Defect)

**File:** `src/pages/student/Dashboard.jsx` (lines 153, 155)**Defects Corrected:**

1. Line 153 read `e.subjects?.credit_units || 3.0` — `credit_units` does not exist on `subjects` (the column is `units`), silently pinning all course weights to 3.0.*Fix:* Use `e.subjects?.units || 3.0`.
2. Line 155 displayed raw percentage `computed_grade` on a 1.00–5.00 GWA scale.
   *Fix:* Display transmuted official grade resolved via `resolveOfficialGwa`.

---

### Step 14b — Fix the ~18 Scale-Comparison Sites Repo-Wide

**Files:** `dean/GradeDistribution.jsx:38-41`, `dean/Dashboard.jsx:50,331,411,530`, `SummaryReports.jsx:107,109,179,221`, `AtRiskStudents.jsx:411`, `MyGradesList.jsx`, `MyGradesDetail.jsx:249`, `AcademicInsights.jsx`.
**Defect:** Comparing raw 0–100 percentage (`computed_grade`) against `3.00` cutoff, misclassifying passing students as Failed.
**Fix:** Always resolve scale via `resolveOfficialGwa` before comparing against `3.00`.

---

### Step 15 — Canonical Plain-Mean GWA (Rule C11) & Reference Call Sites

**Files:** `src/lib/classRoomService.js` (lines 578–586), `MyGradesList.jsx:383-384,408`, `AcademicInsights.jsx:486-487,578-580`, `faculty/Dashboard.jsx:311-320`.**Actions:**

1. Migrate student views from credit-weighted averaging to plain-mean averaging (`computeStudentGwa`).
2. Relabel `faculty/Dashboard.jsx:311-320` to *"Average Term Rating (%)"*.
3. **PR #41 Protection:** In `classRoomService.js:getClassPriorityRoster`, preserve returning `home_section_id`, `enrollment_type`, and `is_irregular` so Irregular student badges are retained.

---

### Step 16 — Dean Dashboard Unified Risk Parameter Completeness

**File:** `src/pages/dean/Dashboard.jsx` (line 374)
**Action:** Pass complete parameter context to `computeUnifiedRisk` (incorporating attendance, trajectory, and missing assignments), rather than truncating to 2-of-10 parameters (`avgGwa`, `failingCount`).

---

### Step 17 — Delete LocalStorage Absence Cache

**Files:** `src/pages/faculty/ScoreInput.jsx` (lines 187, 603), `src/components/StudentRow.jsx` (line 231), `src/pages/faculty/PostedGradesView.jsx` (line 201)
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

**File:** `src/lib/excelExport.js` (lines 377–380, 460+)**Action:**

1. Replace hardcoded `*50`, `*40`, `*0.1` multiplier strings with dynamic values from the subject's active template.
2. Replace duplicate inline transmutation ladders with import from `src/lib/academicPolicy.js`.

---

### Step 20 — AI Advisor Edge Function Payload Parity

**File:** `supabase/functions/invoke-advisor/index.ts` (lines 98–143)**Action:**

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

> **As implemented (corrected here 2026-10-03):** the original design below has `notifyGradePosted`
> / `notifyGradeChanged` call `.upsert()` directly against `notifications`. The actual code instead
> routes both through a shared `dispatchNotifications(rows)` helper, which calls
> `supabase.rpc('dispatch_notifications', { p_notifications: formatted })` — a `SECURITY DEFINER`
> Postgres function (see `20261001170000_secure_notification_access.sql`) that does the dedup
> server-side via `ON CONFLICT (dedupe_key) DO NOTHING`, rather than the client issuing an
> `.upsert()` with `onConflict`/`ignoreDuplicates` directly. Net effect is the same idempotency
> guarantee this section describes — unlock → relock never raises a 23505 or double-notifies — just
> enforced one layer down, behind the RLS-restricted RPC rather than in the client call itself. The
> illustrative snippet below is kept as-written for the original design rationale; treat the RPC
> routing above as the authoritative current mechanism.

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

**File:** `src/lib/reportsService.js`**Architectural Rules:**

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

## SECTION 10: SMTP Email Delivery Stack (Gmail App Password + Deno + pg_cron)

> **STATUS (2026-10-02): code written, NOT yet deployed.** Superseded the original
> Brevo plan below — team already had a Gmail App Password, so built against that
> instead. Scope is `grade_posted` + `grade_changed` only (team decision); every
> other notification type stays in-app only. See PART V, items 3.3–3.5 for the
> up-to-date status.

**What was built:**
- `supabase/migrations/20261002090000_email_notification_delivery.sql` —
  - `fan_out_notification_deliveries()` trigger on `notifications` (AFTER INSERT):
    always creates an `in_app` delivery row, and for `grade_posted`/`grade_changed`
    also creates a `pending` `email` delivery row with `target_address` resolved
    from `users.email` at queue time (not send time).
  - `claim_email_deliveries(batch_size)` — atomic batch claim via
    `FOR UPDATE SKIP LOCKED`, `service_role`-only. Exponential backoff (1, 2, 4 min)
    computed from the existing `attempts`/`last_attempt_at` columns — no schema
    change needed, since this repo's real `notification_deliveries` table (built in
    `20261001160000_notification_deliveries_and_preferences.sql`) uses different
    column names than the original architecture doc proposed (`target_address` not
    `destination`, no `next_attempt_at`, status `'processing'` not `'sending'`,
    `max_attempts` per-row not a hardcoded cap). This migration was written against
    what's actually deployed, not the doc's draft schema.
  - `complete_email_delivery(delivery_id, success, error_message, provider_message_id)`
    — the worker reports outcome back; centralizes the attempts/status bookkeeping.
  - `reap-stuck-emails` cron (every 10 min): resets deliveries stuck in `processing`
    for 10+ minutes.
  - `drain-email-queue` cron (every minute): calls the Edge Function via
    `net.http_post`, authorized with `current_setting('app.worker_secret')` —
    deliberately NOT embedded in the migration file, to avoid committing a secret
    to git. Set separately (see runbook below).
  - `CREATE EXTENSION IF NOT EXISTS pg_cron / pg_net` — best-effort; `pg_cron`
    usually needs the Supabase Dashboard toggle (Database → Extensions) rather than
    a plain migration, since it requires `shared_preload_libraries`.
- `supabase/functions/send-email/index.ts` — Deno + `denomailer`, Gmail SMTP
  (`smtp.gmail.com:587`, STARTTLS). Verifies `x-worker-secret` before claiming.
  **Privacy rule enforced in code:** the email body never includes the grade value,
  remark, or pass/fail status — only an event notice (`"A new grade has been
  posted for IT401."`) and a link into the authenticated portal, per §6 of
  `NOTIFICATION_DELIVERY_ARCHITECTURE.md`. Do not add `payload.remark` to the
  template without re-reading that rationale first.

**🔧\* Dev-execution steps** — every line below marked `*` is run by whoever
already has Supabase project access (not necessarily the person reading this
doc; team decision 2026-10-02), directly in their own terminal. Nothing else in
this runbook needs running — no Supabase CLI was available in the environment
these files were written in, so none of this has been applied or deployed yet.

The site owner provides the Gmail address + App Password to that person out of
band — not through any file in this repo, not through chat with an AI assistant.
Nothing SMTP-related lives in the shared `.env` file; it was deliberately
removed from there for this reason. `SMTP_HOST`/`SMTP_PORT` are hardcoded in
`supabase/functions/send-email/index.ts` (Gmail only, never change), so only
`SMTP_USER`/`SMTP_PASS`/`WORKER_SECRET`/`PORTAL_URL` are ever typed in, directly
into the commands below — never into a file, never into chat with an AI
assistant.

```bash
# *1. Install/link CLI if you haven't (skip if you already have project access set up)
npm install -g supabase
supabase login
supabase link --project-ref ettnwknyhdhehoclrwwh

# *2. Apply the migration
supabase db push
# If CREATE EXTENSION pg_cron fails: Dashboard -> Database -> Extensions -> enable
# pg_cron and pg_net, then re-run `supabase db push`.

# *3. Generate a worker secret (shared between the cron job and the function;
#     must be identical in steps *4 and *5 — not a real external credential, you invent it)
openssl rand -hex 32

# *4. Set the Edge Function secrets directly — type the real Gmail address, App
#     Password, and the worker secret from step *3 here, in this terminal only:
supabase secrets set SMTP_USER=the-gmail-address SMTP_PASS=the-app-password \
  WORKER_SECRET=<value from step *3> PORTAL_URL=https://the-real-deployed-url

# *5. Set the matching DB-side secret — Supabase SQL Editor, NOT a migration file
#     (a migration is committed to git; this GUC setting is not)
ALTER DATABASE postgres SET app.worker_secret = '<the SAME value from step *3>';

# *6. Deploy the function
supabase functions deploy send-email
```

**\*7. To test** (same dev, same terminal — don't wait for the 1-minute cron tick):
```bash
curl -X POST https://ettnwknyhdhehoclrwwh.supabase.co/functions/v1/send-email \
  -H "x-worker-secret: <same value as step *3>" -H "Content-Type: application/json" -d '{}'
```
Post a grade to a test student with a real inbox first, then run the curl above
and confirm: the response shows `sent: 1`, the delivery row's `status` flips to
`sent` with a `sent_at` timestamp, and the email arrives with no grade value in
the body.

**Original plan (superseded, kept for history):**
- ~~Store Brevo credentials securely via `supabase secrets set`~~ — using Gmail
  SMTP instead (see above). Brevo remains the better choice past the testing
  phase per the architecture doc (free tier 300/day, no bulk-pattern flagging
  risk) — revisit before a real production rollout.

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

> **Re-audited 2026-10-02 against live code** (HEAD `447df61`), by reading each cited site and,
> where behavior was in question, executing the library directly (`node` against `src/lib/*.js`).
> Items below marked `[~]` were checked `[x]` in a prior pass but do not hold up — each has a
> one-line reason and a file:line pointer. `npm run build`, `npm run lint` (0 errors), and
> `npm run verify:grading` all pass on this HEAD — none of the `[~]` items are gate failures,
> which is exactly why they were missed. See `docs/reports/UPDATE_PLAN_AUDIT_2026-10-02.md` for
> the full writeup with repro steps.

```
PHASE 1: ACADEMIC RULES UNIFICATION & SAFETY GATES
  [x] 1.1   Database migration 20261001090000 applied / validated (C14, C15)
  [x] 1.2   academicPolicy.js complete with official GWA, honors, and attendance semantics
  [x] 1.3   gradingMath.js calculateWeightedTermRating returns encodedWeight, ratingOnEncoded, isComplete
  [x] 1.4   gradingMath.js calculateSemestralGrade preserves mr, tfr, sg, gwa and returns termsExpected, termsEncoded, isComplete
  [x] 1.5   toEffectiveGradeForPosting() implemented as pure null guard (Decision D3). Citation
            note added 2026-10-03: the actual implementation is a one-line delegation to
            `toGwaOrNull` (Task 2.3's spec snippet shows a standalone guard) — behaviorally
            identical, see Task 2.3 above.
  [x] 1.6   WEIGHT_TOLERANCE exported as public constant
  [x] 1.7   gradingMath.js:498 fixed (18-unit floor applied to regular & irregular students alike)
  [x] 1.8   gradingMath.js:480 getPresidentsListTier wired to policy
  [x] 1.9   resolveGradingFormula fails closed on null template (legacy fallback removed).
            Citation note added 2026-10-03: the actual `error` value is a descriptive sentence,
            not the literal code `'NO_TEMPLATE_ASSIGNED'` Step 3a's spec shows — confirmed nothing
            in the codebase pattern-matches the literal string, only `.ok`, so this never mattered
            behaviorally. See Step 3a above.
  [x] 1.10  riskEngine.js completeness gate & advising thresholds updated. FIXED 2026-10-03:
            the `isComplete` gate on the GWA risk factor was already correct, but the attendance
            thresholds (`absenceCount >= 4` / `=== 3` / `=== 2` at riskEngine.js:104,107,110, plus
            the summer amplifier's `>= 2` at :116) were hardcoded literals, never actually wired
            to `academicPolicy.js`'s `ATTENDANCE` constants — confirmed by grep that `ATTENDANCE`
            was never imported into this file. Values matched today but were duplicated, not
            single-sourced. Now imports `ATTENDANCE` and reads `ATTENDANCE.fdaAbsences` /
            `.nearFdaAbsences` / `.warningAbsences` at all four sites. No behavior change (values
            were already identical); closes the silent-drift risk. See
            `docs/update_plan/UPDATE_PLAN_AUDIT_2026-10-03.md`.
  [x] 1.11  FIXED 2026-10-02. Removed the dead failingSubjectsCount/majorExamAverage/
            hasGradeBelow200 call-site args from StudentRow.jsx and
            StudentRiskEvaluationModal.jsx. Bonus fix while in StudentRow.jsx: `isSummer` was
            already computed in scope (used elsewhere in the component) but never threaded into
            calculateAcademicRisk — added it, since riskEngine.js:116 has a real
            summer-specific attendance-severity branch that was silently always evaluating as
            `isSummer: false` before. Not threaded into StudentRiskEvaluationModal.jsx: `student`
            (from getClassPriorityRoster) doesn't expose the class's semester, so it isn't
            available there without widening that roster's return shape — left at default
            rather than guessed, documented inline.
  [x] 1.12  riskUtils.js deleted; zero imports confirmed
  [x] 1.13  FIXED 2026-10-02. AcademicInsights.jsx:83 and MyGradesList.jsx:414/416-419 now route
            through getGwaBand() instead of a raw `<= 1.45` literal.
            Found and fixed a real, separate bug while here, matching
            Unify-Academic-Rules-Across-ASPIRE.md Step 15 (C11) exactly: MyGradesList.jsx's own
            `offGwa` (the student's displayed official GWA) was CREDIT-WEIGHTED
            (`weightedOfficialSum / totalOfficialUnits`), not the plain mean C11 requires.
            Replaced with `computeStudentGwa(officialGwas).gwa`. Verified by execution that this
            is a real, non-cosmetic behavior change: a fixture of 7 subjects at 1.00 GWA + one
            5-unit subject at 2.00 GWA now correctly averages to 1.125 (plain mean) instead of
            1.4167 (the old credit-weighted result) — the two numbers can land on opposite sides
            of an honors-tier boundary, exactly the risk C11 was written to close.
            Cross-checked the other two sites Step 15 names: AcademicInsights.jsx:586 already
            uses computeStudentGwa() correctly (prior session's work, confirmed clean, no
            action needed). faculty/Dashboard.jsx:311-320 (`avgGwa` averaged raw ratings then
            transmuted — "a cohort mean of ratings is not anybody's GWA", exactly as the plan
            states) — ALSO FIXED: renamed to `avgRating`, stopped transmuting, kept as a raw
            0-100% value. Required following through into `FacultyCharts.jsx`'s
            `FacultyPerformanceTrajectoryChart`, which had a whole separate GWA-decimal axis
            scale (1.00-3.50) built around this one field — removed it, all three metrics
            (avgRating/passRate/examAvg) now share one percentage axis. Button relabeled "Class
            GWA" → "Avg Term Rating %"; tooltip caption "Transmuted Class Average" → "Average
            Term Rating". `getTransmutedGrade` import removed from Dashboard.jsx (no longer
            used). `verify:grading` / lint (0 errors) / build all green after the change.
            While checking the other faculty/dean trajectory charts for the same C11 pattern,
            found a SEPARATE, more serious issue in the dean portal's own trajectory chart —
            see the new finding directly below this list, not fixed, needs a product decision.
  [x] 1.14  dean/AtRiskStudents.jsx:484 floor updated to 2.00 (uses HONORS.subjectGradeFloor)
  [x] 1.15  AcademicInsights.jsx attendance scoped per class_record_id; Late/Excused counted as attended
  [x] 1.16  riskEngine.js GWA piecewise step-discontinuity curve calibrated to match §3.3 zone table.
            Citation note added 2026-10-03: the curve lives at lines 81–95, not ~91-104 as Step 10
            above originally cited (now corrected there).
  [x] 1.17  Formula passed to StudentRow.jsx, excelExport.js, ExportPreviewModal.jsx. Citation note
            added 2026-10-03: the first two files have no `faculty/` subdirectory, contrary to
            Step 10a's/Step 17's original citations (now corrected there). Also hardened
            `excelExport.js`'s `extractComponentWeights()` the same day: its last-resort
            50/10/40 fallback (used only for the exported sheet's own formula-text labels, never
            the posted grade values) now `console.warn`s instead of substituting silently.
  [x] 1.18  FIXED 2026-10-02. classRoomService.js:18 `getEnrollmentType` now returns 'Irregular'
            when `classSectionId` is null (was 'Regular'), matching the SQL twin's NULL/CASE
            fallthrough (20260606164500...sql:137-140). Verified by execution against all four
            input combinations. Behavior note carried over from the plan: a class with no
            section now badges every enrolled student Irregular, where it previously badged
            them Regular — check demo/seed data for sectionless classes if this is visible
            somewhere unexpected.
  [x] 1.19  RETRACTED prior [~] finding (see "Corrections" below) — ScoreInput.jsx's semestral
            branch (:1376, `getTransmutedGrade(finalSG)`) IS safe: the upstream `invalidTerm`
            guard (:1343-1356) blocks posting unless every required term is already complete,
            and `calculateWeightedTermRating`'s `isComplete` guarantees `rating` is a real number
            whenever true (verified by executing both the complete and incomplete cases against
            the actual guard logic). GradeComputationPreview.jsx has the equivalent
            `incompleteStudent` guard (:649-662) protecting the same line (:741) the same way.
            No code change made — nothing was broken. Kept as [x] for the part that's true
            (midterm/TFR null-safe); the semestral branch doesn't need the guard it was accused
            of lacking.
  [x] 1.20  FIXED 2026-10-02. Added `REMARKS`, `DB_REMARKS`, `toDbRemark()`, `toDisplayRemark()`
            to academicPolicy.js (none existed before). GradeOverride.jsx:165 now
            `toDbRemark(getRemarks({ gwa: parsedGrade, isComplete: true }))` instead of the inline
            ternary (write-side behavior unchanged — same 3.00 cutoff — now just routed through
            the shared helper). GradeOverride.jsx's two remark badges (mobile :316-319, desktop
            :370-374) now call `toDisplayRemark(grade.remarks)` with a 5-way color map, so FDA/
            Incomplete/Dropped render distinctly instead of all showing "Failed". Verified by
            execution: toDisplayRemark('fda')→'FDA', ('incomplete')→'Incomplete (INC)',
            ('dropped')→'Dropped', unrecognized values pass through rather than silently
            becoming "Failed". npm run verify:grading / lint / build all green after the change.
  [x] 1.21  FIXED 2026-10-02, CORRECTED 2026-10-03 — but the original framing of this item was
            backwards, worth recording. The prior pass assumed `?? null` (dean/AtRiskStudents.jsx:432,
            dean/Dashboard.jsx:62,347) was the "guarded" pattern and the bare
            `classConfigMap[cId]` (dean/Dashboard.jsx:539) was the unsafe one needing to match
            it. Verified by execution: it's the OPPOSITE. `computeTentativeGrade`'s `options`
            param only defaults to `{}` when passed literally `undefined` (JS default-parameter
            semantics) — a bare subscript miss naturally produces `undefined` and fails closed
            correctly to `gwa: null`. An explicit `?? null` produces a literal `null`, which does
            NOT trigger the default, and `options.formula` on `null` throws
            `TypeError: Cannot read properties of null (reading 'formula')`. All three `?? null`
            sites sat inside unguarded `.forEach()`/`.map()` loops inside a `try { ... } catch`
            block that sets a generic page-level error ("An error occurred while fetching live
            database records.") — so the Dean Dashboard or At-Risk Students page could fail to
            load ENTIRELY (not just one degraded row) the first time any class lacked a
            `classConfigMap` entry. The 2026-10-02 pass claimed all three `?? null` sites were
            fixed, but only fixed two (AtRiskStudents.jsx:436, Dashboard.jsx:65) — the third, at
            dean/Dashboard.jsx:374 (inside the department-wide GWA distribution loop, a separate
            call site from the other two), was left at `?? null` and remained a live crash risk.
            Caught during the 2026-10-03 independent re-audit (see
            `docs/update_plan/UPDATE_PLAN_AUDIT_2026-10-03.md`) and fixed in that pass: `?? null`
            → `?? {}` at :374, matching the other two sites. The originally-bare site at :578
            (shifted from :539 after other edits) remains bare (already correct) with a comment
            explaining why, so it doesn't get
            "fixed" into the broken pattern later.
  [x] 1.22  student/Dashboard.jsx units column bug and raw grade scale bug resolved (uses `units`,
            resolveOfficialGwa — confirmed at Dashboard.jsx:154,156)
  [x] 1.23  classRoomService.js resolveOfficialGwa adopted (preserving home_section_id, enrollment_type, is_irregular)
  [x] 1.24  FIXED 2026-10-02. Was worse than "2 of 10 params" — `dean/Dashboard.jsx:400` called
            `computeUnifiedRisk({ avgGwa, failingCount })`, and `failingCount` isn't a real
            parameter name the function recognizes, so it was silently discarded every time
            (confirmed: only `avgGwa` ever did anything). No attendance data was fetched
            anywhere in this file at all. Added a single batched `attendance_records` query
            (`.in('class_record_id', classRecordIds)`, run alongside the existing
            computation/activity queries already in the same `Promise.all`) and now thread
            `absenceCount` = each student's WORST single course (per C10 — FDA is per-course,
            never a cross-course sum; matches how AcademicInsights.jsx and advisingEngine.js
            already evaluate it), plus the same `consecutiveAbsences >= 2 ? 2 : 0` heuristic
            `classRoomService.js`'s `getClassPriorityRoster` already uses. Verified by execution:
            1 absence spread across 4 courses no longer inflates the score (stays LOW), 4
            absences in one real course correctly reaches HIGH.
            Left undone, deliberately, with an inline comment explaining why: trajectory
            (previousTermRating/currentTermRating) and isSummer. Neither generalizes cleanly to
            a department-wide aggregate (a student can be in a Summer class and a regular class
            simultaneously, across different subjects), and the Unify-Academic-Rules audit
            already classifies trajectory coverage as "open by design, not blocking" — not
            fabricated here either.
  [x] 1.25  FIXED 2026-10-02. All `sage_absences_*` localStorage reads/writes removed (confirmed
            zero remaining references repo-wide). ScoreInput.jsx's existing `attendance_records`
            fetch now merges straight into the `students` state (`setStudents(prev =>
            prev.map(s => ({ ...s, absences: ... })))`) instead of writing to localStorage.
            PostedGradesView.jsx had NO attendance fetch of its own at all (confirmed — its
            roster came from a plain `enrollments` query with no absences field whatsoever, so
            it always read 0 or whatever happened to be cached from ScoreInput); added the same
            `attendance_records` fetch pattern, merged into `compiled` before `setStudents`.
            Both pages' `compileStudentsWithGrades()` now read `student.absences` directly.
            StudentRow.jsx now reads `student.absences` (the prop it's already given) instead of
            `localStorage.getItem` — verified by execution across real-count/0/undefined/null
            shapes, all resolve correctly with no stale-cache window between screens.
  [x] 1.26  ClassAttendance.jsx FDA filter fixed to student.absences >= 4
  [x] 1.27  student/Attendance.jsx fabricated attendance records completely deleted
  [x] 1.28  advisingEngine.js attendance aggregated per course (byCourse present)
  [x] 1.29  excelExport.js formula-aware weights and canonical ladder applied (imports TRANSMUTATION_LADDER)
  [x] 1.30  FIXED 2026-10-03. `verify:grading` is GREEN. Assertion count raised from 37 to 79
            `assert.*` calls, past the ~50 the plan calls for, by adding: the full 8-pin GWA
            risk-curve boundary set (2.00/2.01/2.50/3.00/3.01/5.00 — previously only 2 of 8 pins
            were tested), the attendance/FDA risk-factor zones (0/2/3/4 absences — previously
            untested), `calculateSemestralGrade`'s regular-4-term and summer-2-term completeness
            fields (`termsExpected`/`termsEncoded`/`isComplete`/`'In Progress'` remark —
            previously only `sg` was checked for summer, nothing for regular), `missingComponents`
            on `calculateWeightedTermRating` (previously only `isComplete` was asserted),
            `WEIGHT_TOLERANCE` float-rounding behavior at both the safe and genuinely-invalid
            boundary, the 18-unit honors floor at the exact 18/17 boundary, and the full
            `toDbRemark`/`toDisplayRemark`/`getRemarks` vocabulary round-trip including the
            unrecognized-value passthrough. See `docs/update_plan/UPDATE_PLAN_AUDIT_2026-10-03.md`.
            Does NOT cover 2.8's fabricated proxy GWA — that lives in `reportsService.js`, a
            different layer than this script tests; remains correctly flagged under 2.8, not here.
  [x] 1.31  Regression checks and build gates pass (re-ran: npm run build succeeds, npm run lint
            = 0 errors / 52 warnings — corrected 2026-10-03 from an earlier 54 count that had
            drifted, npm run verify:grading green)
  [x] 1.32  Verification report exists at docs/reports/ACADEMIC_RULES_VERIFICATION_RESPONSE_2026-10-01.md
            — NOTE: its SMTP section (~lines 270-280) describes Brevo retry/backoff behavior that
            does not exist in the repo (no send-email function, see 3.4). That section documents
            the architecture doc's design, not a built feature — re-read before trusting it.
  [x] 1.33  Working tree academic rules changes cleanly committed to git (HEAD 447df61, clean tree)

PHASE 2: IMMEDIATE NOTIFICATIONS & REPORT FOUNDATION
  [x] 2.1   Migration 20261001150000: notification schema v2 + guardians table scaffold
  [x] 2.2   FIXED 2026-10-02 (P3). notifyGradeChanged() is now actually called — it was
            implemented and imported in both ScoreInput.jsx and GradeComputationPreview.jsx but
            never invoked. The legacy notifyGradesPosted() (no dedupe_key, targeted by section
            rather than the real roster) is removed from both call sites and marked @deprecated
            in notificationDispatcher.js (zero remaining callers, confirmed by repo-wide grep).
  [x] 2.3   FIXED 2026-10-02 (P3), same change as 2.2, in both ScoreInput.jsx and
            GradeComputationPreview.jsx (confirmed identical bug pattern in both files before the
            fix — not an oversight unique to one). On first post, notifyGradePosted() alone now
            notifies the full roster once each (was: notifyGradePosted() + notifyGradesPosted()
            both firing → 2 notifications per student). On a relock, students whose grade
            actually changed now get notifyGradeChanged() (type grade_changed, correct semantics)
            instead of the undeduped legacy call. A revision tag (Date.now(), captured once per
            post invocation, shared across all students in that call) is threaded into
            notifyGradeChanged()'s dedupe_key so a doubled click can't double-notify, while a
            genuinely later relock still notifies. npm run verify:grading / lint (0 errors) /
            build all green after the change. Citation note added 2026-10-03: Task 6.2's spec
            snippet above shows `notifyGradePosted`/`notifyGradeChanged` calling `.upsert()`
            directly; the actual implementation routes both through `dispatchNotifications()` →
            `supabase.rpc('dispatch_notifications', ...)`, which does the same dedup one layer
            down (now documented in Task 6.2 above) — no behavior gap, just a stale code sample.
  [x] 2.4   NOTIFICATION_TITLES stripped of raw emoji strings (confirmed, notificationDispatcher.js:3-32)
  [x] 2.5   FIXED 2026-10-02. docs/NOTIFICATION_SYSTEM_CATALOG.md was stale/inaccurate in several
            places, corrected: (1) RLS status said "planned" — it's enabled, confirmed earlier
            this session. (2) Local push said "🔄 In Progress / transitioning to
            @capacitor/local-notifications" — it's installed and wired, not in progress.
            (3) Five live, dispatched notification types were completely undocumented:
            `eval_closed`, `consultation_request`, `academic_advising`, `dean_referral`,
            `academic_notice` — added, with sample text read from their actual dispatch sites,
            not invented. (4) The dean `risk_threshold` row described a college-wide risk-quota
            alert that no dispatcher in the codebase actually sends to a dean — every real
            `risk_threshold` dispatch targets faculty, not deans; marked "Not yet implemented"
            rather than silently deleted. (5) `dean_referral`'s row was corrected: its recipient
            is the REFERRING FACULTY MEMBER (a receipt), not the dean — confirmed by reading
            `StudentRiskEvaluationModal.jsx:157-162`, where `recipient_id: user?.id` is the
            currently-logged-in faculty user, not the dean. (6) §4's Email row said "(Brevo)" —
            corrected to Gmail SMTP (team decision) with accurate not-yet-deployed status.
            (7) §4's Guardian row presented RA 10173 tokenized links as built — corrected to
            "Not built" (schema + RLS only). (8) A broken `file:///c:/Users/sadia/SAGE/...`
            absolute path (another contributor's local machine) → relative repo link.
            **Also found and fixed a real, previously-undetected privacy leak while verifying
            §3's claim that lock-screen banners omit sensitive content** — that claim was FALSE
            until this pass: `AuthContext.jsx`'s `triggerInboundLocalNotification()` (the single
            chokepoint for both the 4-second poller and the Realtime subscription) rendered
            every notification's raw `message` to the lock screen with no filtering. Confirmed
            by reading each dispatcher that `ews_alert` and `risk_threshold` literally
            interpolate a student's running GWA into `message` (e.g. "...with running GWA
            2.85..."), and `academic_advising`/`dean_referral`/`academic_notice` name the
            flagged student and carry dean directive text — all push-visible before this fix.
            `grade_posted`/`grade_changed` were independently verified already safe (their
            `message` never contained the remark; that lives only in `payload.remark`, used by
            the in-app/email layers). Fixed by substituting a generic
            "[Title]. Open ASPIRE to view details." body for the five confirmed-sensitive types
            only; full detail is untouched in the in-app inbox. `npm run verify:grading` / lint
            (0 errors) / build all green after the change.
  [x] 2.6   Faculty reports routes added to App.jsx (/faculty/reports/class-performance, /faculty/reports/comparison)
  [x] 2.7   constants.js: PASSING_GRADE, HIGH_CUTOFF, SAME_MARGIN exported (confirmed). FIXED
            2026-10-03: `FacultyCharts.jsx` had only partially adopted `PASSING_GRADE` — the
            risk-color comparison used it, but display labels (the Y-axis default, the "Target"
            indicator line's position/title, and the legend caption) still hardcoded `75` at
            lines 59, 442-446, 465. All four now reference `PASSING_GRADE` instead of the literal.
  [x] 2.8   FIXED the wiring bug 2026-10-02 (`avgGwa`/`risk_level` field names). FULLY FIXED
            2026-10-03, closing the remaining `[~]`: `reportsService.js`'s
            `fetchClassReportDataset()` now also queries `posted_grades`/`attendance_records` and
            `aggregateByStudent()` feeds `computeUnifiedRisk()` each student's real official GWA
            (most-advanced posted milestone) and real absence count, instead of the fabricated
            binary proxy (`overallPercentage < 75 ? 3.5 : 2.0`). When no milestone is posted yet,
            GWA stays `null` (missing, not fabricated as failing). `officialGwa`/`absenceCount`
            are also now surfaced in `ClassPerformance.jsx`'s table and Pivot panel (previously
            computed but never rendered — see `docs/update_plan/UPDATE_PLAN_AUDIT_2026-10-03.md`).
  [x] 2.9   ClassPerformance.jsx built out well past "skeleton" (529 lines as of 2026-10-03,
            corrected from an earlier 494 count that had drifted after the Pivot tab was added in
            3.9 — filters, summary cards, data grid, Excel export, URL search params, Pivot view)
            — description in this checklist is stale, but the page itself is ahead of what was
            recorded here. Expect this count to keep moving; treat it as illustrative, not a gate.
  [x] 2.10  PerformanceComparison.jsx built out well past "placeholder" (497 lines: better/worse/
            about-the-same labels, cohort metrics) — same stale-description note as 2.9.
  [x] 2.11  FIXED 2026-10-02. StudentRisk.jsx:84 — replaced the OR-chain
            (`risk_score >= 20 || risk_level in (moderate,high,critical)`) with a single
            `risk_score >= RISK_TIERS.MODERATE.min` (25) check. RISK_TIERS is contiguous and
            exhaustive (0–100, no gaps — confirmed), so this one check is equivalent to the old
            OR-chain's intent AND fixes a real bug it had: a score of 20–24 is LOW tier by the
            canonical definition, so the old `>= 20` constant was wrongly showing some
            genuinely-low-risk students on the "At-Risk Students" page. reportsService.js's
            `isAtRisk` was changed to match this exact threshold (`composite_score >=
            RISK_TIERS.MODERATE.min`) instead of the stricter `isStudentAtRisk()`
            (high/critical-only, used for dean/admin KPI counting) — per
            Reports-Module-Plan-Faculty-Side.md §13.4's explicit instruction to reuse
            StudentRisk's definition rather than create a second one. Verified by execution:
            reportsService and StudentRisk now agree at every boundary (score 24 excluded from
            both, 25 included in both). This is a deliberately BROADER "needs attention"
            threshold than the strict dean/admin at-risk KPI (which stays high/critical-only,
            unaffected by this change) — the two lists intentionally differ in audience and
            purpose, not in correctness.

PHASE 3: SUBSEQUENT SPRINTS (EMAIL, ADVANCED ANALYTICS, RLS)
  [x] 3.1   Client notification insert audit completed — re-checked every remaining
            `.from('notifications')` call site in src/ (AuthContext.jsx, admin/dean/faculty/student
            Notifications.jsx, faculty/Dashboard.jsx): all are .select() reads scoped to
            recipient_id/user.id, or read-then-mark-read. No raw client-side .insert() remains;
            writes go through the dispatch_notifications() RPC.
  [x] 3.2   RLS enabled on notifications table — confirmed at
            supabase/migrations/20261001170000_secure_notification_access.sql:26, plus
            notification_deliveries, notification_preferences, and guardians (lines 27-29).
            dispatch_notifications() RPC is SECURITY DEFINER with GRANT EXECUTE TO authenticated only.
  [~] 3.3   CODE WRITTEN 2026-10-02, NOT YET APPLIED. New migration
            supabase/migrations/20261002090000_email_notification_delivery.sql adds
            `CREATE EXTENSION IF NOT EXISTS pg_cron / pg_net`, a 'drain-email-queue' cron job
            (every minute) and a 'reap-stuck-emails' cron job (every 10 min). NOT run against
            the remote project yet — no Supabase CLI available in this environment, so this
            could only be written, not applied. pg_cron in particular usually needs the
            Dashboard (Database -> Extensions) toggle on Supabase, not just CREATE EXTENSION
            via migration — see the comment at the top of the migration file.
  [~] 3.4   CODE WRITTEN 2026-10-02, NOT YET DEPLOYED. supabase/functions/send-email/index.ts
            created (Deno + denomailer, verifies x-worker-secret, claims via
            claim_email_deliveries() RPC, sends via SMTP, reports back via
            complete_email_delivery() RPC). NOT deployed — needs `supabase functions deploy
            send-email` run by someone with the CLI linked to the project. Scope: grade_posted
            + grade_changed only (team decision 2026-10-02), per the architecture doc's §6
            privacy rule the email body contains NO grade value/remark, only an event notice +
            portal link.
            NOTE: built against GMAIL SMTP with an app password (team decision), not Brevo —
            see 3.5. The migration's schema assumptions were corrected against what's actually
            deployed (target_address/status enum/no next_attempt_at), not the earlier
            NOTIFICATION_DELIVERY_ARCHITECTURE.md draft, which used different column names that
            were never built.
  [~] 3.5   Gmail SMTP chosen over Brevo (team decision 2026-10-02 — they already have a Gmail
            App Password). Secrets NOT yet set on the remote project. `SMTP_HOST`/`SMTP_PORT`
            are hardcoded in `supabase/functions/send-email/index.ts` (not secrets — fixed for
            Gmail). Handoff model (team decision): nothing SMTP-related lives in the shared
            `.env` file — removed from there deliberately. Whoever already has Supabase project
            access runs `supabase secrets set SMTP_USER=... SMTP_PASS=... WORKER_SECRET=...
            PORTAL_URL=...` directly in their own terminal; the site owner provides the Gmail
            address + App Password to them out of band, never through a committed file or
            chat with an AI assistant. Full runbook in SECTION 10 above.
  [x] 3.6   notification_deliveries and notification_preferences migrations applied (confirmed,
            20261001160000_notification_deliveries_and_preferences.sql)
  [~] 3.7/3.8  REVISED SCOPE 2026-10-03 (product decision) — guardian consent capture UI and
            tokenized signed view links are no longer the plan. Both scrapped in favor of: (1) a
            required guardian/parent contact field (name/relationship/email) that hard-blocks a
            student's login via a non-dismissable modal (`GuardianInfoGate.jsx`) until filled —
            no consent checkbox, an explicit decision to skip the RA 10173 safeguard Section 7
            above describes; (2) automatic SMTP notification to that guardian on every
            `grade_posted`/`grade_changed` event, with real grade detail and a conservative
            honors-pace insight — a deliberately different privacy posture than the student's own
            email, since there is no guardian portal. Built 2026-10-03: `upsert_primary_guardian()`
            RPC + RLS policy (`20261003110000_guardian_self_service.sql`), dedicated
            `guardian_id`/`honors_pace` columns on `notification_deliveries`
            (`20261002080000_guardian_notification_columns.sql`), the fan-out trigger and
            `send-email`'s `renderGuardianTemplate()` (`20261002090000_email_notification_delivery.sql`
            / `supabase/functions/send-email/index.ts`). **Still `[~]`, not `[x]`:** none of this
            has been applied to the remote project or verified end to end yet — see
            `docs/update_plan/DEV_HANDOFF_SQL_SETUP_2026-10-03.md` Section 7b for the exact test.
  [x] 3.9   FIXED 2026-10-02 with `react-pivottable@0.11.1`; **REBUILT NATIVE 2026-10-03** per
            product decision — the third-party dependency was removed entirely. The original
            react-pivottable integration (React-19 compatibility check, smoke test, 3 of 4
            Reports-Module-Plan-Faculty-Side.md §3 presets) worked correctly, but the team wanted
            the pivot logic itself as native code, not a wrapped library. `ReportsPivotPanel.jsx`
            now implements its own aggregation engine (Average/Sum/Count over a Row field × Column
            field grid, with row/column/grand totals) with no external pivot dependency —
            `react-pivottable` uninstalled from `package.json`/`node_modules` (bundle shrank
            ~100KB). Same 3 presets preserved (At-Risk Students, Whole Class, Per Activity), plus
            manual Row/Column/Aggregator/Value-field dropdowns and an "At-risk only" checkbox for
            free-form slicing. Also closed a real gap found during this rebuild: `officialGwa`/
            `absenceCount` (item 2.8's real grade/attendance data) were being computed by
            `aggregateByStudent()` but never reaching the UI at all — added "Official Grade (GWA)"
            and "Absences" columns to the main table, and the same two fields to the pivot's
            selectable Row/Column/Value options.
            **A real bug was caught before shipping**, not just claimed fixed: the native
            aggregator's `Number(value)` conversion silently turned `null` (ungraded) into `0`,
            which would have dragged averages down for any student with a mix of graded and
            ungraded activities — the exact "missing is not zero" failure mode this whole audit
            has fought elsewhere in the codebase. Caught via a standalone simulation against
            sample data (no browser available in this environment), fixed by excluding
            `null`/`undefined` before numeric conversion, re-verified by the same simulation.
            `verify:grading` / lint (0 errors) / build all green after the change.
            Known simplification, not a defect: the search box and status filter chips above the
            grid don't affect the Pivot tab (they only filter `filteredStudents`, which the grid
            view uses but the pivot doesn't) — the pivot has its own, more granular field-based
            filtering built in. The plan's "filtering the grid also updates the pivot" bidirectional
            sync is a stretch feature not built this pass.
  [x] 3.10  Multi-term trajectory comparison and Excel export completed in Faculty Reports
            (confirmed: reportsService.js fetchFacultyCourseHistory/fetchTermCohortMetrics/
            compareCohortMetrics/exportClassPerformanceToExcel all present and wired)
  [x] 3.11  Admin notification delivery dashboard (/admin/notifications) deployed — confirmed,
            includes requeueNotificationDelivery wiring
  [ ] 3.12  Phase 9 scholarship history and streak tracking — confirmed absent (no
            student_risk_history, student_semester_summary, or getScholarshipStanding anywhere).
            Correctly deferred per the plan's own prerequisite note.
```

### Corrections made during implementation (2026-10-02, second pass)

Before fixing P2, it was re-verified against the actual guarded code path (not in isolation) and
turned out not to be reachable:

- **P2 retracted.** `ScoreInput.jsx:1376` and `GradeComputationPreview.jsx:741` both sit behind an
  upstream completeness guard (`invalidTerm` / `incompleteStudent`) that blocks posting entirely
  unless every required term already has `isComplete: true` — and `calculateWeightedTermRating`
  guarantees `isComplete: true` implies a real numeric `rating` (never null), by construction.
  Verified by simulating both the complete and incomplete cases against the real guard logic: the
  incomplete case throws before ever reaching the line in question. No code change was needed or
  made. The original finding came from testing `calculateSemestralGrade()` in isolation, which
  bypassed the guard that protects it in the real call sites — a reminder that a unit-level repro
  isn't the same as proving reachability through the actual code path.
- **1.25 (absence cache) downgraded on review**, not yet fixed. The cached value doesn't reach the
  posting/write path — the posting loop in `ScoreInput.jsx` never reads `absences` or `isFDA`.
  It only feeds `StudentRow.jsx`'s live on-screen preview while a faculty member is scoring. Real
  bug (stale/missing cache can show a wrong grade/FDA badge before posting), but display-tier, not
  data-corruption-tier. Still open — not touched this pass.

### Fixed this pass (2026-10-02)

- **1.20** — `GradeOverride.jsx` remarks now route through new `academicPolicy.js` exports
  (`REMARKS`, `DB_REMARKS`, `toDbRemark`, `toDisplayRemark`). See the 1.20 entry above for detail.
- **2.8** — `reportsService.js` risk-engine wiring bug fixed (`gwa`→`avgGwa`, `riskLevel`→
  `risk_level`). See the 2.8 entry above — still `[~]` because the input GWA is a documented
  proxy, not a real resolved grade.

- **P3** — removed the legacy `notifyGradesPosted()` call from both `ScoreInput.jsx` and
  `GradeComputationPreview.jsx` (identical bug in both — not unique to one file). Wired in the
  previously-dead `notifyGradeChanged()` for the relock-with-changes case, with a shared
  per-invocation revision tag. See 2.2/2.3 above for detail.

All gates re-run clean after every fix this session: `npm run verify:grading` green, `npm run
lint` 0 errors on touched files, `npm run build` succeeds.

### New defects found this pass, not in any prior checklist item

These aren't regressions against a specific numbered step — they're bugs the re-audit surfaced
that the plan's items don't individually name. All three are now resolved or retracted:

- ~~P1~~ — folded into 2.8 above, fixed.
- ~~P2~~ — retracted, see "Corrections" above. Not a bug.
- ~~P3~~ — folded into 2.2/2.3 above, fixed.

### Defect found AND fixed 2026-10-02 (session 3)

**`dean/Dashboard.jsx:485-527` — `AcademicTrajectoryLineChart` was fabricating data for
terms with no real grades yet, shown to the dean as if real.** Found while fixing the
unrelated faculty "Class GWA" chart (see 1.13 above). The real-data branch (`count > 0`) was
already genuinely correct (uses `computeTermGwa`, real transmuted GWAs) — `DeanCharts.jsx`'s
GWA axis (1.00-3.50) is legitimate here, unlike the faculty chart, so it was left untouched.
The problem was the `else` branch, which fired for any term with zero posted/tentative
grades — e.g. Final term before anyone has final grades: it invented a plausible-looking
projected GWA from a hardcoded delta (`tIdx === 2 ? -0.05 : tIdx === 3 ? -0.08 : 0.02`
applied to the running average), plus fabricated `honors`/`atRisk`/`passing`/`passRate`
counts (`deptStudents.length * 0.25`, `highRiskCount * 0.75`, a hardcoded `88` fallback pass
rate). With no data at all, even the starting `runningAvg` defaulted to an invented `1.85`.
Nothing in the chart or its tooltip told the dean any of this was a projection.

Same category of problem the team correctly avoided by deferring Phase 9 (3.12) —
*"enabling them would fabricate data"* — except this one was already live and dean-facing.

**Decision (team, 2026-10-02): honest empty state, not a disclosed projection** — matches
how every other "ungraded" case in this codebase is already handled (excluded from averages,
shown as "—", never invented). **Fixed:** a term with zero real grades now returns `null`
from the `.map()` and is filtered out of `trajectoryData` entirely
(`.filter(Boolean)`) — it simply doesn't appear as a point on the trajectory, rather than
appearing with an invented value. All the fabrication code (the delta formula, the
`1.85`/`16`/`0.25`/`0.75`/`88` placeholder constants) was deleted, not just bypassed.
`DeanCharts.jsx` needed no changes — it already renders a shorter point array correctly
(points are evenly spaced by count, not by a fixed 4-term assumption) and already shows
"No multi-term progression data recorded yet." when the array is fully empty. Verified by
execution: a fixture with only Prelim data produces a 1-point array (no fabricated
Midterm/Semi-Final/Final entries); a fixture with zero terms anywhere produces `[]`.
`verify:grading` / lint (0 errors) / build all green after the change.

### IMPLEMENTATION_CORRECTIONS.md item (d) re-verified 2026-10-02 (session 3)

**"GWA_BANDS bracket unification" — `dean/GradeDistribution.jsx:254-257` was genuinely
broken; the other two sites the corrections doc named were already clean.** Checked all
three cited locations individually rather than assuming the whole item was still open:

- `dean/Dashboard.jsx`'s 4-bucket health donut (`gwaDist`, feeding `healthDist`) — clean,
  an if/else-if chain is gap-free by construction. No action needed.
- `dean/Dashboard.jsx`'s 6-bucket histogram (`b1`-`b6`, feeding `GradeDistributionHistogram`
  via `histogramBrackets`) — verified gap-free by execution (`Σ bracket.count === 401` for a
  401-point 1.00-5.00 sample at 0.01 resolution). No action needed.
- **`dean/GradeDistribution.jsx:254-257` — genuinely broken, now FIXED.** `exc`/`gd`/`pass`
  used `>= 1.00/1.50`, `>= 1.75/2.50`, `>= 2.75/3.00` — any grade in `(1.50, 1.75)` or
  `(2.50, 2.75)` matched no bracket at all. Verified by execution before fixing: 48 of 401
  sample points vanished from the bracket breakdown while still being counted in
  `passedCount`/`failedCount` — the two totals on the same page silently disagreed. Fixed by
  making each bracket's lower bound start exactly where the previous one's upper bound ends
  (`> 1.50` instead of `>= 1.75`, `> 2.50` instead of `>= 2.75`); updated the two hardcoded
  label strings ("1.75 – 2.50" → "1.51 – 2.50", "2.75 – 3.00" → "2.51 – 3.00") to match.
  Re-verified by execution: `Σ bracket.count === 401 === passedCount + failedCount`.
  `verify:grading` / lint (0 errors) / build all green after the change.

### IMPLEMENTATION_CORRECTIONS.md item (c) re-verified 2026-10-02 (session 3)

**"One risk model" — found the full shape of this, fixed the safe part, flagging the rest.**
Confirmed there are at least 5 independently-coded "at-risk" definitions across the app
(StudentRisk.jsx's broader `>= MODERATE.min` threshold was already reconciled with
reportsService.js earlier this session — see 2.11 — that one's intentional and documented).

**FIXED — safe, zero-behavior-change (values already matched RISK_TIERS exactly, just as
magic numbers instead of the named constant):**
- `src/components/StudentRow.jsx:331,337-347` — `>= 25/50/75` → `RISK_TIERS.MODERATE.min` /
  `.HIGH.min` / `.CRITICAL.min`.
- `src/pages/faculty/ClassRecordsList.jsx:575,617-624` — same substitution.

**NOT FIXED — two genuinely separate risk models, not magic-number duplication. Each would
classify the same student differently than `isStudentAtRisk()`/`RISK_TIERS`, and unifying
them is a design decision (what inputs are even available at each call site), not a
mechanical swap:**
- `src/pages/dean/SummaryReports.jsx:235-248` — a standalone 3-tier model using ONLY the raw
  GWA number (`gwa > 3.00` → High Risk, `gwa >= 2.75 && <= 3.00` → Medium Risk, else Low
  Risk). No attendance, no trajectory, no zero-submissions — none of the other factors
  `calculateAcademicRisk` considers.
- `src/pages/student/AcademicInsights.jsx:48-56` (`computeVerdict`) — a standalone 3-state
  verdict (`continue` / `at_risk` / `recommend_shift`) using its own thresholds
  (`gwa > 3.00 || failingCount > 1`, `gwa > 2.50 || fdaRisk || absents >= 4 ||
  failingCount === 1`). This is what a STUDENT sees about their own standing — it can
  disagree with what a faculty member sees for the same student on `StudentRisk.jsx`, since
  the two models take different inputs and use different cutoffs.
- Also newly found while checking this item: **`dean/Dashboard.jsx:588`** —
  `if (studentAvg > 3.00 || gradeValues.some(v => v > 3.00)) secAtRisk++;` is a THIRD,
  separate at-risk rule inside a file (`dean/Dashboard.jsx`) that already computes
  `highRiskCount` via the canonical `isStudentAtRisk()` path elsewhere — pure-GWA-failing,
  no attendance/trajectory, confirming the corrections doc's "third at-risk rule in a file
  that already has two" citation exactly.

Not fixed this pass — each of these three feeds a different part of the UI (a dean summary
table, a student's own advisory text, a dean section-performance heatmap), and reconciling
them means deciding what each call site actually has available (does `AcademicInsights.jsx`
have attendance/trajectory data to feed a real `calculateAcademicRisk` call, or does
`computeVerdict` need its own policy-level definition that's *allowed* to differ from the
faculty-facing one?) rather than a mechanical constant swap. Flagging for a deliberate pass.

### IMPLEMENTATION_CORRECTIONS.md item (b) re-verified 2026-10-02 (session 3)

**"~18 scale-comparison sites" — most were already clean; `dean/SummaryReports.jsx` was
genuinely broken, and worse than a scale bug.** Checked each cited file:

- `dean/GradeDistribution.jsx:38-41` — already clean (`effectiveGWA()` wraps
  `resolveOfficialGwa`). No action needed.
- `dean/Dashboard.jsx:50,331,411,530` — already clean (zero `effective_grade ??
  computed_grade`-style ternaries found anywhere in the file). No action needed.
- **`dean/SummaryReports.jsx:107,109,179,221` (now shifted) — genuinely broken, FIXED,
  and the investigation surfaced three additional, more serious fabrication issues in the
  same file:**
  1. **The scale bug itself:** `Number(g.effective_grade !== null ? g.effective_grade :
     g.computed_grade)` fell back to `computed_grade` (a raw 0-100% score) whenever
     `effective_grade` was null, then compared that raw percentage directly against the
     1.00-5.00 GWA `<= 3.00` cutoff. Verified by execution before fixing: a genuinely
     passing 84% student (`computed_grade: 84`, `effective_grade: null`) evaluated as
     `84 <= 3.00 → false` — counted as FAILED. Fixed at all 3 remaining call sites with
     `resolveOfficialGwa(row).gwa`.
  2. **Fabricated placeholder values in the same block:** `averageGwa` defaulted to an
     invented `1.75` and `passed` defaulted to an invented `enrolled - 1` ("everyone
     except one student passed") whenever a class had zero real posted grades — both
     presented as real numbers with no indication they were placeholders. Replaced with
     `null` / the real (zero) `passedCount`; updated the render side's `'0.00'` fallback
     (itself misleading — 0.00 GWA means perfect scores, the opposite of "no data") to
     `'No grades yet'`, matching an honest-text pattern already used elsewhere in this
     same file.
  3. **A whole synthetic dataset generator:** when `reportType === 'intervention-outcomes'`
     and no formal evaluation records existed yet, a 26-line fallback block fabricated an
     entire fake report from raw grades — including a `baselineGwa` computed as
     `currentGwa + (isAtRisk ? 0.25 : -0.10)` (an invented historical snapshot, not real
     data) and a hardcoded `faculty: 'College Academic Board'` — with nothing in the UI
     disclosing any of it was synthesized. Same category as the dean trajectory chart
     fabrication fixed earlier this session. Removed entirely, per the same "honest empty
     state over fabrication" decision already made for that finding.
  4. **A hardcoded fake grade for one specific demo account:** `if (s.email ===
     'j.smith@student.sage.edu') gwa = 3.25;` — live in production logic, presumably
     leftover test scaffolding. Deleted; that student now correctly reads `gwa === null`
     like every other student with no posted grades.

  Re-verified by execution after all four fixes: the scale bug's exact repro case now
  correctly evaluates passing. `verify:grading` / lint (0 errors) / build all green.
- `AtRiskStudents.jsx:411` — already clean, uses `resolveOfficialGwa`. No action needed.
- `MyGradesList.jsx` (4 sites), `MyGradesDetail.jsx:249`, `AcademicInsights.jsx` (4 sites) —
  checked all 9 individually. None have the real bug: every one already calls
  `getTransmutedGrade(rating)` in the `effective_grade === null` branch, which is
  functionally equivalent to `resolveOfficialGwa` for the common case — these compute the
  correct GWA today. The one difference: `resolveOfficialGwa` additionally validates
  `effective_grade` is actually within `[1, 5]` before trusting it; these 9 sites trust any
  non-null `effective_grade` as-is. Low-probability edge case (only matters if
  `effective_grade` were already corrupted by some other upstream bug) — not a live defect,
  just duplicated logic instead of the shared helper. Lower-priority consolidation
  candidate, same class as the StudentRow.jsx/ClassRecordsList.jsx magic-number cleanup
  earlier, not fixed this pass.

**Item (b) is now fully re-verified across every file the corrections doc cited.** Only
`dean/SummaryReports.jsx` had the real bug (plus the three fabrication issues found
alongside it); every other cited site was already correct.

### IMPLEMENTATION_CORRECTIONS.md item (e) re-verified 2026-10-02 (session 3) — clean, no regression

**PR #41 irregular-student roster fields — fully intact end-to-end.** Checked every link in
the chain rather than trust the existing 1.23 checklist claim at face value:
- `classRoomService.js:getClassPriorityRoster` — `home_section_id`, `enrollment_type`,
  `is_irregular` all still present in the return object (confirmed by grep, not just
  reading the function signature).
- `section_id` is still selected — the original two separate `users` selects the
  corrections doc cited (`:328`, `:433`) have since been consolidated into one embedded
  join (`enrollments → users:student_id(..., section_id)`), but coverage is the same;
  `section_id` wasn't dropped in the consolidation.
- All 4 consuming components checked: `StudentRow.jsx` and `StudentRisk.jsx` and
  `GradeComputationPreview.jsx` (2 render sites) all render `<EnrollmentTypeBadge
  enrollmentType={student.enrollment_type} />` directly. `ScoreInput.jsx` doesn't render
  the badge itself — it delegates to `StudentRow` — but correctly populates
  `home_section_id`/`enrollment_type`/`is_irregular` on the student objects it builds
  before passing them down (confirmed at `ScoreInput.jsx:490-492`).

No action needed. This independently confirms the 1.23 checklist entry's claim holds up
under fresh verification, rather than just re-asserting it unchecked.

### IMPLEMENTATION_CORRECTIONS.md item (k) partially addressed 2026-10-02 (session 3)

**`GradeComputationsList.jsx:180`'s strict `totalWeight !== 100` — genuinely broken, FIXED.**
Confirmed real, not theoretical, by brute-force search over randomized weight splits before
fixing: `[41.9, 48.3, 9.8]` (a completely plausible admin-entered 3-way split) sums to
`99.99999999999999` under IEEE 754 floating-point addition, which the strict `!==` check
rejected — "the admin UI rejects formulas the engine accepts," exactly as the corrections
doc described. Fixed both the validation gate and the drawer's green/red visual indicator to
use `Math.abs(totalWeight - 100) <= WEIGHT_TOLERANCE` (now imported from `gradingMath.js`,
same constant the engine itself uses). Re-verified by execution: the fixed tolerance check
correctly accepts the `99.99999999999999` case that the old strict check rejected.
`verify:grading` / lint (0 errors) / build all green.

**`OFFICIAL_DYCI_PRESETS` duplication with `verifyGradingMath.js`'s `presets` — FIXED
2026-10-03.** Extracted the raw institutional template values (name, description,
components) into a new plain module, `src/lib/officialGradingPresets.js`, with no JSX
dependency, importable from both a `.jsx` admin page and a plain Node verify script.
`GradeComputationsList.jsx` now imports `OFFICIAL_DYCI_PRESETS` from there instead of
defining its own copy. `verifyGradingMath.js` imports the same array directly as its test
fixture — no second copy, no `key`/`isolatedKey`/`isolatedExpected` test-only fields grafted
onto the shared data. The `key` field was dropped entirely: neither consumer ever used it
(the admin UI only reads `name`/`description`/`components`; `calculateStoredTermRating` maps
by whatever key `createComponentKey` derives from each component's `name` at resolve time,
confirmed by reading `gradingMath.js` — it never hardcodes a key string), so the verify
script's "isolate one component and check its weight is honored" test now generically targets
`formula.components[0]` instead of a hardcoded key lookup, with the expected rating taken from
that component's own `.weight` instead of a separately hardcoded `isolatedExpected`. Re-run
by execution after the refactor: all 5 presets still resolve and pass their perfect-score and
isolated-component assertions identically. `verify:grading` / lint (0 errors) / build all
green. See `docs/update_plan/UPDATE_PLAN_AUDIT_2026-10-03.md`.

`seedDatabase.js:122-124`/`GradeComponentsSetup.jsx:29-32` dedup (the other half of item
(k)) — not checked this pass.

### IMPLEMENTATION_CORRECTIONS.md items (h) and (i) fixed 2026-10-02 (session 3)

**(h) — routing matrix: the fan-out trigger ignored `notification_preferences` entirely.**
`fan_out_notification_deliveries()` (in the not-yet-deployed
`20261002090000_email_notification_delivery.sql`) unconditionally queued an email delivery
for every `grade_posted`/`grade_changed` notification, regardless of whether the recipient
had opted out. Low practical impact today (no preferences UI exists yet, so no row has ever
been created to opt out with), but the fan-out logic itself needed to respect the table
once a UI does exist, rather than silently ignoring it. Fixed: the trigger now looks up
`(user_id, notification_type)` in `notification_preferences` before queuing email,
defaulting to enabled when no row exists (matching the table's own column defaults).
In-app delivery remains unconditional — per §5's standing rule, a user may mute a channel
but may not mute the record entirely, and there's no UI yet to opt out of the inbox itself
specifically. Edited directly in the migration file (safe — confirmed not yet applied to
the remote project, so no second migration was needed).

**(i) — the adviser-consult line was missing from grade notifications; added, with a real
interaction to get right.** `notifyGradePosted`/`notifyGradeChanged`'s `message` previously
said only "has been posted/updated" — no remark, no adviser prompt, less detail than the
architecture doc's own "in-app = full detail" layer is supposed to carry. Added the remark
plus *"If you have questions about your academic standing, please consult your adviser."*
— deliberately NOT an auto-generated "you may need to shift courses" judgment, per the
item's explicit prohibition; that's a human adviser's call.

**The catch:** `message` is the same field `AuthContext.jsx`'s
`triggerInboundLocalNotification()` uses as the device push-banner body (see the privacy
fix under 2.5 above). Adding the remark here would have silently reopened that exact leak
for `grade_posted`/`grade_changed` specifically, since those two weren't in the sensitive-
types denylist (they used to be safe — their old `message` never contained a remark). Added
both to `SENSITIVE_PUSH_TYPES` in the same pass, so the lock screen still only shows "New
Grade Posted. Open ASPIRE to view details." Verified by execution that the push body no
longer contains "Failed" while the in-app inbox message is unaffected. Also updated
`docs/NOTIFICATION_SYSTEM_CATALOG.md`'s §3 claim and the two sample messages in its catalog
table, which were about to go stale the moment this shipped.
`verify:grading` / lint (0 errors) / build all green.

### IMPLEMENTATION_CORRECTIONS.md items (f), (g), (j) re-verified 2026-10-02 (session 3) — all already satisfied

Checked rather than assumed "superseded":
- **(f)** per-channel message content — satisfied functionally (push/in-app/email each show
  the right level of detail, verified by execution multiple times this session), just not
  via a dedicated `notificationTemplates.js` file as the architecture doc originally
  sketched. No gap in actual behavior; not building a redundant file for its own sake.
- **(g)**'s RLS clause — `notification_deliveries` has RLS enabled with exactly one SELECT
  policy, scoped to `role = 'admin'` (confirmed by reading the policy text, not just that
  RLS is "on"). No broader client access exists. Implemented as admin-role rather than
  literal Postgres `service_role` — the right call, since the admin notification dashboard
  legitimately needs authenticated access to this table.
- **(j)** Reports module gaps — both cited requirements already correct in
  `reportsService.js`: enrollments filtered to `.eq('status', 'active')`, and null/ungraded
  scores excluded from averages throughout (not treated as zero).

### IMPLEMENTATION_CORRECTIONS.md — summary of this session's full pass

| Item | Status |
|---|---|
| (a) C11 plain-mean | Substantially covered via 1.13's MyGradesList fix + prior AcademicInsights confirmation |
| (b) ~18 scale sites | **Fully re-verified.** Only SummaryReports.jsx broken (fixed, +3 fabrication bugs found alongside it) |
| (c) One risk model | **Mostly resolved 2026-10-03.** 2 safe magic-number fixes shipped (2026-10-02); `dean/SummaryReports.jsx`'s standalone 3-tier model and `dean/Dashboard.jsx:588`'s ad-hoc rule both now call the canonical `calculateAcademicRisk()`/`computeUnifiedRisk()` (team decision: unify the two dean-facing models only). `student/AcademicInsights.jsx`'s `computeVerdict` remains a deliberately separate, gentler self-facing message — not a gap, a decision. |
| (d) GWA_BANDS brackets | **Fully re-verified.** Only GradeDistribution.jsx broken (fixed) |
| (e) PR #41 roster fields | **Fully re-verified, clean.** No regression found |
| (f) Per-channel content | **Confirmed satisfied**, functionally (no dedicated file, behavior is correct) |
| (g) Fan-out + RLS | **Fixed + confirmed.** Trigger now respects notification_preferences; RLS already correct |
| (h) Routing matrix | **Fixed** — preferences now respected in the fan-out trigger |
| (i) Adviser-consult line | **Fixed**, with a privacy interaction caught and closed in the same pass |
| (j) Reports module gaps | **Confirmed satisfied** — both requirements already correct |
| (k) Literal consolidation | Mostly resolved — WEIGHT_TOLERANCE bug fixed (2026-10-02); preset-file extraction done 2026-10-03 (`src/lib/officialGradingPresets.js`, consumed by both `GradeComputationsList.jsx` and `verifyGradingMath.js`, see below); seedDatabase dedup still flagged, not attempted |
| (l) Before/after diff script | Not built — a process/tooling item, not a bug; lower priority than everything above |

### Suggested next session

0. **Run the SECTION 10 deployment runbook** (migration + secrets + function deploy + test
   curl). Nothing about 3.3/3.4/3.5 can move from `[~]` to `[x]` until a real test email is
   confirmed delivered — code existing in the repo isn't the same as the feature working.
   Blocked on the team's own terminal/credentials; not something that can be done from here.
1. 3.7/3.8 (guardian consent UI + signed view links) — now has a real email pipeline to build on
   top of, once 3.3–3.5 are confirmed working end to end.
2. The 3 separate risk models flagged under item (c) — needs a design decision per site, not
   a mechanical fix.
3. (Optional polish, not blocking) Wire the Pivot tab's search box/status filter chips to also
   constrain `pivotRows`; `seedDatabase.js`/`GradeComponentsSetup.jsx` dedup, the remaining half
   of item (k) (preset-file extraction itself is done, 2026-10-03); the before/after diff script
   from item (l).
4. Re-run `npm run verify:grading && npm run lint && npm run build`, then flip the `[~]`/`[ ]`
   boxes above to `[x]` as each is actually fixed — not before.

### Independent re-audit 2026-10-03

A fresh pass (not written by the same session that authored the claims above) re-verified the
Master Execution Checklist against live code rather than trusting this document's own narrative.
Found and fixed one live bug this document had claimed was already fixed (1.21's third
`?? null` site), one duplicated-not-sourced constant (1.10's attendance thresholds), expanded
`verify:grading` from 37 to 79 assertions (1.30), closed the remaining `PASSING_GRADE` adoption
gap in `FacultyCharts.jsx` (2.7), and completed the `OFFICIAL_DYCI_PRESETS` extraction half of
item (k). Full findings, evidence, and the remaining manual-action items (Supabase runbook,
product decisions) are in `docs/update_plan/UPDATE_PLAN_AUDIT_2026-10-03.md` — read that file
before trusting any `[x]`/`[~]`/`[ ]` box above at face value for a second time.
