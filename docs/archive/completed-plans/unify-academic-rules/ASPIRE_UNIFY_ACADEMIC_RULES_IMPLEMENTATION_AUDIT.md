# Implementation Audit — "Unify Academic Rules Across ASPIRE"

**Audit date:** 2026-10-01
**Repository:** `C:\Users\JC Gabriel\Downloads\New ASPIRE\sage`
**Plan audited:** `Unify Academic Rules Across ASPIRE.md`
**Repository state at audit:** `b71b83b` (`Merge pull request #41 from kurarensu16/aspire-system-updates`), working tree clean

---

## Verdict

**0 of 22 execution steps have been applied. No part of the plan has been implemented.**

The repository HEAD is the *exact* commit the plan was written against. The working tree is clean — there are no uncommitted partial changes. Every defect the plan documents is still present in its described "Before" state, verified by reading the code rather than by trusting the plan's own claims.

This is not a partial-implementation finding. It is a **pre-implementation baseline**: the plan is still a specification, and the codebase has not moved toward it.

### Readiness note

The plan's line references and code claims held up on every item spot-checked in this audit. Where the plan says a bug exists at a given line, the bug is at that line. The plan can therefore be executed as written, beginning at **Stage A, step 0**.

---

## Method

1. Confirmed HEAD and working-tree cleanliness (`git log --oneline -1`, `git status --short`).
2. Confirmed the existence or absence of every file the plan creates or deletes.
3. For each confirmed rule (C1–C18) and each execution step (0–22), read the cited code and verified the current behaviour independently.
4. Ran the existing verification gate (`npm run verify:grading`) to establish what it actually covers.

Items were marked implemented only on direct code evidence. No item qualified.

---

## Stage A — Foundation (build the foundation, change no behaviour)

| Step | Required | Actual state | Status |
|---|---|---|---|
| **0** | Migration for C14/C15: repoint duplicate template, backfill nulls, `SET NOT NULL`, `UNIQUE` on `grade_computations.name` | Latest migration is `20260929130000_backfill_official_grading_components.sql` — the migration that *created* the duplicate. No subsequent migration exists. | **Not started** |
| **1** | Create `src/lib/academicPolicy.js` complete | **File does not exist.** Grep for `academicPolicy` across `src/` and `scripts/` returns zero matches. | **Not started** |
| **2** | Additive `gradingMath.js` fields: `encodedWeight`, `ratingOnEncoded`, `termsExpected`, `termsEncoded`, `isComplete`, `'In Progress'` remark, `export WEIGHT_TOLERANCE`, `toEffectiveGradeForPosting`, `TRANSMUTATION_LADDER` | None present. `WEIGHT_TOLERANCE` is still a private `const` at `gradingMath.js:6`. `toEffectiveGradeForPosting` has zero references repo-wide. | **Not started** |
| **3** | Fix the two confirmed `gradingMath.js` bugs | `gradingMath.js:498` is still `if (isIrregular && units < 18)`. `getPresidentsListTier` (`:480`) still has **zero callers** — the only grep hit is its own definition. | **Not started** |
| **3a** | `resolveGradingFormula` fails closed on a null formula; remove `LEGACY_GRADING_COMPONENTS` from runtime resolution | `gradingMath.js:308` still reads `formula?.ok ? formula.components : LEGACY_GRADING_COMPONENTS`. `gradingMath.js:66` still maps the legacy constant into a returned formula. | **Not started** |
| **4** | Tier resolver + completeness hook in `riskEngine.js`; re-derive `ADVISING_THRESHOLDS` from `ATTENDANCE` | No tier resolver, no completeness gate. `advisingEngine.js` still holds its own thresholds. | **Not started** |
| **5** | Apply the C12 signature change to `calculateAcademicRisk` | Signature unchanged — see C12 below. | **Not started** |
| **6** | Delete `src/lib/riskUtils.js` | **File still present** in `src/lib/`. | **Not started** |
| **7** | Write the full assertion suite (~50 assertions); `npm run verify:grading` green | `scripts/verifyGradingMath.js` is **208 lines**, unchanged. It still contains the single assertion C14 explicitly says to replace (`:120`, `resolveGradingFormula(null, { formulaAssigned: false })` asserted `ok: true`). | **Not started** |

### Finding: the green verification gate is a false readiness signal

`npm run verify:grading` passes:

```
Verified 5 grading presets, storage mapping, RLE safeguards, milestone identity,
analytics reuse, legacy fallback, and summer isolation.
```

That green run provides **zero coverage of anything in this plan**. It is a lock on current behaviour, including the `legacy fallback` assertion that C14 removes. It will go red the moment step 3a lands — which is correct and expected per Phase 0, but it means no existing test protects any of the work below.

---

## Confirmed rules C1–C18 — current code state

### C1 / D1 — President's List only (the `1.45` ladder, labels, fabricated probabilities)

**Not applied.** All three artefacts are live:

| Artefact | Locations |
|---|---|
| `1.45` cut | `AcademicInsights.jsx:82`, `:591`, `:632`, `:635`, `:639`; `student/Dashboard.jsx:174`; `MyGradesList.jsx:414` |
| 94% / 85% probabilities | `AcademicInsights.jsx:634` (`dlProbability = 94`), `:638` (`= 85`), surfaced at `:676`, `:938`, `:1018`, `:1318` |
| "1st/2nd Class Dean's Lister" labels | `gradingMath.js:516-517`; `AcademicInsights.jsx:593`, `:597`, `:633`, `:637` |

The fabricated probability is still sent to the LLM as authoritative context (`AcademicInsights.jsx:938`, `:1018`).

### C2 — §3.8.4 floor is 2.00

**Not applied.** `dean/AtRiskStudents.jsx:484` still reads `highestGradeItem.val > 1.75`. Honors students carrying an acceptable 2.00 subject are still flagged.

### C3 — 18-unit minimum for every student

**Not applied.** `gradingMath.js:498` — `if (isIrregular && units < 18)`. Regular students remain silently exempt.

### C6 / C10 — Attendance semantics and scope

**Not applied.** `AcademicInsights.jsx:236-248` is unchanged and wrong in all three documented ways:

```js
const { data: attendanceData } = await supabase
  .from('attendance_records')
  .select('status, is_fda')
  .eq('student_id', user.id);          // no class_record_id, no grouping

let lateAtt = attendanceData?.filter(a => a.status?.toLowerCase() === 'late').length || 0;
let absentAtt = attendanceData?.filter(a => a.status?.toLowerCase() === 'absent').length || 0;
let attendanceRate = totalAttSessions > 0
  ? Math.round(((presentAtt + (lateAtt * 0.5)) / totalAttSessions) * 100)   // Late half-credited
  : 100;                                                                     // Excused omitted
```

- **C10 scope error:** no `class_record_id` in the select, no grouping. 1 absence in each of 4 courses still sums to 4 and still flags FDA.
- **C6 Late:** still half-credited at `* 0.5` (the only site in the codebase that does this).
- **C6 Excused:** still omitted from the numerator, so an excused student's rate is still penalised.

### C12 — The three dead risk parameters

**Not applied — and the plan's claim is confirmed accurate.** `failingSubjectsCount`, `majorExamAverage` and `hasGradeBelow200` are destructured at `riskEngine.js:73`, `:74`, `:78`. A grep across the entire scoring body (lines 80–175) returns **no further reference to any of the three**. They are accepted and discarded.

`computeUnifiedRisk` still derives `hasGradeBelow200` at `:325` and passes it at `:335` into a function that ignores it. `classRoomService.js:593` still hardcodes `const hasGradeBelow200 = false;` under a three-line comment describing behaviour that exists in neither direction.

### C13 — GWA risk curve recalibration

**Not applied.** `riskEngine.js:91-104` still holds the original linear ramp:

```js
if (gwa <= 2.00)        { gwaPoints = 0; }
else if (gwa <= 3.00)   { gwaPoints = Math.round(((gwa - 2.00) / 1.00) * 25); }
else                    { gwaPoints = Math.round(26 + ((gwa - 3.01) / 1.99) * 34); }
```

Arithmetic verified against the plan's "Before" column: 2.25 → 6, 2.50 → 13, 2.75 → 19, 3.00 → 25, 4.00 → 43. The §3.3 zone table and Q4 of the defense guide therefore remain **disprovable in a live demo**.

### C14 / C15 — Grading templates

**Not applied at any layer.**

| Layer | Location | State |
|---|---|---|
| Schema | `supabase/migrations/` | No migration; `computation_id` still nullable; duplicate template row still exists |
| Admin UI | `SubjectForm.jsx:373` | `<option value="">No Template (Professor Defaults Standard)</option>` still present |
| Faculty UI | `GradeComponentsSetup.jsx:71` | Still resolves by display-name string: `templatesData.find(t => t.name === 'General / Professional Education Scale')` |
| Engine | `gradingMath.js:308` | Still falls back to `LEGACY_GRADING_COMPONENTS` |
| Render paths | `ExportPreviewModal.jsx:31`, `StudentRow.jsx:185`, `excelExport.js:89` | All three still call `resolveGradingFormula(null, { formulaAssigned: false })` |
| Admin tolerance | `GradeComputationsList.jsx:180` | Still strict `if (totalWeight !== 100)` — the admin UI still rejects formulas the engine accepts |

### C18 — `getEnrollmentType` vs its SQL twin

**Not applied.** `classRoomService.js:15-19` is unchanged:

```js
export function getEnrollmentType(studentSectionId, classSectionId) {
  if (!studentSectionId) return 'Irregular';
  if (!classSectionId) return 'Regular';          // SQL twin evaluates to 'Irregular'
  return studentSectionId === classSectionId ? 'Regular' : 'Irregular';
}
```

The divergence against `20260606164500_add_attendance_and_semester_transition.sql:137-140` stands. The same student can still be badged differently on `ClassAttendance.jsx` than on every other roster screen.

---

## Stage C — Write paths (highest consequence)

**Not started.** These are the paths that persist wrong data, so they remain the highest-priority unaddressed items.

| Required | Location | State |
|---|---|---|
| `getTransmutedGrade` → `toEffectiveGradeForPosting` | `ScoreInput.jsx:1374`, `:1384` | Unguarded. `:1374` `const rawGWA = getTransmutedGrade(finalSG);` and `:1384` `getTransmutedGrade(computedTermGrade)` both still persist `5.00` for a null rating. |
| Same, plus stop coercing `mr`/`tfr`/`fRate` to `0` | `GradeComputationPreview.jsx:739` | Unguarded `getTransmutedGrade(computedTermGrade)` still written to `effective_grade`. |
| `toDbRemark(getRemarks(...))` | `GradeOverride.jsx:165` | Still inline: `const remarks = parsedGrade <= 3.00 ? 'passed' : 'failed';` |
| INC / FDA / Dropped display fix | `GradeOverride.jsx:321` | Still `grade.remarks === 'passed' ? 'Passed' : 'Failed'` — every non-`passed` enum value renders as **"Failed"**. |
| Bare-subscript formula substitution | `dean/Dashboard.jsx:346`, `:540`; `AtRiskStudents.jsx:431` | All three still pass bare `classConfigMap[id]`. Silent 50/10/40 substitution continues. |

---

## Stage D — Read paths

**Not started.**

| Item | Location | State |
|---|---|---|
| **The two-line worst live defect** | `student/Dashboard.jsx:153,155` | `:153` still reads `Number(e.subjects?.credit_units \|\| 3.0)` — a column that does not exist, so every weight pins to `3.0`. `:155` still renders raw `computed_grade` on the 1.00–5.00 scale. |
| `resolveOfficialGwa` reference call site | `classRoomService.js:578-586` | Still the hand-rolled `effective_grade` → `computed_grade` → tentative ternary chain. |
| 2-of-10 parameter call | `dean/Dashboard.jsx:374` | Still `computeUnifiedRisk({ avgGwa, failingCount })`. Attendance, trajectory and missing work contribute nothing to the dean KPI. |
| Delete the localStorage absence cache | 1 writer, 3 readers | Writer `ScoreInput.jsx:603` intact. Readers intact at `StudentRow.jsx:231`, `PostedGradesView.jsx:201`, `ScoreInput.jsx:187`. |
| `ClassAttendance` FDA filter | `ClassAttendance.jsx:477` | Still `student.absences >= 4 \|\| student.absences >= 2` — the `>= 4` clause remains dead, so the filter returns `>= 2` while the badge at `:465` uses `>= 4`. |
| **Fabricated attendance data** | `student/Attendance.jsx:82-87` | **Still shipping.** Four hardcoded log entries dated 2026-08-13 → 2026-08-20 with invented remarks ("Arrived 10 mins late") are injected whenever a class has no records, and then counted into `presents`/`lates`/`absents`/`isFDA`. Indefensible in a defense build. |
| `advisingEngine` per-course attendance | `advisingEngine.js:50` | Still a single `attendance.absenceCount` aggregate; evidence label at `:75` still reports the cross-course sum as if it were one course. |

---

## Stage E — Consolidate and document

**Not started.**

| Item | Location | State |
|---|---|---|
| Excel formula-aware weights | `excelExport.js:377-380` | Still hardcodes `*50`, `*40`, `*0.1`. A 30/60/10 class still exports 50/10/40 arithmetic. |
| One `TRANSMUTATION_LADDER` | `excelExport.js:460+` | Ladder still re-encoded inline. |
| Advisor: add `description` | `invoke-advisor/index.ts:98-105` | Subject activity mapper still emits only `title`, `topicTag`, `term`, `score`, `maxScore`, `percentage`. The client-sent `description` is still dropped. |
| Advisor: per-course absences | `index.ts:107-115` | `courses[]` still carries only code, name, runningGwa, classStandingAverage, examAverage. |
| Advisor: insight-path sanitize parity | `index.ts:143` | Still `diagnostics: input?.diagnostics \|\| null` — raw pass-through. |

### Phase 9 — Scholarship, streak, per-subject stake

**Entirely absent.** Grep across `src/` and `supabase/` returns zero matches for `student_risk_history`, `student_semester_summary`, `getScholarshipStanding`, `getSubjectStake`, or `streakLength`. Both hard prerequisites are unbuilt. The only `scholarship` hits are comments in `classRoomService.js`, `riskEngine.js` and `invoke-advisor/index.ts`.

### Documentation

**Not synced.**

| Claim | Location | State |
|---|---|---|
| "no duplicated risk logic anywhere" | `ASPIRE_GRADING_AND_RISK_RULES_DEFENSE_GUIDE.md:93` | Still asserted verbatim; still false. |
| New §1.4 "Which Average Is Official" / §1.5 "Two Scales" | defense guide | Neither section exists. |
| SRS `> 1.75` per-subject floor | `ASPIRE-System-Scope-SRS-and-Architecture.md:105`, `:242` | Both still `> 1.75`, contradicting §3.8.4. |
| SRS transmutation table | `:530` | Still labels `1.75` as "Dean's Lister Threshold"; Virtus absent. |
| Risk tier / honors class conflation | `Implementation-Plan-ASPIRE-Major-System-Update.md:70` | Still "Moderate / President's Lister (PL) Risk (Score 25–49)". |

---

## Summary table

| Stage | Steps | Applied |
|---|---|---|
| A — Foundation | 0, 1, 2, 3, 3a, 4, 5, 6, 7 | 0 / 9 |
| B — Libraries | 8, 9, 10, 10a, 10b | 0 / 5 |
| C — Write paths | 11, 12, 13 | 0 / 3 |
| D — Read paths | 14, 15, 16, 17, 18, 18a | 0 / 6 |
| E — Consolidate & document | 19, 20, 21, 22 | 0 / 4 |
| **Total** | | **0 / 22** |

| Confirmed rule | Applied |
|---|---|
| C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13, C14, C15, C16, C17, C18 | **None** |

---

## Recommended entry point

Start at **Stage A, step 0 (the database migration)**, and respect the plan's own ordering constraints — in particular:

1. **Step 0 before step 3a.** Failing closed on a null formula while subjects still have `computation_id IS NULL` stops those classes producing grades entirely.
2. **Step 3a and step 10a in the same stage.** Three render paths (`StudentRow.jsx:185`, `excelExport.js:89`, `ExportPreviewModal.jsx:31`) pass a hardcoded null formula; failing closed without threading the real formula blanks those views.
3. **Step 7 before any of Stage B–D.** The current green `verify:grading` run covers none of this work, so the assertion suite is the only thing that will catch a silent arithmetic shift across ~30 files.

Before starting, capture the before/after value diff the plan's Verification section describes (per student: term ratings, SG, GWA, remarks, risk score and tier, honors status, absence count). Because everything lands in one pass, that diff is the only mechanism that will attribute each changed number to a specific confirmed rule.
