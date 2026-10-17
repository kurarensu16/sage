# ASPIRE Consultation-to-Audit Report

**Audited against:** `ASPIRE_Consultation_Audit_Spec_v1.0.md`
**Repository audited:** `sage` (git), HEAD commit `5891334` on branch `main`, confirmed clean working tree at time of audit.
**Method:** Read-only static inspection (source files + Supabase migrations/functions). No files were edited, no migrations were run, no data was modified, no destructive operations were performed.
**Auditor:** 6 parallel read-only investigation passes (one per item or item-group below), synthesized into this report.

> **This document reports findings and proposals only. No changes have been implemented. Nothing below is authorization to implement anything — see Section 4 and the per-item "Open Decisions."**
> Decisions were since resolved in planning/Q&A on 2026-10-14 — see `ASPIRE_CONSULTATION_IMPLEMENTATION_PLAN_2026-10-14.md` in this folder for the resulting execution plan.

---

## 0. Headline — read this first

Beyond the 13 consultation items, the audit surfaced **two chained, critical security/integrity issues already live in the current codebase**, independent of anything in the consultation notes:

1. **`public.users` has Row-Level Security disabled** (`supabase/migrations/20260531081149_disable_rls_for_now.sql:1`), with no compensating grant revocation. Since `users.role` is the authorization gate for the entire app, **any authenticated student can self-escalate to `admin`** via a direct Supabase client call (`supabase.from('users').update({role:'admin'}).eq('user_id', <own uid>)`).
2. A self-escalated "admin" session **fully bypasses the grade-correction approval workflow**: `enforce_sg_correction_application()` (`20261008160000_sg_correction_integrity.sql:446-449`) short-circuits every check with `IF v_role = 'admin' THEN RETURN NEW;`, allowing direct overwrite of **posted/locked grades** with **no approval request and no audit-log entry** (the audit trigger only fires on a correction-request-ID change, which this path never sets).

A related, narrower issue (ASPIRE-C07) found a **second, independent live exposure**: faculty/admin credentials can delete a grading column (`class_activities`) directly via Supabase, cascading to **permanently delete real student scores**, with no NULL-vs-zero check, no confirmation, and no dedicated audit trail — the only guard is whether the term has already been officially posted.

These three are flagged **Critical** and are addressed in full in Section 2 (Additional Issues) and within C07 below. They should be treated as live exposures, not theoretical risks — the full call chain is cited with file:line evidence in Section 2.

---

## 1. Itemized Audit Results — ASPIRE-C01 through ASPIRE-C13

### ASPIRE-C01 — Academic Period Terminology
**Status:** Partially Implemented / Conflicting

**Current behavior observed:** The literal string "Ongoing Terms" does not exist verbatim, but "Ongoing terms"/"Ongoing" is used inconsistently as a per-class grading-progress flag (has the Semestral Grade posted yet?), not a semester indicator — conflated with semester-sounding language ("Semestral Ongoing"). The true semester object (`academic_terms`) is never actually shown via this label. Grade *entry* correctly uses all four grading periods (Prelim/Midterm/Semi-Final/Final), but grade *posting/status* only recognizes three milestones (MR, TFR, SG), so the per-class badge collapses the four periods into a binary Ongoing/Posted state.

**Evidence:** `src/pages/faculty/Dashboard.jsx:41,77-83,130-155,224-237,560-580,764-845`; `src/pages/faculty/ClassRecordsList.jsx:130-155,223-228,395-410`; `src/lib/gradeMilestones.js` (whole file); `src/pages/faculty/ScoreInput.jsx:74-123`; `supabase/migrations/20260606164500_add_attendance_and_semester_transition.sql:13-26`; `supabase/migrations/20261010120000_intervention_followup_and_task_verification.sql:473`. Not inspected: full student-facing dashboards beyond MyGradesList/AcademicInsights.

**Gap vs. source:** No relabeling implemented anywhere; current wording is ambiguous between semester and grading-period meaning, and the 4-period vocabulary is not reflected in class-status badges.

**Safety/compatibility findings:** The mislabeled strings are purely presentational (client-computed from `postedPeriods`), not read from or written to `academic_terms`/`class_records.semester`/any ID column — a pure label swap is safe at the code layer. Re-deriving Prelim/Midterm/Semi-Final/Final display (vs. the current 3-milestone/binary status) would be a larger change than a label swap.

**Open decisions (resolved 2026-10-14):** Wording confirmed as "Current Grading Period". Re-deriving 4-period display is out of scope for this pass.

**Proposed minimal change:** Rename the two literal strings at `Dashboard.jsx:568,579` to "Current Grading Period"; leave `cls.status`/`gradingPeriod` computation untouched.

**Verification tests:** Confirm relabel doesn't change `pendingGradesCount`/`statusLabel` computation; confirm nothing branches on the string for business logic (only UI conditional rendering); regression-test MR/TFR/SG posting flow unaffected.

**Risk level:** Low — cosmetic, no persisted data touched.

---

### ASPIRE-C02 — Faculty Student-Consultation Scheduling
**Status:** Missing (date/time + mode) / Partially Implemented (request creation + summary display)

**Current behavior observed:** `student_consultation_requests` (`supabase/migrations/20260914120000_aspire_pipeline_v3_1.sql:80-98`) has **no date/time column and no mode column at all**. Creation is **student-initiated** (`src/pages/student/Consultations.jsx:129-195`) via a free-text "Preferred Consultation Schedule" input — no date picker, no time picker, no mode selector. Faculty-side (`src/pages/faculty/ConsultationRequests.jsx`) is a response/resolution UI only (sets status + free-text notes), not a scheduling-creation UI; there is no faculty "create consultation" screen in `App.jsx` routes. Any actual date/time/mode/link/location today must be typed unstructured into `faculty_notes`. Faculty get no notification when a student submits a new request (only students are notified on resolution). No cancel/reschedule control exists for students on their own request.

**Evidence:** `supabase/migrations/20260914120000_aspire_pipeline_v3_1.sql:80-98`; `src/pages/student/Consultations.jsx` (17-35,129-195,389-411,497-509); `src/pages/faculty/ConsultationRequests.jsx` (whole file); `src/App.jsx:49,61,162,179`.

**Gap vs. source:** No date/time selection, no two-mode option, no structured recording of either in a summary — all unstructured free text today.

**Safety/compatibility findings:** `preferred_schedule` being free text means "selected ≠ confirmed" is trivially true, but there's also no structured proposed-vs-confirmed concept at all. **`student_consultation_requests` RLS is disabled** (same migration, line 98, never re-enabled) — any authenticated client can currently read/write all rows (other students'/faculty's requests) via Supabase directly; app-layer `.eq('faculty_id', ...)` filtering is not a substitute for server-side enforcement. (This RLS gap is also captured in Section 2, Finding 3.)

**Open decisions (resolved 2026-10-14):** Faculty's schedule/mode decision is final (no propose/accept negotiation); the student must acknowledge the faculty's decision since they initiated the request. Meeting link/onsite location are optional fields, not required.

**Proposed minimal change:** Add nullable `scheduled_at TIMESTAMPTZ`, `consultation_mode TEXT CHECK (IN 'online','face_to_face')`, `meeting_link TEXT`, `onsite_location TEXT`, `schedule_acknowledged_at TIMESTAMPTZ`, `schedule_acknowledged_by UUID` columns via a new migration; add date/time + mode UI to the faculty resolution form; add a student acknowledgment action; display both in the summary.

**Verification tests:** Faculty can select mode + date/time on resolution; student summary reflects it on reopen and can be acknowledged; invalid mode values rejected by a DB CHECK, not just client-side; existing rows without new columns still render; existing status transitions and resolve-notification still work.

**Risk level:** Medium — no grade/record risk, but functionally absent, requires schema change, and sits on a table with disabled RLS.

---

### ASPIRE-C03 — Consultation Draft: Action Selection and Editing
**Status:** Cannot Verify as literally specified (closest functional analog is Partially Implemented)

**Current behavior observed:** No feature inside the actual Consultation module matches "Select the action(s) you intend to take" or an "Edit Action" control (zero matches searched). The closest functional analog is the **unrelated** Student Risk / Intervention Plan feature (`src/pages/faculty/StudentRiskEvaluationModal.jsx`, `student_risk_evaluations`, `faculty_intervention_drafts`) — a different screen/route (Faculty → Student Risk, not Faculty → Consultations). Whether the consultation notes actually meant this screen cannot be established from code; flagged as an interpretation gap.

In that screen: faculty build an editable task checklist with real draft/finalized tracking (`status` CHECK IN draft/submitted/acknowledged_by_student), explicit "nothing published until you confirm" copy, and a real lock point. Critically: **faculty CAN continue editing even after submission/student acknowledgment** — the current `submit_student_risk_evaluation` (`20261010120000_intervention_followup_and_task_verification.sql:396-580`) only blocks (a) un-publishing back to draft, and (b) any edit once a follow-up snapshot has been recorded. Editing after acknowledgment correctly clears `acknowledged_at` and forces re-acknowledgment (server-computed content-diff, not a client flag). Risk score/level/baseline are frozen post-publication; only feedback/plan content remains editable. Audit trail (generic `audit_business_mutation_trigger`) logs *that* `advising_plan`/`shared_academic_feedback` changed and by whom, but **not the before/after text** — no field-level amendment history.

**Evidence:** `src/pages/faculty/StudentRiskEvaluationModal.jsx:1-60,247-335,564-688`; `src/lib/interventionDraftService.js`; `supabase/migrations/20260914120000_aspire_pipeline_v3_1.sql:6-36`; `20261007120000_ai_intervention_drafts.sql:4-23`; `20261010120000_intervention_followup_and_task_verification.sql:396-580`; `20261007160000_system_wide_activity_audit.sql:1-144`.

**Gap vs. source:** If "consultation draft" means the actual Consultation feature, this is Missing there entirely. If it means the Intervention Plan screen, the literal instructional copy and a dedicated "Edit Action" control are absent, and — more importantly — **post-finalization/post-acknowledgment editing is already live behavior**, going beyond "editing before finalizing only," which the spec explicitly leaves undecided.

**Safety/compatibility findings:** Draft-vs-finalized distinction and the lock mechanism are implemented soundly. The audit-trail gap (column-level only, no value history) is a real traceability limitation if full amendment history is required — flag to project team.

**Open decisions (resolved 2026-10-14):** Confirmed: "consultation draft" maps to the Academic Intervention Form, not a new Consultations feature (Consultations is meeting logistics only; action/task review already belongs to the evaluation workflow). Post-finalization editing stays as-is — no new restriction.

**Proposed minimal change:** Add the literal instruction text ("Select the action(s) you intend to take.") and an explicit per-task "Edit" control to `StudentRiskEvaluationModal.jsx`. No change to the submit/edit/lock logic itself.

**Risk level:** Medium — mapping ambiguity itself blocks further work; underlying mechanics (whichever screen applies) are more mature than a naive read suggests.

---

### ASPIRE-C04 — Remove the 40-Character/Word Action Minimum
**Status:** Implemented (already narrowly scoped — not a blanket minimum)

**Current behavior observed:** Exactly one 40-character minimum exists in the whole codebase (exhaustive grep, no other hits). It gates `task.description` for intervention tasks in `student_risk_evaluations.advising_plan`, and **only applies when `source='ai_assisted' AND faculty_edited=false`** — i.e., only to raw, never-touched AI-generated suggestions. Enforced twice: DB trigger `validate_intervention_plan()` (`20261007120000_ai_intervention_drafts.sql:94-117`, BETWEEN 40 AND 300 at lines 101-103) and edge function pre-check (`generate-intervention-draft/index.ts:111`). **Manually-typed faculty tasks (`source='manual'`) have no minimum at all** — only non-empty + ≤500 chars (`StudentRiskEvaluationModal.jsx:309-317`). The moment a faculty member edits any field of an AI-suggested task, `faculty_edited=true` is set and the 40-300 rule no longer applies.

Concretely: "Quiz 4", "Activity 2", "Retake Exam" **can already be saved today** as manual tasks. ("Retake Exam" would separately be rejected only if ever submitted as *unedited* AI output, because of an unrelated prohibited-word filter banning "retake" — not because of the length rule.)

No other screen in the app shares this validator (checked consultation message/notes fields, class activity descriptions, working drafts, return-task notes — none have a minimum beyond non-blank).

**Evidence:** `supabase/migrations/20261007120000_ai_intervention_drafts.sql:94-117,135-138`; `supabase/functions/generate-intervention-draft/index.ts:14-15,111`; `src/pages/faculty/StudentRiskEvaluationModal.jsx:226-240,276-280,309-317`.

**Gap vs. source:** None for the actual faculty-facing workflow (manual entry already unblocked). The remaining 40-char floor only affects unedited AI output, an edge case the spec doesn't appear to be targeting literally.

**Safety/compatibility findings:** The 40-300 band is bundled in the same DB trigger as deliverable/action_type/priority/evidence-citation checks, all gated by the same `ai_assisted AND NOT faculty_edited` condition. **Do not remove the whole conditional block** if only the length rule is meant to change — that would also drop deliverable/action_type/priority/evidence validation for AI-assisted tasks.

**Decision:** No change needed — already correctly scoped.

**Risk level:** Low.

---

### ASPIRE-C05 — Interface Font Sizes and Sidebar Readability
**Status:** Partially Implemented / Missing a consistent scale

**Current behavior observed:** Tailwind v4 CSS-first `@theme` (`src/index.css:1-18`) defines color and font-family tokens only — **no font-size scale tokens exist**. Quantified: **1,046 hard-coded arbitrary pixel font-size overrides** (`text-[Npx]`) across `src/**/*.jsx` — 550× `text-[10px]`, 344× `text-[11px]`, 130× `text-[9px]`, 17× `text-[8px]`, 5× `text-[7px]`. 29 distinct files use sub-10px sizes. Spread across faculty, admin, dean, and student screens alike (heaviest: AcademicInsights.jsx 88, GradeComputationPreview.jsx 68, faculty Dashboard.jsx 66, ScoreInput.jsx 62, admin UserList.jsx 55). Sidebar (`src/components/layout/Sidebar.jsx`) mixes default-scale and arbitrary classes, and nav labels are wrapped in `truncate` — confirming the spec's clipping concern is a real, by-design risk under width pressure, not hypothetical.

**Evidence:** `src/index.css:1-18`; `src/components/layout/Sidebar.jsx:355-360,427,450-458`; grep counts above; no `tailwind.config.js` exists (v4 CSS-first config confirmed via package.json).

**Gap vs. source:** No defined scale, no consistency — ~1,046 ad hoc values including sub-10px sizes likely to be hard to read, especially on mobile/high-DPI.

**Safety/compatibility findings:** This is the *current state*, not a future risk — overrides are already scattered across 20+ files, all four roles. A real fix touches essentially every screen (wide blast radius despite the spec's "Low" priority) and would need either a codemod with visual regression testing or a phased rollout.

**Open decisions (resolved 2026-10-14):** Fix the sub-10px worst offenders only this pass. Also establish a deliberate sidebar hierarchy: module/group header labels smaller than the actual page-link labels (currently inconsistent).

**Proposed minimal change:** Define a small `--text-*` token set in `index.css`'s `@theme` block with a floor (e.g. 12px) that eliminates `text-[7px]/[8px]/[9px]` specifically; leave `text-[10px]/[11px]` alone this pass. Re-verify and fix Sidebar.jsx's group-header vs. nav-item-label sizing to establish the hierarchy.

**Risk level:** Low for data/grading correctness (purely presentational); effort/blast-radius is disproportionately large relative to its "Low" priority.

---

### ASPIRE-C06 — Student Intervention: Action Taken and Status Updates
**Status:** Implemented (substantially more built-out than a bare checkbox)

**Current behavior observed:** Tasks live as a JSONB array (`advising_plan`) inside `student_risk_evaluations` (no separate relational task table — see Gap). Status model is genuinely 3-state, not binary: **'open'** (not reported) → **'reported'** (student marked complete — explicitly NOT verified) → **'verified'** or **'returned'** (faculty decision, 'returned' requires a mandatory 1-500 char note). No first-class "Missed" or "In Progress" value exists (only a client-computed "Overdue" label from due_date).

Student path (`set_legacy_advising_task_completion` RPC, SECURITY DEFINER, student-only) **explicitly strips any prior `verification_status`** on every student write, so a student cannot forge or retain a verified state; a task already verified is immutable to the student. Faculty path (`verify_intervention_task` RPC) is restricted to the assigned, active faculty of the class. **Table grants on `student_risk_evaluations` are SELECT-only for authenticated/anon** (`20260926123000_harden_risk_evaluation_grants.sql:10-14`) — every mutation must go through these SECURITY DEFINER functions; this is a real server-side enforcement boundary, not just UI convention.

Grade linkage: exhaustive grep of `gradingMath.js` and all migrations for `advising_plan`/`followup_snapshot`/`verification_status` found **no code path writing from intervention state into any grading table**. The one grade-adjacent function (`record_intervention_followup`) is a one-time, faculty-triggered, **read-only snapshot** of already-computed/posted standing — and is **hard-blocked while any student-reported task remains unverified** ("auto-success" is explicitly prevented). UI states this to faculty directly ("Recording freezes these values permanently... It does not change any grade").

**Evidence:** `src/lib/evaluationTracking.js:58-87`; `supabase/migrations/20261010120000_intervention_followup_and_task_verification.sql:21-255`; `20261010140000_followup_requires_task_review.sql`; `20260926123000_harden_risk_evaluation_grants.sql:10-14`; `src/pages/student/FacultyAdvisingInbox.jsx`; `src/pages/faculty/EvaluatedStudents.jsx`.

**Gap vs. source:** No explicit "Missed" or "In Progress" status (only computed "Overdue"). Tasks are JSONB-embedded (string `task_id` match within one row), not a normalized child table with foreign keys — a structural difference from what the spec's data-model naming implied, though not a correctness defect for the single-evaluation-owns-its-tasks case actually implemented.

**Decision:** No change needed — already correctly implemented.

**Risk level:** Low for what exists (grade-integrity properties already enforced); Medium for the structural JSONB-vs-FK gap if cross-evaluation reporting/querying at scale is ever needed.

---

### ASPIRE-C07 — Delete Unused Grading-Sheet Columns
**Status:** Missing (feature) — with a separate, unguarded live backend exposure

**Current behavior observed:** No delete/remove affordance exists anywhere in `ScoreInput.jsx` (the faculty grading sheet) for a `class_activities` row (a "grading column") — confirmed by exhaustive search. The one existing delete feature (`GradeComputationsList.jsx` `handleDeleteTemplate`) deletes an entire admin-level template, not a per-class column, and has no NULL-vs-zero check (different feature).

**However**, the database itself permits a raw delete: RLS policy `class_activities_faculty_mutation` is `FOR ALL` (includes DELETE, `USING (is_assigned_faculty(...) OR is_active_admin())`), and `GRANT ... DELETE ON class_activities TO authenticated` is in effect. **No `BEFORE DELETE` trigger exists on `class_activities`** (unlike `student_term_scores`/`student_activity_scores`/`grade_correction_history`, which all received delete-protection triggers in the same hardening pass). `student_activity_scores.activity_id` is `ON DELETE CASCADE` — deleting a column **cascades to delete every student's real score in it**. The only protection that exists at all (`prevent_posted_activity_score_deletion` trigger) blocks the cascade **only if the term has already been officially posted** — it does not check whether any non-null/non-zero score exists for an unposted term.

NULL is correctly modeled elsewhere in this schema: "no grade recorded" is the *absence* of a `student_activity_scores` row, not a nullable column with `NULL` — the UI already deletes the row rather than writing 0 when a score is cleared. The gap is that nothing applies this as a pre-delete gate on `class_activities` itself.

**Evidence:** `src/pages/faculty/ScoreInput.jsx` (whole file, no delete path); `src/pages/faculty/GradeComponentsSetup.jsx` (inputs disabled for faculty); `supabase/migrations/20260819000000_dynamic_grading_schema.sql:34-55` (cascade FK); `20261008180000_grading_authorization_hardening.sql:309-328,513-537` (RLS+GRANT permitting delete); `20261008130000_protect_posted_term_scores_from_null.sql:92-121` (posted-term-only protection).

**Gap vs. source:** The faculty-facing, NULL-gated, confirmed, audit-logged deletion feature the spec describes does not exist. What exists instead is an **unexposed, ungoverned raw-table DELETE** reachable by any faculty/admin credential outside the UI (e.g. directly via the Supabase client), with no NULL check, that can permanently destroy real, non-zero student scores for any unposted term.

**Safety/compatibility findings:** This is a live exposure matching exactly the failure mode the spec's guardrail and [OPEN DECISION] #6 warn about — treat as a real gap to close, not merely a missing nice-to-have.

**Open decisions (resolved 2026-10-14):** Hard delete is permitted, strictly NULL-only (any recorded numeric value from 0 up to max score blocks deletion); "permanently delete" means hard-delete of `class_activities`, not a soft archive flag.

**Proposed minimal change:**
1. `BEFORE DELETE` trigger on `class_activities` blocking deletion whenever any `student_activity_scores` row exists for it.
2. Faculty-facing "Delete Column" action: confirmation modal, delete call, dedicated audit-log entry.

**Risk level: CRITICAL.** Confirmed-by-code-reading: faculty/admin credentials can destroy real, recorded student grade data outside any UI safeguard today, with no NULL-check, no confirmation, and no dedicated audit trail.

---

### ASPIRE-C08 — Student Score Breakdown: "At Risk" Label
**Status:** Partially Implemented

**Current behavior observed:** Score Breakdown is `src/pages/student/MyGradesDetail.jsx` (sidebar label "Score Breakdown" → `/student/mygradesdetail`). The "At-Risk" string renders only when `activeData.status` is `'Posted'` or `'Covered'` **and** the grade is failing. With zero posted periods, `status` is `'Pending'`, showing "Awaiting scores" instead.

**Root cause found during follow-up (live testing by the project owner reproduced "At-Risk" appearing before a period's own grade was truly posted):** a term in the `'Covered'` state (not itself posted, but folded into a combined MR/TFR posted for a different period) displays a rating computed from **live/tentative scores**, not the actual posted milestone value — yet the label ternary treats `'Covered'` the same as `'Posted'` (full-confidence wording), showing flat "At-Risk" instead of the softer tentative phrasing used for genuinely tentative data.

**Evidence:** `src/pages/student/MyGradesDetail.jsx:251-272,644-655`; `src/lib/gradeMilestones.js:103-117` (`isTermCoveredByPostedMilestone`); posted-data source `posted_grades` query at `MyGradesDetail.jsx:122-127`.

**Gap vs. source:** The spec's safety requirement ("no posted period ⇒ not labeled At-Risk") was believed satisfied by static read, but a `'Covered'`-state edge case (live-computed rating shown with full-confidence wording) produces the exact symptom the consultation is warning about.

**Safety/compatibility findings:** This is a self-contained, local computation — it does **not** call the shared risk-scoring module (`src/lib/riskEngine.js`), so editing it here is isolated and will not affect the Dean's At-Risk Students list or faculty roster risk badges. A third, distinct "At Risk" surface exists on the Student Dashboard (AI-standing card, driven by `academicPolicy.js`) — out of scope, not touched by this fix.

**Open decisions (resolved 2026-10-14):** Fix the pre-posting mislabel (the `'Covered'`-state bug); leave the genuinely-posted-and-failing case exactly as-is (current behavior there is correct and should not change).

**Proposed minimal change:**
```jsx
// before:
: (activeData.status === 'Tentative' ? 'Below passing so far' : 'At-Risk')
// after:
: (activeData.status !== 'Posted' ? 'Below passing so far' : 'At-Risk')
```
Mirrored for the passing-side branch so both use the same `!== 'Posted'` gate. Do not touch `riskEngine.js`.

**Risk level:** Low-Medium — isolated, single-component fix.

---

### ASPIRE-C09 — Department Display Name: CCS to TECH
**Status:** Partially Implemented / data largely clean, but one unconditional hardcoded literal exists

**Current behavior observed:** Literal "CCS" occurs in exactly 3 places in `src/`, zero times in `supabase/`: (1) `src/components/ExportPreviewModal.jsx:537` — `"DEAN, CCS"` on the grade-report/COG export signatory line, **fully hardcoded with no data binding at all**; (2)/(3) `src/pages/admin/UserList.jsx:1276,1564` — pure display-mapping ternaries (`'College of IT'/'College of CS' → 'CCS'`). The authoritative department name is live-fetched from the `departments` table everywhere else (FK joins). No RLS policy or SQL function anywhere compares department by name/code string — all are UUID `department_id` FK comparisons. No evidence of a denormalized department-name snapshot on any historical record — association is FK-only.

**Evidence:** `src/components/ExportPreviewModal.jsx:293,396,455,537`; `src/pages/admin/UserList.jsx:173-174,805-842,1276,1410,1564,1707,2000`; RLS/function grep across `secure_student_risk_notes.sql`, `faculty_evaluation_referrals.sql`, `sg_correction_integrity.sql`, `grading_authorization_hardening.sql`, `admin_batch3_atomic_saves.sql`, `term_rollover_grace.sql` — all UUID-only.

**Gap vs. source:** (a) 2 safe UI-literal swaps available (`UserList.jsx`). (b) The hardcoded "DEAN, CCS" line is a latent bug independent of this request — it never reads the actual department at all. (c) Because department association is FK-only with no snapshot mechanism, renaming `departments.name` relabels all historical periods with no opt-out.

**Open decisions (resolved 2026-10-14):** Rename the actual `departments` row to TECH — confirmed safe since this is a thesis prototype with synthetic data only, no real historical-preservation concern. Also add a real `short_name` column so the UI reads the abbreviation dynamically everywhere instead of hardcoding/pattern-matching department names.

**Proposed minimal change:** Add `departments.short_name`; rename the row to TECH; rewrite the two `UserList.jsx` ternaries and `ExportPreviewModal.jsx:537` to read `short_name` dynamically instead of hardcoding or pattern-matching.

**Risk level:** Medium — UI-literal portion is low risk; the data rename carries no RLS/code risk given the FK-only, synthetic-data design confirmed above.

---

### ASPIRE-C10 — Grading Template Versioning and Historical Grade Preservation
**Status:** Partially Implemented (core mechanism is real and DB-enforced; policy layer is not)

**Current behavior observed:** `class_records` (one row per subject+section+year+semester+faculty — a new term produces a new row) is the actual version-assignment key. `grading_formula_snapshot` (added on both `class_records` and `posted_grades`) freezes the formula used **once, at first official posting**, enforced by the `post_grade_milestone_atomic` RPC (first-writer-wins `WHERE grading_formula_snapshot IS NULL`, and explicitly **rejects** a submission that differs from an already-set snapshot rather than silently accepting drift). A **second, independent** enforcement layer — a `BEFORE UPDATE OF grading_formula_snapshot` trigger on both tables — blocks any attempt to change an already-set snapshot, even via a future direct `UPDATE` bypassing the RPC. Editing an **existing** template is restricted both in the UI and **independently server-side**: `save_grade_template` rejects adding/removing/renaming components on an existing template (only weight changes are allowed).

For classes that have **not yet posted anything**, live template changes immediately affect tentative/unposted views (by design, since nothing is frozen yet) — this was the spec's own open decision about effective-date policy.

**Evidence:** `supabase/migrations/20260928120000_add_grading_formula_identity_hooks.sql:31-37`; `20261008150000_atomic_grade_milestone_posting.sql:92-126,209-276`; `20261008180000_grading_authorization_hardening.sql:170-179,277-301`; `20261011140000_admin_batch3_atomic_saves.sql:24-113`; `20261007160000_system_wide_activity_audit.sql`; `src/pages/faculty/PostedGradesView.jsx:70-82,638-653,786-801`; `scripts/diffGradingSnapshot.js:1-13`.

**Gap vs. source:** The spec's primary acceptance check — historical grades and their formula must be unchanged after a template edit — **holds up under code-level scrutiny**, enforced at two independent layers. What's genuinely missing: no explicit version identifier, no effective-date mechanism (a template change applies immediately to any not-yet-posted class, including one whose term is already active and running).

**Open decisions (resolved 2026-10-14) — policy clarified further than the audit anticipated:** the project owner specified that a mid-term COG edit must apply only to the *next rolling term*, never to a currently active one — i.e., even a not-yet-posted, already-running class must be insulated from a live template edit. This is a real architecture change: move the `grading_formula_snapshot` capture from **first official posting** to **class creation**, so an active term's classes are immediately immune to any later edit. (Existing classes created before this ships keep the old first-posting fallback.)

**Proposed minimal change:** At the `class_records` insert path (classroom provisioning), resolve and populate `grading_formula_snapshot` immediately from the subject's current template, instead of leaving it `NULL` until first posting. No explicit version-number/effective-date column needed — snapshot-at-creation achieves the same guarantee without new schema.

**Risk level:** Critical priority per spec, but with the strongest evidence in this audit that the core protection is actually implemented and DB-enforced — residual risk was concentrated in undecided policy, now resolved above.

---

### ASPIRE-C11 — New Grading Template Starts Blank
**Status:** Implemented

**Current behavior observed:** `GradeComputationsList.jsx` has two independent handlers: `handleOpenNew()` fully resets all form state and `handleOpenEdit(temp)` populates from the selected template. No path exists where "Add New" carries over stale values from a previously-viewed template.

**Evidence:** `src/pages/admin/GradeComputationsList.jsx:58-90,108-109,168,284-289,333,375-378`.

**Decision:** No change needed — already implemented correctly.

**Risk level:** Low.

---

### ASPIRE-C12 — Unified Faculty Subject Roster
**Status:** Implemented, consistently, across attendance, grade-entry, assessment/analytics, and risk-evaluation

**Current behavior observed:** `enrollments` is keyed by the **class's own** `subject_id`+`section_id` (not the student's home section). Regular students get an `enrollments` row via a sync trigger on home-section assignment; irregular students get in via a faculty-approved class-join-code flow, inserting with the **class's** section_id regardless of the student's home section. "Irregular" is a derived label (`getEnrollmentType`), computed identically across all 5 checked code paths — no inconsistency found.

**Evidence:** `supabase/migrations/20261010160000_section_enrollment_sync_and_notice.sql:27-65`; `20261010150000_class_join_approval.sql`; `src/lib/classRoomService.js:17-24,362-406`; `supabase/migrations/20260606164500_add_attendance_and_semester_transition.sql:116-151`; `src/pages/faculty/ClassAttendance.jsx:177,259`; `ScoreInput.jsx:460-474,498`; `GradeComputationPreview.jsx:322-336`; `PostedGradesView.jsx:446-459`; `StudentRisk.jsx:143`; `reportsService.js:211`.

**Decision:** No change needed — already implemented correctly.

**Risk level:** Low.

---

### ASPIRE-C13 — Separate Regular and Irregular in Official Section Masterlists
**Status:** Missing (no distinct "official section masterlist" artifact exists)

**Current behavior observed:** Exhaustive search for "masterlist"/"section report"/"class list export" found **no matching feature**. All existing roster-producing code is the unified (C12) combined view.

**Important safety finding:** there is **no** filter anywhere that excludes irregular students from official records system-wide — posted grades and attendance records are keyed by student_id+class_record_id regardless of enrollment type, so irregular students' official records are preserved identically to regular students'.

**Evidence:** No "masterlist" matches in `src/`; `src/pages/admin/SectionList.jsx`, `SectionForm.jsx` (full reads, metadata only); `src/pages/dean/SummaryReports.jsx:103-142`; `src/pages/admin/UserList.jsx`; `src/components/common/EnrollmentTypeBadge.jsx` (display-only).

**Gap vs. source:** Full gap — no official regular-only section report, no separate irregular-student list/report.

**Open decisions (resolved 2026-10-14):** "Official masterlist" = the home-section roster (`users.section_id`), independent of any specific subject offering — a traditional printed class list. Irregular enrollees get a separate, per-subject companion report.

**Proposed minimal change:** New admin/registrar view with two parts: (1) a straightforward `users.section_id`-filtered regular roster, (2) a per-subject-offering irregular companion list reusing the existing `enrollments`/`getEnrollmentType` logic — never as a hard filter on any existing roster.

**Risk level:** High per spec's own priority; no evidence of active data-corruption risk today.

---

## 2. Additional Issues Beyond the Consultation Spec

### 2.1 — CRITICAL — Unrestricted `public.users` enables full privilege escalation (student → admin)
- `supabase/migrations/20260531081149_disable_rls_for_now.sql:1` disables RLS on `users` and it is **never re-enabled** in any later migration.
- No `GRANT`/`REVOKE` statement ever touches `users`.
- `users.role` is the authorization gate for the entire app (`src/lib/AuthContext.jsx:79-96`) and every server-side helper (`is_active_admin()`, `is_assigned_faculty()`, `is_authorized_dean_for_class()` — `20261008180000_grading_authorization_hardening.sql:17-61`).
- **Concrete attack:** any authenticated student can run `supabase.from('users').update({ role: 'admin' }).eq('user_id', <own uid>)` and succeed unconditionally.

### 2.2 — CRITICAL — Self-escalated "admin" fully bypasses the grade-correction approval workflow, with zero audit trail
- `enforce_sg_correction_application()` (`20261008160000_sg_correction_integrity.sql:446-449`) short-circuits every approval/match check with `IF v_role = 'admin' THEN RETURN NEW; END IF;`.
- The audit trigger `record_applied_sg_correction()` only writes to `grade_correction_history` when `last_correction_request_id` changed — this path never sets it, so the overwrite is **silently untraceable**.

### 2.3 — CRITICAL — RLS disabled and never re-enabled on several other live, actively-queried tables
- `activity_logs`, `student_consultation_requests`, `class_room_join_codes`/`class_join_requests`, `departments`/`sections`/`programs`.

### 2.4 — HIGH — RLS disabled on legacy, UI-unreferenced tables still reachable over PostgREST
- `grade_components`, `component_scores`, `class_faculty_log`, `unlock_requests`, `evaluation_forms/criteria/windows/responses/ratings/comments`, `faculty_performance_insights`.

**Resolved 2026-10-14:** confirmed synthetic/dummy data only (per the thesis's Delimitation section) — these legacy tables (2.4) are dropped rather than hardened. The admin bypass (2.2) is removed entirely and replaced with a secured, always-audited `apply_admin_grade_override` RPC (keeping the legitimate Grade Override feature working). 2.1 and 2.3 get standard RLS hardening.

### Informational / lower-confidence
- Edge functions (`create-admin-user`, `delete-admin-user`, `invoke-advisor`) correctly re-verify role server-side via the service-role key — not vulnerable the same way.
- `send-email` is appropriately gated by a worker secret, not user auth.
- Grading rounding (`gradingMath.js`) checked for unintentional cumulative drift, found none.
- `Ghost_Student_Detection_Fix_Plan.md` (parent folder): the fix it describes has already been applied in current code — resolved, not outstanding.

---

## 3. Summary

### (a) Gap matrix

| ID | Title | Status | Risk |
|----|-------|--------|------|
| C01 | Academic Period Terminology | Partially Implemented/Conflicting | Low |
| C02 | Consultation Scheduling | Missing (date/time/mode) | Medium |
| C03 | Consultation Draft Action Editing | Mapped to Intervention Form | Medium |
| C04 | 40-char Action Minimum | Implemented (already scoped away from the issue) | Low |
| C05 | Font Sizes / Sidebar | Partially Implemented, no scale | Low (but large blast radius) |
| C06 | Intervention Status Updates | Implemented | Low |
| C07 | Delete Grading Columns | **Missing feature + live unguarded delete exposure** | **Critical** |
| C08 | "At Risk" Label | Partially Implemented, real bug found | Low-Medium |
| C09 | CCS → TECH | Partially Implemented | Medium |
| C10 | Template Versioning | Core sound; snapshot-at-creation change decided | Critical priority |
| C11 | Blank New Template | Implemented | Low |
| C12 | Unified Faculty Roster | Implemented | Low |
| C13 | Official Section Masterlist | Missing | High |
| **Extra 2.1/2.2** | **users RLS disabled → admin self-escalation → grade-correction bypass** | **Live exposure** | **Critical** |
| **Extra 2.3** | **RLS disabled on activity_logs, consultations, join codes, dept/section/program** | **Live exposure** | **Critical** |
| **Extra 2.4** | **RLS disabled on legacy evaluation tables** | **Resolved: tables dropped** | **High → Closed** |

### (b) Top risks to student records and grading correctness
1. The `users` RLS gap (2.1) undermined the authorization assumption every other RLS policy in the system is built on.
2. C07's unguarded `class_activities` DELETE was a second, independent path to real, irreversible grade-data loss.
3. C13 was a missing deliverable, not a destructive bug.

### (c) Decisions — all resolved 2026-10-14
See `ASPIRE_CONSULTATION_IMPLEMENTATION_PLAN_2026-10-14.md` in this folder for the full execution plan with every decision locked in.

### (d) Read-only confirmation
**Confirmed: this audit was strictly read-only across all six investigation passes.** No files were edited, no migrations were run or modified, and no data was changed in the `sage` repository or any connected database at the time this report was produced. All findings above are derived from static inspection of source code, SQL migrations, and edge functions at commit `5891334`, plus review of the project's own plan/fix documents for cross-checking.
