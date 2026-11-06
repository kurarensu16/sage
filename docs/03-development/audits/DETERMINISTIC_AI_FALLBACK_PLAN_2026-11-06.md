# Deterministic AI fallback — recommendation plan

**Status:** Partially built 2026-11-06. 3a and 3b (student surfaces) are implemented and verified; 3c (faculty intervention draft) is still proposed, no code yet.
**Closes:** QA bug B-06 (`docs/04-testing/ASPIRE_FULL_CYCLE_DEMO_AND_QA_2026-10-31.md`, row B-06) — updated to **partially fixed 2026-11-06**, student surfaces only.
**Answers:** Objective 6's promise of "a deterministic fallback" for the AI Study Advising feature, on the student side. The faculty side is a separate, lower-priority gap from the same QA bug (see 3c).

## 0. What was actually built, vs. what this plan proposed

The audit behind this plan assumed the deterministic data would need assembling from scratch. Reading the actual code before implementing found that wasn't true: `src/lib/advisingEngine.js` (`evaluateAcademicAdvising()`) and `src/lib/studyTutorRules.js` (`summarizeTopics()`, `needsReview`) **already existed as pure, already-computed functions** — Ask ASPIRE was already passing the full advisor object into the AI as grounding context, and Study Tutor was already loading topic-level signals before any AI action ran. Neither was ever rendered to the user when the AI failed; that was the entire real gap.

So §4's proposed shared helper (`src/lib/aiDeterministicFallback.js`) was **not built and not needed** — each surface's existing `catch` block now renders its own already-existing engine output directly, which is less code than the plan proposed, not a new shared abstraction. The actual changes:
- `src/components/student/AskAspirePanel.jsx` — renders `context.deterministicAdvisor` (headline, summary, actions) under `AiUnavailableNotice` when `error` is set.
- `src/pages/student/StudyTutor.jsx` — renders the selected topic's `percent`/`needsReview` (or up to 5 weak topics with none selected) under `AiUnavailableNotice` when `aiError` is set, for `explain`/`plan`; `practice`/`resources` get an honest redirect message instead, per 3b below.

Verified: `npm run lint` (0 errors, same 47 pre-existing warnings), `npm run build` (passes). Not yet re-run: the manual QA case 7c retest described in §7 — that's still an outstanding verification step, distinct from the lint/build checks already done.

## 1. The gap, precisely

`src/lib/aiFallbackMessage.js` and `src/components/common/AiUnavailableNotice.jsx` already say, in their own comments, what they are not:

> "Not the deterministic fallback Objective 6 promises. That would produce usable guidance WITHOUT a provider — study steps assembled from the student's own recorded scores and activities. This only explains the silence well."

What exists today is a well-written error state (offline / busy / misconfigured, with a retry button). What's missing is actual guidance generated with no AI call at all.

## 2. Design decision: no caching

Confirmed with the developer. The fallback never stores or replays a prior AI response. Every time it renders, it recomputes from whatever the system already knows deterministically **right now** — current scores, current attendance, current evaluation state. Nothing can go stale, and nothing needs a new table, cache invalidation rule, or staleness label.

## 3. Scope — three AI surfaces, two of them already have the data half-built

QA case 7c (provider unreachable) exercised both Student and Faculty AI paths and found neither falls back. Tracing the code:

### 3a. Academic Insights → "Ask ASPIRE" (`AskAspirePanel.jsx`, student) — **built 2026-11-06**
**Cheapest to implement.** `AcademicInsights.jsx` already assembles a complete deterministic evidence object (`askAspireContext` / `askAspireEvidence`: running GWA, recorded-activity average, exam average, scored activities below the 75% benchmark, honors blockers) and passes it into the panel **as the AI's prompt input**. That object already IS usable guidance — it's just being thrown away as plain text when the AI call fails and replaced with only `describeAiFailure`'s error message.
**Fallback:** when `describeAiFailure` fires, render the same evidence object as a plain-language summary instead of discarding it (e.g., "Recorded activities average 68% — below the 75% benchmark on Quiz 3, Lab Report 2" / "Honors eligibility: GWA blocker, needs 1.75 or better, currently 2.10"). No new query — the data is already in memory at the point of failure.

### 3b. Study Tutor (`StudyTutor.jsx`, student) — four actions, each needs its own answer — **built 2026-11-06**
- **`plan` (buildStudyPlan):** ~~deterministic version = a checklist built the same way as 3a (scored activities below 75%, sorted by deficit, grouped by subject) plus the FDA/attendance tier if relevant.~~ **Corrected during implementation:** this page has its own explicit boundary — its code comments state it must never show a grade, GWA, standing, or risk tier, because the tutor is never given them. Reusing 3a's GWA-bearing evidence would have violated that. Built instead from `summarizeTopics()`'s topic-level `percent`/`needsReview` (already loaded before any AI action runs), which stays entirely within the existing boundary.
- **`explain`:** same topic-level signal as above, not the GWA-bearing evidence object originally proposed here.
- **`practice` (generatePractice):** confirmed no honest deterministic substitute — built as a plain redirect message pointing to instructor-provided materials, not a generated content stand-in.
- **`resources` (fetchTopicResources):** confirmed this *does* route through the same AI edge function as the other three (`invokeTutor`), not a direct `search_destinations` read as guessed here — it gets the same plain redirect message as `practice`.

### 3c. Faculty intervention draft (`generate-intervention-draft` edge function, faculty) — not built, still proposed
**Out of Objective 6's literal wording** (the objective is about *AI Study Advising*, which is the student-facing feature), but QA bug B-06 tested this path too and found the same gap. Recommend building it as a secondary item, not blocking: a templated draft assembled from the evaluation snapshot's already-known rule triggers (e.g., "below 75% in Quiz 3" → "Review Quiz 3 material; attend a consultation before the next milestone"). Since this path is already human-in-the-loop (the faculty member edits before publishing), a plainer templated starting draft is still useful even though it's less tailored than the AI's.

## 4. Where it hooks in — as proposed, vs. as built

Proposed: one shared helper, `src/lib/aiDeterministicFallback.js`, parallel to `aiFallbackMessage.js`, that both surfaces would call.

**As built:** no shared helper exists. `AskAspirePanel.jsx` and `StudyTutor.jsx` each render their own already-existing engine's output (`context.deterministicAdvisor` and `topic`/`menu.topics` respectively) directly in JSX, beneath `AiUnavailableNotice`. A shared helper would have had to abstract over two genuinely different, boundary-constrained shapes (GWA-bearing vs. topic-only) for no real reuse benefit — two small, local blocks turned out clearer than one shared one.

This keeps the existing, already-correct honesty rule ("never show a status code... what the user gets is what happened, whether waiting helps, and what they can do now") and adds a fourth element: *what they can see right now instead*.

## 5. What it deliberately does not do

- No new practice questions, no generated prose, no simulated AI voice. If a surface can't produce an honest non-AI answer (practice-set generation), it says so and redirects to real existing material instead of faking quality.
- No caching of prior AI output (per the explicit decision above).
- No change to grades, risk tiers, or intervention plans — the fallback is read-only guidance, same boundary the AI path already respects.

## 6. Database / migration impact

None expected. Every fallback reads data the surface has already fetched for its own deterministic display elsewhere (scores, attendance, evaluation snapshot, `activity_resources`). If `fetchTopicResources` turns out to need an AI call after all (to be confirmed per 3b), that would be the one exception — reassess at that point rather than assuming now.

## 7. Verification

Re-run QA case 7c (provider unreachable: bad base URL / 401) for both Student and Faculty paths and confirm each now shows usable, data-grounded guidance alongside the existing error message, rather than the error message alone. Update B-06's status in the QA doc once confirmed, rather than deleting the row (per the project's record-keeping convention — a correction is a new entry, not an edit to history).

## 8. Rough sizing

- 3a (Ask ASPIRE): small — data already assembled, just needs a render path.
- 3b plan/explain: small — same pattern as 3a, reused.
- 3b practice/resources: small — mostly a redirect message, plus confirming whether `resources` needs anything at all.
- 3c (faculty draft): medium — needs its own template-from-trigger logic, separate from the student-side evidence shape.
