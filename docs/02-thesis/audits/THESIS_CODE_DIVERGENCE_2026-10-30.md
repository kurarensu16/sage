# Thesis Chapters 1–2 vs. code — divergence audit

**Date:** 2026-10-30 · **Paper audited:** `ASPIRE_Chapters_1-2_Master_UPDATED_2026-10-21.docx`
(last revised 2026-10-25) · **Method:** full text extracted from the `.docx` and
checked against live code, `supabase/migrations/`, and the applied schema.

Backups taken before any edit, into `history/`:

- `ASPIRE_Chapters_1-2_Master_UPDATED_2026-10-21.before-phase6-7-sync-2026-10-30.docx`
- `ASPIRE_Chapter_1_Aligned - Post Def.before-phase6-7-sync-2026-10-30.docx`

Per `AGENTS.md`, RLS, the hosted password policy, and the Gemini model are
treated by the paper as already in place and are **not** flagged as gaps here.
The Gemini entry below is a different matter: the owner **replaced** that
decision, so the paper now documents a provider the system no longer uses.

---

## A. Decisions the owner has to make

### A1. The AI provider no longer matches the paper

The paper names **OpenRouter** as the gateway and **Google Gemini 2.5 Flash** as
the designated model. The system now calls **DeepSeek V4.1-Flash-1017 directly**,
with no gateway.

| Where | What it says |
|---|---|
| Ch. 2, hybrid-pattern paragraph | "uses a configurable model accessed through OpenRouter, with Google Gemini 2.5 Flash as the designated model (OpenRouter, n.d.)" |
| Ch. 2, methodology / stack | "an OpenRouter-accessed language model for advisory diagnostics" |
| Ch. 2, technical stack | "Google Gemini 2.5 Flash through OpenRouter for AI advising" |
| Ch. 2, delivery paragraph | "AI diagnostics use OpenRouter with local rule-based fallback" |
| Table 2.10 component entry | "A configurable large language model (default: Google Gemini 2.5 Flash) accessed through the OpenRouter API gateway…" |
| References | "OpenRouter. (n.d.). *Google: Gemini 2.5 Flash* [Model page]…" |

Six places, one of them a **cited reference**. Two ways forward, and it is not a
decision an audit should make:

1. **Update the paper to DeepSeek.** Needs a replacement reference to DeepSeek's
   own model documentation, and the gateway language removed throughout —
   "accessed through the OpenRouter API gateway" becomes a direct provider call.
2. **Return the code to Gemini before the defense.** The edge function is
   already provider-agnostic (`TUTOR_API_BASE` / `TUTOR_MODEL`), so this is an
   environment change, not a rewrite.

Either is defensible. What is not defensible is a panel opening the code and
finding a different provider than the chapter cites.

### A2. The paper describes four roles; the system has five

The Registrar portal **does not appear in the paper at all**. Both occurrences of
"Registrar" refer to *not* integrating with DYCI's registrar office — a different
claim, and still true.

"Four roles" or "four role-based portals" appears **seven times**, including in
places that are load-bearing:

- the RBAC paragraph in the conceptual framework ("ASPIRE applies four roles:
  Student, Faculty, Dean, and Admin")
- the scope and delimitation statement
- the methodology ("defined the four operational roles")
- the Process Phase of the conceptual framework
- the ISO/IEC 25010 Functional Suitability criterion ("across all four
  role-based portals")
- Role-Based Login and Manage Users module descriptions

Worse, the paper's **Admin Portal** section still owns eight modules that are now
the Registrar's:

| Module in the paper under Admin | Now lives in |
|---|---|
| Subjects | `src/pages/registrar/SubjectList.jsx` |
| Grading Templates | `src/pages/registrar/GradeComputationsList.jsx` |
| Manage Sections | `src/pages/registrar/SectionList.jsx` |
| Section Rosters | `src/pages/registrar/SectionMasterList.jsx` |
| Colleges and Departments | `src/pages/registrar/DepartmentsList.jsx` |
| Academic Terms | `src/pages/registrar/TermManagement.jsx` |
| Grade Override | `src/pages/registrar/GradeOverride.jsx` |
| Classroom Provisioning | **deleted** — replaced by Faculty Loading & Provisioning |

`AGENTS.md` now defines Admin as "accounts and system maintenance only".

This is the largest item in this audit. Fixing it properly touches Chapter 1
scope, the Chapter 2 RBAC framework, the module inventory, the ISO criteria, the
Visual Table of Contents (Figure 2.12), and needs a **new Registrar Portal DFD**
alongside the existing per-portal figures. A cheaper framing — Registrar as a
delegated Admin sub-role — understates what the code does and would be hard to
defend against a screen-share.

### A3. "AI Study Tutor" is now "AI Study Advising" in the product

The student feature was renamed this session. The paper uses **AI Study Tutor 22
times**, including the caption of **Figure 2.23**. The running UI says *AI Study
Advising*; only internal code comments and the edge function name still say
tutor, which was deliberate.

`AGENTS.md:112` also still mandates "AI Study Tutor" everywhere and is stale
either way.

Renaming in the paper means 22 text replacements plus a figure caption, and the
screenshot in Figure 2.23 shows the old label — so the figure needs retaking.

---

## B. Factual corrections — no decision needed

These describe things that no longer exist. They are wrong as the paper stands.

### B1. The class join code was retired

Nine references across the module inventory, the Student Portal narrative, the
Faculty Portal narrative, the Figure 2.8 and 2.9 DFD narratives, and the
**Figure 2.14 ERD narrative**:

> "…while **CLASS_ROOM_JOIN_CODES** and **CLASS_JOIN_REQUESTS** support the
> professor-led, join-code-based enrollment path used for irregular students
> joining a class outside their block section."

Both tables were dropped in `20261030140129_schema_cleanup.sql`. Irregular
enrolment is now handled by the registrar and dean through Faculty Loading &
Provisioning's roster tool.

Affected module entries: *My Subjects* (student), *My Classes* (faculty),
*Create Classroom* (faculty), *Enrollment Requests* (faculty).

### B2. Modules described in the paper that have been removed

| Module in the paper | Status |
|---|---|
| Faculty → Create Classroom | removed; `FacultyCreateClassroomModal.jsx` deleted |
| Faculty → Enrollment Requests | removed; `EnrollmentRequests.jsx` deleted |
| Faculty → Consultation Requests | removed; `ConsultationRequests.jsx` deleted |
| Student → Consultations | removed; `Consultations.jsx` deleted |
| Dean → Remark Override Requests | removed; `RemarkOverrideRequests.jsx` deleted |
| Admin → Classroom Provisioning | removed; `ClassroomProvisioning.jsx` deleted |

The student and faculty **Consultations Module** has a heading, a module entry,
and a line in each of the Figure 2.8 and 2.9 DFD narratives
("Consultations writes to `student_consultation_requests`"). Grade consultation
windows replaced the free-form consultation request flow.

### B3. The ERD names four tables that do not exist

| Table in the paper's ERD | Reality |
|---|---|
| `CLASS_ROOM_JOIN_CODES` | dropped 2026-10-30 |
| `CLASS_JOIN_REQUESTS` | dropped 2026-10-30 |
| `CLASS_FACULTY_LOG` | **dropped 2026-10-14** — a week before the paper's own revision |
| `FACULTY_PERFORMANCE_INSIGHTS` | **dropped 2026-10-14**, same migration |

The last two are pre-existing: `20261014150000_drop_legacy_evaluation_tables.sql`
removed them before the 2026-10-21 revision, and that pass did not catch them.

### B4. The ERD omits every table added since Phase 4

Twenty-five live tables are never named in the five ERD layer narratives. Many
are deliberately out of a conceptual ERD — operation ledgers, hosting tiers,
maintenance presets. These are not:

- **AI advising (Phase 7):** `student_tutor_plans`, `student_tutor_practice_sets`,
  `student_tutor_practice_attempts`, `student_tutor_log`, `search_destinations`,
  `activity_resources`
- **Grade disputes (Phase 6):** `grade_change_evidence`,
  `grade_consultation_windows`, `grade_consultation_notes`
- **Faculty loading (Phase 4):** `faculty_load_drafts`, `provisioning_locks`
- **Grading core:** `student_term_scores`, `class_grading_columns`,
  `posted_grade_revisions`, `grade_correction_history`

Figure 2.16 is titled "Risk, Advising & Consultation" and contains none of the
advising tables, because they did not exist when it was drawn.

**The five ERD layers are images.** The narratives can be edited as text; the
diagrams have to be redrawn. Runs 1–13 in
`C:\Users\JC Gabriel\Downloads\ASPIRE_Schema_Extraction_Queries.docx` exist to
generate exactly that, and runs 2–13 have not been executed yet. **Redrawing the
ERD before the extraction is finished would mean drawing it twice.**

### B5. Infrastructure absent from Table 2.10

Not mentioned anywhere in the paper:

- **Cloudflare R2** object storage (bucket `aspirev2`), reached through the
  `r2-storage` edge function
- **Supabase Storage** private buckets — `avatars` (2 MB, owner-only paths) and
  the grade-evidence bucket with its retention purge
- the five other edge functions: `create-admin-user`, `delete-admin-user`,
  `send-email`, `invoke-advisor`, `generate-intervention-draft`

Whether all of this belongs in Chapters 1–2 is a judgement call — Table 2.10 is a
component table, not an exhaustive inventory — but storage is where student
evidence files live, and the data-protection discussion under R.A. 10173 cites no
storage control at all.

---

## C. Still accurate, checked and confirmed

Worth recording so the next audit does not re-derive it:

- Four-factor risk engine, weights 60/50/15/10 capped at 100, tiers 0–24 /
  25–49 / 50–74 / 75–100 — matches `src/lib/riskEngine.js`.
- Dynamic COG template weights, not a fixed 50/10/40 — matches
  `gradingMath.js` and `officialGradingPresets.js`.
- Milestones MR / TFR / SG posted atomically, server-authoritative — matches
  `gradePostingService.js`.
- Dean-approved, one-use, student-scoped SG correction, which does not unlock
  ordinary autosave — matches the correction RPCs.
- Deterministic local fallback when the model service is unavailable — still
  present in the tutor edge function.
- Single-tenant, no guardian portal, no ML prediction — all still true.
- Archive access by one explicitly selected school year and semester, read-only
  — matches the academic-archive implementation.

---

## Suggested order of work

1. **A1** — decide the provider. One sentence either way, and everything else in
   the AI narrative follows from it.
2. **B1, B2, B3** — pure deletions and corrections. Safe to apply now; nothing
   downstream depends on them.
3. **A2** — the Registrar portal. Largest, and it changes figures, so it wants to
   be done in one deliberate pass rather than incrementally.
4. **A3** — the rename, together with retaking Figure 2.23.
5. **B4, B5** — after runs 2–13 of the schema extraction, so the ERD is redrawn
   once against the real catalog.
