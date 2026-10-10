# ASPIRE Paper — Required Changes (Chapters 1–2) 

**Date:** 2026-10-04 · **Source of truth:** the codebase · **Scope:** content only (never structure, numbering, headings, or citation style).
Changes are ordered as they appear in the paper, top to bottom. Each change cites the paper location and the code evidence. Proposed replacement text keeps the paper’s third-person formal academic tone and matches the surrounding tense.

> ## ✅ STATUS — COMPLETE (2026-10-04)
>
> **Everything in this document has been applied.** Output file: **`Downloads\ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx`** (original v3 untouched; XSD-validated, paragraphs 627 → 630).
>
> **Text changes applied (17):** #2, #3, #4, #5, #6, #8, #9, #10, #11, #12, #13, #14, #15, #16, #17, #18, #20, plus the ¶P47 RLS reword. Advisor naming unified to **“AI Academic Advisor”** throughout (0 occurrences of “AI Study Advisor” remain; ¶P106 notes the in-product label *Academic Insights / Ask ASPIRE*).
>
> **Text changes cancelled (3):** #1, #7, #19 — the paper keeps “Google Gemini 2.5 Flash”; the *code* changes instead.
>
> **Figures replaced (13):** 1.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.16, 2.18 — all regenerated on one shared visual system, with editable `.mmd` sources saved beside this file. See **Figures and diagrams** below.
>
> **Still outstanding — 2 items, neither affecting the document:**
> 1. **Pagination / spacing pass** on the .docx — author handling. Seven figures occupy 92% of the page height (2.4, 2.8, 2.9, 2.10, 2.11, 2.12, 2.18) and are the likeliest to orphan their captions.
> 2. **Drop the 8 dormant database tables** — housekeeping, no paper change. See **Code and database tasks → 3**.
>
> *Closed by author decision:* the AI model/provider question is **out of scope**. **Figure 2.3** (~3.5 pt) is **accepted as-is**. **Finding 13 (Vercel)** confirmed by the author. The **GWA comment fix is applied**.
>
> **DECISIONS MADE (2026-10-04):**
> 1. **AI model → keep "Google Gemini 2.5 Flash" in the paper.** All model-name paper edits are therefore **CANCELLED**: Changes **#1, #7, #8 (model clause only), #18 (model clause only), #19**, and the **¶P427 reference** are not applied. Table 2.10 stays as written. The deployed model/provider is **out of scope for this audit**.
> 2. **GWA Deficit factor → KEEP the code (it handles early-warning risk better) and reword the paper to match it.** Rationale: the engine anchors scoring to DYCI thresholds — crossing the 3.00 passing cut-off jumps a student straight to the High tier (mandatory faculty evaluation), whereas the paper's linear model would delay evaluation of a failing student until ~4.41 GWA. Changes **#11 and #12 are therefore APPLIED as paper edits (Option A)**: Table 2.5 → 25–35 / 50–60 bands; P284 examples → 28/30/35/55/60; P280 & P296 "≈4.41" → "≈3.01". Recommended companion code task: fix the misleading inline comments (not behavior) at `riskEngine.js:87,92` — see **Code tasks**.
> 3. Everything else below is **approved to apply to the paper**.
>
> See also the new **"Figures and diagrams to update"** and **"Code tasks (from the decisions above)"** sections near the end.

---

## CHAPTER 1

### Change #1: [Ch1 > RRL > AI-Assisted Academic Advising Systems]

- **Priority:** High
- **Action:** Reword
- **Location:** ¶P62, sentence beginning “ASPIRE adopts this design: its risk engine is fully deterministic…”
- **Current text:** “…while the AI Academic Advisor, a configurable model accessed through OpenRouter (Google Gemini 2.5 Flash by default; OpenRouter, 2026), returns structured JSON diagnostics grounded in activity metadata.”
- **Problem:** The deployed default model is `poolside/laguna-s-2.1:free` (with a Llama-3-8B fallback), not Google Gemini 2.5 Flash.
- **Replace with:** “…while the AI Academic Advisor, a configurable large language model accessed through the OpenRouter gateway, returns structured JSON diagnostics grounded in activity metadata. The specific model is set by deployment configuration and can be changed without code modification; an automatic secondary model provides continuity if the primary is unavailable.”
- **Evidence:** `supabase/functions/invoke-advisor/index.ts:5,318`
- **Status:** [–] CANCELLED — decision: keep “Google Gemini 2.5 Flash” in the paper; the *code* changes instead (see **Code tasks**).

### Change #2: [Ch1 > Scope > Student Portal > Academic Support Module]

- **Priority:** Medium
- **Action:** Reword
- **Location:** ¶P106, “AI Study Advisor — Generates topic-grounded diagnostics…”
- **Current text:** “AI Study Advisor — Generates topic-grounded diagnostics and study recommendations from the student's activity metadata, with a what-if GWA simulator for passing and President's Lister targets and a local fallback when the AI service is unavailable.”
- **Problem:** The feature is branded “Ask ASPIRE” inside an “Academic Insights” screen in the built UI; the paper uses a third name. Pick one canonical name and note the in-product label parenthetically.
- **Replace with:** “Academic Insights (Ask ASPIRE) — Generates topic-grounded diagnostics and study recommendations from the student's activity metadata, with a what-if GWA simulator for passing and President's Lister targets and a local rule-based fallback when the AI service is unavailable.”
- **Evidence:** `src/pages/student/AcademicInsights.jsx`; `App.jsx:169`; `invoke-advisor/index.ts:202`
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx` — applied as “**AI Academic Advisor** (Academic Insights / Ask ASPIRE)”, since the advisor name was standardised to *AI Academic Advisor* throughout.
- *(Note: this is a terminology decision — if you prefer to keep “AI Academic Advisor”/“AI Study Advisor” in the paper, instead add a single sentence at first mention stating the in-product name is “Ask ASPIRE” under the “Academic Insights” menu, and apply that consistently. Do not leave three different names.)*

### Change #3: [Ch1 > Scope > Student Portal > Consultations Module]

- **Priority:** Low
- **Action:** Reword
- **Location:** ¶P108, “Request a Consultation — Lets students request a one-on-one meeting…”
- **Current text:** “Request a Consultation — Lets students request a one-on-one meeting with an instructor, stating the concern and a preferred schedule (accessed as a tab in the AI Study Advisor).”
- **Problem:** Consultations is now a standalone module/page, decoupled from the advisor (commit `6aee7b7`).
- **Replace with:** “Request a Consultation — A dedicated Consultations module that lets students request a one-on-one meeting with an instructor, stating the concern, a preferred schedule, and a message, and track the request’s status.”
- **Evidence:** `src/pages/student/Consultations.jsx:17`; `App.jsx:170`
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx`

### Change #4: [Ch1 > Scope > Faculty Portal] — ADD

- **Priority:** Medium
- **Action:** Add
- **Location:** After the Faculty Portal “Attendance Module” block (¶P124–P125) and before the Consultations Module, insert a new module entry consistent with the surrounding heading style (`Heading 5` + `List Paragraph`).
- **Current text:** *(none — the Faculty scope omits the shipped reporting pages)*
- **Problem:** The faculty portal ships Class Performance and Performance Comparison report pages that the Scope never lists.
- **Replace with (new “Reports Module” under Faculty Portal):**
  > **Reports Module**
  > Class Performance — Summarizes a section’s score distribution, component averages, and grading-period trends from entered scores, with exportable charts.
  > Performance Comparison — Compares performance across the instructor’s sections or across grading periods to surface longitudinal patterns.
  >
- **Evidence:** `src/pages/faculty/ClassPerformance.jsx`; `src/pages/faculty/PerformanceComparison.jsx`; `App.jsx:156–157`
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx` — also added to Figure 2.3 and the Figure 2.12 VTOC.

### Change #5: [Ch1 > Scope > Admin Portal > User Accounts Module]

- **Priority:** Low
- **Action:** Reword
- **Location:** ¶P150, “Import Users (CSV) — Creates accounts in bulk…”
- **Current text:** “Import Users (CSV) — Creates accounts in bulk from a CSV file, assigning roles and departments from the file.”
- **Problem:** Bulk import is implemented via the xlsx (spreadsheet) library, not strictly CSV.
- **Replace with:** “Import Users (Spreadsheet) — Creates accounts in bulk from an uploaded spreadsheet file, assigning roles and departments from the file.”
- **Evidence:** `src/pages/admin/UserList.jsx:6` (`import * as XLSX from 'xlsx'`)
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx` — also relabelled in Figures 2.5, 2.11, 2.12 and 2.18.

### Change #6: [Ch1 > Scope > Delimitation] — ADD optional clarifier

- **Priority:** Medium
- **Action:** Add
- **Location:** End of ¶P163 (the four-role delimitation paragraph), optionally; and/or ¶P164.
- **Current text:** “…and every AI-drafted catch-up plan stays pending until faculty approve it. The study does not evaluate the AI model's internal architecture or training, only its output within ASPIRE.”
- **Problem:** The system sends guardian-addressed email notifications and captures guardian contact data; this outbound-communication capability is never scoped. State it (or explicitly delimit it) so a reviewer inspecting the schema/notifications isn’t surprised.
- **Replace with (append one sentence):** “ASPIRE additionally records a student’s guardian contact information and may send guardians read-only email notifications (for example, grade postings or attendance warnings); guardians have no login role or portal access.”
- **Evidence:** `supabase/migrations/20261002080000_guardian_notification_columns.sql`, `20261003110000_guardian_self_service.sql`; `src/components/student/GuardianInfoGate.jsx`; `send-email` edge function
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx`

### Change #7: [Ch1 > RRL > AI-Assisted Academic Advising Systems] — model name (first occurrence context)

- **Priority:** High
- **Action:** Reword *(same substantive issue as Change #1; this entry is only if P58 also names the model — verify)*
- **Location:** ¶P58 does not name the model; the named default appears at ¶P62. **If your working docx names “Gemini” anywhere in P58, apply the same wording as Change #1.** Otherwise mark this change N/A.
- **Current text:** *(verify in docx)*
- **Problem:** Consistency of model naming across Chapter 1.
- **Replace with:** *(as Change #1)*
- **Evidence:** `invoke-advisor/index.ts:5`
- **Status:** [–] N/A — ¶P58 does not name the model, and the model name is being kept anyway (see Change #1).

---

## CHAPTER 2

### Change #8: [Ch2 > System Development Methodology > Phase 1: Initial Planning]

- **Priority:** High
- **Action:** Reword
- **Location:** ¶P199, sentence “The technology stack was set as React.js (Vite), Supabase … and Google Gemini 2.5 Flash via OpenRouter for AI advisory.”
- **Current text:** “The technology stack was set as React.js (Vite), Supabase (PostgreSQL with Row-Level Security and Auth), and Google Gemini 2.5 Flash via OpenRouter for AI advisory.”
- **Problem:** Names Gemini as the AI model; the deployed default is `poolside/laguna-s-2.1:free`. (Also note RLS is partial — Change #16.)
- **Replace with (RLS clause only; keep “Gemini”):** “The technology stack was set as React.js (Vite), Supabase (PostgreSQL with Supabase Auth and Row-Level Security on sensitive tables), and Google Gemini 2.5 Flash via OpenRouter for AI advisory.”
- **Evidence:** `invoke-advisor/index.ts:5`; `supabase/migrations/20260531081149_disable_rls_for_now.sql`
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx` — **RLS clause only**; “Google Gemini 2.5 Flash” was deliberately kept.

### Change #9: [Ch2 > System Development Methodology > Phase 5: Implementation]

- **Priority:** Low
- **Action:** Reword
- **Location:** ¶P207, “…the COG-compliant Log Class Scores module with mandatory Activity Title and Scope metadata…”
- **Current text:** “…the COG-compliant Log Class Scores module with mandatory Activity Title and Scope metadata; the Grade Computation Preview; …”
- **Problem:** The mandatory fields are Activity **Title** and **Description**; “Scope” is used nowhere else and no “Scope” field exists.
- **Replace with:** “…the COG-compliant Log Class Scores module with mandatory Activity Title and Description metadata; the Grade Computation Preview; …”
- **Evidence:** `supabase/migrations/20260914120000_aspire_pipeline_v3_1.sql:64–66`
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx`

### Change #10: [Ch2 > Grading Engine Specification > Component Weighting and Program-Specific COG Templates]

- **Priority:** Medium
- **Action:** Edit — remove the limitation (support verified in engine **and** UI)
- **Location:** ¶P267, final sentence “Four of the five templates are fully supported; the Health Sciences RLE template … currently computes with the General Education Core distribution, a documented limitation.”
- **Current text:** “Four of the five templates are fully supported; the Health Sciences RLE template, which has three separate formative components, currently computes with the General Education Core distribution, a documented limitation.”
- **Problem:** The grading engine supports multi-bucket templates: `calculateStoredTermRating` maps each repeatable component by `componentId` when more than one exists and refuses to compute until activities are categorized — it does not silently fall back to GenEd weights. The RLE preset carries its true 50/20/20/10 weights. **Verified in the UI as well:** `ScoreInput.jsx` renders a required “Grading Component” `<select>` whenever `repeatableGradingComponents.length > 1` — in both the add-activity form and the configure-activity modal — listing each component with its weight, and save is blocked until one is chosen. Single-bucket formulas auto-assign, so no dropdown appears. The limitation is therefore obsolete.
- **Replace with (if verified supported):** “All five templates are supported. Templates with multiple formative components, such as Health Sciences (RLE / Clinical Practicum), require each activity to be assigned to its grading component before a rating is computed; the engine applies each component’s own weight rather than a default distribution.”
- **Evidence:** engine `src/lib/gradingMath.js:169–222`; preset `src/lib/officialGradingPresets.js:28–37`; UI `src/pages/faculty/ScoreInput.jsx:2480–2499, 2650–2670` (dropdown), `:934, :1060, :2549` (validation), `:911, :1096` (single-bucket auto-assign)
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx`

### Change #11: [Ch2 > Academic Risk Score Specification > Factor 1 – GWA Deficit] — Table 2.5

- **Priority:** High
- **Action:** Edit (Table 2.5) — **DECISION MADE: keep the code; apply Option A below (reword paper)**
- **Location:** Table 2.5 (after ¶P282) and ¶P284.
- **Current text (Table 2.5 rows):**
  | Running GWA | Points | Factor Severity |
  | 1.00 - 2.00 | 0 | None |
  | 2.01 - 3.00 | 0 - 25 (linear) | Watch |
  | 3.01 - 5.00 | 26 - 60 (linear) | Failing |
- **Current text (¶P284):** “Representative values: GWA 2.25 contributes 6 points; 2.50 contributes 13; 3.00 contributes 25; 4.00 contributes 43; 5.00 contributes the full 60.”
- **Problem:** The engine does not produce these numbers. It computes `25 + round((gwa−2)·10)` for the 2.01–3.00 band and `50 + round((gwa−3.01)/1.99·10)` for the 3.01–5.00 band. Verified outputs: 2.01→25, 2.25→28, 2.50→30, 3.00→35, 3.01→50, 4.00→55, 5.00→60. The code even contradicts its own docstring, so this is most likely a code bug.
- **Replace with — Option A (document the code as-is):**
  - Table 2.5 rows:
    | Running GWA | Points | Factor Severity |
    | 1.00 - 2.00 | 0 | None — passing comfortably |
    | 2.01 - 3.00 | 25 - 35 | Watch — passing, below the 2.00 scholarship grade floor |
    | 3.01 - 5.00 | 50 - 60 | Failing — below the 75% cut-off |
  - ¶P284: “Representative values: GWA 2.25 contributes 28 points; 2.50 contributes 30; 3.00 contributes 35; 4.00 contributes 55; 5.00 contributes the full 60.”
- **Replace with — Option B (if you fix the code to match the paper’s intended linear bands, keep the paper as written and apply no paper edit here).**
- **Evidence:** `src/lib/riskEngine.js:81–95` (docstring intent `:36–37`); empirically re-run via the engine.
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx` — Option A applied (Table 2.5 → 25–35 / 50–60; ¶P284 → 28/30/35/55/60).

### Change #12: [Ch2 > Academic Risk Score Specification > Composite Model (P280) and Classification Tiers (P296)]

- **Priority:** High
- **Action:** Reword — **DECISION MADE: keep the code; apply Option A below (reword paper)**
- **Location:** ¶P280 (“a severe grade deficit alone (a running GWA of approximately 4.41 or worse) … places a student in the High tier”) and ¶P296 (same “4.41” claim).
- **Current text (P280):** “…a severe grade deficit alone (a running GWA of approximately 4.41 or worse) or four or more absences alone places a student in the High tier, which prompts faculty evaluation.”
- **Current text (P296):** “While a severe grade-only deficit (a running GWA of approximately 4.41 or worse) places a student in the High tier to prompt faculty evaluation…”
- **Problem:** Under the deployed engine, any failing GWA (≥ 3.01 → 50 points) alone reaches the High tier (50–74). The “4.41” threshold only holds under the paper’s (unimplemented) 26–60 linear band.
- **Replace with — Option A (document code as-is):**
  - P280: “…a failing running GWA alone (approximately 3.01 or worse, contributing at least 50 points) or four or more absences alone places a student in the High tier, which prompts faculty evaluation.”
  - P296: “While a failing grade-only deficit (a running GWA of approximately 3.01 or worse) places a student in the High tier to prompt faculty evaluation…”
- **Replace with — Option B:** if you fix the code (Change #11 Option B), retain the “4.41” wording unchanged.
- **Evidence:** `src/lib/riskEngine.js:81–95`; tiers `src/lib/academicPolicy.js:21–26`
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx` — Option A applied (“≈4.41” → “≈3.01” in ¶P280 and ¶P296).

### Change #13: [Ch2 > Risk Spec > Factor 4 – Trajectory: Two-Level Decline Rule]

- **Priority:** Medium
- **Action:** Edit (remove the unimplemented sub-rule) — or implement it in code
- **Location:** ¶P293, sentences “Sustained decline applies once three ratings exist and two consecutive segments decline; the total drop is scored against the same thresholds. The factor takes the greater of the two scores, capped at 10, and never sums them, since both come from the same observations.”
- **Current text:** (as quoted above)
- **Problem:** The engine computes trajectory from the two most recent ratings only (latest decline). There is no three-rating / consecutive-segment / “greater of the two” logic anywhere in the code.
- **Replace with (if documenting code as-is):** “Latest decline is the change, in percentage points, between the two most recent encoded ratings, so a Prelim-to-Midterm drop can trigger support as early as a trend exists. If the latest rating improves or holds, recovery is recorded. This explainable decline rule catches cases such as a drop from 88% to 80% before any failing threshold is reached.”
  *(i.e., delete the two sustained-decline sentences; keep the surrounding latest-decline description.)*
- **Evidence:** `src/lib/riskEngine.js:134–156`; grep “sustained” → 0 results
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx`

### Change #14: [Ch2 > Database Design > ERD Layer 4 — Risk, Advising & Consultation]

- **Priority:** High
- **Action:** Reword (and update Figure 2.16 accordingly — content only, not structure)
- **Location:** ¶P320, the sentences naming INTERVENTION_TASKS, INTERVENTION_ESCALATIONS, ADVISOR_INSIGHTS, ADVISOR_ACTION_ITEMS, ADVISOR_OUTCOMES.
- **Current text:** “…INTERVENTION_TASKS stores only workflow events (assignment, submission, verification, revision, cancellation), from which the displayed status, including overdue, is derived at read time. INTERVENTION_ESCALATIONS records each referral with its rationale and the Dean's disposition (pending, acknowledged, resolved, or dismissed). STUDENT_CONSULTATION_REQUESTS supports consultation booking; STUDENT_ACADEMIC_INSIGHTS and FACULTY_PERFORMANCE_INSIGHTS hold general AI logs; ADVISOR_INSIGHTS, ADVISOR_ACTION_ITEMS, and ADVISOR_OUTCOMES support the topic-grounded advisor; and ATTENDANCE_RECORDS feeds the Attendance Factor and FDA badge.”
- **Problem:** None of INTERVENTION_TASKS, INTERVENTION_ESCALATIONS, ADVISOR_INSIGHTS, ADVISOR_ACTION_ITEMS, or ADVISOR_OUTCOMES exist. Catch-up tasks are an `advising_plan` JSONB array inside `STUDENT_RISK_EVALUATIONS`; escalation is a `refer_to_dean` boolean plus `dean_note`/`dismissed_at` columns on the same row; advisor outputs are logged to `STUDENT_ACADEMIC_INSIGHTS`.
- **Replace with:** “Within STUDENT_RISK_EVALUATIONS, the faculty-assigned catch-up tasks are stored as a JSON advising plan (each task carrying its description, due date, and completion state), and the displayed status, including overdue, is derived at read time; escalation to the Dean is captured by a referral flag with the referral rationale and the Dean’s disposition recorded on the same record. STUDENT_CONSULTATION_REQUESTS supports consultation booking; STUDENT_ACADEMIC_INSIGHTS and FACULTY_PERFORMANCE_INSIGHTS hold the AI advisory logs; and ATTENDANCE_RECORDS feeds the Attendance Factor and FDA badge.”
- **Evidence:** `supabase/migrations/20260914120000_aspire_pipeline_v3_1.sql:6–42` (advising_plan `:24`, snapshots `:30–31`, refer_to_dean `:34`); grep confirms 0 references to the five named tables.
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx` — Figure 2.16 was also redrawn to match.

### Change #15: [Ch2 > Process Design > Level 1 DFD: Student Portal]

- **Priority:** High
- **Action:** Reword (and update Figure 2.8 labels)
- **Location:** ¶P248, “…The AI Study Advisor sends a grounded prompt to the AI Model Provider and stores the result in advisor_insights. Study plans read and update intervention_tasks, and consultation requests are written to student_consultation_requests.”
- **Current text:** (as above)
- **Problem:** `advisor_insights` and `intervention_tasks` tables do not exist. Advisor results are stored in `student_academic_insights`; study-plan tasks are the `advising_plan` JSON on `student_risk_evaluations`.
- **Replace with:** “…The AI Academic Advisor sends a grounded prompt to the AI Model Provider and stores the result in student_academic_insights. Study plans read the advising plan held on the student’s risk evaluation and update each task’s completion state, and consultation requests are written to student_consultation_requests.”
- **Evidence:** `invoke-advisor/index.ts`; `20260914120000:24`; grep: `advisor_insights`/`intervention_tasks` = 0 refs
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx` — Figure 2.8 was also redrawn to match.

### Change #16: [Ch2 > Process Design > Level 1 DFD: Faculty Portal]

- **Priority:** Medium
- **Action:** Reword
- **Location:** ¶P252, “…HITL evaluation writes private notes, the baseline snapshot, tasks, optional escalations, and an activity log entry.”
- **Current text:** (as above)
- **Problem:** Accurate in spirit but should match storage: private notes are a separate table; baseline snapshot, tasks, and escalation are fields on the single risk-evaluation record.
- **Replace with:** “…HITL evaluation writes the faculty private notes (to student_risk_private_notes), and records the baseline snapshot, the advising-plan tasks, and any Dean referral on the student’s risk-evaluation record, together with an activity-log entry.”
- **Evidence:** `20260914120000:6–42`; `20260926120000_secure_student_risk_notes.sql:20`
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx` — Figure 2.9 was also redrawn to match.

### Change #17: [Ch2 > Process Design > Level 1 DFD: Dean Portal]

- **Priority:** High
- **Action:** Reword
- **Location:** ¶P256, “…The Risk and Honors Overview and Intervention Results read student_risk_evaluations, intervention_tasks, and advisor_outcomes; escalated cases are resolved in intervention_escalations…”
- **Current text:** (as above)
- **Problem:** `intervention_tasks`, `advisor_outcomes`, and `intervention_escalations` do not exist; all of this data is on `student_risk_evaluations`.
- **Replace with:** “…The Risk and Honors Overview and Intervention Results read student_risk_evaluations (including the advising plan and the baseline and follow-up snapshots); escalated cases are resolved on the same records through the Dean’s disposition fields; and reports aggregate posted grades, evaluations, and advising-plan tasks.”
- **Evidence:** `20260914120000:6–42` (dean_note/dismissed_at added in later escalation migration); grep: the three tables = 0 refs
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx` — Figure 2.10 was also redrawn to match.

### Change #18: [Ch2 > Development Stack and Tools]

- **Priority:** High
- **Action:** Reword
- **Location:** ¶P331, “…and Google Gemini 2.5 Flash through OpenRouter for AI advising.”
- **Current text:** “ASPIRE uses a React.js (Vite) frontend, a Supabase backend (PostgreSQL with Row Level Security and Supabase Auth), and Google Gemini 2.5 Flash through OpenRouter for AI advising. Code is versioned in Git on GitHub, deployed on Vercel, and packaged for Android with Capacitor. Table 2.10 details each component.”
- **Problem:** Names Gemini as the model (actual default `poolside/laguna-s-2.1:free`); also “Row Level Security” reads as blanket (it is applied to sensitive tables only).
- **Replace with (RLS clause only; keep “Gemini”):** “ASPIRE uses a React.js (Vite) frontend, a Supabase backend (PostgreSQL with Supabase Auth and Row Level Security on sensitive tables), and Google Gemini 2.5 Flash through OpenRouter for AI advising. Code is versioned in Git on GitHub, deployed on Vercel, and packaged for Android with Capacitor. Table 2.10 details each component.”
- **Evidence:** `invoke-advisor/index.ts:5`; `20260531081149_disable_rls_for_now.sql`; `vercel.json`; `capacitor.config.json`; `package.json`
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx` — **RLS clause only**; “Google Gemini 2.5 Flash” was deliberately kept.

### Change #19: [Ch2 > Tools and Technologies Used] — Table 2.10, “AI Integration” row

- **Priority:** High
- **Action:** Edit (Table 2.10)
- **Location:** Table 2.10 (after ¶P340), row “AI Integration.”
- **Current text:** “A configurable large language model (default: Google Gemini 2.5 Flash) accessed through the OpenRouter API gateway, providing structured JSON diagnostic output, uptime monitoring, and low-latency response routing for the AI Academic Advisor module.”
- **Problem:** The named default is wrong.
- **Replace with:** “A configurable large language model accessed through the OpenRouter API gateway (the specific model is set by deployment configuration, with an automatic fallback model for continuity), providing structured JSON diagnostic output and low-latency response routing for the AI Academic Advisor module.”
- **Evidence:** `invoke-advisor/index.ts:5,318`
- **Status:** [–] CANCELLED — Table 2.10 keeps “default: Google Gemini 2.5 Flash” (see Change #1).

### Change #20: [Ch2 > ISO/IEC 25010 Evaluation Checklist] — Security characteristic

- **Priority:** Medium
- **Action:** Reword
- **Location:** ¶P373, item 6 “Security.”
- **Current text:** “6. Security – the effectiveness of ASPIRE's four-role RBAC architecture, Supabase Row Level Security (RLS) policies applied at the database layer, and the Dean-approval audit workflow for all posted grade modifications.”
- **Problem:** RLS is applied to a subset of (sensitive) tables, not uniformly. Keep the characteristic but avoid implying blanket RLS.
- **Replace with:** “6. Security – the effectiveness of ASPIRE's four-role RBAC architecture, Supabase Row Level Security (RLS) policies applied to sensitive data tables at the database layer, and the Dean-approval audit workflow for all posted grade modifications.”
- **Evidence:** `20260531081149_disable_rls_for_now.sql`; selective enables in `20260926120000`, `20261001150000`, `20261001170000`
- **Status:** [x] APPLIED in `ASPIRE-Chapter_1-2_REVISED_v4_audit-applied.docx`

---

## New content to add

### A. Faculty Reports module (Scope, Faculty Portal)

See **Change #4** for paste-ready text. Belongs in Chapter 1 > Scope > Faculty Portal, as a new `Reports Module` entry between the Attendance and Consultations modules, so the scope matches the two shipped faculty report pages (`ClassPerformance.jsx`, `PerformanceComparison.jsx`).

### B. Guardian notifications (Scope/Delimitation)

See **Change #6** for paste-ready text. Add one sentence acknowledging guardian contact capture and guardian email notifications (read-only; no login role). Place in Chapter 1 > Scope & Delimitation (¶P163–P164). Evidence: guardian migrations `20261002080000`–`20261003110100`, `send-email` edge function.

### C. Footnote on inactive schema — NOT APPLIED (author decision)

> **Resolved differently:** rather than add a caveat to the paper, the author will **drop the dormant tables from the database** during the evaluation/testing phase. That makes the existing delimitation (¶P163 — no student-to-faculty evaluations, rating forms or evaluation schedulers) literally true of the schema as well as the application, which is the stronger outcome. Safe to drop: `evaluation_forms`, `evaluation_windows`, `evaluation_criteria`, `evaluation_responses`, `evaluation_ratings`, `evaluation_comments`, `ai_faculty_predictions`, `ai_student_recommendations` — all have **zero code references**. No paper change required.

*(Original optional suggestion, retained for the record:)*

If you expect a panelist to inspect the live database, add a single clarifying sentence (Chapter 2 > Database Design intro, ¶P304) that the deployed schema contains some inactive tables reserved for future modules (e.g., a faculty-evaluation subsystem) that are out of scope for this study and unused by the application. Evidence: `evaluation_*`, `ai_faculty_predictions`, `ai_student_recommendations` tables have zero code references. *(Only add this if you want to pre-empt the question; otherwise the delimitation already excludes them.)*

---

## Content removed or toned down — all done ✅

| # | Claim | Outcome |
|---|---|---|
| 1 | ~~“Google Gemini 2.5 Flash” as the AI model~~ | **NOT REMOVED — decision reversed.** The paper keeps “Google Gemini 2.5 Flash” at ¶P62, ¶P199, ¶P331, Table 2.10 and reference ¶P427. The deployed model/provider is out of scope for this audit. Only the RLS half of ¶P199/¶P331 was edited. |
| 2 | “RLS on **all tables**” (¶P47) and blanket RLS phrasing (¶P331, ¶P373) | ✅ Toned down to “sensitive data tables” in all three places. |
| 3 | Five non-existent tables in the ERD/DFDs (¶P320, ¶P248, ¶P252, ¶P256) | ✅ Removed from the text **and** from Figures 2.16, 2.8, 2.9, 2.10; replaced by the real single-table JSONB design. |
| 4 | Trajectory “sustained decline” sub-rule (¶P293) | ✅ Removed — not implemented in the engine. |
| 5 | Health Sciences RLE “computes with GenEd distribution” limitation (¶P267) | ✅ Removed — **verified end-to-end**: the engine supports multi-bucket templates *and* the faculty UI presents a required “Grading Component” dropdown when a formula has more than one repeatable bucket. |
| 6 | “≈4.41 GWA → High tier” (¶P280, ¶P296) | ✅ Corrected to “≈3.01” (keep-the-code decision). |

---

## Decisions — all resolved

| # | Question | Decision taken |
|---|---|---|
| 1 | **GWA Deficit factor** (#11, #12) — engine disagrees with the paper and with its own comments | **Keep the code, reword the paper.** The engine anchors to DYCI thresholds, so crossing the 3.00 cut-off sends a student straight to High tier (mandatory faculty evaluation); the paper's linear model would have delayed that to ~4.41 GWA. Better for early intervention. Table 2.5 → 25–35 / 50–60; “≈4.41” → “≈3.01”. |
| 2 | **AI model** (#1, #7, #8, #18, #19, ref P427) | **Paper keeps “Google Gemini 2.5 Flash” — changes #1, #7 and #19 cancelled; reference ¶P427 unchanged.** The deployed model/provider is **out of scope for this audit** and is no longer tracked here. *(The “Problem” notes inside changes #1/#8/#18 are retained only as the record of why those edits were originally raised.)* |
| 3 | **RLS scope** (#18, #20, P47) | **Document reality** — “RLS on sensitive data tables”. Full-coverage RLS remains an open *code hardening* task, deliberately out of scope for the paper. |
| 4 | **Trajectory sustained-decline** (#13) | **Removed from the paper** — the sub-rule is not implemented. |
| 5 | **RLE template** (#10) | **Limitation removed** from the paper — now **verified in both the engine and the faculty UI** (component dropdown + save-blocking validation). No open question remains. |
| 6 | **Advisor naming** (#2) | **“AI Academic Advisor” everywhere**, with the in-product label *Academic Insights / Ask ASPIRE* noted once at ¶P106. |
| 7 | **Figure style** | Regenerate on one shared system; preserve per-portal accent colours; white text on dark accents. |
| 8 | **Flowchart layout** | Authentication row runs **left-to-right across the top**, dropping into a **centred “Select module”** with modules fanned beneath — author's proposal, adopted. |

**Figure 2.3** prints at ~3.5 pt and was **accepted as-is** by the author; condensing and a full-page landscape slot were both considered and declined.

---

## Figures and diagrams — 13 replaced ✅

Every `.docx` figure is a flat embedded PNG (no editable Word shapes), so each had to be regenerated. **13 of 19 were replaced**; the rest were deliberately left alone (listed further below). Editable Mermaid sources and full-resolution PNGs sit beside this file.

| Figure | What was corrected | Source file |
|---|---|---|
| **1.1** Conceptual Framework (IPOF) | Regenerated in house style; content verified accurate | `Figure-1.1-Conceptual-Framework.mmd` |
| **2.2** Flowchart — Student | `AI Study Advisor` → **AI Academic Advisor**; horizontal login row | `Figure-2.2-Flowchart-Student.mmd` |
| **2.3** Flowchart — Faculty | **Added the missing Reports Module** (Class Performance, Performance Comparison) | `Figure-2.3-Flowchart-Faculty.mmd` |
| **2.4** Flowchart — Dean | Regenerated in house style; purple accent preserved | `Figure-2.4-Flowchart-Dean.mmd` |
| **2.5** Flowchart — Admin | `Import Users (CSV)` → **(Spreadsheet)** | `Figure-2.5-Flowchart-Admin.mmd` |
| **2.7** Level 0 Context Diagram | `CSV imports` → **spreadsheet imports**; rebuilt with **ASPIRE centred**, senders left / receivers right | `Figure-2.7-DFD-Level0-Context.mmd` |
| **2.8** Level 1 DFD — Student | `advisor_insights` → `student_academic_insights`; removed `advisor_action_items`, `intervention_tasks`; advisor renamed | `Figure-2.8-DFD-Student.mmd` |
| **2.9** Level 1 DFD — Faculty | Removed `intervention_escalations`, `intervention_tasks` | `Figure-2.9-DFD-Faculty.mmd` |
| **2.10** Level 1 DFD — Dean | Removed `intervention_escalations`, `advisor_outcomes`, both `intervention_tasks` | `Figure-2.10-DFD-Dean.mmd` |
| **2.11** Level 1 DFD — Admin | Redrawn from hand-drawn to match 2.8–2.10; `Import Users (Spreadsheet)` | `Figure-2.11-DFD-Admin.mmd` |
| **2.12** VTOC | Added Faculty → **Reports**; Consultations as its own module; advisor renamed; Spreadsheet import | `Figure-2.12-VTOC.mmd` |
| **2.16** ERD Layer 4 | Removed the **five non-existent entities**; shows the real single-table JSONB design | `Figure-2.16-ERD-Layer4.mmd` |
| **2.18** UI Composite Wireframe | **AI Academic Advisor**; `Account & CSV Provisioning` → **Spreadsheet**; 2×2 panel grid | `Figure-2.18-UI-Wireframe.mmd` |

**Shared visual system** (sampled from the untouched originals so the chapter stays uniform): node fill `#EEEEEE`, border `#BBBBBB`, cluster `#FAFAFA`, connectors `#555555`, curved (`basis`) edges, 26px base font, **white text on dark accent fills**. Per-portal accents preserved: Student `#1E3A8A`, Faculty `#14532D`, Dean `#5B21B6`, Admin `#C2410C`. Reusable config: `_figure-style-config.json`, `_figure-style.css`, `_figure-render-viewport.json`.

**Printed text size** after the layout rework (figure fitted to the 5.88 × 7.59 in text area):

| Figure | Text | Figure | Text | Figure | Text |
|---|---|---|---|---|---|
| 1.1 | 10.9 pt | 2.7 | 9.8 pt | 2.11 | 4.6 pt |
| 2.2 | 4.8 pt | 2.8 | 5.9 pt | 2.12 | 5.5 pt |
| **2.3** | **3.5 pt** ⚠ | 2.9 | 5.3 pt | 2.18 | 10.5 pt |
| 2.4 | 5.0 pt | 2.10 | 7.2 pt | | |

⚠ **Figure 2.3 is the one weak figure.** It is the densest diagram in the paper (7 modules, ~30 nodes) and is *width*-limited, so layout tuning cannot help it — every arrangement tested landed between 2.0 and 3.5 pt. **Author decision: accepted as-is** — condensing and a landscape slot were both considered and declined.

### Figures deliberately left unchanged (6)

| Figure | Why it was left alone |
|---|---|
| **2.1** Iterative/Incremental SDLC | Attributed to GeeksforGeeks — redrawing an attributed figure is the author's call. |
| **2.6** Level 0 DFD, existing manual system | Its maroon accent deliberately marks the *legacy* process against ASPIRE's navy. That contrast is intentional design, not an inconsistency. |
| **2.13 / 2.14 / 2.15 / 2.17** ERD Layers 1, 2, 3, 5 | Every entity shown exists and matches the schema, and they are already visually consistent with the corrected 2.16. |

**Tables (not figures):** **Table 2.5 was updated** (Change #11 — the keep-the-code decision). **Table 2.10 is unchanged** — it keeps “default: Google Gemini 2.5 Flash”.

*Optional, not applied:* Figure **2.17** could gain `GUARDIANS` / `NOTIFICATION_DELIVERIES` / `NOTIFICATION_PREFERENCES` entities to match the shipped guardian-notification pipeline introduced by Change #6. Left out to avoid changing a figure that is not currently wrong.

---

## Code and database tasks

**Not paper edits.** These sit outside the document — recorded here so they are not lost.

### 1. ~~AI model / provider~~ — out of scope
Removed at the author's direction. The paper's model wording stands; the deployed model is not tracked by this audit.

### 2. GWA Deficit comments — ✅ DONE
The engine's GWA scoring is **intentionally kept** (threshold-anchored, not linear), but three comments described a linear model the code never implemented. Corrected in `src/lib/riskEngine.js`:

| Location | Was | Now |
|---|---|---|
| `:34–37` docstring | “scales 1-25 pts” / “scales 26-60 pts” | real bands **25–35** / **50–60**, plus the rationale (anchored to the 2.00 scholarship floor and 3.00 passing cut-off) and a pointer to Table 2.5 |
| `:87` watch zone | “2.01→1pt, 2.50→~12pts, 3.00→25pts” | **2.01→25, 2.25→28, 2.50→30, 3.00→35** |
| `:92` failing zone | “3.01→26pts, 4.00→43pts, 5.00→60pts” | **3.01→50, 4.00→55, 5.00→60** |

Comment-only — `git diff` confirms **no non-comment line changed**; every documented value was asserted against live engine output; `scripts/verifyGradingMath.js` passes; ESLint clean.

### 3. Drop the dormant database tables — ☐ OPEN (author)

**No paper change required** — these tables are not mentioned in the document, and the delimitation (¶P163) already excludes the functionality. Logged purely as a housekeeping task.

Eight tables exist in the deployed schema but have **zero references anywhere in `src/`**, so dropping them is safe:

| Table | Note |
|---|---|
| `evaluation_forms`, `evaluation_windows`, `evaluation_criteria`, `evaluation_responses`, `evaluation_ratings`, `evaluation_comments` | A student-to-faculty evaluation subsystem — exactly what ¶P163 delimits *out*. Dropping them makes the delimitation true of the schema as well as the app. |
| `ai_faculty_predictions`, `ai_student_recommendations` | Superseded by `student_academic_insights` / `faculty_performance_insights`. |

**Do not drop** `class_grading_columns` — it is referenced in 11 source files and is live. `component_scores` and `grade_components` are also unused but were not audited in depth; verify before removing.

*Why it is worth doing:* a panelist inspecting the live database would see tables literally named `evaluation_forms` and `evaluation_windows` while the paper states the system has no evaluation forms or schedulers. The claim is defensible either way, but an empty schema removes the question entirely.

---

## Final checklist

| Change # | Section                                                                 | Priority | Done |
| -------- | ----------------------------------------------------------------------- | -------- | ---- |
| 1        | Ch1 > RRL > AI-Assisted Advising (P62) — model name                    | ~~High~~ | CANCELLED (fix code, keep Gemini) |
| 2        | Ch1 > Scope > Student > Academic Support (P106) — advisor name         | Medium   | ✅ applied |
| 3        | Ch1 > Scope > Student > Consultations (P108) — standalone              | Low      | ✅ applied |
| 4        | Ch1 > Scope > Faculty — ADD Reports module                             | Medium   | ✅ applied |
| 5        | Ch1 > Scope > Admin > Import Users (P150) — xlsx not CSV               | Low      | ✅ applied |
| 6        | Ch1 > Delimitation (P163–P164) — ADD guardian note                    | Medium   | ✅ applied |
| 7        | Ch1 > RRL (P58) — model name (verify/N-A)                              | ~~High~~ | CANCELLED (fix code, keep Gemini) |
| 8        | Ch2 > Methodology Phase 1 (P199) — RLS clause only (keep “Gemini”)     | High     | ✅ applied |
| 9        | Ch2 > Methodology Phase 5 (P207) — “Scope”→“Description”          | Low      | ✅ applied |
| 10       | Ch2 > Grading Engine (P267) — RLE limitation                           | Medium   | ✅ applied |
| 11       | Ch2 > Risk Factor 1 / Table 2.5 (P282–P284) — GWA bands (Option A)     | High     | ✅ applied |
| 12       | Ch2 > Risk Composite/Tiers (P280, P296) — “≈4.41”→“≈3.01”          | High     | ✅ applied |
| 13       | Ch2 > Risk Factor 4 (P293) — sustained decline                         | Medium   | ✅ applied |
| 14       | Ch2 > ERD L4 (P320) — phantom tables                                   | High     | ✅ applied |
| 15       | Ch2 > DFD Student (P248) — advisor_insights/intervention_tasks         | High     | ✅ applied |
| 16       | Ch2 > DFD Faculty (P252) — storage wording                             | Medium   | ✅ applied |
| 17       | Ch2 > DFD Dean (P256) — phantom tables                                 | High     | ✅ applied |
| 18       | Ch2 > Dev Stack (P331) — RLS clause only (keep “Gemini”)               | High     | ✅ applied |
| 19       | Ch2 > Table 2.10 (P340) — AI Integration row                           | ~~High~~ | CANCELLED (keep Gemini) |
| 20       | Ch2 > ISO Security (P373) — RLS scope                                  | Medium   | ✅ applied |
| —       | Ch1 > Data Privacy (P47) — RLS “all tables” reworded                 | High     | ✅ applied |
| —       | References (P427) — Gemini citation                                   | ~~Medium~~ | CANCELLED (keep Gemini) |
| F2.16   | Figure 2.16 — ERD L4 redraw (remove phantom tables)                    | High     | ✅ replaced |
| F2.8    | Figure 2.8 — DFD Student data-store labels                            | High     | ✅ replaced |
| F2.10   | Figure 2.10 — DFD Dean data-store labels                              | High     | ✅ replaced |
| F2.9    | Figure 2.9 — DFD Faculty data-store labels                            | Medium   | ✅ replaced |
| F2.12   | Figure 2.12 — VTOC (Faculty Reports, Consultations, names, import)    | Medium   | ✅ replaced |
| F2.3    | Figure 2.3 — Faculty flowchart (Reports module)                       | Medium   | ✅ replaced |
| F2.2    | Figure 2.2 — Student flowchart (Consultations/advisor name)           | Low      | ✅ replaced |
| F2.5    | Figure 2.5 — Admin flowchart (import label)                           | Low      | ✅ replaced |
| F2.18   | Figure 2.18 — UI wireframe (advisor name)                            | Low      | ✅ replaced |
| F2.17   | Figure 2.17 — ERD L5 (optional: guardians/deliveries)                 | Low (opt) | — not applied (optional) |
| F1.1    | Figure 1.1 — Conceptual Framework (IPOF)                              | Medium   | ✅ replaced |
| F2.4    | Figure 2.4 — Dean flowchart                                           | Medium   | ✅ replaced |
| F2.7    | Figure 2.7 — Context diagram (ASPIRE centred, spreadsheet imports)    | High     | ✅ replaced |
| F2.11   | Figure 2.11 — Admin DFD (redrawn, spreadsheet import)                 | High     | ✅ replaced |
