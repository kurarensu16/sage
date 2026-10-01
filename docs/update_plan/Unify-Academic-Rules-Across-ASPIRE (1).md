# Unify Academic Rules Across ASPIRE

> **Line references are as of commit `b71b83b`** (`feat: identify irregular students across faculty workflows`, PR #41). That pull shifted `classRoomService.js` by ~+14 lines and `StudentRow.jsx` / `ScoreInput.jsx` / `GradeComputationPreview.jsx` / `StudentRisk.jsx` by +1 to +9; those references have been re-verified. Locate code by the quoted snippet or function name rather than by line number, and re-check `git log --oneline -1` before starting.

## Context

ASPIRE has three canonical rule libraries (`src/lib/gradingMath.js`, `riskEngine.js`, `advisingEngine.js`), but ~24 page and component files re-implement the same academic rules inline with **different values**. This is not stylistic duplication — it produces contradictory numbers for the same student:

- A student's own GWA disagrees with the dean's figure for them (credit-weighted vs unweighted mean).
- Several dean pages compare a raw 0–100 `computed_grade` against the 1.00–5.00 passing cutoff of `3.00`, counting passing students as **Failed**.
- `student/Dashboard.jsx:153` reads `subjects.credit_units`, a column that **does not exist** (it is `subjects.units`), so every subject is weighted `3.0`; line 155 then feeds it a raw 0–100 value. The displayed GWA is a unit-less mean of 0–100 ratings shown on the 1.00–5.00 scale.
- Honors eligibility exists in four incompatible ladders. The handbook-correct one (`getPresidentsListTier`) has **zero callers**; the live UI uses a `1.45` cut found nowhere in the handbook plus hardcoded `probabilityPct` of 94/85 with no model behind them.
- Missing grading **components** contribute 0 to a term rating, so a student with perfect activities but an unencoded exam computes to rating 50 → GWA 5.00 → `remarks: 'Failed'` → risk 60 **HIGH**. Verified by executing the library.
- `ScoreInput.jsx:1384` and `GradeComputationPreview.jsx:739` write an unguarded `getTransmutedGrade(...)` into `posted_grades.effective_grade`; `getTransmutedGrade(null)` returns `5.00`, so a null term rating **persists as a failing grade**.
- `dean/Dashboard.jsx:343,537` and `AtRiskStudents.jsx:428` pass `classConfigMap[id]` as a bare subscript; a missing key yields `undefined` → `{}` → **silent substitution of the legacy 50/10/40 formula** for classes with a configured formula.

`docs/ASPIRE_GRADING_AND_RISK_RULES_DEFENSE_GUIDE.md` documents the intended rules, and several of its claims are currently disprovable in a live demo (§3.1 "no duplicated risk logic anywhere"; Q3's scholarship-streak tracking, which does not exist; Q4's premise that GWA 2.25 is flagged Moderate — it scores 6 points, LOW).

**Outcome:** every academic rule has exactly one definition, consumed everywhere; the defense guide becomes true; and the partial-data defect stops mislabelling students who are performing well.

## Decisions locked with the user

| # | Decision |
|---|---|
| D1 | **President's List only.** §3.8.4 (no subject grade numerically worse than 2.00) is a hard eligibility **gate**; the average across all subjects then selects the tier — Sapientia ≤1.25 / Excellentia ≤1.50 / Virtus ≤1.75. Delete the `1.45` ladder, the "1st/2nd Class Dean's Lister" labels, and the 94%/85% probabilities. |
| D2 | Canonical pipeline is **per-subject percentage → transmute → then average subjects**. Transmutation always happens before any comparison to a GWA threshold. |
| D3 | **Milestone posting stays as-is.** Grades posted at Midterm Rating and TFR are *tentative and visible*, subject to change after faculty consultation. No `grade_remarks` migration. Display them as tentative; reserve final Passed/Failed for the semestral milestone. Component-level incompleteness within a term is a separate defect and is still fixed. |
| D4 | **Single implementation pass.** All work lands together rather than as separately shipped phases. The phase numbering below is retained as *work packages and dependency order*, not as release boundaries. See **Execution order** for the sequence within the one pass. |

### Confirmed rules (settled with the user)

| # | Rule | Consequence |
|---|---|---|
| **C1** | **President's List only.** §3.8.4 is a hard eligibility *gate*; the subject average then selects the tier — Sapientia ≤1.25 / Excellentia ≤1.50 / Virtus ≤1.75. The `1.45` ladder and the 94%/85% probabilities are deleted. | Phase 4 |
| **C2** | **The §3.8.4 floor is 2.00, and exactly 2.00 is acceptable.** Only `> 2.00` disqualifies — which `hasGradeBelow200 = some(g => g > 2.00)` already implements correctly. A student may carry one subject at 2.00 and still qualify if the average lands ≤1.75. **Therefore `AtRiskStudents.jsx:484`'s `> 1.75` is a bug**, and `ASPIRE-System-Scope-SRS-and-Architecture.md:242`/`:105` are wrong at `> 1.75`. | Phase 4 code, Phase 7 docs |
| **C3** | *(Now better supported: PR #41's `getEnrollmentType` gives a canonical `isIrregular`, so the parameter C3 retains for message wording finally has a reliable source — see C18.)* **Minimum 18 units, applied to EVERY student** — not only irregulars. **Therefore `gradingMath.js:498`'s `if (isIrregular && units < 18)` is a bug** that silently exempts regular students. Rename to `HONORS.minimumUnits`, drop the `isIrregular` condition; `isIrregular` survives only for message wording. | Phase 4 |
| **C4** | **Streak counts regular semesters only** (`1st`, `2nd`); Summer is where the grant is *availed*, not part of the qualifying count (1st PL + 2nd PL → discount on Summer). `streakLength` is cumulative and displayed ("3 consecutive President's List semesters"). **Grant tier comes from the 2-semester aggregate GWA** (§5.2.5.1.3/.4 "across 2 semesters"), not either semester alone. | Phase 9 |
| **C5** | **Milestone posting stays as-is.** MR and TFR grades are tentative-but-visible and may change after faculty consultation; no `grade_remarks` migration. Component-level incompleteness within a term remains a defect to fix. | Phase 1 |
| **C6** | **Only `Absent` counts as an absence.** `Present`, `Late` and `Excused` all count as attended; the four labels exist for visual/record purposes only. So `attendanceRate = (total − absent) / total`, and **only** `Absent` advances the FDA count. **Therefore `AcademicInsights.jsx:246-248` is wrong twice**: it half-credits Late at `* 0.5` and omits `Excused` from the numerator entirely, so an excused student's rate is penalized. | Phase 6 |
| **C7** | **A semester with no enrollment pauses the streak** — it is skipped, not broken. Combined with C4 (Summer excluded), the rule generalizes: `streakLength` is computed over the sequence of **enrolled regular semesters**, skipping Summer terms and non-enrolled semesters entirely via one `isSkippableSemester()` predicate. So `1st(PL) → [no enrollment] → 2nd(PL)` yields `streakLength === 2`, `qualified`. Caveat to note in the guide: this can make the §5.2.5.1.1 "1-year residency" span longer than one calendar year. | Phase 9 |
| **C8** | **An enrolled Summer with PL is shown but not counted.** It appears in the student's history and archive, but does not increment `streakLength` — keeping C4 coherent, since Summer is where a grant is availed, never where it is earned. Same skip predicate as C7. | Phase 9 |
| **C9** | **Eligibility only — no grant records.** ASPIRE never asserts that a student holds a discount. No `student_scholarship_grants` table, no admin screen, no new RLS surface. The lapse warning survives, rephrased against *standing* rather than possession: "you are at risk of losing your President's List standing, which a tuition grant depends on." | Phase 9 |
| **C10** | **Absences are PER SUBJECT (per `class_record_id`), never term-wide.** FDA is a per-course rule, so the overall-scope test is `some(course => course.absences >= 4)` — **never `sum(absences) >= 4`**. `attendance_records` is correctly keyed `UNIQUE(student_id, class_record_id, date)`, so the schema supports this; the bug is in the query. **`AcademicInsights.jsx:236-239` selects `status, is_fda` filtered only by `student_id`** — no `class_record_id`, no grouping — then sums across all courses. **A student with 1 absence in each of 4 courses is currently flagged FDA.** | Phase 6 |
| **C11** | **The GWA used for President's List is a PLAIN MEAN of per-subject GWAs** — "sum of all GWA per subject, then divide by the number of subjects." Units are **not** a weighting factor; the 18-unit minimum (C3) is a separate eligibility gate. So `computeStudentGwa` uses unweighted-mean semantics, and this same value drives honors, scholarship and dean figures — one number, every portal. This resolves the 5-unit-subject counter-example in favour of the qualifying outcome (1.6563, eligible). | Phase 3 |
| **C12** | **Delete the three dead risk parameters.** `failingSubjectsCount`, `majorExamAverage` and `hasGradeBelow200` are accepted and ignored — all three at their worst values leave the composite at `0`. Remove them from `calculateAcademicRisk` and `computeUnifiedRisk`, and drop the arguments at all ~6 call sites. The §3.8.4 floor lives in `getHonorTier` (Phase 4), **not** in the risk score — per `ASPIRE-Student-Risk-Implementation-Plan.md:298`. Signature then matches §3.2's documented 4-factor formula. Side effect: the exam-average fallback divergence (100/85/80/75) disappears with the parameter. | Phase 5a |
| **C13** | **Recalibrate the GWA factor so the 2.01–3.00 band reaches MODERATE.** Verified: a *linear* 1–35 ramp still leaves 2.25 → 9 and 2.50 → 18 in LOW, so linear cannot satisfy §3.3. Use a **step at the 2.00 boundary, then a ramp** — principled because crossing 2.00 is categorical (it leaves the honors-eligible range, §3.8.4's floor being exactly 2.00):<br>`gwa ≤ 2.00 → 0`<br>`2.01–3.00 → 25 + round(((gwa − 2.00) / 1.00) × 10)` → 25–35<br>`gwa > 3.00 → 50 + round(((gwa − 3.01) / 1.99) × 10)` → 50–60<br>Yields 2.01→25, 2.25→28, 2.50→30, 2.75→33, 3.00→35, 3.01→50, 5.00→60. **This makes §3.3's table and Q4 true for the first time**, and preserves §3.4's worked example (GWA 3.00 + 4 absences = 85, CRITICAL), 4-absences-alone = HIGH, and Q5's 135→100 cap. `RISK_WEIGHTS.gwa` stays 60. | Phase 5a |
| **C14** | **Every subject must have a grading template. No hardcoded fallback.** Make the Grading System Template field required in `SubjectForm.jsx` and remove the "No Template (Professor Defaults Standard)" option. A migration assigns `'General Education Core'` to every subject with `computation_id IS NULL`, then sets the column `NOT NULL`. `resolveGradingFormula(null, …)` then **fails closed** (`ok: false`) exactly as an invalid configured formula already does — `LEGACY_GRADING_COMPONENTS` is removed from every runtime resolution path. The database is the single source of truth for weights. | Stage A (migration), Phase 0, Phase 1 |
| **C15** | **Merge the duplicate template into `'General Education Core'`.** The backfill migration `20260929130000` created `'General / Professional Education Scale'` and `'General Education Core'` with identical 50/40/10 weights. Repoint every subject from the former to the latter, then delete it. Removes the display-name string lookup in `GradeComponentsSetup.jsx:71` and its hardcoded fallback label at `:182`. Add a `UNIQUE` constraint on `grade_computations.name` so a duplicate cannot recur. | Stage A (migration) |
| **C16** | **Student-side display plus notification — no admin screen.** Scholarship eligibility surfaces only to the student, as their own standing, and the student is **notified** when that standing changes. No admin CRUD, no staff-facing roster, no grant records (C9). Add `scholarship_eligibility` to `NOTIFICATION_TITLES` and dispatch on a state transition — `candidate → qualified` ("you now meet the 2-semester President's List requirement"), and `qualified → at_risk_of_lapsing` ("your President's List standing is at risk, which a tuition grant depends on"). Dispatch **only on transition**, never on every recompute, or the 4-second poller in `AuthContext` would spam. Transitions are detectable because `student_risk_history` (Phase 9 prerequisite) persists the prior state. | Phase 9 |
| **C17** | **The handbook wins over every companion document.** Where `ASPIRE-System-Scope-SRS-and-Architecture.md` or `Implementation-Plan-ASPIRE-Major-System-Update.md` disagree with the Student Handbook sections, the handbook is authoritative and the companion doc is corrected — they are documentation errors, not alternative rules. Specifically: the SRS's `> 1.75` per-subject floor (`:242`, `:105`) → **2.00** per §3.8.4; the SRS transmutation table (`:527-529`) must include **Virtus (1.75)** per §3.8.2.3; and `Implementation-Plan:70`'s "Moderate / President's Lister (PL) Risk" label must stop conflating a risk tier with an honors class. | Phase 7 |
| **C18** | **`getEnrollmentType` is the canonical irregularity classifier — but it currently disagrees with its SQL twin.** PR #41 added `getEnrollmentType(studentSectionId, classSectionId)` to `classRoomService.js:15-19`, deliberately class-contextual (a student is irregular *for a class*, not globally). Its own comment says it "mirrors `get_class_attendance_roster` in PostgreSQL" — and for a null **student** section both return `Irregular`, but they diverge when the **class** has no section: the JS returns `'Regular'` (`if (!classSectionId) return 'Regular'`) while the SQL `CASE WHEN u.section_id = v_section_id ... ELSE 'Irregular'` evaluates `x = NULL` to NULL and falls through to `'Irregular'` (`20260606164500_add_attendance_and_semester_transition.sql:137-140`). Pick one and make the other match; `ClassAttendance.jsx:167,249` reads the SQL version while every other roster reads the JS one, so the same student can be badged differently on two faculty screens. | Phase 6 |

### ✅ All blocking decisions resolved — C11 (averaging), C12 (dead parameters), C13 (GWA curve), C14/C15 (grading templates). Implementation is unblocked.

### Architectural invariant — grading weights are per-subject, never in `academicPolicy.js`

Component weights live in the database: `grade_computations` + `grade_computation_components`, linked by `subjects.computation_id`, and frozen per class in `class_records.grading_formula_snapshot`. `resolveGradingFormula` remains the sole authority on which formula a class uses. **`academicPolicy.js` must contain zero component weights** — it holds only institution-wide policy (transmutation ladder, 3.00 passing cutoff, 1.75 honors ceiling, 2.00 subject floor, 18-unit minimum, FDA at 4, risk tiers), which is per-institution by definition rather than per-subject.

This plan *reduces* hardcoding rather than adding it — e.g. `excelExport.js:377-385` currently writes `*50`, `*0.1`, `*40` into exported spreadsheets regardless of the class's real formula, so a 30/60/10 class exports the wrong arithmetic today.

**Resolved by C14 and C15 — the no-template case.** Previously `SubjectForm.jsx:373` offered "No Template (Professor Defaults Standard)" and saved `computation_id = null`, after which three paths resolved it three ways: the faculty setup page looked up a template **by display-name string** (`GradeComponentsSetup.jsx:71`); the grading engine ignored the database and used hardcoded `LEGACY_GRADING_COMPONENTS`; and the label promised professor-level defaults that were never built (`custom_computation_id` / `is_weight_locked` exist only in `docs/FACULTY_GRADE_WEIGHT_CUSTOMIZATION_SPEC.md`). They agreed only by coincidence at 50/40/10. After C14/C15 every subject has a template, every path resolves it by `computation_id`, and a null fails closed.

**Note on the unbuilt faculty-customization spec:** it remains out of scope. With C14 in place it can be added later without conflict — a `custom_computation_id` on `class_records` would simply take precedence over `subjects.computation_id` in the resolution order — but the "Professor Defaults" label must not ship until it exists.

**Enforce with an assertion:** no export of `academicPolicy.js` may contain a key named `weight`, and `getHonorTier` / `getRemarks` / `getRiskTierForScore` must produce identical results for two classes with different assigned formulas but the same resulting GWA.

### Still open

| # | Question | Blocks | Status |
|---|---|---|---|
| O2 | **Document `Late` and `Excused`.** C6 settles the counting (only `Absent` counts). But §2.3 never mentions either status, and `Excused` is missing from the schema doc's enum even though the real migration defines it. Documentation gap only — no behavioural question remains. | Phase 7 docs sync | Open, non-blocking |

**Closed:** O1 (C11 — plain mean; units read from `subjects.units` for the 18-unit gate only, never as a weight), O3b (C8), O5 (C9/C16 — no admin screen; student-side display plus notification), O6 (C2), O7 (C17 — handbook wins, correct the SRS), O8 (C3).

## Approach

Add **one** new library, `src/lib/academicPolicy.js`, as the owner of institutional *policy classification* — honors ladders, GWA display bands, remark vocabulary, attendance semantics, scale resolution, and which averaging method is official. The three existing libs each own a *computation* and none owns policy; that missing owner is why 24 files each invented one.

Everything else is **additive**: new exports plus call-site migration, so `scripts/verifyGradingMath.js` keeps passing unmodified (it pins current behavior, including `isolatedExpected: 50`).

Import DAG — `academicPolicy.js` must never import `riskEngine` or `advisingEngine`:

```
gradingMath.js      → (nothing)
academicPolicy.js   → gradingMath.js        [getTransmutedGrade only]
riskEngine.js       → gradingMath, academicPolicy
advisingEngine.js   → academicPolicy        [re-derives ADVISING_THRESHOLDS]
pages / components  → all of the above
```

Reuse rather than rebuild:
- `getPresidentsListTier` ([gradingMath.js:480](../../Downloads/New%20ASPIRE/sage/src/lib/gradingMath.js)) implements the tier ladder and the §3.8.4/§3.8.5 gates correctly — revive it as a thin delegate to the new `getHonorTier`. **One intentional divergence** (per O8): its unit gate at `:498` reads `if (isIrregular && units < 18)`, which exempts regular students. The confirmed rule is a flat 18-unit minimum for **everyone**, so `getHonorTier` drops the `isIrregular` condition. The parity assertion therefore covers tier selection plus the grade-floor and INC gates, and explicitly asserts the unit gate **differs** — a regular student with 15 units is eligible under the old function and ineligible under the new one.
- `classRoomService.js:580-586` already resolves the two grade scales correctly — extract it as `resolveOfficialGwa`, rather than inventing a helper.
- `getGradingStoragePresentation` ([gradingMath.js:307](../../Downloads/New%20ASPIRE/sage/src/lib/gradingMath.js)) already derives formula labels — use it instead of the hardcoded "50% Activities | 40% Exams | 10% Character" string.
- `RISK_TIERS`, `ADVISING_THRESHOLDS`, `LEGACY_GRADING_COMPONENTS` already exist — re-derive from them, do not restate their values.
- **Delete `src/lib/riskUtils.js`** — a dead re-export barrel with zero importers (the three textual references to it are stale comments).

---

## Execution order (single pass, per D4)

Work packages are numbered 0–9 below. Within one pass the **edit sequence** matters more than the package boundaries, because several packages touch the same files and later ones depend on earlier exports existing. Follow this order:

**Stage A — build the foundation, change no behaviour**
0. **Database migration (C14, C15) — must run first.** In one migration:
   1. Repoint every subject using `'General / Professional Education Scale'` to `'General Education Core'`.
   2. Assign `'General Education Core'` to every subject where `computation_id IS NULL`.
   3. Delete the `'General / Professional Education Scale'` components and row (only after step 1, for FK safety).
   4. `ALTER TABLE subjects ALTER COLUMN computation_id SET NOT NULL`.
   5. Add `UNIQUE` on `grade_computations.name`.
   Existing `class_records.grading_formula_snapshot` values are frozen and unaffected — only classes without a snapshot resolve through the subject. Verify with `SELECT count(*) FROM subjects WHERE computation_id IS NULL` → `0`, and exactly one template named `'General Education Core'`.
1. Create `src/lib/academicPolicy.js` complete (package 0). Nothing imports it yet.
2. Add the additive fields to `gradingMath.js`: `encodedWeight`, `ratingOnEncoded`, `termsExpected`, `termsEncoded`, `isComplete`, `'In Progress'` remark, `export WEIGHT_TOLERANCE`, `toEffectiveGradeForPosting`, `TRANSMUTATION_LADDER`.
3. Fix the two confirmed `gradingMath.js` bugs: the unit gate at `:498` (C3) and `getPresidentsListTier` → delegate to `getHonorTier` (C1/C2).
3a. **Make `resolveGradingFormula` fail closed on a null formula (C14).** `formulaAssigned: false` → `{ ok: false, source: 'invalid', error: 'No grading template assigned to this subject.' }` instead of returning the legacy formula. Remove the `LEGACY_GRADING_COMPONENTS` fallbacks in `getGradingStoragePresentation` (`:308`) and in `computeTentativeGradeDetails` (`riskEngine.js:240-244`). This also makes Phase 1's `usedFallbackFormula` detection unnecessary — a missing config now yields an invalid formula and a `null` GWA directly.
4. Add the tier resolver + completeness hook to `riskEngine.js`; re-derive `ADVISING_THRESHOLDS` from `ATTENDANCE`.
5. Apply the P5a-1 decision to `calculateAcademicRisk`'s signature.
6. Delete `src/lib/riskUtils.js`.
7. **Write the full assertion suite now**, before migrating any call site. `npm run verify:grading` must pass. This is the safety net for everything in Stage B.

**Stage B — migrate the libraries**
8. `classRoomService.js` — `resolveOfficialGwa` at `:580-586`, real `hasGradeBelow200`/per-subject grades, `countAbsences` at `:535`, pass `isSummer`, drop the phantom `colsMap` defaults at `:567`, gate the GWA factor on completeness.
   ⚠️ **Do not drop the fields PR #41 added to the roster return value** — `home_section_id`, `enrollment_type`, `is_irregular` (`:634-636`), plus `section_id` in the two `users` selects (`:328`, `:433`). Four components depend on them: `StudentRow.jsx`, `StudentRisk.jsx`, `GradeComputationPreview.jsx`, and `ScoreInput.jsx` (which also calls `getEnrollmentType` directly as a fallback). Refactoring `getClassPriorityRoster` without preserving them silently removes every Irregular badge.
9. `excelExport.js` — formula-aware maxima and weights, one `TRANSMUTATION_LADDER`, `char: 100` normalization, `isComplete` gating, `getRemarks`.
10. `advisingEngine.js` — accept per-course attendance (C10) instead of a single aggregate.
10a. **Remove the three hardcoded-null formula defaults (C14)** — these must change in the same stage as step 3a or those views stop rendering grades: `StudentRow.jsx:185`, `excelExport.js:89` and `ExportPreviewModal.jsx:31` each call `resolveGradingFormula(null, { formulaAssigned: false })` when no formula prop is supplied. Make the formula a required prop threaded from the class record; if absent, render an explicit "no grading template" state rather than computing.
10b. **Admin and faculty UI (C14, C15):** `SubjectForm.jsx` — add `required` to the template select, delete the `"No Template (Professor Defaults Standard)"` option at `:373`, and validate `computationId` alongside `code`/`name` at `:223`. `GradeComponentsSetup.jsx:70-75` — delete the display-name string lookup; resolve by `computation_id` only, and show an error state if it is somehow missing. Remove the hardcoded fallback label at `:182`.

**Stage C — migrate write paths (highest consequence)**
11. `ScoreInput.jsx` — `toEffectiveGradeForPosting` at `:1374,1384`, `getRemarks` at `:1375`, summer-aware term list, `char` normalization, remove the `sage_absences_*` localStorage **write at `:603` and its own read at `:187`**.
12. `GradeComputationPreview.jsx` — same set (`:499-500`, `:739`), plus stop coercing `mr`/`tfr`/`fRate` to `0` at `:517-523`.
13. `admin/GradeOverride.jsx` — `toDbRemark(getRemarks(...))` at `:165`, and the INC/FDA/Dropped display bug at `:317,321,372,376`.

**Stage D — migrate read paths**
14. Scale: replace every `effective_grade ?? computed_grade` with `resolveOfficialGwa` (~20 sites). Start with `student/Dashboard.jsx:153,155` — the `credit_units` typo and the raw-percentage GWA.
15. Averaging: widen the three dean queries to fetch `subjects(units)`, then route every average through `computeStudentGwa` / `averageCohortGwa`. Relabel `faculty/Dashboard.jsx:311-320` as a term-rating average rather than converting it.
16. Honors: replace all four ladders with `getHonorTier` / `GWA_BANDS`, including `AtRiskStudents.jsx:484`'s `> 1.75` floor bug (C2).
17. Risk tiers: replace open-coded `25/50/75` with `getRiskTierForScore`; route all at-risk counting through `isStudentAtRisk`; fix `dean/Dashboard.jsx:374`'s 2-of-10 parameter call.
18. Attendance: fix the C10 scope bug at `AcademicInsights.jsx:236-239` first, then the C6 counting, then delete the three localStorage reads and the fabricated logs.
18a. **Reconcile `getEnrollmentType` with its SQL twin (C18).** One branch in JS or one `COALESCE` in SQL. Small, but it currently lets the same student be badged differently on two faculty screens.

**Stage E — consolidate and document**
19. Literals: the three 50/40/10 copies, `WEIGHT_TOLERANCE` in the admin UI, `DYCI_COMPUTATION_PRESETS` shared with the verify script.
20. Advisor context v2: the scope model, per-subject and overall additions, `sanitizeInsightContext` parity, the system-prompt rules.
21. Streak + stake (package 9) — **only if the history prerequisites are built**; otherwise implement `getScholarshipStanding` and `getSubjectStake` against fixtures and leave them unwired.
22. Sync `docs/ASPIRE_GRADING_AND_RISK_RULES_DEFENSE_GUIDE.md`, the SRS, and the schema doc.

**Ordering rules that must not be violated**
- **Step 0 (migration) before step 3a (fail closed).** If the engine starts failing closed on null while subjects still have `computation_id IS NULL`, every one of those classes stops producing grades.
- **Step 3a and step 10a in the same stage.** Three render paths pass a hardcoded null formula; failing closed without threading the real formula through them blanks those views.
- Step 7 before any of Stage B–D. Migrating call sites without the assertion suite in place removes the only check that the arithmetic didn't move.
- Stage C before Stage D. A bad `effective_grade` persists and contaminates every read path; fixing reads first leaves the generator running.
- Within Stage D, step 14 (scale) before step 15 (averaging). Averaging a mix of 0–100 and 1.00–5.00 values makes the method comparison meaningless.
- Step 16 (honors) after step 15 (averaging), since eligibility reads the average.
- Step 18's C10 scope fix before its C6 counting fix — counting the wrong set correctly is still wrong.

---

## Before / After

Every row is a verified current behaviour, not a supposition. Values marked ✓ were produced by executing the current library.

### Grading correctness

| Behaviour | Before | After |
|---|---|---|
| Perfect activity scores, exam + character not yet encoded | rating **50** → GWA **5.00** → remarks **"Failed"** → risk **60 HIGH** ✓ | `ratingOnEncoded` **100**, `encodedWeight` 50, remarks **"In Progress"**, GWA factor contributes **0** |
| Only Prelim encoded at 74 | SG **74** → GWA **5.00** → **"Failed"** ✓ | `isComplete: false` → **"In Progress"**, no verdict |
| `getTransmutedGrade(null)` | **5.00** (a failing grade) ✓ | `toGwaOrNull` → **null** → renders `—` |
| Faculty posts a milestone whose term rating is null | silently persists `effective_grade = 5.00` | **hard error** naming the missing term |
| Posted row with both `effective_grade` and `computed_grade` null | student sees **5.00 / Failed** | `—` |

### Grading templates (C14, C15)

| Behaviour | Before | After |
|---|---|---|
| Subject created with no template | allowed — "No Template (Professor Defaults Standard)" | **not allowed** — template required |
| Grading engine on a no-template subject | silently uses hardcoded `LEGACY_GRADING_COMPONENTS` (50/10/40) | impossible by schema (`NOT NULL`); if reached, **fails closed** |
| Faculty setup page on a no-template subject | looks up a template **by display-name string** | resolves by `computation_id` only |
| "Professor Defaults" label | promises faculty-level weights that were never built | removed |
| Duplicate 50/40/10 templates | `'General / Professional Education Scale'` **and** `'General Education Core'` | one — `'General Education Core'`; `UNIQUE` on name |
| Source of truth for weights | database **and** a hardcoded constant, agreeing by coincidence | **database only** |

### Scale

| Behaviour | Before | After |
|---|---|---|
| Student dashboard GWA | **84.00** — a raw 0–100 rating shown on the 1.00–5.00 scale (`credit_units` column doesn't exist, so all weights pinned to 3.0) | **2.25** |
| Dean pass/fail where `effective_grade IS NULL` | `84 > 3.00` → counted **Failed** | transmuted → **2.25 → Passed** |
| `AtRiskStudents` risk from a leaked 0–100 value | clamps to 5.00 → **60 pts, spurious HIGH** | correct GWA → correct tier |

### GWA method (C11 — plain mean)

| Behaviour | Before | After |
|---|---|---|
| Student's own GWA | three different methods: credit-weighted (`MyGradesList`, `AcademicInsights`), broken-weighted (`student/Dashboard`), unweighted (dean pages) | **plain mean everywhere** |
| Dean per-student GWA and college average | unweighted mean | **unchanged** — no dean figures move |
| Cross-portal agreement | a student's GWA disagreed with the dean's figure for them | identical by construction |

### Honors (C1, C2, C3)

| Behaviour | Before | After |
|---|---|---|
| Tier ladder | **1.45** cut, "1st/2nd Class Dean's Lister", hardcoded **94% / 85%** probabilities | Sapientia ≤1.25 / Excellentia ≤1.50 / Virtus ≤1.75 + `unmetRequirements[]` with §citations |
| Per-subject floor | `> 1.75` in `AtRiskStudents:484` (matching the SRS), `2.00` in the handbook | **2.00** everywhere; exactly 2.00 is acceptable |
| 18-unit minimum | applied **only to irregular students** (`gradingMath:498`) | applied to **every** student |
| `getPresidentsListTier` | dead — **zero callers** | the single implementation |
| GWA bracket charts | three divergent tables; grades in (1.50,1.75) and (2.50,2.75) matched **no** bracket and vanished while still counting in the total | one `GWA_BANDS`, gap-free by construction, percentages sum to 100 |

### Risk matrix (C12, C13)

| Input | Before | After |
|---|---|---|
| GWA 2.25 | **6 pts, LOW** ✓ — while §3.3 and Q4 claim Moderate | **28 pts, MODERATE** |
| GWA 2.50 | 13 pts, LOW ✓ | 30 pts, MODERATE |
| GWA 2.75 | 19 pts, LOW ✓ | 33 pts, MODERATE |
| GWA 4.00 | **43 pts, MODERATE** ✓ — while §3.3 claims "automatic HIGH" | **55 pts, HIGH** |
| `failingSubjectsCount`, `majorExamAverage`, `hasGradeBelow200` | accepted and **ignored** — all three at worst values leave the score at **0** ✓ | **deleted**; signature matches §3.2's 4-factor formula |
| Dean at-risk KPI | `computeUnifiedRisk` called with **2 of 10** params — attendance, trajectory and missing work contribute nothing | full factor set |
| Dean section counts vs the dean KPI | **don't sum** — three different at-risk rules in one file | one rule via `isStudentAtRisk` |
| Exam-average fallback | four different values (100 / 85 / 80 / 75) across call sites | moot — the parameter is gone |

### Attendance (C6, C10)

| Behaviour | Before | After |
|---|---|---|
| 1 absence in each of 4 courses | **flagged FDA**, severity `critical`, `consultationRecommended: true`, and the verdict is persisted | **not flagged** — FDA is per `class_record_id` |
| `Late` | half credit (`* 0.5`), in one file only | full credit |
| `Excused` | omitted from the numerator, so it **penalised** the rate | counts as attended |
| `StudentRow` absence count | read from `localStorage` (`sage_absences_*`); stale or unwritten yields **0**, feeding the risk engine | passed as a prop from the DB |
| `PostedGradesView` absences | reads a cache key nothing writes in that route → always **0** | fetched |
| Class with no attendance records | renders **4 fabricated log entries** | explicit empty state |
| `ClassAttendance` "FDA" filter | `>= 4 \|\| >= 2` — the `>= 4` clause is dead, so it returns `>= 2` while its badge uses `>= 4` | one `getAttendanceFlags` |

### Exports

| Behaviour | Before | After |
|---|---|---|
| Excel record sheet for a 30/60/10 class | prints **50/10/40** formulas and 20-point maxima | derived from the resolved formula |
| Report of Grades for an in-progress semester | prints **"Failed"** | `isComplete`-gated |
| Transmutation ladder in `excelExport` | encoded **three times** (`:398`, `:405`, `:459-472`) | one `TRANSMUTATION_LADDER` |

### AI advisor (Phase 8)

| Behaviour | Before | After |
|---|---|---|
| Activity `description` | sent by the client at `:851`, **dropped** by `sanitizeContext` | reaches the model, selectively for the activities that matter |
| Per-course absences | only the institution-wide total survives sanitization | per-course, so FDA advice is course-specific |
| Honors context given to the LLM | the **fabricated 94%/85%** and the non-handbook 1.45 ladder, labelled *"AUTHORITATIVE"* — so the model repeats invented numbers to students | real `getHonorTier` result with handbook citations |
| Scope vocabulary | three layers disagree (`overall\|subject\|progress` vs `overall\|subject` vs `overall\|course`) | one `ANALYTICS_SCOPE` |
| Scholarship eligibility | not computed or shown anywhere | shown on the student's own view, with a notification on state transition (C16) |
| "My Progress" tab | generates a **subject-scoped** insight payload | its own scope |
| Insight path sanitization | `diagnostics` passed through raw; `subjects` sent wholesale | field-by-field, at parity with the chat path |

### Documentation

| Claim | Before | After |
|---|---|---|
| §3.3 zone table and Q4 | **disprovable in a live demo** | **true as written** — C13 moves the code to the doc, not the reverse |
| §3.1 "no duplicated risk logic anywhere" | false | true after step 17 |
| Q1 "unencoded terms never default to 0%" | true at term level, **false at component level** | true at both |
| Q3 "tracks the 2-term PL streak in real-time" | the feature **does not exist** | per-semester eligibility now; streak after Phase 9 |
| §3.8.3 / §5.2.5.1.2 unit rule | "or ≥18 for irregular" implies regulars exempt | flat 18 for everyone |
| SRS `FR-DEN-02`, PL Risk Roster | `> 1.75` floor, contradicting §3.8.4 | 2.00, aligned |
| SRS transmutation table | omits **Virtus (1.75)** from President's Lister | corrected |

---

## Phase 0 — Foundation (zero display change)

Provably display-neutral: nothing imports the new module yet, the `gradingMath` changes add new fields, and `calculateSemestralGrade().remarks` has **zero consumers today** (every call site destructures only `{ mr, tfr, sg }` and re-derives the remark inline).

**New `src/lib/academicPolicy.js`** — frozen constants each carrying its handbook citation:

- `GRADE_SCALE` (`passingCutoff: 3.00`, `failedValue: 5.00`), `RATING_SCALE` (`passingCutoff: 75`)
- `HONORS` — `ceiling: 1.75`, `subjectGradeFloor: 2.00`, `minimumUnitsIfIrregular: 18`, `tiers[]` (sapientia/excellentia/virtus)
- `SCHOLARSHIP` — §5.2.5.1 thresholds incl. `consecutiveTermsRequired: 2`
- `ATTENDANCE` — `warningAbsences: 2`, `nearFdaAbsences: 3`, `fdaAbsences: 4`, `STATUS` (capitalized: `Present|Absent|Late|Excused`)
- `REMARKS` / `DB_REMARKS` + `toDbRemark()` / `toDisplayRemark()`
- `GWA_BANDS` — upper-bound-only, first-match-wins, terminating in `Infinity`, so bands are **gap-free by construction**

Functions:
- `resolveOfficialGwa(row)` → `{ gwa, rating, source }` — `computed_grade` is always transmuted; `effective_grade` is trusted only when in `[1.00, 5.00]`; returns `null`, never `5.00`, for missing data
- `toGwaOrNull(value)` — guarded `getTransmutedGrade`
- `computeStudentGwa(entries, opts)` → `{ gwa, totalUnits, method, unitsMissing }` — credit-weighted, falls back to unweighted but **reports it**
- `averageCohortGwa(gwas)` → `{ mean, n }` — deliberately takes bare numbers so it cannot be confused with the above
- `getGwaBand`, `getHonorTier`, `getScholarshipEligibility`, `getRemarks`, `isPassing`
- `getRiskTierForScore`, `getRiskTierByLevel`
- `normalizeAttendanceStatus`, `countAttendance`, `countAbsences`, `getAttendanceFlags`

**Additive changes to `src/lib/gradingMath.js`:**
- `calculateWeightedTermRating` gains `encodedWeight` and `ratingOnEncoded` (= `rawRating / encodedWeight × 100`). `rating` is untouched.
- `calculateSemestralGrade` gains `termsExpected`, `termsEncoded`, `isComplete`.
- Export the currently-private `WEIGHT_TOLERANCE`.
- Add `toEffectiveGradeForPosting(rating)` — `getTransmutedGrade` without the 5.00-on-null behavior, for write paths only.
- `getPresidentsListTier` → delegate to `getHonorTier`.

**Verification** — extend `scripts/verifyGradingMath.js`. **One existing assertion is deliberately changed (C14):** the block that currently asserts `resolveGradingFormula(null, { formulaAssigned: false })` returns `ok: true, source: 'legacy', totalWeight: 100` pins exactly the behaviour being removed. Replace it with `ok: false, source: 'invalid'` and a non-empty `error`. Every other existing assertion stays unmodified.

New assertions:
- **C14 fail-closed:** `resolveGradingFormula(null, { formulaAssigned: false }).ok === false`; `computeTentativeGradeDetails(scores, cols, {}).gwa === null`; and a grep-based check that no file under `src/` calls `resolveGradingFormula(null` with a literal null.
- **No weights in policy:** no export of `academicPolicy.js` has a `weight` key.
- All ten `getTransmutedGrade` boundaries pinned explicitly (the guard rail for every later phase).
- Activities-only perfect → `rating === 50` **unchanged**, `ratingOnEncoded === 100`, `encodedWeight === 50`, `isComplete === false`. For every existing preset: `rating === preset.isolatedExpected` **and** `ratingOnEncoded === 100`.
- `calculateSemestralGrade({prelim: 97})` → `sg === 97` (available-term averaging preserved), `termsEncoded === 1`, `isComplete === false`. Existing summer assertion (`sg === 85`) still passes.
- `resolveOfficialGwa` golden table (~12 row shapes: null effective, in-range, out-of-range, every ladder boundary, `computed_grade: 0`, both null) asserting `{gwa, source}`.
- `toGwaOrNull(null) === null` asserted **beside** `getTransmutedGrade(null) === 5.00`, documenting the intentional split.
- `computeStudentGwa([{gwa:1.00,units:3},{gwa:3.00,units:1}]).gwa === 1.50` with `assert.notEqual` against `averageCohortGwa([1.00,3.00]).mean === 2.00`.
- **Band exhaustiveness:** loop `gwa` 1.00→5.00 step 0.01, assert `getGwaBand(gwa) !== null`. Kills the `GradeDistribution` bracket gaps permanently.
- Tier boundaries confirmed against the handbook ranges: `1.00`–`1.25` → Sapientia, `1.26`–`1.50` → Excellentia, `1.51`–`1.75` → Virtus, `1.76` → ineligible. Assert the `.26` / `.51` crossings specifically, since averaged GWAs land on non-ladder values (e.g. `1.5625`).
- §3.8.4/3.8.5 disqualification citations; `getHonorTier` ≡ `getPresidentsListTier` parity for tier selection and the floor/INC gates across 1.00→2.00, **with the unit gate asserted to differ** (regular student, 15 units: old → eligible, new → ineligible).
- **§3.8.3 unit gate applies to every student** (per O8): `{ units: 15, isIrregular: false }` → ineligible; `{ units: 18, isIrregular: false }` → eligible; same for `isIrregular: true`. Assert that `isIrregular` changes only the message, never the outcome.
- **§3.8.4 boundary, asserted in all three directions:** a subject at `1.75` passes, `2.00` **passes** (it is the floor, not a breach), `2.25` disqualifies. Plus the full worked case — eight subjects `[1.25, 1.25, 1.50, 1.50, 1.50, 1.75, 1.75, 2.00]` → average `1.5625`, floor not breached, tier `Virtus`, eligible. This pins the rule that one subject at exactly 2.00 never disqualifies on its own.
- **Averaging-method divergence, asserted explicitly** so the choice is visible rather than incidental: a 5-unit subject at `2.00` plus seven 1-unit subjects at 1.50–1.75 → unweighted `1.6563` (eligible) vs credit-weighted `1.7708` (ineligible). Assert both values and that they fall on opposite sides of `HONORS.ceiling`, so any future change to the default method fails this test loudly.
- Tripwire: `assert(!HONORS.tiers.some(t => t.maxGwa === 1.45))`.
- `getRemarks({gwa: 0, isComplete: true}) === 'Passed'` — kills `PostedGradesView.jsx:1058`'s `effGwa &&` falsy-zero bug.
- `getRiskTierForScore` at 0/24/25/49/50/74/75/100; `RISK_TIERS` contiguity; resolver ≡ the engine's inline branches.
- `ADVISING_THRESHOLDS` values equal their `ATTENDANCE` sources.

---

## Phase 1 — Stop generating wrong numbers (write paths)

The only phase touching DB writes.

| File | Change |
|---|---|
| `src/pages/faculty/ScoreInput.jsx:1374,1384` | `getTransmutedGrade` → `toEffectiveGradeForPosting`; on `null`, throw the per-student error the `invalidTerm` guard at :1344 already uses. Currently persists `5.00` for a null rating. |
| `src/pages/faculty/GradeComputationPreview.jsx:505,733` | Same. Also stop coercing `stud.mr`/`tfr`/`fRate` to `0` at :511-517 — keep `null` so the guard fires. |
| `src/lib/riskEngine.js:283` | `computeTentativeGradeDetails` returns `usedFallbackFormula: true` when no formula was supplied but one was expected. |
| `src/pages/dean/Dashboard.jsx:343,537`, `AtRiskStudents.jsx:428` | Bare `classConfigMap[id]` → `?? null`, then skip records where `usedFallbackFormula` — ends the silent legacy-formula substitution. |
| `src/pages/admin/GradeOverride.jsx:165` | Inline `'passed'/'failed'` → `toDbRemark(getRemarks(...))`. Also fix :317,321,372,376, which render `'incomplete'`/`'fda'`/`'dropped'` as **"Failed"**. |
| `ScoreInput.jsx:1337`, `GradeComputationPreview.jsx:465` | Iterate a summer-aware term list instead of a hardcoded 4-term array. |
| `ScoreInput.jsx:1337`, `GradeComputationPreview.jsx:470`, `StudentRow.jsx:194`, `excelExport.js:96` | `maxItems` gains the `char: x?.char ?? 100` normalization that `riskEngine.js:261` already applies. |

Per **D3**: milestone posting is unchanged and MR/TFR remain tentative-but-visible. Label them "Tentative" in the UI; reserve final Passed/Failed for the semestral milestone.

**Verify:** fixture reproducing the dean bug — a 30/60/10 class scored with and without its config, asserting the results differ and the no-config path is now detectable. Phase 0's assertions 1–14 now have consumers.

**Intentional display changes:** faculty can no longer post a null term rating as `5.00` (now a hard error — the single most valuable change here); dean figures for non-legacy-formula classes stop being computed with 50/10/40; `GradeOverride` stops showing INC/FDA/Dropped as Failed.

---

## Phase 2 — One scale (read paths)

Replace every `effective_grade ?? computed_grade` ternary with `resolveOfficialGwa(row)`. The bug's direction is *false failure* (an `84` compared `<= 3.00` is false → counted Failed), so every fix moves a number from obviously wrong to right.

Pattern, applied at ~20 sites — representative paths:
- `src/pages/student/Dashboard.jsx:153,155` — `credit_units` → `units` (add to the select) and `computed_grade` → `resolveOfficialGwa`. **Two lines; the worst live defect.**
- `src/pages/dean/GradeDistribution.jsx:38-41` — delete the local `effectiveGWA` helper
- `src/pages/dean/Dashboard.jsx:50,331,411,530` — four copies of the ternary
- `src/pages/dean/SummaryReports.jsx:107,109,179,221`
- `src/pages/dean/AtRiskStudents.jsx:411` — feeds `computeUnifiedRisk`'s `avgGwa`, so a leaked `84` currently clamps to 5.00 → spurious HIGH risk
- `src/pages/student/MyGradesList.jsx` (4 copies), `MyGradesDetail.jsx:249`, `AcademicInsights.jsx` (4 copies) — also adds the missing `isNaN` guards
- `src/lib/classRoomService.js:580-586` — becomes the reference call site

**Verify:** the golden-row table from Phase 0 now covers all call sites.

**Intentional display changes:** student dashboard GWA goes from e.g. `84.00` to `2.25`. Dean pass/fail counts change where `effective_grade IS NULL` — students previously counted Failed become Passed. If any dean report or defense screenshot was built from the old figures, re-take it.

---

## Phase 3 — One GWA method (plain mean, per C11)

**Resolved by C11: plain mean.** `computeStudentGwa(entries)` = sum of per-subject GWAs ÷ subject count. **No `subjects(units)` query widening is needed for the average** — units are only an eligibility gate (C3), so the three dean queries need `units` solely to evaluate the 18-unit minimum, not to weight anything.

Because the dean pages already use an unweighted mean, **their per-student GWA figures do not move.** This removes what was previously the highest-regression-risk phase. The changes are on the student side, where two of the three implementations were wrong for other reasons anyway:
- `student/Dashboard.jsx:168-170` — hand-rolled weighting on a non-existent `credit_units` column (so already an unweighted mean pinned at 3.0) → `computeStudentGwa`
- `MyGradesList.jsx:383-384,408` and `AcademicInsights.jsx:486-487,578-580` — genuine credit-weighting by `subjects.units` → replace with the plain mean per C11. **These values will change.**

Route the remaining sites through the canonical helpers: dean `Dashboard.jsx:71,354,386,461,547,554`, `AtRiskStudents.jsx:445`, `SummaryReports.jsx:107,185,229`, `GradeDistribution.jsx:248`, `GradeComputationPreview.jsx:601`.

`faculty/Dashboard.jsx:311-320` averages 0–100 ratings then transmutes — a cohort mean of ratings is not anybody's GWA. **Do not convert**: relabel it "Average Term Rating (%)" and stop transmuting.

**Verify:** cross-portal consistency — one fixture student (GWAs 1.25, 1.50, 2.00, 3.00 with units 3,3,2,1) must yield `1.9375` from both the student and dean paths, with `assert.notEqual` against the credit-weighted value (`1.6944`) so the C11 choice is pinned and a silent revert fails the suite. Note this fixture also straddles the honors ceiling: plain mean `1.9375` is **ineligible** (> 1.75) while credit-weighted `1.6944` would be **Virtus** — so the assertion doubles as a guard that the method choice is driving eligibility as intended. Also assert `computeStudentGwa` ignores the `units` field entirely for the average while `getHonorTier` still reads it for the 18-unit gate.

**Regression note:** student-side GWAs shift where unit loads are uneven — always toward the plain mean. Since C11 makes this the PL-determining number, a borderline student's honors tier can change. Capture it in the before/after diff.

---

## Phase 4 — One honors ladder (per D1)

| File | Change |
|---|---|
| `src/pages/student/AcademicInsights.jsx:618-645` | Whole `dlCategory`/`dlProbability`/`dlMessage` block → `getHonorTier(gwa, { subjectGrades, hasInc, units, isIrregular })`. **Delete `dlProbability`.** Show tier name + handbook citation + distance to next tier. |
| `AcademicInsights.jsx:82-92, 587-611`; `MyGradesList.jsx:412-418`; `student/Dashboard.jsx:174-177` | `1.45` ladders → `getGwaBand(gwa).label` |
| `faculty/Dashboard.jsx:245`, `dean/SummaryReports.jsx:187`, `dean/Dashboard.jsx:463,549`, `AtRiskStudents.jsx:477` | Bare `<= 1.75` filters → `getHonorTier(...).isEligible`. **Stricter** — now enforces the §3.8.4 gate. |
| `dean/Dashboard.jsx:500-513`, `DeanCharts.jsx:500-534,702-709`, `GradeDistribution.jsx:254-257` | Three divergent bracket tables → derive from `GWA_BANDS`. Fixes the gaps where grades in (1.50,1.75) and (2.50,2.75) match no bracket and vanish from the chart while still counting in `total`. |
| `gradingMath.js:513-523` | `GWA_TARGET_BENCHMARKS` "Dean's List" labels → Excellentia/Virtus |
| `dean/AtRiskStudents.jsx:484` | `highestGradeItem.val > 1.75` → `> HONORS.subjectGradeFloor` (2.00). **Confirmed bug per O6** — the code matches the SRS's `> 1.75` and contradicts §3.8.4. Currently flags honors students for a 2.00 subject that is actually acceptable. |
| `gradingMath.js:498` | `if (isIrregular && units < 18)` → unconditional `units < HONORS.minimumUnits`. **Confirmed bug per O8** — regular students are currently exempt from the 18-unit requirement, which applies to everyone. |
| `classRoomService.js:593` | `hasGradeBelow200` is hardcoded `false`, so the §3.8.4 gate never fires in the roster path. Pass the real per-subject grades. |

**Verify:** histogram closure — `Σ bracket.count === array.length` for all three previously-divergent tables. A grep-based assertion that `1.45` appears in no grade comparison outside `academicPolicy.js`. Plus the O6/O8 boundary cases: a subject at exactly `2.00` does **not** disqualify; a regular student with 15 units **does**.

**Intentional:** GWA 1.26–1.45 students change from "1st Class Dean's Lister" to "Excellentia"; probabilities disappear. PL counts move in **both** directions — down on 5 screens where a subject is worse than 2.00 (the §3.8.4 gate now fires), and also down where a regular student carries under 18 units (the §3.8.3 gate now applies to them). But counts go **up** on the PL Risk Roster, where students holding a 2.00 subject stop being flagged. After this phase §2.1 of the defense guide matches the code.

---

## Phase 5a — Risk matrix calibration (design, not plumbing)

Two findings verified by executing the engine. These are **model** issues, distinct from the duplication fixed in Phase 5, and each needs a decision rather than a refactor.

**Both decisions are settled — C12 (delete the dead parameters) and C13 (step-then-ramp recalibration). The analysis below is retained as the rationale.**

**1. Three declared inputs contribute nothing.** `failingSubjectsCount`, `majorExamAverage` and `hasGradeBelow200` are destructured at `riskEngine.js:73-78` and never referenced in the scoring body. Setting all three to their worst values leaves the composite at `0`. Consequences:
- `AtRiskStudents.jsx:453` threads `individualSubjectGrades` specifically so `computeUnifiedRisk` can derive `hasGradeBelow200` at `:324-326`, and the result is discarded — **the dean's PL-risk tab believes it enforces the §3.8.4 floor and does not.**
- The exam-average fallback divergence across four call sites (engine default `100`, `StudentRow.jsx:289` → `85`, `AtRiskStudents.jsx:453` → `80`, `StudentRiskEvaluationModal.jsx:57` → `75`) is therefore **not a correctness bug** — it is dead input. Downgrade it to a clarity issue.
- `classRoomService.js:593`'s hardcoded `hasGradeBelow200: false` and its three-line comment describe behaviour that exists in neither direction.

**Resolved by C12:** delete all three, along with `individualSubjectGrades` threading that existed only to derive `hasGradeBelow200`. The §3.8.4 floor moves to `getHonorTier`.

**2. The GWA factor does not discriminate in the passing band.** Verified: `2.00 → 0`, `2.25 → 6`, `2.50 → 13`, `2.75 → 19`, and MODERATE is first reached at `2.98`. The linear scale spans the 1.00-wide band 2.00→3.00 and maxes at exactly **25**, which is precisely `RISK_TIERS.MODERATE.min` — so by construction only the top of the band can reach Moderate on grades alone. **§3.3 claims this band is the "MODERATE (Watch)" zone and Q4 asserts a 2.25 student is flagged Moderate; both are false.**

**Resolved by C13:** step-then-ramp. Note the finding that made a naive fix impossible — a *linear* 1–35 ramp still yields 2.25 → 9 and 2.50 → 18, both LOW, because the deficit at band entry is near zero. Only a discontinuity at 2.00 satisfies §3.3.

**Still open by design (not blocking):** the trajectory factor covers only Prelim→Midterm (`classRoomService.js:623-624`), i.e. 1 of 3 possible term transitions, so second-half decline scores 0 of 10. Pass the latest available consecutive pair instead of a fixed one — a two-line change with real effect.

**Verify:** assert the three C12 parameters are absent from the signature and that no call site passes them. Pin the C13 curve at every boundary: `2.00 → 0 LOW`, `2.01 → 25 MODERATE`, `2.25 → 28 MODERATE`, `2.50 → 30`, `2.75 → 33`, `3.00 → 35`, `3.01 → 50 HIGH`, `5.00 → 60 HIGH`. Then assert the three documented claims that must survive the change: GWA 3.00 + 4 absences → `85 CRITICAL`; 4 absences alone → `50 HIGH`; component maximum `60+50+15+10 === 135` capped to 100.

---

## Phase 5 — One risk model

Replace open-coded `25/50/75` thresholds with `getRiskTierForScore` (`StudentRow.jsx:326-342`, `ClassRecordsList.jsx:574,616-625`, `FacultyCharts.jsx:290-293`). Delete the separate models: `SummaryReports.jsx:188,235-239` (GWA-only Low/Medium/High), `AcademicInsights.jsx:48-56` `computeVerdict` (keep the DB enum values, replace the thresholds), `GradeComputationPreview.jsx:505`. Route all at-risk counting through `isStudentAtRisk` — including `dean/Dashboard.jsx:550`, the third rule in the same file that already uses the helper at :375, which is **why section counts don't sum to the KPI**. `StudentRisk.jsx:84`'s `>= 20` → `>= RISK_TIERS.MODERATE.min`.

Fix parameter omission: `dean/Dashboard.jsx:374` passes only 2 of 10 params to `computeUnifiedRisk` (needs attendance fetched in that page); drop the invented `examAverage: 80`/`85`/`75` fallbacks at `AtRiskStudents.jsx:453`, `StudentRow.jsx:289`, `StudentRiskEvaluationModal.jsx:57`; pass `isSummer` where already available (`classRoomService.js:556`).

**Then gate the GWA factor on completeness** — the Phase 0 hook. When a GWA derives from an incomplete term, contribute 0 points with `detail: 'Provisional — insufficient encoded components'`.

**Verify:** `computeUnifiedRisk({avgGwa:2.00, absenceCount:4}).composite_score === 50`, and `0` when `absenceCount` is omitted — proving what the dean dashboard was silently losing. End-to-end defect assertion: activities-only perfect scores currently give `gwa 5.00, risk 60, high`; with the completeness gate the GWA factor contributes 0 and the tier is `low`. KPI coherence: `atRisk + moderate + low === total`.

---

## Phase 6 — One attendance semantic

**Scope correction:** the real `attendance_status` enum is capitalized — `('Present','Absent','Late','Excused')` ([migration:54](../../Downloads/New%20ASPIRE/sage/supabase/migrations/20260606164500_add_attendance_and_semester_transition.sql)). Postgres makes lowercase unstorable, so `.eq('status','Absent')` is **correct** and there is no live case-divergence bug. Normalize defensively in JS only; do not alter SQL filters. (`docs/ASPIRE_DATABASE_SCHEMA.md` is stale — lowercase, no `Excused`.)

Real issues to fix:
- **Three readers, one writer, one cache.** `ScoreInput.jsx:603` is the only writer of `sage_absences_*`. It is read by `StudentRow.jsx:231`, `PostedGradesView.jsx:201` **and `ScoreInput.jsx:187` itself**. `StudentRow` feeds the value straight into `calculateAcademicRisk`, so a stale or unwritten cache silently yields 0 absences; `PostedGradesView` has no writer in its route, so absences there are **always** 0. **Delete all three reads and the write**; pass counts as props from the DB-backed roster, which already carries `absences` from `getClassPriorityRoster`.
- `student/Attendance.jsx:82-87` **injects 4 fabricated attendance logs** when a class has no records. Delete; render an empty state. Fabricated data in a defense build is indefensible.
- `student/Attendance.jsx:103-104` warns at 2 while `ADVISING_THRESHOLDS` says 3 → `getAttendanceFlags` with three named levels (2 early warning / 3 approaching FDA / 4 FDA), matching §3.4.
- `ClassAttendance.jsx:465,477` — badge uses `>= 4`, filter is `>= 4 || >= 2` (i.e. just `>= 2`) → both `getAttendanceFlags(...).isFda`.
- `ClassAttendance.jsx:344-357,371-378` — client-side incremental counter drifts from the DB aggregate on rapid toggling; recompute after the debounced save at :334.
- **`AcademicInsights.jsx:236-248` — the highest-severity attendance bug, and it is a *scope* error (C10), not just a weighting one.** The query selects `status, is_fda` filtered only by `student_id`, with no `class_record_id` and no grouping, then sums across every course. That term-wide total then drives `fdaFlags` (`:245`), `fdaRisk` (`:695`), `computeVerdict` (`:52`), `officialStanding.absenceCount` / `fdaAdvisory` into the AI advisor (`:837-838`), the `evaluateAcademicAdvising` call (`:746`), and the **"X/4 Absences"** gauge (`:1553`). **Result: 1 absence in each of 4 courses is flagged FDA**, tripping `advisingEngine`'s `attendance_fda_threshold` branch — severity `critical`, `consultationRecommended: true` — whose message then reports the summed figure as if it belonged to one course.
  **Fix:** add `class_record_id` to the select, group per course, and compute overall FDA as `some(course => course.absences >= 4)`. The `/4` gauge must show a single course (the worst one, named) rather than a cross-course sum.
- `AcademicInsights.jsx:242-248` is also **wrong twice under C6**: it half-credits `Late` at `* 0.5`, and omits `Excused` from the numerator so an excused student's rate is penalized. Replace with `countAttendance`. This is the only site that half-credits Late, so the fix removes that divergence too.
- **`advisingEngine.evaluateAcademicAdvising` takes a single `attendance.absenceCount`**, which assumes one scope. Per C10 it must receive either the **maximum per-course count** or the per-course array, so its FDA message can name the specific course instead of quoting a total. Its `evidence` label `"${absenceCount}/${fdaAbsences}"` is misleading until this changes.
- `ATTENDANCE` constants per C6: `lateCountsAsPresent: true`, `excusedCountsAsPresent: true`, `fdaCountsOnly: ['Absent']`. The four statuses remain distinct in storage and display — the collapse happens only in counting.

**Verify:** a mixed fixture of all four statuses asserts `countAbsences` equals the `Absent` count alone, and that adding `Late` or `Excused` rows changes `attendanceRate` but never the FDA count. `getAttendanceFlags` at 1/2/3/4 absences → `none / warning / near_fda / fda`. A student with 3 Lates + 1 Absent → **not** FDA (guards against a future regression to the strict reading). `normalizeAttendanceStatus` maps mixed casing onto the capitalized enum values.

**The C10 assertion that matters most:** a fixture with **1 absence in each of 4 different `class_record_id`s** → per-course counts all `1`, no course FDA, overall `isFda === false`. Asserted explicitly against the current behaviour (`sum === 4` → FDA), so the false-positive path can never return. Conversely, 4 absences in **one** course plus 0 elsewhere → that course FDA, overall `isFda === true`, and the advisory message names that course.

**Display impact:** attendance rates **rise** wherever `Excused` rows exist (they stop counting against the student) and wherever `Late` rows exist (full credit instead of half). **FDA flags on the student insights page FALL sharply** — every student whose absences were spread across courses stops being flagged (C10). That is a false-positive removal, but it means the student-facing FDA warning will disappear for real students who currently see it, so it deserves its own release note. `StudentRow` risk scores change wherever the localStorage cache was stale. `student/Attendance.jsx` for a class with no records goes from 4 fabricated entries to an empty state.

---

## Phase 7 — One set of literals, then sync the defense guide

- `admin/GradeComputationsList.jsx` — **do not point these at `LEGACY_GRADING_COMPONENTS`.** Two conceptually distinct things share the numbers 50/40/10 and must stay separate constants:
  - `OFFICIAL_DYCI_PRESETS` (`:9-54`) is a **starter catalog** the admin instantiates into `grade_computations` rows. Extract as `DYCI_COMPUTATION_PRESETS`; `verifyGradingMath.js:15-65` re-declares the same five presets, so the verify script should import the real one.
  - The `useState` form defaults at `:71-73` and the third copy at `:108-110` are **new-template pre-fill values**. Point them at `DYCI_COMPUTATION_PRESETS[0].components`, never at the legacy fallback — otherwise changing the fallback would silently change what new templates pre-fill with.
  - `LEGACY_GRADING_COMPONENTS` is **removed from every runtime resolution path** under C14. Once the migration guarantees every subject has a template, nothing should read it. Delete the export if no references remain after Stage B; the `'General Education Core'` row in the database is now the canonical definition of those weights.
- `admin/GradeComputationsList.jsx:180` — strict `totalWeight !== 100` → `WEIGHT_TOLERANCE`; today the admin UI rejects formulas the engine accepts.
- `lib/excelExport.js` — the 9-rung transmutation ladder is re-encoded **three times** (:398, :405, :459-472) → one `TRANSMUTATION_LADDER` export + one formula generator. :377-385 hardcodes `*50`/`*0.1`/`*40`, so an Excel export of a 30/60/10 class silently prints 50/10/40 formulas — derive from `gradingOptions.formula.components`. **Highest-value item here.**
- `AcademicInsights.jsx:1457` — hardcoded weight label → `getGradingStoragePresentation`. (This block is `className="hidden"`; consider deleting.)
- `lib/seedDatabase.js:122-124`, `GradeComponentsSetup.jsx:29-32` — dedupe against the canonical constants.

Then update `docs/ASPIRE_GRADING_AND_RISK_RULES_DEFENSE_GUIDE.md`:
- §1.1 — 50/10/40 is the *legacy default*, not the universal rule; document the configurable formulas and that `resolveGradingFormula` fails closed.
- **New §1.4** "Which Average Is Official" and **§1.5** "Two Scales" (`computed_grade` 0–100, `effective_grade` 1.00–5.00, `resolveOfficialGwa` the only bridge). Neither exists today; both are likely panel questions.
- §1.2 / Q1 — add verdict suppression for component-level incompleteness.
- §2.3 vs §3.4 — resolve the contradiction (§2.3 says 1–3 absences flag; the table and code give 0 points at 0–1).
- §3.3 and Q4 — **no rewrite needed.** C13's recalibration makes both true as written: the 2.01–3.00 band now scores 25–35 (MODERATE) and 3.01–5.00 scores 50–60 (HIGH), exactly as the table claims, and a 2.25 student genuinely is flagged Moderate. Add the explicit point values to the table so the curve is auditable, and document the step at 2.00 with its rationale (crossing the §3.8.4 floor is categorical, not gradual).
- §3.2 — the formula is already correct at four factors; add a line noting the three previously-declared inputs were removed (C12) so the signature and the formula now agree.
- §3.1 — the "no duplicated risk logic anywhere" claim becomes true only after Phase 5. Do not present the guide before then.
- Q3 — scholarship streak tracking does not exist today; restate as per-semester eligibility, and update again once Phase 9 lands.
- **§3.8.3 rewording (per O8).** It reads "Regular academic course load (CHED curriculum) **or** ≥18 units for irregular students", whose "or" implies regular students are exempt. The confirmed rule is a flat **18-unit minimum for every student**. Restate so code and document agree; §5.2.5.1.2's "for irregular students" phrasing has the same problem.
- **§3.8.4 wording trap (per O6).** "No grades lower than 2.00" means no grade *worse* than 2.00 — but on this scale lower numbers are better, so read literally it states the opposite of the intent. Confirmed semantics: exactly **2.00 is acceptable**; only `> 2.00` disqualifies. Add that clarification inline so nobody later "fixes" the comparison in the wrong direction.
- **§2.1 / new §2.1b — the tier ladder is applied to an *average*.** Document that the Sapientia/Excellentia/Virtus ranges use `.26`/`.51` granularity because subject averages land on non-ladder values (e.g. `1.5625`), unlike individual transmuted grades which are discrete.
- Strip the local Windows path from the header.

Also correct the companion documents, which contradict the guide. **Per C17 the handbook is authoritative in every case** — these are documentation errors, not alternative rules:
- `docs/aspire/ASPIRE-System-Scope-SRS-and-Architecture.md:242` (`FR-DEN-02`) and `:105` use a `> 1.75` per-subject threshold where §3.8.4 says **2.00** (per O6). `:527-529`'s transmutation table omits **Virtus (1.75)** from President's Lister (per O7).
- `docs/aspire/Implementation-Plan-ASPIRE-Major-System-Update.md:70` labels risk score 25–49 as "Moderate / President's Lister (PL) Risk", conflating a risk tier with an honors class.
- `docs/ASPIRE_DATABASE_SCHEMA.md` is stale — see the Phase 6 note on `attendance_status` casing and the missing `Excused` value, plus omitted columns (`is_fda`, `term_id`, `locked_milestones`, `grading_formula_snapshot`, `override_at`/`override_by`). Dump the real DDL before the defense.

---

## Phase 8 — Dynamic two-scope analytics and AI advisor

Both the analytics UI and Ask ASPIRE must work at two scopes — **overall (all subjects)** and **per subject** — and be driven by real resolved data rather than hardcoded labels. Today the scopes exist but are named differently in three layers, and much of the per-scope data is either hardcoded or discarded in transit.

**8a — One scope model** (independent of Phases 1–7; can ship early)

Three layers disagree on vocabulary:
- UI: `'overall' | 'subject' | 'progress'` (`AcademicInsights.jsx:1232,1245,1258`)
- Insight payload: `type: 'overall' | 'subject'` (`:932,946`)
- Ask ASPIRE context: `scope: 'course' | 'overall'` (`:826`) — derived from `askAspireSubject`, **not** from the UI `scope`
- Edge function: `'course'` for chat, `'subject'` for insight

Add `ANALYTICS_SCOPE = { OVERALL, SUBJECT, PROGRESS }` to `academicPolicy.js` and use one vocabulary everywhere (accept `'course'` as a deprecated alias server-side for one release).

**Bug to fix here:** `scope === 'progress'` falls into the `else` branch at `AcademicInsights.jsx:944`, so the Progress tab generates a **subject** insight payload. Make the branch explicit.

**8b — Per-subject context** (the "advice from my grades, absences and activities" ask)

**What already reaches the model:** `subject.name`, `subject.code`, activity `title`, `topicTag`, `term`, `score`, `maxScore`, `percentage`. Faculty can already enter both `description` and `topic_tag` via the activity config modal (`ScoreInput.jsx:963-964`, `:1088-1089`) — both optional and nullable.

**So the constraint is field adoption, not plumbing.** If faculty leave `topic_tag` and `description` blank, enriching the payload changes nothing. Of the two, **`topic_tag` is the higher-leverage field**: `advisingEngine` groups by it to detect "two related weak results," so it improves the *deterministic* signal, whereas `description` only improves the LLM's wording. Treat faculty adoption of `topic_tag` as a rollout task alongside this phase.

All payload changes are in `sanitizeContext`'s subject mapper, `supabase/functions/invoke-advisor/index.ts:91-106`:
- Add `description` — the client already sends it at `AcademicInsights.jsx:851` and the server drops it. **One-line server fix.** This is the field that makes advice specific to what an activity actually covered.
- **Send descriptions selectively, not for all 20 activities.** The cap is 20 per subject; at ~300 chars each that is up to 6 KB of free text feeding a `max_tokens: 300` answer, and irrelevant descriptions dilute relevance. Send full `description` only for the weakest 3–5 activities plus anything in the flagged topic group; send `title` + `topicTag` only for the rest.
- Add each activity's **grading component identity** (`componentId` / component name + weight). A weak quiz in a 10%-weight bucket warrants different advice than the same score in a 50% bucket.
- **Guardrails that must not regress:** the client's `is_released = true` filter stays (otherwise unreleased activity descriptions leak), and `shared_academic_feedback` remains the only faculty note in the payload — `student_risk_private_notes` must never enter it.
- **Treat `description` as untrusted data.** It is faculty-authored free text entering a prompt, so it is a prompt-injection surface. Low severity given faculty are trusted and the response is schema-validated with the boundary-statement check, but label it as supplied content in the prompt rather than interleaving it with instructions.
- Add per-subject `absenceCount` + `attendanceRate`. FDA is per class record, but only the institution-wide `officialStanding.absenceCount` survives sanitization today; `subject.diagnostics` is sent (`:848`) and discarded entirely. A student with 4 absences in one course currently reads as uniformly at risk.
- Add `encodedWeight` + `ratingOnEncoded` (Phase 0) so the advisor says "85% on the 50% graded so far" instead of implying a final standing.
- Add the resolved formula shape via the existing `getGradingStoragePresentation`, so advice can reference real components ("your Major Examination is 40% and is not yet encoded") instead of assuming 50/10/40.

**8c — Overall context** (the "all subjects + President's List" ask)

`courses[]` (`index.ts:107-115`) currently carries only code, name, runningGwa, classStandingAverage, examAverage — not enough to rank courses or explain *why* one is weakest. Add per-course `absenceCount`, `units`, `encodedWeight`, and the weakest released activity. Then add the honors block from Phase 4: `getHonorTier(...)` with `unmetRequirements[]` carrying handbook citations, so the advisor can say "you are Virtus; IT401 at 2.25 breaks the §3.8.4 floor" — which is the President's-List question answered from real data. Once Roadmap A exists, add `history` (completed semesters, per-semester GWA + tier, trend direction).

**Remove `dlCategory` / `dlProbability` / `dlMessage` from the overall insight payload** (`AcademicInsights.jsx:937-939`). Today the fabricated 94%/85% probability and the non-handbook `1.45` ladder are sent to the model **as authoritative context**, so the LLM repeats invented numbers back to students. This is the strongest reason Phase 4 should precede 8c.

**8d — Bring the insight path's sanitize contract up to the chat path's**

`sanitizeInsightContext` (`index.ts:132-146`) passes `diagnostics: input?.diagnostics || null` straight through and receives `subjects: subjectsList` wholesale (`AcademicInsights.jsx:941`). The chat path sanitizes field by field; the insight path does not. Bring it to parity.

**8e — Make the analytics dynamic**

- `AcademicInsights.jsx:1457` hardcodes "50% Activities | 40% Exams | 10% Character" → `getGradingStoragePresentation(resolvedFormula)`. (Also listed in Phase 7; it is the most visible "not dynamic" symptom. Note the block is `className="hidden"` — consider deleting instead.)
- Band and tier labels from `GWA_BANDS` / `getHonorTier` (Phase 4) so analytics adapt when a threshold changes.
- Drive the per-scope KPI set from one config object instead of the duplicated JSX branches at `:1272` and `:1827`.

**Sanitize discipline for every new field:** route through `text()` / `Number.isFinite()`. Watch `sanitizeEvidence`'s filter — `/\b(risk|classification|tier|faculty-only|restricted)\b/i` — so send `tierName` as its own plain field, never inside an evidence label, or it will be stripped.

**System prompt addition** (`index.ts:167-186`), matching the existing "you do not calculate grades" discipline: *"Honors and scholarship eligibility, attendance counts, and encoded-weight figures are supplied pre-computed. Never recalculate them. When explaining ineligibility, cite the specific unmet requirement."*

**Verify:** a fixture context for each scope asserting the sanitizer preserves every new field and still strips risk vocabulary; `ANALYTICS_SCOPE.PROGRESS` produces neither an `'overall'` nor a `'subject'` insight payload; and `getBoundedAdvisorResponse` still short-circuits before any network call in the `no_evidence` / `no_enrollment` / `building_evidence` states.

## Phase 9 — President's List streak, scholarship eligibility, and per-subject stake

Per §5.2.5.1.5 the tuition discount requires President's List standing for **2 consecutive terms**, so this is a cross-semester state machine, not a per-semester check. It answers *"am I President's List material?"* and *"am I about to lose the standing a tuition grant depends on?"*

**Scope decision (C9): eligibility only — no grant records.** ASPIRE computes and communicates *eligibility*, never grant possession. **No `student_scholarship_grants` table, no admin CRUD screen, no new RLS surface.** This is deliberate: whether a voucher was actually awarded is an administrative fact owned by the finance/registrar office, and a system that asserts it would be claiming authority it doesn't have.

**This does not cost the warning.** The message becomes *"you are at risk of losing your President's List standing, which is what a tuition grant depends on"* rather than *"you may lose your discount voucher."* The `at_risk_of_lapsing` state is computed entirely from eligibility — it needs no knowledge of whether a grant is held — so the student still gets the early warning, phrased against something the system can actually verify. Nothing in the advisor may use a possessive reference to a discount.

**Prerequisites** (not yet in this plan; must land first)
1. **Completed-semester history.** `academic_terms` holds a single seeded row, so no streak is computable yet. Needs the `student_semester_summary` view (per student per term: GWA, units, failed count, has_inc) built over `posted_grades → class_records.term_id → academic_terms`, plus an append-only `student_risk_history` table.
2. **Phase 0** — completeness gating, so a provisional in-progress standing can never trigger a lapse warning.
3. **Phase 4** — one honors ladder, since every state below is defined by PL eligibility.

Note for context: there is currently **no scholarship, voucher, or streak tracking anywhere** — verified across `src/`, all migrations, and the schema doc; the only references are comments, and `hasGradeBelow200` is hardcoded `false` at `classRoomService.js:593`. Everything in this phase is new, and under C9 all of it is computed rather than stored.

**Streak semantics** (confirmed against §5.2.5.1 wording)
- **Counting unit: regular semesters only** (`1st`, `2nd`). Summer is excluded from the count — §5.2.5.1.5 says PL for 2 consecutive terms *"before availing"*, so Summer is where the benefit is **applied**, not part of the qualifying sequence. Worked example: 1st sem PL + 2nd sem PL → discount availed on Summer.
- **Streak is cumulative and displayed as such.** Not a binary 2-or-not: each consecutive qualifying semester increments it, so the student sees "3 consecutive President's List semesters" and the count keeps growing. `streakLength` is a first-class output.
- **Grant tier comes from the 2-semester AGGREGATE GWA**, not either semester alone — §5.2.5.1.3 "GWA ≤ 1.50 **across 2 semesters**", §5.2.5.1.4 "≤ 1.75 across 2 semesters". A student at 1.40 then 1.60 averages 1.50 → `full_100` tier, even though the second semester alone would only reach `partial_50`. Both semesters must also independently satisfy the §3.8.4 subject floor. Under C9 this is reported as the *tier the student qualifies for*, not as a grant they hold.
- **Skippable semesters:** Summer terms (C4) and semesters with no enrollment (C7) are both skipped via **one** `isSkippableSemester()` predicate — not two code paths. An enrolled Summer with PL is shown in the history but does not increment `streakLength` (C8).
- **Retention:** each subsequent enrolled regular semester must maintain PL or the streak resets to 0.

**State machine** — `getScholarshipStanding({ completedSemesters, currentProvisional })` in `academicPolicy.js`, returning `{ state, streakLength, aggregateGwa, qualifiesForTier, unmetRequirements[] }`. No `activeGrant` parameter, per C9:

| State | Condition | Student-facing message |
|---|---|---|
| `building` | 0 consecutive PL semesters | What PL eligibility requires |
| `candidate` | 1 consecutive PL semester | "One more President's List semester would meet the §5.2.5.1.5 requirement" |
| `qualified` | ≥2 consecutive | "You meet the 2-semester President's List requirement for a tuition grant (§5.2.5.1.5)" |
| `at_risk_of_lapsing` | ≥2 consecutive, but the in-progress semester would break PL | **"You are at risk of losing your President's List standing, which a tuition grant depends on"** |
| `lapsed` | Streak reset after previously reaching ≥2 | What it takes to rebuild |

Two distinct computations: **retrospective** (streak length from completed semesters) and **prospective** (would the in-progress semester, if closed today, keep the streak). The prospective one drives `at_risk_of_lapsing` and **must** read the completeness-gated provisional standing, never a partial term.

**Language constraint:** no state may produce a possessive reference to a discount, voucher, or grant. The advisor speaks only about *standing* and *eligibility*. Enforce with an assertion over every state's message.

**Surfacing (C16) — student-side only, plus a notification.** No admin screen and no staff-facing roster. Two touchpoints:
1. **Display** on the student's own insights/archive view: current state, `streakLength` ("2 consecutive President's List semesters"), the tier they qualify for, and `unmetRequirements[]` with §citations when they don't.
2. **Notification on state transition**, via the existing `dispatchNotifications` pipeline. Add `scholarship_eligibility` to `NOTIFICATION_TITLES` in `notificationDispatcher.js`. Fire on `candidate → qualified` and on `qualified → at_risk_of_lapsing`; do **not** fire on `building`, on unchanged states, or on every recompute — `AuthContext`'s 4-second poller would otherwise spam the student. The prior state comes from the most recent `student_risk_history` row, which is why that table is a hard prerequisite rather than a nice-to-have.

**Verify:** two consecutive recomputes with an unchanged state dispatch **zero** notifications; a `candidate → qualified` transition dispatches exactly one; a transition into `at_risk_of_lapsing` dispatches exactly one and its message passes the C9 language assertion.

**Per-subject stake** — `getSubjectStake({ subjectGwa, overallGwa, honorsResult })`, the bridge between the two advisor scopes. §3.8.4 is a *per-subject* gate, so one subject at 2.25 disqualifies a student whose GWA is 1.30. The overall advisory computes the stake; the per-subject advisory names the culprit and the recovery target. Three tiers:
- `none` — subject is fine → maintenance advice
- `contributing` — weak but not breaching a gate → normal study advice
- `blocking` — this subject is the §3.8.4 breach → escalate, and attach the required recovery

**Recovery target reuses existing code:** point `simulateRequiredFinalRating` ([gradingMath.js:536](../../Downloads/New%20ASPIRE/sage/src/lib/gradingMath.js)) at the `HONORS.subjectGradeFloor` (2.00) rather than only at `GWA_TARGET_BENCHMARKS`. It already inverts the SG formula; it is currently wired to a single target-GWA widget. This yields the highest-value output in the system, fully deterministically: *"IT401 is at 2.25 and is the only thing blocking your President's List standing. You need 34/40 on the final exam to bring it to 2.00."*

**Advisor context additions** (extends Phase 8): overall scope gains `scholarship: { state, streakLength, aggregateGwa, qualifiesForTier, unmetRequirements[] }`; per-subject scope gains `stake: { level, isBlockingHonors, requiredScore, requiredOn }`. Both route through `text()`/`Number.isFinite()`, and — per the `sanitizeEvidence` filter — carry `tierName` and state keys as plain fields, never inside evidence labels.

**System prompt addition:** *"Scholarship eligibility and per-subject stake are supplied pre-computed. Never recalculate them, and never state or imply that the student holds a grant, discount or voucher — only eligibility is established here. When a subject blocks eligibility, name the subject and cite the handbook rule."*

**Verify:** streak fixtures — PL/PL → `qualified`; PL/non-PL → `lapsed`; PL/PL + failing provisional → `at_risk_of_lapsing`; PL/PL + healthy provisional → `qualified`. A GWA-1.30 student with one subject at 2.25 → honors ineligible citing §3.8.4, that subject's stake `blocking`, and a `requiredScore` that would bring it to exactly 2.00. An in-progress semester with unencoded components → never `at_risk_of_lapsing` (the completeness gate). **Language assertion:** every state's message matches `!/\b(your|my)\s+(discount|voucher|grant|scholarship)\b/i`, so C9's constraint can't regress.

Streak-specific assertions:
- **Aggregate tier:** semesters at 1.40 and 1.60 → `aggregateGwa === 1.50`, `qualifiesForTier === 'full_100'`, asserted with `notEqual` against the tier either semester would yield alone. Semesters at 1.60 and 1.75 → `partial_50`.
- **Aggregate gate does not bypass the subject floor:** aggregate 1.45 but one semester has a subject at 2.25 → not qualified, citing §3.8.4.
- **Summer is skipped, not breaking:** sequence `1st(PL) → Summer(none) → 2nd(PL)` → `streakLength === 2`, `qualified`. Sequence `1st(PL) → 2nd(non-PL)` → `streakLength === 0`, `lapsed`.
- **Non-enrollment pauses, not breaks (C7):** `1st(PL) → [no enrollment] → 2nd(PL)` → `streakLength === 2`, `qualified`. Assert this is treated identically to the Summer skip, so both go through one "skippable semester" predicate rather than two code paths.
- **Cumulative display:** `1st(PL) → 2nd(PL) → 1st(PL)` → `streakLength === 3`, so the UI can render "3 consecutive President's List semesters".
- **Summer PL does not inflate the count** (C8): `1st(PL) → Summer(PL) → 2nd(PL)` → `streakLength === 2`, with the Summer PL still present in the returned history. Assert the enrolled-Summer-PL case and the non-enrolled case both route through `isSkippableSemester()`.

## Critical files

- `src/lib/academicPolicy.js` — **new**, the canonical policy module
- `src/lib/gradingMath.js` — additive fields, `WEIGHT_TOLERANCE` export, `toEffectiveGradeForPosting`, `TRANSMUTATION_LADDER`, `getPresidentsListTier` delegation
- `scripts/verifyGradingMath.js` — ~50 new assertions; the gate for every phase
- `src/lib/riskEngine.js` — tier resolver, completeness gate, fallback-formula detection
- `src/pages/faculty/ScoreInput.jsx` — highest-consequence write path (585-600, 1327-1379)
- `src/pages/dean/Dashboard.jsx` — densest divergence site: scale, averaging, brackets, three at-risk rules, bare-subscript formula substitution
- `src/pages/student/Dashboard.jsx` — the two-line worst live defect
- `src/pages/student/AcademicInsights.jsx` — owns both analytics scopes, the honors calc, and the Ask ASPIRE context (Phases 4 and 8)
- `supabase/functions/invoke-advisor/index.ts` — the sanitize contract for both advisor scopes (Phase 8)
- `src/lib/riskUtils.js` — **delete**

## Verification

Under D4 the suite is written once (Stage A step 7) and re-run after **every** stage, not once at the end. A single pass touching ~30 files without checkpoints is how a silent grade change escapes.

1. `npm run verify:grading` — the primary gate. Runs the real library functions in Node, no DB required. Must be green after each stage, not just at the finish.
2. `npm run lint`
3. `npm run build`

**Migration check (step 0), before any code change:** `SELECT count(*) FROM subjects WHERE computation_id IS NULL` → `0`; `SELECT count(*) FROM grade_computations WHERE name = 'General Education Core'` → `1`; `SELECT count(*) FROM grade_computations WHERE name = 'General / Professional Education Scale'` → `0`. C14/C15 should produce **no grade changes** in the before/after diff, because every affected subject was already computing at 50/40/10 by coincidence — so a changed value attributable to them means some subject was on a different formula than believed. Treat that as a finding, not noise.

**Because everything lands together, capture a before/after diff of displayed values.** Before starting, run a throwaway script over a representative class that prints, per student: term ratings, SG, GWA, remarks, risk score and tier, honors status, absence count. Re-run it after Stage D and diff. Every changed value must map to a specific confirmed rule (C1–C10) or a listed bug fix. **Any change you cannot attribute is a regression** — that diff is what replaces the per-phase attribution the phased plan gave you for free.

Manual end-to-end after Stage D, using `npm run dev`:
- **Partial-term defect (the headline fix):** as faculty, enter perfect activity scores for Prelim only, leaving exam and character blank. Before: the student shows GWA 5.00 / Failed / HIGH risk. After: a tentative rating on encoded work, no failing verdict, risk not elevated by GWA.
- **Write-path guard:** attempt to post a milestone whose term rating is null. Before: silently stores `effective_grade = 5.00`. After: a per-student error naming the missing term.
- **Scale fix:** open the student dashboard for a student with posted grades and confirm the GWA reads on the 1.00–5.00 scale, then confirm the dean's figure for the same student matches.
- **Formula substitution:** create a class using a non-legacy preset (e.g. Health Sciences 30/60/10), post scores, and confirm the dean dashboard reports the same GWA the faculty gradebook shows.
- **Cross-portal consistency:** pick one student and confirm GWA, risk tier, and honors status agree across the student, faculty, and dean portals.
- **Two-scope advisor (Phase 8):** as a student with 2+ courses, open Ask ASPIRE from a single course and confirm the answer references that activity's title *and description* and that course's own absence count. Then open it from the overall scope and confirm the answer spans all subjects and names the specific subject blocking President's List eligibility, citing the handbook rule. Switch to the Progress tab and confirm it no longer generates a subject-scoped insight.

Out of scope: RLS is disabled system-wide and the credential CSV at the repo root is a separate, known security track — not addressed here.
