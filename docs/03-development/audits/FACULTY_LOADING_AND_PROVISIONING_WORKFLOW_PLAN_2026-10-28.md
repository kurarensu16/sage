# Faculty Loading & Provisioning Workflow Plan - 2026-10-28

**Status:** Proposed design. No code or migration exists yet. Every file listed under "Suggested build order" still requires its own developer confirmation before it is created or edited, per `AGENTS.md`.
**Scope:** Reorganizes the existing single-step "pick subject + section + faculty, create" provisioning flow (`provisionClassroomByAdmin`) into one unified page shared by Registrar (all colleges) and Dean (own college only), adds a load-summary view, a bulk-import path, a per-college concurrency lock, and a no-join-code manual roster-add for irregular/off-block students. Does **not** split faculty loading and classroom provisioning into two stages — they stay one action, just a better-organized one. Does **not** touch the regular, join-code-based student self-join flow (`class_join_requests`, Faculty's Enrollment Requests) — that keeps working exactly as it does today, for regular students only.
**Trigger:** Capstone defense panel items 2.1, 2.4, and 2.5 — separating Admin/Registrar, clarifying who assigns subjects to faculty ("faculty loading"), and who opens subjects during an active term. Discussed and scoped across this conversation, including the decision to keep loading and provisioning unified rather than introducing a "loaded but not provisioned" intermediate state.

## Objective

1. Keep "assign faculty to a subject+section" and "create the live class" as **one action** — the existing `provisionClassroomByAdmin` mechanic is reused verbatim, not replaced.
2. Give Registrar (all colleges) and Dean (own college) a shared, reorganized UI: a Load Summary panel, a grouped assignment grid, and a bulk-import tab — instead of today's flat one-row-at-a-time modal.
3. Prevent Registrar and Dean from editing the same college's assignments at the same time, with a visible "who's editing this" banner.
4. Remove Faculty's own provisioning entry point (`FacultyCreateClassroomModal.jsx`, `provisionBatchClassroomsByFaculty`) — Faculty keeps **My Classes** (view) and **Enrollment Requests** (approve/reject regular join-code requests), but can no longer create a class.
5. Add a no-join-code way for Registrar/Dean to put a specific irregular or off-block student directly on a specific class roster, without disturbing the existing join-code path that regular students and today's irregular self-joiners already use.

## Current Setup vs. New Setup

| Aspect | Today | New |
|---|---|---|
| Who can provision a class | **Admin only**, via one modal step in `ClassroomProvisioning.jsx`: pick department -> subject -> section -> faculty -> school year/semester -> click Create. Admin reaches every college with no scoping at all. | **Registrar** (all colleges) and **Dean** (own college only), via the new unified Faculty Loading & Provisioning page. Admin loses this capability entirely — Admin's role narrows to system maintenance (see the Admin/Registrar Role Split plan). |
| Faculty's own provisioning | Faculty can **self-serve create a classroom**: `FacultyCreateClassroomModal.jsx` opens a multi-row "teaching load" entry form, calling `provisionBatchClassroomsByFaculty()` (a thin wrapper around the same underlying insert). A Faculty "Create Classroom" nav entry exists today. | **Removed outright.** `FacultyCreateClassroomModal.jsx`, `provisionClassroomByFaculty()`, `provisionBatchClassroomsByFaculty()`, and the "Create Classroom" nav entry are all deleted. A Faculty member who today can open this modal and create their own class **can no longer do so** — they can only see classes already assigned to them (My Classes) and approve/reject regular join requests (Enrollment Requests). |
| The actual insert logic | `provisionClassroomByAdmin()` in `classRoomService.js` — validates no duplicate class exists, freezes the `grading_formula_snapshot` from the subject's COG template, inserts the `class_records` row, auto-enrolls block-section students, generates a join code. | **Unchanged and reused verbatim.** This function is not rewritten — only *who calls it* and *what UI surrounds it* changes. `ClassroomProvisioning.jsx` itself is reorganized/relocated, not thrown away: its catalog-loading and create-call logic becomes the starting point for the new page's Tab 2 (Assignment Grid), per "Design" below. |
| How the work is organized on screen | A flat one-row-at-a-time modal. No summary of who's teaching what, no bulk path, no grouping by program/year level. | One page, three tabs: **Load Summary** (per-faculty unit totals, new), **Assignment Grid** (the same create action, grouped by program/year level instead of a flat list), **Bulk Import** (CSV/Excel with the same ready/existing/error preview pattern already used for Import Users). |
| Faculty loading vs. provisioning as separate stages | No distinction exists — there is only "create a class," which simultaneously decides the faculty assignment and makes the class live. | **Still no separate stage** — this was an explicit decision in this conversation. Loading and provisioning stay one action; only the surrounding UI (Load Summary, grouping, bulk import) makes the staffing picture visible before/alongside that one action, without introducing a "loaded but not provisioned" intermediate state. |
| Concurrent edits across colleges | **No concurrency protection of any kind.** Admin (today) could theoretically have two browser tabs open on the same department with no warning. Once Registrar and Dean both gain access to the same college, this becomes a real duplicate-work risk. | **New per-college lock** (`provisioning_locks` table + acquire/heartbeat/release RPCs). Whoever opens a college's scope first holds it; the other party sees a read-only banner naming who's editing and cannot submit any Assign/Open/Import action until the lock clears. |
| Visibility into faculty load | **None.** Today's Admin UI shows no running total of what any faculty member is already assigned to while provisioning a new class. | **New Load Summary tab** — per-faculty unit totals and assignment chips, visible before touching the Assignment Grid, so over-staffing is visible rather than discovered later. |
| Irregular / off-block student enrollment | Every enrollment path — regular or irregular — currently runs through a **join code**: a student requests with a code (`submitJoinRequest`), Faculty approves/rejects it (`EnrollmentRequests.jsx`, `resolveJoinRequest`). `getEnrollmentType()` already labels these Regular vs. Irregular after the fact, by comparing section IDs — but the *path onto the roster* is identical for both today. | **New: Add Irregular Student to Class.** Registrar (any college) or Dean (own college) can place a specific student directly onto a specific class's roster with **no join code and no Faculty approval step** — for irregular students, block-sectioned students taking an off-block subject, etc. `getEnrollmentType()` is reused unchanged to label the result. The **regular, join-code-based self-join path is untouched** — a student who already has a code still requests it the same way, and Faculty still approves it in Enrollment Requests exactly as today; this is an additive path for the cases that flow was never meant to cover, not a replacement for it. |

## What already exists (read before building)

| File | What it does today | What changes |
|---|---|---|
| `src/lib/classRoomService.js` — `provisionClassroomByAdmin()` | Validates no duplicate class for subject+section+term, freezes `grading_formula_snapshot` from the subject's COG template, inserts the `class_records` row, auto-enrolls block-section students, generates a join code via `getOrCreateJoinCode()`. | **Unchanged** as the core insert. Caller moves from `ClassroomProvisioning.jsx` (Admin) to the new unified Registrar/Dean page. The join-code generation at the end stays — it still serves the regular self-join path. |
| `src/lib/classRoomService.js` — `provisionClassroomByFaculty()` / `provisionBatchClassroomsByFaculty()` | Thin wrappers so Faculty can self-provision, used by `FacultyCreateClassroomModal.jsx`. | **Removed.** Faculty loses this entry point entirely; these two exports and the modal are deleted. |
| `src/pages/admin/ClassroomProvisioning.jsx` | Admin picks department -> subject -> section -> faculty in a modal, one row at a time, across all colleges, no locking. | **Removed from Admin.** Its logic (catalog loading, the create call) is the starting point for the new unified Registrar/Dean page, reorganized per "Design" below. |
| `src/pages/faculty/FacultyCreateClassroomModal.jsx` | Faculty's own "Create Classroom" modal, multi-row teaching-load entry, calls `provisionBatchClassroomsByFaculty`. | **Removed**, along with its "Create Classroom" nav entry. |
| `src/pages/faculty/EnrollmentRequests.jsx` + `getPendingJoinRequests()` / `resolveJoinRequest()` (RPC `resolve_class_join_request`) | Faculty approves/rejects pending `class_join_requests` rows — this is the regular, join-code-based self-join path, already used by both regular-block and irregular (different-home-section) students who have a join code. | **Unchanged.** This stays Faculty's job for anyone who already has a join code and asked to join themselves. |
| `src/lib/classRoomService.js` — `getEnrollmentType()`, `getSectionIrregularEnrollees()` | Already distinguishes Regular vs. Irregular by comparing the student's `users.section_id` to the class's `section_id` — irregularity is class-contextual, not a fixed student flag. | **Reused as-is** to decide whether a manually-added student should be labeled Irregular on the new roster-add action; no new classification logic needed. |
| `src/lib/classRoomService.js` — `getOrCreateJoinCode()`, `generateJoinCode()` | Creates/reuses a `class_room_join_codes` row per class. | **Unchanged.** Join codes are not being removed system-wide — only the *requirement* to use one is bypassed for the new manual-add action below. |

So this plan reorganizes **who can reach** `provisionClassroomByAdmin` and **how the UI around it looks** — it does not rewrite the insert logic itself.

## Design: one page, two scopes, three tabs

Route: new `src/pages/registrar/FacultyLoadingAndProvisioning.jsx`, reused by Dean at `src/pages/dean/FacultyLoadingAndProvisioning.jsx` (or one shared component mounted at two routes — developer's call at build time) — scope is resolved from the logged-in role exactly like `ClassroomProvisioning.jsx` already resolves department filters today.

### Scope selector (top bar)
- **Registrar:** a college/department dropdown (same `departments` table `ClassroomProvisioning.jsx` already queries), defaulting to none selected.
- **Dean:** no dropdown — scope is fixed to `profile.department_id`, shown as a label only.
- Term picker, defaulting to the active `academic_terms` row, same as today.

### Tab 1 — Load Summary (new)
One row per faculty member in scope: name, sum of `subjects.units` across their `class_records` rows this term, and a chip per subject/section assigned. No unit cap exists anywhere in the current schema (`subjects.units` is informational only) — flagged under Open Decisions below, since "flag faculty over a cap" needs a cap to compare against.

### Tab 2 — Assignment Grid (reorganized provisioning)
Same fields as today's `ClassroomProvisioning.jsx` modal (subject, section, faculty, school year, semester), but laid out as a persistent grid grouped by program then year level, instead of a flat modal-per-row flow. Each row's "Assign & Open" button calls `provisionClassroomByAdmin()` unchanged. Already-provisioned rows show status "Open" with the assigned faculty name instead of empty inputs.

### Tab 3 — Bulk Import
CSV/Excel columns: `subject_code, section_name, faculty_email, school_year, semester`. Preview follows the exact three-state pattern already used in `UserList.jsx`'s bulk user import (`importStatus` of `ready` / `existing` / `error`, with an `importMessage` string per row):
- `ready` — all four lookups (subject, section, faculty, no duplicate class) resolve cleanly.
- `existing` — a `class_records` row already exists for that subject+section+term (mirrors `provisionClassroomByAdmin`'s own duplicate check, run client-side for the preview).
- `error` — any lookup fails (unknown subject code, unknown faculty email, etc.), with the specific reason in `importMessage`.
Only `ready` rows commit, one `provisionClassroomByAdmin()` call per row, same as the grid's single-row path.

### Add Irregular Student to Class (action, not a tab — lives on an opened class's roster view)
A new button on a class's roster (reachable from Tab 2 once a row shows "Open") lets Registrar (any college) or Dean (own college) search a student by name/number and add them directly to that class's `enrollments` row — no join code, no `class_join_requests` row, no faculty approval step. `getEnrollmentType(student.section_id, class.section_id)` is called immediately after to label the new enrollment Regular or Irregular on the roster, reusing existing logic. This is additive only: students who still have a join code and want to self-request keep using Faculty's Enrollment Requests exactly as before; this button is for the cases that path was never meant to cover (an off-block elective, a block-sectioned student taking one extra subject, etc.).

## Per-college concurrency lock (new)

No presence/locking mechanism exists anywhere in the codebase today (`supabase.channel()` is used once, in `AtRiskStudents.jsx`, for a `postgres_changes` listener, not for presence) — this is a plain table plus RPC, consistent with how the rest of the app already works.

**New table** `provisioning_locks`:
```sql
CREATE TABLE public.provisioning_locks (
  department_id UUID PRIMARY KEY REFERENCES public.departments(department_id),
  locked_by UUID NOT NULL REFERENCES public.users(user_id),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
- **Acquire** (`acquire_provisioning_lock(p_department_id)`): insert, or take over if `last_heartbeat_at` is older than the TTL (**3 minutes**). Returns the current holder's name either way, so the UI can show the read-only banner immediately on a failed acquire.
- **Heartbeat**: while the page stays open and scoped to that college, the client calls `touch_provisioning_lock(p_department_id)` every 60 seconds to refresh `last_heartbeat_at`. Stop on unmount/navigation-away, which lets the lock expire naturally within the 3-minute TTL instead of needing an explicit release call (covers browser-closed/crash cases that an explicit "release" button can't).
- **Release**: an explicit `release_provisioning_lock(p_department_id)` call on clean unmount (switching colleges, navigating away, logging out), for the common case of a fast handoff without waiting out the TTL.
- **Banner**: if acquire fails because someone else holds it, the page renders read-only — Tabs 2 and 3's Assign/Open/Import actions are disabled — with: *"[Registrar name] is currently editing [COLLEGE] — view only."* Tab 1 (Load Summary) stays visible either way since it's read-only by nature.

## Worked example

1. **Monday, 9:00 AM** — Registrar opens Faculty Loading & Provisioning, selects **College of Computer Studies**. `acquire_provisioning_lock('CCS')` succeeds; Registrar starts assigning BSIT-1A's ITC113 to Prof. Rivera via Tab 2.
2. **Monday, 9:02 AM** — The CCS Dean opens the same page, scope fixed to CCS. `acquire_provisioning_lock('CCS')` fails (Registrar's `last_heartbeat_at` is 2 minutes old, under the 3-minute TTL). Dean sees: *"Registrar J. dela Cruz is currently editing College of Computer Studies — view only."* Dean can still see Tab 1's Load Summary but cannot assign anything.
3. **Monday, 9:10 AM** — Registrar finishes, navigates to the Dashboard. `release_provisioning_lock('CCS')` fires on unmount.
4. **Monday, 9:11 AM** — Dean reopens the page. Lock is free; Dean acquires it and adds a block-sectioned CCS student who also needs an off-block Math elective, using **Add Irregular Student to Class** on that Math section's roster — no join code involved, and `getEnrollmentType` immediately labels the new row "Irregular" since the student's home section differs from the Math class's section.
5. **Meanwhile**, a regular BSIT-1A student who missed the auto-enrollment window (enrolled late) still goes through the normal join-code flow: gets the code from a classmate, submits it via `submitJoinRequest`, and Prof. Rivera approves it from **Enrollment Requests** exactly as today — this path never touches the Registrar/Dean page at all.

## Open decisions (confirm before any file is touched)

1. **Unit load cap**: no cap currently exists in the schema. Should Tab 1 just display totals with no flagging (informational only), or should a cap be added (e.g. a new `max_units` column on `users` or a fixed institutional constant) so "over-limit" can actually be flagged red?
2. **Shared component vs. two pages**: should Registrar and Dean literally share one React component mounted at two routes (scope resolved from role), or should they be two separate page files that both call the same underlying service functions? Affects how much of `ClassroomProvisioning.jsx` gets moved vs. duplicated.
3. **Lock TTL**: 3 minutes with a 60-second heartbeat is this plan's default — confirm or adjust.
4. **Bulk import duplicate column needs**: should the bulk-import CSV also support an irregular-student-add column (student email/number + target class), or should that stay a separate one-by-one UI action only, as described above?
5. **`FacultyCreateClassroomModal.jsx` deletion**: confirm it's safe to delete the file and its two service exports outright, rather than leaving them dead/unreachable, since nothing else in the codebase calls `provisionClassroomByFaculty` or `provisionBatchClassroomsByFaculty` except this modal (grep confirms both are only referenced from this one file).

## Suggested build order

1. Migration: `provisioning_locks` table, `acquire_provisioning_lock` / `touch_provisioning_lock` / `release_provisioning_lock` RPCs — developer applies manually.
2. New shared page (or two role-scoped pages): scope selector, Tab 1 Load Summary (read-only query against `class_records` + `subjects.units`), Tab 2 Assignment Grid (moved/reorganized from `ClassroomProvisioning.jsx`, same `provisionClassroomByAdmin` call).
3. Lock acquire/heartbeat/release wiring on mount/unmount, read-only banner state.
4. Tab 3 Bulk Import: CSV parse + three-state preview (mirroring `UserList.jsx`'s pattern) + per-row `provisionClassroomByAdmin` commit.
5. **Add Irregular Student to Class** action on a class roster view: student search, direct `enrollments` insert, `getEnrollmentType` label.
6. Remove `src/pages/admin/ClassroomProvisioning.jsx` and its Admin nav entry; remove `src/pages/faculty/FacultyCreateClassroomModal.jsx`, `provisionClassroomByFaculty`, `provisionBatchClassroomsByFaculty`, and Faculty's "Create Classroom" nav entry.
7. Manual click-through: Registrar assigns across two colleges; Dean assigns within their own; concurrent-open test confirms the lock banner; bulk import with one `ready`, one `existing`, one `error` row; irregular add confirmed on the student's own "My Subjects" view; regular join-code flow re-tested end to end to confirm it is untouched.
8. Change record in `docs/05-operations/agents/feature-updates/` once implemented and approved, plus a `docs/README.md` index update for this doc.

Each step remains subject to its own per-file confirmation before editing, per `AGENTS.md`.
