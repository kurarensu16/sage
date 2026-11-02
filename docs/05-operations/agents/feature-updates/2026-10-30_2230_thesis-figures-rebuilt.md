# Thesis figures rebuilt against the system, and existing-system DFDs created

- **Date:** 2026-10-30 22:30 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix, plus new figures approved by the owner
- **Migrations:** none

## Files changed

Updated sources in `docs/02-thesis/figures/`:

- `Figure-2.8-DFD-Student.mmd` (+ `-A` / `-B` column halves)
- `Figure-2.10-DFD-Dean.mmd` (+ `-A` / `-B`)
- `Figure-2.11-DFD-Admin.mmd`
- `Figure-2.12-VTOC.mmd`
- `Figure-2.14-ERD-Layer2.mmd`, `Figure-2.15-ERD-Layer3.mmd`,
  `Figure-2.16-ERD-Layer4.mmd`, `Figure-2.17-ERD-Layer5.mmd`

New sources:

- `Figure-2.6-DFD-Existing-Level0.mmd` — the existing Level 0, which had no source
- `Figure-2.6a-DFD-Existing-Student.mmd`
- `Figure-2.6b-DFD-Existing-Faculty.mmd` (+ `-A` / `-B`)
- `Figure-2.6c-DFD-Existing-Dean.mmd`
- `Figure-2.6d-DFD-Existing-Registrar.mmd` (+ `-A` / `-B`)
- `Figure-2.11a-DFD-Registrar.mmd` (+ `-A` / `-B`) — proposed Registrar portal
- `Figure-2.16b-ERD-Layer4b.mmd`
- `split_tall_dfd.py` — splits a tall DFD into the two-column form Figure 2.9 uses

Word file: `ASPIRE_Chapters_1-2_Master_TRACKED_2026-10-30.docx`, nine figures
replaced in place.

## The existing system has four users, not three

The owner stated it directly: **ASPIRE has five users; the existing manual system
has four. Only the Admin is absent**, because account provisioning, academic
setup and system configuration are things a manual process does not have.

The published Figure 2.6 shows only Student, Faculty and Dean. **The Registrar
is missing from it** — a role that already exists at DYCI and already does that
work on paper. The rebuilt Level 0 adds it, and each of the four now has its own
Level 1, matching the depth the proposed system is documented at.

## Figures replaced in the Word file

| Figure | What was wrong |
|---|---|
| 2.6 Existing Level 0 | Registrar entity missing |
| 2.8 Student DFD | join-code stores; no advising, grade-change or consultation stores |
| 2.10 Dean DFD | no faculty loading; no grade change request chain |
| 2.11 Admin DFD | still showed Academic Setup and grade override, both moved to Registrar |
| 2.12 VTOC | four portals; retired modules; old feature name |
| 2.14 ERD Layer 2 | three dropped tables; no loading tables |
| 2.15 ERD Layer 3 | dropped `student_component_scores`; no Phase 6 tables |
| 2.16 ERD Layer 4 | dropped `faculty_performance_insights`; no Phase 6–7 tables |
| 2.17 ERD Layer 5 | none of the system tables that now exist |

**An image swap is not a tracked change.** Word has no revision mark for picture
data, so these nine will not appear in the review pane — unlike every text edit,
which does. That is why they are listed here in full.

## Two problems found while rendering, and the fixes

**Tall DFDs ran off the page.** Adding stores makes a DFD grow downward; the
student DFD reached 1:2.96, which is 12.7 inches at the original width. The
project already had the answer — Figure 2.9 is composed from two column halves —
so `split_tall_dfd.py` now does that split mechanically. The student DFD went
from 1:2.96 to 1:1.05.

**ERD Layer 4 became unreadable.** Phases 6 and 7 added nine tables to it, and
mermaid lays an `erDiagram` out as a single row of parent entities, so it
rendered 0.90 inches tall at page width. Split into 4a (risk and intervention)
and 4b (AI advising and grade consultation); 4a is now 1.72 inches, better than
the 1.59 it had before the split. A narrower render viewport was tried first and
changes nothing — `erDiagram` ignores it.

Every picture is scaled to fit **inside** the box the old one occupied, so no
surrounding text reflows.

## Awaiting descriptions before placement

Six figures are rendered and staged in
`docs/02-thesis/figures/rendered-pending-placement/` but are **not** in the Word
file, because they need captions, narratives and figure numbers first — and
inserting a numbered figure shifts every figure after it:

- the four existing-system Level 1 DFDs (Student, Faculty, Dean, Registrar)
- the proposed Registrar Portal Level 1 DFD
- ERD Layer 4b

The owner writes the descriptions, then these go in. Per the owner, the
existing-system DFDs are placed **before** the proposed DFD section.

Sources carry an `a` / `b` suffix rather than a new number for the same reason:
the numbering is settled when they are placed.
