# ASPIRE AI Academic Advisor — Strategic Review & Implementation Recommendations

**Target Document:** [`docs/aspire/ASPIRE-AI-Academic-Advisor-Plan.md`](file:///C:/Users/sadia/SAGE/docs/aspire/ASPIRE-AI-Academic-Advisor-Plan.md)  
**System:** Academic Support and Performance Advising with Intervention, Risk, and Evaluation (ASPIRE)  
**Institution:** Dr. Yanga's Colleges, Inc. (DYCI)  
**Date:** September 2026  
**Status:** Approved with Engineering Refinements  

---

## 1. Executive Summary & Assessment

The [`ASPIRE-AI-Academic-Advisor-Plan.md`](file:///C:/Users/sadia/SAGE/docs/aspire/ASPIRE-AI-Academic-Advisor-Plan.md) is an **architecturally sound, policy-grounded, and defense-ready specification**. It transforms the system from a passive chatbot or late-stage grade reporter into an active, bounded academic intervention workspace.

### Key Strengths
1. **Resolves the Panel Paradox:** Harmonizes the Capstone 1 defense ruling (*students must only see official Midterm and Final grades*) with early academic intervention by utilizing **faculty-released activity results** (quizzes, assignments) rather than hidden draft gradebooks.
2. **Clear Separation of Authority:** The **Deterministic Signal Engine** computes math, benchmarks, and risk classifications; the **AI Advisor** explains signals and proposes 1–3 bounded actions; **Faculty and Deans** retain exclusive authority over final grades, formal interventions, and FDA (Failure Due to Absences).
3. **Closed-Loop Outcome Tracking:** Establishes the `advisor_outcomes` model to measure performance deltas before and after intervention, providing empirical proof of efficacy for the panel without claiming unsubstantiated causation.
4. **Anti-Fatigue Discipline:** Enforces a 72-hour per-course cooldown, weekly digest consolidation, and a $\ge 2$ data point minimum to prevent alert fatigue.

This recommendation document provides **concrete engineering solutions to close the remaining technical gaps, eliminate implementation bottlenecks, and guide the refactoring of legacy components**.

---

## 2. Critical Gap Closures & Architectural Refinements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ASPIRE ADVISING ARCHITECTURE                          │
├──────────────────────────┬───────────────────────────┬──────────────────────┤
│ 1. Faculty Class Record  │ 2. Deterministic Engine   │ 3. Student Workspace │
│  - Save Draft (Private)  │  - Evaluate Benchmarks    │  - Today View        │
│  - Release Activity ─────┼─▶- Detect 2 Weak Results ─┼─▶- My Courses Cards  │
│  - FDA Alert Review      │  - Calculate Risk Delta   │  - Ask ASPIRE Drawer │
└──────────────────────────┴───────────────────────────┴──────────────────────┘
```

### Gap 1: Defining "Related Weak Results" Without Schema Overload
* **Challenge:** The plan states that *"two related weak activity results create a course concern"*, referencing specific topics (e.g., `Linked-list traversal`). However, the existing database schema only stores generic activity metadata (`title`, `type`, `max_score`, `term`).
* **Engineering Solution:** Implement a **two-tier grouping strategy**:
  * **Tier A (Default / Zero-Schema-Change):** Group by assessment category within the current term (e.g., two consecutive scores $<75\%$ on Quizzes, or two consecutive low Lab Exercises).
  * **Tier B (Enhanced / Topic Tagging):** Add an optional `topic_tag` text column to `class_activities` (e.g., `Pointers`, `Inheritance`, `Cell Biology`) selectable via a lightweight dropdown or tag input in the faculty activity creation modal.

### Gap 2: Preventing the "Unreleased Grade" Bottleneck
* **Challenge:** If faculty enter scores but forget to release them to students, the advising engine receives zero early data and students see no proactive insights.
* **Engineering Solution:**
  1. Add an intuitive **"Release to Class"** action button in the column header menu of [ClassRecord.jsx](file:///C:/Users/sadia/SAGE/src/pages/faculty/ClassRecord.jsx).
  2. Display clear column header status chips:
     * `Draft` (Gray / Eye-Off) — Saved privately in class record; visible only to faculty.
     * `Released` (Green / Eye) — Visible in student activity view; actively feeds the advising engine.
  3. Include a confirmation modal when saving a score column: *"Save as draft or release results to enrolled students now?"*

### Gap 3: Bridging the Dual Data Layer (`mockDb.js` vs. Supabase)
* **Challenge:** As noted in [`AGENTS.md`](file:///C:/Users/sadia/SAGE/AGENTS.md), Admin/Dean pages currently run on `mockDb.js` while Faculty/Student portals feature mixed inline data during the ongoing Supabase migration.
* **Engineering Solution:**
  * Build the advising rules as **pure business logic functions** in `src/lib/advisingEngine.js` decoupled from the data transport layer.
  * Define an explicit schema contract for inputs (student profile, released activities, attendance count, posted grades) so the identical engine runs seamlessly over `localStorage` during frontend development and Supabase Edge Functions in production.

### Gap 4: Production Hardening (Edge Function vs. Free OpenRouter)
* **Challenge:** The current implementation in [`openrouter.js`](file:///C:/Users/sadia/SAGE/src/lib/openrouter.js) calls free external models directly from the browser using a client-side environment variable. Free models are prone to HTTP 429 rate limits, sudden outages, and leaked `<think>` tags during live panel presentations.
* **Engineering Solution:**
  1. **Move to Server-Side Execution:** Deploy a Supabase Edge Function (`invoke-advisor`) using an authenticated Supabase JWT. The client never handles the raw LLM API key.
  2. **Deterministic UI Fallback:** If the LLM call times out or fails, the UI gracefully renders the deterministic insight card (headline, observation, metrics, and pre-computed standard action items) with a subtle notice: *"Ask ASPIRE Q&A is temporarily offline, but your academic action items remain active."*
  3. **Strict JSON Schema Parsing:** Use structured output validation to guarantee that the LLM response always conforms to the standard contract (`observation`, `evidence_ids`, `focus_topics`, `actions`, `review_trigger`).

---

## 3. Modular Refactoring of [`AcademicInsights.jsx`](file:///C:/Users/sadia/SAGE/src/pages/student/AcademicInsights.jsx)

The current [`AcademicInsights.jsx`](file:///C:/Users/sadia/SAGE/src/pages/student/AcademicInsights.jsx) is **2,241 lines (116 KB)**. It mixes legacy grade transmutation sliders, inline OpenRouter prompts, and redundant calculations.

It should be decomposed into a clean, maintainable component tree:

```
src/
├── pages/
│   └── student/
│       └── AcademicInsights.jsx          # Shell container: tab state, data fetch, layout
├── components/
│   └── student/
│       └── advisor/
│           ├── TodayTab.jsx              # Section 7.1: Highest-priority concern & next step
│           ├── MyCoursesTab.jsx          # Section 7.2: Course advising cards grid
│           ├── MyProgressTab.jsx         # Section 7.4: Outcome tracking & before/after deltas
│           ├── CourseAdvisingCard.jsx    # Individual course card with risk chip & evidence
│           ├── ActionPlanList.jsx        # Checkable 1-3 action items with status tags
│           ├── EvidenceDrawer.jsx        # Modal/drawer displaying underlying activity proofs
│           └── AskAspireDrawer.jsx       # Section 7.3: Contextual Q&A slide-over drawer
└── lib/
    ├── advisingEngine.js                 # Pure deterministic signal evaluation & benchmarks
    └── advisorContract.js                # Schema definition & JSON parser for advisor payloads
```

---

## 4. Database Schema Additions (SQL Migration)

To support the Advisor without breaking existing tables, execute the following non-destructive schema extensions:

```sql
-- =============================================================================
-- 1. ACTIVITY RELEASE METADATA (Faculty Class Record)
-- =============================================================================
ALTER TABLE public.class_activities
ADD COLUMN IF NOT EXISTS is_released BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS topic_tag VARCHAR(100),
ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

ALTER TABLE public.student_activity_scores
ADD COLUMN IF NOT EXISTS is_released_to_student BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

-- =============================================================================
-- 2. ADVISOR INSIGHTS & PLANS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.advisor_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    class_record_id UUID NOT NULL REFERENCES public.class_records(id) ON DELETE CASCADE,
    signal_type VARCHAR(50) NOT NULL, -- 'consecutive_weak_activity', 'attendance_threshold', 'midterm_milestone'
    severity VARCHAR(20) NOT NULL DEFAULT 'moderate', -- 'low', 'moderate', 'high', 'critical'
    headline VARCHAR(200) NOT NULL,
    observation TEXT NOT NULL,
    evidence_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    focus_topics TEXT[] DEFAULT ARRAY[]::TEXT[],
    status VARCHAR(30) NOT NULL DEFAULT 'new', -- 'new', 'in_progress', 'improved', 'resolved', 'escalated'
    review_trigger VARCHAR(50) NOT NULL DEFAULT 'next_activity_release',
    review_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.advisor_action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_id UUID NOT NULL REFERENCES public.advisor_insights(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'dismissed'
    source VARCHAR(20) NOT NULL DEFAULT 'ai_suggested', -- 'ai_suggested', 'faculty_assigned', 'student_added'
    completed_at TIMESTAMPTZ
);

-- =============================================================================
-- 3. CLOSED-LOOP OUTCOME TRACKING (Efficacy Measurement)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.advisor_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_id UUID NOT NULL REFERENCES public.advisor_insights(id) ON DELETE CASCADE,
    baseline_score NUMERIC(5,2),
    followup_score NUMERIC(5,2),
    score_delta NUMERIC(5,2),
    actions_completed_count INT DEFAULT 0,
    total_actions_count INT DEFAULT 0,
    outcome_status VARCHAR(30) NOT NULL DEFAULT 'pending_followup', -- 'improved', 'unchanged', 'declined'
    evaluated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
ALTER TABLE public.advisor_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own insights"
ON public.advisor_insights FOR SELECT
USING (auth.uid() = student_id);

CREATE POLICY "Students can view own action items"
ON public.advisor_action_items FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.advisor_insights 
    WHERE advisor_insights.id = advisor_action_items.insight_id 
    AND advisor_insights.student_id = auth.uid()
));

CREATE POLICY "Students can update own action items"
ON public.advisor_action_items FOR UPDATE
USING (EXISTS (
    SELECT 1 FROM public.advisor_insights 
    WHERE advisor_insights.id = advisor_action_items.insight_id 
    AND advisor_insights.student_id = auth.uid()
));
```

---

## 5. Standardized Recommendation Contract & Prompt Engineering

To prevent conversational drift and eliminate hallucinated academic records, all model responses must be validated against this JSON schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AdvisorRecommendation",
  "type": "object",
  "required": [
    "headline",
    "observation",
    "evidence_summary",
    "actions",
    "review_trigger",
    "faculty_consultation_recommended",
    "boundary_statement"
  ],
  "properties": {
    "headline": { "type": "string" },
    "observation": { "type": "string" },
    "evidence_summary": {
      "type": "array",
      "items": { "type": "string" }
    },
    "focus_topics": {
      "type": "array",
      "items": { "type": "string" }
    },
    "actions": {
      "type": "array",
      "minItems": 1,
      "maxItems": 3,
      "items": { "type": "string" }
    },
    "review_trigger": { "type": "string" },
    "faculty_consultation_recommended": { "type": "boolean" },
    "boundary_statement": {
      "type": "string",
      "enum": ["This guidance is advisory and does not alter your official institutional grade."]
    }
  }
}
```

### System Prompt for Contextual Q&A (Ask ASPIRE)
```
You are Ask ASPIRE, an academic advising assistant at Dr. Yanga's Colleges, Inc. (DYCI).

CORE CONSTRAINTS:
1. Grounding: Answer ONLY using the academic evidence provided in the authoritative context payload.
2. Authority: You DO NOT calculate grades, change risk statuses, or diagnose personal/psychological issues.
3. Brevity: Keep responses under 100 words. Provide at most three practical study steps.
4. Escalation: If attendance is >= 4 absences or performance remains below passing after multiple activities, advise booking an instructor consultation.
5. Incomplete Data: If the context lacks data to answer a question, explicitly state: "The available course records do not provide enough information to confirm that."
```

---

## 6. Prioritized Implementation Roadmap (Capstone 2 Triage)

| Milestone | Deliverables | Target Timeline | Status |
| :--- | :--- | :--- | :--- |
| **M1: Release UI & Data Foundation** | 1. Add `is_released` toggle to `ClassRecord.jsx`<br>2. Add release indicators to faculty view<br>3. Filter student view to released activities only | Sprint 1 (Days 1–5) | 🟡 Ready for Build |
| **M2: Advisor Workspace Decomposition** | 1. Refactor `AcademicInsights.jsx` into 3 focused workspaces: Today, My Courses, and My Progress<br>2. Keep Ask ASPIRE as a contextual drawer rather than a destination tab<br>3. Implement persistent action checklist state | Sprint 1 (Days 6–10) | 🟡 In Progress |
| **M3: Deterministic Engine Integration** | 1. Centralize 2-activity weak trend logic in `advisingEngine.js`<br>2. Wire 4-absence FDA advisory alert with consultation button | Sprint 2 (Days 11–15) | ⚪ Queued |
| **M4: Ask ASPIRE Edge Function** | 1. Deploy authenticated `invoke-advisor` Edge Function with validated structured JSON<br>2. Route the existing `AskAspirePanel.jsx` drawer through the server<br>3. Preserve bounded deterministic fallback mode | Sprint 2 (Days 16–20) | 🟢 Deployed; authenticated UI smoke test pending |
| **M5: Outcome Delta & Panel Defense Polish** | 1. Track baseline vs. follow-up score in `advisor_outcomes`<br>2. Display "Before vs. After" progress badge<br>3. Run cross-role RLS and security verification | Sprint 3 (Days 21–25) | ⚪ Queued |

---

## 6.1 Product Simplification Decision: Advisor, Not Analytics Dashboard

The Academic Advisor landing page must answer three student questions in order:

1. **What needs my attention today?**
2. **What should I do next?**
3. **Did my follow-through help?**

The following disposition is authoritative for the student experience:

| Existing feature | Decision | Replacement / destination | Reason |
| :--- | :--- | :--- | :--- |
| Component Strength & Weakness Diagnosis | Remove as a permanent four-card dashboard | Surface only the evidence relevant to the current advisory; retain course-level evidence under **My Courses** | A static component grid repeats grade analytics and can overstate certainty when few activities are released. |
| Interactive "What-If" Grade Simulator | Remove from the Academic Advisor | Relocate later to **Score Breakdown / Grade Planning**, gated until an official Midterm Rating exists | Simulation is a planning calculator, not advising. Before Midterm, its assumptions can create false precision. |
| Fixed 3-Pillar Actionable Prescription | Replace | Generate **1–3 contextual actions** from the deterministic recommendation contract | Students should receive only actions supported by their currently released evidence. |
| Faculty Consultations tab | Remove from Advisor navigation | Keep the existing **Request Consultation** workflow and contextual escalation CTA | Consultation is an escalation workflow, not a primary advising workspace. |

### Final information architecture

- **Today** — current deterministic advisory, supporting evidence, and 1–3 checkable next actions.
- **My Courses** — released activity evidence, official Midterm/Final milestones when available, and course-scoped Ask ASPIRE.
- **My Progress** — action completion, current signal, evidence count, and the next review trigger.
- **Ask ASPIRE** — a contextual drawer that explains the visible advisory and records; it never invents a separate risk judgment.

### Acceptance criteria

- The Advisor landing page contains no standalone component-strength grid and no grade simulator.
- The same deterministic recommendation supplies the Today headline, evidence, actions, and Ask ASPIRE context.
- A student can mark recommended actions complete, and completion persists locally across page refreshes until database-backed action tracking is implemented.
- Released activity evidence remains visible in My Courses even before an official Midterm or Final grade exists.
- Official grades remain limited to faculty-posted Midterm Rating and Semestral Grade milestones.
- Consultation remains available from the page header and from contextually justified escalation prompts.

---

## 7. Panel Defense Cheatsheet & FAQs

When presenting the ASPIRE AI Academic Advisor to the defense panel, use these aligned positions:

### Q1: "Why do we need an AI if deterministic rules already compute risk?"
> **Defense Answer:**  
> *"The deterministic engine is the authoritative calculator: it computes grades, compares benchmarks, and monitors attendance. However, raw numbers do not guide behavior. The AI translates those statistical signals into clear, student-friendly explanations, highlights specific focus topics, and formulates 1–3 concrete recovery actions. It acts as an advisory and explanatory interface, never as the academic authority."*

### Q2: "What if the AI hallucinates and tells a student they passed when they failed?"
> **Defense Answer:**  
> *"That cannot happen because the AI never computes or displays official grades. Official grades come exclusively from the deterministic posted records (Midterm and Final). The AI is constrained by strict server-side JSON schemas and has no write access to academic transcripts. Furthermore, every card displays an institutional boundary statement."*

### Q3: "Doesn't proactive advising violate the Capstone 1 ruling against showing daily grade changes?"
> **Defense Answer:**  
> *"No. The panel prohibited continuous real-time term grade recalculations because they cause panic and evaluation retaliation. We strictly enforce that: students still only see their official Midterm and Final grade summaries. Early advising operates exclusively on faculty-released activity results—the exact same quizzes and homework that students already view on classroom platforms (like MS Teams)—providing study advice without leaking unposted term marks."*

### Q4: "How do you prove the AI actually helped instead of just generating text?"
> **Defense Answer:**  
> *"Through the ASPIRE closed-loop outcome model (`advisor_outcomes`). Whenever an advising plan is created, ASPIRE records the baseline assessment. Once the student completes the action items and the next related activity is released, ASPIRE evaluates the measurable score delta. We track empirical follow-through while maintaining academic integrity by reporting correlation rather than claiming unproven causation."*
