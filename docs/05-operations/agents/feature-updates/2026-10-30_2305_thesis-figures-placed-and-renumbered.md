# Six pending figures placed, with descriptions, and the figure series renumbered

- **Date:** 2026-10-30 23:05 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New figures and descriptions, approved by the owner
- **Migrations:** none

The owner asked for descriptions written from my own understanding, to edit
later, and for the figures to be placed in the same pass.

## Files changed

- `ASPIRE_Chapters_1-2_Master_TRACKED_2026-10-30.docx`
- `ASPIRE_Chapters_1-2_UPDATES_ONLY_2026-10-30.docx`
- `docs/02-thesis/figures/rendered-pending-placement/` removed; nothing is pending

## What went in

| New | Figure | Placed |
|---|---|---|
| ✓ | 2.7 Existing Level 1 — Student | after the Figure 2.6 narrative |
| ✓ | 2.8 Existing Level 1 — Faculty | " |
| ✓ | 2.9 Existing Level 1 — Dean | " |
| ✓ | 2.10 Existing Level 1 — Registrar | " |
| ✓ | 2.15 Level 1 DFD: Registrar Portal | after the Dean Portal DFD |
| ✓ | 2.22 ERD Layer 4b — AI Advising & Grade Consultation | after Layer 4a |

The existing-system set sits **before** the proposed-system section, as the
owner specified. Each figure carries two or three paragraphs of description in
the paper's own voice, written to be edited.

Layer 4's caption and heading were corrected from *Risk, Advising &
Consultation* to **Risk, Intervention & Referral**, since advising and
consultation moved to 4b.

## Renumbering

Inserting six numbered figures shifts everything after them. **51 references
renumbered**, and the series is now contiguous from 2.1 to 2.40, verified by
walking every caption in order. Old 2.7–2.10 became 2.11–2.14; old 2.11–2.16
became 2.16–2.21; old 2.17 became 2.23; the seventeen screen captures 2.18–2.34
became 2.24–2.40.

Renumbering runs **before** insertion and **descending by old number**, so a
number that has already been shifted is never matched again. The pattern is
`Figure 2\.N(?!\d)`, because a plain substring match for `Figure 2.4` also hits
`Figure 2.40`.

## Four defects caught by validation rather than shipped

1. **Duplicate relationship ids.** I took the next free id as the maximum over
   *image* relationships, but the rels file also holds styles, numbering, theme,
   fontTable and header entries with their own ids. The new figures reused
   rId45 and rId46.
2. **An existing figure was overwritten.** The same mistake on the media
   counter: `image36.jpg` and `image37.jpeg` belong to the header and never
   appear in `document.xml.rels`, so the maximum came out as 35 and the new
   files were written as image36–41 — destroying `image38.png`. Both counters
   now scan everything.
3. **Duplicate bookmark ids.** Cloning a real figure paragraph to inherit its
   formatting also clones its bookmarks, and bookmark ids are document-unique.
   Clones are stripped of bookmarks.
4. **Orphaned bookmark ends in the extract.** The updates-only file keeps some
   paragraphs and drops others, which separates a bookmark start from its end.
   Bookmarks exist to anchor the table of contents and cross-references, neither
   of which survives into an extract, so they are dropped wholesale there.

## Verification

Paragraphs 785 → 860. Both files validate clean, and the full document passes
`--author "Claude Code"`: every text difference inside a revision mark. The six
new pictures are tracked insertions, so they appear in the review pane — unlike
the nine swapped in the earlier pass, which cannot.

## Still outstanding

Flowcharts 2.2–2.5 and the Faculty DFD 2.13 are still drawn as the system was
before the role split; Figure 2.29's screenshot still shows the old *AI Study
Tutor* label. There is also no Registrar **flowchart** to sit with 2.2–2.5,
only the DFD.
