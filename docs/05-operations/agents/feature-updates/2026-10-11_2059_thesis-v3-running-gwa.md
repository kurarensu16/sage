# Thesis Chapters 1–2 v3: student running GWA

- **Date:** 2026-10-11 20:59 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow), thesis text and figures
- **Migration:** None

## Files changed
Outside the repository, in `Downloads/ASPIRE Thesis - Chapters 1-2/`:
- `ASPIRE_Chapters_1-2_Master_UPDATED_2026-10-11_v3.docx` (new, clean)
- `ASPIRE_Chapters_1-2_Master_TRACKED_2026-10-11_v3.docx` (new, same edits as tracked changes by "Claude (Thesis update 2026-10-11)")
- `ASPIRE_Chapters_1-2_Master_UPDATED_2026-10-10_v2.docx` and `ASPIRE_Chapters_1-2_Master_TRACKED_2026-10-10_v2.docx` moved to `history/` (not modified)

## What changed and why
The paper now describes the student running GWA recorded in `docs/02-thesis/decisions/STUDENT_RUNNING_GWA_2026-10-11.md`. Both v3 files are built from the v2 clean copy. The tracked copy therefore shows only today's edits.

Text edits (5 tracked edits in 4 passages):
1. **Ch. 1 Scope, Score Breakdown.** Adds "and the tentative period and semestral ratings computed from recorded scores until the milestone is posted."
2. **Ch. 1 IPO, Output Phase.** Adds "a tentative running GWA until milestones are posted".
3. **Ch. 2 Student Portal paragraph** (two edits):
   - The dashboard GWA is "labeled Tentative until every Semestral Grade is posted", and the dashboard shows "a standing indicator computed live with the AI Study Tutor's rule" (was "an Academic Insights status indicator derived from the latest saved insight").
   - My Grades shows "tentative values for milestones not yet posted", plus a new sentence: "Posted milestones replace live values, and blank activities are not counted until recorded."
4. **Ch. 2 Figure 2.8 description.** "showing only posted or released data" now reads "showing posted milestones, released activity scores, and a tentative running GWA computed from those scores".

Figures:
- **Figures 2.2 and 2.8** are re-rendered from the updated `.mmd` sources with the repo's figure style (`render-config/`) at 2× scale, using `@mermaid-js/mermaid-cli@11.4.2` through `npx`. No project dependency was added.
- Each new image fits inside the original figure's box with its aspect ratio kept. Image swaps are not tracked changes.

Both files pass the docx skill's XML validation. The tracked copy passes the author check, so every text change is tracked. Paragraph count is unchanged (658).

## How to verify
Open the TRACKED v3 in Word with Review → All Markup. The 5 insertions and 3 deletions appear in the four passages above. Figures 2.2 and 2.8 show the tentative running GWA node and the `student_activity_scores` flows. Check that the two figures fit their pages.
