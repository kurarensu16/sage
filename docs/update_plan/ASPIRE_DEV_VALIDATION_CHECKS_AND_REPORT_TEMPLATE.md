# ASPIRE — Developer Validation Checks & Report Template

**For:** Development team
**Date:** 2026-10-01
**Companion to:** `ASPIRE_IMPLEMENTATION_VERIFICATION_AUDIT.md` (the gap analysis)
**Purpose:** the remaining checks to run on your side, and the exact format to report back in

---

## How this document works

Two halves:

- **Part A — Validation checks.** Things only you can verify, because they need the code, a running app, or the production database. Run these on your side.
- **Part B — Report template.** Copy it, fill it in, send it back. It is structured so the review can be done quickly and precisely.

### Why the format matters

The previous implementation report could not be verified, because it was written as a **narrative summary**. For example:

> *"Preserved available-term computation while marking partial semestral results as In Progress…"*

From that sentence it is impossible to tell whether `ratingOnEncoded` and `encodedWeight` exist. That is exactly the difference between the headline defect being fixed and still being live. The report was accurate English and unusable as evidence.

**So: paste actual command output. Do not describe it.** A three-line grep result is worth more than a paragraph.

### Two ground rules

1. **Any line numbers quoted anywhere are from commit `b71b83b`, before your changes.** Your files have shifted. **Locate code by the quoted snippet or function name, never by line number.** A prior PR shifted `classRoomService.js` by ~14 lines and silently invalidated 27 references in the plan — this is a real failure mode, not a hypothetical one.
2. **`npm run build`, `npm run lint` and `npm run verify:grading` all passing does not mean the UI works.** The verify script exercises `src/lib/` in Node and never renders a component. Several checks below are runtime-only, and the two highest-severity risks would pass all three gates.

---

# Part A — Validation checks

## A1. Regression guards — what must NOT have changed

Just as important as the fixes. If any of these moved, it is a silent regression.

### A1.1 The transmutation ladder is untouchable

```bash
grep -n "return 1.00\|return 1.25\|return 1.50\|return 1.75\|return 2.00\|return 2.25\|return 2.50\|return 2.75\|return 3.00\|return 5.00" src/lib/gradingMath.js
```

The ten boundaries must remain exactly:

`98→1.00 · 95→1.25 · 92→1.50 · 89→1.75 · 86→2.00 · 83→2.25 · 80→2.50 · 77→2.75 · 75→3.00 · below 75→5.00`

This is institutional policy, reproduced in the defense guide, the SRS, and the Excel export. **If one boundary moved, every grade in the system shifted.**

### A1.2 Summer term compression — easy to break

```bash
grep -n "isSummer" src/lib/gradingMath.js
```

Summer uses **Midterm + Final only** and must ignore stray Prelim and Semi-Final values. The pre-existing assertion must still pass:

```js
calculateSemestralGrade({ prelim:50, midterm:80, semiFinal:40, final:90, isSummer:true }).sg === 85
```

**And the new field must be summer-aware: `termsExpected` must be 2 for summer, not 4.** If it is hardcoded to 4, every summer class reads as permanently incomplete and never produces a verdict. This is the single most likely new bug introduced by the `isComplete` work.

### A1.3 Available-term non-null averaging still applies

Unencoded future **terms** must still be excluded from averages, never treated as zero:

```js
calculateSemestralGrade({ prelim: 97 }).sg === 97   // must still be 97
```

The only intended change is that `remarks` becomes `In Progress` instead of a verdict. **If `sg` became `null` or `48.5`, the fix overreached.**

### A1.4 Multi-bucket formulas still fail closed

```bash
grep -n "Categorize every activity\|multipleComponents.length > 1" src/lib/gradingMath.js
```

A formula with more than one repeatable bucket must still refuse to calculate until every activity carries a `component_id`. The RLE / clinical-practicum preset depends on this. The existing assertion that an uncategorized RLE activity yields `ok: false` must still pass.

### A1.5 Formula snapshot precedence

```bash
grep -rn "grading_formula_snapshot" src/
```

`class_records.grading_formula_snapshot` must still take precedence over `subjects.computation_id` in every resolution path. This is what stops an admin editing a template from retroactively changing already-posted grades.

### A1.6 Posting milestone semantics unchanged

```bash
grep -n "getMilestoneForPostingTarget\|midterm_rating\|tentative_final_rating\|semestral_grade" src/lib/gradeMilestones.js
```

Faculty still choose an explicit milestone, and legacy `grade_period` values (`'mr'`, `'tfr'`, `'sg'`, `'midterm'`, `'final'`) must still canonicalize correctly. Posting at MR/TFR remains allowed, and those grades stay **tentative-but-visible** — this was deliberately *not* changed.

### A1.7 The irregular-student work from PR #41

```bash
grep -rn "EnrollmentTypeBadge" src/
grep -n "enrollment_type\|is_irregular\|home_section_id" src/lib/classRoomService.js
```

Four components render the badge, and all four depend on `getClassPriorityRoster` returning `enrollment_type`, `is_irregular` and `home_section_id`, plus `section_id` surviving in the two `users` selects. Refactoring the roster without preserving them **silently removes every Irregular badge.**

Confirm visually on: Score Input · Student Risk · Evaluate Students · Grade Computation Preview (both the mobile cards and the desktop ledger).

### A1.8 No new hardcoded academic policy

```bash
grep -rn "3\.00\|1\.75\|2\.00\|>= 4\|< 75\|>= 75" src/pages/ src/components/ \
  | grep -v "className\|px-\|py-\|w-\|h-\|text-\|gap-\|rounded\|border"
```

Every academic threshold must come from the policy module. Remaining hits are either styling false positives or new hardcoding.

**Plus the architectural invariant:** no export of `academicPolicy.js` may contain a component `weight` key. Grading weights live in the database, per subject — that separation is the whole point.

```bash
grep -n "weight" src/lib/academicPolicy.js
```

### A1.9 The assertion count did not shrink

```bash
grep -c "assert" scripts/verifyGradingMath.js
```

Record the number. **Exactly one** pre-existing assertion was approved for change: the one expecting `resolveGradingFormula(null, { formulaAssigned: false })` → `ok: true, source: 'legacy'`. Every other original assertion must still be present.

A falling count means assertions were **deleted rather than replaced** — which removes the regression net that makes the rest of this change safe.

### A1.10 No new console errors

Open each faculty and student page with the browser console open. Zero uncaught errors, zero React key/prop warnings.

The fail-closed change in particular tends to surface as `Cannot read properties of null (reading 'toFixed')` wherever a component assumed `rating` was a number.

---

## A2. Runtime checks — cannot be caught by static analysis

### A2.1 Render paths affected by the fail-closed change

Three call sites previously used the legacy formula as a fallback when no formula prop was supplied: `StudentRow.jsx`, `excelExport.js`, `ExportPreviewModal.jsx`. With `resolveGradingFormula` now failing closed, each returns `{ ok: false }` → `calculateStoredTermRating` short-circuits → `rating: null`.

```bash
grep -rn "resolveGradingFormula(null" src/
grep -rn "formulaAssigned: false" src/
```

Expected: **no hits** in `src/pages/` or `src/components/`.

Then, with `npm run dev`:

| # | Action | Pass condition |
|---|---|---|
| A2.1.1 | Faculty → Score Input → open a class with scores | Activity scores, term ratings and the rating column all render |
| A2.1.2 | Same page → Export → **Excel** | Record Sheet shows scores and term ratings, not blanks |
| A2.1.3 | Same page → Export → **Preview modal** | Table shows MR / TFR / GWA, not `—` on every row |
| A2.1.4 | Faculty → Grade Computation Preview | Student rows show computed values |
| A2.1.5 | Faculty → Posted Grades View | Grid renders grades |

### A2.2 The partial-data defect

Save as `scratch_verify_partial.mjs` in the `sage` folder, run `node scratch_verify_partial.mjs`, and paste the output.

```js
import {
  resolveGradingFormula,
  calculateStoredTermRating,
  calculateSemestralGrade,
  getTransmutedGrade
} from './src/lib/gradingMath.js';
import { calculateAcademicRisk } from './src/lib/riskEngine.js';

// A real configured formula — the legacy fallback no longer exists
const formula = resolveGradingFormula([
  { name: 'Class Standing',    weight: 50, max_score: 20,  is_multiple: true  },
  { name: 'Character Rating',  weight: 10, max_score: 100, is_multiple: false },
  { name: 'Major Examination', weight: 40, max_score: 40,  is_multiple: false }
], { formulaAssigned: true });

const maxItems = { act1:20, act2:20, act3:20, act4:20, act5:20, act6:10, char:100, exam:40 };

// Perfect activities; exam and character NOT encoded
const r = calculateStoredTermRating({
  formula,
  termScores: { act1:20, act2:20, act3:20, act4:20, act5:20, act6:10 },
  maxItems,
  activities: []
});

console.log('rating (banked)   :', r.rating);             // expect 50 — unchanged by design
console.log('ratingOnEncoded   :', r.ratingOnEncoded);    // expect 100  <-- MUST EXIST
console.log('encodedWeight     :', r.encodedWeight);      // expect 50   <-- MUST EXIST
console.log('isComplete        :', r.isComplete);         // expect false
console.log('missingComponents :', r.missingComponents);  // expect [Character, Examination]

const sem = calculateSemestralGrade({ prelim: r.rating });
console.log('sem.isComplete    :', sem.isComplete);       // expect false
console.log('sem.remarks       :', sem.remarks);          // expect "In Progress", NOT "Failed"

// Summer must expect 2 terms, not 4  (regression guard A1.2)
const sum = calculateSemestralGrade({ midterm:80, final:90, isSummer:true });
console.log('summer sg         :', sum.sg);               // expect 85
console.log('summer expected   :', sum.termsExpected);    // expect 2  <-- NOT 4
console.log('summer isComplete :', sum.isComplete);       // expect true

// The risk gate
const ungated = calculateAcademicRisk({ currentGwa: getTransmutedGrade(r.rating), absenceCount: 0 });
console.log('ungated risk      :', ungated.composite_score, ungated.risk_level); // 60 high
const gated = calculateAcademicRisk({ currentGwa: null, absenceCount: 0 });
console.log('gated risk        :', gated.composite_score, gated.risk_level);     // 0 low
```

Then in the running app:

| # | Action | Pass condition |
|---|---|---|
| A2.2.1 | Enter perfect activity scores for one term; leave exam and character blank | Student does **not** show GWA 5.00 or "Failed" |
| A2.2.2 | Open Student Risk for that class | That student is **not** HIGH risk on grades alone |
| A2.2.3 | Sign in as that student → My Grades, Academic Insights | No failing verdict for the in-progress term |

### A2.3 Per-course FDA (attendance scope)

The previous behaviour summed absences across every course, so **1 absence in each of 4 courses triggered an FDA flag** — a critical-severity false positive that also persisted into the student's saved insight verdict.

| # | Action | Pass condition |
|---|---|---|
| A2.3.1 | Give a student 1 absence in each of 4 different classes | **No** FDA flag anywhere |
| A2.3.2 | Give a student 4 absences in **one** class | FDA flag raised, and the message names **that course** |
| A2.3.3 | Add `Late` and `Excused` rows | Attendance rate changes; FDA count does **not** |
| A2.3.4 | Student with 3 Lates + 1 Absent | **Not** FDA |

### A2.4 Grading template enforcement

| # | Action | Pass condition |
|---|---|---|
| A2.4.1 | Admin → Subjects → create a new subject | The Grading System Template field is **required**; no "No Template (Professor Defaults Standard)" option exists |
| A2.4.2 | Faculty → Grade Components Setup on any class | Resolves by `computation_id`; no display-name string lookup; no hardcoded fallback label |
| A2.4.3 | Create a class on a non-default template (e.g. 30/60/10) and export to Excel | The spreadsheet formulas use **30/60/10**, not 50/10/40 |

---

## A3. Database — migration preflight

The migration sets `NOT NULL` and adds a `UNIQUE` constraint. Both abort the transaction if the data does not fit. **Run these against production before applying.**

```sql
-- 1. Subjects with no template (these get backfilled)
SELECT count(*) AS null_templates FROM subjects WHERE computation_id IS NULL;

-- 2. List them, to sanity-check that 'General Education Core' is right for each
SELECT subject_id, code, name, units FROM subjects
WHERE computation_id IS NULL ORDER BY code;

-- 3. Target template exists exactly once
SELECT computation_id, name FROM grade_computations
WHERE name = 'General Education Core';

-- 4. The duplicate, and what points at each
SELECT gc.computation_id, gc.name, count(s.subject_id) AS subjects_using
FROM grade_computations gc
LEFT JOIN subjects s ON s.computation_id = gc.computation_id
WHERE gc.name IN ('General Education Core', 'General / Professional Education Scale')
GROUP BY gc.computation_id, gc.name;

-- 5. Any OTHER duplicate names the new UNIQUE constraint would reject
SELECT name, count(*) FROM grade_computations
GROUP BY name HAVING count(*) > 1;

-- 6. *** BLOCKING *** Are the two templates' components actually identical?
SELECT gc.name, gcc.name AS component, gcc.weight, gcc.max_score, gcc.is_multiple
FROM grade_computations gc
JOIN grade_computation_components gcc ON gcc.computation_id = gc.computation_id
WHERE gc.name IN ('General Education Core', 'General / Professional Education Scale')
ORDER BY gc.name, gcc.name;

-- 7. Classes with a frozen snapshot are unaffected by the repoint — quantify
SELECT count(*) FILTER (WHERE grading_formula_snapshot IS NOT NULL) AS snapshotted,
       count(*) FILTER (WHERE grading_formula_snapshot IS NULL)     AS resolves_via_subject
FROM class_records;
```

**Query 6 is the blocking one.** The merge is only safe if the two templates are genuinely identical. **If their weights differ, repointing subjects from one to the other changes computed grades for every class without a snapshot.** If Q6 shows a difference, do not apply the migration — report back instead.

### Before applying

- [ ] Take a database backup. `SET NOT NULL` and dropping a template are not trivially reversible.
- [ ] Wrap the migration in an explicit transaction so a constraint failure rolls everything back.

### After applying

```sql
SELECT count(*) FROM subjects WHERE computation_id IS NULL;                    -- expect 0
SELECT count(*) FROM grade_computations WHERE name = 'General Education Core'; -- expect 1
SELECT count(*) FROM grade_computations
  WHERE name = 'General / Professional Education Scale';                       -- expect 0
```

---

## A4. Before/after value diff — the check nothing else replaces

Because everything landed in one pass across ~30 files, there is no per-change attribution. This diff is the substitute.

Write a throwaway script that prints, for **one representative class, per student**: term ratings, SG, GWA, remarks, risk score, risk tier, honors status, absence count.

Run it against `b71b83b` and against your build, then diff.

**Every changed value must map to an approved rule or a listed bug fix. Anything you cannot attribute is a regression.**

Expected and intentional changes:

| Change | Cause |
|---|---|
| Student dashboard GWA goes from a 0–100 figure (e.g. `84.00`) to a real GWA (`2.25`) | Scale fix + the `credit_units` column typo |
| Dean pass/fail counts change where `effective_grade IS NULL` | Students previously counted Failed because `84 > 3.00` |
| Perfect-activities students stop reading 5.00 / Failed / HIGH | Completeness fix |
| GWA 1.26–1.45 students relabel from "1st Class Dean's Lister" to **Excellentia**; the 94%/85% figures disappear | Honors unification |
| President's List counts **drop** where a subject is worse than 2.00, or a student carries under 18 units | §3.8.4 and §3.8.3 gates now enforced |
| PL Risk Roster counts **rise** — students holding a 2.00 subject stop being flagged | Floor corrected from 1.75 to 2.00 |
| GWA 2.01–3.00 students move LOW → **MODERATE** | Recalibrated curve. Expect more Moderate flags and more faculty mentoring load. |
| Student FDA flags **fall sharply** | Per-course attendance scope |
| Attendance rates **rise** where `Late` or `Excused` rows exist | Both now count as attended |
| Faculty can no longer post a null term rating | Previously stored `5.00` silently |

If a value changes that is **not** on this list, investigate before shipping.

---

# Part B — Report template

Copy everything below into `docs/reports/ACADEMIC_RULES_VERIFICATION_RESPONSE_<YYYY-MM-DD>.md`, fill it in, and send it back.

Three rules:

1. **Paste output. Do not summarize it.**
2. `Done` requires evidence — a file reference, a snippet, or command output. **"Done" with an empty evidence cell will be read as not done.**
3. **`Not done` is a perfectly acceptable answer.** Say so plainly with the reason. An honest gap is far easier to work with than an optimistic claim.

---

```markdown
# Academic Rules Unification — Verification Response

**Date:**
**Prepared by:**

## 1. Anchor

Commit(s):      <full SHA>
Branch:
Base commit:    <SHA this branched from>

$ git diff --stat <base>..HEAD
<paste>

## 2. Blocking items

### 2.1 Fail-closed render paths (A2.1)

$ grep -rn "resolveGradingFormula(null" src/
<paste — expected: no output>

$ grep -rn "formulaAssigned: false" src/
<paste>

Runtime:
  A2.1.1 Score Input renders scores           PASS / FAIL  <note>
  A2.1.2 Excel export shows ratings           PASS / FAIL  <note>
  A2.1.3 Export preview shows MR/TFR/GWA      PASS / FAIL  <note>
  A2.1.4 Grade Computation Preview renders    PASS / FAIL  <note>
  A2.1.5 Posted Grades View renders           PASS / FAIL  <note>

### 2.2 Partial-data defect (A2.2)

$ node scratch_verify_partial.mjs
<paste the FULL output>

Does the production risk path receive null / a provisional flag
rather than the transmuted 5.00 for an incomplete term?   YES / NO
Where:  <file + function>

Runtime:
  A2.2.1 Perfect activities, exam blank → no 5.00/Failed   PASS / FAIL
  A2.2.2 Same student not HIGH risk on grades alone        PASS / FAIL
  A2.2.3 Student side shows no failing verdict             PASS / FAIL

## 3. Per-item status

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | `encodedWeight` + `ratingOnEncoded` exist | | |
| 2 | Risk GWA factor gated on completeness | | |
| 3 | 18-unit gate unconditional (not `isIrregular &&`) | | |
| 4 | `getPresidentsListTier` delegates to the shared gate | | |
| 5 | Three dead risk params removed from signature + all call sites | | |
| 6 | `src/lib/riskUtils.js` deleted | | |
| 7 | `classRoomService` — scale resolver, real per-subject grades, `countAbsences`, `isSummer` passed, phantom `colsMap` defaults dropped | | |
| 8 | PR #41 roster fields preserved (`enrollment_type`, `is_irregular`, `home_section_id`) | | |
| 9 | `excelExport` — formula-derived weights + maxima | | |
| 10 | `excelExport` — single transmutation ladder (was 3 copies) | | |
| 11 | `excelExport` — `isComplete` gating (no "Failed" mid-semester) | | |
| 12 | `excelExport` / `ScoreInput` / `GradeComputationPreview` — `char: 100` normalization | | |
| 13 | `advisingEngine` receives per-course attendance | | |
| 14 | Three null-formula callers threaded with a real formula | | |
| 15 | `ScoreInput` posting uses the null-safe conversion | | |
| 16 | `GradeComputationPreview` — stops coercing `mr`/`tfr`/`fRate` to 0 | | |
| 17 | All `sage_absences_*` localStorage reads (3) + the write (1) removed | | |
| 18 | `admin/GradeOverride` — shared remarks helper | | |
| 19 | `admin/GradeOverride` — INC/FDA/Dropped no longer display as "Failed" | | |
| 20 | Scale resolver used at all ~20 read sites | | |
| 21 | `credit_units` typo fixed (column is `subjects.units`) | | |
| 22 | Averaging via the single plain-mean helper | | |
| 23 | `faculty/Dashboard` cohort average relabelled, NOT converted to a GWA | | |
| 24 | 1.45 ladder + 94%/85% probabilities removed | | |
| 25 | `AtRiskStudents` per-subject floor = 2.00 (and exactly 2.00 passes) | | |
| 26 | GWA bracket tables unified; percentages sum to 100 | | |
| 27 | Risk tiers via the shared resolver (no open-coded 25/50/75) | | |
| 28 | All at-risk counting via `isStudentAtRisk` | | |
| 29 | `StudentRisk` filter uses MODERATE.min (25), not 20 | | |
| 30 | Dean KPI passes the full risk input set (was 2 of 10) | | |
| 31 | `getEnrollmentType` reconciled with `get_class_attendance_roster` | | |
| 32 | Literals consolidated; `WEIGHT_TOLERANCE` used in the admin UI | | |
| 33 | Hardcoded weight label replaced with the presentation helper | | |

## 4. Verification output

$ npm run verify:grading
<paste full output>

$ npm run lint
<paste>

$ npm run build
<paste>

Assertion count:  before <N>  →  after <M>
Only pre-existing assertion changed: the legacy-fallback expectation?  YES / NO

Assertion groups present:
  Ladder pin (10 boundaries)              YES / NO
  Partial data (rating + ratingOnEncoded) YES / NO
  Partial semester / In Progress          YES / NO
  Summer termsExpected === 2              YES / NO
  Fail closed on null formula             YES / NO
  Scale golden table (~12 row shapes)     YES / NO
  Null safety (toGwaOrNull vs 5.00)       YES / NO
  Plain-mean vs credit-weighted fixture   YES / NO
  Band exhaustiveness loop                YES / NO
  Honors gates incl. 2.00 PASSES          YES / NO
  18-unit gate, all students              YES / NO
  Risk curve boundaries                   YES / NO
  Dead params absent                      YES / NO
  Attendance counting                     YES / NO
  Per-course FDA (1 absence x 4 courses)  YES / NO
  1.45 tripwire                           YES / NO

## 5. Regression guards (A1)

  A1.1  Transmutation ladder unchanged       PASS / FAIL
  A1.2  Summer termsExpected === 2           PASS / FAIL   <-- easy to miss
  A1.3  {prelim:97} still yields sg 97       PASS / FAIL
  A1.4  Multi-bucket still fails closed      PASS / FAIL
  A1.5  Snapshot precedence intact           PASS / FAIL
  A1.6  Milestone posting unchanged          PASS / FAIL
  A1.7  All four Irregular badges render     PASS / FAIL
  A1.8  No new hardcoded policy              PASS / FAIL   <paste grep output>
  A1.9  Assertion count did not shrink       PASS / FAIL
  A1.10 No new console errors                PASS / FAIL

## 6. Runtime attendance checks (A2.3)

  A2.3.1 1 absence x 4 courses → no FDA              PASS / FAIL
  A2.3.2 4 absences in 1 course → FDA, names course  PASS / FAIL
  A2.3.3 Late/Excused change rate, not FDA count     PASS / FAIL
  A2.3.4 3 Lates + 1 Absent → not FDA                PASS / FAIL

## 7. Grading template enforcement (A2.4)

  A2.4.1 Template field required; no "No Template" option   PASS / FAIL
  A2.4.2 Resolves by computation_id, no name lookup          PASS / FAIL
  A2.4.3 30/60/10 class exports 30/60/10 formulas            PASS / FAIL

## 8. Before/after value diff (A4)

| Student | Metric | Before | After | Attributed to |
|---|---|---|---|---|
| | | | | |

### Unexplained changes
<list any value that changed without an attributable cause — or "none">

## 9. Migration (A3)

Applied to remote?   YES / NO / <date>

Preflight results:
  Q1 null templates                      <n>
  Q5 other duplicate names               <rows>
  Q6 components identical?               YES / NO   <-- BLOCKING if NO
  Q7 snapshotted / resolves-via-subject  <n> / <n>

Backup taken before applying?            YES / NO
Post-apply verification output:
<paste the three queries>

## 10. SMTP notification handling

Currently undocumented — please complete.

Trigger:             <what event fires the send>
Location:            <file; Edge Function or client?>
Recipient:           <student's own email / guardian / both>
Address source:      <table + column>
Credential storage:  <env var name; which environment>
Content:             <does the email contain the grade VALUE, or only a notice to sign in?>
Idempotency:         <how re-renders and re-posts are prevented from re-sending>
Provider limits:     <daily cap; behaviour when exceeded>
Failure handling:    <retry / dead letter / silently swallowed>
Consent:             <consent record? opt-out?>
Feature flag:        <can it be disabled without a deploy?>

$ grep -rn "VITE_.*SMTP\|VITE_.*MAIL\|VITE_.*GMAIL" src/ .env.example
<paste — expected: no output>

$ npm run build && grep -ric "smtp" dist/
<paste — expected: 0>

Idempotency test — post a milestone for a 2-student class:
  Emails sent on post:            <n>   (expected 2)
  Emails after 5 page reloads:    <n>   (expected 0)

## 11. Deviations and disagreements

<Anything implemented differently from the plan, or deliberately not
implemented, with the reason.

This section carries real weight. The earlier decision to defer the
scholarship streak — because no history table exists and enabling it
would fabricate data and create non-idempotent notifications — was
correct and well argued. If a rule looks wrong from inside the code,
say so here rather than silently working around it.>

## 12. Open questions

<Anything you need decided before you can finish. Flag items needing
the academic office separately — those have a longer turnaround.>
```

---

## What happens next

On receipt, the review will:

1. Re-run the measured baselines against your pasted output
2. Check the §3 matrix for `Done` claims with empty evidence
3. Scan the before/after diff for unattributed changes
4. Review the SMTP answers against the project's RA 10173 data-privacy policy

The result will be a focused list of anything still outstanding — not a repeat of the full audit.

### Priority order if time is short

1. **§2.2** — the partial-data defect (a student with perfect scores being marked failing is the most visible wrong behaviour in the system)
2. **§2.1** — the three render paths (would blank the score sheet and Excel export)
3. **A1.2** — summer `termsExpected === 2` (most likely new bug)
4. **§10** — SMTP privacy and credential placement
5. Everything else

### Two things worth saying

Two decisions in the previous pass were genuinely good and should not be undone:

- **Deferring the scholarship streak and the advisor payload** for the right reason — no history table, so enabling them would fabricate data and create non-idempotent notifications.
- **Replacing `ON DELETE SET NULL` with `ON DELETE RESTRICT`** on `computation_id`. This was not in the plan. Without it, deleting a `grade_computations` row would null the column and violate the new `NOT NULL`. Good catch.

The gaps in this audit are about coverage, not judgement.
