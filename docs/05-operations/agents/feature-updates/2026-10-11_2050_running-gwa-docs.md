# Documentation for the student running GWA decision

- **Date:** 2026-10-11 20:50 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow), documentation
- **Migration:** None

## Files changed
- `docs/02-thesis/decisions/STUDENT_RUNNING_GWA_2026-10-11.md` (new)
- `docs/02-thesis/figures/Figure-2.2-Flowchart-Student.mmd`
- `docs/02-thesis/figures/Figure-2.8-DFD-Student.mmd`
- `docs/01-system/overview/ASPIRE_CONTEXT.md`
- `docs/01-system/overview/capstone-system-design-v2.md`
- `docs/01-system/notifications/NOTIFICATION_SYSTEM_CATALOG.md`
- `docs/README.md`

## What changed and why
These documents now describe the running-GWA work recorded in today's code change records (`2026-10-11_1952-01` through `2026-10-11_2045`).

- **New decision record.** It explains why Capstone 1 panel rule 2.2.1 is superseded, and covers:
  - the label stages and the two safeguards;
  - the related decisions: live AI Standing, per-subject FDA, AI insight refresh rules, Ask ASPIRE changes, admin override email;
  - the accepted known difference after an admin SG override;
  - a defense answer.

  The panel transcript analysis stays unchanged as the historical record.
- **Figure 2.2.** "Milestone not yet posted" now leads to "Show running GWA from recorded scores (labeled Tentative)" instead of "Milestone hidden from student".
- **Figure 2.8.** Processes 2.0 (Dashboard), 3.0 (Grade Report) and 6.0 (AI Study Tutor) also read `student_activity_scores`, and the flow labels say "running / posted GWA".
- **System overview docs.** The student grade-visibility rule now describes the tentative running GWA, and `ASPIRE_CONTEXT.md` states that FDA counts absences per subject.
- **Notification catalog.** Adds the admin override's student notice (`grade_changed`, emailed) and faculty compliance notice.
- **Docs index.** Indexes the decision record, marks rule 2.2.1 as superseded, and notes the figure revision.

The thesis Chapters 1–2 `.docx` is updated separately.

## How to verify
- Open the decision record; its links to the change records and the panel analysis resolve.
- Render Figures 2.2 and 2.8 from the `.mmd` sources; the new nodes and flows appear.
- `npm run audit:freeze` reports no unlogged changes.
