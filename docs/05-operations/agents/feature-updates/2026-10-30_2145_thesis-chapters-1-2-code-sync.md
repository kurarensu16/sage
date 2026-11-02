# Thesis Chapters 1–2 brought in line with the code

- **Date:** 2026-10-30 21:45 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migrations:** none

The paper had drifted from the system across Phases 4–7 and the registrar role
split. Audited, then corrected as Word tracked changes.

## Files changed

- `docs/02-thesis/audits/THESIS_CODE_DIVERGENCE_2026-10-30.md` (new)
- `docs/README.md`
- `C:\Users\JC Gabriel\Downloads\ASPIRE Thesis - Chapters 1-2\ASPIRE_Chapters_1-2_Master_TRACKED_2026-10-30.docx` (new)

Backups first, byte-for-byte verified, into the thesis folder's `history/`:

- `ASPIRE_Chapters_1-2_Master_UPDATED_2026-10-21.before-phase6-7-sync-2026-10-30.docx`
- `ASPIRE_Chapter_1_Aligned - Post Def.before-phase6-7-sync-2026-10-30.docx`

The 2026-10-21 master is **left untouched**. The tracked copy is a new file, so
the owner accepts or rejects in Word and saves the clean `UPDATED` copy under
their own naming convention.

## Owner's decisions, recorded

| Question | Decision |
|---|---|
| Paper cites OpenRouter + Gemini 2.5 Flash; code calls DeepSeek directly | **Leave both, decide after QA.** No AI-provider edits applied. |
| Four roles in the paper, five in the system | **Add the full Registrar Portal section.** |
| "AI Study Tutor" vs the shipped "AI Study Advising" | **Rename in the paper.** |
| Edit mode | **Tracked changes.** |

## What changed in the paper

**Five roles, not four** — 11 places, including the ones that carry weight: the
RBAC paragraph in the conceptual framework, the scope and delimitation
statement, Specific Problem 1, Specific Objective 1, the methodology's role
definition, the Process Phase, and the ISO/IEC 25010 Functional Suitability
criterion.

**A new Registrar Portal section**, 26 paragraphs, with module names and
groupings taken from `PORTAL_NAVIGATION` in `Sidebar.jsx` so the paper matches
what the sidebar shows: Dashboard, People, Academic Setup, Enrollment and
Loading, Grade Records, Reports, Notifications, Account.

**Eight modules moved out of Admin**, where the paper still had them: Subjects,
Grading Templates, Manage Sections, Section Rosters, Colleges and Departments,
Classroom Provisioning (deleted outright), Academic Terms, Grade Override. Admin
now reads as accounts and system maintenance only, matching `AGENTS.md`.

**Four Admin modules documented for the first time** — System Health, Storage
Health, Maintenance Mode, Backup and Restore. Without these the Admin Portal
would have read as almost empty after the move, which would be wrong.

**The class join code removed** — 9 references, including the Figure 2.8 and 2.9
DFD narratives and the Figure 2.14 ERD narrative, which named
`CLASS_ROOM_JOIN_CODES` and `CLASS_JOIN_REQUESTS`.

**Consultation reworded, and this is the part to read carefully.** It reaches a
specific problem and an objective, not just module descriptions:

- Specific Problem 4 kept its shape — the system does still supplement reactive
  consultation with proactive monitoring — but now says "student-initiated grade
  **concerns**" and "a structured, **time-bounded** grade consultation channel".
- Specific Objective 5 now reads "time-bounded grade consultation windows".
- Statement of the Problem paragraph 3 and the delimitation paragraph no longer
  claim student-requested consultation is available as it was.
- Student *Consultations* became *Consultation History*; faculty *Consultation
  Requests* became *Grade Consultation Log*.

**ERD narratives corrected** — layer 2 now describes `FACULTY_LOAD_DRAFTS` and
`PROVISIONING_LOCKS`; layer 4 drops `FACULTY_PERFORMANCE_INSIGHTS` (a table
dropped on **2026-10-14**, a week before the paper's own revision) and names the
grade-consultation and AI advising tables.

**"AI Study Tutor" → "AI Study Advising"** — 23 occurrences, not the 22 first
reported: the earlier count used `grep -c`, which counts matching *lines*, and
one paragraph names it twice.

## How the edits were made

`merge_runs.py`, then a scripted pass over `word/document.xml`, then repack.
Every edit asserts how many times its anchor matched and aborts the whole run on
a mismatch, because a partially applied pass writes a file that looks finished.

Validated with `validate.py --original --author "Claude Code"`: XSD clean, and
the author check confirms **every** text difference is wrapped in a `<w:ins>` or
`<w:del>`. Paragraph count 785 → 815.

Three defects were caught by that validation and fixed rather than shipped:

1. The paragraph-mark deletion was landing `<w:del>` in a **run's** `rPr`
   instead of the paragraph mark's, because a non-greedy search from `<w:pPr>`
   for the next `<w:rPr>` reaches into the first run when the `pPr` has none.
   Invalid under `CT_RPr`, valid under `CT_ParaRPr`.
2. The run splitter read only the **first** `<w:t>` in a run. `merge_runs.py`
   coalesces runs by concatenating children, so 8 runs held several `<w:t>`
   siblings — and the tail of two paragraphs was being dropped silently.
3. One run held `<w:lastRenderedPageBreak/>` beside the text; it is now carried
   over rather than discarded.

## Still outstanding

- **The AI provider**, by the owner's decision. Six places still cite OpenRouter
  and Gemini 2.5 Flash, one of them a reference entry.
- **Figures.** The Registrar Portal needs its own Proposed System Flowchart
  (with Figures 2.2–2.5) and Level 1 DFD (with Figures 2.8–2.11), and Figure
  2.12's Visual Table of Contents must be redrawn for five portals.
- **Figure 2.23's screenshot** still shows the old *AI Study Tutor* label.
- **The five ERD layer images** still show dropped tables and none of the
  Phase 6–7 ones. Worth redrawing only after runs 2–13 of the schema extraction,
  or it gets drawn twice.
- **The table of contents field** needs updating in Word (select all, F9) for
  the new headings to appear.
- **`AGENTS.md:112`** still mandates "AI Study Tutor" everywhere and is now
  stale in both directions.
