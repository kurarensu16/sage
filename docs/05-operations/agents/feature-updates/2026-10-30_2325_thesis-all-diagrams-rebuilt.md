# All diagram figures rebuilt, Registrar flowchart added, missing sources created

- **Date:** 2026-10-30 23:25 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix, plus new figures approved by the owner
- **Migrations:** none

## Files changed

Updated sources in `docs/02-thesis/figures/`:

- `Figure-2.2-Flowchart-Student.mmd`, `Figure-2.3-Flowchart-Faculty.mmd`,
  `Figure-2.4-Flowchart-Dean.mmd`, `Figure-2.5-Flowchart-Admin.mmd`
- `Figure-2.9-DFD-Faculty-A.mmd`, `Figure-2.9-DFD-Faculty-B.mmd`

New sources, for figures that had none:

- `Figure-2.5a-Flowchart-Registrar.mmd` — the fifth portal's flowchart
- `Figure-2.11-DFD-Context.mmd` — the Level 0 context diagram
- `Figure-2.18-ERD-Layer1.mmd` — ERD Layer 1

Word file: seven more figures swapped, one new figure placed, series renumbered.

## Every diagram figure now has a source

Before this change four figures existed only as images, so they could not be
corrected without redrawing them by hand. Three now have Mermaid sources. The
fourth and fifth — Figure 1.1, the conceptual framework, and Figure 2.1, the
SDLC diagram — are left alone deliberately: neither describes the system, so
neither can drift from it.

## What was wrong in the flowcharts

| Figure | Corrected |
|---|---|
| 2.2 Student | join-by-code branch and its pending/rejected states removed; consultation request replaced by consultation history and the dispute chain; Academic Insights added; practice answer-withholding shown |
| 2.3 Faculty | Create Classrooms and Enrollment Requests removed entirely; consultation request became the grade consultation log; the instructor's two steps in the dispute chain added |
| 2.4 Dean | Faculty Loading module added, with the conflict refusal that discloses only another college's college and program; the Dean's dispute step added, including passing to the Registrar once the window closes |
| 2.6 Admin | the whole Academic Setup branch and grade override removed, both now the Registrar's; System Maintenance drawn for the first time — service health, storage and AI allowance, maintenance windows, encrypted backups; Student Account Requests added |
| 2.13 Faculty DFD | join-code stores gone; dispute and evidence stores added to Grades; consultation process became the grade consultation log |

## The Registrar flowchart

Figures 2.2–2.6 give a flowchart per portal. The role split created a fifth
portal and left it without one, so a series that reads as exhaustive was not.
It is placed before the Admin flowchart, matching the order used everywhere
else, which shifted every figure from the old 2.5 onward by one.

Its loading branch draws the refusal paths as ordinary outcomes rather than
error cases, because that is what they are: an assignment with no schedule is
refused outright, and a clash returns the assignment to the picker instead of
being recorded and resolved later.

## Numbering

**36 more references shifted.** The series is contiguous from 2.1 to 2.41,
verified by walking every caption in order. The paper now holds 41 Chapter 2
figures, up from 34.

## Verification

Paragraphs 785 → 865. Both documents validate clean; the full one passes
`--author "Claude Code"`.

Sixteen figures were swapped in place, which is **not** a tracked change — Word
has no revision mark for picture data, so those sixteen do not appear in the
review pane. The seven figures added as new paragraphs do appear.

## Still outstanding: the screen captures

Seventeen figures (2.25–2.41) are screenshots of the running application, and
they cannot be regenerated from a source file. **Figure 2.30 is the clearest
example of why they need retaking**, and the stale label is the least of it:
that capture still shows a *Request Consultation* button and a *Request a
Consultation* sidebar entry for a flow that no longer exists, a sidebar whose
groups predate the navigation restructure, and the heading *AI Study Tutor* in
three places.

Retaking them needs the application running against a **seeded** database. The
database was hard-reset and holds no grades, so a capture taken now would show
empty states — worse for the paper than what is there. They should be retaken
after the QA seeding, in one sitting, using
`docs/02-thesis/figures/USER_INTERFACE_SCREEN_CAPTURE_GUIDE_2026-10-21.docx`.
