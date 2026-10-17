# Implementation Plan: ASPIRE Consultation Fixes + Security Remediation

**Source audit:** `ASPIRE_CONSULTATION_AUDIT_2026-10-14.md` (read-only audit against `sage` @ `5891334`)

> ## Completed 2026-10-14 — all phases implemented
>
> Every item below is built. Migrations `20261014120000`–`20261014190000` were applied to the live project on 2026-10-14 and all four roles sign in successfully.
>
> **Where implementation differed from this plan**, and why — each is explained in its change record:
>
> | Plan said | Built instead | Reason |
> | --- | --- | --- |
> | 0.1 SELECT limited to own row or admin | SELECT open to authenticated | Faculty rosters and notification fan-out read other users' rows; that policy would have emptied every roster and killed notifications |
> | 0.2 `set_config` session flag + history row with `correction_request_id IS NULL` | Admin must act against an approved request, like faculty | `grade_correction_history.request_id` is `NOT NULL UNIQUE` with an FK, so a NULL row is impossible; the flag would also have skipped every value-matching check |
> | 0.3 activity_logs readable by "admin/dean-equivalent" | Admin only | Owner's instruction. The faculty dashboard's log panel was removed as the only non-admin reader |
> | 2.2 rename the department row to `TECH` | Added `short_name`, kept the full name | Renaming would discard "Technology and Engineering College for Humanity" |
> | 4.1 snapshot via the insert path | Same, but using the app's own resolve/snapshot functions, not SQL | Posting compares snapshots with a strict JSONB `<>`, which is order-sensitive for the components array |
> | 5.1 per-task edit/save toggle | Edit button that focuses the field | A toggle unmounts the `required` input and interacts with draft autosave |
> | 6.1 12px floor | 10px floor | 10–11px is ~908 of the existing usages; a 12px floor would make the smallest class larger than its neighbours |
>
> **Scope added beyond this plan:** removal of all hard-coded colleges and programs (owner's instruction), OTP password reset, and the caching/service-worker fixes. See `docs/05-operations/agents/feature-updates/2026-10-14_*`.
>
> **Testing:** `docs/04-testing/CONSULTATION_REMEDIATION_TEST_GUIDE_2026-10-14.md`. Nothing here has been browser-tested.
**Status:** All open decisions resolved in planning/Q&A on 2026-10-14. Nothing below is still blocked on a policy question — this is now an execution plan, not a proposal. Implementation is done in-session (not handed to a separate dev); migrations are written here but **run by the user**, not applied automatically.

Work in phase order. Each phase is independent of the ones after it, so it can be committed/applied as its own batch. Check items off as they're implemented; migrations get one more pass by the user before being run against Supabase.

---

## PHASE 0 — Security remediation

- [x] **0.1 — Re-enable RLS on `public.users`, with a role-change guard**

  **Target:** new migration `supabase/migrations/<timestamp>_harden_users_rls.sql`

  **Issue:** `20260531081149_disable_rls_for_now.sql:1` disabled RLS on `users`, never re-enabled, no compensating `REVOKE`. Since `users.role` gates `is_active_admin()`/`is_assigned_faculty()`/etc., any authenticated user can self-promote via `supabase.from('users').update({role:'admin'})`.

  **Implementation:**
  ```sql
  ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

  CREATE POLICY users_select_own_or_admin ON public.users
    FOR SELECT USING (user_id = auth.uid() OR public.is_active_admin());

  CREATE POLICY users_admin_full_access ON public.users
    FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

  REVOKE DELETE ON public.users FROM authenticated;
  ```
  Add a `BEFORE UPDATE` trigger (preferred over a self-referential RLS `WITH CHECK`, which races) that blocks any change to `role` or `status` unless the actor is an active admin:
  ```sql
  CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
  RETURNS TRIGGER AS $$
  BEGIN
    IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status)
      AND NOT public.is_active_admin() THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only an administrator may change role or status.';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

  CREATE TRIGGER trg_prevent_self_role_escalation
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_escalation();

  CREATE POLICY users_update_own_profile ON public.users
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  ```
  (The trigger is the real enforcement; the `WITH CHECK` just needs to allow own-row updates through to the trigger.)

  **Verification:** non-admin self-update of `role`/`status` fails; profile fields (contact number, photo, notification prefs) still update fine; `AuthContext.jsx:79-96` read path unaffected (SELECT only).

  **Regression check:** grep `.from('users')` across `src/` and confirm every call site is either a self/admin SELECT or already goes through a hardened RPC/edge function.

- [x] **0.2 — Remove the admin bypass in `enforce_sg_correction_application()`; convert Grade Override into a secured RPC**

  **Target files:** `supabase/migrations/20261008160000_sg_correction_integrity.sql` (new migration layering on top, don't edit the old file in place), `src/pages/admin/GradeOverride.jsx`

  **Decision:** the blanket `IF v_role = 'admin' THEN RETURN NEW; END IF;` (lines 446-449) is removed. The legitimate "Grade Override" feature (Admin Portal → System Module) is kept, but rebuilt as a narrow, server-enforced, always-audited path instead of a raw client `.update()` that happened to piggyback on the same bypass.

  **Implementation — new migration:**
  ```sql
  -- Trigger no longer trusts role at all; it trusts a session flag only this RPC can set.
  CREATE OR REPLACE FUNCTION public.enforce_sg_correction_application()
  RETURNS TRIGGER AS $$
  ...
    -- replace:
    --   SELECT role::TEXT INTO v_role FROM public.users WHERE user_id = v_actor;
    --   IF v_role = 'admin' THEN RETURN NEW; END IF;
    -- with:
    IF current_setting('aspire.admin_override', true) = 'true' THEN
      RETURN NEW;
    END IF;
  ...
  $$;

  CREATE OR REPLACE FUNCTION public.apply_admin_grade_override(
    p_posted_grade_id UUID,
    p_new_effective_grade NUMERIC,
    p_new_remarks TEXT,
    p_reason TEXT
  ) RETURNS JSONB
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE
    v_old public.posted_grades%ROWTYPE;
  BEGIN
    IF NOT public.is_active_admin() THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only an administrator may apply a grade override.';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An override reason is required.';
    END IF;

    SELECT * INTO v_old FROM public.posted_grades WHERE posted_grade_id = p_posted_grade_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Posted grade not found.';
    END IF;
    IF v_old.grade_period::TEXT <> 'semestral_grade' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Only the Semestral Grade may be overridden.';
    END IF;

    PERFORM set_config('aspire.admin_override', 'true', true);

    UPDATE public.posted_grades
    SET effective_grade = p_new_effective_grade,
        remarks = p_new_remarks,
        remarks_note = p_reason,
        override_at = now(),
        override_by = auth.uid(),
        is_locked = true
    WHERE posted_grade_id = p_posted_grade_id;

    INSERT INTO public.grade_correction_history (
      posted_grade_id, correction_request_id, applied_by, applied_at,
      previous_computed_grade, previous_effective_grade, previous_remarks,
      new_computed_grade, new_effective_grade, new_remarks, reason
    ) VALUES (
      p_posted_grade_id, NULL, auth.uid(), now(),
      v_old.computed_grade, v_old.effective_grade, v_old.remarks,
      v_old.computed_grade, p_new_effective_grade, p_new_remarks,
      'admin_direct_override: ' || p_reason
    );

    RETURN jsonb_build_object('posted_grade_id', p_posted_grade_id, 'new_effective_grade', p_new_effective_grade);
  END;
  $$;

  GRANT EXECUTE ON FUNCTION public.apply_admin_grade_override(UUID, NUMERIC, TEXT, TEXT) TO authenticated;
  ```
  (Check `grade_correction_history`'s actual column names against `20261008160000_sg_correction_integrity.sql` before finalizing the INSERT — match its existing schema exactly rather than the illustrative column list above.)

  **Client change:** `GradeOverride.jsx:214-224` — replace the raw `supabase.from('posted_grades').update(...)` with `supabase.rpc('apply_admin_grade_override', { p_posted_grade_id, p_new_effective_grade, p_new_remarks, p_reason: overrideReason.trim() })`.

  **Verification:**
  - A raw `.from('posted_grades').update(...)` call as any role (including a self-escalated fake admin) now fails the same way a faculty attempt without an approved request does.
  - The Grade Override page still works end-to-end, and now writes a real `grade_correction_history` row every time (regression test: query the table after an override, confirm a row exists with `correction_request_id IS NULL`).
  - Normal faculty-initiated, Dean-approved SG corrections are unaffected (that code path never touched the admin branch).

- [x] **0.3 — Re-enable RLS on remaining disabled live tables**

  **Target:** new migration(s). Tables: `activity_logs`, `student_consultation_requests`, `class_room_join_codes`, `class_join_requests`, `departments`, `sections`, `programs`.

  - `activity_logs`: `SELECT` only for admin/dean-equivalent viewers; no `UPDATE`/`DELETE` for anyone via the API.
  - `student_consultation_requests`: `SELECT`/`UPDATE` restricted to owning `student_id`, assigned `faculty_id`, or admin; `INSERT` restricted to the student inserting their own row. (Combine with 3.1's new columns in the same migration — don't ship new scheduling fields on a table that's still wide open.)
  - `class_room_join_codes` / `class_join_requests`: `SELECT` on join codes restricted to the issuing faculty; request mutation restricted to the requesting student or the class's faculty/admin.
  - `departments` / `sections` / `programs`: `SELECT` open to all authenticated (dropdowns need this); `INSERT`/`UPDATE`/`DELETE` restricted to admin.

  **Verification:** re-run consultation request/response, class join, and admin section/department/program CRUD screens after adding policies — confirm nothing legitimate breaks.

- [x] **0.4 — Drop the legacy evaluation tables**

  **Decision:** confirmed synthetic/dummy data only (per the thesis's own Delimitation section) — drop, don't just harden.

  ```sql
  DROP TABLE IF EXISTS public.evaluation_comments;
  DROP TABLE IF EXISTS public.evaluation_ratings;
  DROP TABLE IF EXISTS public.evaluation_responses;
  DROP TABLE IF EXISTS public.evaluation_windows;
  DROP TABLE IF EXISTS public.evaluation_criteria;
  DROP TABLE IF EXISTS public.evaluation_forms;
  DROP TABLE IF EXISTS public.faculty_performance_insights;
  DROP TABLE IF EXISTS public.unlock_requests;
  DROP TABLE IF EXISTS public.class_faculty_log;
  DROP TABLE IF EXISTS public.component_scores;
  DROP TABLE IF EXISTS public.grade_components;
  ```
  Double-check none of these names are still referenced anywhere in `src/` or other migrations before dropping (grep each name first) — the audit found no current references, but re-verify at implementation time since this is destructive.

---

## PHASE 1 — ASPIRE-C07: grading column deletion

- [x] **1.1 — Delete guard trigger on `class_activities`** (closes the live exposure immediately, independent of 1.2)

  ```sql
  CREATE OR REPLACE FUNCTION public.prevent_class_activity_deletion_with_scores()
  RETURNS TRIGGER AS $$
  BEGIN
    IF EXISTS (SELECT 1 FROM public.student_activity_scores WHERE activity_id = OLD.activity_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE =
        'Cannot delete this column: student scores are already recorded for it.';
    END IF;
    RETURN OLD;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

  CREATE TRIGGER protect_class_activities_from_scored_deletion
    BEFORE DELETE ON public.class_activities
    FOR EACH ROW EXECUTE FUNCTION public.prevent_class_activity_deletion_with_scores();
  ```
  Strictly NULL-only: any recorded score from 0 up to max blocks deletion; "NULL" means no `student_activity_scores` row exists at all for that activity, consistent with how this schema already represents "ungraded" everywhere else.

- [x] **1.2 — Faculty-facing "Delete Column" feature** (decided: hard delete, NULL-only, confirmation + dedicated audit log)

  **Target:** `src/pages/faculty/ScoreInput.jsx`

  - Add a delete affordance per activity/column header, enabled only when (client-side pre-check, server trigger is the real guard) no student in the roster has a non-null score for that activity.
  - Confirmation modal naming the activity and stating the action is irreversible.
  - On confirm: `supabase.from('class_activities').delete().eq('activity_id', ...)`. If the trigger raises (race: a score was entered between page-load and click), surface the DB error message directly rather than a generic failure.
  - Write an explicit audit-log entry distinct from the generic mutation-audit trigger's default message, e.g. `logActivity('Grading Column Deletion', `Deleted empty column "${activity.title}" from ${subjectCode}/${section} (no student scores recorded).`)`.

---

## PHASE 2 — Direct fixes, no remaining decisions

- [x] **2.1 — ASPIRE-C01: relabel "Ongoing terms" → "Current Grading Period"**

  **Target:** `src/pages/faculty/Dashboard.jsx:568,579` (the tooltip and the visible label). Leave `cls.status`/`gradingPeriod` computation logic untouched (`ClassRecordsList.jsx:130-155,223-228`) — out of scope for this minimal wording fix.

- [x] **2.2 — ASPIRE-C09: rename department to TECH, make the short name dynamic everywhere**

  **Decision:** rename the actual `departments` row (no historical-preservation concern — synthetic data only). Also stop hardcoding the abbreviation anywhere; add a real `short_name` column so the UI always reads it from the database instead of pattern-matching department-name strings.

  **Migration:**
  ```sql
  ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS short_name TEXT;
  UPDATE public.departments SET name = 'TECH', short_name = 'TECH'
    WHERE name IN ('College of Computer Studies', 'College of IT', 'College of CS');
  -- back-fill short_name for every other department too, so the UI never falls back to a literal again:
  -- UPDATE public.departments SET short_name = <value> WHERE department_id = <id>; (one per remaining department)
  ```

  **Code changes:**
  - `src/pages/admin/UserList.jsx:1276,1564`: remove the `deptFilter === 'College of IT' || deptFilter === 'College of CS' ? 'CCS' : deptFilter` pattern-match entirely. Since `UserList.jsx` already fetches `departments` (confirmed: `:173-174`), look up `short_name` from that already-loaded list by `department_id` (or by name if that's the only join key available) instead of matching literal name strings.
  - `src/components/ExportPreviewModal.jsx:537`: replace the hardcoded `"DEAN, CCS"` with a dynamic read, matching the pattern already used at lines 293/396/455 (`metadata.college`) — add the equivalent `metadata.departmentShortName` (or similar) sourced from the same `departments` join, falling back to `metadata.college` only if `short_name` is somehow null.
  - Also fix the `UserList.jsx:1707` mapping (`'College of IT'/'College of CS' → 'College of Computer Studies'`) the same way — once the department row itself says TECH, this synonym-normalization logic can be simplified or removed, since new imports/bulk-CSV rows should match the canonical `TECH` name directly going forward. Keep backward-compatible matching only if old CSVs still reference the legacy names.

  **Verification:** grep `CCS` across `src/` and `supabase/` after the change — zero hits expected. Render `UserList.jsx` and `ExportPreviewModal.jsx` and confirm "TECH" appears everywhere a department abbreviation is shown, sourced from the DB, not a literal.

- [x] **2.3 — ASPIRE-C08: fix the real "At-Risk"-before-posting bug**

  **Target:** `src/pages/student/MyGradesDetail.jsx:644-655` (the "Period Evaluation" card)

  **Root cause confirmed:** a term in the `'Covered'` state (not itself posted, but folded into a combined MR/TFR posted for a different period) displays a rating computed from **live/tentative scores**, not the actual posted milestone value — yet the label ternary treats `'Covered'` the same as `'Posted'` (full-confidence wording), showing flat "At-Risk" instead of the softer tentative phrasing used for genuinely tentative data.

  **Fix:** change the condition so the softer wording applies to anything that isn't truly `'Posted'`:
  ```jsx
  // before:
  : (activeData.status === 'Tentative' ? 'Below passing so far' : 'At-Risk')
  // after:
  : (activeData.status !== 'Posted' ? 'Below passing so far' : 'At-Risk')
  ```
  Same change mirrored for the passing-side branch (`'Passing so far'` vs `'Passed'`) so both sides of the ternary use the same `!== 'Posted'` gate consistently.

  Do not touch `src/lib/riskEngine.js` or any Dean/faculty risk view — unaffected, confirmed isolated to this one component.

---

## PHASE 3 — Schema-adding features

- [x] **3.1 — ASPIRE-C02: structured consultation scheduling with student acknowledgment**

  **Decision:** faculty's schedule/mode decision is final (no student accept/decline negotiation) — but since the student initiated the request, they must acknowledge the faculty's decision. Link/location are optional fields.

  **Migration (combine with 0.3's RLS work on this table):**
  ```sql
  ALTER TABLE public.student_consultation_requests
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS consultation_mode TEXT CHECK (consultation_mode IN ('online', 'face_to_face')),
    ADD COLUMN IF NOT EXISTS meeting_link TEXT,
    ADD COLUMN IF NOT EXISTS onsite_location TEXT,
    ADD COLUMN IF NOT EXISTS schedule_acknowledged_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS schedule_acknowledged_by UUID REFERENCES public.users(user_id);
  ```

  **Code:**
  - `src/pages/faculty/ConsultationRequests.jsx` (resolution UI, ~70-110): add date/time picker + mode selector (exactly two options: Online, Face-to-Face) + optional link/location fields, saved when faculty sets status to `scheduled`.
  - `src/pages/student/Consultations.jsx` (summary card, ~389-411): display `scheduled_at`/`consultation_mode`/link-or-location; add an "Acknowledge" button that sets `schedule_acknowledged_at`/`schedule_acknowledged_by` once the student has seen it. Simple acknowledgment only — no accept/decline, no re-ack-on-change logic (that pattern from the Intervention Plan is not requested here).
  - Dashboard pending-consultations count (`Dashboard.jsx:191-224`) unaffected — same table, same status field.

- [x] **3.2 — ASPIRE-C13: official section masterlist (home-section roster)**

  **Decision:** "official masterlist" = the registrar-style home-section roster (`users.section_id`), independent of any specific subject offering — a traditional printed class list. A separate, per-subject irregular-enrollee report is the companion view.

  **Target (new):** a registrar/admin-facing view — e.g. a new tab on `src/pages/admin/SectionList.jsx` or a new `SectionMasterlist.jsx` page — with two parts:
  1. **Regular masterlist:** straightforward `supabase.from('users').select(...).eq('section_id', sectionId)` — the section's home-assigned students, full stop. No `enrollments` join needed for this half.
  2. **Irregular companion list:** per subject offering under that section (i.e. per `class_records` row whose `section_id` matches), reuse the existing `enrollments` query + `getEnrollmentType()` logic already powering `get_class_attendance_roster`/`getClassPriorityRoster` — filter to students whose home section differs from the class's section. **Do not write a new independent enrollment-resolution query** — reuse the same function so this view can never silently diverge from the faculty roster (C12) if that logic changes later.
  3. Leave every existing C12 faculty-facing combined roster (attendance, score input, grade computation preview, posted grades) completely untouched — this is a new, additional report, not a replacement.

---

## PHASE 4 — Architecture change: snapshot grading formula at class creation

- [x] **4.1 — ASPIRE-C10: insulate the active term from mid-term COG edits**

  **Decision:** today, `class_records.grading_formula_snapshot` is only set at *first official posting* — before that, even an active, already-running term's tentative grades live-track any admin edit to the subject's template. Per the user's explicit requirement, **a mid-term template edit must only affect the next rolling term, never a currently active one** — so the snapshot needs to be taken at **class creation**, not first posting.

  **Target:** wherever `class_records` rows are inserted — the classroom provisioning path (`src/pages/admin/ClassroomProvisioning.jsx` and/or its backing RPC, e.g. `provision_classrooms`/`create_classroom` in `supabase/functions` or a migration-defined RPC — locate the exact insert path before implementing).

  **Change:** at the moment a `class_records` row is created, immediately resolve the subject's current `grade_computations` + `grade_computation_components` (the same resolution logic already used by `post_grade_milestone_atomic`) and populate `grading_formula_snapshot` right away, instead of leaving it `NULL` until first posting.

  **Backward compatibility:** `post_grade_milestone_atomic`'s existing `COALESCE(v_class.grading_formula_snapshot, p_grading_formula_snapshot)` and first-writer-wins `WHERE grading_formula_snapshot IS NULL` logic stays as-is — it remains the fallback for any class created *before* this migration ships (which will still have `NULL` until their own first posting), and becomes a no-op safety net for newly created classes (already populated, so the `WHERE ... IS NULL` simply never matches again for them).

  **Immutability protection:** already correctly enforced today by the existing `protect_grading_formula_snapshot` trigger (blocks any update to an already-non-null snapshot) — no change needed there; it now just starts protecting earlier in a class's lifecycle.

  **Verification:**
  - Create class A under Template v1. Edit Template v1's weights (same admin session, same day). Class A's tentative/live grade display must be computed from the **original** v1 weights, not the edit — this is the regression test that didn't exist before (today it would incorrectly pick up the edit).
  - Create class B *after* the edit — B should use the edited weights from creation.
  - Existing classes created before this ships, with `grading_formula_snapshot IS NULL` today, continue to snapshot at their own first posting exactly as before (no behavior change for them).

---

## PHASE 5 — ASPIRE-C03: Academic Intervention Form wording/control

- [x] **5.1 — Add the instruction text and a per-task Edit control**

  **Decision:** "consultation draft: select/edit actions before finalizing" maps to the existing Student Risk / Academic Intervention Form (not a new Consultations feature) — Consultations is meeting logistics only; action/task selection already belongs to the evaluation workflow.

  **Target:** `src/pages/faculty/StudentRiskEvaluationModal.jsx` (~564-646, the catch-up task checklist)

  - Add the literal instruction copy — "Select the action(s) you intend to take." — above the task list.
  - Add an explicit per-task "Edit" control for parity with the consultation wording (today editing is a plain always-visible text input with no distinct edit affordance — add an edit/save toggle, or at minimum a clearly labeled "Edit" icon button that focuses the field).
  - No change to the existing draft/finalize/post-acknowledgment-edit behavior — that policy question was about documentation clarity, not a workflow restriction; current behavior (editable until a follow-up snapshot is recorded, content-diff-triggered re-acknowledgment) stays exactly as-is.

---

## PHASE 6 — ASPIRE-C05: font-size cleanup + sidebar hierarchy

- [x] **6.1 — Fix the worst offenders**

  Define a small `--text-*` token set in `src/index.css`'s `@theme` block with a readable floor (e.g. 12px), and migrate the sub-10px occurrences (`text-[7px]`/`text-[8px]`/`text-[9px]`, ~152 occurrences across 29 files) to it. Leave the much larger `text-[10px]`/`text-[11px]` population alone for this pass.

- [x] **6.2 — Establish a deliberate sidebar type hierarchy**

  **Target:** `src/components/layout/Sidebar.jsx`

  **Decision:** module/group header labels must be visually smaller than the actual page-link labels beneath them (currently inconsistent — re-verify exact current classes before editing, since the audit's numbers may have shifted: group headers were `text-[10px]` at the time of the audit, the "{ROLE} PORTAL" subtitle `text-[11px]`, and individual nav-item label sizing wasn't pinned down precisely). Confirm the three current values first, then set group headers to the smallest of the three and nav-item page labels to a larger, clearly legible size — applied consistently across all four role sidebars (they share this one component).

---

## Execution checklist summary

- [x] 0.1 `users` RLS + role-change trigger
- [x] 0.2 Remove admin SG-correction bypass; add `apply_admin_grade_override` RPC; update `GradeOverride.jsx`
- [x] 0.3 RLS on activity_logs / consultations / join-codes / dept-section-program
- [x] 0.4 Drop legacy evaluation tables (re-verify no references first)
- [x] 1.1 `class_activities` delete-guard trigger
- [x] 1.2 Faculty "Delete Column" UI + confirmation + dedicated audit log
- [x] 2.1 C01 relabel to "Current Grading Period"
- [x] 2.2 C09: `departments.short_name` column, rename to TECH, make UI reads dynamic
- [x] 2.3 C08: fix "At-Risk" showing for `'Covered'` (non-posted) periods
- [x] 3.1 C02: scheduling columns + faculty UI + student acknowledgment
- [x] 3.2 C13: home-section masterlist + irregular companion list
- [x] 4.1 C10: snapshot grading formula at class creation, not first posting
- [x] 5.1 C03: instruction text + per-task Edit control on Intervention Form
- [x] 6.1 C05: sub-10px font cleanup
- [x] 6.2 C05: sidebar type hierarchy

**No action needed:** C04, C06, C11, C12 — already implemented correctly per the audit.

**After implementation:** all `supabase/migrations/*.sql` files above are written but not applied — the user runs them against Supabase in one batch once this checklist is reviewed.
