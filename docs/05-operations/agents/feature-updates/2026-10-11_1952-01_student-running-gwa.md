# Student running GWA (Tentative) and Ask ASPIRE evidence

- **Date:** 2026-10-11 19:52 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** None. Redeploy the `invoke-advisor` edge function.

## Files changed
- `src/lib/studentRunningGrade.js` (new)
- `src/pages/student/Dashboard.jsx`
- `src/pages/student/MyGradesList.jsx`
- `src/pages/student/MyGradesDetail.jsx`
- `src/pages/student/AcademicInsights.jsx`
- `src/components/student/AskAspirePanel.jsx`
- `supabase/functions/invoke-advisor/index.ts`

## What changed and why
Before this change, students saw no grade until the first milestone (MR) was posted, about half the semester. That left the student side of the early warning system empty. The owner approved showing a **tentative running GWA**. This reverses the Capstone 1 panel rule that removed real-time grade recalculation from the student portal.

- **Shared function** (`studentRunningGrade.js`). It reuses the faculty roster's live engine (`computeTentativeGradeDetails`) and its COG resolution, so students see the same number their instructor sees. Two safeguards apply:
  - Posted milestones override live terms. A posted MR replaces live Prelim and Midterm, a posted TFR replaces live Semi-Final and Final, and a posted SG is official, including any audited admin override.
  - Blank activities in unposted terms are counted and reported, because posting may convert them to zero.
- **Dashboard.** The card reads "Current Running GWA" with a Tentative pill, or "Official GWA" once every SG is posted. Its status line shows the posting stage, and the ⓘ pop-up explains both safeguards. Fixed: "Normal" with a "High risk" subtitle; the default "No academic risk flags detected" message shown with no insight (it now reads "Not analyzed").
- **Grade Report.** Unposted MR, TFR and SG show live values marked Tentative, and the cumulative card shows the running GWA with a note. The printed grade slip still shows posted values only. Removed dead code for the old Prelim-only posting.
- **Score Breakdown.** The period grade, Sum Total and Semestral Summary show live values marked Tentative. Fixed: a false "At-Risk" label when no grade existed; "0.00%" Sum Total; a red "—" badge; the "Running GWA Grade" header label.
- **AI Study Tutor.** Subject grades, the hero card and the honors check use the running grade. Exam and character averages now use all recorded term scores. Ask ASPIRE context now carries each subject's grade basis and blank count.
- **Ask ASPIRE edge function.** The input filter now passes class standing, exam and character averages (previously dropped), grade basis, blank count, and up to 40 activities per subject (was 20). New rules 13–15 cover:
  - quoting the running GWA as tentative,
  - citing actual scores, weakest first,
  - plain-text numbered lists.

  The word limit is now 180 (was 100). **The edge function must be redeployed.**
- **Chat panel.** The assistant bubble keeps line breaks (`whitespace-pre-line`).

Known difference, accepted by the owner: after an admin overrides an SG, faculty and Dean pages keep showing the score-based grade, while the student sees the official override. The student and the faculty are both notified, and the Activity Log keeps the reason.

## How to verify
1. As a student with recorded scores but nothing posted: the dashboard shows Current Running GWA with Tentative, and the number matches the faculty roster for that student.
2. Post MR for one class: the status line reads "Midterm Rating posted · later terms live", and the Grade Report MR column shows the posted value without "Tentative".
3. Post SG for every class: the dashboard shows Official GWA with an Official pill.
4. In Score Breakdown for an unposted period: a tentative grade, a real Sum Total, and no false "At-Risk".
5. After redeploying `invoke-advisor`, ask "How are my activities?": the reply lists actual scores per subject on separate lines and calls the GWA tentative.
6. `npm run lint` (0 errors), `npm run verify:grading`, `npm run verify:insights`, `npm run build` all pass.
