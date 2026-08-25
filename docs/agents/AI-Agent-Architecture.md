# SAGE AI Agent Architecture

Building intelligent agents into SAGE to fulfill **FR34** (Student Academic Recommendations) and **FR35** (Faculty Fitness Predictions), plus additional value-add agents that leverage existing data.

---

## Proposed Agents

### Overview

| # | Agent Name                              | Purpose                                                                | Priority           | Triggered By                 |
| - | --------------------------------------- | ---------------------------------------------------------------------- | ------------------ | ---------------------------- |
| 1 | **Student Academic Advisor**      | Per-student recommendation: continue / at-risk / recommend-shift       | 🔴 Critical (FR34) | Grade posting, on-demand     |
| 2 | **Faculty Fitness Predictor**     | Per-faculty verdict: recommended / needs-improvement / not-recommended | 🔴 Critical (FR35) | Eval window close, on-demand |
| 3 | **Early Warning Analyst**         | Enriches the EWS indicators with actionable context                    | 🟡 High            | Score save events            |
| 4 | **Grade Anomaly Detector**        | Flags statistical outliers in grade distributions                      | 🟡 High            | Grade posting                |
| 5 | **Report Narrator**               | Generates natural-language summaries for Dean reports                  | 🟢 Medium          | On-demand from Dean portal   |
| 6 | **Evaluation Sentiment Analyzer** | Extracts themes from free-text eval comments                           | 🟢 Medium          | Eval window close            |
| 7 | **Smart Notification Composer**   | Writes personalized, context-aware notification messages               | ⚪ Optional        | Any notification trigger     |

---

## Agent 1: Student Academic Advisor 🔴

> **Requirement**: FR34 — *"Generate an AI-based recommendation per student advising whether to continue their course based on academic performance."*

### Data Pipeline

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│ component_scores │────▶│  posted_grades    │────▶│  Claude API Prompt   │
│ grade_components │     │  (all periods)    │     │  (structured JSON)   │
└─────────────────┘     └──────────────────┘     └──────────┬───────────┘
                                                            │
                        ┌──────────────────┐                ▼
                        │ ai_student_      │◀──── Parse & store response
                        │ recommendations  │
                        └──────────────────┘
```

### Input Data (assembled per student)

| Source Table         | Fields Used                                |
| -------------------- | ------------------------------------------ |
| `posted_grades`    | All term grades (prelim → final), remarks |
| `component_scores` | Raw scores per component                   |
| `grade_components` | Component weights, max scores              |
| `enrollments`      | Subjects enrolled this semester            |
| `users`            | Student name, department                   |

### Output → `ai_student_recommendations`

| Field              | Value                                              |
| ------------------ | -------------------------------------------------- |
| `recommendation` | `continue` \| `at_risk` \| `recommend_shift` |
| `summary`        | 2-3 paragraph AI narrative                         |
| `basis_snapshot` | JSON of all grade data at generation time          |

### Trigger Points

- **Automatic**: After a faculty posts grades for any period (Supabase database trigger / Edge Function)
- **On-demand**: Student clicks "Generate Recommendation" on `AIRecommendation.jsx`
- **Batch**: Dean requests bulk generation from `AtRiskStudents.jsx`

### Prompt Strategy

```
You are an academic counselor AI for Dr. Yanga's Colleges, Inc. (DYCI).

Given the student's complete grade profile below, provide:
1. A verdict: "continue", "at_risk", or "recommend_shift"
2. A 2-3 paragraph summary explaining your reasoning
3. Specific, actionable recommendations

Grading scale: 1.00 (highest) to 5.00 (failing). Passing is ≤ 3.00.

Consider:
- GWA trend across terms (improving, declining, stagnant)
- Number of failed/near-failing subjects
- Component-level weaknesses (exams vs activities vs projects)
- Risk probability of failing remaining terms

Student Data:
{structured_json_payload}
```

---

## Agent 2: Faculty Fitness Predictor 🔴

> **Requirement**: FR35 — *"Generate an AI-based faculty fitness prediction assessing whether the professor is recommended for the next school year, based on evaluation ratings and comments."*

### Data Pipeline

```
┌────────────────────┐     ┌────────────────────┐     ┌──────────────────┐
│ evaluation_ratings │────▶│  Aggregate per     │────▶│  Claude API      │
│ evaluation_comments│     │  criterion + stats │     │  Prompt          │
└────────────────────┘     └────────────────────┘     └────────┬─────────┘
                                                               │
                           ┌────────────────────┐              ▼
                           │ ai_faculty_        │◀──── Parse response
                           │ predictions        │
                           └────────────────────┘
```

### Input Data (assembled per faculty)

| Source Table            | Fields Used                             |
| ----------------------- | --------------------------------------- |
| `evaluation_ratings`  | All ratings per criterion, per response |
| `evaluation_comments` | Free-text student comments (anonymized) |
| `evaluation_criteria` | Criterion labels and descriptions       |
| `evaluation_windows`  | Section, response count, window dates   |
| `class_records`       | Subjects taught, sections handled       |

### Output → `ai_faculty_predictions`

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| `verdict`        | `recommended` \| `needs_improvement` \| `not_recommended` |
| `summary`        | AI narrative paragraph                                          |
| `strong_points`  | Bullet list of strengths                                        |
| `weak_points`    | Bullet list of areas for improvement                            |
| `basis_snapshot` | JSON of all evaluation data at generation time                  |

### Trigger Points

- **Automatic**: When an evaluation window closes (`is_closed` → `true`)
- **On-demand**: Dean views `EvalResultsFaculty.jsx`
- **On-demand**: Faculty views own results at `EvalResultsMy.jsx`

### Prompt Strategy

```
You are an academic HR analyst AI for DYCI.

Given the faculty member's complete evaluation data below, provide:
1. A verdict: "recommended", "needs_improvement", or "not_recommended"
2. A summary paragraph explaining the overall assessment
3. A list of strong points (things the faculty excels at)
4. A list of weak points (areas needing improvement)

The evaluation uses 7 criteria rated 1-4 (4 = highest).
Student comments are anonymized — never attempt to identify students.

Consider:
- Average rating per criterion vs department average
- Consistency across sections
- Sentiment and themes in student comments
- Patterns indicating teaching effectiveness

Faculty Evaluation Data:
{structured_json_payload}
```

---

## Agent 3: Early Warning Analyst 🟡

> Enriches existing EWS indicators (green/yellow/red) from `ScoreInput.jsx` with AI-generated context.

### What It Does

- When a student's running grade crosses into **yellow** (at-risk) or **red** (failing trajectory), this agent generates a brief explanation of *why* and *what to do*
- Powers the tooltip content on EWS indicators (FR16)
- Provides faculty with intervention suggestions

### Input

- Current running grade + component breakdown
- Historical grade trend for the student
- Class average for comparison

### Output

- Short text (1-2 sentences) explaining the risk factor
- Suggested intervention action for the faculty

### Example Output

> *"Student is 12% below class average in Term Exams (scored 22/40 vs class avg 31/40). Quiz and activity scores are passing. Recommend exam review session or one-on-one consultation."*

---

## Agent 4: Grade Anomaly Detector 🟡

> Flags unusual patterns in grade distributions for Dean oversight.

### What It Does

- Analyzes grade distributions when grades are posted
- Detects: unusually high fail rates, suspiciously uniform grades, significant section-to-section variance for the same subject
- Generates alerts visible on `GradeDistribution.jsx`

### Input

- `posted_grades` aggregated per class record
- Historical grade distributions for the same subject

### Output

- Anomaly flag with severity level
- Natural-language explanation
- Suggested action for the Dean

---

## Agent 5: Report Narrator 🟢

> Generates natural-language summaries for the Dean's `SummaryReports.jsx` exports.

### What It Does

- When a Dean generates a summary report, this agent writes an executive summary paragraph
- Converts tabular data into readable narrative
- Highlights key metrics, trends, and concerns

### Input

- Report type + filtered data (semester, department, etc.)
- Aggregated KPIs from across the system

### Output

- 1-2 paragraph executive summary
- Key highlights / concerns bullet list

---

## Agent 6: Evaluation Sentiment Analyzer 🟢

> Extracts themes and sentiment from `evaluation_comments`.

### What It Does

- Groups free-text evaluation comments into themes (e.g., "clear explanations", "late attendance", "engaging activities")
- Scores overall sentiment: positive / mixed / negative
- Visible on `EvalResultsFaculty.jsx` and `EvalResultsMy.jsx`

### Input

- All `evaluation_comments` for a faculty-section window

### Output

- Top 3-5 recurring themes with frequency
- Overall sentiment label
- Representative anonymous quotes per theme

---

## Agent 7: Smart Notification Composer ⚪

> Writes personalized notification messages instead of generic templates.

### What It Does

- Replaces static notification strings with context-aware messages
- Example: Instead of *"Your Prelim grade has been posted"*, generates *"Prof. Rivera has posted your Prelim grade for IT101 - Introduction to Computing. Your grade: 2.00 (Passed). View your full breakdown →"*

### Input

- Notification type + contextual data from the triggering event

### Output

- `notifications.message` field content

---

## Technical Architecture

### Recommended Stack

```
┌─────────────────────────────────────────────────┐
│                  React Frontend                  │
│         (existing SAGE pages + new UI)           │
└──────────────────────┬──────────────────────────┘
                       │ fetch / RPC
                       ▼
┌─────────────────────────────────────────────────┐
│           Supabase Edge Functions                │
│                                                  │
│   ┌──────────────┐  ┌──────────────────────┐    │
│   │ Agent Router  │  │ Data Assembler       │    │
│   │ (picks agent) │  │ (queries DB, builds  │    │
│   └──────┬───────┘  │  structured payload)  │    │
│          │           └──────────┬───────────┘    │
│          │                      │                │
│          ▼                      ▼                │
│   ┌──────────────────────────────────────┐      │
│   │         Claude API Call               │      │
│   │   (system prompt + data payload)      │      │
│   └──────────────────┬───────────────────┘      │
│                      │                           │
│                      ▼                           │
│   ┌──────────────────────────────────────┐      │
│   │      Response Parser & Validator      │      │
│   │   (extract JSON, validate schema)     │      │
│   └──────────────────┬───────────────────┘      │
│                      │                           │
│                      ▼                           │
│   ┌──────────────────────────────────────┐      │
│   │      Store to Supabase Tables         │      │
│   │   (ai_student_recommendations,        │      │
│   │    ai_faculty_predictions,             │      │
│   │    notifications)                      │      │
│   └──────────────────────────────────────┘      │
└─────────────────────────────────────────────────┘
```

### Key Design Decisions

**Edge Functions vs. Client-side calls**: All Claude API calls should go through Supabase Edge Functions (Deno), NOT directly from the React frontend. This keeps the API key secure and allows server-side data assembly.

**`basis_snapshot` field**: Both AI tables store a `JSONB` snapshot of the input data at generation time. This is critical for audit trails and reproducibility — the AI's reasoning can always be traced back to the exact data it received.

### File Structure (New Files)

```
src/
├── lib/
│   ├── agents/
│   │   ├── studentAdvisor.js        # Agent 1 - data assembly + API call
│   │   ├── facultyPredictor.js      # Agent 2 - data assembly + API call
│   │   ├── earlyWarningAnalyst.js   # Agent 3 - lightweight analysis
│   │   ├── gradeAnomalyDetector.js  # Agent 4 - statistical analysis
│   │   ├── reportNarrator.js        # Agent 5 - summary generation
│   │   ├── sentimentAnalyzer.js     # Agent 6 - comment analysis
│   │   └── notificationComposer.js  # Agent 7 - message personalization
│   ├── agentRouter.js               # Routes requests to the right agent
│   └── claudeClient.js             # Shared Claude API client wrapper

supabase/
└── functions/
    ├── invoke-agent/               # Main Edge Function for agent calls
    │   └── index.ts
    ├── on-grade-posted/            # DB trigger: auto-run Agent 1 & 4
    │   └── index.ts
    └── on-eval-closed/             # DB trigger: auto-run Agent 2 & 6
        └── index.ts
```

---

## Open Questions

1. **Agent scope for capstone defense**: Are Agents 1 & 2 sufficient for your capstone requirements, or would you like to implement additional agents (3-7) to strengthen the demo?
2. **Real-time vs. batch**: Should the Student Academic Advisor run automatically every time a grade is posted (real-time), or only when explicitly triggered by the student/dean (on-demand)?
3. **Cost considerations**: Each Claude API call has a cost. For a capstone demo, do you want a caching strategy (e.g., only regenerate if grades have changed since last generation)?
4. **Supabase vs. Mock implementation**: The current codebase uses `localStorage` via `mockDb.js`. Should the agents work with mock data now (client-side Claude calls for demo purposes), then migrate to Supabase Edge Functions later? Or set up Supabase first?
5. **Claude API Key**: Do you already have an Anthropic API key, or should we account for a mock/simulated AI response mode for development?

---

## Phased Implementation Plan

### Phase 1: Core Infrastructure

- [ ] Create `claudeClient.js` (shared API wrapper with error handling, retries, rate limiting)
- [ ] Create `agentRouter.js` (agent selection logic)
- [ ] Add `VITE_CLAUDE_API_KEY` env variable support

### Phase 2: Agent 1 — Student Academic Advisor (FR34)

- [ ] Build data assembly pipeline (query grades, scores, enrollments)
- [ ] Design and test system prompt
- [ ] Parse Claude response into `ai_student_recommendations` schema
- [ ] Update `AIRecommendation.jsx` to call agent and display live results
- [ ] Update `AtRiskStudents.jsx` to show AI recommendations

### Phase 3: Agent 2 — Faculty Fitness Predictor (FR35)

- [ ] Build data assembly pipeline (query evaluations, ratings, comments)
- [ ] Design and test system prompt
- [ ] Parse Claude response into `ai_faculty_predictions` schema
- [ ] Update `EvalResultsMy.jsx` to display AI prediction
- [ ] Update `EvalResultsFaculty.jsx` to show AI prediction per faculty

### Phase 4: Additional Agents (3-7, if approved)

- [ ] Implement selected additional agents
- [ ] Integrate into respective UI pages

---

*End of AI Agent Architecture Proposal — SAGE, DYCI Capstone Project AY 2025-2026*
