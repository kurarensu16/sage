# Thesis Chapters 1–2 — second pass, system-first audit and update

- **Date:** 2026-10-30 22:00 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migrations:** none

The first pass read the paper and asked what had drifted. This one runs the
other way: it enumerates what the system has and asks what the paper never
mentions. That reversal found seven features with **zero** coverage.

## Files changed

- `docs/02-thesis/audits/THESIS_CODE_DIVERGENCE_2026-10-30_PASS2.md` (new)
- `docs/README.md`
- `C:\Users\JC Gabriel\Downloads\ASPIRE Thesis - Chapters 1-2\ASPIRE_Chapters_1-2_Master_TRACKED_2026-10-30.docx`

The 2026-10-21 master is still untouched. Backups from the first pass stand.

## Method

All 78 routes from `src/App.jsx`, every page under `src/pages/`, all seven edge
functions, both storage buckets and the live table list, each checked against the
accepted text of the paper.

## What had zero coverage, and is now documented

**The Grade Change Request chain.** The largest omission. Four portals, routes in
all of them, and not one mention in the paper — not "grade change request" in any
casing. Added: a bullet in the Student, Faculty and Dean portals (the Registrar
already had Late Grade Changes from the first pass), plus a new
**Grade Change Request Chain** subsection describing the whole flow once:
submission with one to three required evidence files inside a thirty school-day
window, instructor forward or reject, Dean approval inside the window or
escalation to the Registrar once it has closed, then the instructor applying the
correction. It records explicitly that a student may never propose a grade, a
remark or a score.

This matters beyond completeness: Specific Problem 7 asks how ASPIRE protects the
accuracy of academic records through controlled correction workflows, and the
dispute chain is the strongest answer the system has.

**Cloudflare R2, and both Supabase Storage buckets.** Two new rows in Table 2.10
— *File Storage* and *Server-Side Functions* — placed after Deployment so the
infrastructure rows sit together. "avatars" had appeared zero times and the
R.A. 10173 discussion cited no storage control at all, which is now fixed with a
sentence on private buckets, owner-confined photo paths, and evidence readable
only by a request's participants.

**The seven edge functions.** Named in the new Server-Side Functions row, with
the point that keys and storage credentials are server secrets and never reach
the browser bundle.

**The student's Academic Insights page.** The student has three support pages and
the paper listed two; Academic Insights had zero mentions. The paper had folded
its work into the AI Study Advising entry.

**The Dean's Faculty Loading.** `/dean/facultyloading` renders the same workspace
as the Registrar's, scoped by `can_load_faculty_for_department()`. A new Faculty
Loading Module in the Dean Portal, noting the cross-college conflict disclosure
boundary — college and program only, not subject and section.

**Phase 7's AI advising capabilities.** The paper described the feature as it was
before Phase 7. Now also: one active study plan per subject per term archived at
rollover, practice sets whose answers are withheld until submission, curated
search destinations instead of the model browsing, grounding in faculty-supplied
learning resources, and a per-student daily limit with an institution-wide call
budget.

## Verification

`validate.py --original --author "Claude Code"`: XSD clean, and every text
difference is inside a `<w:ins>` or `<w:del>`. Paragraph count 785 → 828. The two
new table rows carry `<w:ins>` in `<w:trPr>`, so Word shows them as inserted rows
rather than silently added ones.

## Still outstanding

- **The AI provider**, by the owner's decision. Six places still cite OpenRouter
  and Gemini 2.5 Flash, one a reference entry.
- **Figures**, which cannot be done as text: a Registrar flowchart and Level 1
  DFD, Figure 2.12 redrawn for five portals, Figure 2.23 retaken without the old
  label, and the five ERD layer images — those last worth doing only after runs
  2–13 of the schema extraction.
- **The table of contents field** needs updating in Word (select all, F9).
- **`AGENTS.md:112`** still mandates "AI Study Tutor" everywhere.
