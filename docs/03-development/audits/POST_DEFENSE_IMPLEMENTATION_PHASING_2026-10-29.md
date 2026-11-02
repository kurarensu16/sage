# Post-Defense Implementation Phasing — 2026-10-29

**Status:** Build-order companion to `POST_DEFENSE_IMPLEMENTATION_ROADMAP_2026-10-28.md`, written after all 7 plans' open decisions were confirmed with the developer on 2026-10-29. This doc turns the roadmap's row order into concrete phases with checkpoints — it does not restate each plan's full design, only the sequence and gating rules to follow while building.
**Rule:** One phase at a time, top to bottom. Do not start phase *N+1* until phase *N* is built, manually tested, and recorded per `AGENTS.md` §4. Within a phase, every file still gets its own per-file "name it, wait for yes" confirmation before it's touched — this document does not pre-approve any file.

## How to read this

Each phase corresponds to one roadmap row and one plan doc. The step lists below are compressed pointers into that plan's own "Suggested build order" section — read the plan in full before starting its phase, this doc is a checklist, not a replacement.

---

## Phase 1 — Admin/Registrar Role Split
**Plan:** `ADMIN_REGISTRAR_ROLE_SPLIT_WORKFLOW_PLAN_2026-10-28.md` · **Depends on:** nothing · **Blocks:** Phases 3, 4

1. RLS audit — re-run/expand the grep inventory across `supabase/migrations/`, confirm final list of policies needing a `registrar` branch.
2. Migration: registrar-aware RLS (users read-only `SELECT`, Grade Override actor-role re-point to `registrar`-only, guardian-access policy gains `registrar`).
3. Confirm `AuthContext.jsx` / `RoleGuard.jsx` need no change (generic role passthrough).
4. `src/App.jsx` — new `registrar` route group; move relocated routes out of Admin's group.
5. `src/components/layout/Sidebar.jsx` — add `registrar` nav key; trim Admin's nav to the narrowed set + System Maintenance placeholder.
6. New pages: `ProgramList.jsx`/`ProgramForm.jsx`, `EnrollmentManagement.jsx`, `ImportStudents.jsx`, View Users (read-only, full column parity).
7. Relocate existing admin pages (Subjects, Grading Templates, Sections, Departments, Terms, Grade Override, Section Rosters) to Registrar.
8. `seedAdmin.js`/`seedDatabase.js` — add `registrar@sage.edu.ph` demo account; update `AGENTS.md`'s demo user list in the same change.
9. Manual click-through: Admin can no longer reach relocated routes; Registrar can reach **and write to** Grade Override; View Users renders no create/edit/deactivate controls.
10. Change record in `docs/05-operations/agents/feature-updates/` + `docs/README.md` index update.

**Phase-exit check:** Registrar role fully functional and tested before Phase 3 (grading templates) or Phase 4 (faculty loading) start — both assume this role already exists and works.

---

## Phase 2 — System Maintenance Mode & System Health (R2 groundwork)
**Plan:** `SYSTEM_MAINTENANCE_AND_HEALTH_WORKFLOW_PLAN_2026-10-28.md` · **Depends on:** nothing (independent infra) · **Blocks:** Phase 6's evidence-upload storage

1. Migration: `system_settings` table (maintenance config only, kept separate from any future storage-config table per the normalization decision), RLS, `set_maintenance_mode` RPC, seed row.
2. `MaintenanceContext.jsx` — Realtime subscription + 4s poll fallback, exposes `maintenanceMode`/`maintenanceMessage`.
3. Route guard — non-admin + `maintenance_mode === true` + new login → `MaintenanceScreen`.
4. `MaintenanceScreen.jsx` — full-screen message.
5. Active-session UI: dismissible toast **and** persistent top banner on the `false → true` transition; banner clears automatically and silently when maintenance ends while the session is active (no "ended" notice).
6. Admin UI: `MaintenanceModePage.jsx` (toggle + message + last-changed line); `SystemHealth.jsx` (connectivity ping, 500ms/2s/red bands).
7. R2 groundwork only: env var placeholders documented (developer sets actual values manually — AI never edits `.env*`), `r2Storage.js`/`supabase/functions/_shared/r2.ts` skeleton using server-side signed URLs, `StorageHealth.jsx`. Scope is fixed: **R2 is used only for Grade Change Request evidence (Phase 6) — never avatars.**
8. Manual click-through: two-session test (admin + non-admin) confirms soft-cutover behavior exactly; System Health badge reflects a real connectivity drop accurately.
9. Change record + `docs/README.md` update.

**Note for build time:** when this phase reaches step 7, prepare the R2 account/bucket/API-token setup notes (what to create in the Cloudflare dashboard, which env vars go in `supabase/.env`, how signed-URL access works end to end) as part of that file's confirmation — the developer asked for this walkthrough when R2 is actually wired up, not before.

---

## Phase 3 — Dynamic Grading Policy
**Plan:** `DYNAMIC_GRADING_POLICY_WORKFLOW_PLAN_2026-10-27.md` · **Depends on:** Phase 1 (Grading Templates now live under Registrar) · **Blocks:** nothing downstream

1. Migration: `grade_computations.passing_threshold` (50-94, `NULL`=75 default), `subjects.fda_absence_threshold` (2-10, `NULL`=4 default), updated `aspire_transmute_grade`, snapshot backfill for both new keys, updated posting/correction call sites, updated `save_grade_template`.
2. `src/lib/academicPolicy.js` — `buildTransmutationLadder`, `toGwaOrNull`, `resolveAttendancePolicy` (linear-rescale formula, accepted as-is).
3. `src/lib/gradingMath.js` — thread `passingThreshold` through snapshot creation.
4. Snapshot-building call sites: `classRoomService.js`, `ScoreInput.jsx`, `GradeComputationPreview.jsx`.
5. Remaining GWA-reading and attendance-reading call sites (grep `ATTENDANCE\.` for the exact list).
6. Risk/report propagation: `riskEngine.js`, `reportsService.js`, `FacultyCharts.jsx`, `DeanCharts.jsx`.
7. Admin/Registrar UI: `GradeComputationsList.jsx` (passing threshold field), `SubjectForm.jsx` (FDA threshold field) — now Registrar-owned pages per Phase 1.
8. `npm run verify:grading` fixtures (null/default regression, 80%/69% cases, FDA-tier derivation) + manual click-through confirming an unrelated existing template/class is completely unaffected.
9. Change record + `docs/README.md` update.

---

## Phase 4 — Unified Faculty Loading & Provisioning
**Plan:** `FACULTY_LOADING_AND_PROVISIONING_WORKFLOW_PLAN_2026-10-28.md` · **Depends on:** Phase 1 (Registrar role), Phase 3 (shares Grading Templates/snapshot machinery) · **Blocks:** nothing downstream

1. Migration: `provisioning_locks` table + RPCs (3-min TTL, 60s heartbeat, scoped only to this page); `faculty_load_drafts` table (status enum, unique-per-slot partial index).
2. Two separate pages: `src/pages/registrar/FacultyLoadingAndProvisioning.jsx`, `src/pages/dean/FacultyLoadingAndProvisioning.jsx` — both calling shared service functions. Tab 1 Load Summary (informational totals, no unit cap) + Export (`.xlsx`, current-state snapshot only).
3. Tab 2 cascading picker: Faculty → Program → Year Level → Class → Add, with assigned classes hidden from the list entirely; per-row **and** batch "Finalize All Drafts" (each with its own confirm step), calling `provisionClassroomByAdmin()` unchanged.
4. **Reassign** action: available to Registrar (any college) and Dean (own college) equally; reassigning an already-**finalized** row requires an extra confirmation step beyond the draft-row dialog; both old and new faculty get notified via `notificationService.js` either way.
5. Lock acquire/heartbeat/release wiring; read-only banner covering Add, Finalize, and Reassign alike.
6. **Add Irregular Student to Class** action on a finalized class's roster — no join code, reuses `getEnrollmentType()`.
7. Remove `src/pages/admin/ClassroomProvisioning.jsx` and its nav entry; delete `FacultyCreateClassroomModal.jsx`, `provisionClassroomByFaculty`, `provisionBatchClassroomsByFaculty`, and the Faculty "Create Classroom" nav entry outright.
8. Manual click-through per the plan's worked example (build a load, confirm hide-on-assign, Finalize, export, reassign, concurrent-lock test, irregular add, regular join-code path re-tested untouched).
9. Change record + `docs/README.md` update.

---

## Phase 5 — Grade Lifecycle Hardening & Grade Consultation Log
**Plan:** `GRADE_LIFECYCLE_AND_CONSULTATION_LOG_WORKFLOW_PLAN_2026-10-28.md` · **Depends on:** none strictly, but logically before Phase 6 · **Blocks:** Phase 6 (needs the `Finalized` state to gate on)

1. Migration: `posted_grades.finalized_at`; `grade_consultation_windows` + `grade_consultation_notes` tables; `finalize_grade_milestone(p_window_id)` RPC; `post_grade_milestone_atomic` stops setting `is_locked = TRUE` directly, derives it from `finalized_at` instead. Window opens automatically at posting time.
2. `gradeMilestones.js`/`gradePostingService.js` — three-state status helper (`Tentative` / `Posted — Not Finalized` / `Finalized`).
3. New `src/pages/faculty/GradeConsultationLog.jsx`, replacing `ConsultationRequests.jsx` in routes/nav. Finalize-with-zero-notes requires an extra confirm step that **summarizes the logged-consultation count** before committing, regardless of whether it's zero.
4. Student-side: status badge update on Grade Report; new **dedicated** Consultation History page (own route, per-semester history, archived via `AcademicPeriodFilter` on term rollover) replacing `Consultations.jsx`.
5. Remove `ConsultationRequests.jsx`/`Consultations.jsx` once replacements are confirmed working; `consultations` table stays in place, read-only, no new writes.
6. `npm run verify:grading` — fixture confirming Not-Finalized rows are excluded from "posted = locked" assumptions, and `is_locked` still reads correctly once `finalized_at` is set.
7. Manual click-through: post → "Posted — Not Finalized" badge → log a note → Finalize (confirm the zero/non-zero summary step) → badge flips to "Finalized" → archived view renders.
8. Change record + `docs/README.md` update.

---

## Phase 6 — Grade Change Request System
**Plan:** `GRADE_CHANGE_REQUEST_WORKFLOW_PLAN_2026-10-28.md` · **Depends on:** Phase 5 (gates on `Finalized`), Phase 2 (R2 evidence storage) · **Blocks:** nothing downstream

1. Migration: extend `remark_override_requests` with `reason_type` (4 fixed values), `grade_period`, `submitted_by_role`, `faculty_note`; extended `status` chain (`pending_faculty_review` → `pending_dean_review` → `approved`/`rejected` → `applied`); extend `submit_sg_correction_request` with `p_grade_period` (no new RPC); new `apply_approved_milestone_correction` (one shared function, guard rejects `semestral_grade`); cap of one open request per `posted_grade_id`.
2. `gradeCorrectionService.js` — student-callable `submitGradeChangeRequest()`; faculty-validation step.
3. Student: Submit Request page (gated on milestone `Finalized`, evidence upload via Phase 2's R2 signed-URL flow); My Requests list.
4. Faculty: Pending Review queue; repurpose "Forwarded to Dean"/"History" views, consolidate edit-trigger here; remove the retired prompt from `PostedGradesView.jsx`.
5. Dean: repurpose `RemarkOverrideRequests.jsx` for the broadened scope and renamed chain states. `src/pages/admin/GradeOverride.jsx` stays untouched — do not conflate it with this chain.
6. Propagation check: `riskEngine.js`, `reportsService.js`, `DeanCharts.jsx`, student Grade Report, audit log.
7. Nav: three standalone top-level "Grade Change Requests" groups (student/faculty/dean).
8. `npm run verify:grading` fixtures (MR-only isolation, SG cascade unchanged) + manual click-through of the full worked example.
9. Change record + `docs/README.md` update.

---

## Phase 7 — AI Study Tutor (Start Tutoring mode)
**Plan:** `AI_STUDY_TUTOR_WORKFLOW_PLAN_2026-10-26.md` · **Depends on:** nothing · **Blocks:** nothing (fully isolated)

**Gate:** step 2 below cannot start until the model/provider decision is finalized (ruled out: reusing `invoke-advisor`'s OpenRouter chain; still being decided between candidates). Steps 1, 3, 4 do not depend on that answer and may proceed first if you want to build ahead of the decision.

1. Migration: `topic_resources` (curated table, no live grounding), `student_tutor_plans`, `student_tutor_practice_attempts`, `student_tutor_log`.
2. **[Gated]** `invoke-study-tutor` edge function — bearer auth, student-role check, own rate-limit counter, `redactDirectIdentifiers()`, system prompt per the plan's 10 numbered rules, strict-JSON envelope with force-injected boundary statement.
3. Student-facing menu wizard (`Start Tutoring` → Scope → Focus → Action → Shape), "My Study Plans" Active/Completed list, View Plan screen, renew/continue flow, deadline/staleness banner.
4. Entry tiles: two top-level tiles (Ask ASPIRE / Start Tutoring) on the AI Study Tutor page.
5. Change record + `docs/README.md` update.

---

## Standing convention: every bulk import looks the same

**Applies to Phases 4–7 and anything added later.** Any feature that accepts a
CSV or Excel file in bulk must follow the pattern Manage Users established and
the Registrar's New Student Accounts page now matches:

1. **Download a template.** The user never guesses at headers. A template button
   sits in the page header.
2. **Classify every row before anything is written**, into exactly three states:
   - **Ready** — new, will be applied.
   - **Existing** — correct, but there is nothing to do; it is skipped. This is
     *not* an error. Calling a re-uploaded master list "errors" makes a working
     file look broken and trains people to ignore the warnings that matter.
   - **Error** — needs fixing; it is skipped and the message says why, naming
     the offending value.
3. **Show the counts, then the rows**, with the spreadsheet's own line numbers so
   a reported problem can be found in the source file.
4. **Match reference data against the database by exact name**, never guess, and
   never silently create a missing college, section, or program.
5. **Require an explicit confirmation** before applying, stating what is about to
   happen in the user's terms — and broken down by a meaningful grouping (for
   example per college) rather than one bare total, so a batch cannot be sent to
   the wrong scope unnoticed.
6. **Apply as a unit where the data allows it**, so a partial batch does not have
   to be reconciled by hand.
7. **Write one audit entry** recording applied and rejected counts.

Known upcoming cases: Phase 4 deliberately has **no** import — its plan dropped
bulk Excel in favour of export-only, so the rule binds only if that reverses.
Phase 7's `topic_resources` is the most likely place a new bulk import appears.

## Standing convention: error messages are written for the reader

**Applies to Phases 4–7 and anything added later.** Nothing a user sees may name
a table, column, constraint, schema or error code. A registrar who is told
"Could not find the table 'public.student_account_requests' in the schema cache"
learns nothing, assumes the system crashed, and is shown the database's shape for
no reason.

Route caught errors through `toUserMessage(error, fallback)` in
`src/lib/errorMessages.js`. It shows our own RPC messages verbatim — those are
already written as actionable sentences — and replaces machine output with plain
English, while still logging the technical detail to the console.

When writing a new RPC, raise messages the same way: say what happened and what
the reader can do, not which constraint failed.

## Cross-phase reminders

- **Every phase writes or amends its page checklists**, in
  [`docs/04-testing/page-checklists/`](../../04-testing/page-checklists/README.md).
  One section per page, each with a stable case ID. When a phase changes a page an
  earlier phase delivered, **amend that page's existing section** and update its
  `Last touched by` line rather than appending a second one — two checklists for
  one page is how a page ends up half-tested. The README lists the overlaps
  already known, for example Phase 2 repurposing Admin's Dashboard (`ADM-DASH`)
  and Phase 4 removing Classroom Provisioning (`ADM-PROV`).
- **Per-file confirmation never goes away.** This phasing doc and the 7 plans' own confirmed decisions are the *design* sign-off — each individual file still needs its own "here's the file, here's the change, yes?" before being touched, per `AGENTS.md` §2.
- **Verification commands available throughout:** `npm run lint`, `npm run build`, `npm run verify:grading`, `npm run verify:csv`, `npm run verify:insights`, `node scripts/verifyEvaluationTracking.js`, `node scripts/verifyEvaluationReferrals.js`. Run the grading ones after touching anything in Phases 3, 5, or 6.
- **Change records are mandatory per phase**, not optional — one file per topic in `docs/05-operations/agents/feature-updates/`, named `YYYY-MM-DD_HHMM_short-topic.md`, filled per the template in that folder's `README.md`.
- **Do not jump ahead.** If Phase *N*'s dependency (e.g. the Registrar role in Phase 1) isn't actually working when Phase *N+1* starts, stop and fix Phase *N* first rather than routing around it.

---

## Build status, and where the build diverged from this plan

Appended 2026-10-29 as Phases 1–5 completed. The plan above is kept as written;
this section records what was actually built where it differs, so a reader is not
left auditing the code against a step that was deliberately changed.

| Phase | Status | Migration |
|---|---|---|
| 1 — Admin/Registrar role split | Built | `20261029034500`, `20261029040940`, `20261029044752` — **applied** |
| 2 — Maintenance mode, system/storage health | Built | `20261029052220` — **applied** |
| 3 — Dynamic grading thresholds | Built | `20261029054241` — **applied** |
| 4 — Faculty loading & provisioning | Built | `20261029093613` — **applied 2026-10-29** |
| 5 — Grade lifecycle & consultation log | Built | `20261029104037` — **applied 2026-10-29** |
| 6 — Grade change requests | Built | `20261030102815`, `20261030104405`, `20261030105114` — to apply |
| 7 — AI Study Tutor | Not started; model/provider still an open decision | — |

Also built, **outside** the seven phases, at the owner's request on 2026-10-29:
the student account handover queue (`20261029085444`) and Admin Backup & Restore
with Supabase Storage usage (`20261029215500`). Both **applied 2026-10-29**, and
both have their own change records.

**All nine migrations written in this session are applied.** The database and the
repository are in step as of 2026-10-29.

### Divergences worth knowing

**Phase 5, step 1 — `finalized_at` is not on `posted_grades`.** The plan put it
there and had the posting function stop setting `is_locked` directly. In practice
`post_grade_milestone_v3` is the most load-bearing function in the system, and
rewriting its locking would have meant transcribing hundreds of lines of grading
logic. Instead `finalized_at` lives on `grade_consultation_windows`, and the
posting function's two `AND COALESCE(locked_grade.is_locked, TRUE)` clauses were
patched in place to also require `milestone_edits_frozen(...)`, with the
substitution count asserted at exactly 2 so schema drift aborts the migration
loudly. The window opens from an `AFTER INSERT` trigger rather than from inside
the posting function, for the same reason.

**Phase 5 — Semestral Grade has no window.** Decided by the owner during the
build: SG is the summary of MR and TFR, so the consultation belongs at the
milestones that feed it rather than being repeated on the total. SG posts and
locks exactly as before. Consequence for **Phase 6**: a Grade Change Request
gates on `finalized_at` for MR and TFR, but on *posted* for SG, because SG never
acquires a `finalized_at`.

**Phase 5, step 5 — the old pages were deleted, and so was the student-facing
request flow.** The plan kept the `consultations` table read-only, which holds.
But the Faculty **Dashboard** still renders a resolution panel over
`student_consultation_requests`. Students can no longer create those requests, so
it shows only historical rows. Left in place rather than removed, so the history
stays visible — flagged in `FAC-CONSULT` for a decision.

**Phase 5, step 6 — the verify fixture needed a module split.** The three-state
logic lived beside the Supabase client, which cannot be imported in Node, so it
moved to `src/lib/milestoneState.js` and is re-exported from the service. Writing
the fixture then caught a real defect: a milestone posted before the migration
has no window row, and the page was reading that as "Posted — Not Finalized"
while the database refused every change. The JS now matches
`milestone_edits_frozen()`'s `COALESCE(..., TRUE)`.

**Phase 4 — scheduling was added, and was not in the plan.** Day of week and a
start/end time, one pattern per class, with institution-wide conflict detection
and role-based redaction of the conflict details. Rooms are out of scope.

**Phase 4 — the lock TTL.** Implemented with a 60-second heartbeat as planned;
the lock is allowed to lapse by TTL rather than requiring an explicit release, so
a closed tab or a crash cannot strand a college.
