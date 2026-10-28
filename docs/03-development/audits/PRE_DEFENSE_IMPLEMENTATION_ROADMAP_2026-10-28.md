# Pre Defense Implementation Roadmap - 2026-10-28

**Status:** Index only. All 7 plan docs are now drafted; none has been reviewed/approved yet, and no code, migration, or edge function exists for any of items 1-6. Each numbered item below has its own dedicated workflow-plan doc in this folder; every file listed under any of those plans still requires its own developer confirmation before it is created or edited, per `AGENTS.md`.
**Scope:** This document is a build-order index, not a feature plan. It does not describe *what* to build — each linked plan does that — it only fixes *which order* to build in, so an agent (human or AI) works from one plan at a time instead of touching the database and codebase across multiple unrelated features at once.
**Trigger:** Post-Capstone-1-defense revision items (role separation, grading hardening, consultation/dispute process, infrastructure) discussed and scoped across this conversation, ahead of the next defense milestone — hence "pre-defense."

## How to use this document

1. Work **one row at a time**, top to bottom. Do not start row *N+1* until row *N* is built, tested, and recorded per `AGENTS.md` §4.
2. Before starting a row, read its linked plan doc in full. If that plan doc doesn't exist yet, it needs to be drafted and reviewed before any code is touched for that row.
3. Update the **Status** column in this table as work progresses (`Not started` → `Drafted` → `In review` → `Approved` → `In progress` → `Done`). This file is the single place to check "what's next."
4. If a dependency isn't actually satisfied when you reach a row (e.g. the Registrar role isn't fully working yet), stop and fix the dependency first — do not route around it by building the dependent feature against a shortcut.

## Build order

| # | Plan | Plan doc | Depends on | Why this position | Status |
|---|---|---|---|---|---|
| 1 | Admin/Registrar Role Split | `ADMIN_REGISTRAR_ROLE_SPLIT_WORKFLOW_PLAN_2026-10-28.md` *(drafted)* | None | Foundational. Nothing scoped to a "Registrar" role (access control, nav visibility, RLS policies) can be built before the role itself exists. Admin's scope also narrows here (Academic Setup, Academic Terms, Grade Override move out; Admin becomes maintenance-only). | Drafted — needs review |
| 2 | System Maintenance Mode & System Health (R2) | `SYSTEM_MAINTENANCE_AND_HEALTH_WORKFLOW_PLAN_2026-10-28.md` *(drafted)* | None | Independent infrastructure work: maintenance-mode toggle (soft cutover, custom message), Supabase health dashboard, Cloudflare R2 storage migration. No feature dependency on row 1, safe to build in parallel or right after. | Drafted — needs review |
| 3 | Dynamic Grading Policy | `DYNAMIC_GRADING_POLICY_WORKFLOW_PLAN_2026-10-27.md` *(already drafted)* | Row 1 (Grading Templates ownership moves to Registrar) | The plan itself only needs an admin-editable template; now that Grading Templates lives under Registrar instead of Admin, this is the natural next step once row 1 lands, before building further on top of templates. | Drafted — needs review |
| 4 | Unified Faculty Loading & Provisioning | `FACULTY_LOADING_AND_PROVISIONING_WORKFLOW_PLAN_2026-10-28.md` *(drafted)* | Row 1 (Registrar role to scope access to), Row 3 (reads the same Grading Templates/snapshot machinery) | Can't scope the per-college lock and Registrar/Dean access to a role that doesn't exist yet. Also the one page where "load" and "provision" are unified, with the join-code removal and irregular-student manual add. | Drafted — needs review |
| 5 | Grade Lifecycle Hardening (Tentative -> Posted -> Finalized, Consultation Log) | `GRADE_LIFECYCLE_AND_CONSULTATION_LOG_WORKFLOW_PLAN_2026-10-28.md` *(drafted)* | None strictly, but logically before row 6 | Introduces the Posted-vs-Finalized distinction, the timestamped consultation window, the Grade Consultation Log, and retires the old request/approve consultation feature. The "Finalized" state has to exist before anything can dispute it. | Drafted — needs review |
| 6 | Grade Change Request System | `GRADE_CHANGE_REQUEST_WORKFLOW_PLAN_2026-10-28.md` *(drafted)* | Row 5 (gates on the Finalized state) | Broadens the existing SG-only, faculty-initiated correction into a student-initiated, evidence-gated, student -> faculty -> dean chain for any finalized milestone, with the consolidated edit-trigger living in the request list itself. | Drafted — needs review |
| 7 | AI Study Tutor (Start Tutoring mode) | `AI_STUDY_TUTOR_WORKFLOW_PLAN_2026-10-26.md` *(already drafted)* | None | Fully isolated, student-facing, own backend (`invoke-study-tutor`), own data tables, zero overlap with grading/risk/evaluation in either direction. No dependency on rows 1-6; placed last because it's the lowest-urgency item relative to the role/grading-integrity work the panel flagged, not because it's blocked. | Drafted — needs review |

## Plans drafted, pending review

All 7 plans are now drafted, each including a "Current Setup vs. New Setup" section contrasting today's flow against the proposed one. None has been reviewed or approved for implementation yet. Review order should follow the same 1-7 build order above, since later plans assume earlier ones land as designed (e.g. row 4 assumes the Registrar role from row 1 exists; row 6 assumes the Finalized state from row 5 exists). If a review changes an earlier plan's design, re-check whether that change invalidates an assumption a later plan already made.

Two cross-plan open decisions surfaced during drafting and are not yet resolved in any single plan:
- **Unit-load cap** (affects row 4's Load Summary "over-limit" flag) — no such cap exists in the schema today; needs a number from the developer.
- **R2 vs. Supabase Storage scope** (affects rows 2 and 6) — whether Cloudflare R2 replaces the existing `avatars` bucket too, or only handles new upload types like grade-change evidence. Row 2's plan deliberately defers the final call to row 6; row 6's plan defers back to row 2. This needs a developer decision before either plan's storage section can be implemented.
