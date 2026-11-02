# Registrar RLS Call-Site Audit — 2026-10-29

**Status:** Audit complete; dispositions below are the reviewed list the Phase 1 migration will implement. No code or migration has been written yet.
**Scope:** Step 1 of Phase 1 (Admin/Registrar Role Split) per [`POST_DEFENSE_IMPLEMENTATION_PHASING_2026-10-29.md`](POST_DEFENSE_IMPLEMENTATION_PHASING_2026-10-29.md). Enumerates every authorization site that currently treats `admin` as the privileged non-faculty/non-dean actor, and records what each becomes once `registrar` exists as a 5th distinct role.
**Why this doc exists:** [`ADMIN_REGISTRAR_ROLE_SPLIT_WORKFLOW_PLAN_2026-10-28.md`](ADMIN_REGISTRAR_ROLE_SPLIT_WORKFLOW_PLAN_2026-10-28.md) instructed that the grep inventory be re-run and expanded, and written down, *before* any code is touched — and explicitly warned its own list was "a starting point to re-verify, not a closed set." That warning was correct. See "Correction to the plan's inventory" below.

## Headline finding: the gate is a helper function, not literal role strings

The plan's inventory listed ~7 migration files containing a literal `role = 'admin'`. Searching only for that literal **understates the real surface area by roughly an order of magnitude.**

The actual authorization gate is:

```sql
-- supabase/migrations/20261008180000_grading_authorization_hardening.sql:10-24
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users actor
    WHERE actor.user_id = auth.uid()
      AND actor.role::TEXT = 'admin'
      AND COALESCE(actor.status::TEXT, 'active') = 'active'
  );
$$;
```

It is referenced **~77 times across 11 migration files**. A plain grep for `role = 'admin'` matches none of those 77 sites, because the literal lives only inside this one function body.

**Why this is good news:** one helper is a far cleaner and safer seam than 77 scattered literals would have been. The risk was never that the split is hard — it is that an incomplete inventory ships a Registrar who can reach a page but cannot write to it (the exact silent-failure mode the plan's "Worked example" warned about).

### Confirmed architecture (developer decision, 2026-10-29)

Admin and Registrar are **two distinct roles** — five distinct roles system-wide (`admin`, `registrar`, `dean`, `faculty`, `student`). Therefore:

- `is_active_admin()` is **left unchanged** and keeps meaning strictly `admin`. The ~60 call sites that should remain admin-only are consequently untouched and cannot drift.
- A new `is_active_registrar()` helper is added, mirroring the same shape (active-status check included).
- Call sites are re-pointed **individually**, per the dispositions below. Where both roles genuinely need access, the check is written explicitly (`is_active_admin() OR is_active_registrar()`) rather than hidden behind a blended helper, so the distinction stays visible at the call site.
- **Rejected:** redefining `is_active_admin()` to accept both roles. It is a one-line change that would silently grant Registrar access to Audit Logs, user creation, and the self-role-escalation bypass — the opposite of this plan's intent, since Admin's scope is *narrowing*, not widening.

### Correction to the plan's inventory

For the record, since the plan's list will otherwise read as authoritative to a future agent:

| Plan claimed | Actual |
|---|---|
| ~7 files with `role = 'admin'` | 7 files contain the literal, but **none of them are the real gate** for the relocated pages |
| Grade Override's check is a literal `role = 'admin'` | It is `public.is_active_admin()` at [`20261014130000_admin_grade_override_audited.sql:152`](../../../supabase/migrations/20261014130000_admin_grade_override_audited.sql) (and `:73`); line 4's `'admin'` is a comment |
| Inventory implies a handful of edits | 11 files, ~77 call sites, requiring per-site classification |

**CORRECTED 2026-10-29 (post-implementation):** this audit originally stated that no `CHECK` constraint on `users.role` was found, and concluded no schema widening was needed. **That conclusion was wrong.** The developer found empirically that the live database rejects `'registrar'`. The repo cannot show the constraint because `public.users` — like `departments`, `sections`, and `subjects` — was created outside the tracked migrations, so its column definition and constraints are not in version control. Grepping `supabase/migrations/` can therefore never rule out a constraint on those tables. `20261029034500_allow_registrar_role_value.sql` widens whichever form it takes (enum label or `CHECK`) and must run before the authorization migration.

---

## Bucket A — Re-point to Registrar (confirmed by already-approved page relocations)

These follow directly from decisions already signed off; no further judgment needed.

| # | Gate | File:line | Owns |
|---|---|---|---|
| A1 | `departments_admin_write` | `20261014140000_rls_live_tables.sql:146-149` | Colleges & Departments |
| A2 | `sections_admin_write` | `20261014140000_rls_live_tables.sql:156-159` | Manage Sections |
| A3 | `programs_admin_write` | `20261014140000_rls_live_tables.sql:166-169` | Programs (net-new Registrar page) |
| A4 | `subjects_admin_mutation` | `20261008180000_grading_authorization_hardening.sql:234-237` | Subjects |
| A5 | `grade_computations_admin_mutation` | `20261008180000_grading_authorization_hardening.sql:245-248` | Grading Templates |
| A6 | `grade_computation_components_admin_mutation` | `20261008180000_grading_authorization_hardening.sql:256-259` | Grading Templates (components) |
| A7 | `save_grade_template()` | `20261011140000_admin_batch3_atomic_saves.sql:42` | Grading Templates (atomic save RPC) |
| A8 | `perform_semester_transition()` | `20261011130000_term_rollover_grace.sql:266` | Academic Terms |
| A9 | `get_term_sg_status()` | `20261011130000_term_rollover_grace.sql:452` | Academic Terms (status read) |
| A10 | `apply_admin_grade_override_v2(UUID, UUID, NUMERIC, TEXT, TEXT)` | `20261022121000_server_authoritative_grade_posting.sql:836` (gate at `:858`) | Grade Override — **registrar-only** per confirmed decision #2 |
| A11 | `apply_admin_grade_override_v3(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT)` | `20261023211000_staged_sg_score_corrections.sql:966` (gate at `:993`) | Grade Override — the version the client actually calls |
| A12 | `enforce_sg_correction_application()` | latest definition `20261024093000_cascade_corrected_grade_milestones.sql:59` | Trigger guard: "assigned faculty **or** admin may apply an approved SG correction" |
| A13 | `posted_grades_admin_update` | `20261008180000_grading_authorization_hardening.sql:439-442` | The table UPDATE that Grade Override performs |
| A14 | `academic_terms` write policy — `"Allow all operations for admins on academic_terms"` | `20260606164500_add_attendance_and_semester_transition.sql:86-88` | Academic Terms. **Legacy literal `role = 'admin'` policy, never dropped** — see G1 |
| A15 | `student_term_details` write policy — `"Allow all operations for admins on student_term_details"` | `20260606164500_add_attendance_and_semester_transition.sql:94-96` | Touched by `SectionList.jsx`, a relocated page. Same legacy pattern — see G3 |

### Correction: the grade-override chain is 3 signatures, not 5 reimplementations

An earlier draft of this doc claimed admin grade override was "reimplemented across five migrations that must all move together." **That was wrong**, and is corrected here because it would mislead anyone acting on it:

| Signature | Defined | Holds a gate? |
|---|---|---|
| `apply_admin_grade_override(UUID, NUMERIC, TEXT, TEXT)` — "v1" | redefined 3×; latest `20261022121000:991` | **No.** It is a thin shim whose entire body delegates to v2, so re-pointing v2 covers it automatically |
| `apply_admin_grade_override_v2(UUID, UUID, NUMERIC, TEXT, TEXT)` | `20261022121000:836` | Yes, one gate at `:858` |
| `apply_admin_grade_override_v3(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT)` | `20261023211000:966` | Yes, one gate at `:993` |

All three coexist in the database. The client calls **only v3** (`src/lib/gradePostingService.js:112`). v1 and v2 remain callable by any authenticated holder of the right role, so v2 must move too — otherwise an Admin could still override a grade by invoking the legacy RPC directly, contradicting "Admin loses Grade Override entirely." **The gate therefore lives in exactly two bodies (v2, v3), not five.**

## Bucket B — Admin keeps (unchanged)

Admin's retained scope: account management, audit logs, system maintenance.

| # | Gate | File:line | Rationale |
|---|---|---|---|
| B1 | `users_insert_admin` | `20261014120000_harden_users_rls.sql:34-36` | Admin is the only role that creates accounts |
| B2 | `users_update_self_or_admin` | `20261014120000_harden_users_rls.sql:28-31` | Admin edits/deactivates all accounts |
| B3 | `prevent_self_role_escalation()` | `20261014120000_harden_users_rls.sql:59` | Security trigger; must **not** accept Registrar |
| B4 | `activity_logs_select_admin` | `20261014140000_rls_live_tables.sql:27-29` | Audit Logs stays Admin |
| B5 | `grade_audit_events` actor read | `20261022120000_grade_posting_p0_foundation.sql:249` | Audit surface, same rationale as B4 |

## Bucket C — Needs a developer decision (not covered by any confirmed decision)

| # | Item | File:line | Recommendation |
|---|---|---|---|
| C1 | `assign_department_dean()` | `20261011140000_admin_batch3_atomic_saves.sql:128` | **Admin keeps.** Assigning a Dean is an account-level act, and Admin remains sole owner of accounts — including Registrar's own. |
| C2 | `class_room_join_codes` select/insert/update; `class_join_requests` update (admin fallback alongside faculty) | `20261014140000_rls_live_tables.sql:87-100,126-129`; `..._hardening.sql:274-275,327-328` | **Leave as-is in Phase 1.** Provisioning/enrollment ownership genuinely moves in Phase 4 — changing it here pre-empts a later phase and would be untestable until that page exists. |
| C3 | Admin as privileged **grading** actor: `class_records` insert/update/delete, `enrollments`, `class_grading_columns`, `class_activities`, `student_*_scores`, `attendance_records` mutation fallbacks | `..._hardening.sql:155-179,200,272-275,325-328,341-342,366-367,382-383,452-454`; `20261023211000:42,290,699`; `20261024093000:118,198`; `20261022120000:227,770,784` | **Leave as-is in Phase 1, flag as follow-up.** These are Admin's global superuser fallbacks across the gradebook. Stripping them is correct in principle once Admin is maintenance-only, but the blast radius is wide and nothing in Phase 1 requires it. Removing them belongs in its own reviewed change, not bundled into the role split. |
| C4 | `student_consultation_requests` policies | `20261014140000_rls_live_tables.sql:47-78` | **Leave untouched.** Phase 5 retires this feature; editing it now is throwaway work. |
| C5 | Registrar read access to `users` for View Users | `20261014120000_harden_users_rls.sql:22-25` | **No new policy needed in Phase 1 — but only by accident.** `users_select_authenticated` is `USING (true)`, so *every* authenticated user already reads every row (see W1). Registrar inherits that. **Once the RBAC read-hardening migration lands, Registrar needs an explicit read grant here**, or View Users goes blank. Carry this forward. |
| C6 | `guardians_admin_select` | `20261003110100_guardian_admin_access.sql` | Confirmed decision #3 says add Registrar. Listed separately because this policy enumerates roles literally (`role IN ('admin','dean','office','faculty')`) instead of using the helper. **Note:** the policy is named `guardians_admin_select` (not `guardians_admin_access`, as the role-split plan calls it), and the migration file is **UTF-16 encoded**. |
| C7 | Import Students → does Registrar need `users` INSERT? | — | **Resolved 2026-10-29: no.** Import Students is **enrollment-only** — it adds students who already have accounts to sections/classes (`enrollments`, `student_term_details`). Account creation stays exclusively Admin's via Import Users, preserving the confirmed "Admin is the only role that creates accounts" rule. Registrar never receives `users` INSERT. |

## Bucket G — Registrar-breaking gaps (found during the RBAC sweep; MUST be in Phase 1)

These are not Admin-privilege relocations — they are tables Registrar's approved pages depend on where Registrar currently has **no access at all**. Each would have produced the plan's own worst-case failure mode: a page that renders but silently cannot read or write.

| # | Gap | Where | Impact if missed | Fix |
|---|---|---|---|---|
| G1 | `academic_terms` writes are gated by a **legacy literal `role = 'admin'` policy that was never dropped** | `20260606164500:86-88` | `TermManagement.jsx` writes this table directly at 3 call sites (`:51`, `:98`, `:179`). Academic Terms would render for Registrar and fail every save. The two term RPCs (A8/A9) are **not** sufficient — the page bypasses them for direct table writes. | Drop the legacy policy, create a registrar-gated replacement (= A14) |
| G2 | `enrollments` **read and write both exclude Registrar** | `..._hardening.sql:182-199` (select), `:200-228` (mutation) | `enrollments_authorized_select` allows own-student / admin / assigned-faculty / dept-dean only; `enrollments_faculty_mutation` allows admin / assigned-faculty only. Enrollment Management, Section Rosters, and Import Students would all show empty lists and fail writes. | **Add** `is_active_registrar()` alongside existing roles — additive, nobody loses access |
| G3 | `student_term_details` writes gated by the same never-dropped legacy admin-only policy | `20260606164500:94-96` | `SectionList.jsx` (a relocated page) touches this table | Drop legacy policy, create registrar-gated replacement (= A15) |

## Bucket W — Pre-existing RBAC weaknesses affecting ALL roles

Not caused by this phase; surfaced by the sweep. **Developer decision 2026-10-29: harden these to least privilege, in a dedicated migration immediately after the Phase 1 migration** — kept separate so that if a screen renders blank afterward, the cause is unambiguous.

| # | Weakness | Detail |
|---|---|---|
| W1 | `users_select_authenticated` is `USING (true)` | Every authenticated user — **including every student** — can `SELECT` every row of `public.users`: names, emails, ID numbers, contact numbers, section, department, status, and `role`. Any student can enumerate the entire student and staff directory. Writes are correctly locked (B1–B3), so this is **exposure only, not tampering** — nobody can self-escalate. Reachable in practice, not merely in theory, because the anon key ships in the browser. |
| W2 | Blanket `USING (TRUE)` SELECT on 8 further tables | `class_records`, `subjects`, `grade_computations`, `grade_computation_components`, `departments`, `sections`, `programs`, plus `academic_terms` and `student_term_details` (legacy). Most are catalog/reference data and defensible; the outlier is **`class_records`**, which exposes every class in the institution — and its assigned faculty — to every student. |
| W3 | Legacy policy layers never cleaned up | `20261008180000_grading_authorization_hardening.sql` explicitly dropped the old blanket `20260606164500` policies for `attendance_records`, but **never did so for `academic_terms` or `student_term_details`**. Because Postgres OR's permissive policies together, the legacy rule is what actually grants access on those two tables — so re-pointing a newer policy without dropping the legacy one would change nothing. This is why G1/G3 must `DROP` before they `CREATE`. |

## Bucket D — Broad read-visibility fallbacks (no action, documented for completeness)

~20 further `OR public.is_active_admin()` clauses on **SELECT** policies across `class_records`, `enrollments`, `posted_grades`, `remark_override_requests`, `grade_correction_history`, `student_academic_insights`, `student_risk_evaluations`, `student_term_scores`, `student_component_scores`, `class_activities`, `attendance_records`, and the notification/risk-note/referral/intervention-draft migrations (`20261001170000`, `20260926120000`, `20261006120000`, `20261007120000`, `20260606164500`, `20261008160000`).

These grant Admin *read* visibility only. They are not authoring paths, they do not block any Registrar capability, and narrowing them is a separate hardening concern. **No Phase 1 change.**

## What the Phase 1 migration will therefore do

1. `CREATE OR REPLACE FUNCTION public.is_active_registrar()` — mirrors `is_active_admin()`'s shape, checks `role::TEXT = 'registrar'` plus active status; same `REVOKE`/`GRANT EXECUTE TO authenticated` treatment.
2. **Re-point to Registrar (Admin loses):** policies A1–A6, A13, plus A14/A15 (`academic_terms`, `student_term_details` — each `DROP`ped first, per W3), and function gates A7, A8, A9, A10 (v2), A11 (v3), A12.
3. **Add Registrar alongside (nobody loses):** G2 `enrollments` select + mutation, and C6 `guardians_admin_select`.
4. Function gates are re-pointed by reading each **live** definition via `pg_get_functiondef()`, substituting only the gate call, and asserting the expected substitution count — so a deployed body that differs from this audit fails loudly rather than silently no-op'ing. This avoids hand-transcribing ~350 lines of grading logic to change one line in each.
5. Touch nothing in Buckets B, D, or W; C1–C4 resolved as recommended (Admin keeps C1; C2/C3 deferred to Phase 4 and a dedicated follow-up; C4 moot via Phase 5).

A schema change IS required after all, contrary to this audit's original finding: `20261029034500_allow_registrar_role_value.sql` must run first to admit the `registrar` value. See the correction above.

## Verification before the migration is considered done

- Registrar can **write** (not merely reach) Subjects, Programs, Sections, Departments, Grading Templates, Academic Terms, and Grade Override.
- Registrar can **read and write** `enrollments` (G2) — confirm Section Rosters and Enrollment Management actually populate.
- Admin is **denied at the database layer** on A1–A15, not merely hidden in nav.
- Admin retains Manage Users, Import Users, and Audit Logs.
- Grade Override is unreachable for Admin **through the legacy v1/v2 RPCs as well**, not just the v3 the UI calls.
- `prevent_self_role_escalation` still blocks a Registrar attempting to self-promote.

## Follow-up work this audit identifies (not Phase 1)

| Item | Why deferred |
|---|---|
| RBAC read-hardening migration (W1/W2/W3) | Confirmed for immediately after Phase 1, as its own change with its own five-role click-through. Must include an explicit Registrar read grant on `users` (see C5) or View Users breaks. |
| Strip Admin's gradebook superuser fallbacks (C3) | Correct once Admin is maintenance-only, but wide blast radius and not required by Phase 1. |
| Join-code / `class_join_requests` ownership (C2) | Moves naturally in Phase 4 when provisioning relocates. |
