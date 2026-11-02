# Chapters 1–2 vs. the system — second pass, system-first

**Date:** 2026-10-30 · **Paper audited:**
`ASPIRE_Chapters_1-2_Master_TRACKED_2026-10-30.docx`, accepted view
· **Supersedes nothing** — it extends [the first pass](THESIS_CODE_DIVERGENCE_2026-10-30.md),
which read the paper and asked what had changed. This one runs the other way:
it enumerates what the system *has* and asks what the paper never mentions.

That reversal is the point. The first pass could only find drift in things the
paper already described. Everything below is a feature the paper is **silent**
about, which no amount of re-reading the paper would surface.

**Method.** All 78 routes extracted from `src/App.jsx`, all pages under
`src/pages/`, all seven edge functions, both storage buckets, and the live table
list, each checked against the accepted text of the paper (814 paragraphs,
120,607 characters).

**Out of scope by the owner's decision:** the AI provider. The paper continues to
cite OpenRouter and Gemini 2.5 Flash.

---

## C1. The Grade Change Request chain is entirely undocumented

**Occurrences in the paper: zero.** Not "grade change request", not
"grade-change", in any casing.

This is Phase 6, and it is the largest single omission in the paper. It spans
**four portals** and has routes in all of them:

| Portal | Route | Page |
|---|---|---|
| Student | `/student/graderequests`, `/student/graderequests/new` | `MyGradeChangeRequests.jsx`, `SubmitGradeChangeRequest.jsx` |
| Faculty | `/faculty/graderequests`, `/faculty/graderequests/:requestId/apply` | `GradeChangeRequests.jsx`, `ApplyMilestoneCorrection.jsx` |
| Dean | `/dean/graderequests` (and `/dean/remarkoverriderequests`, redirected) | `GradeChangeRequests.jsx` |
| Registrar | `/registrar/lategradechanges` | `LateGradeChanges.jsx` |

The chain:

```
pending_faculty_review   -> pending_dean_review        (instructor forwards)
                         -> rejected                   (not applicable)
pending_dean_review      -> approved                   (Dean approves, in window)
                         -> pending_registrar_review    (Dean approves, window closed)
pending_registrar_review -> approved / rejected
approved                 -> applied                    (instructor corrects)
```

With it: a **30 school-day** dispute window counted in weekdays from
`academic_terms.ended_at`; **required** evidence of one to three files held in
the private `grade-evidence` bucket and purged at the next rollover once
resolved; a dedicated editor for MR and TFR corrections; and a fourth step where
the Registrar authorises reopening a closed term.

It also **replaced** the Dean's Remark Override Requests page, which the first
pass already removed from the paper. So the paper currently describes neither the
old mechanism nor the new one beyond the faculty-to-Dean SG correction.

Why this matters more than the rest: the paper's Specific Problem 7 asks how
ASPIRE protects "the accuracy and accountability of academic records through
role-based permissions, controlled grade-posting and correction workflows". The
four-step dispute chain is the strongest answer the system has to that question,
and it is not in the chapter.

## C2. Cloudflare R2 is not mentioned

**Occurrences: zero** for "Cloudflare", "R2" and "object storage".

Bucket `aspirev2`, reached through the `r2-storage` edge function with
credentials held as Supabase secrets, never exposed to the browser. The Admin
Storage Health page meters object count and total bytes against a 10 GB
free-tier ceiling.

## C3. Both Supabase Storage buckets are effectively undocumented

"Supabase Storage" appears once; **"avatars" appears zero times**.

- `avatars` — private, 2 MB, `jpeg`/`png`/`webp`, owner-only paths `user_id/...`
- `grade-evidence` — private, holds dispute evidence, with a retention purge
  (`aspire_purge_evidence()`) and a fourth storage policy added in Phase 6

The data-protection discussion under R.A. 10173 cites **no storage control at
all**, which is a gap in exactly the section where it is least defensible:
student evidence files are personal information, and the controls exist.

## C4. The seven edge functions are not mentioned

**Occurrences: zero** for "edge function".

`create-admin-user`, `delete-admin-user`, `send-email`, `invoke-advisor`,
`invoke-study-tutor`, `generate-intervention-draft`, `r2-storage`.

Table 2.10's Backend row names Supabase but not the Deno functions, and these
are where every privileged server action happens. A panel asking "where does the
AI call actually run, and can the browser see your key" has no answer in the
chapter.

## C5. The student has three support pages; the paper lists two

| Route | Page | Heading shown | In the paper? |
|---|---|---|---|
| `/student/advising-inbox` | `FacultyAdvisingInbox.jsx` | faculty action plans | yes — *Advisories and Study Plans* |
| `/student/tutor` | `StudyTutor.jsx` | **AI Study Advising** | yes |
| `/student/academic-insights` | `AcademicInsights.jsx` | **Academic Insights** | **no — zero mentions** |

Academic Insights is the Ask ASPIRE page: it generates counseling guidance,
groups released scored activities below the 75% benchmark, and explains honors
blockers. The paper folds all of that into the AI Study Advising entry, so one of
the three pages has no module description.

## C6. The Dean's Faculty Loading module is missing

`/dean/facultyloading` exists and renders the same `FacultyLoadingWorkspace` as
the Registrar's, scoped to the Dean's own college through
`can_load_faculty_for_department()`. The paper's Dean Portal section has no such
module — the only "Faculty Loading" in the document is the one added to the new
Registrar section in the first pass.

## C7. AI Study Advising's Phase 7 capabilities are undocumented

The paper still describes the feature as it was: "non-binding, activity-grounded
study diagnostics, recommendations, and President's Lister eligibility
explanations, with a deterministic fallback."

Phase 7 added, and the paper does not mention:

- **Study plans** (`student_tutor_plans`), at most one active per subject per
  term, **archived automatically when a term rolls over**
- **Practice sets** (`student_tutor_practice_sets`) whose answers are withheld
  until the student submits — enforced by RLS being enabled with **no policy at
  all**, so the table is unreachable from the client
- **Practice attempts** (`student_tutor_practice_attempts`)
- **Curated search destinations** (`search_destinations`), constrained to `https`
  and a `{q}` placeholder, rather than letting the model browse
- **Learning resources on activities** (`activity_resources`), which is where the
  faculty-supplied material the advising grounds itself in now lives
- **A per-student daily cap and an institution-wide call budget**, with usage
  metered per request (`student_tutor_log`, prompt and completion tokens, model
  served)

The withheld-answer control and the budget ceiling are both defensible design
decisions that currently appear nowhere.

## C8. Smaller items, verified

| Item | Status |
|---|---|
| Admin System Health / Storage Health / Maintenance Mode / Backup and Restore | **resolved in the first pass** — four bullets added |
| Scheduled maintenance windows, reasons, note presets | covered by the new Maintenance Mode bullet; `maintenance_reasons` and `maintenance_note_presets` not named, which is fine for a chapter |
| Backups are **always encrypted**, with no plain-text option | stated in the new Backup and Restore bullet |
| `user_push_tokens` | arguably covered — Table 2.10's Capacitor row already says "native plugins for push notifications" |
| Faculty loading requires a complete schedule | covered by the new Faculty Loading bullet |
| Risk engine 60/50/15/10, tiers 0–24/25–49/50–74/75–100 | confirmed accurate against `riskEngine.js` |
| Dynamic COG weights, not fixed 50/10/40 | confirmed accurate |

## C9. Figures — unchanged, and still the long pole

Carried forward from the first pass. None of this can be fixed as text:

- A Registrar Portal **Proposed System Flowchart** (to sit with Figures 2.2–2.5)
- A Registrar Portal **Level 1 DFD** (with Figures 2.8–2.11)
- **Figure 2.12**, the Visual Table of Contents, redrawn for five portals
- **Figure 2.23**, whose screenshot still shows the old *AI Study Tutor* label
- **The five ERD layer images**, which still show dropped tables and none of the
  Phase 6–7 ones

The ERD images are worth redrawing only after runs 2–13 of the schema
extraction, or they get drawn twice.

---

## What this pass applies to the paper

C1 through C7, as tracked changes, in the same document. C9 cannot be done as
text. The AI provider stays as it is.
