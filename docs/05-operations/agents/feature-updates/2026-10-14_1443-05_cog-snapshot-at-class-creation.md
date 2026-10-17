# Grading formula frozen at class creation

- **Date:** 2026-10-14 14:43 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** None

## Files changed
- `src/lib/classRoomService.js`

## What changed and why

Phase 4 (ASPIRE-C10). `class_records.grading_formula_snapshot` was only populated at the **first official posting**. Until then, an already-running class tracked any later edit to its subject's COG template — so changing weights mid-semester silently changed the tentative and live grades of a term already in progress. The owner's requirement is that a template edit may only affect the **next rolling term**.

The snapshot is now resolved and written at class creation, in `provisionClassroomByAdmin`. All three creation paths (admin, faculty single, faculty batch) funnel through that function, so one change covers them.

This insulates every grade surface at once, with no changes to those files: `ScoreInput`, `GradeComputationPreview`, `PostedGradesView`, `getClassPriorityRoster`, `studentRunningGrade`, the dean's At-Risk list and dashboard all already prefer `grading_formula_snapshot?.components` and fall back to the live template only when it is `NULL`.

Two hazards checked before implementing:

1. **`post_grade_milestone_atomic` compares snapshots with a strict JSONB `<>`.** JSONB normalises object keys but *not* array order, so a reimplemented snapshot whose `components` were ordered differently would make every post fail with "The submitted COG differs from the class grading snapshot." The snapshot is therefore built with the same `resolveGradingFormula` + `createGradingFormulaSnapshot` functions the posting path uses, rather than as a SQL trigger — despite the `term_id` trigger precedent. Re-resolving a snapshot from its own components reproduces it field for field with array order preserved, so posting stays consistent.
2. **`protect_grading_formula_snapshot` is `BEFORE UPDATE OF`**, not insert, so writing the value at creation is allowed; it simply starts protecting earlier in the class's life.

Backward compatible: classes created before this keep `NULL` and still snapshot at their own first posting. A subject with no template, or one whose weights do not total 100%, yields `NULL` and falls back the same way — class creation is never blocked by a bad template.

## How to verify
`docs/04-testing/CONSULTATION_REMEDIATION_TEST_GUIDE_2026-10-14.md` §10 — the regression test that did not previously exist. Create a class, edit the template's weights, and confirm the class still computes with the original weights, while a newly created class uses the edited ones. §10.5 (posting still succeeds) is the case that would reveal a snapshot mismatch.
