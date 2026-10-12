# ASPIRE Grading Weight and Dynamic Grid Plan — Current-State Review

**Reviewed against:** Current working tree on September 28, 2026  
**Source document:** `ASPIRE_Grading_Weight_and_Dynamic_Grid_Plan.md`  
**Review scope:** Grading calculations, dynamic activities, semester rules, posted-grade milestones, formula configuration, and affected UI/read paths  
**Repository changes made after this review:** Phases 1, 2, and the core Phase 4 calculation/UI alignment have now been implemented; see the status below.

## Implementation Status — September 29, 2026

Completed after the original current-state review:

- Added a shared, formula-aware grading engine with fail-closed validation and legacy fallback only for subjects without an assigned formula.
- Added stable activity-to-component identity and class/posted-grade formula snapshots through `20260928120000_add_grading_formula_identity_hooks.sql`.
- Preserved grading-component IDs during formula edits instead of deleting and recreating every component.
- Migrated both faculty grade-of-record posting paths to the shared calculator and fixed UUID-keyed activity score handling.
- Added RLE component selectors and posting safeguards: every repeatable bucket must have categorized activities before calculation or posting.
- Migrated the live faculty row, posted-grade table, and student grade-detail breakdown to the shared formula.
- Made Character visibility, component labels, and displayed weights respond to the assigned formula.
- Corrected Midterm lock reconstruction in the faculty entry, preview, and posted-grade paths.
- Added `npm run verify:grading` coverage for all five presets, RLE categorization, invalid formulas, legacy fallback, and summer isolation.
- Added distinct `midterm_rating`, `tentative_final_rating`, and `semestral_grade` persistence with backward-compatible legacy-row normalization.
- Migrated export previews/workbooks, classroom priority risk, dean risk views, dashboard analytics, and summary reports to formula-aware or canonical posted-grade data.
- Prevented dean and student aggregates from counting MR, TFR, and SG as three separate subject grades by selecting the most advanced milestone per class.

Still outstanding:

- Add database-backed integration coverage for posting, snapshots, and historical formula changes.

## Executive Summary

The source plan identifies the main grading defect correctly: configurable grading formulas exist, but active calculation paths still use the legacy 50% Class Standing, 10% Character, and 40% Examination formula.

The plan should not be implemented unchanged, however. The current working tree contains newer granular-activity behavior, additional duplicated calculation paths, and two important defects that the plan does not fully address:

1. The direct faculty posting path can read different activity keys from those used by the live grid, potentially producing a posted Class Standing value that differs from the displayed value.
2. Writers and readers disagree about the meaning of `posted_grades.grade_period`, especially for Midterm Rating, Tentative Final Rating, and Semestral Grade.

The recommended direction remains a centralized grading engine, but stable component identity, formula versioning, and milestone semantics should be established before the grid is made fully dynamic.

## Overall Assessment

| Area | Assessment |
|---|---|
| Configurable weights are ignored | Confirmed |
| Summer handling is inconsistent | Confirmed |
| Dynamic labels and hiding unused Character columns | Valid improvement |
| “Eight call sites” inventory | Incomplete and outdated |
| Four templates supported without schema changes | Possible only as a compatibility layer |
| RLE categorization through component names in `activity_type` | Too fragile for grade-of-record data |
| Legacy fallback for unresolved assigned formulas | Unsafe |
| Academic Insights analysis | Partly outdated |
| Verification plan | Needs posting and storage regression coverage |

## Confirmed Findings

### 1. Configurable formulas exist

Five official presets are declared in `src/pages/admin/GradeComputationsList.jsx`:

- General Education Core: 50% Class Standing, 40% Major Examination, 10% Character Rating
- Health Sciences Theory: 30% Class Standing, 60% Major Examination, 10% Character Rating
- Health Sciences RLE/Clinical Practicum: 50% Checklist, 20% Nursing Care Plan and Case Study, 20% Rubric Assessment, 10% Quizzes and Written Outputs
- Maritime Lecture: 60% Class Standing, 40% Major Examination
- Maritime Laboratory/Simulator: 40% Systematic Exercises, 60% Demonstration of Competence

Subjects can reference a template through `subjects.computation_id`, and formula components store `weight`, `max_score`, and `is_multiple`.

### 2. Active calculations still hardcode 50/10/40

Hardcoded legacy calculation remains in at least these active paths:

| Surface | Current location |
|---|---|
| Faculty direct posting | `src/pages/faculty/ScoreInput.jsx`, `getTermRating` inside `handlePostGrades` |
| Faculty preview and posting | `src/pages/faculty/GradeComputationPreview.jsx`, `computedStudents` |
| Live faculty score rows | `src/components/StudentRow.jsx`, `calcPeriodRating` |
| Student grade breakdown | `src/pages/student/MyGradesDetail.jsx` |
| Export preview | `src/components/ExportPreviewModal.jsx` |
| Spreadsheet export | `src/lib/excelExport.js`, `computeStudentRatings` |
| Classroom priority roster | `src/lib/classRoomService.js`, `getClassPriorityRoster` |
| Shared tentative-grade calculation | `src/lib/riskEngine.js`, `computeTentativeGrade` |
| Dean dashboard term calculation | `src/pages/dean/Dashboard.jsx`, `computeTermGwa` |

This means the affected calculation inventory is larger than a stable set of eight sites.

### 3. The shared semester calculator handles summer correctly

`calculateSemestralGrade` in `src/lib/gradingMath.js` correctly supports:

- Regular semesters: Prelim, Midterm, Semi-Final, and Final
- Summer terms: Midterm and Final only

The problem lies in callers that do not supply the required `isSummer` value.

### 4. `computeTentativeGrade` is summer-blind

`computeTentativeGrade` in `src/lib/riskEngine.js` invokes `calculateSemestralGrade` without `isSummer`, leaving the helper’s default value of `false` in effect.

For clean summer data containing only Midterm and Final rows, the regular formula can coincidentally produce the same result. It becomes incorrect if stray Prelim or Semi-Final data exists for a summer class record.

The dean pages also call this function without semester context.

### 5. Midterm locks are not reconstructed correctly

Both of these loaders reconstruct only Final and Semestral locks:

- `src/pages/faculty/ScoreInput.jsx`
- `src/pages/faculty/PostedGradesView.jsx`

A locked `grade_period === 'midterm'` row is not added to the reconstructed `lockedMilestones` set. This can make a posted Midterm appear editable after reload.

### 6. `activity_type` is currently unused by application code

The `class_activities.activity_type` column was added by `supabase/migrations/20260924150000_model_b_granular_activities.sql` with a default value of `formative`.

Current application code does not read or write that field, and the migration does not add a constraint limiting its values.

## Findings That Have Drifted Since the Source Plan

### 1. The dead Academic Insights calculator is already gone

The source plan recommends deleting a module-level `calculateTermRating` function from `AcademicInsights.jsx`. That function no longer exists in the current working tree.

The remaining Academic Insights problem is primarily a posted-grade milestone mismatch, not a dead raw-score calculator.

### 2. Dean pages use a deprecated compatibility import

`src/pages/dean/Dashboard.jsx` and `src/pages/dean/AtRiskStudents.jsx` import `computeTentativeGrade` through `src/lib/riskUtils.js`.

`riskUtils.js` is marked deprecated and only re-exports functions from `riskEngine.js`. New grading work should import directly from `riskEngine.js` and remove the compatibility dependency from touched files.

### 3. Current line numbers no longer match the source plan

Several referenced line numbers have shifted due to more recent activity-release, AI-advising, risk, and score-sheet changes. Implementation should locate functions and identifiers by name instead of relying on the source document’s line numbers.

## Critical Missing Defect: Dynamic Activity Keys and Posting

The live score grid stores dynamic activity scores using activity UUIDs. `StudentRow.jsx` also mirrors the first six activities into the legacy `act1` through `act6` fields when saving to `student_term_scores`.

The direct `ScoreInput.jsx` posting calculation does not normalize those UUID-keyed activity values. Its local-storage calculation reads only:

```text
act1, act2, act3, act4, act5, act6
```

Depending on how the local draft was populated, the live grid can display a correct dynamic-activity total while direct posting calculates a different Class Standing contribution or zero.

This problem should be corrected before introducing subject-specific weights. Otherwise, the new formula resolver may apply the correct weights to an incorrect activity total.

### Required correction

The shared calculator should accept normalized activity data, such as:

```js
{
  components,
  activities,
  activityScores,
  singleComponentScores
}
```

It should not require callers to first collapse all repeatable activity data into `act1` through `act6`.

## Posted-Grade Milestone Mismatch

Current faculty posting uses these `grade_period` values:

| Posting action | Stored value |
|---|---|
| Midterm Rating | `midterm` |
| Tentative Final Rating | `final` |
| Official Semestral Grade | `final` |

Academic Insights searches for values including:

- `midterm_rating`
- `mr`
- `tentative_final_rating`
- `tfr`
- `semestral_grade`
- `sg`

As a result, the reader and writer disagree about what a row represents. The `final` row is also reused and overwritten when the workflow progresses from Tentative Final Rating to official Semestral Grade.

This affects:

- Academic Insights milestone detection
- Lock reconstruction
- Historical interpretation of posted grades
- The ability to distinguish a consultation-stage TFR from the final official grade

### Recommended correction

Use unambiguous milestone values, for example:

- `prelim`
- `midterm_term`
- `midterm_rating`
- `semi_final`
- `final_term`
- `tentative_final_rating`
- `semestral_grade`

Alternatively, separate raw term results from aggregate milestones into different tables. In either design, one row should not change semantic meaning during the posting workflow.

## Assessment of the Proposed Resolver

The proposed shape-based resolver can recognize four of the five built-in presets:

1. Identify one `is_multiple` component as Class Standing.
2. Optionally identify Character by name.
3. Treat the sole remaining non-repeatable component as the Exam-like slot.

This is reasonable as a compatibility adapter for the current presets, but it is not a durable contract for arbitrary admin-created formulas.

The template editor allows custom names and component combinations as long as:

- Names are unique.
- Weights total exactly 100%.
- Names, weights, and maximum scores are non-empty and positive.

Therefore, component meaning cannot always be derived reliably from `is_multiple`, a Character name pattern, and array shape.

### Fallback rule

The proposed fallback should be changed:

- If a subject has no `computation_id`, using the legacy 50/10/40 formula is reasonable for backward compatibility.
- If a subject has an assigned formula but the formula cannot be resolved, posting should fail closed with a visible configuration error.

Silently substituting 50/10/40 for an explicitly assigned but unresolved formula can produce an authoritative-looking incorrect grade.

## Assessment of the No-Schema Dynamic Grid

Relabeling the three existing storage regions can support the four simpler built-in templates as a transitional compatibility layer:

- One repeatable activity bucket
- One primary non-repeatable slot
- One optional secondary non-repeatable slot

This is not a fully dynamic grading model. It still depends on fixed storage meanings and cannot reliably represent arbitrary admin-created formulas.

Additional constraints in the current implementation include:

- The score sheet limits a term to six formative activities.
- The legacy `student_term_scores` model has only `act1` through `act6`, `char_rating`, and `exam`.
- `class_grading_columns` has only one configurable `exam_max`; the Character maximum is effectively fixed at 100 in several paths.
- Some screens calculate from granular activity tables while others calculate from legacy mirrored columns.

The plan should explicitly label this approach as transitional rather than fully dynamic.

## Assessment of the RLE Proposal

Using `activity_type` to store component names avoids an immediate migration, but it is too fragile for official grading data.

### Current risks

1. Component names are editable.
2. Formula editing currently deletes and recreates all `grade_computation_components` rows.
3. A component rename would orphan existing activity categorization.
4. A weight change can alter how existing draft scores are interpreted.
5. The six-activity limit is shared across all proposed RLE buckets.
6. Historical grade breakdowns can be relabeled using the current template instead of the formula used when the grade was posted.

### Recommended durable design

1. Preserve component IDs when templates are edited instead of deleting and reinserting every component.
2. Add a real component relationship from `class_activities` to a stable computation component or class-specific formula component.
3. Version grading formulas or snapshot them when assigned to a class record.
4. Prevent in-place formula mutation after score entry begins, or create a new version for future classes.
5. Store the formula version or snapshot used when grades are posted.
6. Define how activities move between components and how recalculation is audited.

If a name-based `activity_type` approach is retained for a prototype, it should be explicitly treated as temporary and should block posting whenever any activity cannot be mapped unambiguously.

## Revised Implementation Sequence

### Phase 0 — Define the grading contract

- Define stable component identity and semantic type.
- Decide whether templates are immutable, versioned, or copied into class-specific formula records.
- Define unambiguous posted-grade milestone values.
- Decide how existing posted grades preserve their original formula and labels.
- Define the legacy fallback boundary.

### Phase 1 — Build one shared calculator

Create a pure grading function that accepts normalized component definitions and scores, including granular activities.

It should:

- Calculate any number of repeatable buckets.
- Calculate non-repeatable components using their actual maxima and weights.
- Validate that resolved weights total 100% within a documented tolerance.
- Return component contributions as well as the total rating.
- Return an explicit error for assigned but unsupported formulas.
- Use legacy 50/10/40 only when no formula is assigned.

### Phase 2 — Repair grade-of-record posting paths

Update both:

- `ScoreInput.jsx`
- `GradeComputationPreview.jsx`

Both paths must call the same calculator using the same normalized score data. Posting should persist the formula version or snapshot used.

This phase should also resolve the UUID activity-key versus `act1`–`act6` mismatch.

### Phase 3 — Align milestone persistence and locking

- Give MR, TFR, and SG distinct persisted identities.
- Stop overwriting a TFR row with a semestral-grade meaning.
- Reconstruct Midterm, TFR, Final, and Semestral locks correctly.
- Update Academic Insights to read the same milestone values written by faculty posting.

### Phase 4 — Migrate interactive and student-facing reads

Update:

- `StudentRow.jsx`
- `PostedGradesView.jsx`
- `MyGradesDetail.jsx`
- Dynamic component labels and hidden unused slots

These should consume shared calculation output instead of reimplementing component arithmetic.

### Phase 5 — Migrate analytics and exports

Update:

- `classRoomService.js`
- `riskEngine.js`
- `dean/Dashboard.jsx`
- `dean/AtRiskStudents.jsx`
- `ExportPreviewModal.jsx`
- `excelExport.js`
- The student what-if simulator in `gradingMath.js`

Remove deprecated `riskUtils.js` imports from touched consumers.

### Phase 6 — Complete summer handling

- Pass `isSummer` into `computeTentativeGrade` and all callers.
- Ensure dean aggregation is scoped to the class record’s semester.
- Repair Academic Insights after milestone persistence is aligned.
- Keep the already-correct summer behavior in `StudentRow` and `MyGradesDetail`.

### Phase 7 — Add RLE grouped components

- Add stable activity-to-component categorization.
- Render one score-sheet group per repeatable component.
- Provide re-categorization for legacy activities.
- Block posting while categorization is incomplete or ambiguous.
- Revisit whether the six-activity limit is appropriate per term or should apply per component.

### Phase 8 — Apply UI polish and documentation updates

- Show actual component names and weights.
- Hide absent Character or other unused slots.
- Correct summer batch labels.
- Update formula explanations in previews and exports.
- Update `AGENTS.md` so 50/10/40 is identified as the legacy/default formula rather than the universal rule.

## Verification Requirements

The source plan’s manual checks remain useful, but they should be expanded.

### Formula cases

Verify at minimum:

1. General Education: 50/40/10
2. Health Sciences Theory: 30/60/10
3. Maritime Lecture: 60/40 with no Character contribution
4. Maritime Laboratory: 40/60 with correct labels
5. RLE: all three repeatable buckets plus Rubric Assessment
6. No assigned formula: legacy fallback
7. Assigned but invalid formula: posting blocked with a clear error

### Data-source consistency

For the same student and term, compare:

- Live `StudentRow` rating
- Direct `ScoreInput` post payload
- `GradeComputationPreview` result
- Saved `posted_grades.computed_grade`
- Student grade detail
- Dean dashboard and risk roster
- Export preview and exported workbook

All values must match.

### Dynamic activity regression

Create activities backed by UUID keys, enter scores, reload the page, and post through both faculty posting routes. Confirm that activity totals remain identical before and after reload and that neither path depends on stale `act1`–`act6` local-storage keys.

### Summer regression

For a summer class:

- Midterm = 80
- Final = 90
- Expected SG = 85

Add stray Prelim or Semi-Final data and confirm that summer results remain 85 in all faculty, student, dean, and risk views.

### Milestone regression

Verify the complete sequence:

1. Post MR.
2. Reload and confirm Midterm remains locked.
3. Post TFR.
4. Confirm Academic Insights recognizes TFR distinctly.
5. Post SG.
6. Confirm the SG does not erase the historical identity of the previously posted TFR.
7. Exercise the unlock-request workflow for each milestone.

### Formula-history regression

After posting a grade, edit or version the source template. Confirm that the previously posted grade and its breakdown retain the exact formula and labels originally used.

### Repository checks

After each implementation phase, run only the commands supported by the repository:

```bash
npm run lint
npm run build
```

The repository has no configured test framework or separate typecheck command. Pure calculator verification can be performed through a focused development script or an introduced test framework only if that is approved as separate work.

## Final Recommendation

The source plan is a strong diagnostic draft. Its core conclusion—centralize grading and stop ignoring subject-level weights—is correct.

Before implementation, revise it around three foundations:

1. Stable and versioned component identity
2. A shared calculator that consumes granular activity data directly
3. Unambiguous posted-grade milestone persistence

Once those are established, the dynamic grid, RLE categorization, summer fixes, analytics migration, and label improvements can be delivered incrementally without risking inconsistent official grades.
