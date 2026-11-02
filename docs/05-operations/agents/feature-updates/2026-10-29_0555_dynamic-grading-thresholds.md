# Dynamic grading policy: per-template passing threshold and per-subject FDA limit (Phase 3)

- **Date:** 2026-10-29 05:55 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** `20261029054241_dynamic_grading_thresholds.sql` (to apply, after the Phase 1 and Phase 2 migrations)

## Files changed

New:
- `supabase/migrations/20261029054241_dynamic_grading_thresholds.sql`

Edited:
- `src/lib/academicPolicy.js`
- `src/lib/gradingMath.js`
- `src/lib/classRoomService.js`
- `src/lib/riskEngine.js`
- `src/lib/reportsService.js`
- `src/pages/registrar/GradeComputationsList.jsx`
- `src/pages/registrar/SubjectForm.jsx`
- `scripts/verifyGradingMath.js`
- `docs/03-development/audits/DYNAMIC_GRADING_POLICY_WORKFLOW_PLAN_2026-10-27.md`
- `docs/04-testing/page-checklists/REGISTRAR_PORTAL.md`

## What changed and why

Makes two institutional constants configurable: the passing transmutation
threshold per COG template, and the FDA absence limit per subject. Both ride the
existing snapshot-freeze mechanism, so an edit only reaches classes provisioned
afterwards — the same guarantee component weights already have.

### Three departures from the plan, each because the plan would not have worked

**The rescale formula.** The plan proposed `T + (100 - T) * (8 - i) / 8`. At
`T = 75` that gives 100 for a 1.00, but the DYCI ladder's top band is 98 — so it
does not reproduce the current ladder, which is why the plan needed a "verbatim
table when NULL or 75" special case, leaving a cliff where a 1.00 needs 98 at
`T = 75` and 100 at `T = 76`. Implemented instead: scale the handbook's own
offsets above the passing mark, `[23,20,17,14,11,8,5,2,0]`, by `(100 - T)/25`. At
75 the factor is exactly 1.0, so the ladder is reproduced exactly with no special
case; the uneven 3,3,3,3,3,3,3,2 spacing is preserved rather than flattened; and
no band exceeds 100 anywhere in 50–94. Consequence worth noting: at an 80%
threshold a 1.00 needs **98.40**, so the plan's worked example shows different
numbers than the system now produces.

**The second parameter has no `DEFAULT`.** The plan said a `DEFAULT NULL` second
parameter means the 20+ existing one-argument call sites need no change. In
PostgreSQL it is the reverse — with both `aspire_transmute_grade(numeric)` and
`aspire_transmute_grade(numeric, numeric DEFAULT NULL)` present, a one-argument
call raises *"function is not unique"*, so following the plan would have broken
every existing caller. The overload therefore takes two required arguments, and
the one-argument function is untouched.

**No snapshot backfill.** The plan called for adding the new keys to every
existing `class_records.grading_formula_snapshot`.
`trg_protect_grading_formula_snapshot` raises `23514` on any change to an
established snapshot, so that backfill would fail on every row, and forcing it
through would mean disabling an integrity guard over live grading data. Its
justification — a strict JSONB `<>` in the posting path — does not apply either,
because that check only fires when the caller supplies a snapshot and
`gradePostingService.js` passes none. Readers therefore treat a missing key as
NULL, which already means the institutional default, so no historical snapshot
is touched.

### A null-handling bug that would have corrupted every grade

`Number(null)` is `0`, not `NaN`. The first implementation guarded with
`Number.isFinite(Number(threshold))`, which meant "no threshold set" was read as
a **0% passing mark** and rescaled the entire ladder: `toGwaOrNull(75)` returned
`1.5` instead of `3`, and `toGwaOrNull(0)` returned `3` instead of `5`. Since
every template that never opts in takes that path, this would have mis-transmuted
every grade in the system.

It was caught by writing a JS-versus-SQL differential test *before* wiring
anything to the UI, and the explicit null checks and the assertion that an unset
threshold reuses the frozen ladder **by object identity** are both now permanent
fixtures.

### Verification is now a permanent gate

`verify:grading` transcribes the SQL `CASE` expression and compares it against
the JS ladder across **2807** rating-and-threshold combinations, plus ladder
invariants at every half-point threshold from 50 to 94, the derived attendance
tiers, and the defense case where a raw 78 passes at 75% and fails at 80%. If
either implementation is edited without the other, the script fails rather than
the system silently posting different grades than it displays.

### Propagation

`riskEngine`'s attendance factor and `reportsService.getStudentStatus` both take
the per-class value with the institutional default when omitted, so every
existing caller is unchanged. The risk detail text now states the actual absence
count instead of a hardcoded "3 absences", which would otherwise contradict its
own tier under a non-default limit. Honors and President's List need no change at
all: they consume transmuted GWA, and the rescale keeps the same nine bands.

The passing threshold is written with a direct `UPDATE` after
`save_grade_template` rather than through it — it has no cross-component
invariant, unlike the weights that must total 100% in one transaction, and
changing that function's signature would have disturbed the gate Phase 1 had to
re-point.

## How to verify

Automated, all passing: `npm run lint` (0 errors), `npm run build`,
`npm run verify:grading`, `npm run verify:csv`, `npm run verify:insights`. The
migration additionally sweeps every half point from 0 to 100 at its own
post-conditions and aborts unless NULL and 75 reproduce the legacy ladder exactly.

Manual cases are in `REG-THRESHOLD`, `REG-FDA`, and `REG-POLICY-PROP` in
`docs/04-testing/page-checklists/REGISTRAR_PORTAL.md`. The two that matter most:
a template left blank must produce byte-identical grades to today, and a class
created **before** a threshold edit must be completely unaffected by it while a
class created after uses the new value.
