# Dynamic Grading Policy Workflow Plan - 2026-10-27

**Status:** Proposed design. No code or migration exists yet. Every file listed under "Suggested build order" still requires its own developer confirmation before it is created or edited, per `AGENTS.md`.
**Scope:** Two independent, admin-editable policy levers that today are single hardcoded institutional constants:
1. **Passing transmutation threshold** — per COG template (`grade_computations`), e.g. 69%/75%/80%.
2. **FDA/absence threshold** — per subject (`subjects`), tracking units/subject type rather than the grading formula.
Does **not** change component weights, the posting workflow's structure, GWA-space honors policy (President's List, scholar tiers), or any already-posted grade or already-recorded absence.
**Trigger:** Thesis panel question: "Is the transmutation of grades dynamic?" Faculty feedback that programs vary their passing grade (69/75/80, not just DYCI's 75% default) and that attendance/FDA tolerance should similarly flex by subject/unit load rather than one fixed 4-absence rule for everyone.

## Objective

1. Admin sets a **passing threshold** per COG template. Unset = institutional default 75%.
2. Admin sets an **FDA absence threshold** per subject. Unset = institutional default 4 absences.
3. Both follow the system's existing "an edit only reaches the next term" guarantee — identical to how component weights already behave — never recomputing an already-running class.
4. Full propagation: risk scoring and reporting (including dean-level reports and charts) follow each class's own thresholds, not the flat constants.
5. Zero behavior change for anything that doesn't opt in, including every already-posted grade and already-logged absence.
6. **No change needed to GWA or President's List logic** — see "Why GWA/Honors need no new field," below. That connection the panel/faculty raised is already satisfied by how the ladder is designed, not by adding more configuration.

## Part 1 — Dynamic passing transmutation threshold

### Design: rescale the ladder from one number

Admin sets **one number** (the passing threshold), not a hand-edited 9-row GWA table. The institutional ladder's other 8 bands (GWA 1.00 -> 2.75) rescale proportionally between the threshold and 100, using the same formula in SQL and JS so the two copies (see "Current duplication") can't drift apart:

```
minRating(band i, i = 0..7, for GWA 1.00..2.75) = threshold + (100 - threshold) * (8 - i) / 8
minRating(band 8 = passing, GWA 3.00)            = threshold
```

When `threshold` is `NULL` or exactly `75`, both implementations use the existing hardcoded ladder **verbatim**, not the formula — this is what guarantees zero behavior change for every template that doesn't opt in.

**Worked example (80% threshold vs. today's 75%):**

| GWA | Min raw score — 75% class (unchanged) | Min raw score — 80% class (new) |
|---|---|---|
| 1.00 | 98 | 100 |
| 1.25 | 95 | 97.5 |
| 1.50 | 92 | 95 |
| 1.75 | 89 | 92.5 |
| 2.00 | 86 | 90 |
| 2.25 | 83 | 87.5 |
| 2.50 | 80 | 85 |
| 2.75 | 77 | 82.5 |
| 3.00 (passing cut) | 75 | 80 |
| 5.00 (failed) | below 75 | below 80 |

Same raw score, different outcome depending on which class (and therefore which frozen threshold) a student is in:

| Student | Raw score | GWA, 75%-threshold class | Remark | GWA, 80%-threshold class | Remark |
|---|---|---|---|---|---|
| Cruz | 95 | 1.25 | Passed | 1.50 | Passed |
| Santos | 82 | 2.25 | Passed | 3.00 | Passed (just made it) |
| Reyes | 78 | 2.75 | Passed | 5.00 | **Failed** |
| Tan | 69 | 5.00 | Failed | 5.00 | Failed |

Reyes is the case that matters for the defense: identical performance, opposite outcome, because the two classes legitimately ran under different passing policies — the exact faculty complaint the panel raised.

### Why GWA / President's List need no new field

`HONORS.ceiling = 1.75` and `HONORS.subjectGradeFloor = 2.00` (`src/lib/academicPolicy.js`) are GWA-scale cutoffs from the DYCI Handbook, not raw-percentage ones. Because the rescale keeps the same 9 bands and only slides where "100%-of-the-way-to-passing" sits, GWA 2.00 means the same relative ladder position whether a class's threshold is 69%, 75%, or 80%:

| Student | Raw score | Class threshold | GWA | President's List check (`GWA <= 1.75`) |
|---|---|---|---|---|
| Cruz | 95 | 75% | 1.25 | Eligible (if units/subject-floor also met) |
| Dela Cruz | 97.5 | 80% | 1.25 | Eligible (same GWA, same check, different raw score) |

President's List, scholar tiers, and GWA display all already consume the transmuted GWA value — they ride along for free once Part 1 ships; nothing about their own logic changes.

### Ride the existing snapshot-freeze mechanism, not a live lookup

`class_records.grading_formula_snapshot` (JSONB) is already frozen **at class creation** (`classRoomService.js` provisioning path) and made immutable by `protect_grading_formula_snapshot`, documented in `supabase/migrations/20261014200000_backfill_class_grading_snapshots.sql`: *"A template edit must only reach the next rolling term."* `passing_threshold` rides that same snapshot instead of a live `grade_computations` read — identical guarantee to weights, zero new "effective date" logic, and it closes a correctness gap: grade corrections (staged SG corrections, FDA discretion, cascading remediation) already operate on an existing `class_records` row, so reading the frozen snapshot (not a live template) keeps a correction consistent with the original posting even if the template changed in between.

**Timeline example:**

- August 2026: admin provisions Rivera's BSIT-1A ITC113 class. Template "BSIT Major Lecture" has no `passing_threshold` set yet, so the new class's snapshot freezes `passingThreshold: null` (= institutional 75%).
- October 2026: admin edits that template, sets `passing_threshold = 80`. Rivera's already-running class is untouched — its snapshot still says `null`/75%, so Reyes's 78% is still "Passed" the day after the edit, same as the day before.
- January 2027: admin provisions BSIT-1A's next-semester ITC113 section (a new `class_records` row). Provisioning reads the *current* template state (`80`) and freezes `passingThreshold: 80` into the new snapshot. Only this new class uses 80%; Rivera's August class keeps 75% for its entire run.

### Current duplication this touches

| Location | What it is |
|---|---|
| `src/lib/academicPolicy.js` — `TRANSMUTATION_LADDER` | 9-band JS table, 75->98 |
| `supabase/migrations/20261022120000_grade_posting_p0_foundation.sql` — `aspire_transmute_grade(p_rating)` | Server-authoritative `CASE WHEN` ladder, same 9 bands — the function actually used when grades are posted |
| `src/lib/constants.js` — `PASSING_GRADE = 75` | Used independently by the risk/reporting layer for raw-percentage status labels and benchmark lines — not derived from the GWA ladder today |

`aspire_transmute_grade` is called in 20+ places across 8 migration files. A `DEFAULT NULL` 2nd parameter means none of those need to change — they keep calling with 1 argument and get the legacy 75% ladder. Only the few call sites that read a *specific class's* frozen snapshot to actually perform or verify a transmutation need the 2nd argument: `aspire_calculate_student_grade`, the live posting path (`20261022121000_server_authoritative_grade_posting.sql`), and the correction path (`20261023211000_staged_sg_score_corrections.sql`). The one-off historical-reconstruction scripts are backfills for already-fixed past terms and stay untouched.

### Changes

1. **Migration** `supabase/migrations/<YYYYMMDDHHMMSS>_dynamic_transmutation_threshold.sql`:
   - `ALTER TABLE public.grade_computations ADD COLUMN passing_threshold NUMERIC(5,2) NULL;` with `CHECK (passing_threshold IS NULL OR (passing_threshold BETWEEN 50 AND 94));`
   - `aspire_transmute_grade(p_rating NUMERIC, p_passing_threshold NUMERIC DEFAULT NULL)` — legacy `CASE WHEN` verbatim for `NULL`/`75`, rescale formula in the `ELSE` branch.
   - Backfill: every non-null `class_records.grading_formula_snapshot` missing a `passingThreshold` key gets one added with value `NULL` (`snapshot || jsonb_build_object('passingThreshold', NULL)`) — required because `post_grade_milestone_atomic` does a strict JSONB `<>` comparison.
   - Update `aspire_calculate_student_grade`, the posting path, and the correction path to read `(class_record.grading_formula_snapshot->>'passingThreshold')::numeric` and pass it through.
   - Update `save_grade_template` RPC (`20261011140000_admin_batch3_atomic_saves.sql`) to accept/persist `p_passing_threshold`.
2. **`src/lib/academicPolicy.js`**: `buildTransmutationLadder(passingThreshold)` (verbatim table for null/75, rescale otherwise); `toGwaOrNull(rating, passingThreshold)` resolves via it.
3. **`src/lib/gradingMath.js`**: `createGradingFormulaSnapshot(formula, { computationId, passingThreshold = null })` adds the field; `getTransmutedGrade`/`calculateSemestralGrade` thread it through. The `remarks: gwa <= 3.00` check needs no change.
4. **3 snapshot-building call sites** need the new select + param: `src/lib/classRoomService.js` (provisioning — the one that persists it), `src/pages/faculty/ScoreInput.jsx`, `src/pages/faculty/GradeComputationPreview.jsx`.
5. **Remaining GWA-reading call sites** just pass `snapshot.passingThreshold` through: `src/pages/faculty/PostedGradesView.jsx`, `src/pages/admin/GradeOverride.jsx`, `src/pages/student/MyGradesDetail.jsx`, `src/pages/student/MyGradesList.jsx`, `src/pages/student/AcademicInsights.jsx`, `src/lib/studentRunningGrade.js`.
6. **Risk/reports**: `src/lib/riskEngine.js` needs no change (consumes already-transmuted GWA). `src/lib/reportsService.js`'s `getStudentStatus(percentage, passingThreshold = PASSING_GRADE)` and its aggregates, `src/components/faculty/FacultyCharts.jsx`'s benchmark line, and `src/components/dean/DeanCharts.jsx` (if it repeats the pattern) take the frozen per-class value instead of the flat constant — this is also what makes dean-level reports read the correct per-subject transmutation automatically (same class row, same frozen snapshot, one level further up the reporting chain).
7. **Admin UI** `src/pages/admin/GradeComputationsList.jsx`: add a `passingThreshold` number input (50-94, placeholder "Institutional default (75%)"), included in the `save_grade_template` call and the confirm-modal summary. Editable on existing templates (it's a scale parameter, not a structural change) — future classes only, per the freeze guarantee.

## Part 2 — Dynamic FDA/absence threshold

### Design: same freeze pattern, different owner table

Admin sets the FDA absence count per **subject** (not the COG template — attendance tracks units/lecture-vs-lab/subject type, independent of which grading formula is assigned). Unset = institutional default of 4 absences. `warningAbsences`/`nearFdaAbsences` derive from the FDA count rather than being separately configurable, mirroring how the GWA bands derive from the passing threshold:

```
warningAbsences  = fdaThreshold - 2
nearFdaAbsences  = fdaThreshold - 1
fdaAbsences      = fdaThreshold          (admin-set value, default 4)
```

Rides the identical "frozen at class creation" mechanism as Part 1: a new key on `class_records.grading_formula_snapshot` (e.g. `fdaThreshold`), set from the subject's current value when the class is provisioned, immutable afterward. An admin editing a subject's FDA threshold only reaches classes created after the edit — never a class already in progress, exactly like weights and the passing threshold.

### Changes

1. **Migration**: `ALTER TABLE public.subjects ADD COLUMN fda_absence_threshold SMALLINT NULL;` with `CHECK (fda_absence_threshold IS NULL OR fda_absence_threshold BETWEEN 2 AND 10);` Add `fdaThreshold` to the same snapshot-backfill statement from Part 1's migration (one migration can cover both, or a second one immediately after — developer's call).
2. **`src/lib/academicPolicy.js`**: `ATTENDANCE` becomes a function `resolveAttendancePolicy(fdaThreshold = 4)` returning `{ warningAbsences, nearFdaAbsences, fdaAbsences, statuses }` derived as above, instead of a flat object. Existing `ATTENDANCE.statuses` (Present/Absent/Late/Excused) stays fixed — that's a status vocabulary, not a policy number.
3. **`src/lib/classRoomService.js`** provisioning: select `subjects.fda_absence_threshold` alongside the COG lookup, add `fdaThreshold` to the snapshot object.
4. **`src/lib/riskEngine.js`**: the attendance factor (0-50 pts, currently keyed to the fixed 2/3/4 absence tiers per the doc comment at the top of the file) reads `resolveAttendancePolicy(classRecord.grading_formula_snapshot?.fdaThreshold)` instead of the `ATTENDANCE` constant directly.
5. Any UI surfacing "X of 4 absences" / FDA warnings (attendance entry screens, dean/faculty FDA flags, student-facing attendance view) reads the resolved per-class policy instead of the literal `4`. Needs a grep pass (`grep -rl "ATTENDANCE\." src`) at implementation time to enumerate exact files.
6. **Admin UI**: wherever subjects are created/edited (`src/pages/admin/SubjectForm.jsx` per earlier exploration), add an `fdaAbsenceThreshold` field (2-10, placeholder "Institutional default (4)").

## Verification (both parts)

- `npm run verify:grading` — add fixtures: default/null threshold producing identical output to today (regression guard for Part 1), 80%/69% threshold cases, and attendance-tier derivation at a couple of non-default FDA thresholds.
- Manual click-through: new COG template at 80% + new subject at FDA-threshold 3, assigned to a demo class, confirm Score Input preview, posted grade, student grade view, dean/faculty "Average/Struggling" labels, FacultyCharts/DeanCharts benchmark line, and attendance/FDA warnings all agree with the configured values — then confirm an unrelated existing template/subject and an already-existing class are completely unaffected by any edit made after that class was created.
- `node scripts/verifyEvaluationTracking.js` / `verifyEvaluationReferrals.js` are unrelated, no re-run needed.

## Open decisions (confirm before any file is touched)

1. Range bounds: 50-94% for passing threshold, 2-10 for FDA absences — adjust if the Handbook implies tighter/looser bounds.
2. Should either threshold be lockable on existing templates/subjects (like component weight structure already is), or stay editable going forward as recommended (future classes only, by the freeze guarantee)?
3. Confirm the linear-rescale approximation of the DYCI ladder is acceptable for non-default passing thresholds (the official ladder's real gaps are 3/3/3/3/3/3/3/2, not perfectly even).
4. Historical legacy-reconstruction migrations and already-posted/logged data are out of scope — confirm this holds.

## Suggested build order

1. Migration: `grade_computations.passing_threshold`, `subjects.fda_absence_threshold`, updated `aspire_transmute_grade`, snapshot backfill (both new keys), updated posting/correction call sites, updated `save_grade_template` — developer applies manually.
2. `src/lib/academicPolicy.js` — `buildTransmutationLadder`, `toGwaOrNull`, `resolveAttendancePolicy`.
3. `src/lib/gradingMath.js` — snapshot/GWA threading.
4. Snapshot-building call sites: `classRoomService.js`, `ScoreInput.jsx`, `GradeComputationPreview.jsx`.
5. Remaining GWA-reading and attendance-reading call sites.
6. Risk/report propagation: `riskEngine.js`, `reportsService.js`, `FacultyCharts.jsx`, `DeanCharts.jsx`.
7. Admin UI: `GradeComputationsList.jsx` (passing threshold), `SubjectForm.jsx` (FDA threshold).
8. `verify:grading` fixtures + manual click-through.
9. Change record in `docs/05-operations/agents/feature-updates/` once implemented and approved, plus a `docs/README.md` index update for this doc.

Each step remains subject to its own per-file confirmation before editing, per `AGENTS.md`.
