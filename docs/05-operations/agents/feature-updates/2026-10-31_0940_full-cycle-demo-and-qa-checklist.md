# Full-cycle demo script and QA master checklist

- **Date:** 2026-10-31 09:40 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New document, approved by the owner
- **Migrations:** none

## Files changed

- `docs/04-testing/ASPIRE_FULL_CYCLE_DEMO_AND_QA_2026-10-31.md` (new)
- `docs/README.md`

Nothing was deleted. The per-page checklists stay — see the note at the end.

## Why

The Capstone 1 panel objected that the walkthrough showed pieces — grading, then
something else — rather than the process the objectives describe. The cause is
structural: the existing checklists are organised by **page**, which mirrors the
sidebar, not the process. Anything drawn from them reads as a tour of screens.

This document runs the other way: one continuous cycle, from creating an account
to correcting a posted grade, in the order the system enforces, with each stage
tagged to the Specific Objective it answers.

## The owner's two-semester plan

The same cycle runs twice:

| Pass | Semester | Purpose | Timed |
|---|---|---|---|
| A | 2026–2027 **1st** | QA. Find bugs. **Produce the archive** | no |
| B | — | **Term rollover**, itself a test | no |
| C | 2026–2027 **2nd** | The defense demo | **20:00** |

Running pass A is not preparation for the demo — it *is* the first semester's
history. Zero classes and zero posted grades today is therefore the correct
starting point, not a gap, and it closes out `TEST_YEAR_SEED_2026-2027.md`
stages 1b and 1c, which have been outstanding since 2026-10-11.

**What a single semester could never show**, and pass A unlocks: populated
read-only archive views, the rollover and SG grace period, cumulative GWA across
terms, a **closed** dispute window — the only way to exercise the Registrar's
late-grade-change authority — and
`aspire_archive_tutor_plans_on_rollover()`, a trigger that fires only on a
rollover and otherwise can never be seen to do anything.

## What the scan established

**Consultation-on-Midterm and dispute-on-Semestral-Grade are one design**, not
two choices. The window table constrains itself:

```sql
grade_period TEXT NOT NULL
  CHECK (grade_period IN ('midterm_rating', 'tentative_final_rating'))
```

A semestral grade cannot have a consultation window opened for it by any code
path. While a window is open the faculty may still revise the scores behind that
milestone; `finalize_grade_milestone()` freezes them. The official record is not
negotiable that way, so it takes evidence and three approvals. That contrast is
the demo's argument, and the constraint is the answer if a panelist asks why.

The window also opens on a **trigger**, `open_consultation_window_on_post()`, so
posting opens it with nothing to click.

## Starting state, measured today

10 colleges · 26 programs · 12 subjects · 5 COG templates · 8 sections ·
2026–2027 1st active, not ended · 1 admin, 1 registrar, 10 deans, 40 faculty,
64 students · **0 classes, 0 enrolments, 0 posted grades**.

## Two decisions worth recording

**Pass C needs two classes, not one.** Stage 2 provisions a class live to show
loading and its refusals; stages 4–9 run on a different class already carrying
scores, because entering four milestones live costs more than the whole twenty
minutes. One sentence covers it honestly.

**The per-page checklists were kept, not deleted.** The owner asked about
removing them; the recommendation was to demote rather than delete, because they
answer a different question — whether each page handles its own edge cases — and
they are the regression layer for the six paths that have never executed. The
new document points at them as its depth layer. Reversible on request.

## Open

20:00 has no slack. The cut order is in the document; it may be worth trimming
deliberately to about 17:00 rather than discovering the overrun in the room.
