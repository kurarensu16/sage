# Admin grade override: correct student email and notice

- **Date:** 2026-10-11 19:52 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** None

## Files changed
- `src/lib/notificationDispatcher.js`
- `src/pages/admin/GradeOverride.jsx`

## What changed and why
The documented Admin Grade Override notified the student with a `grade_posted` notification that carried no details. The email trigger sends every `grade_posted` and `grade_changed` notification to the student and the primary guardian, so both got "[ASPIRE] New grade posted — your class": the wrong action, and no subject.

The override now sends `grade_changed`, titled "Grade Updated" with a link to grades. It carries the same details a faculty correction does: subject code and name, "Semestral Grade", remark, new grade, student name, and class. The existing template then reads "[ASPIRE] Grade updated — <subject code>". A duplicate-protection key built from the override timestamp keeps one override from sending twice. The faculty compliance notice is unchanged. `send-email` already handles `grade_changed`, so no redeploy is needed.

## How to verify
1. As admin, override a posted SG with a reason.
2. The student's inbox shows "Grade Updated" with the new grade.
3. The student's email (and the primary guardian's) reads "Grade updated — <subject code>" and names the subject.
4. The instructor receives the unchanged compliance notice, and the Activity Log shows the override.
