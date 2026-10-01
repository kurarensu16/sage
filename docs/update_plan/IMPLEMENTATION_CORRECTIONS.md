# IMPLEMENTATION.md — Corrections & Gaps Before You Start

> **Read this alongside `IMPLEMENTATION.md`, not instead of it.**
> Everything below is a correction to that document. Where this file and `IMPLEMENTATION.md` disagree, this file is right — each item was verified against the live codebase.
>
> **Verified against:** `sage/` at commit `b71b83b` (*"Merge pull request #41 from kurarensu16/aspire-system-updates"*), clean working tree.
> **Date:** 2026-10-01

---

## 0. Baseline — read this first

`IMPLEMENTATION.md`'s Executive Summary describes a codebase state that does not exist. Verified facts:

| `IMPLEMENTATION.md` says | Reality |
|---|---|
| `HEAD: db848f0` | HEAD is **`b71b83b`**. `db848f0` is its *parent* — the feature commit that merge brought in. The two are swapped. |
| "working tree uncommitted changes" | `git status --porcelain` is **empty**. |
| "`src/lib/academicPolicy.js` has been created" | **Does not exist.** |
| "migration `20261001090000_unify_academic_policy_templates.sql` has been generated" | **Does not exist.** Latest migration is `20260929130000_backfill_official_grading_components.sql`. |
| "Edits were initiated across `gradingMath.js`, `riskEngine.js`, `classRoomService.js`, `ScoreInput.jsx`, …" | No edits. All files are at merge state. |

**So: nothing from the plan is applied. You are starting from zero, not from a partial implementation.** Branch from `b71b83b`.

The good news — the *line numbers* throughout `IMPLEMENTATION.md` are accurate for `b71b83b` (they were re-verified post-PR #41, unlike the ones in `Unify-Academic-Rules-Across-ASPIRE.md`, which are pre-#41 and run 1–9 lines earlier in several files). Trust `IMPLEMENTATION.md`'s line numbers; locate by snippet anyway.

---

## 1. Steps where the document instructs the wrong thing

These six are the reason this file exists. If you implement them as written, the work will look complete and will be wrong.

### 1.1 — Step 10: the GWA risk curve contradicts Rule C13 🔴

`IMPLEMENTATION.md` Step 10 gives a piecewise curve that **defeats the purpose of the rule it cites.**

C13 exists for exactly one reason: to make §3.3's zone table and defense-guide Q4 ("a GWA 2.25 student is flagged Moderate") true, which they currently are not. The curve in Step 10 leaves them false.

| GWA | Live code today | **C13 requires** | Step 10 as written |
|---|---|---|---|
| 1.90 | 0 | **0** | **5** ← invents a penalty no rule asks for |
| 2.01 | 1 (LOW) | **25 (MODERATE)** | 5 (LOW) ❌ |
| 2.25 | 6 (LOW) | **28 (MODERATE)** | 12 (LOW) ❌ |
| 2.50 | 13 (LOW) | **30 (MODERATE)** | 20 (LOW) ❌ |
| 2.75 | 19 (LOW) | **33 (MODERATE)** | 28 (MODERATE) ✓ |
| 3.00 | 25 | **35** | 35 ✓ |
| 3.01 | 26 (MODERATE) | **50 (HIGH)** | 36 (MODERATE) ❌ |
| 4.00 | 43 | **55 (HIGH)** | 48 ❌ |
| 5.00 | 60 | **60** | 60 ✓ |

(`RISK_TIERS` boundaries: LOW < 25, MODERATE 25–49, HIGH 50–74, CRITICAL 75+.)

C13 also records *why* a ramp cannot work — "a *linear* 1–35 ramp still leaves 2.25 → 9 and 2.50 → 18 in LOW, so linear cannot satisfy §3.3." Step 10 is a re-derivation of that rejected approach. Only a **step discontinuity at 2.00** satisfies the rule, and it is principled: crossing 2.00 leaves the honors-eligible range (§3.8.4's floor is exactly 2.00), which is categorical rather than gradual.

**Implement this instead**, in `src/lib/riskEngine.js` (replaces the branch currently at lines 91–104):

```js
if (gwa <= 2.00) {
  // Safe zone. 2.00 is the §3.8.4 subject floor — still honors-eligible.
  gwaPoints = 0;
  gwaDetail = `GWA ${gwa.toFixed(2)} — On track (honors eligible)`;
} else if (gwa <= 3.00) {
  // Watch zone. Step to 25 at band entry: crossing 2.00 is categorical,
  // not gradual, so the band must open inside MODERATE (§3.3).
  gwaPoints = 25 + Math.round(((gwa - 2.00) / 1.00) * 10);   // 25 → 35
  gwaDetail = `GWA ${gwa.toFixed(2)} — Watch zone`;
} else {
  // Below the 75% passing cut-off.
  gwaPoints = 50 + Math.round(((gwa - 3.01) / 1.99) * 10);   // 50 → 60
  gwaDetail = `GWA ${gwa.toFixed(2)} — Failing (below 75% cut-off)`;
}
```

`RISK_WEIGHTS.gwa` stays **60**. Pin every one of these in `verifyGradingMath.js`:

```
2.00 → 0  LOW        3.00 → 35 MODERATE
2.01 → 25 MODERATE   3.01 → 50 HIGH
2.25 → 28 MODERATE   4.00 → 55 HIGH
2.50 → 30 MODERATE   5.00 → 60 HIGH
2.75 → 33 MODERATE
```

And assert these three documented claims still survive the change:
- GWA 3.00 + 4 absences → **85, CRITICAL**
- 4 absences alone → **50, HIGH**
- Component maximum `60 + 50 + 15 + 10 === 135`, capped to **100**

---

### 1.2 — Step 18: the instruction produces the opposite of its stated goal 🔴

`src/pages/faculty/ClassAttendance.jsx:477`:

```js
if (statusFilter === 'fda') return student.absences >= 4 || student.absences >= 2;
```

Step 18 says to *"remove the dead `>= 4` condition"* so the filter *"correctly isolates students at or above institutional FDA threshold (>= 4)"*. Those two halves contradict each other. `>= 4` is indeed the dead clause (`>= 2` subsumes it), but deleting it leaves `>= 2` — the wrong threshold, and the bug.

**Do:** make the filter `>= 4`, matching the badge at `:438` and `fdaCount` at `:465`. Better, route all three through one `getAttendanceFlags(...).isFda` from `academicPolicy.js` so they cannot drift again.

---

### 1.3 — Step 0 is unsafe without the admin/faculty UI fix 🔴 (ordering)

Step 0's migration ends with `ALTER TABLE subjects ALTER COLUMN computation_id SET NOT NULL`. But `IMPLEMENTATION.md` omits step 10b of `Unify-Academic-Rules-Across-ASPIRE.md`, which fixes the two UIs that still produce nulls and still reference the deleted template.

Verified, still live at `b71b83b`:

| File | Line | Problem after the migration |
|---|---|---|
| `src/pages/admin/SubjectForm.jsx` | `373` | `<option value="">No Template (Professor Defaults Standard)</option>` |
| `src/pages/admin/SubjectForm.jsx` | `236` | `computation_id: formData.computationId \|\| null` → **NOT NULL violation on every save** |
| `src/pages/faculty/GradeComponentsSetup.jsx` | `71` | Falls back by display-name string to `'General / Professional Education Scale'` — **the template C15 deletes**. Resolves to nothing. |
| `src/pages/faculty/GradeComponentsSetup.jsx` | `182` | Hardcodes that same deleted template's name as the display label |

**Do, in the same PR as the migration:**
1. `SubjectForm.jsx` — delete the `:373` option, add `required` to the select, validate `computationId` alongside `code`/`name` (the validation block around `:223`), and drop the `|| null` at `:236`.
2. `GradeComponentsSetup.jsx` — delete the `:65-75` name-string fallback entirely; resolve by `computation_id` only and render an explicit error state if it is missing. Remove the hardcoded label at `:182`.

The "Professor Defaults" label promises faculty-level weight customization that **was never built** (`custom_computation_id` / `is_weight_locked` exist only in `docs/FACULTY_GRADE_WEIGHT_CUSTOMIZATION_SPEC.md`). It must not ship again.

Also keep the ordering warning `IMPLEMENTATION.md` already states: **Step 0 before Step 3a.** And add one it omits: **Step 3a and Step 10a must land together.** Three render paths (`StudentRow.jsx:185`, `excelExport.js:89`, `ExportPreviewModal.jsx:31`) call `resolveGradingFormula(null, { formulaAssigned: false })`. Make the engine fail closed without threading real formulas into those three and those views render blank.

---

### 1.4 — Task 6.2: the dedupe code does not dedupe 🔴

Both dispatchers use:

```js
await supabase.from('notifications').insert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true });
```

In supabase-js v2 (this repo pins `^2.106.2`), `onConflict` and `ignoreDuplicates` are **`upsert()` options**. `insert()` accepts `{ count, defaultToNull }` and silently ignores both. So an unlock → relock cycle raises a `23505` unique-violation instead of no-op'ing — which is precisely the duplicate-notification bug the `dedupe_key` index was added to fix.

```js
const { error } = await supabase
  .from('notifications')
  .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true });
```

Same change in both `notifyGradePosted` and `notifyGradeChanged`. (This error is inherited verbatim from `NOTIFICATION_DELIVERY_ARCHITECTURE.md` §7 — it is wrong there too.)

---

### 1.5 — Step 12: wrong file path

`IMPLEMENTATION.md` says `src/pages/faculty/GradeOverride.jsx`. The file is at **`src/pages/admin/GradeOverride.jsx`**. There is no faculty copy.

---

### 1.6 — Step 2.3: `toEffectiveGradeForPosting` conflicts with Decision D3 ⚠️ **needs a decision, not a code choice**

`IMPLEMENTATION.md` defines it as:

```js
export function toEffectiveGradeForPosting(rating, { isComplete = true } = {}) {
  if (!isComplete || rating === null || rating === undefined) return null;
  return getTransmutedGrade(rating);
}
```

Combined with Step 11 passing `{ isComplete }`, this means **faculty cannot post a Midterm milestone until every grading component is encoded.** Decision D3/C5 locks the opposite: *"Milestone posting stays as-is. Grades posted at Midterm Rating and TFR are tentative and visible, subject to change after faculty consultation."*

The source spec defines the helper as a null guard only — "`getTransmutedGrade` without the 5.00-on-null behavior, for write paths only."

**Do not pick a side yourself.** Ask JC which is intended. Default, absent an answer — implement the null guard (D3-conforming) and leave completeness gating to the *risk engine* and *display* layers, which is where Phase 0/5 put it anyway:

```js
export function toEffectiveGradeForPosting(rating) {
  if (rating === null || rating === undefined || Number.isNaN(Number(rating))) return null;
  return getTransmutedGrade(rating);
}
```

The caller then throws the per-student error on `null`, reusing the `invalidTerm` guard pattern already at `ScoreInput.jsx:1344`.

---

## 2. Factual errors in the step bodies

Not dangerous, but they will cost you time or produce dead code.

### 2.1 — Task 2.1 names the wrong function, and re-adds fields that already exist

Both of these exist in `gradingMath.js`:
- `calculateStoredTermRating` — line **182** ← what `IMPLEMENTATION.md` says to edit
- `calculateWeightedTermRating` — line **348** ← what the source spec actually means

And `calculateWeightedTermRating` **already returns** `isComplete` (line 406) and `missingComponents` (lines 394–396). Only two fields are genuinely missing:

```js
// add to the return of calculateWeightedTermRating (:401-410)
encodedWeight,                                   // Σ weight of components with hasData
ratingOnEncoded: encodedWeight > 0
  ? Math.min(100, Math.max(0, Math.round((rawRating / encodedWeight) * 100)))
  : null,
```

`rating` must stay exactly as it is — `scripts/verifyGradingMath.js` pins current behaviour, including `isolatedExpected: 50` for the activities-only case. The whole change is additive: for every existing preset, assert `rating === preset.isolatedExpected` **and** `ratingOnEncoded === 100`.

Also note the pseudo-code in Task 2.1 assumes one score per component. The real function normalizes each component to an *array* of `{score, maxScore}` items (`normalizeScoreItems`, used at `:363`) and derives a per-component `hasData`. Build `encodedWeight` from that existing `contributions` array — don't write a second loop.

### 2.2 — Task 2.2's snippet drops three fields from the return

As written it returns `{ sg, remarks, termsExpected, termsEncoded, isComplete }`. The real `calculateSemestralGrade` (`:443`) returns `{ mr, tfr, sg, gwa, remarks }` and every caller destructures `mr`/`tfr`. Keep all five and add the three.

Changing `remarks` is safe — `calculateSemestralGrade().remarks` has **zero consumers** today; every call site destructures `{ mr, tfr, sg }` and re-derives the remark inline.

### 2.3 — Rule citations in step headers are wrong in two places

- **Step 1** cites C8 — that is "an enrolled Summer with PL is shown but not counted", a Phase 9 streak rule, unrelated to `academicPolicy.js`'s foundation.
- **Step 4** cites C4 — that is "streak counts regular semesters only", also Phase 9.

Ignore both when tracing back to the decision table.

---

## 3. Work missing from the plan that still has to happen

These are omissions rather than errors. Flagging them so they don't get scored as out-of-scope later. Numbering is from `Unify-Academic-Rules-Across-ASPIRE.md`'s execution order.

| # | Missing work | Why it matters |
|---|---|---|
| **a** | **Unify step 15 — C11 plain-mean averaging.** `IMPLEMENTATION.md` Step 1 calls `resolveOfficialGwa` a "plain-mean resolver"; it is not. `resolveOfficialGwa` resolves *scale* per row. The averaging is `computeStudentGwa` / `averageCohortGwa`. Nothing in the plan migrates `MyGradesList.jsx:383-384,408` or `AcademicInsights.jsx:486-487,578-580` off credit-weighting, and nothing relabels `faculty/Dashboard.jsx:311-320` as "Average Term Rating (%)". | C11 is the decision that **moves student-visible GWAs** and can flip a borderline honors tier. It currently has no execution step at all. |
| **b** | **Unify step 14 — the other ~18 scale sites.** Plan covers `student/Dashboard` and `classRoomService` only. Still open: `dean/GradeDistribution.jsx:38-41`, `dean/Dashboard.jsx:50,331,411,530`, `SummaryReports.jsx:107,109,179,221`, `AtRiskStudents.jsx:411`, `MyGradesList.jsx` (4), `MyGradesDetail.jsx:249`, `AcademicInsights.jsx` (4). | Each is an `effective_grade ?? computed_grade` ternary comparing a raw 0–100 value against the 3.00 cutoff — i.e. **passing students counted as Failed**. |
| **c** | **Unify step 17 — one risk model.** Open-coded `25/50/75` in `StudentRow.jsx:326-342`, `ClassRecordsList.jsx:574,616-625`, `FacultyCharts.jsx:290-293`; separate models in `SummaryReports.jsx:188,235-239` and `AcademicInsights.jsx:48-56`; `StudentRisk.jsx:84`'s `>= 20`; `dean/Dashboard.jsx:550` as a third at-risk rule in a file that already has two. | Also breaks Part III: Task 8.4 says verify the reports at-risk card "exactly matches `StudentRisk.jsx`" — but `StudentRisk.jsx` uses `>= 20` and the plan intends `RISK_TIERS.MODERATE.min` (25). Without this step the cross-check validates a number that is itself scheduled to change. |
| **d** | **`GWA_BANDS` bracket unification** — `dean/Dashboard.jsx:500-513`, `DeanCharts.jsx:500-534,702-709`, `GradeDistribution.jsx:254-257`. | Three divergent tables with gaps: grades in (1.50, 1.75) and (2.50, 2.75) match **no** bracket, vanish from the chart, and still count in the total. Assert `Σ bracket.count === array.length`. |
| **e** | **PR #41 regression risk in Step 15.** Step 15 edits `classRoomService.js:578-586`. `getClassPriorityRoster` must keep returning `home_section_id`, `enrollment_type`, `is_irregular` (`:634-636`) plus `section_id` in the two `users` selects (`:328`, `:433`). | Four components depend on them — `StudentRow.jsx`, `StudentRisk.jsx`, `GradeComputationPreview.jsx`, `ScoreInput.jsx`. Dropping them silently removes **every Irregular badge** added by PR #41. |
| **f** | **`NOTIFICATION_DELIVERY_ARCHITECTURE.md` §6 — per-channel message content.** Absent from the plan entirely, including from Deferred Scope. | `notifyGradePosted` writes `Remark: ${s.remark}` into `message`, and `message` is what the existing Capacitor path renders as an Android **lock-screen banner**. As specified, Phase 2 ships *"Your Midterm grade for IT401 has been posted. Remark: Failed."* to a lock screen, readable by anyone holding the phone. Build `notificationTemplates.js` with the push / in-app / email split before wiring Task 6.3. |
| **g** | **Fan-out trigger.** Section 11 creates `notification_deliveries` and `notification_preferences`; nothing ever writes a delivery row. The source doc's build-order step 3 is "deliveries + preferences + **fan-out trigger**". Also restore `ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY` (service-role only, no client policy) — Section 11 drops it, and that table holds recipient email addresses. | |
| **h** | **§5 routing matrix**, including its two standing rules: `severity = 'critical'` ignores preferences for the in-app channel, and **nothing naming a student's risk or failing status leaves the authenticated app** (the reason `ews_alert` and `risk_threshold` have no email column). | |
| **i** | **The adviser-consult line.** Both source docs require it; the dispatcher message omits it. Surface the remark plus a prompt to consult an adviser — and **do not** auto-generate any "you may need to shift courses" text. That is a human adviser's judgment. | |
| **j** | **Reports module (Part III) gaps:** count only `class_enrollments.approval_status = 'approved'`; exclude `null` scores from averages rather than treating them as 0; academic-year filter with URL query-param persistence; section filter dropdown; grade-template name beside comparison rows. Plus the whole Design System Compliance section — `sage-*` tokens only, `lucide-react` not emoji in report tables, JetBrains Mono for all grade values, no `dark:` variants, unique IDs on every filter control (required by the Definition of Done). | The first two directly determine the summary-card numbers Task 8.4 says must match `StudentRisk.jsx`. |
| **k** | **Unify step 19 leftovers:** extract `DYCI_COMPUTATION_PRESETS` from `GradeComputationsList.jsx:9-54` and import it in `verifyGradingMath.js:15-65` (which re-declares the same five presets); `GradeComputationsList.jsx:180`'s strict `totalWeight !== 100` → `WEIGHT_TOLERANCE` (the admin UI currently rejects formulas the engine accepts); dedupe `seedDatabase.js:122-124` and `GradeComponentsSetup.jsx:29-32`. | |
| **l** | **The before/after value diff.** The plan's own Verification section calls for it and the checklist omits it. Before starting, run a throwaway script over one representative class printing per student: term ratings, SG, GWA, remarks, risk score + tier, honors status, absence count. Re-run after Stage D and diff. **Every changed value must map to a specific rule (C1–C18) or a listed bug fix — any change you cannot attribute is a regression.** | This is the only safety net that replaces the per-phase attribution the single-pass approach gives up. |

---

## 4. One decision already made that you should know the consequence of

**Step 10b (C18) — `getEnrollmentType` aligned to its SQL twin.** The chosen fix returns `'Irregular'` when `classSectionId` is null, matching `get_class_attendance_roster` in `20260606164500_add_attendance_and_semester_transition.sql:137-140`.

That is the right call (the two must agree, and SQL is the one `ClassAttendance.jsx:167,249` already reads). Just be aware of the behaviour change: **a class with no `section_id` now badges every enrolled student Irregular**, where the JS previously badged them all Regular. If sectionless classes exist in the seed or demo data, that will be visible. Check before you ship it.

---

## 5. Run order

Unchanged from `IMPLEMENTATION.md` except where noted:

1. **Step 0 migration + §1.3's `SubjectForm` / `GradeComponentsSetup` fixes — together, one PR.**
2. `academicPolicy.js`, the `gradingMath.js` additive fields (§2.1), the C3 unit-gate fix, `getPresidentsListTier` delegation.
3. **Step 3a (fail closed) + Step 10a (thread formulas) — together.**
4. Risk engine: completeness gate, dead-parameter removal, **§1.1's curve**.
5. Delete `riskUtils.js`.
6. **Write the full assertion suite. `npm run verify:grading` green before any call-site migration.**
7. Then Stages B → C → D → E. `npm run verify:grading` after **each stage**, not once at the end.

Within Stage D, keep these:
- scale before averaging (averaging a mix of 0–100 and 1.00–5.00 values is meaningless)
- averaging before honors (eligibility reads the average)
- C10 attendance *scope* fix before C6 *counting* fix (counting the wrong set correctly is still wrong)

Gates: `npm run verify:grading`, `npm run lint`, `npm run build`.

Post-migration SQL checks, before any code change:

```sql
SELECT count(*) FROM subjects WHERE computation_id IS NULL;                                  -- expect 0
SELECT count(*) FROM grade_computations WHERE name = 'General Education Core';               -- expect 1
SELECT count(*) FROM grade_computations WHERE name = 'General / Professional Education Scale'; -- expect 0
```

C14/C15 should produce **zero grade changes** in the before/after diff — every affected subject was already computing at 50/40/10 by coincidence. A changed value attributable to them means some subject was on a different formula than believed. Treat that as a finding, not noise.

---

## Questions to resolve before coding

1. **§1.6** — is `toEffectiveGradeForPosting` a null guard (D3-conforming) or a completeness gate (blocks milestone posting)? Needs JC's answer.
2. **RLS on `notifications`** — `IMPLEMENTATION.md` defers it to Phase 3. The source architecture doc ranks it build-order **step 1**, effort **S**, "Blocks: Everything", and calls the current state (RLS off, every authenticated client can read every user's notifications including named students' grade status) "the most serious item on the list". Confirm the deferral is deliberate before relying on it.
3. **§4** — do any `class_records` exist with a null `section_id`? Determines whether the C18 fix is visible in the demo.
