# ASPIRE Capstone Paper Audit — Chapters 1–2 vs. Codebase

**Date:** 2026-10-04
**Paper audited:** `ASPIRE-Chapter_1-2_REVISED_v3_concise - Copy.docx` (Chapters 1–2 + References)
**Codebase:** working tree at `c:\Users\JC Gabriel\Downloads\New ASPIRE\sage` (branch `ghost`)
**Rule applied:** the code is the source of truth. Paper citations are `Chapter > Section > ¶ (Pn)`; code citations are `path:line`.

---

## 1. Summary

Overall the paper is **substantially aligned** with the built system: the four-role architecture, the grading milestone math (MR/TFR/SG, regular vs. summer, null-exclusion), the transmutation scale, the five COG templates, the risk tier boundaries, the HITL review-before-release workflow, the deterministic-engine/advisory-AI split, and the evaluation methodology all match the code. However, there are **four high-severity mismatches** a defense panelist with code or database access would catch, plus several medium/low documentation drifts.

The high-severity issues are: (1) the **GWA Deficit risk-factor scaling** in the paper (Table 2.5 and its worked examples) does not match the engine, which also appears to contain an implementation bug; (2) the AI model is named throughout as **Google Gemini 2.5 Flash** but the deployed default is `poolside/laguna-s-2.1:free` with a Llama-3 fallback; (3) the paper claims **RLS on "all tables"** but RLS is enabled only on a sensitive subset and disabled on core tables (users, posted_grades, activity_logs); (4) the **ERD/DFD name five tables that do not exist** (intervention_tasks, intervention_escalations, advisor_insights, advisor_action_items, advisor_outcomes) — those features are stored as JSONB columns and a boolean flag inside a single `student_risk_evaluations` table.

**Counts by issue type:** Incorrect = 4 · Partially implemented = 2 · Outdated = 3 · Inconsistent term = 2 · Undocumented feature = 3 · Unverified = 0 *(Finding 6 verified in the UI; Finding 13 confirmed by the author — Vercel is in use).*
**Counts by severity:** High = 4 · Medium = 7 · Low = 4.

---

## 2. System Inventory (condensed, from code)

**Tech stack (actual, from `package.json`):** React 19.2 + Vite 8, React Router 7, Supabase JS 2.106 (PostgreSQL + Auth), Recharts 3, xlsx/xlsx-js-style, html2pdf.js, lucide-react, Capacitor 8 (Android: push/local-notifications, filesystem, network, share). Deploy config: `vercel.json`. No test framework; grading has a hand-rolled verifier (`scripts/verifyGradingMath.js`).

**Roles / portals (`src/App.jsx:111,130,144,163`):** exactly four RBAC roles — `admin`, `dean`, `faculty`, `student` — each behind a `RoleGuard`, plus public (login/reset) and a shared Settings page. **No `office` portal exists** (contrary to the repo's own `AGENTS.md`). Guardian is **not** a login role; it is student contact info + a notification recipient.

**Modules actually built:**
- **Admin (15 routes):** Dashboard, User list/form, **spreadsheet (xlsx) bulk import** (`UserList.jsx:6`), Grade Override, Audit Log, Subjects, Sections, Departments, Grade Computations (templates), Classroom Provisioning, Term Management, Notifications, Settings.
- **Dean (8 routes):** Dashboard, Grade Posting Status, Remark/Override Requests (grade corrections), Grade Distribution, At-Risk Students (with `escalatedcases`→*discussion_queue* and `interventionresults`→*outcomes_tracker* tabs), Summary Reports, Notifications, Settings.
- **Faculty (13 routes):** Dashboard, Class Records, Grade Components Setup, Score Input (Log Class Scores), Grade Computation Preview, Posted Grades, At-Risk Students, Evaluate Student (HITL modal), Consultations, Enrollment Requests, Class Attendance, **Class Performance report**, **Performance Comparison report**, Notifications, Settings.
- **Student (11 routes):** Dashboard, My Subjects, My Grades (list/detail), Faculty Advising Inbox, **Academic Insights (“Ask ASPIRE” advisor)**, Consultations (**standalone page**), Notifications, Attendance, Settings.

**Core logic:**
- **Grading engine** (`src/lib/gradingMath.js`, `gradeMilestones.js`, `academicPolicy.js`, `officialGradingPresets.js`): weighted term rating from a DB-resolved formula; MR/TFR/SG with `Math.round` at each step; summer 2-period branch; unencoded period = `null` and excluded; transmutation ladder 98→1.00 … 75→3.00, <75→5.00. Verified by `scripts/verifyGradingMath.js` (passes).
- **Risk engine** (`src/lib/riskEngine.js`): additive 4-factor model `MIN(100, GWA + Attendance + MissingWork + Trajectory)`; ceilings 60/50/15/10 (raw max 135); tiers Low 0–24 / Moderate 25–49 / High 50–74 / Critical 75–100 (`academicPolicy.js:21`).
- **AI advisor**: client `src/lib/openrouter.js` → Supabase Edge Function `supabase/functions/invoke-advisor/index.ts`; student-only (`:261`); OpenRouter; **default model `poolside/laguna-s-2.1:free`, fallback `meta-llama/llama-3-8b-instruct:free`** (`:5,:318`); structured-JSON output with forced boundary statement; deterministic fallback in `advisingEngine.js`/`openrouter.js`. Branded **“Ask ASPIRE.”**
- **Notifications**: full schema (notifications, deliveries, preferences) + **email + guardian** delivery (edge fn `send-email`, migrations `20261002090000`, `20261003110000`).

**Key tables that exist (migrations):** users, departments, programs, sections, academic_terms, student_term_details, class_records, class_faculty_log, enrollments, class_room_join_codes, class_join_requests, subjects, grade_computations, grade_computation_components, class_activities (title+description), student_activity_scores, posted_grades, unlock_requests, remark_override_requests, **student_risk_evaluations** (holds risk_breakdown, professor_notes, `advising_plan` JSONB tasks, baseline/followup snapshots JSONB, `refer_to_dean` flag), student_risk_private_notes, student_consultation_requests, student_academic_insights, faculty_performance_insights, attendance_records, notifications, activity_logs, guardians.

**Tables named in the paper that do NOT exist:** `intervention_tasks`, `intervention_escalations`, `advisor_insights`, `advisor_action_items`, `advisor_outcomes` (0 migrations, 0 code references).

**Dormant / unused schema (0 code references):** `evaluation_forms/windows/criteria/responses/ratings/comments` (a student↔faculty evaluation system — explicitly delimited OUT of the paper, and indeed unused), `ai_faculty_predictions`, `ai_student_recommendations`, `component_scores`, `grade_components`.

**Stubbed / limited:** “sustained decline” trajectory sub-rule not implemented (Finding 5). *(Health Sciences RLE is NOT limited — multi-bucket grading is supported in both the engine and the faculty UI; see Finding 6.)*

---

## 3. Objectives Checklist (¶P81–P87)

| # | Objective | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Four-role web app on centralized cloud DB under unified RBAC | **Implemented** | `src/App.jsx:111–175`; `supabase.js`; `AuthContext.jsx` |
| 2 | Grading engine: per-subject COG template, regular+summer terms, transmute to 1.00–5.00 with intermediate rounding | **Implemented** | `gradingMath.js:325,421`; `officialGradingPresets.js`; `verifyGradingMath.js` passes |
| 3 | Composite risk score 0–100 (GWA/Attendance/Missing/Trajectory, per-factor ceilings, clickable breakdown) → sorted triage + HITL modal (observations, 2–3 tasks, baseline, escalate) | **Implemented, but factor math differs from the paper** | `riskEngine.js:64–200`; `StudentRiskEvaluationModal.jsx`; **GWA scaling mismatch — Finding 1**; trajectory sub-rule partial — Finding 5 |
| 4 | Mandatory activity title/description → ground AI advisor; GWA/PL forecast; deterministic fallback | **Implemented** (title+description mandatory `20260914120000:64–66`); forecast `gradingMath.js:474,497` | AI default model is **not** Gemini — Finding 2 |
| 5 | Faculty→Dean escalation queue + dual-tier Risk & Honors matrix; baseline/followup snapshots → GWA change, risk transition, task completion | **Implemented** (stored differently) | `dean/AtRiskStudents.jsx`; `riskEngine.js:333`; escalation = `refer_to_dean` flag, not a table — Finding 4 |
| 6 | Dean-approval grade resubmission workflow + system-wide activity log | **Implemented** | `dean/RemarkOverrideRequests.jsx`; `remark_override_requests`, `unlock_requests`, `activity_logs`; `auditLog.js` |
| 7 | TAM (PEOU/PU) + ISO/IEC 25010:2023 nine-characteristic evaluation | **Not code-verifiable** (methodology; instruments live outside the repo) | n/a — survey design, not system behavior |

---

## 4. Findings Table

| # | Chapter > Section | Issue type | Paper says | System actually does | Evidence | Severity |
|---|---|---|---|---|---|---|
| 1 | 2 > Academic Risk Score Spec > Factor 1 – GWA Deficit (P282–P284; also P280, P296) | Incorrect | GWA 2.01–3.00 → **0–25 pts (linear)**; 3.01–5.00 → **26–60 pts (linear)**; examples: 2.25→6, 2.50→13, 3.00→25, 4.00→43, 5.00→60; a GWA of ~**4.41** alone reaches High | Code: 2.01–3.00 → **25–35 pts** (`25+round((g−2)·10)`); 3.01–5.00 → **50–60 pts** (`50+round((g−3.01)/1.99·10)`); actual: 2.25→28, 2.50→30, 3.00→35, 4.00→55, 5.00→60; a GWA of **3.01** alone already reaches High (50 pts). Note: code contradicts its own docstring — likely a bug | `riskEngine.js:81–95`; docstring `:36–37` says “2.01→1pt…3.00→25pts / 3.01→26pts” | **High** |
| 2 | 1 > RRL > AI-Assisted Advising (P58, P62); 2 > Methodology Phase 1 (P199); Dev Stack (P331); Table 2.10 (P340); References (P427) | Incorrect | AI Academic Advisor is **Google Gemini 2.5 Flash** by default, via OpenRouter | Default model is **`poolside/laguna-s-2.1:free`**, OpenRouter fallback **`meta-llama/llama-3-8b-instruct:free`**; model is env-overridable (`OPENROUTER_MODEL`) | `supabase/functions/invoke-advisor/index.ts:5,318` | **High** |
| 3 | 1 > RRL > Data Privacy (P47); 2 > ERD L4 (P320); 2 > ISO Security (P373) | Incorrect / Overstated | “ASPIRE enforces Supabase Row Level Security (RLS) **on all tables**” | RLS enabled only on a sensitive subset (risk evals, private notes, notifications + prefs/deliveries, attendance, academic_terms, guardians, student_term_details). **Disabled** on users, posted_grades, activity_logs, enrollments, subjects, class_records, grade_computations, etc. | `supabase/migrations/20260531081149_disable_rls_for_now.sql`; enables in `20260926120000`, `20261001150000`, `20261001170000`, `20261003110100` | **High** |
| 4 | 2 > Database Design > ERD L4 (P320); DFD Student (P248); DFD Dean (P256); DFD Faculty (P252) | Incorrect | Separate tables: **INTERVENTION_TASKS** (“stores only workflow events… derived at read time”), **INTERVENTION_ESCALATIONS** (disposition pending/acknowledged/resolved/dismissed), **ADVISOR_INSIGHTS / ADVISOR_ACTION_ITEMS / ADVISOR_OUTCOMES** | None of these tables exist. Tasks = `advising_plan` JSONB array (objects with `completed`/`completed_at`); escalation = `refer_to_dean` boolean + `dean_note`/`dismissed_at` columns; both inside **`student_risk_evaluations`**. Advisor logs go to `student_academic_insights` | `20260914120000_aspire_pipeline_v3_1.sql:6–42` (advising_plan `:24`, snapshots `:30–31`, refer_to_dean `:34`); grep: the five tables = 0 refs | **High** |
| 5 | 2 > Risk Spec > Factor 4 – Trajectory (P293) | Partially implemented | Two sub-rules: **Latest decline** AND **Sustained decline** (3 ratings, two consecutive declining segments), factor “takes the greater of the two scores” | Engine computes **latest decline only** (delta of the two most recent ratings). No sustained-decline / three-rating logic exists anywhere | `riskEngine.js:134–156`; grep “sustained” = 0 hits | **Medium** |
| 6 | 2 > Grading Engine > Component Weighting (P267) | Outdated (verified) | Health Sciences RLE template “currently computes with the **General Education Core distribution**, a documented limitation” | The engine has multi-bucket support: `calculateStoredTermRating` maps ≥2 repeatable components by `componentId` and errors if uncategorized — it does **not** fall back to GenEd weights. The RLE preset carries its true 50/20/20/10 weights. **UI verified:** a required “Grading Component” dropdown appears whenever a formula has >1 repeatable bucket, and saving is blocked until a component is chosen | `gradingMath.js:169–222`; `officialGradingPresets.js:28–37`; `ScoreInput.jsx:2480–2499, 2650–2670, :934, :1060, :2549` | **Medium** |
| 7 | Throughout Ch1–2 (e.g., P24, P30, P45, P106, P220) | Inconsistent term | “AI Academic Advisor” (Ch1) and “AI Study Advisor” (Scope/Ch2) | UI brands it **“Ask ASPIRE,”** and the student page is **“Academic Insights”** (route `/student/academic-insights`) | `invoke-advisor/index.ts:202`; `openrouter.js`; `src/pages/student/AcademicInsights.jsx`; `App.jsx:169` | **Medium** |
| 8 | 1 > Scope > Faculty Portal (P111–P129) | Undocumented feature | Faculty modules listed: Dashboard, Grades, Classes, Student Risk, Attendance, Consultations, Account | Faculty portal also ships **Class Performance** and **Performance Comparison** report pages | `App.jsx:156–157`; `faculty/ClassPerformance.jsx`, `faculty/PerformanceComparison.jsx` | **Medium** |
| 9 | 1 > Scope (all portals); Delimitation (P163) | Undocumented feature | Four roles; notifications to users; no mention of guardians | A **guardian** feature exists: guardian contact capture, guardian-targeted **email notifications**, guardian self-service + admin access | migrations `20261002080000`, `20261002090000`, `20261003110000`, `20261003110100`; `components/student/GuardianInfoGate.jsx`; `send-email` edge fn | **Medium** |
| 10 | 1 > Scope > Student > Consultations (P108) | Outdated | “Request a Consultation … (accessed **as a tab in the AI Study Advisor**)” | Consultations is a **standalone module/page** (`/student/consultations`); decoupled from the advisor (commit `6aee7b7`) | `App.jsx:170`; `student/Consultations.jsx:17` | **Low** |
| 11 | 2 > Methodology > Phase 5 Implementation (P207) | Inconsistent term | “mandatory Activity Title and **Scope** metadata” | Mandatory fields are Activity **Title** and **Description** (no “Scope” field); every other section of the paper says “Description” | `class_activities` cols `20260914120000:64–66`; paper P40, P101, P115 | **Low** |
| 12 | 2 > ERD L4 (P320) | Incorrect | “INTERVENTION_TASKS stores only **workflow events** (assignment, submission, verification, revision, cancellation)… status derived at read time” | Tasks are a JSONB array of task objects carrying a `completed` boolean + `completed_at`; not an append-only event log | `20260914120000:24–27` | **Low** |
| 13 | 2 > Dev Stack / Tools (P331, P340) | ~~Unverified~~ **RESOLVED** | Versioned in Git on GitHub, **deployed on Vercel** | ✅ **Confirmed accurate by the author** — Vercel deployment is in use. `vercel.json` present and Capacitor configured | `vercel.json`; `capacitor.config.json`; author confirmation | **Closed** |
| 14 | 1 > Scope > Admin > Import Users (P150) | Inconsistent term | “Import Users (**CSV**)” | Bulk import is implemented through the **xlsx** (spreadsheet) library; functionally equivalent but not strictly CSV | `admin/UserList.jsx:6` | **Low** |

---

## 5. Features in the code the paper never mentions

1. **Faculty analytics reports** — `Class Performance` and `Performance Comparison` (`faculty/ClassPerformance.jsx`, `PerformanceComparison.jsx`; `App.jsx:156–157`). These are substantial, chart-driven report pages (Recharts) absent from the Faculty scope.
2. **Guardian engagement** — guardian contact info, guardian-addressed **email notifications**, and guardian self-service/admin flows (migrations `20261002080000`–`20261003110100`; `GuardianInfoGate.jsx`). Not a login role, but a real outbound-communication feature.
3. **Email notification delivery** — a `send-email` Supabase edge function and `notification_deliveries` pipeline (`20261002090000`); the paper describes only in-app `NOTIFICATIONS`.
4. **Dormant schema in the DB** — `evaluation_*` (student↔faculty evaluation forms/windows/criteria/responses), `ai_faculty_predictions`, `ai_student_recommendations`. These are unused by the app, so they do **not** contradict the delimitation, but a panelist inspecting the database will see tables that the paper’s delimitation says are out of scope. Worth a one-line footnote that they are inactive.

---

## 6. Items fixable by changing EITHER the paper OR the code

| # | Item | Option A — change the paper | Option B — change the code | Recommended |
|---|---|---|---|---|
| 1 | GWA Deficit scaling (Finding 1) | Rewrite Table 2.5 + P284 + the “4.41” claims (P280, P296) to the real 25–35 / 50–60 bands. *Effort: low (text).* | Fix `riskEngine.js:88,93` so the two bands scale 0–25 and 26–60 as documented. *Effort: low (2 lines) + re-run `verifyGradingMath.js`.* | **DECIDED → Option A (keep the code, reword paper).** The engine’s threshold-anchored scoring sends a failing student (GWA ≥3.01) straight to the High tier, which serves early intervention better than the linear model. Reword Table 2.5/P284/P280/P296 to match; also correct the misleading inline comments at `riskEngine.js:87,92` (comment-only, no behavior change). |
| 2 | AI model name (Finding 2) | Replace “Google Gemini 2.5 Flash” with the actual default and keep “configurable via OpenRouter.” *Effort: low.* | Set `OPENROUTER_MODEL`/default to a Gemini model. *Effort: low, but check OpenRouter availability/cost and re-test JSON-mode output.* | **DECIDED → Option B (keep “Gemini 2.5 Flash” in the paper; switch the code to a Gemini model).** User will apply the code change after the testing phase; no paper edit. |
| 3 | RLS coverage (Finding 3) | Soften P47 to “RLS on sensitive tables (risk, notes, notifications, attendance, guardians)…”. *Effort: low.* | Enable RLS + policies on the remaining tables. *Effort: medium–high; risks breaking the app since current queries assume open access.* | **Option A** for the paper now; Option B is a real security hardening task, separate from the audit. |
| 4 | ERD/DFD phantom tables (Finding 4) | Redraw/relabel ERD L4 and the DFDs to show `student_risk_evaluations` with JSONB `advising_plan`, snapshots, and `refer_to_dean`; drop the five non-existent tables. *Effort: medium (figures + text).* | Normalize the schema into the documented tables. *Effort: high; large refactor.* | **Option A** — document the real (simpler) design. |
| 5 | Trajectory sustained-decline (Finding 5) | Remove the sustained-decline sub-rule from P293. *Effort: low.* | Implement the sustained-decline branch. *Effort: medium.* | **Your call** — Option A unless you want the richer rule for the defense. |
| 6 | RLE template limitation (Finding 6) | Delete the “computes with GenEd distribution” limitation and restate support. *Effort: low.* | n/a (engine **and** UI already support it) | **DONE → Option A applied.** Verified in `ScoreInput.jsx`: required component dropdown + save-blocking validation for multi-bucket formulas. |

---

## 7. What matches (no action needed)

Milestone math MR/TFR/SG incl. summer branch and null-exclusion (Table 2.2 ↔ `gradingMath.js:421–451`); transmutation scale (Table 2.3 ↔ `academicPolicy.js:5–9`); five COG templates and weights (Table 2.1 ↔ `officialGradingPresets.js`); term-rating weighted-sum rounding (P266 ↔ `calculateWeightedTermRating`); risk ceilings 60/50/15/10 and raw-max 135 (Table 2.4 ↔ `riskEngine.js:21–26`); Attendance factor incl. summer ×1.5 re-cap (Table 2.6, P287 ↔ `riskEngine.js:104–119`); Missing-Work factor (Table 2.7 ↔ `:126–132`); Trajectory thresholds >5/>10/>15 (Table 2.8 ↔ `:144–156`); risk tiers (Table 2.9 ↔ `academicPolicy.js:21–26`); honors rule GWA ≤1.75 / no subject <2.00 / 18 units (P298 ↔ `academicPolicy.js:10–19`); four-role RBAC + route guards (P48, P81 ↔ `App.jsx`); HITL review-before-release and advisory-only AI (P38, P163 ↔ `invoke-advisor` + `advising_plan` approval); activity_logs as plain-text actor (P324 ↔ migration design); OpenRouter integration + structured JSON + deterministic fallback (P62 ↔ `openrouter.js`, `invoke-advisor`).
