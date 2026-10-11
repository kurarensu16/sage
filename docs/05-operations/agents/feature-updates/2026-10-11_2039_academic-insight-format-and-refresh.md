# Academic Insights: short format, refresh only on posting or Refresh

- **Date:** 2026-10-11 20:39 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish
- **Migration:** None. Redeploy the `invoke-advisor` edge function.

## Files changed
- `supabase/functions/invoke-advisor/index.ts`
- `src/lib/insightFreshness.js`
- `src/pages/student/AcademicInsights.jsx`
- `src/pages/student/Dashboard.jsx`

## What changed and why
- The overall AI insight was a long paragraph. Both the dashboard card and the AI Study Tutor box ignored line breaks, and the AI used the 180-word chat budget.
- Any new score made the saved insight outdated, which triggered a new AI call.
- The owner chose to limit AI usage. An insight generates once, updates automatically when a grade is posted, and otherwise updates only when the student clicks Refresh.

Changes:
- **Short format (edge function).** New rule 16 for insight mode: one summary sentence, then "Next steps:" with at most 3 numbered steps of under 20 words, about 80 words in total. The insight request wording now asks for this format.
- **When it regenerates** (`insightFreshness.js`, `AcademicInsights.jsx`):
  - New `INSIGHT_FORMAT_VERSION` and `createPostedMilestoneKey` (class, milestone, grade, posted time).
  - `shouldAutoRegenerateOverallInsight` returns true only when no insight is saved, the saved format is older, or the posted milestones differ.
  - Otherwise the saved insight is shown even after newer scores. Saved insights record `postedMilestoneKey` and `formatVersion`.
  - Old long insights regenerate once in the new format.
- **AI Study Tutor box.**
  - The text keeps its line breaks.
  - A small note gives the generation time, says it updates automatically when a grade is posted, and says Refresh includes newer scores. It also mentions newer scores when there are some.
- **Dashboard card.**
  - The text keeps its line breaks, and the card follows the same keep-until-posted rule.
  - A new ⓘ explains when the insight updates, with step-by-step instructions to Refresh it in the AI Study Tutor.
  - The dashboard no longer loads activities, scores, grading columns and evaluations that were only used for the old evidence fingerprint.

## How to verify
1. Redeploy `invoke-advisor`.
2. Open the AI Study Tutor. An existing long insight regenerates once as one sentence plus up to 3 numbered steps on separate lines.
3. Record a new activity score, then reopen the AI Study Tutor. No new AI call is made, and the note says newer scores exist. Clicking Refresh generates a new insight.
4. Post an MR, then open the AI Study Tutor. The insight regenerates automatically.
5. On the dashboard, the Academic Insights card shows the short insight with line breaks, and its ⓘ shows the how-to steps.
6. `npm run lint` (0 errors), `npm run verify:insights`, `npm run verify:grading`, and `npm run build` pass.
