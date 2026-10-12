# ASPIRE AI Academic Advisor — Product and Implementation Plan

**Status:** Proposed for team and panel review
**Product:** ASPIRE
**Primary users:** Students, faculty, and deans
**Planning principle:** Advise while the student can still act—not only after a grading period has ended.

---

## 1. Executive Decision

The ASPIRE AI Academic Advisor will be a continuous, evidence-grounded academic intervention feature with two integrated modes:

1. **Proactive Advising** — ASPIRE detects meaningful academic signals and presents a timely recommendation without requiring the student to ask first.
2. **Ask ASPIRE** — The student asks follow-up questions about an existing insight, course, action plan, or supported academic record.

The Advisor will not wait exclusively for official Midterm and Final grades. Official grades will power formal milestone reviews, while faculty-released activity results, attendance records, missing-submission information, and approved faculty interventions will support earlier guidance.

The Advisor will not calculate official grades, create official risk classifications, diagnose personal causes, or make final academic decisions. Those responsibilities remain with deterministic institutional rules and authorized faculty or deans.

---

## 2. Problem Statement

Official student grades are posted only at Midterm and Final. If the Advisor generates guidance only after these postings, much of the opportunity for intervention has already passed.

However, using every faculty-entered score would create a second problem: draft class-record information may be incomplete, change before posting, or be intentionally unavailable to students.

The system therefore needs a strict distinction among:

| Academic information | Meaning | Student Advisor access |
|---|---|---|
| Faculty-private draft score | Saved work in the faculty class record | Not allowed |
| Faculty-released activity result | An individual quiz, assignment, laboratory, project, or assessment released to the student | Allowed for early advising |
| Posted Midterm or Final grade | Official milestone grade | Allowed for formal advising |
| Attendance record | Recorded present, late, or absent status | Allowed according to student visibility policy |
| Faculty intervention plan | Human-approved academic action plan | Allowed for the affected student |
| Internal faculty or dean note | Administrative or deliberative information | Not allowed unless explicitly marked student-visible |

### Core policy

> Faculty-private records may power the faculty Early Warning System. Student-facing AI guidance may use only records that the student is authorized to see.

---

## 3. Student Value Proposition

The Advisor should help a student answer five questions:

1. **What needs my attention right now?**
2. **What evidence supports that observation?**
3. **What can I still do before the next assessment or milestone?**
4. **When will ASPIRE review the situation again?**
5. **When should I involve my instructor or academic adviser?**

The feature does not directly modify grades. It aims to improve the behaviors and decisions that influence later academic outcomes:

- Earlier review of weak topics
- Better prioritization across courses
- Fewer missing submissions
- Timely response to attendance concerns
- Completion of short recovery actions
- Earlier faculty consultation
- Better understanding of academic evidence

ASPIRE must never claim that it caused a grade improvement. It may report measurable changes following an intervention, such as a later assessment improvement or a reduced risk score.

---

## 4. Advising Cadence and Trigger Model

ASPIRE will use a hybrid event-driven model. It may evaluate evidence after every authorized academic event, but it will notify the student only when something meaningful changes.

### 4.1 Trigger matrix

| Event | Internal processing | Student-facing behavior |
|---|---|---|
| First released activity in a course | Establish baseline | No risk notification unless the result is critical |
| New released activity | Compare with configured benchmark and personal baseline | Update silently when no meaningful change exists |
| Two related weak activity results | Create a course concern | Present a short recovery plan |
| Significant downward change | Increase concern priority | Explain the change and recommend next steps |
| Significant improvement after advice | Evaluate intervention outcome | Recognize progress and consider resolving the plan |
| Missing released requirement | Create completion concern | Recommend completion or faculty clarification |
| Third recorded absence | Early attendance warning | Warn that the student is approaching the institutional threshold |
| Fourth recorded absence | FDA advisory signal | Recommend immediate faculty consultation; never auto-fail the student |
| Weekly review | Consolidate non-critical changes | Show one digest only when meaningful changes exist |
| Official Midterm posting | Formal milestone review | Generate a Midterm-to-Final improvement plan |
| Official Final posting | Semester outcome review | Provide reflection and next-term preparation |
| Student opens Ask ASPIRE | Build current authorized context | Answer an on-demand follow-up question |

### 4.2 Notification discipline

- Default cooldown: **72 hours per course** after a student-facing advice notification.
- A critical attendance or academic event may bypass the cooldown.
- Multiple minor signals should be combined into one weekly digest.
- No repetitive “everything is fine” notification should be sent.
- Advice should be updated in place when the underlying concern is the same.
- A new notification should be sent only when the recommendation, severity, or required action materially changes.

### 4.3 Minimum evidence rule

ASPIRE should generally require at least two comparable released results before describing a trend.

One result may trigger immediate advice only when:

- It is below a configurable critical benchmark.
- It is a required assessment recorded as missing.
- It is connected to an attendance or policy threshold.
- Faculty explicitly flags it for intervention.

Benchmarks must be configurable by department, subject, assessment type, or grading setup. They should not be permanently hardcoded to one percentage.

---

## 5. Advice Duration and Review Points

Every recommendation must have a lifecycle and review point.

### Activity-level plan

- Created after meaningful released activity evidence
- Contains one to three actions
- Reviewed after the next related released activity or after seven days
- Resolved, revised, or escalated based on the new evidence

### Attendance plan

- Created when the student approaches or reaches the attendance threshold
- Reviewed after the next attendance event or faculty acknowledgment
- Never changes the official attendance record

### Midterm plan

- Created after official Midterm posting
- Covers the remaining Semi-Final and Final opportunities
- Reviewed whenever a meaningful released activity or attendance change occurs
- Closed when the official Final result is posted

### Final review

- Summarizes patterns, completed interventions, and outcomes
- Recommends preparation for the next semester
- Does not pretend that the completed semester grade can still be recovered

Each plan should display:

- Created date
- Evidence date or version
- Review trigger or review date
- Current status
- Completed actions
- Outcome status

---

## 6. Advice Lifecycle

```text
Signal detected
      ↓
Evidence validated and authorized
      ↓
Insight created or existing insight updated
      ↓
Student reads explanation
      ↓
Student accepts, dismisses, or requests faculty help
      ↓
Student works on one to three actions
      ↓
New authorized academic evidence arrives
      ↓
Improved → resolve or reinforce
Unchanged → revise the plan
Worse → recommend faculty intervention
```

### Recommended statuses

- `new`
- `acknowledged`
- `in_progress`
- `awaiting_evidence`
- `improved`
- `resolved`
- `faculty_support_recommended`
- `escalated`
- `dismissed`
- `expired`

Student dismissal does not alter the deterministic risk score or delete the underlying academic evidence.

---

## 7. Reimagined Student Experience

The Academic Insights feature should become the **ASPIRE Academic Advisor** workspace with four primary areas.

### 7.1 Today

The default view answers: **What should I focus on now?**

Contents:

- Highest-priority active concern
- One positive progress signal when supported
- Current action plan
- Next review point
- Evidence summary
- Ask ASPIRE action
- Faculty consultation action

The view should prioritize one clear next step instead of presenting a wall of unrelated analytics.

### 7.2 My Courses

Each enrolled course receives a compact advising card containing:

- Course name and instructor
- Current evidence availability
- Active concern or stable status
- Risk level from the deterministic engine, when available
- Evidence used
- Current action plan progress
- Next review trigger
- Ask ASPIRE action

An example card:

```text
Programming 2
Needs attention · Moderate risk

Signal
Two recently released activities are below your earlier result.

Evidence
Quiz 2: Linked-List Fundamentals — 11/20
Laboratory Exercise 3: Node Operations — 13/25
Attendance — 3 absences

Action plan
2 of 3 actions completed

Review point
After Quiz 3 is released
```

### 7.3 Ask ASPIRE

Conversation should normally begin from a selected course, insight, or action plan rather than an empty generic chat.

Supported questions include:

- Why was this identified?
- Which assessment affected this most?
- What should I prioritize first?
- What can I realistically do this week?
- Has my performance improved since the advice?
- What does the faculty plan mean?
- Should I request a consultation?

Every factual response should provide a compact evidence section. If the available context is insufficient, the Advisor must say so directly.

### 7.4 My Progress

This area demonstrates whether advising led to measurable academic follow-through.

Contents:

- Active and completed plans
- Actions completed
- Baseline result
- Follow-up result
- Risk movement
- Attendance movement
- Faculty consultations requested
- Concerns resolved or escalated

The system may state:

> Your next released assessment improved by 18 percentage points after this plan was created.

It must not state:

> ASPIRE increased your grade by 18 percentage points.

---

## 8. Standard Recommendation Contract

Every proactive recommendation must contain:

1. **Observation** — What changed?
2. **Evidence** — Which authorized records support it?
3. **Why it matters** — What academic consequence may follow if the pattern continues?
4. **Actions** — No more than three specific, achievable steps.
5. **Review point** — When will the recommendation be reassessed?
6. **Human support** — When should the student contact faculty?
7. **Boundary statement** — The guidance is advisory and does not change official grades.

Every generated recommendation should be structured data first and prose second. The user interface should not depend on parsing an unstructured AI paragraph.

### Proposed structured response

```json
{
  "headline": "Programming 2 needs attention",
  "observation": "Two related released activities are below your earlier result.",
  "evidence_ids": ["activity-id-1", "activity-id-2"],
  "focus_topics": ["Linked-list traversal", "Node insertion"],
  "actions": [
    "Review node structure and traversal",
    "Complete two insertion exercises",
    "Ask the instructor to clarify Quiz 2 feedback"
  ],
  "review_trigger": "next_related_activity_release",
  "faculty_support_recommended": false,
  "limitations": "This guidance does not change your official grade."
}
```

---

## 9. Role and Authority Boundaries

### Deterministic signal engine

Responsible for:

- Comparing released activity results
- Applying configured academic benchmarks
- Tracking missing submissions
- Evaluating attendance thresholds
- Calculating risk scores and classifications
- Detecting improvement or decline
- Determining whether a meaningful event occurred

### AI Academic Advisor

Responsible for:

- Explaining a supplied academic signal
- Translating evidence into student-friendly language
- Suggesting bounded academic actions
- Answering contextual follow-up questions
- Acknowledging missing or insufficient evidence
- Recommending human consultation when appropriate

### Faculty

Responsible for:

- Releasing activity results to students
- Interpreting assessment quality and instructional context
- Reviewing FDA recommendations
- Confirming or replacing intervention actions
- Providing official academic feedback
- Making course-level academic judgments

### Dean

Responsible for:

- Monitoring aggregate and escalated risk
- Reviewing intervention outcomes
- Enforcing governance and academic policy
- Auditing whether advising is timely, consistent, and authorized

---

## 10. Faculty Workflow

Faculty need a clear distinction between saving a score and releasing it.

### Required actions

- **Save Draft** — Stores the class-record score privately.
- **Release Activity Result** — Makes the individual activity result visible to the affected students and eligible for student-facing advising.
- **Post Midterm/Final Grade** — Publishes the official milestone grade.
- **Create Faculty Intervention** — Adds a human-approved plan or consultation recommendation.

When releasing an activity result, faculty should see:

- Activity title and description
- Number of scored students
- Missing or incomplete records
- Release confirmation
- Statement that released results may power student-facing advising

Faculty should be able to inspect the deterministic signal and the evidence that produced it. They should not be required to approve every low-risk student message, but they must remain the authority for formal interventions.

---

## 11. Data Model Changes

### 11.1 Extend activity scores

Add release metadata to `student_activity_scores` or introduce a release record associated with an activity:

```text
is_released_to_student
released_at
released_by
student_feedback
```

If an activity is released to the whole class, release metadata may live on `class_activities`. If faculty may release results individually, it must live on `student_activity_scores`.

### 11.2 Advisor events

Recommended table: `advisor_events`

```text
event_id
student_id
class_record_id
event_type
source_type
source_id
occurred_at
processed_at
context_version
```

### 11.3 Advisor insights

Extend `student_academic_insights` or replace it with a versioned structure containing:

```text
insight_id
student_id
class_record_id
signal_type
severity
headline
observation
evidence_snapshot
status
review_trigger
review_at
generated_at
context_hash
model_version
```

### 11.4 Action plans

Recommended table: `advisor_action_plans`

```text
plan_id
insight_id
student_id
class_record_id
status
created_at
review_at
resolved_at
resolution_reason
```

Recommended child table: `advisor_action_items`

```text
action_item_id
plan_id
description
status
completed_at
source
```

### 11.5 Conversation records

Recommended tables:

- `advisor_conversations`
- `advisor_messages`

Conversation storage should be minimized. Retention duration, faculty visibility, deletion policy, and audit rules must be defined before production use.

### 11.6 Intervention outcomes

Recommended table: `advisor_outcomes`

```text
outcome_id
plan_id
baseline_snapshot
followup_snapshot
risk_score_delta
assessment_delta
attendance_delta
action_completion_rate
outcome_status
evaluated_at
```

---

## 12. Context-Building Rules

The student-facing context builder may include only:

- The authenticated student's records
- Faculty-released activity results
- Officially posted Midterm and Final grades
- Student-visible attendance records
- Deterministic risk factors authorized for display
- Student-visible faculty plans
- Current and previous advisor plans

It must exclude:

- Another student's data
- Unreleased draft scores
- Draft Midterm or Final computations
- Faculty-private notes
- Dean deliberations
- Hidden system prompts
- Provider API credentials

Every context payload should include record identifiers and timestamps so generated claims can be traced to their source.

---

## 13. Security and Privacy Requirements

- All model calls must be made through an authenticated server-side Edge Function.
- Model provider keys must never be included in the browser bundle.
- Row Level Security must restrict students to their own records.
- The Edge Function must independently verify the caller's identity and authorization.
- The server must construct authoritative context; it must not trust academic values supplied by the browser.
- Only minimum necessary academic data should be sent to the model provider.
- Requests, model version, evidence identifiers, and response status should be auditable.
- Raw conversations should not automatically become visible to faculty or deans.
- Retention and deletion rules must comply with the Data Privacy Act of 2012.

---

## 14. Failure and Fallback Behavior

If the conversational model is unavailable:

- Existing advisor cards and deterministic evidence remain visible.
- Students can still inspect their action plan.
- Students can still request faculty consultation.
- The interface should state that Ask ASPIRE is temporarily unavailable.
- The system must not replace missing AI output with fabricated guidance.

If evidence is insufficient:

- ASPIRE should explicitly state what information is missing.
- It may provide general study-planning guidance only when clearly labeled as general.
- It must not assign a risk cause or create a subject-specific conclusion.

---

## 15. Outcome Measurement

The feature should be evaluated using measurable academic and product outcomes.

### Academic follow-through

- Percentage of plans acknowledged
- Action-item completion rate
- Change in the next comparable released assessment
- Change in missing-submission count
- Change in attendance risk
- Change in deterministic risk score
- Faculty consultation completion rate
- Time from signal detection to student acknowledgment

### AI quality

- Evidence-grounding accuracy
- Unsupported-claim rate
- Correct insufficient-evidence responses
- Authorization failure rate
- Response latency
- Student usefulness rating
- Faculty agreement with escalated recommendations

### Claims policy

ASPIRE may report association and temporal change. It must not claim causal academic improvement without a valid research design.

---

## 16. Implementation Phases

### Phase 0 — Product and policy approval

- Approve the student-visible versus faculty-private data boundary.
- Approve activity-release semantics.
- Define configurable academic benchmarks.
- Define notification cooldown and weekly digest behavior.
- Approve retention and privacy policy for conversations.

**Exit condition:** Written sign-off on the advising operating model.

### Phase 1 — Academic event and release foundation

- Add activity-result release metadata.
- Separate draft score saving from student release.
- Create advisor event records.
- Centralize deterministic signal calculation.
- Remove duplicate or conflicting risk classifications.
- Add evidence identifiers and timestamps.

**Exit condition:** The system can prove which authorized event triggered an insight.

### Phase 2 — Proactive Advisor workspace

- Replace the current analytics-heavy landing view with Today.
- Build course advising cards.
- Implement action-plan lifecycle and review points.
- Add evidence drawers.
- Add empty, pending, stable, improving, warning, and critical states.

**Exit condition:** A student can understand one concern and its next action without using chat.

### Phase 3 — Ask ASPIRE

- Move model calls to an authenticated Edge Function.
- Build server-side context retrieval and authorization.
- Require structured model output.
- Add suggested questions and free-form follow-ups.
- Display evidence references with each factual answer.
- Add rate limits, message limits, and graceful failure.

**Exit condition:** Ask ASPIRE answers supported questions without using unauthorized or unreleased records.

### Phase 4 — Faculty intervention loop

- Add faculty signal review.
- Connect student escalation to consultation requests.
- Allow faculty-authored action plans.
- Mark which actions came from the engine, AI, student, or faculty.
- Notify students when faculty changes an intervention plan.

**Exit condition:** High-risk concerns have a clear human handoff.

### Phase 5 — Outcome tracking

- Capture intervention baselines.
- Compare the next relevant evidence.
- Resolve or revise plans automatically according to deterministic rules.
- Add student progress history.
- Add dean aggregate outcome reporting.

**Exit condition:** The team can demonstrate whether advice was followed and what changed afterward.

### Phase 6 — Security and production readiness

- Enable and test Row Level Security.
- Perform cross-role access tests.
- Remove browser-exposed model keys.
- Add audit logging and retention controls.
- Conduct prompt-injection and data-leakage tests.
- Load-test event processing and Edge Functions.

**Exit condition:** Production security and privacy checks pass.

---

## 17. Capstone MVP Scope

The recommended minimum defensible implementation includes:

1. Faculty release of individual activity results
2. Deterministic activity and attendance signal detection
3. One active advising plan per student per course
4. Evidence-backed proactive advisor cards
5. Ask ASPIRE contextual follow-up questions
6. Student acknowledgment and action tracking
7. Faculty consultation escalation
8. One before-and-after outcome comparison
9. Server-side model invocation and authorization

The MVP should exclude:

- General-purpose tutoring
- Assignment generation
- Automatic program-shift decisions
- Psychological or motivational diagnosis
- Unlimited conversation history
- Long-term career advising
- AI-authored official faculty interventions

---

## 18. Acceptance Criteria

The feature is ready for capstone demonstration when:

- A faculty member can save an activity score without exposing it to a student.
- A faculty member can release an individual activity result.
- Only released activity results appear in student-facing evidence.
- A meaningful second weak result creates or updates one course insight.
- Minor normal changes do not generate repeated notifications.
- A student can see the observation, evidence, actions, and review point.
- Ask ASPIRE can explain why the insight exists.
- Ask ASPIRE refuses to invent a cause when evidence is insufficient.
- The student can request a faculty consultation from the insight.
- The next comparable activity updates the plan outcome.
- Official Midterm posting creates a formal remaining-semester plan.
- Official Final posting closes the active semester plan.
- The AI does not calculate, change, or override an official grade or risk classification.
- A student account cannot retrieve another student's advisor context.
- The model provider key is absent from the client bundle.

---

## 19. Panel Defense Position

### Why use AI when deterministic rules already detect risk?

The deterministic engine detects and classifies the academic condition. AI explains the condition in student-friendly language, proposes bounded next steps, and supports contextual follow-up questions. It is an explanation and guidance layer, not the academic authority.

### Why is the advice not too late?

The Advisor uses faculty-released activity results and attendance evidence during the grading period. Midterm and Final postings are formal review points, not the only triggers.

### How is student privacy protected?

Student-facing context contains only authorized records. Draft scores and private faculty notes remain excluded. Model requests are authenticated and executed server-side.

### How is effectiveness demonstrated?

Each plan records a baseline, actions, review point, and follow-up outcome. ASPIRE reports measurable changes after the intervention without claiming unproven causation.

---

## 20. Final Recommendation

ASPIRE should evaluate authorized academic evidence whenever it changes, but advise only when a meaningful event occurs. Faculty-released activity results should power early student guidance; posted Midterm and Final grades should power formal milestone reviews; faculty-private drafts should remain limited to the faculty Early Warning System.

The product should be presented as:

> **ASPIRE AI Academic Advisor — proactive, conversational, evidence-grounded academic guidance with human-supported intervention.**

