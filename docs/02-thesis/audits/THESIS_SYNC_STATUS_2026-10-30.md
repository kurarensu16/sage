# Where the Chapters 1–2 sync stands

**Date:** 2026-10-30 · **One page, so a review does not mean reading five
documents.** The detail is in the three audit passes and seven change records
linked at the bottom.

---

## The four files, and which one to open

| File | Size | What it is |
|---|---|---|
| `ASPIRE_Chapters_1-2_Master_UPDATED_2026-10-21.docx` | 7.98 MB | **Your original. Untouched.** |
| `ASPIRE_Chapters_1-2_Master_TRACKED_2026-10-30.docx` | 17.1 MB | **Open this one.** Full chapters, every text edit tracked, figures replaced |
| `ASPIRE_Chapters_1-2_UPDATES_ONLY_2026-10-30.docx` | 0.28 MB | Only the changed paragraphs, under their headings. No figures. For a quick read or for an adviser |
| `ASPIRE_Chapter_1_Aligned - Post Def.docx` | 0.50 MB | Unchanged — not part of this sync |

Backups of the first and last are in `history/`, suffixed
`.before-phase6-7-sync-2026-10-30.docx`, byte-for-byte verified.

**Two things to do in Word before reading:** update the table of contents
(select all, F9) so the new headings and figure numbers appear, and expect the
review pane to show text edits but **not** the sixteen replaced pictures — Word
has no revision mark for picture data.

---

## What changed, in one list

**Structure**

- Five roles throughout, not four. The **Registrar Portal** is documented for
  the first time: its own Scope section, its own flowchart, its own Level 1 DFD.
- Eight modules moved out of Admin, where the paper still had them. Admin now
  reads as accounts and system maintenance only, with four maintenance modules
  documented for the first time.

**Features the paper never mentioned**

- The **Grade Change Request chain** — four portals, a thirty school-day window,
  required evidence, and the Registrar's authority to reopen a closed term.
- **Cloudflare R2** and both private Supabase Storage buckets, plus a storage
  sentence in the R.A. 10173 discussion, which previously cited no storage
  control at all.
- The **seven edge functions**, where every privileged server action happens.
- The student's **Academic Insights** page, the **Dean's Faculty Loading**, and
  Phase 7's advising capabilities — study plans, withheld practice answers,
  curated search destinations, the per-student cap and institutional budget.

**Things that were simply wrong**

- The class join code, in nine places including two ERD narratives.
- Six modules described that no longer exist.
- Four tables named in the ERD that had been dropped — two of them a week
  *before* the paper's own 2026-10-21 revision.
- **A published number:** Table 2.6's attendance points are multiplied by 1.5 in
  Summer terms, so two absences score 15 and not 10.
- Tables 2.3 and 2.6 read as fixed institutional constants; both are derived
  from configurable settings.
- Consultation: the request flow is gone. This reached **Specific Problem 4 and
  Specific Objective 5**, not just module descriptions — the wording to read
  most carefully.

**Figures** — 34 → **41**, contiguous 2.1 to 2.41. Sixteen rebuilt from their
sources and swapped in place; seven added. Every diagram figure now has a
Mermaid source it can be corrected from, where four previously had none.

---

## Outstanding, and who owns it

| Item | Owner |
|---|---|
| **The seventeen screen captures, 2.25–2.41** | **you** |
| The AI provider: the paper cites OpenRouter and Gemini 2.5 Flash, the system calls DeepSeek directly | you, deferred until after QA |
| *Review and Post Grades* vs *Grade Computation Preview* — three names for one page | you; both are defensible, so it is not a question of fact |
| `AGENTS.md:112` still mandates "AI Study Tutor" | stale either way |

**On the screen captures.** They cannot be regenerated from a source file, and
the stale *AI Study Tutor* label is the least of what is out of date — Figure
2.30 still shows a *Request Consultation* button and sidebar entry for a flow
that no longer exists, and a sidebar whose groups predate the navigation
restructure. They need the application running against a **seeded** database;
taken against the current hard-reset database they would show empty states,
which is worse than leaving them. Retake them in one sitting after QA seeding,
using `../figures/USER_INTERFACE_SCREEN_CAPTURE_GUIDE_2026-10-21.docx`.

---

## Verified accurate — so the next review does not re-derive it

Checked against code, not assumed: the password policy and 8-digit recovery
code; all four risk weights, point bands and tiers; all five COG templates with
every component weight; the MR, TFR and SG formulas including the Summer
variant; all nine transmutation rungs; the four-factor risk ceilings and the
135-capped-to-100 total. `npm run verify:grading` passes, checking 2,807
generated transmutations against an independent SQL implementation.

Six of the nine numeric tables were exactly right on the first check.

---

## The detail

Audits — [pass 1, paper-first](THESIS_CODE_DIVERGENCE_2026-10-30.md) ·
[pass 2, system-first](THESIS_CODE_DIVERGENCE_2026-10-30_PASS2.md) ·
[pass 3, claim-by-claim](THESIS_CODE_DIVERGENCE_2026-10-30_PASS3.md)

Change records in `docs/05-operations/agents/feature-updates/`: `2026-10-30_2145`
through `2026-10-30_2325`.

Each pass found what the previous one structurally could not. Pass 1 compared
what the paper describes; pass 2 asked what it never mentions; pass 3 compared
values rather than topics. The wrong attendance number could only have been
found by the third.
