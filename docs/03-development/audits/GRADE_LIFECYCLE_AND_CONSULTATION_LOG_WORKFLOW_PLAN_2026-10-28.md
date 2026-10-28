# Grade Lifecycle Hardening & Grade Consultation Log Workflow Plan - 2026-10-28

**Status:** Proposed design. No code or migration exists yet. Every file listed under "Suggested build order" still requires its own developer confirmation before it is created or edited, per `AGENTS.md`.
**Scope:** Splits "posted" into two states — **Posted (Not Finalized)** and **Finalized** — for each milestone (MR, TFR, SG) independently, adds a per-class, timestamped **Grade Consultation Log** where faculty record who reached out during the open window, and moves **Finalize Grade** onto that log page. Retires the existing student-initiated, faculty-approved consultation-request feature entirely. Does **not** define what happens *after* a grade is Finalized and later disputed — that is roadmap item #6, `GRADE_CHANGE_REQUEST_WORKFLOW_PLAN_2026-10-28.md`. This doc only guarantees that Posting no longer equals locking.
**Trigger:** Capstone defense panel feedback and this conversation's design pass: the current request/approve consultation feature is bias-prone and saw little real use; grades are locked (`is_locked = TRUE`) the instant they are posted, leaving no window for a student to raise a concern before the record is final.

## Objective

1. Separate **Posted** from **Finalized** per milestone, so a posted grade has a deliberate window before it locks.
2. Replace the student-initiated consultation-request feature with a **faculty-driven log**: faculty records who actually reached out and a short note, during a window faculty themselves opens and closes.
3. Move the **Finalize Grade** action onto the Grade Consultation Log page, scoped per class + milestone — not on the gradebook/Class Record page.
4. Once finalized, close that class/milestone's log to further notes and fold it into the existing archive pattern, not a new archive UI.
5. On the student side, replace the always-visible "Consultations" self-service page with a conditional **Consultation History** that only renders when a faculty member actually logged a note for that student.
6. Leave the post-Finalize dispute/edit path entirely to roadmap item #6 — this doc does not add any way to edit a Finalized grade.

## Current Setup vs. New Setup

| | Today | New |
|---|---|---|
| **What posting means** | Posting a milestone (MR/TFR/SG) is effectively final the instant it happens. `post_grade_milestone_atomic` sets `is_locked = TRUE` in the same `INSERT` that creates the `posted_grades` row — there is no gap between "posted" and "locked," and no separate Finalize step exists anywhere in the flow. | Posting creates a `posted_grades` row with `finalized_at = NULL` — **Posted (Not Finalized)**. `is_locked` no longer flips at insert time; it becomes derived from `finalized_at`, so nothing already reading `is_locked` breaks, it just now flips one step later. |
| **What faculty does after posting** | Faculty clicks Post and the milestone is done — there is no further action, and no built-in reason to come back to that milestone unless a correction is needed later. | Faculty clicks Post, which also opens a `grade_consultation_windows` row automatically. Faculty then waits through an open window, optionally logs outreach notes, and must take a **separate, explicit Finalize Grade click** on the new Grade Consultation Log page before the milestone locks. Post and Finalize are now two distinct actions, not one. |
| **Consultation feature** | `src/pages/faculty/ConsultationRequests.jsx` (faculty inbox) and `src/pages/student/Consultations.jsx` (student request form), backed by the `consultations` table. It is **student-initiated**: the student files a request (category, preferred schedule, message), faculty schedules/responds. Per the defense panel and this conversation, it is bias-prone and sees little real use. | Both files are **retired outright**, not extended. The new `grade_consultation_windows` / `grade_consultation_notes` tables back a **faculty-initiated** log instead: faculty decides who gets a note logged, there is no student-submitted request form anywhere in the new flow. |
| **What a faculty member could log before** | Nothing structured — any "consultation" record came only from a student actively filing a request through the old form; a student who never used that form left no trace either way. | Faculty actively records, during the open window, exactly which students reached out and a short note on what it was about — including the "nobody reached out" case, which is simply zero notes before clicking Finalize. This is the bias-prevention record itself. |
| **What a student sees on their Grade Report** | A flat **"Posted"** label per milestone, with no visible distinction between "posted" and "locked" — because there isn't one in the backend either. | A three-state badge: **Tentative** / **Posted — Not Finalized** / **Finalized**, read directly from `finalized_at`, so the student can see whether a grade is still inside its consultation window or already locked. |
| **What a student sees about consultations** | `Consultations.jsx` is an always-visible, self-service page: a "Request a Consultation" form is there whether or not the student ever uses it. | A conditional **Consultation History** that renders **nothing** unless a faculty member actually logged a note for that student on that class/milestone — no empty self-service affordance, no implication that a student can request one on demand. |
| **Disputing a grade afterward** | Out of scope for this doc either way — today there is no formal post-lock dispute chain tied to this plan. | Still out of scope here by design — Finalized is a hard stop in this plan; any dispute/edit path is entirely roadmap item #6's job (`GRADE_CHANGE_REQUEST_WORKFLOW_PLAN_2026-10-28.md`). |

## Current state (what this touches)

| Location | What it is |
|---|---|
| `supabase/migrations/20261008150000_atomic_grade_milestone_posting.sql` — `posted_grades` table | Columns include `posted_by`, `posted_at`, `is_locked`. `is_locked = TRUE` is set in the same `INSERT` that creates the row — posting and locking happen atomically today. |
| `supabase/migrations/20261022121000_server_authoritative_grade_posting.sql` — `post_grade_milestone_atomic()` | The function that performs posting; sets `is_locked = TRUE` unconditionally (lines ~692-710, ~943) and treats `COALESCE(is_locked, TRUE)` as the gate for "can this term still be scored" elsewhere in the same file (lines ~476, ~539). |
| `src/lib/gradePostingService.js` — `postGradeMilestoneAtomic()` | Client-side wrapper that calls the RPC above; no concept of an intermediate state today. |
| `src/lib/gradeMilestones.js` — `GRADE_MILESTONES`, `getCanonicalGradePeriod()`, `getPostedMilestoneCoverage()` | Defines the three milestone identities (MR/TFR/SG) this plan's new states apply independently to. No changes needed to the milestone-identity logic itself — only to what "posted" means once a row exists. |
| `src/pages/faculty/ConsultationRequests.jsx` | **Retired.** Faculty-side inbox for student-submitted consultation requests (`consultation_id`, `concern_category`, `preferred_schedule`, `message`, `status`, `faculty_notes`, `scheduled_at`, `consultation_mode`, `meeting_link`, `onsite_location`). Already uses `AcademicPeriodFilter` for an archive toggle — that pattern is reused, not rebuilt, on the new log page. |
| `src/pages/student/Consultations.jsx` | **Retired.** Student-side self-service request form (category, preferred schedule, message) with request status/acknowledgement tracking. |
| `consultations` table (originally `supabase/migrations/20260914120000_aspire_pipeline_v3_1.sql`) | **Retired as the backing table for this feature.** A new table backs the Grade Consultation Log instead — see Changes below. Do not reuse this table's shape; it is scheduling-oriented (preferred time, meeting link, onsite location), not an outreach log. |
| `src/components/common/AcademicPeriodFilter.jsx` + `src/lib/termStatus.js` (`getArchivedAcademicTerms`) | The actual "Academic Archives" mechanism already in production — a shared term-filter component used by `ConsultationRequests.jsx`, `ClassRecordsList.jsx`, `EvaluatedStudents.jsx`, `AtRiskStudents.jsx`, `ClassAttendance.jsx`, `ScoreInput.jsx`, `GradePostingStatus.jsx`, and others. The Grade Consultation Log reuses this exact component for its "closed/archived" view once a milestone is finalized — no new archive page is built. |

## Design: two new states, one new log, one retired feature

### Part 1 — Posted vs. Finalized

Each `posted_grades` row gains a `finalized_at TIMESTAMPTZ NULL` column, read alongside the existing `is_locked`:

```
Tentative           -> no posted_grades row exists yet for this (class, milestone)
Posted (Not Final)  -> row exists, finalized_at IS NULL   (consultation window open)
Finalized           -> row exists, finalized_at IS NOT NULL (locked; dispute-only from here)
```

`is_locked` stops being set at insert time and instead becomes `TRUE` only when `finalized_at` is set — i.e. `is_locked` keeps its existing meaning ("nothing may silently overwrite this") but the moment it flips moves from *posting* to *finalizing*. Every existing read of `is_locked` (`post_grade_milestone_atomic`'s own term-coverage checks, `sg_correction_integrity` triggers, `followup_requires_task_review`, `term_rollover_grace`, etc.) keeps working unchanged, because "locked" still means exactly what it always meant — it just now happens one step later than "posted."

Why not a `status` enum instead of a nullable timestamp: a timestamp doubles as the audit fact ("when was this finalized") without a second column, and keeps the existing `is_locked` boolean reads correct via the derived check `is_locked = (finalized_at IS NOT NULL)` rather than requiring every call site to learn a new three-value field.

### Part 2 — Grade Consultation Log (new feature, new table)

One row per `(class_record_id, grade_period)` represents the window itself; one row per student note represents an outreach entry.

```sql
-- window / header row
CREATE TABLE public.grade_consultation_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_record_id UUID NOT NULL REFERENCES public.class_records(id),
  grade_period TEXT NOT NULL,               -- 'midterm_rating' | 'tentative_final_rating' | 'semestral_grade'
  opened_by UUID NOT NULL REFERENCES public.users(user_id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ NULL,
  finalized_by UUID NULL REFERENCES public.users(user_id),
  UNIQUE (class_record_id, grade_period)
);

-- one row per student who reached out
CREATE TABLE public.grade_consultation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  window_id UUID NOT NULL REFERENCES public.grade_consultation_windows(id),
  student_id UUID NOT NULL REFERENCES public.users(user_id),
  note TEXT NOT NULL,
  logged_by UUID NOT NULL REFERENCES public.users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Opening the window is implicit in posting (the window opens the moment `post_grade_milestone_atomic` creates the Not-Final `posted_grades` row for that class/milestone — one less manual step for faculty). Faculty logs zero or more `grade_consultation_notes` rows against the open window. Clicking **Finalize Grade** on the log page sets `finalized_at`/`finalized_by` on both `grade_consultation_windows` and the corresponding `posted_grades` row in one transaction (new RPC, e.g. `finalize_grade_milestone(p_window_id)`), after which the window accepts no further notes — enforced by a check in the RPC, not just the UI, so a stale tab can't add a late note after finalization.

### Part 3 — Faculty UI: Grade Consultation Log page (new)

New page, e.g. `src/pages/faculty/GradeConsultationLog.jsx`, replacing `ConsultationRequests.jsx` in the faculty nav (per the already-updated proposed navigation: Consultations -> Grade Consultation Log). Per class + milestone:

- Header: window opened-at timestamp, roster of enrolled students.
- **Log a consultation**: pick a student from the roster, write a note, submit -> inserts a `grade_consultation_notes` row.
- **Finalize Grade** button: enabled once the window is open; confirms, then calls `finalize_grade_milestone`. After finalizing, the page becomes read-only for that window and the **closed/archived** view reuses `AcademicPeriodFilter` exactly as `ConsultationRequests.jsx` already does today — same component, same archive-term pattern, just pointed at the new table.
- `ConsultationRequests.jsx` and its route are removed once this page replaces it; the `consultations` table is left in place (not dropped) for historical read access to old requests, but is no longer written to.

### Part 4 — Student UI: Grade Report status + conditional Consultation History

- `src/pages/student/MyGradesDetail.jsx` / `MyGradesList.jsx` (the Grade Report views): status badge per milestone changes from a flat "Posted" to one of **Tentative** / **Posted — Not Finalized** / **Finalized**, derived from `posted_grades.finalized_at` the same way the backend now derives `is_locked`.
- `src/pages/student/Consultations.jsx` is replaced by a read-only **Consultation History** view (new component, or a section appended to the Grade Report page rather than its own route — open decision below). It queries `grade_consultation_notes` for the current student and renders **nothing** if there are zero rows for a given class/milestone — no "request a consultation" button, no empty state implying self-service is available, consistent with this being a faculty-driven record, not a student-initiated one.
- The old `consultations` table and its request/schedule UI are not migrated forward into this view — a student's old pending/scheduled requests, if any, are historical only.

## Explicit non-goals (left to item #6)

- Any UI for a student to dispute a **Finalized** grade, submit evidence, or trigger a faculty/Dean review chain.
- Any recompute/cascade logic for a grade that is corrected after finalization.
- Any change to `applyAdminGradeOverride` (admin's separate, non-dispute override path) — untouched by this plan.

## Worked example

**Monday.** Faculty posts the Midterm Rating for ITC113-BSIT1A. `post_grade_milestone_atomic` inserts the `posted_grades` row (`finalized_at = NULL`) and a `grade_consultation_windows` row opens automatically, `opened_at = Monday 9:00 AM`. Students see **"Midterm Rating: Posted — Not Finalized"** on their Grade Report.

**Tuesday.** Santos messages the faculty outside the system asking about a missed quiz score. Faculty opens the Grade Consultation Log for ITC113-BSIT1A / Midterm Rating, picks Santos from the roster, logs: "Asked about Quiz 3 score; confirmed it was recorded correctly." Santos's Grade Report now shows a Consultation History entry with that note; no other student in the class sees anything, because no other row exists for them.

**Thursday.** No one else has reached out since Monday. Faculty clicks **Finalize Grade** on the log page. `finalize_grade_milestone` sets `finalized_at` on both the window and the `posted_grades` row in one transaction. The log closes to new notes; its view switches to the archived/read-only state via `AcademicPeriodFilter`. Students' Grade Report now shows **"Midterm Rating: Finalized."**

**The following month.** Reyes, in the same class, wants to dispute the now-Finalized Midterm Rating. That flow — evidence submission, faculty validation, Dean approval — is entirely out of scope here; it is roadmap item #6's job to define what Reyes can do next.

## Open decisions (confirm before any file is touched)

1. Does the consultation window open **automatically** the moment a milestone is posted (as designed above), or does faculty take a separate explicit "Open Consultation Window" action? Auto-open removes a step but means faculty can't delay opening it.
2. Does **Consultation History** live as its own student nav entry (as originally proposed) or as a section inside the existing Grade Report page? This plan assumes a section on Grade Report is simpler, but the standalone-nav version is still viable.
3. Should `finalize_grade_milestone` allow finalizing with **zero** logged notes in one click (the "nobody reached out" case), or require an explicit faculty confirmation step distinct from the button itself, to avoid an accidental click? This plan assumes a single confirm dialog is sufficient.
4. Is there a **minimum open-window duration** before Finalize is allowed (e.g. at least 24 hours), or can faculty finalize immediately after posting if they choose? This plan assumes no minimum, leaving pacing to faculty judgment, but the panel's bias-prevention concern may call for a floor.
5. Fate of the old `consultations` table and its historical rows: kept read-only for audit/history (this plan's assumption), or migrated/backfilled into the new tables, or archived out entirely?

## Suggested build order

1. Migration: `posted_grades.finalized_at` column; `grade_consultation_windows` and `grade_consultation_notes` tables; `finalize_grade_milestone(p_window_id)` RPC; update `post_grade_milestone_atomic` to stop setting `is_locked = TRUE` directly and instead leave it derived from `finalized_at` — developer applies manually.
2. `src/lib/gradeMilestones.js` / `src/lib/gradePostingService.js`: add helpers to read the three-state status (`Tentative` / `Posted — Not Finalized` / `Finalized`) from a `posted_grades` row.
3. New `src/pages/faculty/GradeConsultationLog.jsx`, replacing `src/pages/faculty/ConsultationRequests.jsx` in `src/App.jsx` routes and `src/components/layout/Sidebar.jsx`'s faculty nav.
4. Student-side: status badge update in `src/pages/student/MyGradesDetail.jsx` / `MyGradesList.jsx`; new conditional Consultation History (component or section, per open decision #2), replacing `src/pages/student/Consultations.jsx`'s route in `src/App.jsx` and the student nav entry in `Sidebar.jsx`.
5. Remove the now-dead `ConsultationRequests.jsx` / `Consultations.jsx` files (or leave them in place but unrouted, developer's call) once their replacements are confirmed working.
6. `npm run verify:grading` — add a fixture confirming a Not-Finalized posted row is excluded from whatever currently assumes "posted = locked," and that `is_locked` still reads `TRUE` correctly once `finalized_at` is set.
7. Manual click-through: post MR for a demo class, confirm "Posted — Not Finalized" badge, log a note for one student, confirm only that student sees history, click Finalize, confirm the log closes and the badge flips to "Finalized," confirm the archived view renders via `AcademicPeriodFilter`.
8. Change record in `docs/05-operations/agents/feature-updates/` once implemented and approved, plus a `docs/README.md` index update for this doc.

Each step remains subject to its own per-file confirmation before editing, per `AGENTS.md`.
