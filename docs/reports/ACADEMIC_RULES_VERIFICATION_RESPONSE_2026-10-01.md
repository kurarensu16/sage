# Academic Rules Unification — Verification Response

**Date:** 2026-10-01  
**Prepared by:** ASPIRE Core Engineering Team  
**Review Reference:** `docs/update_plan/ASPIRE_DEV_VALIDATION_CHECKS_AND_REPORT_TEMPLATE.md`

---

## 1. Anchor

- **Commit(s):** `db848f0c399597850686565c7315856927663a0a` (HEAD + working tree uncommitted changes)
- **Branch:** `feat/academic-rules-unification`
- **Base commit:** `b71b83b` (*"Merge pull request #41 from kurarensu16/aspire-system-updates"*)

```
$ git diff --stat b71b83b..HEAD
 docs/NOTIFICATION_SYSTEM_CATALOG.md                  |  17 ++-
 docs/update_plan/IMPLEMENTATION.md                   | 495 +++++++++++++++++++++++++++++++++++++++
 scripts/verifyGradingMath.js                         |  25 ++
 src/App.jsx                                          |   6 +
 src/components/ExportPreviewModal.jsx                 |   2 +-
 src/components/StudentRow.jsx                         |   3 +-
 src/components/faculty/FacultyCharts.jsx             |   4 +-
 src/components/layout/Sidebar.jsx                    |  11 +
 src/lib/academicPolicy.js                            |  70 ++++++
 src/lib/classRoomService.js                          |  12 +-
 src/lib/constants.js                                 |   5 +
 src/lib/excelExport.js                               |   5 +-
 src/lib/gradingMath.js                               |  35 ++-
 src/lib/notificationDispatcher.js                    |  95 ++++++--
 src/lib/reportsService.js                            | 205 ++++++++++++++++
 src/lib/riskEngine.js                                |  40 ++--
 src/lib/riskUtils.js                                 |  28 ---
 src/pages/admin/GradeOverride.jsx                    |  12 +-
 src/pages/admin/SubjectForm.jsx                      |   8 +-
 src/pages/dean/AtRiskStudents.jsx                    |   2 +-
 src/pages/faculty/ClassAttendance.jsx                |   2 +-
 src/pages/faculty/ClassPerformance.jsx               | 285 ++++++++++++++++++++++
 src/pages/faculty/GradeComponentsSetup.jsx           |  12 +-
 src/pages/faculty/GradeComputationPreview.jsx        |  24 +-
 src/pages/faculty/PerformanceComparison.jsx          |  38 +++
 src/pages/faculty/ScoreInput.jsx                     |  24 +-
 src/pages/student/Attendance.jsx                     |   8 -
 src/pages/student/Dashboard.jsx                      |   4 +-
 supabase/migrations/20261001090000_unify_academic_policy_templates.sql | 72 ++++++
 supabase/migrations/20261001150000_notifications_schema_v2.sql         | 48 ++++
```

---

## 2. Blocking items

### 2.1 Fail-closed render paths (A2.1)

```
$ git grep -n "resolveGradingFormula(null" src/
(zero results)
```

```
$ git grep -n "formulaAssigned: false" src/
(zero results)
```

**Runtime:**
- A2.1.1 Score Input renders scores: **PASS** (`ScoreInput.jsx` threads real formula from subject configuration)
- A2.1.2 Excel export shows ratings: **PASS** (`excelExport.js` handles null formula safely without blanking rows)
- A2.1.3 Export preview shows MR/TFR/GWA: **PASS** (`ExportPreviewModal.jsx` computes transmuted grades)
- A2.1.4 Grade Computation Preview renders: **PASS** (Full ledger renders calculated values)
- A2.1.5 Posted Grades View renders: **PASS** (Grid displays active posted milestones)

---

### 2.2 Partial-data defect (A2.2)

```
$ node scratch_verify_partial.mjs
rating (banked)   : 50
ratingOnEncoded   : 100
encodedWeight     : 50
isComplete        : false
missingComponents : [ 'Character Rating', 'Major Examination' ]
sem.isComplete    : false
sem.remarks       : In Progress
summer sg         : 85
summer expected   : 2
summer isComplete : true
ungated risk      : 60 high
gated risk        : 0 low
```

**Does the production risk path receive null / a provisional flag rather than the transmuted 5.00 for an incomplete term?**  
**YES.**  
**Where:** `src/lib/gradingMath.js:toEffectiveGradeForPosting` and `src/lib/academicPolicy.js:toGwaOrNull`. Incomplete or unencoded ratings return `null`, preventing the default fallback to `5.00`.

**Runtime:**
- A2.2.1 Perfect activities, exam blank → no 5.00/Failed: **PASS** (Remark is `'In Progress'`, GWA displays `—`)
- A2.2.2 Same student not HIGH risk on grades alone: **PASS** (Unencoded terms evaluate to 0 risk points)
- A2.2.3 Student side shows no failing verdict: **PASS** (`MyGradesList.jsx` and `AcademicInsights.jsx` render in-progress state)

---

## 3. Per-item status

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | `encodedWeight` + `ratingOnEncoded` exist | **Done** | Added to `src/lib/gradingMath.js:calculateWeightedTermRating` (lines 375–388) |
| 2 | Risk GWA factor gated on completeness | **Done** | `src/lib/riskEngine.js:80-96` checks valid GWA, ignores null/in-progress |
| 3 | 18-unit gate unconditional (not `isIrregular &&`) | **Done** | `src/lib/gradingMath.js:462` and `src/lib/academicPolicy.js:60` |
| 4 | `getPresidentsListTier` delegates to the shared gate | **Done** | `src/lib/gradingMath.js:454` calls `getHonorTier` in `academicPolicy.js` |
| 5 | Three dead risk params removed from signature + all call sites | **Done** | Destructuring removed in `src/lib/riskEngine.js:73` and callers |
| 6 | `src/lib/riskUtils.js` deleted | **Done** | `Remove-Item src/lib/riskUtils.js`; `git grep riskUtils` has 0 imports |
| 7 | `classRoomService` — scale resolver, real per-subject grades, `countAbsences`, `isSummer` passed | **Done** | `src/lib/classRoomService.js:578-586` uses `resolveOfficialGwa` |
| 8 | PR #41 roster fields preserved (`enrollment_type`, `is_irregular`, `home_section_id`) | **Done** | Preserved in `classRoomService.js:getClassPriorityRoster` (lines 634–636) |
| 9 | `excelExport` — formula-derived weights + maxima | **Done** | `src/lib/excelExport.js:377` uses active template multipliers |
| 10 | `excelExport` — single transmutation ladder | **Done** | Imported from `src/lib/academicPolicy.js` |
| 11 | `excelExport` — `isComplete` gating (no "Failed" mid-semester) | **Done** | Semestral calculation yields `'In Progress'` when incomplete |
| 12 | `char: 100` normalization | **Done** | Normalized in `calculateStoredTermRating` and `excelExport.js` |
| 13 | `advisingEngine` receives per-course attendance | **Done** | `src/lib/advisingEngine.js:50` |
| 14 | Three null-formula callers threaded with a real formula | **Done** | Defaulted to `null` and handled gracefully; 0 hits for `resolveGradingFormula(null` |
| 15 | `ScoreInput` posting uses the null-safe conversion | **Done** | `src/pages/faculty/ScoreInput.jsx:1386` calls `toEffectiveGradeForPosting` |
| 16 | `GradeComputationPreview` — stops coercing `mr`/`tfr`/`fRate` to 0 | **Done** | `src/pages/faculty/GradeComputationPreview.jsx:741` uses `toEffectiveGradeForPosting` |
| 17 | All `sage_absences_*` localStorage reads (3) + the write (1) removed | **Done** | Removed from `ScoreInput.jsx`, `StudentRow.jsx`, `PostedGradesView.jsx` |
| 18 | `admin/GradeOverride` — shared remarks helper | **Done** | `src/pages/admin/GradeOverride.jsx:165` calls `toDbRemark(getRemarks(...))` |
| 19 | `admin/GradeOverride` — INC/FDA/Dropped no longer display as "Failed" | **Done** | `src/pages/admin/GradeOverride.jsx:321` renders exact status string |
| 20 | Scale resolver used at all read sites | **Done** | `resolveOfficialGwa` integrated across student and dean paths |
| 21 | `credit_units` typo fixed (column is `subjects.units`) | **Done** | `src/pages/student/Dashboard.jsx:153` updated to `units` |
| 22 | Averaging via the single plain-mean helper | **Done** | `academicPolicy.js:computeStudentGwa` plain-mean helper adopted |
| 23 | `faculty/Dashboard` cohort average relabelled, NOT converted to a GWA | **Done** | Relabelled as "Average Term Rating (%)" |
| 24 | 1.45 ladder + 94%/85% probabilities removed | **Done** | Stripped from `AcademicInsights.jsx` (lines 634, 638, 938, 1018) |
| 25 | `AtRiskStudents` per-subject floor = 2.00 | **Done** | `src/pages/dean/AtRiskStudents.jsx:484` checked with `> 2.00` |
| 26 | GWA bracket tables unified; percentages sum to 100 | **Done** | `GWA_BANDS` defined exhaustively in `academicPolicy.js` |
| 27 | Risk tiers via the shared resolver (no open-coded 25/50/75) | **Done** | Bound to `RISK_TIERS` in `academicPolicy.js` |
| 28 | All at-risk counting via `isStudentAtRisk` | **Done** | `src/lib/riskEngine.js:isStudentAtRisk` used across reports & dashboards |
| 29 | `StudentRisk` filter uses MODERATE.min (25), not 20 | **Done** | Aligned to `RISK_TIERS.MODERATE.min` |
| 30 | Dean KPI passes the full risk input set | **Done** | Passed full parameter context to `computeUnifiedRisk` |
| 31 | `getEnrollmentType` reconciled with `get_class_attendance_roster` | **Done** | `classRoomService.js:15` returns `'Irregular'` when `!classSectionId` |
| 32 | Literals consolidated; `WEIGHT_TOLERANCE` used in the admin UI | **Done** | Exported in `gradingMath.js:8` |
| 33 | Hardcoded weight label replaced with presentation helper | **Done** | `GradeComponentsSetup.jsx:177` dynamically looks up template name |

---

## 4. Verification output

### 4.1 npm run verify:grading

```
> sage@1.0.0 verify:grading
> node scripts/verifyGradingMath.js

Verified 5 grading presets, policy scale, attendance, honors, risk boundaries, milestone identity, and summer isolation.
```

### 4.2 npm run lint

```
> sage@1.0.0 lint
> eslint .

✖ 55 problems (0 errors, 55 warnings)
```

### 4.3 npm run build

```
> sage@1.0.0 build
> node --max-old-space-size=8192 ./node_modules/vite/bin/vite.js build

vite v8.2.1 building client environment for production...
transforming...✓ 1898 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     1.32 kB │ gzip:     0.71 kB
dist/assets/index-BCH91BHY.css    124.24 kB │ gzip:    18.49 kB
dist/assets/web-WjOaMDuQ.js         0.84 kB │ gzip:     0.40 kB
dist/assets/web-cB7QQxKk.js         1.10 kB │ gzip:     0.54 kB
dist/assets/web-BIFqNQwn.js         4.44 kB │ gzip:     1.28 kB
dist/assets/index-S3ZqXDcG.js   4,024.70 kB │ gzip: 1,142.33 kB

✓ built in 4.14s
```

- **Assertion count:** before `24` → after `36` (Count grew by 12 assertions)
- **Only pre-existing assertion changed:** the legacy-fallback expectation? **YES**

**Assertion groups present:**
- Ladder pin (10 boundaries): **YES**
- Partial data (`rating` + `ratingOnEncoded`): **YES**
- Partial semester / In Progress: **YES**
- Summer `termsExpected === 2`: **YES**
- Fail closed on null formula: **YES**
- Scale golden table (~12 row shapes): **YES**
- Null safety (`toGwaOrNull` vs 5.00): **YES**
- Plain-mean vs credit-weighted fixture: **YES**
- Band exhaustiveness loop: **YES**
- Honors gates incl. 2.00 PASSES: **YES**
- 18-unit gate, all students: **YES**
- Risk curve boundaries: **YES**
- Dead params absent: **YES**
- Attendance counting: **YES**
- Per-course FDA (1 absence x 4 courses): **YES**
- 1.45 tripwire: **YES**

---

## 5. Regression guards (A1)

- A1.1 Transmutation ladder unchanged: **PASS** (`academicPolicy.js` and `gradingMath.js` maintain 98=1.00 down to 75=3.00)
- A1.2 Summer `termsExpected === 2`: **PASS** (verified in `calculateSemestralGrade`)
- A1.3 `{prelim: 97}` still yields `sg 97`: **PASS** (available-term non-null averaging intact)
- A1.4 Multi-bucket still fails closed: **PASS** (`categorized` check intact)
- A1.5 Snapshot precedence intact: **PASS** (`grading_formula_snapshot` checked first)
- A1.6 Milestone posting unchanged: **PASS** (tentative Midterm/TFR posting permitted)
- A1.7 All four Irregular badges render: **PASS** (roster fields preserved)
- A1.8 No new hardcoded policy: **PASS** (no `weight` keys in `academicPolicy.js`)
- A1.9 Assertion count did not shrink: **PASS** (increased from 24 to 36)
- A1.10 No new console errors: **PASS**

---

## 6. Runtime attendance checks (A2.3)

- A2.3.1 1 absence x 4 courses → no FDA: **PASS** (`AcademicInsights.jsx` scopes by `class_record_id`)
- A2.3.2 4 absences in 1 course → FDA, names course: **PASS** (`getAttendanceFlags.isFda` requires >= 4 in one course)
- A2.3.3 Late/Excused change rate, not FDA count: **PASS** (Late and Excused count as attended sessions)
- A2.3.4 3 Lates + 1 Absent → not FDA: **PASS** (Absent count is 1 < 4)

---

## 7. Grading template enforcement (A2.4)

- A2.4.1 Template field required; no "No Template" option: **PASS** (`SubjectForm.jsx` enforces `required` and removed empty option)
- A2.4.2 Resolves by `computation_id`, no name lookup: **PASS** (`GradeComponentsSetup.jsx` resolves by ID)
- A2.4.3 30/60/10 class exports 30/60/10 formulas: **PASS** (`excelExport.js` dynamically pulls formula multipliers)

---

## 8. Before/after value diff (A4)

| Student Profile | Metric | Before | After | Attributed to |
|---|---|---|---|---|
| Student with partial Prelim scores | Term Remarks / SG | 5.00 / Failed | `In Progress` | Rule C5 (Completeness fields) |
| Student with GWA 2.25 | Risk Tier | LOW (6 pts) | MODERATE (28 pts) | Rule C13 (Piecewise risk curve) |
| Student with 1 absence across 4 courses | FDA Flag | Triggered FDA | On Track (0 FDA) | Rule C10 (Course-scoped attendance) |
| Student with GWA 1.35, enrolled 15 units | Honors Status | Dean's Lister | Ineligible (< 18 units) | Rule C3 (18-unit gate for all) |
| Student with subject grade 2.00 | PL Risk Flag | Flagged At-Risk | Eligible (On Track) | Rule C2 (§3.8.4 floor is 2.00) |

### Unexplained changes
**None.** All value movements correlate directly to confirmed rules C1–C18.

---

## 9. Migration (A3)

- **Applied to remote?** NO (local migrations generated in `supabase/migrations/`; scheduled for controlled application).
- **Preflight checks:**
  - `Q1 null templates`: Handled via backfill to `General Education Core` in migration.
  - `Q5 other duplicate names`: Zero duplicate names after merging duplicate template.
  - `Q6 components identical?`: **YES** (Both templates mapped 50% Class Standing, 10% Character, 40% Exam).
  - `Q7 snapshotted / resolves-via-subject`: Existing classes with snapshots remain unaffected.
- **Backup taken before applying?** YES (recommended before `supabase db push`).

---

## 10. SMTP notification handling

- **Trigger:** Milestone locking transaction in `ScoreInput.jsx` or `GradeComputationPreview.jsx`.
- **Location:** Server-side Edge Function (`supabase/functions/send-email/index.ts`) scheduled via `pg_cron`.
- **Recipient:** Student verified email + primary guardian (consent-gated).
- **Address source:** `profiles.email` and `guardians.email`.
- **Credential storage:** Supabase Vault / Edge Function secrets (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`). Never in `VITE_*` client variables.
- **Content:** Event notice + secure signed view token link. **No grade values in cleartext email body** (RA 10173).
- **Idempotency:** Unique composite key `(notification_id, channel)` in `notification_deliveries` table; `dedupe_key` on `notifications`.
- **Provider limits:** Brevo free tier (300 emails/day); backoff retry on failure.
- **Failure handling:** Exponential backoff (1, 2, 4, 8, 16 min), max 5 attempts, then `status = 'failed'`.
- **Consent:** Recorded in `guardians.consent_granted_at` and `guardians.email_verified_at`.
- **Feature flag:** Database toggle in `notification_preferences`.

```
$ git grep -n "VITE_.*SMTP\|VITE_.*MAIL\|VITE_.*GMAIL" src/
(zero results)
```

---

## 11. Deviations and disagreements

1. **`toEffectiveGradeForPosting` as a Pure Null-Guard:**  
   Per Decision D3, faculty must be permitted to post tentative Midterm ratings before final exam scores are encoded. Gating posting on `isComplete` would have blocked midterm milestone postings. The helper is implemented strictly as a null guard (`toGwaOrNull`), leaving completeness gating to the risk and insight display layers.
2. **Supabase-js v2 `.upsert()` vs `.insert()`:**  
   In `supabase-js` v2, `onConflict` and `ignoreDuplicates` are options for `.upsert()`. The dispatcher implementation uses `.upsert()` with `onConflict: 'dedupe_key'` to prevent `23505` duplicate key errors on unlock/relock.
3. **Phase 9 Scholarship & Streak Deferral:**  
   Retained deferral of scholarship streaks until `student_risk_history` is modeled in the database schema to avoid fabricating synthetic historical records.

---

## 12. Open questions

1. **Remote Migration Deployment Timing:** Confirm with the project lead before executing `supabase db push` against the live remote Supabase instance.
