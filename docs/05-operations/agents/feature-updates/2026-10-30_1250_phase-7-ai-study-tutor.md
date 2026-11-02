# Phase 7 — AI Study Tutor

- **Date:** 2026-10-30 12:50 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migrations (apply in this order):**
  1. `20261030121641_add_study_tutor_tables.sql`
  2. `20261030124339_search_destinations.sql`
- **Edge function to deploy:** `invoke-study-tutor`

Build order items 1–5 from
[`AI_STUDY_TUTOR_WORKFLOW_PLAN_2026-10-26.md`](../../../03-development/audits/AI_STUDY_TUTOR_WORKFLOW_PLAN_2026-10-26.md).
Item 6, the Supabase schema audit, is deferred to a separate session at the
owner's request.

## Files changed

**New**
- `supabase/migrations/20261030121641_add_study_tutor_tables.sql`
- `supabase/migrations/20261030124339_search_destinations.sql`
- `supabase/functions/invoke-study-tutor/index.ts`
- `src/lib/studyTutorRules.js`, `src/lib/studyTutorService.js`
- `src/lib/activityResourceService.js`
- `src/components/faculty/ActivityResourceFields.jsx`
- `src/pages/student/StudyTutor.jsx`

**Changed**
- `src/App.jsx` (route `/student/tutor`)
- `src/components/layout/Sidebar.jsx`, `BottomNav.jsx`
- `src/pages/student/AcademicInsights.jsx` (entry tile only)
- `src/pages/faculty/ScoreInput.jsx` (resource fields on both activity forms)

## Owner's decisions

| Decision | Outcome |
|---|---|
| Provider | **OpenRouter for now.** The Gemini/DeepSeek choice is still open; everything provider-specific is confined to `callModel()` |
| Resources | Attached to the **activity**, not a global topic table |
| Uploads | **Links only.** `kind` allows `file`, nothing writes it until R2 |
| Where faculty enter them | **Both** the create form and the activity settings modal |
| No data yet | Tutor still works, generically, and says so plainly |
| Cost | Daily per-student AI cap plus a burst limit |
| Practice answers | **Withheld** until the student submits |
| Retention | Plans archive at rollover; staleness flags when scores or activities change |
| Staleness notice | Banner **and** an in-app notification |
| Practice set life | 24 hours, single use |
| No curated resource | Tutor offers **search keywords**; links are built from an approved destinations list |

## Deviations from the plan, and why

**OpenRouter, not a new provider.** The plan recorded that the tutor would *not*
reuse the advisor's OpenRouter chain. The owner reversed that on 2026-10-30 so
the phase is not blocked on a model decision. Every provider detail lives in
`callModel()`, so the later switch is one function plus environment variables.
`TUTOR_MODEL` and `TUTOR_FALLBACK_MODELS` override the advisor's settings when
set; without them it inherits them.

**`activity_resources`, not `topic_resources`.** A global table curated from a
page of its own would have been empty: faculty already type the topic tag on the
activity form, so the material is in hand at that moment, and a separate page
asks them to recall it weeks later. Per-activity also scopes better — two
sections of one subject may use different materials.

**`subject_id`, not `subject_code`.** A text copy of a value that already has a
primary key goes stale the moment a code is corrected. Raised because the owner
asked for a normal-form audit; better decided before the column existed than
after.

**A fifth table, `student_tutor_practice_sets`.** Forced by the decision to
withhold answers. The correct answers cannot live on
`student_tutor_practice_attempts`, which is student-readable — a student could
query their own rows and read every answer before answering. The sets table has
RLS enabled and **no policy at all**, which denies every authenticated account;
only the function's service role reads it. The migration asserts the policy list
stays empty.

**Search suggestions instead of model-supplied links.** The owner asked for web
search when no curated resource exists. A model with no browsing tool can only
recall URLs, and recalled URLs are routinely dead or point elsewhere — the exact
failure the plan's rule #4 forbids. So the model returns **keywords only**, with
a prompt that forbids URLs and a filter that strips anything link-shaped anyway,
and the links are built in code by filling an approved template. Every link a
student sees is therefore a working search page on a site the institution chose.
When a provider with real grounded search is adopted, that branch returns
verified URLs and the client renders them unchanged.

**`search_destinations` as a table.** The owner's call: Google and YouTube were
hard-coded in the function; now they are seeded rows an admin or registrar can
add to or remove. The institution decides where students are sent, not the model
and not the code. Templates are constrained to `https` with a `{q}` placeholder,
re-checked at use in case a row is edited by hand.

## Problems found while building

**`.eq()` against null silently matches nothing.** The overall-scope plan lookup
and the practice-history filter both compared a column to `null`. PostgREST
renders that as a comparison that never matches, so an overall plan would never
have been found and the one-active-plan cap would have looked broken while
quietly allowing duplicates. Both now use `.is()` or a conditional filter. This
class of bug returns empty rather than erroring, so nothing would have pointed
at it.

**The staleness triggers fire on grade entry.** They run on
`student_activity_scores` writes. If one ever raised, faculty could not save
scores. Every body is wrapped so a problem flagging a plan cannot block a grade —
a missed banner is a small loss, a blocked grade save is not.

**Notification fan-out.** Flagging on every score write would have sent a notice
per student per save, repeatedly. `stale_since` is stored rather than computed so
the notification fires only on the transition from fresh to stale, once per plan.

**An empty checklist read as finished.** `isPlanFinished()` on `[].every()`
returns true, so a plan the model returned with no items would have immediately
counted as complete, freed its scope key, and let a student generate plan after
plan. Guarded, and the guard is in the pure rules file where a verify fixture can
reach it.

## Known limitations

- **The edge function is not type-checked.** Deno is not installed in this
  environment, so no edge function in this project can be checked locally. First
  real verification is deployment.
- **Scanned PDFs.** Not reachable yet — links only. When uploads arrive, a
  scanned handout will have no text layer and will need OCR or will silently
  yield nothing; the UI should say so rather than fail quietly.
- **Rollover archiving is not built.** Plans carry `term_id` and the cap index
  includes it, so a new term is never blocked by last term's plan, but nothing
  yet flips old active plans to `archived`. That touches
  `perform_semester_transition`, which is live registrar machinery, and is
  deliberately its own migration.
- **Copyright.** Faculty-authored material is uncontroversial; a scanned
  commercial textbook chapter is not. Worth a position before uploads land.

## How to verify

`docs/04-testing/page-checklists/AI_STUDY_TUTOR.md`.

The three that matter most:

- **The privacy wall.** No grade, GWA, standing or risk tier appears anywhere in
  the tutor, and no faculty, dean or admin account can read a tutor table.
- **Answers never reach the browser early.** Open devtools on a practice set:
  the response must contain questions and choices only.
- **No model-generated link.** Every link under "Try searching for" must be a
  search URL built from an approved destination template.

`npm run lint` 0 errors / 48 warnings (unchanged) · `npm run build` clean ·
`npm run verify:grading` passes.
