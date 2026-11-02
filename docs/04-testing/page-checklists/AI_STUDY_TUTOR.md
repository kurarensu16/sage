# AI Study Tutor — Phase 7

**Spans:** student (`/student/tutor`), faculty (Score Input), admin/registrar
(`search_destinations`)
**Requires:** migrations `20261030121641_add_study_tutor_tables.sql` and
`20261030124339_search_destinations.sql`, plus
`supabase functions deploy invoke-study-tutor`
**Last touched by:** Phase 7, 2026-10-30

Run in order. `TUTOR-SETUP` gates everything, and `TUTOR-PRIVACY` is the one a
defense panel is most likely to probe.

## Setup

**ID:** `TUTOR-SETUP`

- [ ] Both migrations apply with no error. The first reports
      "Tutor data is owner-only, generated answers are server-only"; the second
      reports the number of active destinations.
- [ ] `invoke-study-tutor` deploys. Without it the page loads and shows plans,
      but every tutoring action reports that the tutor cannot be reached.
- [ ] `OPENROUTER_API_KEY` is set. `TUTOR_MODEL` and `TUTOR_FALLBACK_MODELS` are
      optional; with neither set, the tutor uses the advisor's models.
- [ ] **Before** the migrations: the page says it cannot open, in plain words,
      rather than showing a stack trace or an empty screen.

## The privacy wall

**ID:** `TUTOR-PRIVACY` · the decision the whole phase rests on

- [ ] **Nothing about standing appears.** No GWA, grade, remark, risk tier, FDA
      count or faculty note is visible anywhere in the tutor, in any action.
- [ ] Ask the tutor directly about your grade or standing: it declines and
      points to Ask ASPIRE, and does not guess.
- [ ] **Faculty cannot read tutor data.** Signed in as faculty, selecting from
      `student_tutor_plans`, `student_tutor_practice_attempts` or
      `student_tutor_log` returns **zero rows**, not an error — RLS filters
      rather than refusing. Repeat as dean and as admin.
- [ ] **Students cannot read each other's.** Signed in as student B, selecting
      student A's plan by id returns nothing.
- [ ] Nothing in the tutor appears on any faculty dashboard, dean report, or in
      `generate-intervention-draft` input.

## Practice answers stay server-side

**ID:** `TUTOR-PRACTICE`

- [ ] Generate a practice set. In browser devtools, the response contains
      `question` and `choices` only — **no `answer`, no `explanation`.**
- [ ] `select * from student_tutor_practice_sets` as the student returns
      nothing. The table has RLS on and no policy, so it denies outright.
- [ ] Answers and explanations appear only after submitting.
- [ ] Submitting the same set twice is refused the second time.
- [ ] A set older than 24 hours is refused with a plain message.
- [ ] Submitting another student's `set_id` is refused.
- [ ] **Adaptive:** answer a set, then request practice on the same topic again.
      Questions already answered correctly do not reappear verbatim.

## The menu

**ID:** `TUTOR-MENU`

- [ ] Step 1 lists the student's real subjects, plus "Across all my subjects".
      A subject with no activities is not offered.
- [ ] "Topics that need review" lists only topics below the passing mark.
- [ ] With nothing below the mark, it says so positively and points at
      "All topics" rather than showing an empty list.
- [ ] A topic with no graded activity shows "Not graded yet", not 0%.
- [ ] **Back** at each step returns to the previous one with choices intact.

## No data yet

**ID:** `TUTOR-NODATA` · likely on a freshly reset database

- [ ] A student with no scores can still get an explanation, and is told plainly
      it is not personalised yet.
- [ ] A subject whose faculty set no topic tags does not break the wizard.
- [ ] Nothing in this state produces an error screen.

## Study plans

**ID:** `TUTOR-PLANS`

- [ ] A plan saves and appears under My study plans.
- [ ] **The cap:** with an unfinished plan in a subject, asking for another in
      that same subject returns the existing one and asks Continue or Replace.
      **No model call is made** — confirm the tutor's daily count does not move.
- [ ] Replace supersedes the old plan and creates one new plan; the old one does
      not vanish from history.
- [ ] Ticking every item, then asking for a new plan, generates one without
      asking.
- [ ] A plan with an empty checklist does **not** count as finished.
- [ ] One plan per subject plus one overall can be active at once.
- [ ] `this_week` shows a deadline; `until_next_assessment` shows none.
- [ ] Discarding a plan frees the subject for a new one and does not delete the
      row (`status` becomes `deleted`).

## Staleness

**ID:** `TUTOR-STALE`

- [ ] With an active plan, have faculty record a score in that subject. The plan
      shows the "may be out of date" banner and the student gets one in-app
      notification.
- [ ] **Re-saving the same scores does not send more notifications.** This is
      the fan-out guard — faculty saving a 40-student class must not produce a
      notice per student per save.
- [ ] Adding a new activity in the subject also flags it.
- [ ] A stale plan is still usable and still tickable. Stale means "check this",
      not "discard this".
- [ ] **Grade entry is never blocked.** With the tutor tables dropped or renamed,
      faculty can still save scores normally. The triggers are wrapped for
      exactly this.

## Rollover archiving

**ID:** `TUTOR-ROLLOVER` · **Requires:** migration
`20261030130008_archive_tutor_plans_on_rollover.sql`

- [ ] End a term (Registrar → Term Management). The rollover completes
      normally — this is the one that must not regress.
- [ ] An **unfinished** active plan from that term becomes "Past term" and is
      still visible under Finished and past plans.
- [ ] A plan with **every item ticked** becomes "Finished", not "Past term".
- [ ] The student can start a fresh plan for the same subject in the new term.
- [ ] Ending a term that was already ended changes nothing.
- [ ] **Failure cannot block a rollover.** Rename `student_tutor_plans`, then
      end a term: the transition must still succeed.

## Resources

**ID:** `TUTOR-RESOURCES`

- [ ] Faculty can add a resource while **creating** an activity and while
      **editing** one, and both save.
- [ ] A URL not starting with `http://` or `https://` is refused with a clear
      message, **before** the activity saves.
- [ ] Removing a row removes it; editing one keeps its place.
- [ ] A student asking for resources on that topic sees the label, the link and
      the note.
- [ ] Explain and plan mention that the instructor attached materials, so they
      are discoverable without using the resources action.
- [ ] Deleting the activity removes its resources (cascade).
- [ ] A student in a different section does not see another section's resources.

## Search suggestions

**ID:** `TUTOR-SEARCH`

- [ ] With no curated resource for a topic, the student is told so and offered
      search keywords.
- [ ] **No link comes from the model.** Every link is a search URL on a site
      listed in `search_destinations`.
- [ ] The disclaimer that these are not instructor-reviewed is shown.
- [ ] Deactivating YouTube in `search_destinations` removes it from the buttons
      with no code change; adding a row adds it.
- [ ] A template without `{q}` is refused by the database.
- [ ] With every destination deactivated, keywords still appear — without links,
      rather than broken ones.

## Cost control

**ID:** `TUTOR-LIMITS`

- [ ] Rapid repeated requests are rate-limited with a plain message.
- [ ] After the daily cap, further AI requests are refused and the message says
      the limit resets tomorrow — while saved plans and past answers stay
      readable.
- [ ] **Free actions do not count:** viewing resources that exist, and being
      returned an existing plan, do not consume the daily allowance.
- [ ] The cap counts a Philippine-time day, not a rolling 24 hours.

## Navigation

**ID:** `TUTOR-NAV`

- [ ] The tile on the AI Study Tutor page opens `/student/tutor`.
- [ ] The sidebar entry "Start Tutoring" appears for students only.
- [ ] On mobile, `/student/tutor` highlights the Support tab.
- [ ] A faculty, dean, registrar or admin account opening `/student/tutor` is
      redirected to `/403`.

## Status legend

`[ ]` not yet run · `[x]` passed · `[!]` failed, see notes · `[-]` not applicable
