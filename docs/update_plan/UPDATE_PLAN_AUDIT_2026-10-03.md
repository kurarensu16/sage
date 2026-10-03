# ASPIRE — Update Plan Audit (2026-10-03)

> **Scope:** Independent re-verification of `docs/update_plan/IMPLEMENTATION.md`'s Master Execution
> Checklist (Phases 1-3) against live code at the time of this audit, plus the pasted master plan
> document. Every claim below was checked by reading the actual file/line cited, not by trusting the
> checklist's own text. Gate commands (`npm run verify:grading`, `npm run lint`, `npm run build`)
> were executed directly, not assumed from the document.
>
> **Verdict:** The checklist is substantially accurate — the large majority of `[x]` items match the
> real code exactly, including hard-to-fake claims (test-pin math, migration contents, line-by-line
> fixes). Three real discrepancies were found, documented below with repro evidence; two (the
> dean/Dashboard.jsx:374 crash risk and the riskEngine.js attendance-threshold duplication) were
> fixed the same day as part of this audit — see "Fixes applied". The third (a stale doc reference
> to a report file that was never created) is a documentation-only finding with no code to fix.
> Seven additional cosmetic/documentation-drift items (stale file:line citations, an outdated code
> sample, a stale warning count, a silent fallback in `excelExport.js`) were also closed in this
> same pass — see "Cosmetic / documentation drift" below. All three build gates are genuinely green.

---

## Gate results (executed directly)

| Gate | Result |
|---|---|
| `npm run verify:grading` | PASS — "Verified 5 grading presets, policy scale, attendance, honors, risk boundaries, milestone identity, and summer isolation." |
| `npm run lint` | PASS — 0 errors, **52** warnings (checklist claims 54 — trivial drift, not material) |
| `npm run build` | PASS — builds in ~1.5s, one pre-existing chunk-size warning (unrelated) |

---

## Real discrepancies found

### 1. `dean/Dashboard.jsx:374` — item 1.21 claimed fixed, was NOT fixed (live crash risk)

**Status: Already fixed after this audit.**
**Note:** Found during verification that IMPLEMENTATION.md's item 1.21 overclaimed — it said all
three `?? null` sites were fixed, but one was missed. Fixed in the same pass as this audit, before
this report was finalized; nothing from this bug remains open.

**Checklist claim (line ~902-904 of IMPLEMENTATION.md):** "Fixed all three `?? null` sites."

**State found (before this audit's fix):** Only 2 of 3 sites had actually been fixed.

- [dean/AtRiskStudents.jsx:436](../../src/pages/dean/AtRiskStudents.jsx) — `classConfigMap[classRecId] ?? {}` ✅ was already fixed
- [dean/Dashboard.jsx:65](../../src/pages/dean/Dashboard.jsx#L65) — `classConfigMap[classRecId] ?? {}` ✅ was already fixed
- [dean/Dashboard.jsx:374](../../src/pages/dean/Dashboard.jsx#L374) — `classConfigMap[classRecId] ?? null` ❌ **found broken, fixed after this audit**

```js
// dean/Dashboard.jsx:371-375 — BEFORE this audit's fix
const tentativeVal = computeTentativeGrade(
  classRecordScores,
  classRecordCols,
  classConfigMap[classRecId] ?? null   // bug: still null, not {}
);
```

**Why this threw:** `computeTentativeGrade`/`computeTentativeGradeDetails`
([riskEngine.js:218,266](../../src/lib/riskEngine.js#L218)) declare `options = {}` as a default
parameter. JS default parameters only apply when the argument is literally `undefined` — an
explicit `null` bypasses the default entirely. `computeTentativeGradeDetails` then immediately reads
`options.formula?.ok`, which throws `TypeError: Cannot read properties of null (reading 'formula')`
when `options` is `null`.

**Blast radius:** This sits inside an unguarded `Object.keys(studentScores).forEach(...)` loop
([Dashboard.jsx:367-380](../../src/pages/dean/Dashboard.jsx#L367-L380)) with no local try/catch —
the same pattern the checklist itself documents as having crashed the entire Dean Dashboard page
load (not just one row) before the other two sites were fixed (see 1.21's own write-up). It would
have triggered whenever any department student had a tentative (unposted/draft) grade in a class
whose `classConfigMap` entry was `undefined` for that render pass.

**CURRENT STATE (fixed):**

```js
// dean/Dashboard.jsx:371-375 — AFTER this audit's fix
const tentativeVal = computeTentativeGrade(
  classRecordScores,
  classRecordCols,
  classConfigMap[classRecId] ?? {}   // fixed: now matches the other two sites
);
```

Re-verified: `npm run verify:grading` green, `npm run lint` 0 errors, `npm run build` succeeds.
See "Fixes applied" below.

---

### 2. `riskEngine.js` advising thresholds were hardcoded, not sourced from `academicPolicy.js` (item 1.10)

**Status: Already fixed after this audit.**
**Note:** No live incorrect behavior existed (values matched) — this was a latent duplication
risk, not a bug a user would hit. Closed in the same pass as this audit rather than left open,
since the fix was small and mechanical once identified.

**Checklist claim:** "Re-derive advising thresholds from canonical attendance semantics in
`academicPolicy.js`."

**State found (before this audit's fix):** [riskEngine.js:104,107,110](../../src/lib/riskEngine.js#L104)
hardcoded `absenceCount >= 4`, `=== 3`, `=== 2` as raw literals. `academicPolicy.js`'s `ATTENDANCE`
constants (`fdaAbsences: 4`, `nearFdaAbsences: 3`, `warningAbsences: 2`) were never imported into
`riskEngine.js` — confirmed by grep; only `RISK_TIERS`/`getRiskTierForScore` were imported there.

Values matched at the time, so there was no live behavioral bug — but the two were duplicated
rather than single-sourced, meaning a future edit to one could silently diverge from the other,
exactly the failure mode Rule C-series unification was meant to close.

**CURRENT STATE (fixed):** `riskEngine.js` now imports `ATTENDANCE` from `academicPolicy.js` and
reads `ATTENDANCE.fdaAbsences` / `.nearFdaAbsences` / `.warningAbsences` at all four call sites
(including the summer-amplifier check). No behavior change — same values, now single-sourced.
Re-verified: `npm run verify:grading` green, `npm run lint` 0 errors, `npm run build` succeeds.
See "Fixes applied" below.

---

### 3. Referenced audit report does not exist

**Status: No code to fix — documentation-only finding.**
**Note:** This isn't a bug with a fix; it's a dangling citation to a report that was apparently
intended to exist but never got committed. No action taken to rename or backdate this file to
match the old citation — IMPLEMENTATION.md's header now instead points forward to this file
(`UPDATE_PLAN_AUDIT_2026-10-03.md`) as the real, current audit record going forward.

**Checklist claim (IMPLEMENTATION.md line ~805):** "See `docs/reports/UPDATE_PLAN_AUDIT_2026-10-02.md`
for the full writeup with repro steps."

**Actual state:** No such file exists under `docs/reports/`. This file (`docs/update_plan/UPDATE_PLAN_AUDIT_2026-10-03.md`)
is the first audit writeup actually committed to the repo for this checklist.

---

## Cosmetic / documentation drift — all closed 2026-10-03

None of these affected behavior — the code was already correct, only IMPLEMENTATION.md's own
citations or illustrative code samples were stale. All seven were corrected directly in
IMPLEMENTATION.md (not left as "drift" — the user asked to fix rather than just flag them):

- **2.2/2.3** — Task 6.2's code sample showed `.upsert(rows, {onConflict, ignoreDuplicates})` called
  directly against `notifications`. Added a note documenting the actual mechanism: both dispatchers
  route through `dispatchNotifications()` → `supabase.rpc('dispatch_notifications', ...)`, a
  `SECURITY DEFINER` function that does the dedup server-side via `ON CONFLICT (dedupe_key) DO
  NOTHING` — functionally equivalent idempotency, arguably safer (RPC-gated per the RLS work in
  3.1/3.2), just one layer down from what the illustrative snippet shows.
- **1.16** — Step 10's file citation corrected from `riskEngine.js (lines 91–104)` to the actual
  `(lines 81–95)`.
- **1.17** — Step 10a's and Step 17's file citations corrected from `src/components/faculty/
  StudentRow.jsx` / `src/components/faculty/ExportPreviewModal.jsx` to the actual paths with no
  `faculty/` subdirectory.
- **1.9** — Step 3a's spec snippet showed the fail-closed error as the literal code
  `'NO_TEMPLATE_ASSIGNED'`. Added a note that the actual `error` value is a descriptive sentence
  ("No grading template assigned to this subject."), confirmed by repo-wide grep that no caller
  pattern-matches the literal code — only `.ok` is ever checked — so this was always cosmetic.
- **1.5** — Task 2.3's spec snippet showed a standalone inline null-guard. Added the actual
  one-line `toGwaOrNull` delegation alongside it, noting the two are behaviorally identical.
- **excelExport.js** — **Status: Already fixed after this audit.** **Note:** the `{cs:50, char:10,
  exam:40}` fallback in `extractComponentWeights()` is real code (not just a doc citation), the one
  genuine bug in this otherwise-citations-only list, so it got an actual code fix rather than a
  note: both the whole-formula-missing branch and each individual unmatched-component branch now
  `console.warn` before falling back, so a malformed/missing formula reaching this far is visible
  instead of silent. Scope intentionally unchanged — this only affects the weight labels baked into
  the exported Excel sheet's own formula text; the real posted grade values were already
  fail-closed independently via `calculateStoredTermRating()`, confirmed by reading
  `computeStudentRatings()`.
- Lint warning count in item 1.31 corrected from "54 warnings" to the actual 52.
- **2.9** — `ClassPerformance.jsx`'s line count corrected from the stale "494 lines" to the current
  529, with a note that this count will keep moving and shouldn't be treated as a gate.

Re-verified after the `excelExport.js` code change: `npm run verify:grading` green, `npm run lint`
0 errors / 52 warnings (unchanged — `console.warn` isn't a lint violation), `npm run build`
succeeds.

---

## Confirmed accurate (sample of what held up under direct verification)

- Migration `20261001090000_unify_academic_policy_templates.sql` — all 5 claimed actions present.
- `academicPolicy.js` — transmutation ladder, `resolveOfficialGwa`, `computeStudentGwa`,
  `getHonorTier`, `getAttendanceFlags`, `RISK_TIERS`, no per-subject weights — all present and correct.
- `gradingMath.js` — `encodedWeight`/`ratingOnEncoded`/`isComplete`, `termsExpected`/`termsEncoded`,
  `WEIGHT_TOLERANCE`, fail-closed `resolveGradingFormula` with zero `LEGACY_GRADING_COMPONENTS`
  references repo-wide.
- 18-unit honors floor applies unconditionally to all students (no irregular-only gate).
- GWA risk step-discontinuity curve hand-traced against all 8 documented test pins — exact match.
- `getEnrollmentType` SQL-twin alignment, absence localStorage cache fully removed, FDA filter fixed
  to `>= 4` only, fabricated attendance log deleted, per-course advising aggregation confirmed.
- `dean/GradeDistribution.jsx` brackets now gap-free; `dean/SummaryReports.jsx` scale bug, fabricated
  placeholder GWA/pass-count, hardcoded demo-student grade, and synthetic report generator all
  genuinely removed.
- Notification schema v2 migration, guardians table scaffold, RLS on all 4 tables,
  `dispatch_notifications()` SECURITY DEFINER with restricted grants, zero raw client-side
  `.insert()` calls on `notifications`.
- `supabase/migrations/20261002090000_email_notification_delivery.sql` and
  `supabase/functions/send-email/index.ts` exist exactly as described, including the
  no-grade-value-in-email-body privacy rule.
- `react-pivottable` installed and wired into `ClassPerformance.jsx` as a Pivot tab via the new
  `ReportsPivotPanel.jsx`.
- Guardian consent UI, tokenized guardian links, and Phase 9 scholarship/streak tracking all
  confirmed genuinely absent, matching the checklist's own `[ ]` status.
- All three build gates pass.

---

## Fixes applied as part of this audit

- **dean/Dashboard.jsx:374** — changed `classConfigMap[classRecId] ?? null` to
  `classConfigMap[classRecId] ?? {}`, matching the pattern already applied (and documented) at the
  other two sibling sites in this file and in `AtRiskStudents.jsx`.
- **riskEngine.js attendance thresholds (item 1.10)** — imported `ATTENDANCE` from
  `academicPolicy.js` and replaced the hardcoded `4`/`3`/`2` literals at lines 104, 107, 110, and
  116 with `ATTENDANCE.fdaAbsences` / `.nearFdaAbsences` / `.warningAbsences`. No behavior change
  (values already matched); removes the silent-drift risk.
- **FacultyCharts.jsx hardcoded `75` (item 2.7)** — the four remaining display-only literals (the
  Y-axis clamp default, the target-line position/title, and the legend caption) now reference the
  already-imported `PASSING_GRADE` constant instead of a bare `75`.
- **`scripts/verifyGradingMath.js` assertion coverage (item 1.30)** — expanded from 37 to 79
  `assert.*` calls, past the plan's ~50 target. Added: the full 8-pin GWA risk-curve boundary set
  (previously only 2 of 8 were tested), the attendance/FDA risk-factor zones at 0/2/3/4 absences
  (previously untested), `calculateSemestralGrade`'s regular-4-term and summer-2-term completeness
  fields including the `'In Progress'` remark on an incomplete semester (previously only `sg` was
  checked, and only for summer), `missingComponents` on `calculateWeightedTermRating` (previously
  only `isComplete` was checked), `WEIGHT_TOLERANCE` behavior at both the float-rounding-safe and
  genuinely-invalid boundary, the 18-unit honors floor at the exact 18/17 boundary, and the full
  `toDbRemark`/`toDisplayRemark`/`getRemarks` round-trip including unrecognized-value passthrough.
- **`OFFICIAL_DYCI_PRESETS` duplication (item (k), first half)** — extracted the institutional
  template values into a new `src/lib/officialGradingPresets.js`, consumed directly by both
  `GradeComputationsList.jsx` (replacing its local copy) and `verifyGradingMath.js` (replacing its
  separate copy that carried extra `key`/`isolatedKey`/`isolatedExpected` test-only fields). The
  verify script's "isolated component honors its weight" test now targets `formula.components[0]`
  generically instead of a hardcoded key lookup — no behavior change, confirmed by re-running the
  suite after the refactor.
- **`excelExport.js`'s silent 50/10/40 fallback** — `extractComponentWeights()` now `console.warn`s
  before falling back, both when the whole formula is missing/invalid and when an individual
  component (Class Standing/Character/Exam) can't be matched by name. Scope deliberately
  unchanged: this only affects the weight labels baked into the exported Excel sheet's own formula
  text, never the posted grade values themselves (already independently fail-closed via
  `calculateStoredTermRating()`, confirmed by reading `computeStudentRatings()`). Closes the one
  item in the "cosmetic drift" list that was actual code, not a stale doc citation.
- **Seven stale citations/samples in IMPLEMENTATION.md itself** — corrected directly in that file
  rather than just flagged here: Step 10's `riskEngine.js` line range (1.16), Step 10a's and Step
  17's `StudentRow.jsx`/`ExportPreviewModal.jsx` paths (1.17), Step 3a's literal
  `'NO_TEMPLATE_ASSIGNED'` error-code sample (1.9), Task 2.3's standalone-guard code sample (1.5),
  Task 6.2's direct-`.upsert()` code sample (2.2/2.3), item 1.31's lint warning count, and item
  2.9's `ClassPerformance.jsx` line count. See "Cosmetic / documentation drift" below for each.

All of the above were re-verified by re-running `npm run verify:grading` (green), `npm run lint`
(0 errors, 52 warnings), and `npm run build` (succeeds) after each change.

### Fixes applied (session 2, same day) — items 2.8, (c), (k) second half, (l)

- **Item 2.8 — Reports' fabricated GWA proxy, resolved.** `reportsService.js`'s
  `fetchClassReportDataset()` now also queries `posted_grades` and `attendance_records` for the
  class, and `aggregateByStudent()` feeds `computeUnifiedRisk()` each student's real official GWA
  (most-advanced posted milestone, via the same `findMostAdvancedPostedGrade`/`resolveOfficialGwa`
  helpers used elsewhere) and real absence count, instead of the binary `overallPercentage < 75 ?
  3.5 : 2.0` stand-in. When no milestone has posted yet for the class, GWA stays `null` (missing,
  not fabricated as failing) — matches the "unencoded is not zero" rule applied everywhere else.
  `ClassPerformance.jsx` updated to pass the new `gwaByStudent`/`attendanceByStudent` maps through.
- **Item (c) — dean-facing risk models unified, student-facing one deliberately left separate.**
  `dean/SummaryReports.jsx`'s standalone 3-tier GWA-only model and `dean/Dashboard.jsx:588`'s third
  ad-hoc `studentAvg > 3.00` rule both now call the canonical `calculateAcademicRisk()`/
  `computeUnifiedRisk()` (the latter reusing the file's own `worstCourseAbsences()` helper, so it
  agrees with the file's own department-wide `highRiskCount` for the same student). Per the user's
  decision, `student/AcademicInsights.jsx`'s `computeVerdict` remains a separate, gentler
  self-facing message — not touched.
- **Item (k), second half — `seedDatabase.js` dedup, resolved.** Its hardcoded "General Education
  Core" preset (name/description/components) now imports and reuses `OFFICIAL_DYCI_PRESETS` from
  `src/lib/officialGradingPresets.js` instead of a second hardcoded copy. Note:
  `GradeComponentsSetup.jsx:29-32`, the other half item (k) originally cited, turned out on
  inspection to **not** be the same duplication — those lines are a default per-activity max-score
  grid (6 activities @ 20, one @ 10, exam @ 40), not a copy of `OFFICIAL_DYCI_PRESETS`. Left
  unchanged; the original citation had drifted from current code.
- **Item (l) — reusable diff tool, built.** New `scripts/diffGradingSnapshot.js` (`npm run
  diff:grading -- snapshot <classRecordId> <file.json>` / `... diff <before.json> <after.json>`).
  Snapshots a class roster's *officially posted* term ratings, SG, remarks, GWA, honors tier, and
  risk score/tier (never a recomputed draft — so the snapshot is stable between runs unless someone
  actually posts a new grade), then diffs two snapshots field-by-field. Smoke-tested the diff logic
  against hand-built fixtures (change-detected and no-change cases both verified).

All four re-verified: `npm run verify:grading` green, `npm run lint` 0 errors / 52 warnings,
`npm run build` succeeds.

---

## Remaining open phases & items (`[~]` partial / `[ ]` not started)

Eight items originally tracked in this table — **1.30**, **1.10**, **2.7**, **2.8**, item (c), item
(k), and item (l) — were resolved across this audit's two sessions. They've been removed from the
table below (it now lists only what's genuinely still open) — see "Fixes applied" above (both
sessions) for what was done to each.

Every box still `[~]`/`[ ]` in IMPLEMENTATION.md's Master Execution Checklist, as of this audit,
with what's actually blocking each one:

| Item | State | What's blocking it |
|---|---|---|
| **3.3** — Email delivery migration (`20261002090000_email_notification_delivery.sql`) | `[~]` | Code written, **never run against the remote Supabase project**. No Supabase CLI was available in the environment that wrote it. |
| **3.4** — `send-email` Edge Function | `[~]` | Code written, **never deployed**. Needs `supabase functions deploy send-email` run by someone with project access. |
| **3.5** — Gmail SMTP secrets | `[~]` | Decision made (Gmail over Brevo), but `SMTP_USER`/`SMTP_PASS`/`WORKER_SECRET`/`PORTAL_URL` are **not set on the remote project**. Credentials were deliberately kept out of the repo and out of chat with any AI assistant. |
| **3.7/3.8 — REVISED SCOPE, BUILT 2026-10-03.** Guardian consent UI + tokenized links scrapped per product decision. Built instead: (1) `GuardianInfoGate.jsx`, a non-dismissable modal wired into `MainLayout.jsx` that blocks every student login until a guardian name/relationship/email is on file — no consent checkbox, explicit decision to skip the RA 10173 safeguard IMPLEMENTATION.md Section 7 flags; (2) `upsert_primary_guardian()` RPC + a `guardians_student_select` RLS policy (new migration `20261003110000_guardian_self_service.sql` — `guardians` had RLS enabled but zero policies, so no authenticated client could read/write it before this); (3) the `fan_out_notification_deliveries()` trigger now also queues a formal guardian email for every `grade_posted`/`grade_changed` event, with a dedicated `guardian_id`/`honors_pace` column pair on `notification_deliveries` (new migration `20261002080000_guardian_notification_columns.sql`, since that table is already live) rather than a JSONB blob — a dedicated-column design the user asked for explicitly over my first metadata-based draft; (4) `send-email/index.ts` now branches to a separate `renderGuardianTemplate()` with real grade detail and a conservative honors-pace insight, deliberately never reusing the student's own privacy-safe template; (5) the actual term rating/GWA and student name are threaded from `ScoreInput.jsx`/`GradeComputationPreview.jsx` through `notificationDispatcher.js` into the notification payload, since neither existed there before. **Not yet verified end-to-end** — all three new/edited migrations are part of the same not-yet-applied `supabase db push` as 3.3–3.5; nothing here can be confirmed working until that runbook runs. | `[~]` | Code complete, gates green (`verify:grading`/`lint`/`build`), but entirely unverified against a live database — depends on the same Supabase runbook as 3.3–3.5. |
| **Phase 9 / 3.12** — Scholarship standing & streak tracking | `[ ]` | Correctly deferred per the plan's own prerequisite: needs a `student_risk_history` table, a `student_semester_summary` materialized view, and historical term data migrated into them *before* `getScholarshipStanding()`/`getStreakLength()` can be written without fabricating history. Nothing exists yet — table, view, or functions. |

---

## Manual developer action required

Some of the items above cannot be completed by an AI coding agent working in this repository —
they require a human with Supabase project credentials, terminal access, or an out-of-band secret
(a Gmail App Password), and in a couple of cases a product decision only the team can make. These
are listed separately from ordinary code changes so nothing gets mistaken for "just needs an agent
to finish it."

### A. Requires Supabase project access / credentials (cannot be done from this repo alone)

This is the full runbook already documented in IMPLEMENTATION.md §SECTION 10, restated here as an
action list. **Someone with Supabase CLI access to project `ettnwknyhdhehoclrwwh` must run these,
in their own terminal — not through this repo, not by pasting secrets into chat with any AI
assistant:**

1. **Install/link the Supabase CLI** (skip if already set up):
   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref ettnwknyhdhehoclrwwh
   ```
2. **Apply the pending migrations** (3.3, plus the 3.7/3.8 guardian work added 2026-10-03 —
   `supabase db push` applies every unapplied file in order, so this is one step, not three):
   ```bash
   supabase db push
   ```
   This now also applies `20261002080000_guardian_notification_columns.sql` (adds
   `guardian_id`/`honors_pace` to `notification_deliveries`) and
   `20261003110000_guardian_self_service.sql` (the `upsert_primary_guardian()` RPC + RLS policy
   the Settings-page guardian gate needs) — both must land before the guardian gate or guardian
   emails will work. If `CREATE EXTENSION pg_cron` fails: go to the Supabase **Dashboard →
   Database → Extensions**, enable `pg_cron` and `pg_net` manually (this usually can't be done
   via a plain migration — it needs `shared_preload_libraries`), then re-run `supabase db push`.
3. **Generate a worker secret** (shared between the cron job and the Edge Function — must be
   identical in steps 4 and 5; this is invented locally, not a real external credential):
   ```bash
   openssl rand -hex 32
   ```
4. **Set the Edge Function secrets** — type the real Gmail address, Gmail App Password, and the
   worker secret from step 3 directly into this command, in this terminal only:
   ```bash
   supabase secrets set SMTP_USER=the-gmail-address SMTP_PASS=the-app-password \
     WORKER_SECRET=<value from step 3> PORTAL_URL=https://the-real-deployed-url
   ```
5. **Set the matching DB-side secret** via the **Supabase SQL Editor** (not a migration file — this
   value must never be committed to git):
   ```sql
   ALTER DATABASE postgres SET app.worker_secret = '<the SAME value from step 3>';
   ```
6. **Deploy the Edge Function** (3.4):
   ```bash
   supabase functions deploy send-email
   ```
7. **Test it** — post a grade to a test student with a real inbox, then (same terminal, same dev):
   ```bash
   curl -X POST https://ettnwknyhdhehoclrwwh.supabase.co/functions/v1/send-email \
     -H "x-worker-secret: <same value as step 3>" -H "Content-Type: application/json" -d '{}'
   ```
   Confirm: the response shows `sent: 1`, the delivery row's `status` flips to `sent` with a
   `sent_at` timestamp, and the email actually arrives with **no grade value in the body**.

**Where the Gmail App Password comes from:** the site owner provides the Gmail address + App
Password to whoever runs the above, out of band (not through this repo, not through chat with an
AI assistant). Nothing SMTP-related belongs in the shared `.env` file — it was deliberately removed
from there for this reason.

**Until this runbook is run, items 3.3/3.4/3.5 cannot move from `[~]` to `[x]`.** Code existing in
the repo is not the same as the feature working — no notification email has actually been sent yet.

### B. Product/team decisions — all three resolved 2026-10-03

- **2.8 — DECIDED: wire in real data.** Done — see "Fixes applied (session 2)" above.
- **Item (c) — DECIDED: unify the two dean-facing models, leave the student-facing one separate.**
  Done — see "Fixes applied (session 2)" above.
- **3.7/3.8 timing — DECIDED: scope changed entirely.** No consent UI or tokenized links. Required
  guardian/parent contact field (blocks login via modal until filled) + automatic SMTP notification
  on grade posting, explicitly accepting the RA 10173 consent-safeguard tradeoff IMPLEMENTATION.md
  Section 7 flags. Not yet built — see the 3.7/3.8 row in "Remaining open phases & items" above.

### C. Ordinary follow-up code work — all six items completed across both sessions

- ✅ Threaded `academicPolicy.js`'s `ATTENDANCE` constants into `riskEngine.js`.
- ✅ Removed the remaining hardcoded `75` display literals in `FacultyCharts.jsx`.
- ✅ Expanded `scripts/verifyGradingMath.js` from 37 to 79 assertions.
- ✅ Extracted `OFFICIAL_DYCI_PRESETS` into `src/lib/officialGradingPresets.js`, shared by the
  admin UI, the verify script, and now `seedDatabase.js` too.
- ✅ `seedDatabase.js` dedup (item (k) second half) — done. (`GradeComponentsSetup.jsx:29-32`, the
  other citation, turned out not to be the same duplication on inspection — left unchanged.)
- ✅ Before/after diff tool (item (l)) — built as `scripts/diffGradingSnapshot.js`, a reusable dev
  tool rather than the original one-time throwaway script.

Nothing left in this category — every item originally here is resolved.
