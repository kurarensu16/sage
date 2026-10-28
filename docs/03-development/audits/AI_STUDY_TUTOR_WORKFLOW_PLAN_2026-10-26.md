# AI Study Tutor Workflow Plan - 2026-10-26

**Status:** Proposed design. No code, migration, or edge function exists yet. Every file listed under "Suggested build order" still requires its own developer confirmation before it is created or edited, per `AGENTS.md`.
**Scope:** Adds one new, student-initiated AI mode ("Start Tutoring") and one new edge function. Does **not** change `invoke-advisor`, `generate-intervention-draft`, grading, risk, or evaluation logic in any way.
**Trigger:** Capstone defense panel ruling. The feature named "AI Study Tutor" in the paper functions only as an advising assistant in the running system — `supabase/functions/invoke-advisor/index.ts` rule 11 explicitly states "You are an academic advisor, not a tutor or a student." The panel also noted a general-purpose assistant (e.g. ChatGPT) could reproduce the current advising output if a student pasted in their own grades, so the gap is not naming alone — the system needs tutoring behavior a generic assistant cannot replicate unassisted.

## Objective

Add a tutoring mode that:

1. Is reachable only when the student deliberately starts it ("Start Tutoring"), never blended into advising chat.
2. Teaches concepts, builds study plans, and gives practice questions — never grades, risk tiers, FDA, or standing (that stays advisor-only, in `invoke-advisor`, unchanged).
3. Personalizes using only the student's own recorded `topicTag` performance evidence in the relevant subject, without the student copying grades into a third-party tool.
4. Never lets the model free-generate external links from memory — resources come only from a faculty-curated table (or a real grounded-search tool call if the project later adopts a provider that supports one).
5. Stays non-binding, with its own boundary statement, separate from the advisor's.
6. Stays fully decoupled from the evaluation/intervention system in **both directions** — see "Privacy and data boundary" below.

## Decision: two modes, one page, two backends

| | Ask ASPIRE (existing, unchanged) | Start Tutoring (new) |
|---|---|---|
| Purpose | Explain standing, grades, risk, policy | Teach a concept, build a plan, give practice |
| Entry | Free-text chat | Menu wizard, tap until the leaf |
| Data used | Official/tentative grades, risk evidence | `topicTag` performance history only — no grade/standing/risk/evaluation fields anywhere in the context payload |
| Backend | `invoke-advisor` (unchanged) | New function: `invoke-study-tutor` |
| Boundary statement | "This guidance is advisory and does not alter your official institutional grade." | "This is practice guidance for self-study, not an official grade or faculty decision." |

## Privacy and data boundary

Settled explicitly, in both directions:

- **Faculty, Dean, and admin have zero visibility into tutor data.** `student_tutor_plans`, `student_tutor_practice_attempts`, and `student_tutor_log` are readable only by the owning student (owner-only RLS, the same pattern already used for other student-owned tables). None of them are joined into any faculty dashboard, Dean report, or `generate-intervention-draft` input — not now, and not as a deferred "later" option. That idea was considered during design and intentionally dropped, not postponed.
- **The tutor has zero visibility into evaluation/intervention data.** `invoke-study-tutor` never queries `student_risk_evaluations` or any faculty-authored advising plan. It is built only from the student's own recorded activity performance (`topicTag` and scores) in the relevant subject — the same evidence already used for weak-topic detection. Risk, GWA, standing, and faculty intervention content already have a home in Ask ASPIRE; the tutor does not duplicate or reference them.

Net effect: the tutor and the evaluation/advising system are two fully separate data worlds that happen to share one page.

## Full menu tree

```
Start Tutoring
│
├─ Step 1: Scope
│    ○ Overall (across all my subjects)
│    ○ <Subject A> / <Subject B> / ...        live, from the student's actual enrolled classes
│
├─ Step 2: Focus
│    If Overall:
│      ○ Topics that need review across my subjects   topicTag, low-scoring, all classes
│      ○ General study skills / time management
│    If a specific subject:
│      ○ My weak topics in <Subject>                   topicTag, scoped to that subject
│      ○ All topics covered so far in <Subject>        every distinct topicTag recorded
│
├─ Step 3: Action
│    ○ Explain this concept
│    ○ Give me a study plan
│    ○ Give me practice questions
│    ○ Give me resources
│
└─ Step 4: Shape (depends on Step 3)
     │
     ├─ Explain this concept
     │    no pre-menu step; AI answers directly, then offers 3 chips:
     │    [Explain more simply]  [Give me practice on this]  [Done]
     │
     ├─ Give me a study plan
     │    ○ This week
     │    ○ Until my next activity/exam on this topic
     │    (item count fixed at 3-5 checklist items either way)
     │
     ├─ Give me practice questions
     │    ○ Easy   ○ Moderate   ○ Challenging   ○ Mixed
     │    (count fixed at 5 questions; "Mixed" spans easy to challenging)
     │
     └─ Give me resources
          ○ Reading   ○ Video   ○ Any
          (count fixed, up to 3, limited by what is curated per topic)
```

One call to `invoke-study-tutor` fires once Step 4 is answered (or once the student taps a post-answer chip on the Explain path), carrying every chosen value in a single request — never a half-scoped call.

## UI: entry screen and View Plan

### Entry screen (merged, not two separate screens)

The "Start Tutoring" entry point is one list, not a separate Scope menu plus a separate "My Study Plans" dashboard: **Overall**, plus a tile per enrolled subject — the same set as Step 1 (Scope) already needs. Each subject tile also carries its plan status inline:

- No active plan → tile shows just the subject name; tapping it proceeds into the normal Focus -> Action -> Shape flow.
- Active plan exists → tile shows a badge, e.g. **"Plan in progress — 2 of 4 done"**, with a **[Continue Plan]** shortcut. Tapping the shortcut opens the View Plan screen directly; tapping the rest of the tile still proceeds into the normal menu flow, since Explain/Practice/Resources are independent of whether a plan exists for that subject.

Because the cap is N+1, this list is never longer than enrolled subjects + "Overall," so it stays readable at the cap.

### View Plan screen

Opened from a subject's **[Continue Plan]** badge. Shows the checklist as rows, each with:

- a manual checkbox (self-reported, non-binding — this is self-study, not a faculty-verified task like the evaluation system's advising plan, so nothing requires outside approval)
- a contextual shortcut when the item's wording matches one of the four actions (e.g. an item about practice questions gets a **[Do practice now]** button; an item about reviewing/watching gets **[Explain this again]** or **[Get resources]**); a purely self-directed item (e.g. "redo the Quiz 2 items you missed") gets a checkbox only, no shortcut
- when a shortcut's matching action completes, the system asks **"Mark this plan item done?"** — the student still has final say; nothing auto-ticks silently from background activity

A **[Start a new plan instead]** option is also available from this screen, using the same renew flow as elsewhere (old row -> `superseded`, new row created).

### Scenarios

| Scenario | What happens |
|---|---|
| Student checks 1 of 3 items manually, does nothing else | Plan stays `active`, shows "1 of 3 done," still occupies that subject's scope-key slot. |
| Student taps **[Do practice now]** from a checklist item, finishes it | Practice runs normally (logged, dynamic per attempt history) -> prompt "Mark this done?" -> ticks the item if confirmed. |
| Student requests Resources on that topic, unrelated to any specific checklist wording | Runs as a normal one-shot Resources call, logged — does not touch the plan at all. |
| Student finishes all items (any mix of manual ticks and shortcut completions) | Plan auto-flips to `completed`, moves to the Completed section, frees the scope-key slot immediately. |
| Student opens the plan, decides to abandon it unfinished | **[Start a new plan instead]** -> old plan `superseded`, new one created. |
| Student ignores the plan for days, uses Explain/Practice/Resources freely in the meantime | All of that logs normally with zero effect on the plan — it sits at whatever completion state it was left at. |
| Student manually ticks an item they didn't actually do | Allowed — self-reported and non-binding, unlike the faculty evaluation's verified tasks. No integrity check needed. |

Net rule: the checklist only ever changes through a manual tick, or a shortcut-triggered action the student explicitly confirms as done — never automatically from background activity the student didn't confirm.

## Process flow (request lifecycle)

```
Student taps through Steps 1-4 (client only; no AI call yet)
        |
        v
Client builds request: { scope, subjectCode?, topic, action, shape }
        |
        v
POST to invoke-study-tutor, Authorization: Bearer <session token>
        |
        v
Edge function:
  1. Verify bearer token -> Supabase Auth user
  2. Load profile, reject if role != 'student'
  3. Enforce per-user rate limit (same windowed-counter pattern as
     invoke-advisor, separate counter/key so tutor traffic cannot
     exhaust the advisor's limit or vice versa)
  4. Load the student's own topicTag activity history for the
     requested scope/topic only -- never grades, GWA, risk tier,
     FDA, or evaluation fields of any kind
  5. Redact direct identifiers (name, email, student number, user id)
     from any free text, same redactDirectIdentifiers() pattern as
     invoke-advisor
  6. For action = "plan": check student_tutor_plans for an existing
     active row at this scope key (see Persistence, below)
  7. For action = "practice": read student_tutor_practice_attempts
     for this topic to shape a fresh, non-repeating question set
  8. Build the tutor system prompt for the chosen action
  9. Call the model (OpenRouter fallback chain for explain/plan/
     practice; curated-table lookup, or grounded search call, for
     resources)
  10. Parse strict JSON, validate against the shared envelope shape
  11. Persist as needed (student_tutor_plans / student_tutor_practice_attempts
      / student_tutor_log) and return
      { message, study_plan?, assessment?, resources?, boundary_statement }
        |
        v
Client renders the leaf-specific view (prose / checklist / quiz /
resource cards) and, for Explain, shows the 3 follow-up chips
```

## Response envelope

```ts
type TutorResponse = {
  message: string                     // always present; prose summary or lead-in
  study_plan?: { topic: string; action: string; by: string }[]              // "plan" only
  assessment?: { question: string; choices?: string[]; answer: string }[]   // "practice" only
  resources?: { title: string; url: string }[]                              // "resources" only
  boundary_statement: 'This is practice guidance for self-study, not an
                        official grade or faculty decision.'
}
```

Same discipline as `invoke-advisor`: the boundary statement is force-injected server-side, never trusted from the model's own copy.

## Persistence and accumulation

Unlike `invoke-advisor` (request/response only, nothing is stored, a refresh discards it), tutor interactions are recorded, and the **study plan** leaf specifically persists across sessions since it is meant to be acted on over days, not read once.

### Three tables, split by data shape

| Table | Covers | Why it exists |
|---|---|---|
| `student_tutor_plans` | `plan` only | Has a lifecycle (`active` / `completed` / `superseded`/`deleted`) and the cap below |
| `student_tutor_practice_attempts` | `practice` only | Per-question correctness, drives dynamic question selection on repeat requests |
| `student_tutor_log` | all four actions, including `explain` and `resources` | Plain history/audit trail of every interaction — no lifecycle or correctness to track for these two |

`explain` and `resources` are one-shot outputs with nothing to finish, cap, or renew, so they only ever write a row to `student_tutor_log` (`student_id`, `subject_code`, `topic`, `action`, `shape`, `request` jsonb, `response` jsonb, `created_at`). `plan` and `practice` calls write to their own specialized table *and* to `student_tutor_log`, so the log stays a complete history across all four actions.

`student_tutor_plans` columns: `student_id`, `subject_code` (nullable; `null` means the overall scope), `topic`, `horizon` (`this_week` | `until_next_assessment`), `items` (jsonb checklist, each item carrying its own `done` boolean), `status` (`active` | `completed` | `superseded` | `deleted`), `created_at`, `updated_at`.

`student_tutor_practice_attempts` columns: `student_id`, `subject_code`, `topic`, `question`, `chosen_answer`, `correct_answer`, `is_correct`, `difficulty`, `created_at`.

### Cap: one active plan per scope key

The cap is **one active plan per distinct scope key**, where the scope key is the subject code, or a literal "overall" key for the overall scope — the same `scope: 'overall' | 'subject'` split `invoke-advisor` already uses. A student enrolled in *N* subjects can therefore hold at most **N + 1** active plans at once: one per subject, plus one overall. (Example: 8 subjects -> up to 9 active plans; 7 subjects -> up to 8.)

### Renew / recreate flow

Before generating a new plan, `invoke-study-tutor` checks for an existing row at the same `(student_id, subject_code)` scope key.

- If none exists (or the existing one at that scope key is already `completed`), generate and insert normally — no extra prompt to the student.
- If an `active` row exists and is not fully checked off, return it as-is — **no new model call**, which also avoids spending tokens regenerating a plan the student hasn't finished — and the client asks explicitly: **[Continue this plan]** or **[Start a new plan instead]**.
- Only when the student picks "Start a new plan instead" does the existing row flip to `status = 'superseded'` and a new row get created. A plan is never silently overwritten and never silently duplicated.
- If every item on the existing row is already checked off, it auto-flips to `completed` and a new plan can be generated for that scope key without asking.

### Completion and deletion are both archival, never a hard delete

- A fully completed plan's `status` becomes `completed`. It stays in the database and in the student's "My Study Plans" list (in a separate **Completed** section), it just no longer counts against the cap. Nothing about a completed plan is ever purged — it is the historical record of what the student actually finished.
- If a student is replacing a plan to free up a capped scope key, the **[Delete]** choice is a **soft delete** — `status` set to `deleted` — not a physical row removal. It drops out of both the Active and Completed views but remains in the table for history, consistent with "everything gets recorded."

### Dynamic practice questions

`student_tutor_practice_attempts` is what makes the `practice` leaf adaptive instead of a static canned set: before generating the next 5 questions for a topic, the function reads the student's own attempt history for that topic and skips questions already answered correctly, leans toward sub-skills previously answered wrong, and can shift difficulty up or down based on the recent run — so repeat requests on the same topic produce a genuinely different, evidence-driven set each time rather than recycling the same five.

### Multi-subject view

The tutor page shows a short "My Study Plans" list — an **Active** section (up to N+1 rows) and a **Completed** section — so accumulation across subjects and the overall scope reads as organized rather than cluttered. In practice this list is the same merged entry screen described under "UI: entry screen and View Plan" below, not a separate page.

### Deadline and staleness

A plan generated from one performance snapshot can go stale once new scores come in, so each plan needs a deadline and a way to detect when it no longer reflects current performance.

**Deadline is system-computed from the chosen horizon, never a student-typed date** (a date picker would add a menu step for little benefit):

- `this_week` -> a hard deadline of `created_at + 7 days`.
- `until_next_assessment` -> no calendar date at all (there is no syllabus/exam-schedule table to know when "next" actually is). Instead this horizon's deadline is **event-based**: it is reached the moment a *new* graded activity carrying that same `topicTag` gets a score recorded. That event is literally the next assessment arriving, and it reuses data already collected — no new table needed.

**Staleness is detected on read, not stored.** No background job flips a status; instead, whenever a plan is loaded, `invoke-study-tutor` checks: has the time deadline passed (`this_week`), or has a newer `topicTag` activity appeared since the plan was created (`until_next_assessment`)? If either is true, the response adds a flag and the UI shows a banner: **"New performance data is available for this topic — this plan may be outdated."** with two explicit choices — **[Refresh this plan]** (generates a fresh one from current data; old row -> `superseded`) or **[Keep following this plan]** (dismisses the banner; nothing changes). Same philosophy as the renew/continue flow: the system flags it, the student decides, nothing auto-replaces itself silently.

## Rules to enforce in the tutor system prompt

Numbered the same way `invoke-advisor`'s `systemPrompt()` is, so the two prompts stay easy to diff and audit side by side:

1. You are Ask ASPIRE's Study Tutor, a teaching assistant at DYCI — distinct from Ask ASPIRE the advisor. Never discuss grades, GWA, standing, risk tier, or FDA, even if asked; redirect those questions to "Ask ASPIRE" explicitly.
2. Use only the supplied topic name and the student's own recorded performance on that topic (which activities, scores on them) — never raw identity, never other subjects' data unless scope is "overall," and never any grade, risk, or faculty-evaluation data of any kind — none is ever supplied to you.
3. `explain`: give a clear, plain-language explanation of the concept. Do not solve or complete the text of an actual pending/graded assignment; use general illustrative examples, not the exact wording of a specific graded activity even if that wording is present in context.
4. `plan`: produce 3-5 checklist items, each a concrete action + timeframe, consistent with the chosen horizon (`this_week` or `until_next_assessment`).
5. `practice`: produce exactly 5 questions at the requested difficulty (or spanning easy-to-challenging if "mixed"), each with a model answer and a one-line explanation. Never reuse the exact wording of a real graded activity's question. Skip questions the supplied attempt history shows were already answered correctly.
6. `resources`: cite only entries present in the supplied curated list for this topic. If none exist, say so plainly in `message` and return an empty `resources` array — never invent a title or URL.
7. Output strict JSON only, matching the envelope above. No Markdown, no emoji, no text outside the JSON object — same discipline as the advisor prompt.
8. Always include the boundary statement field; its value is fixed and is not validated against the model's own copy (same rationale as `invoke-advisor`: minor paraphrasing should not cause a failed response).
9. For the Explain path, end `message` by inviting one of the three follow-up chips in plain language, so the client can render them consistently.
10. Never respond to requests that fall outside the four actions above (e.g., "write my essay," "do my assignment") — refuse politely inside `message` and suggest rephrasing as one of the four supported actions.

## Backend: `invoke-study-tutor`

- New file under `supabase/functions/invoke-study-tutor/`, not a mode flag inside `invoke-advisor` — keeps the two boundary statements and system prompts from ever sharing a code path.
- Reuses, unmodified in spirit, the scaffolding already proven in `invoke-advisor`: bearer auth, student-role check, windowed rate limiting (own counter), `redactDirectIdentifiers()`, first-name reinjection, `AbortSignal.timeout`-bounded provider calls with the same failover-status set.
- Request: `{ scope: 'overall' | 'subject', subjectCode?: string, topic: string, action: 'explain' | 'plan' | 'practice' | 'resources', shape?: string }`.
- No free-text question field in v1 — scope is already fixed by the menu before the call fires.

## Data needed

- **Weak/covered topics:** no new table. Derived live from existing `topicTag` values already recorded on graded activities.
- **Curated resources** (if chosen over live grounding): one new table, `topic_resources` (`topic_tag`, `subject_code` nullable, `title`, `url`, `resource_type`, `curated_by`, `created_at`). Faculty or admin populate it manually; the function only reads it.
- **Tutor persistence:** `student_tutor_plans`, `student_tutor_practice_attempts`, `student_tutor_log`, as described above.
- All of the above arrive as a single new migration file, named per the existing convention: `supabase/migrations/<YYYYMMDDHHMMSS>_add_study_tutor_tables.sql`, applied manually by the developer as usual.

## Real-world scenario (for visual clarity)

Jenkins is a BSIT student enrolled in ITC113 (Operating Systems concepts included), MATH101, and six other subjects this term — 8 subjects total, so Jenkins can hold up to 9 active tutor plans at once (8 per-subject + 1 overall).

**Monday — discovering a weak spot.** Jenkins opens the AI Study Tutor page and taps **Start Tutoring**. Scope: ITC113. Focus: "My weak topics in ITC113" — the app shows "Operating Systems" because two recent activity scores (10/20, 12/20) carry that `topicTag`. Action: **Explain this concept**. The tutor explains CPU scheduling in plain language, grounded only in that topic and Jenkins's own two low scores — no mention of Jenkins's GWA or risk status, because the tutor never has access to either. The reply ends with three chips; Jenkins taps **Give me practice on this**.

Five questions appear at a default moderate mix. Jenkins gets 3 of 5 right. Those results are written to `student_tutor_practice_attempts` — this is what makes next time different.

**Tuesday — building a plan.** Jenkins returns, same subject and topic, Action: **Give me a study plan**, Shape: **Until my next activity/exam on this topic**. No active ITC113 plan exists yet at this scope key, so one generates immediately: a 4-item checklist with suggested timeframes, stored in `student_tutor_plans` with `status = active`.

**Wednesday — trying to start a second plan in the same subject.** Jenkins, curious, picks ITC113 again, a different weak topic ("File Systems"), Action: **Give me a study plan**. Because the cap is one active plan *per subject* (not per topic), and ITC113 already has an active plan ("Operating Systems," unfinished), the tutor does not generate a new one. Instead it returns the existing plan and asks: **[Continue this plan]** or **[Start a new plan instead]**. Jenkins taps **Continue this plan** — no AI call was made, no tokens spent, and the existing checklist is simply shown again.

**Friday — practice reflects progress.** Jenkins asks for more practice on "Operating Systems," difficulty **Mixed**. Because `student_tutor_practice_attempts` shows Jenkins already answered two CPU-scheduling questions correctly on Monday, the new set skips those and leans toward the two Jenkins got wrong, plus one harder question — a different, evidence-driven set, not a repeat.

**The following week — finishing up.** Jenkins checks off the last item on the "Operating Systems" plan. It auto-flips to `status = completed`, moves to the **Completed** section of "My Study Plans," and frees up the ITC113 scope key. Jenkins can now start a fresh plan for "File Systems" without being asked to replace anything.

**Meanwhile, on the faculty side:** none of this — the explanation, the plan, the practice scores, the completion — is visible to Jenkins's ITC113 instructor, the Dean, or admin. It never touches `student_risk_evaluations`, and the instructor's own published advising plan (if any) for Jenkins, created through the existing evaluation workflow, is likewise never read by the tutor. The two systems never cross paths; they just happen to live on the same student account.

## Worked example (request/response detail)

Student: Jenkins, enrolled in ITC113, recorded `topicTag` "Operating Systems" with two low scores (10/20, 12/20) — same scenario as above, shown as raw payloads.

**Study plan path, first request (Tuesday)**

Taps: Scope = ITC113 -> Focus = My weak topics in ITC113 -> Action = Give me a study plan -> Shape = Until my next activity/exam on this topic.

Request:
```json
{ "scope": "subject", "subjectCode": "ITC113", "topic": "Operating Systems", "action": "plan", "shape": "until_next_assessment" }
```

Response (new plan created, `status: active`):
```json
{
  "message": "Here is a short plan to strengthen Operating Systems before your next related activity.",
  "study_plan": [
    { "topic": "Operating Systems", "action": "Re-read process scheduling notes and redo the Quiz 2 items you missed", "by": "in 2 days" },
    { "topic": "Operating Systems", "action": "Watch one explainer on CPU scheduling algorithms, then summarize it in your own words", "by": "in 4 days" },
    { "topic": "Operating Systems", "action": "Attempt 5 practice questions on this topic in Ask ASPIRE's tutor", "by": "before your next activity" }
  ],
  "boundary_statement": "This is practice guidance for self-study, not an official grade or faculty decision."
}
```

**Study plan path, second request on the same subject (Wednesday)** — different topic, but ITC113's scope key already has an active plan:

Request:
```json
{ "scope": "subject", "subjectCode": "ITC113", "topic": "File Systems", "action": "plan", "shape": "this_week" }
```

Response (existing plan returned; no model call made):
```json
{
  "message": "You already have an active study plan for ITC113 (Operating Systems) that isn't finished yet.",
  "existing_plan": { "topic": "Operating Systems", "status": "active", "progress": "0 of 3 done" },
  "choices": ["Continue this plan", "Start a new plan instead"],
  "boundary_statement": "This is practice guidance for self-study, not an official grade or faculty decision."
}
```

**Practice questions path** (Shape = Mixed, second request, after attempt history exists)

Response `assessment` (truncated to one item for brevity), now informed by Monday's attempts:
```json
{ "question": "Which scheduling algorithm can cause starvation of low-priority processes?", "choices": ["Round Robin", "First-Come First-Served", "Priority Scheduling", "FIFO"], "answer": "Priority Scheduling" }
```

**Resources path** (Shape = Reading, assuming `topic_resources` has one curated row for this topic)

```json
{
  "message": "One curated reading is available for Operating Systems.",
  "resources": [ { "title": "DYCI CS Dept. notes: CPU Scheduling Basics", "url": "https://..." } ],
  "boundary_statement": "This is practice guidance for self-study, not an official grade or faculty decision."
}
```

If no row exists yet for a topic, `resources` returns empty and `message` says so plainly — the model is never allowed to fill the gap with an invented link.

## Open decisions (confirm before any file is touched)

1. Resources: curated table vs. live grounding (e.g. Gemini 2.5 Flash's native Google Search grounding) — the latter needs routing that one call to a specific provider outside the shared OpenRouter fallback, and raises the data-residency question already flagged if paired with a non-US-hosted model.
2. Model for `explain`/`plan`/`practice`: assumed to stay on the existing OpenRouter fallback chain, independent of the resources decision.
3. "All topics covered so far" is assumed to come from `topicTag` values already recorded on activities (topics actually assessed), not a separate syllabus table, since none exists today.
4. UI entry: two top-level tiles (Ask ASPIRE / Start Tutoring) on the AI Study Tutor page, assumed above as the clearest way to demonstrate the tutor/advisor split live.

## Suggested build order

1. Migration adding `topic_resources` (if curated approach is chosen), `student_tutor_plans`, `student_tutor_practice_attempts`, and `student_tutor_log` — developer applies manually.
2. `invoke-study-tutor` edge function.
3. Student-facing menu wizard UI under `src/pages/student/`, including the "My Study Plans" Active/Completed list.
4. Entry tiles on the AI Study Tutor page.
5. Change record in `docs/05-operations/agents/feature-updates/` once any step above is actually implemented and approved.

Each step remains subject to its own per-file confirmation before editing, per `AGENTS.md`.
