# Admin/Registrar Role Split Workflow Plan - 2026-10-28

**Status:** Proposed design. No code, migration, or edge function exists yet. Every file listed under "Suggested build order" still requires its own developer confirmation before it is created or edited, per `AGENTS.md`.
**Scope:** Introduces a 5th role, `registrar`, and moves a defined slice of Admin's current pages/permissions onto it. Does **not** design Maintenance Mode or the System Health dashboard (that is a separate plan, `SYSTEM_MAINTENANCE_AND_HEALTH_WORKFLOW_PLAN_2026-10-28.md`, roadmap item #2) — this plan only adds the placeholder nav slot Admin keeps for them. Does **not** design Faculty Loading & Provisioning (roadmap item #4) or the Grade Change Request dispute chain (roadmap item #6) — Grade Override here stays the existing direct, no-dispute correction tool, just relocated.
**Trigger:** Capstone defense panel ruling 2.1 ("Separate the Admin and Registrar roles — give distinct function for admin and registrar") plus this conversation's follow-up: Registrar owns academic/records data, Admin is narrowed to system maintenance and account creation only.

## Objective

1. Add `registrar` as a 5th role alongside `admin`, `dean`, `faculty`, `student`, with its own portal shell, nav, and routes.
2. Narrow Admin to: account creation/management (all roles, including Registrar itself), system maintenance (Audit Logs, plus the placeholder slot for System Health/Maintenance Mode from the sibling plan), and nothing else.
3. Move Academic Setup (Subjects, Grading Templates, Manage Sections, Colleges & Departments), Academic Terms, Grade Override, and Section Rosters from Admin to Registrar.
4. Add two things that don't exist today: a dedicated **Programs** admin page, and Registrar-side **Student Records** (Enrollment Management, Section Rosters, Import Students).
5. Give Registrar read-only visibility into accounts ("View Users") — Admin stays the only role that can create, edit, or deactivate any account, including faculty records. Registrar does **not** get an "Import Faculty Records" page; that stays Admin-only.
6. Explicitly audit, not assume, every existing RLS policy and route guard keyed to `role = 'admin'` to decide whether Registrar should also pass it.

## Current Setup vs. New Setup

| | Today | After this plan |
|---|---|---|
| **Who can create/edit/deactivate any account** | Admin, via `UserList.jsx`/`UserForm.jsx` and Import Users — the only role with account-management access at all | Unchanged: Admin only. Registrar gets a new **View Users** page, read-only — no create/edit/deactivate controls render for Registrar at all |
| **Who imports faculty records** | Admin, via the same Import Users flow (role-agnostic bulk import) | Unchanged: Admin only. Registrar explicitly does **not** get an "Import Faculty Records" page |
| **Who manages Subjects, Grading Templates, Sections, Colleges & Departments** | Admin, via `SubjectList.jsx`/`SubjectForm.jsx`, `GradeComputationsList.jsx`, `SectionList.jsx`/`SectionForm.jsx`, `DepartmentsList.jsx` — all under the Admin-only route group (`src/App.jsx:120`) | Registrar. These four pages' routes move out of the `allowedRoles={['admin']}` group into a new `allowedRoles={['registrar']}` group. **Admin loses access to all four** — they stop appearing in Admin's `Sidebar.jsx` nav and, if an Admin somehow navigates to the old URL, `RoleGuard` now redirects to `/403` |
| **Who manages Programs** | Nobody — no dedicated page exists. Programs are only read implicitly (`program.abbreviation` in `ClassroomProvisioning.jsx`) | Registrar, via a new `ProgramList.jsx`/`ProgramForm.jsx` — this is net-new capability, not a relocation |
| **Who manages Academic Terms** | Admin, via `TermManagement.jsx` | Registrar. Same relocation pattern as above — route moves, Admin loses the page, Registrar gains it |
| **Who views Section Rosters** | Admin, via `SectionMasterlist.jsx` | Registrar. Relocated |
| **Who performs a direct Grade Override (last-resort, no-dispute correction)** | Admin, via `GradeOverride.jsx`, audited under `role = 'admin'` in `20261014130000_admin_grade_override_audited.sql` | Registrar only. The route relocates **and** the audit-trail's actor-role check in that migration must change from `role = 'admin'` to `role = 'registrar'` — if only the route/nav move and the RLS/audit check is left as `'admin'`, Registrar's writes will fail silently at the database layer even though the page renders (see "Worked example" above) |
| **Who manages student enrollment records** | Nobody has a dedicated page — enrollment exists only implicitly through faculty-side join-code approval | Registrar, via a new **Enrollment Management** page and a new **Import Students (CSV/Excel)** bulk flow — net-new, not a relocation |
| **Admin's own portal scope** | One portal doing account management, full Academic Setup, Academic Terms, Grade Override, and Audit Logs — no maintenance/health concept exists | Narrowed to: Manage Users/Import Users (all roles), Audit Logs, and a placeholder **System Maintenance** nav group (System Health, Storage Health (R2), Maintenance Mode — designed in the sibling plan, not here). Admin's Dashboard itself is repurposed from an institutional overview to a system-health overview |
| **RLS/route checks keyed to `role = 'admin'` alone** | Every policy/function in the inventory below (users RLS, grade-override audit, guardian access, risk-notes access, evaluation-referral access) treats `'admin'` as the sole privileged non-faculty/non-dean actor in its context | Each one needs re-auditing: some (grade override) fully re-point to `'registrar'`; others (guardian access, users RLS) may need a `registrar` branch added **alongside** `'admin'` rather than replacing it, since Admin keeps account-management duties that touch some of the same tables. This decision is made per-policy in the audit step below, not assumed uniformly |
| **New role value** | `users.role` holds `admin`/`dean`/`faculty`/`student` (plus a dead, unused `'office'` string from the discarded College Office portal) | Adds `'registrar'` as a live value. No schema/CHECK migration needed — `role` is unconstrained `TEXT` — but every authorization site that enumerates roles explicitly (not just `'admin'`) needs checking for whether Registrar should be included |

## Current state (verified against the live code)

- **Role storage:** `public.users.role` is a plain `TEXT` column with no `CHECK` constraint found anywhere in `supabase/migrations/` (searched for `CHECK...role`, `role TEXT`, `ADD CONSTRAINT...role` — no hits). This means adding `'registrar'` as a value needs **no migration to widen an enum/check** — it's purely an authorization-logic change, not a schema change. (If a constraint is found at implementation time that this search missed, treat that as a blocking discovery, not a surprise to route around.)
- **Role already has an unused value:** `'office'` appears in `20261003110100_guardian_admin_access.sql`'s RLS policy (`role IN ('admin', 'dean', 'office', 'faculty')`) — a leftover from the discarded College Office portal (`docs/02-thesis/decisions/`). Registrar is a genuinely new value, not a revival of `office`; don't reuse that string.
- **Client-side gate:** `src/lib/AuthContext.jsx:373` — `role: userProfile?.role ?? null`, sourced from `users.role` on login (`fetchUserProfile`, line 79-107).
- **Route gate:** `src/components/layout/RoleGuard.jsx` — a simple `allowedRoles.includes(role)` check wrapping each `<Route element={<RoleGuard allowedRoles={[...]}/>}>` group in `src/App.jsx`. The Admin route group starts at `src/App.jsx:120` (`allowedRoles={['admin']}`), covering lines 121-133+ (Dashboard, UserList, UserForm, GradeOverride, AuditLog, SubjectList, SubjectForm, SectionList, SectionForm, SectionMasterlist, Notifications, TermManagement, GradeComputationsList, DepartmentsList, ClassroomProvisioning).
- **Nav gate:** `src/components/layout/Sidebar.jsx` — `PORTAL_NAVIGATION` keyed by role (`admin`, `dean`, `faculty`, `student` today), selected via `path.split('/')[1]` (line 264) and falling back to `faculty` if unmatched (line 267). A `registrar` key simply needs adding to this object — the lookup mechanism itself needs no change.
- **RLS policies keyed to `role = 'admin'`** (inventory so far, confirmed by grep — **treat this list as a starting point to re-verify at implementation time, not a closed set**, since the same pattern can appear inside PL/pgSQL function bodies that a simple grep for `role = 'admin'` literal text won't catch if they interpolate differently):
  - `20260606164500_add_attendance_and_semester_transition.sql:104` — `users.role IN ('faculty', 'admin')`
  - `20260926120000_secure_student_risk_notes.sql:137,188` — `actor.role = 'admin'`, plus `v_actor_role NOT IN ('faculty', 'admin')` at line 229
  - `20261003110100_guardian_admin_access.sql:1` — `role IN ('admin', 'dean', 'office', 'faculty')`
  - `20261006120120_faculty_evaluation_referrals.sql:181` and `20261010120000_intervention_followup_and_task_verification.sql:438` — `v_actor_role NOT IN ('faculty', 'admin')`
  - `20261014130000_admin_grade_override_audited.sql` — comment at line 4 confirms Grade Override's audit trail is keyed to `users.role = 'admin'` specifically; this is the one that **must** change meaning once Grade Override moves to Registrar.
  - `20261014120000_harden_users_rls.sql` — the users-table RLS itself; the policy that lets Admin manage all user rows needs re-checking against whether Registrar's read-only `View Users` page needs its own narrower `SELECT`-only policy rather than reusing Admin's broader one.
- **Programs already exist in the data model** with no dedicated admin page: `src/pages/admin/ClassroomProvisioning.jsx` reads `program.abbreviation` (via `getProgramAbbreviation()`, lines 27-30) from a `programs` table joined through departments/sections, but there is no `ProgramList.jsx`/`ProgramForm.jsx` anywhere in `src/pages/admin/`. This is a genuinely new page, not a relocation.

## Design: who gets what

### Admin (narrowed)

| Keeps | Moves to Registrar | New |
|---|---|---|
| Dashboard (repurposed as system-health overview per the sibling plan) | Academic Setup: Subjects, Grading Templates, Manage Sections, Colleges & Departments | System Maintenance nav group (placeholder slot only — System Health, Storage Health (R2), Maintenance Mode designed in the sibling plan) |
| Manage Users / Import Users (**all** roles including Registrar and including faculty) | Section Rosters | — |
| Audit Logs | Academic Terms | — |
| — | Grade Override | — |

### Registrar (new)

- **User Accounts:** View Users (read-only — a `SELECT`-only RLS policy, not a reuse of Admin's full-access one)
- **Academic Setup:** Subjects (`SubjectList.jsx`/`SubjectForm.jsx`, relocated), **Programs** (new `ProgramList.jsx`/`ProgramForm.jsx`), Grading Templates (`GradeComputationsList.jsx`, relocated), Manage Sections (`SectionList.jsx`/`SectionForm.jsx`, relocated), Colleges & Departments (`DepartmentsList.jsx`, relocated)
- **Academic Terms** (`TermManagement.jsx`, relocated)
- **Student Records:** Enrollment Management (new page), Section Rosters (`SectionMasterlist.jsx`, relocated), Import Students CSV/Excel (new, same ready/existing/error pattern as today's `UserList.jsx` import flow)
- **Records:** Grade Override (`GradeOverride.jsx`, relocated) — same direct-correction behavior as today; its audit trail (`20261014130000_admin_grade_override_audited.sql`) needs its `role = 'admin'` check widened or replaced to also accept `role = 'registrar'`, since the actor performing this action is no longer necessarily Admin
- Out of scope here: Faculty Loading & Provisioning and Add Irregular Student to Class (roadmap item #4), Import Faculty Records (explicitly **not** given to Registrar — stays Admin-only alongside Import Users)

## Worked example (why the RLS audit matters)

Today, Dean Valdes cannot touch `TermManagement.jsx` or `GradeOverride.jsx` at all — both routes are admin-only. After this split, if Registrar Santos opens Grade Override to make a last-resort correction on a posted SG, the write itself succeeds at the RLS layer only if `admin_grade_override_audited.sql`'s policy is updated to also accept `role = 'registrar'`. If that migration is missed, Santos's UI will render the page (route/nav guard updated) but every write will silently fail at the database layer with a permission error — a mismatch between "looks reachable" and "actually works" that only shows up in testing, not in a code read. This is why the suggested build order below puts the RLS audit and migration **before** the nav/route changes, not after: a role that can navigate to a page it can't actually use is worse than a role that can't navigate there yet.

## Open decisions (confirm before any file is touched)

1. **Demo account:** `AGENTS.md`'s demo users list has no Registrar account. Add one (e.g. `registrar@sage.edu.ph`, same `DemoPassword123!` policy) in `seedAdmin.js`/`seedDatabase.js`, and update `AGENTS.md` itself once approved?
2. **Grade Override's audit actor check:** widen `role = 'admin'` to `role IN ('admin', 'registrar')` in `20261014130000_admin_grade_override_audited.sql`'s logic, or write a fresh migration that fully re-points it to `registrar` only (since Admin no longer has the route to reach this page at all)? The plan above assumes the latter — Admin loses Grade Override entirely, so the audited actor role should become `registrar`-only, not `admin`-or-`registrar`. Confirm this reading is correct before the migration is written.
3. **`guardians_admin_access` policy** (`role IN ('admin', 'dean', 'office', 'faculty')`) — does Registrar need guardian visibility too, given it's taking over student-records ownership? Needs a decision, not an assumption.
4. **Existing `'office'` role string** — confirm it is genuinely dead (no seeded user currently has `role = 'office'`) before writing Registrar's policies, so a leftover office-role account doesn't unexpectedly inherit or collide with new Registrar policies.
5. **View Users' exact column scope** — read-only on every column `UserList.jsx` shows today, or a narrower subset (e.g. hide salary/compliance-sensitive fields if any exist on `users`)?

## Suggested build order

1. RLS audit: re-run and expand the grep inventory above across all of `supabase/migrations/` and any PL/pgSQL function bodies, confirm the final list of policies/functions needing a `registrar` branch, write it down before touching code.
2. Migration(s): add Registrar-aware RLS policies (users read-only SELECT, Grade Override actor-role update, any others the audit surfaces); no schema/CHECK change needed since `role` is unconstrained `TEXT`.
3. `src/lib/AuthContext.jsx` — confirm no change needed beyond what already reads `role` generically (likely none, since the value is just passed through).
4. `src/components/layout/RoleGuard.jsx` — confirm no change needed (generic `allowedRoles.includes(role)`, likely none).
5. `src/App.jsx` — new `<Route element={<RoleGuard allowedRoles={['registrar']} />}>` group; move the relocated routes' `element`/`path` pairs out of the Admin group and into it; add new routes for Programs, Enrollment Management, Import Students.
6. `src/components/layout/Sidebar.jsx` — add `registrar` key to `PORTAL_NAVIGATION`; trim Admin's `PORTAL_NAVIGATION.admin` entries to the narrowed set plus the System Maintenance placeholder group.
7. New pages: `src/pages/registrar/ProgramList.jsx`, `ProgramForm.jsx`, `EnrollmentManagement.jsx`, `ImportStudents.jsx` (or colocated under `src/pages/admin/` renamed to `src/pages/registrar/` for the relocated ones — developer's call on whether to move the folder or just the route).
8. Relocate existing admin pages' route/import paths for Subjects, Grading Templates, Sections, Departments, Terms, Grade Override, Section Rosters.
9. `seedAdmin.js`/`seedDatabase.js` — add the Registrar demo account if decision #1 above is "yes."
10. Manual click-through: confirm Admin can no longer reach any relocated route (should 403 or not render in nav), confirm Registrar can reach and actually write to Grade Override (not just render it), confirm View Users is read-only (no create/edit/deactivate controls render for Registrar).
11. Change record in `docs/05-operations/agents/feature-updates/` once implemented and approved, plus a `docs/README.md` index update for this doc.

Each step remains subject to its own per-file confirmation before editing, per `AGENTS.md`.
