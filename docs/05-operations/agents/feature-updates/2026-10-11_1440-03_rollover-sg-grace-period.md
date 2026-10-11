# SG grace period after the term rollover, submission labels, and open-until-posted classes

- **Date:** 2026-10-11 14:40 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** `supabase/migrations/20261011130000_term_rollover_grace.sql` (to apply; shared with `2026-10-11_1440-02_admin-setup-batch2b-rollover.md`)

## Files changed
- `supabase/migrations/20261011130000_term_rollover_grace.sql`
- `src/lib/termStatus.js` (new)
- `src/pages/admin/TermManagement.jsx`
- `src/pages/faculty/ClassRecordsList.jsx`
- `src/pages/student/MySubjects.jsx`
- `src/pages/dean/GradePostingStatus.jsx`

## What changed and why
The owner approved this design on 2026-10-11 (audit §5.11) as the answer to what happens to classes whose SG is not posted when the term rolls over. Grades stay the instructor's: there are no admin-made or automatic grades.

- **Grace period:** `academic_terms.sg_grace_days`, default 30, 0–180. It is set in the rollover wizard and saved on the ending term with `ended_at`. Term History shows both.
- **Open until posted:**
  - An ending-term class without a posted SG stays open after the rollover.
  - The faculty sees it under **Past Archives** as **Pending · SG due in N days**, then **SG Overdue**, and can finish grading and post the SG.
  - When the SG is posted for every enrolled student, the database **archives** the class (view only).
- **SG submission label:** `posted_grades.sg_submission_status`, set by the database at the first SG posting:
  - **On time:** the term is still active.
  - **Late:** within the grace period.
  - **Late (overdue):** after it.

  A later correction keeps the label. The Dean sees the label under *Posted*, and *Pending · N days left* or *Overdue* for unposted previous-term classes.
- **Student view:** a previous-term subject without its SG shows *Grade not yet posted*. Students get the existing **New Grade Posted** notification when it is posted.
- **Read-only SG status function:** `get_term_sg_status(school_year, semester)`. The admin sees all classes; a Dean sees only their college.

## How to verify
QA cases AS-31 to AS-36 and AS-39 to AS-40 (checklist section B10d).
