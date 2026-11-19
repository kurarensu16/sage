# Chapters 1–2 Shortening Plan (2026-11-19)

**Status:** Proposal. Nothing has been changed in the paper. Steps C–E need the adviser's approval first.

**Why:** Chapters 1–2 run to about 153 pages (Chapter 1 about 40, Chapter 2 about 113). Chapters 3–4 are final and are not touched by any step below.

**Source of the numbers:** the page numbers stored in the paper's table of contents (before the 2026-11-19 edits), section word counts, and a count of every figure and table caption. Page figures are approximate.

---

## 1. Where the pages go

| Part | Pages | Words | Mostly |
|---|---|---|---|
| **Chapter 1** | **~40** | | |
| Review of Related Literature | 13 | | text |
| Scope and Delimitation | 9 | 2,830 | text: every function of every role |
| Definition of Terms | 7 | 1,457 | text |
| Introduction, problems, objectives, significance, frameworks, hypothesis | 11 | | text |
| **Chapter 2** | **~113** | | |
| Research design, subjects, instruments, analysis, ethics | 13 | | text |
| SDLC methodology | 4 | | text and figure |
| Requirements, proposed system, grading and risk specifications | 15 | 2,356 (proposed system) | text and tables |
| Data flow diagrams, existing system (Figs 2.2–2.6) | 9 | 650 | diagrams |
| Data flow diagrams, proposed system (Figs 2.7–2.12, 17 pages of parts) | 23 | 1,410 | diagrams |
| Visual table of contents (Fig 2.13) | 2 | | diagram |
| Database design, ERDs (Figs 2.14a–2.20b, 12 parts) | 21 | 1,671 | diagrams |
| User interface design (Figs 2.21–2.37, 17 screenshots) | 19 | 1,277 | screenshots |
| Implementation, tools, testing | 5 | | text and tables |

About **74 of Chapter 2's 113 pages are diagrams and screenshots**. The length comes from figures, not from wordiness.

---

## 2. Summary of the proposed changes

Risk: **Low** = no format or meaning concern. **Low–Med** = depends on the adviser's format. **Medium** = school templates often expect this content inside the chapter.

| # | Change | Where | Pages now → after | Saving | Risk | Adviser OK needed? | Effort | Renumbers figures? |
|---|---|---|---|---|---|---|---|---|
| 1 | Move most UI screenshots to Appendix P | Ch2, User Interface Design | 19 → 4 | ~15 | Low | No (Appendix P "Screenshots" already exists) | Low | No |
| 2 | Move the detailed ERD parts to an appendix; keep the text and one overview diagram | Ch2, Database Design | 21 → 5 | ~15 | Low–Med | Yes | Medium | Yes: the UI figures shift up |
| 3 | Move the DFD continuation pages ("part 2 of 3", …) to an appendix | Ch2, DFD Proposed System | 23 → 12 | ~11 | Medium | Yes | Low | No |
| 4 | Keep the existing-system context diagram and one Level 1 diagram; move the rest | Ch2, DFD Existing System | 9 → 4 | ~5 | Medium | Yes | Medium | Yes, a cascade: every later figure shifts |
| 5 | Turn "Proposed System for each role" into one summary pointing to the Ch1 Scope | Ch2, Logical Specifications | 4 → 1 | ~3 | Low | No | Low | No |
| 6 | Trim Definition of Terms to ASPIRE-specific terms | Ch1 | 7 → 4 | ~3 | Low | No | Low | No |
| 7 | State the instrument and compliance formulas once | Ch2, Instruments, Data Gathering, Data Analysis | 7 → 5 | ~2 | Low | No | Low | No |
| 8 | Tighten the literature review's wording, keeping every source | Ch1, RRL | 13 → 11 | ~2 | Low | No | High | No |
| 9 | Tighten the role lists in the Scope (optional) | Ch1, Scope and Delimitation | 9 → 7 | ~2 | Medium | Optional | Medium | No |
| | **Total if all are done** | | **~153 → ~95** | **~58** | | | | |

---

## 3. Details for each change

| # | Stays in the chapter | Moves to | Gets reworded | Side effects to handle |
|---|---|---|---|---|
| 1 | 3 key screens: Student Grade Report, Faculty Scorebook, Dean SG Approvals (Figs 2.21–2.23) | The other 14 screenshots (Figs 2.24–2.37) → Appendix P as Figs P.1–P.14 | One intro paragraph per portal → one paragraph for the section, with "see Appendix P" | Update the TOC only |
| 2 | The ERD text (57 tables in 7 categories) and a new overview diagram of the 7 categories | All 12 ERD parts (Figs 2.14a–2.20b) → Appendix I, renamed "Data Dictionary and ERDs" | The 7 per-figure paragraphs that list every table → one paragraph per category | UI figures renumber 2.21–2.37 → 2.15–2.31; remove the "Figures 2.14a, 2.14b…" reference; the overview is drawn with the existing ERD generator |
| 3 | The context diagram (Fig 2.7) and part 1 of each portal's Level 1 diagram (Figs 2.8–2.12) | 11 continuation parts → a new Appendix R, "Data Flow Diagrams, continued" | Each Level 1 description stays, with "continued in Appendix R" | No renumbering. Appendix R goes after Q, so Ch3–4's references to Appendices L and O stay correct |
| 4 | Existing-system context diagram (Fig 2.2) and one combined Level 1 diagram (Fig 2.3) | Figs 2.4–2.6 → Appendix R | Short descriptions for the moved figures | Every figure from 2.7 onward shifts down by 3, with each in-text reference. Done last so renumbering happens once |
| 5 | One summary paragraph and Table 2.3 | — | 2,356 words → about 500 | None |
| 6 | COG, MR, TFR, SG, GWA, FDA, risk tiers, HITL, RBAC, Faculty Loading, Grade Report | — | Remove general terms and terms already explained in the text | None |
| 7 | The formulas, in Data Analysis only | — | Instruments and Data Gathering point to Data Analysis | Table 2.2 stays where it is, because Chapter 3 cites it |
| 8 | Every citation and finding | — | Shorter sentences, less restating | Recheck that citations still match the references |
| 9 | Every module and role | — | Shorter function descriptions | Must stay consistent with the evaluation tool and Chapter 3 |

---

## 4. Recommended order

Each step stands on its own and can be stopped after.

| Step | Changes | Why this order | Pages after (approx.) |
|---|---|---|---|
| A | 1 (screenshots) | Biggest safe win, no adviser approval needed, no renumbering | ~138 |
| B | 5, 6, 7 (repetition, definitions, instruments) | Text only, low risk | ~130 |
| C | 2 (ERDs), after the adviser says yes | Big saving; renumbers only the UI figures | ~115 |
| D | 3 (DFD continuations), after the adviser says yes | Big saving; no renumbering | ~104 |
| E | 4 (existing DFDs), after the adviser says yes | Causes the renumbering cascade, so it goes last | ~99 |
| F | 8, 9 (wording), optional | Prose polishing | ~95 |

After every step: update the table of contents in Word (Ctrl+A, then F9), then re-run the numbering and plain-English checks.

---

## 5. Safeguards

- **Chapters 3–4 are never edited.** They refer only to Table 2.2 and Appendices A–Q, and no step moves or reletters those.
- **New appendix material goes after Appendix Q** (as Appendix R), or into an existing appendix (I or P), so no appendix letter changes.
- **Nothing is deleted outright** except trimmed definitions and repeated text. Figures move; they are not removed.
- **Both copies are updated:** the UPDATED copy and the TRACKED copy (as tracked changes), with the previous version kept in `history/`.

## 6. Questions for the adviser

1. May the detailed ERD parts and the DFD continuation pages be placed in appendices? (This decides steps C–E, about 31 of the ~58 pages.)
2. Is there a page limit or a required template for Chapter 2?
3. Should Appendix K (Interview Guides) be kept? The research design states that no interviews were used.
