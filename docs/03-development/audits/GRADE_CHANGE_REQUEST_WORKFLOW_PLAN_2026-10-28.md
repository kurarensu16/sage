# Grade Change Request Workflow Plan - 2026-10-28

**Status:** Proposed design. No code or migration exists yet for the broadened scope described here. Every file listed under "Suggested build order" still requires its own developer confirmation before it is created or edited, per `AGENTS.md`.
**Scope:** Broadens the existing `remark_override_requests` / SG-correction system (`src/lib/gradeCorrectionService.js`, `src/pages/dean/RemarkOverrideRequests.jsx`, `submit_sg_correction_request` / `review_sg_correction_request` / `apply_approved_sg_correction_v2`) from **Semestral Grade only** into a request available for **any finalized milestone** (MR, TFR, or SG), with a student-initiated, evidence-gated entry point and a consolidated faculty edit trigger. Does **not** touch `src/pages/admin/GradeOverride.jsx` (the admin emergency override) — see "Explicitly out of scope," below. Does not redesign the Tentative/Posted/Finalized state machine itself — that is roadmap item #5 (`GRADE_LIFECYCLE_AND_CONSULTATION_LOG_WORKFLOW_PLAN_2026-10-28.md`); this plan only gates on a milestone's `Finalized` state existing.
**Trigger:** Capstone defense panel item 3.3 ("harden the process for changing a finalized grade") plus this conversation's follow-on decisions: broaden the dispute chain from SG-only to any milestone, require evidence/media (not just a text reason), and consolidate the faculty edit action into the request list itself instead of a prompt on the posted-grade view.
**Depends on:** Roadmap item #5 (Grade Lifecycle Hardening) for the `Finalized` state a request gates on. See `PRE_DEFENSE_IMPLEMENTATION_ROADMAP_2026-10-28.md`.

## Current Setup vs. New Setup

| | **Today (Current Setup)** | **After this plan (New Setup)** |
|---|---|---|
| **When a correction can happen** | Only at the end of term, on the Semestral Grade (SG). MR and TFR have no correction path at all — if either is wrong, there is nothing to click. | Any finalized milestone — MR, TFR, or SG — once that specific milestone's status is `Finalized` (roadmap item #5). A wrong MR no longer has to wait until SG to get fixed. |
| **Who can start it** | Faculty only. `submitSgCorrectionRequest()` (`src/lib/gradeCorrectionService.js`) is called from faculty-side UI; there is **no student-facing submission path at all** — a student who disagrees with a grade has no self-service way to raise it inside the system. | Student-initiated. The student opens **Grade Change Requests → Submit Request** and files the dispute themselves. Faculty no longer has to notice the problem first. |
| **What's required to submit** | A free-text `note` field only (`remark_override_requests.note`), plus an optional `evidence_url` the faculty pastes in. No categorization of *why*. | A required **reason type** from a fixed set (computation error, missing/incorrect score, technical issue, other), a free-text explanation, and a **file/media evidence upload** — not optional, not just a pasted link. |
| **Approval chain** | Faculty submits → Dean approves/rejects (`review_sg_correction_request`). Two steps, one of them already faculty. | Student submits → **Faculty validates first** (new step — can reject outright if clearly invalid, or forward) → Dean approves/rejects. Three steps; Faculty becomes a gatekeeper on student-raised disputes instead of the originator. |
| **Where the edit actually happens** | After Dean approval, the faculty edits from a prompt/indicator on the **Class Record / posted-grade view** (`src/pages/faculty/PostedGradesView.jsx` or the gradebook) — the request list itself is just a status board. | The prompt on the posted-grade view is **retired**. The edit trigger moves entirely into **Grade Change Requests → Forwarded to Dean**: faculty clicks the row once it shows `Approved`, and the edit modal opens from there. The gradebook no longer initiates anything for this flow. |
| **Recompute scope** | Only SG requests exist today, so only the SG cascade (`aspire_sync_corrected_progress_milestones()`) applies — by default, everything cascades. | SG requests keep the exact same cascade, unchanged. MR-only and TFR-only requests are new and are **isolated** — they recompute only that milestone, with no automatic forward cascade (Part 3). |
| **Nav placement** | Dean has a single item, "SG Correction Requests" (`RemarkOverrideRequests.jsx`), nested under Grades. Faculty has nothing dedicated — the only faculty-side touchpoint is the gradebook prompt. Student has nothing at all. | A standalone, identically-named **"Grade Change Requests"** group promoted to the top level on all three portals (Part 5) — not nested under Grades/Student Support/Courses & Grades. |
| **Which files this touches** | — | `src/pages/dean/RemarkOverrideRequests.jsx` is **renamed/restructured in place** to serve the broadened "Pending Approval" + "History" views — it is not replaced wholesale, since it already renders the right shape (stats strip, filter tabs, expandable rows). `src/lib/sgCorrectionPosting.js` and `aspire_sync_corrected_progress_milestones()` are **reused unchanged** for the SG path. Student's Submit Request page and Faculty's Pending Review queue are **net-new files** — nothing today occupies that role. |
| **Admin Grade Override** | `src/pages/admin/GradeOverride.jsx` is a separate emergency path, outside this chain entirely. | **Unchanged.** Not renamed, not merged, not rerouted through `remark_override_requests`. See "Explicitly out of scope," below — this is worth repeating because it is the item most likely to get conflated with this plan during implementation. |

## What already exists (today's SG-only flow)

| Piece | File | Role |
|---|---|---|
| Table | `remark_override_requests` (`supabase/migrations/20260603030000_create_remark_override_requests.sql`) | One row per correction request: `status` (`pending`/`approved`/`rejected`, `CHECK`-constrained), `posted_grade_id`, `student_id`, `class_record_id`, `note` (faculty's reason — free text only, no type), `evidence_url`, proposed vs. original vs. final grade/remark columns, `proposed_score_changes` jsonb, `correction_scope`. |
| Submit | `submitSgCorrectionRequest()` → RPC `submit_sg_correction_request` | **Faculty-initiated only** today — there is no student-facing submission path. |
| Review | `reviewSgCorrectionRequest()` → RPC `review_sg_correction_request`, surfaced in `src/pages/dean/RemarkOverrideRequests.jsx` | Dean approves/rejects. Approval does **not** unlock the grade automatically — it authorizes one subsequent edit. |
| Apply | `applyApprovedSgCorrection()` → RPC `apply_approved_sg_correction_v2` | Where the faculty actually submits the new score row once approved. Today this is triggered from the gradebook/Class Record posted-grade view, not from the request list. |
| Cascading recompute | `aspire_sync_corrected_progress_milestones()` (`supabase/migrations/20261024093000_cascade_corrected_grade_milestones.sql`) | Already walks an SG correction back through MR/TFR and recomputes forward — this is the exact mechanism Part 3 below reuses for SG-scoped requests, unchanged. |
| Client helper | `planSgCorrectionPosting()` (`src/lib/sgCorrectionPosting.js`) | Matches an approved request to its posted-grade row before a repost; only consumes already-approved requests, never substitutes proposed values itself (the RPC recalculates server-side). |

Today's flow is: Faculty notices an issue → Faculty submits with a free-text reason and optional evidence URL → Dean approves/rejects → Faculty edits from the gradebook. Three things change in this plan: **who can start it** (student, not just faculty), **what "it" covers** (any finalized milestone, not just SG), and **where the edit happens** (the request list, not the gradebook).

## Explicitly out of scope: Admin Grade Override

`src/pages/admin/GradeOverride.jsx` (RPC `applyAdminGradeOverride`, `src/lib/gradePostingService.js`) is a **separate, untouched** feature: a direct admin correction of a posted SG, bypassing this entire chain, for cases the formal workflow can't reach. This plan does not rename it, does not route it through `remark_override_requests`, and does not change its RPC. The two systems stay parallel, not merged — a reviewer should treat any PR that touches `GradeOverride.jsx` under this plan's name as scope creep.

## Part 1 — Student-initiated submission, any finalized milestone

### Design

- New RPC `submit_grade_change_request` (or extend `submit_sg_correction_request` with a `p_grade_period` parameter — developer's call at build time) accepts `student_id` (self, from the authenticated session — not passed as an arbitrary parameter), `posted_grade_id`, `reason_type`, `reason_detail`, `evidence_url`.
- **Gate:** the RPC must reject the call unless the target `posted_grades` row's milestone is `Finalized` per roadmap item #5's state machine. A `Posted — Not Finalized` grade is not disputable here — that's what the Grade Consultation Log (item #5) is for.
- **Reason type** is a fixed enum, not free text alone: `computation_error`, `missing_or_incorrect_score`, `technical_issue`, `other`. Add as a `CHECK`-constrained column (mirrors the existing `status` column's pattern) alongside a required `reason_detail` free-text field and the existing `evidence_url`.
- **Milestone awareness:** the row must record which milestone it targets (`grade_period`: `midterm_rating` | `tentative_final_rating` | `semestral_grade`, reusing `GRADE_MILESTONES` from `src/lib/gradeMilestones.js`) since Part 3's recompute behavior depends on it.
- Evidence upload: this plan assumes a file/media attachment, not just a pasted URL. **Which storage backend holds that file is an open question shared with roadmap item #2** (`SYSTEM_MAINTENANCE_AND_HEALTH_WORKFLOW_PLAN_2026-10-28.md`'s Supabase Storage vs. Cloudflare R2 decision) — do not hardcode a bucket name here before that's resolved; `evidence_url` stays a plain string column either way, so the schema itself doesn't block on the answer.

### Table change

```sql
ALTER TABLE public.remark_override_requests
  ADD COLUMN IF NOT EXISTS reason_type VARCHAR(30)
    CHECK (reason_type IN ('computation_error', 'missing_or_incorrect_score', 'technical_issue', 'other')),
  ADD COLUMN IF NOT EXISTS grade_period VARCHAR(30),
  ADD COLUMN IF NOT EXISTS submitted_by_role VARCHAR(10) DEFAULT 'faculty'
    CHECK (submitted_by_role IN ('student', 'faculty'));
```

`submitted_by_role` exists so the review UI (Part 2) can tell a student-raised dispute from a faculty-raised one in the same table, without a second table.

## Part 2 — Chain: Student -> Faculty -> Dean

Status progression on `remark_override_requests.status`, extended beyond today's `pending`/`approved`/`rejected`:

```
pending_faculty_review   (student submitted; faculty has not acted)
        |
        v  faculty validates (same note/attach pattern faculty already uses)
pending_dean_review      (forwarded; mirrors the grade_resubmission_requests sketch
                           in docs/02-thesis/defense/CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md
                           section 4 -- status 'pending_dean', superseded by this richer chain)
        |
        v  dean decision
approved  ------------------------>  faculty edits (Part 4)  ------>  applied
        |
        v
rejected
```

Faculty's validation step is a lightweight gate, not a second full review: reject outright if the dispute is clearly invalid (e.g. wrong class, duplicate), or forward to Dean with an optional faculty note. This reuses the existing `dean_note`-style column pattern already on the table (add a parallel `faculty_note`), rather than inventing a new notes table.

## Part 3 — Recompute scope: SG cascades, MR/TFR don't

This is the one rule to get exactly right, per this conversation's explicit confirmation:

- **Request targets SG** → correction is allowed to reach back into MR/TFR components too, and keeps the existing `aspire_sync_corrected_progress_milestones()` cascading behavior verbatim: full forward recompute MR → TFR → SG. No change to this function.
- **Request targets MR or TFR only** → the correction and its recompute are **isolated** to that one milestone. It does **not** automatically cascade forward — a TFR fix does not auto-recompute SG, an MR fix does not auto-recompute TFR. If a later milestone also needs correcting as a result, that is a **separate request**, submitted (and finalized-gated) independently.
- Either way, **the recompute is always a full recompute** of the affected milestone from its component scores — never a partial patch applied on top of the old value. For SG this means routing through the existing `apply_approved_sg_correction_v2` path unchanged. For MR/TFR, a new, narrower RPC (e.g. `apply_approved_milestone_correction`) is needed that performs the equivalent full recompute for just that one `posted_grades` row and explicitly does **not** call `aspire_sync_corrected_progress_milestones()`.

```sql
-- Illustrative only — exact signature decided at build time
CREATE OR REPLACE FUNCTION public.apply_approved_milestone_correction(
  p_operation_id uuid,
  p_request_id uuid,
  p_score_changes jsonb
) RETURNS jsonb AS $$
  -- Must assert request.grade_period IN ('midterm_rating', 'tentative_final_rating')
  -- before running — a semestral_grade request is rejected here and routed to
  -- apply_approved_sg_correction_v2 instead, so the two recompute paths can
  -- never be cross-called by mistake.
$$ LANGUAGE plpgsql;
```

## Part 4 — Consolidated edit trigger (retires the old gradebook prompt)

**Old flow (retired by this plan):** faculty sees a prompt/indicator on the Class Record / posted-grade view (`src/pages/faculty/PostedGradesView.jsx` or the class record screen), clicks it there, gets the edit modal.

**New flow:** once Dean approves, the request's row flips to `Approved` inside Faculty's own **Grade Change Requests → Forwarded to Dean** list (Part 5's nav). Faculty clicks that approved row — not anything on the gradebook — and a modal opens pre-filled with the current grade/components for that student/milestone. Faculty edits, saves; save calls Part 3's recompute (`apply_approved_sg_correction_v2` or the new milestone-scoped function depending on `grade_period`), which propagates to every existing consumer of that posted grade: `src/lib/riskEngine.js` (risk scoring), Dean reports/distribution (`src/lib/reportsService.js`, `DeanCharts.jsx`), the student's Grade Report, and the audit log (`logActivity`, same pattern `RemarkOverrideRequests.jsx` already uses). On success the request's status becomes `applied` (reusing the exact value `RemarkOverrideRequests.jsx` already displays) and moves to **History**.

`src/pages/faculty/PostedGradesView.jsx` loses whatever prompt/button currently opens the override modal from that screen — grep at implementation time for the exact call site before removing it, so nothing else depends on it.

## Part 5 — Dedicated "Grade Change Requests" nav, all three sides

Promoted to a standalone top-level nav group on each portal — not nested under Courses & Grades (Student), Student Support (Faculty), or Grades (Dean):

| Portal | Group | Items |
|---|---|---|
| Student | Grade Change Requests | Submit Request (enabled only once a milestone shows Finalized); My Requests (status tracking) |
| Faculty | Grade Change Requests | Pending Review; Forwarded to Dean (where Approved rows open Part 4's edit modal); History |
| Dean | Grade Change Requests | Pending Approval; Approved / Rejected History |

`src/pages/dean/RemarkOverrideRequests.jsx` is the file that gets renamed/repurposed for the Dean's "Pending Approval" + "History" views (it already renders exactly this shape — stats strip, filter tabs, expandable rows); it is not replaced wholesale. A new Student-side submission page and a new Faculty-side "Pending Review" queue are net-new files. `src/pages/admin/GradeOverride.jsx` is untouched (see "Explicitly out of scope").

## Worked example

Reyes's TFR for ITC113 finalizes on a Friday. The following Tuesday, Reyes notices a lab score was recorded as 15/20 when the actual activity sheet shows 18/20.

1. Reyes opens **Grade Change Requests → Submit Request** (enabled because TFR shows `Finalized`), selects reason type **Missing or Incorrect Score**, writes a detail, attaches a photo of the graded activity sheet. Status: `pending_faculty_review`.
2. Faculty reviews in **Grade Change Requests → Pending Review**, confirms the activity sheet matches, adds a short faculty note, forwards to Dean. Status: `pending_dean_review`.
3. Dean reviews in **Grade Change Requests → Pending Approval**, approves. Status: `approved`.
4. Faculty's **Grade Change Requests → Forwarded to Dean** now shows this row as `Approved`. Faculty clicks it, the modal opens with Reyes's current TFR components, faculty corrects the lab score to 18/20, saves.
5. Because this request is scoped to **TFR, not SG**, the recompute is isolated: TFR recalculates in full from its components, but SG (not yet posted) is untouched and will simply be computed normally from the corrected TFR when that milestone is reached later — no separate cascade is fired. Status: `applied`, row moves to Faculty's **History** and Reyes's **My Requests**.
6. Three weeks later at SG time, a separate issue is found in a Prelim exam score. That is a **new, independent SG-scoped request** — because it targets SG, approving and applying it *would* cascade back through MR/TFR per Part 3's SG rule, unchanged from today's existing behavior.

## Open decisions (confirm before any file is touched)

1. New dedicated RPC (`submit_grade_change_request`) vs. extending `submit_sg_correction_request` with a milestone parameter — the worked SQL above assumes extension of the existing table, but the RPC split is still an open call.
2. Exact reason-type enum values — the four listed (`computation_error`, `missing_or_incorrect_score`, `technical_issue`, `other`) are a starting proposal, not finalized vocabulary.
3. Evidence storage backend (Supabase Storage bucket vs. Cloudflare R2) — explicitly deferred to roadmap item #2; this plan's schema does not block on the answer, but the upload UI implementation does.
4. Whether `apply_approved_milestone_correction` (the new MR/TFR-scoped recompute) is one shared function branching on `grade_period`, or two separate functions — the SQL sketch above shows one function with an assertion guard, but this is a build-time call.
5. Rate limiting / abuse prevention for student-initiated submissions (e.g. one open request per posted_grade_id at a time) — not addressed above, needs a decision before Part 1 ships.

## Suggested build order

1. Migration: `reason_type`, `grade_period`, `submitted_by_role`, `faculty_note` columns on `remark_override_requests`; extended `status` `CHECK` constraint covering the new chain states; new or extended submission RPC; new `apply_approved_milestone_correction` RPC with its `grade_period` guard — developer applies manually.
2. `src/lib/gradeCorrectionService.js` — new `submitGradeChangeRequest()` (student-callable) alongside the existing faculty-facing functions; extend `reviewSgCorrectionRequest`-equivalent for the faculty-validation step.
3. Student: new Submit Request page, gated on milestone `Finalized` state from roadmap item #5; new My Requests list.
4. Faculty: new Pending Review queue; repurpose the "Forwarded to Dean" and "History" views, consolidating the edit-trigger per Part 4; remove the retired prompt from `PostedGradesView.jsx`.
5. Dean: repurpose `RemarkOverrideRequests.jsx` for the broadened scope (any milestone, not SG-only) and the renamed chain states.
6. Propagation check: `riskEngine.js`, `reportsService.js`, `DeanCharts.jsx`, student Grade Report, audit log — confirm all read the post-correction value with no separate cache to invalidate.
7. Nav: add the three "Grade Change Requests" groups per Part 5, each as a standalone top-level group.
8. Verification: extend `npm run verify:grading` with fixtures for an MR-only correction (confirms isolation — TFR/SG unaffected) and an SG correction (confirms the existing cascade still fires unchanged); manual click-through of the full worked example above.
9. Change record in `docs/05-operations/agents/feature-updates/` once implemented and approved, plus a `docs/README.md` index update for this doc.

Each step remains subject to its own per-file confirmation before editing, per `AGENTS.md`.
