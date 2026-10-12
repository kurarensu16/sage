# Academic Rules Unification — Implementation Report

**Date:** 2026-10-01  
**Scope:** deterministic grading, GWA, attendance, risk, and grading-template safeguards requested in `Unify-Academic-Rules-Across-ASPIRE.md`.

## Delivered

- Added `src/lib/academicPolicy.js` as the canonical home for the transmutation ladder, official GWA resolver, plain-mean GWA calculation, President's List eligibility, attendance semantics, GWA bands, remarks, and risk tiers. It deliberately contains no per-subject component weights.
- Changed `resolveGradingFormula` to fail closed when a subject has no assigned template. The unused legacy 50/10/40 runtime formula was removed.
- Added a safe posting conversion (`toEffectiveGradeForPosting`) that returns `null` for a missing rating rather than converting it to GWA 5.00.
- Preserved available-term computation while marking partial semestral results as `In Progress`, with `termsExpected`, `termsEncoded`, and `isComplete` returned by `calculateSemestralGrade`.
- Updated the student dashboard to use `subjects.units` and an official, transmuted plain-mean GWA rather than raw `computed_grade` percentages.
- Replaced the student-facing 1.45 Dean's List ladder and fabricated 94%/85% probabilities with deterministic President's List standing based on the shared honors gate.
- Updated dean dashboard and risk-roster paths to resolve raw grades before comparing them with GWA thresholds, and to use the canonical plain-mean helper.
- Corrected student academic insights attendance handling: attendance is now grouped by `class_record_id`; FDA is evaluated per course; `Late` and `Excused` count as attended; subject diagnostics include absence count and attendance rate.
- Removed fabricated attendance records from the student attendance page.
- Recalibrated the GWA risk factor to the requested step-and-ramp curve and removed the three unused risk inputs from the engine interface.
- Made the subject grading-template field required and removed the unsupported “Professor Defaults Standard” option.
- Removed the Grade Components Setup display-name fallback.
- Added migration `20261001090000_unify_academic_policy_templates.sql`. It backfills missing subjects to `General Education Core`, merges the duplicate General/Professional template, replaces `ON DELETE SET NULL` with `ON DELETE RESTRICT`, sets `subjects.computation_id` to `NOT NULL`, and enforces unique template names.
- Replaced the verification script's legacy-fallback expectation with checks for scale conversion, null-safe posting, plain-mean GWA, honors gates, attendance scope semantics, and risk boundaries.

## Verification

| Check | Result |
|---|---|
| `npm run verify:grading` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed |

The first build attempt was blocked by the sandbox from loading Tailwind's native Windows binary. The approved production build completed successfully. Vite reported only its existing large-chunk advisory.

## Important deployment step

The new SQL migration has been created locally but **has not been applied to the remote Supabase project**. Before applying it, run the proposal's data audit queries against production and verify that the duplicate template and all null `computation_id` rows are accounted for.

## Deliberately deferred

The proposal's scholarship streak/notification state machine and expanded AI-advisor payload were not wired in this pass. The current schema has no `student_risk_history` or completed-semester summary view, so enabling those features now would fabricate history and create non-idempotent notifications. They should be implemented after historical-term storage and transition persistence are designed.

Documentation wording that conflicts with the approved policy should be reviewed with the academic office before it is changed, especially the all-student 18-unit gate and the risk-curve discontinuity at GWA 2.01.

## Files added

- `src/lib/academicPolicy.js`
- `supabase/migrations/20261001090000_unify_academic_policy_templates.sql`
- `docs/03-development/implementation-reports/ACADEMIC_RULES_UNIFICATION_IMPLEMENTATION_REPORT_2026-10-01.md`
