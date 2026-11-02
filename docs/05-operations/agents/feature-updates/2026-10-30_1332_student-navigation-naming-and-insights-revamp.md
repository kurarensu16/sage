# Student navigation: naming, and the Academic Insights revamp

- **Date:** 2026-10-30 13:32 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish
- **Migrations:** none

Three student pages overlapped in name badly enough that the owner could not
tell them apart while reviewing Phase 7. Renamed, and the middle one rebuilt.

## Files changed

- `src/components/layout/Sidebar.jsx`
- `src/pages/student/AcademicInsights.jsx`
- `src/pages/student/StudyTutor.jsx`
- `src/pages/student/FacultyAdvisingInbox.jsx`
- `src/pages/student/Dashboard.jsx`
- `src/pages/student/Notifications.jsx`
- `src/pages/student/MySubjects.jsx`
- `src/components/student/AskAspirePanel.jsx`
- `src/components/faculty/ActivityResourceFields.jsx`
- `src/pages/faculty/ScoreInput.jsx`
- `src/lib/notificationDispatcher.js`

## The naming problem

| Route | Was | Now |
|---|---|---|
| `/student/advising-inbox` | Advisories & Study Plans | **Faculty Action Plans** |
| `/student/academic-insights` | AI Study Tutor | **Academic Insights** |
| `/student/tutor` | Start Tutoring (header said "AI Study Tutor") | **AI Study Advising** |

Three overlaps existed at once: the page *called* "AI Study Tutor" never
tutored, the page that did tutor was called something else while its header
claimed the same name, and two unrelated pages both used the words "Study
Plans" — one for plans a professor assigns, one for plans the student
generates.

**Display names only.** The edge function stays `invoke-study-tutor`, and the
tables stay `student_tutor_*`, by the owner's decision. Renaming the schema to
"advising" was considered and rejected: this system has two AIs, and
`invoke-advisor` already owns that word in the codebase — `student_advising_plans`
would read as the advisor's. "Tutor" is unique in the schema and points at
exactly one thing. The ERD carries a one-line note mapping the two.

## The Academic Insights revamp

**My Progress removed.** It was a second view of data already on the overall
panel: `toggleAdvisorAction` is called from both, so the action checklist and
its ticking were never unique to Progress. Faculty-assigned plans live under
Faculty Action Plans.

**Today and My Courses unified.** They were the same panel at different scope —
all subjects versus one — which is the same `overall` / `subject` split
`invoke-advisor` already uses internally. They are now one scope selector
reading "All subjects · <code> · <code>", which says that plainly instead of
presenting it as two features.

**No entry tiles.** Tiles for Ask ASPIRE and AI Study Advising were added at the
top and then removed at the owner's direction: Ask ASPIRE already has a button
inside the panels, and AI Study Advising has its own sidebar entry, so both
only repeated reachable destinations.

Ask ASPIRE is **not** opened automatically on arrival. It is a modal, so
auto-opening would block the page and spend an AI call nobody asked for.

## Bugs found and fixed

**`?tab=progress` would have rendered a blank page.** The scope comes from a URL
parameter and was used unvalidated. With the Progress panel gone, a bookmark to
`?tab=progress` — or any typo — matched no panel and rendered nothing. The scope
is now validated against the panels that exist, falling back to all-subjects.

**A retired feature still had a button.** "Request Consultation" sat on
Academic Insights and navigated to a page whose own header comment reads *"There
is no request button, because this is a record of what happened rather than a
channel for asking."* Last leftover of the Phase 5 retirement.

**"Assigned Section" showed a literal.** `My Subjects` rendered
`studentSection?.name || profile?.section_name || 'Block Section'`, and all
three were broken for a student with nothing enrolled: the first is derived from
enrolment rows, the second **never exists** (`AuthContext` selects
`'*, departments(name)'` with no join to `sections`), so it always landed on the
hard-coded string — which reads like a real section name while meaning "not
found". It now reads the student's own `users.section_id` against `sections`,
and says "Not assigned" when there is genuinely nothing.

That lookup is a filtered query rather than a `sections(name)` embed on the
shared profile: `users` and `sections` both predate the tracked migrations, so
the foreign key an embed needs cannot be verified from the repo, and a failed
embed there would break profile loading for every user.

## Known limitations

- **`?tab=` is now a two-value parameter.** Any external link using
  `?tab=progress` silently lands on the all-subjects view rather than erroring.
  That is the intended behaviour, but it is silent.
- **Code comments still say "AI Study Tutor"** in several files. They refer to
  internal naming, which deliberately did not change.

`npm run lint` 0 errors / 48 warnings (unchanged) · `npm run build` clean ·
`npm run verify:grading` passes.
