# Live AI Standing, AI guidance before posting, and per-subject FDA

- **Date:** 2026-10-11 20:23 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix (extends the approved running-GWA feature, `2026-10-11_1952-01_student-running-gwa.md`)
- **Migration:** None

## Files changed
- `src/lib/academicPolicy.js`
- `src/pages/student/AcademicInsights.jsx`
- `src/pages/student/Dashboard.jsx`

## What changed and why
- **Problem 1.** The dashboard's AI Standing card showed only the verdict saved with the last AI insight.
- **Problem 2.** The AI Study Tutor generated insights only after a posted milestone (`hasOfficialMilestone`). Its Refresh button and explanation box also waited for one.
- **Result.** Before the MR, the card stayed at "Not analyzed", and the dashboard told students to open a page that could not generate anything.

Separately, the verdict rule treated 4+ absences **across all subjects** as FDA risk. DYCI's FDA threshold is per subject.

Changes:
- **Shared verdict rule.** `computeVerdict` moved from `AcademicInsights.jsx` to `academicPolicy.js` as `computeAcademicVerdict`. The GWA thresholds are unchanged: worse than 3.00 → At Risk; worse than 2.50 or an FDA subject → Struggling; otherwise Safe. The combined-absences condition is removed.
- **Per-subject FDA count.** New `countFdaSubjects` counts subjects whose own absences reach 4. The AI Study Tutor's trajectory check and `fdaRisk` now use only the per-subject count (`fdaFlags`), not the combined total.
- **Dashboard AI Standing is live.** The card computes the verdict with the shared rule from the running GWA and per-subject FDA, so no AI call is needed. It shows "· tentative" until every SG is posted, and "No data yet" when there are no scores or FDA. The explanation text still comes from the latest saved AI insight, with corrected wording when none exists or it is outdated. The value font is smaller so "Struggling" is not cut off, and the ⓘ text describes the live rule.
- **AI Study Tutor before posting.**
  - Overall guidance generates automatically, and Refresh and the explanation box are available, once the student has a running GWA. Generation still happens once per evidence change.
  - Subject/period guidance still waits for posting, because those period cards show posted values.
  - The saved insight records the real `hasOfficialMilestone` value instead of always `true`.
- **Advisor wording.** The deterministic advisor describes its GWA as "official", so it now receives the posted-only GWA instead of the running GWA.

## How to verify
1. A student with a tentative GWA of 2.50 and no subject at 4 absences: the dashboard AI Standing reads **Safe** · "Low risk · tentative".
2. Give the student 2 absences in each of two subjects: still not FDA. Give 4 absences in one subject: **Struggling**.
3. Before any MR is posted, open the AI Study Tutor: overall guidance generates, and Refresh is visible. The dashboard Academic Insights then shows the AI text.
4. After an MR is posted, the deterministic advisor's "official cumulative GWA" equals the posted MR value, not the running GWA.
5. `npm run lint` (0 errors), `npm run verify:grading`, `npm run verify:insights`, and `npm run build` pass.
