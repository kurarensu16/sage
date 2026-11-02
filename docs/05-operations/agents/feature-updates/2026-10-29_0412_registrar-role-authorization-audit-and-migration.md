# Registrar role authorization: RLS call-site audit and migration

- **Date:** 2026-10-29 04:12 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** `20261029040940_registrar_role_authorization.sql` (to apply — developer is applying all plan migrations together after the remaining phases)

## Files changed
- `docs/03-development/audits/REGISTRAR_RLS_CALL_SITE_AUDIT_2026-10-29.md`
- `docs/README.md`
- `supabase/migrations/20261029040940_registrar_role_authorization.sql`

## What changed and why

Phase 1 (steps 1–2) of the post-defense Admin/Registrar role split, per
[`POST_DEFENSE_IMPLEMENTATION_PHASING_2026-10-29.md`](../../../03-development/audits/POST_DEFENSE_IMPLEMENTATION_PHASING_2026-10-29.md).
Driven by Capstone defense panel ruling 2.1 ("separate the Admin and Registrar roles").

**Step 1 — call-site audit** (`REGISTRAR_RLS_CALL_SITE_AUDIT_2026-10-29.md`, new).
The role-split plan's inventory assumed the authorization gate was a literal
`role = 'admin'` string in ~7 migrations. It is not: the real gate is the
`public.is_active_admin()` helper, referenced ~77 times across 11 migrations, and
a literal grep matches none of those sites. The audit classifies every site into
re-point-to-Registrar, Admin-keeps, needs-a-decision, Registrar-breaking-gap, and
pre-existing-weakness buckets.

An RBAC sweep across all five roles then found three gaps that would each have
shipped a page that renders but silently cannot read or write:

- **G1** `academic_terms` writes are gated by a legacy literal `role = 'admin'`
  policy that no later migration ever dropped. `TermManagement.jsx` writes that
  table directly at three call sites, so re-pointing only the term RPCs would have
  left Academic Terms failing every save for Registrar.
- **G2** `enrollments` excluded Registrar from **both** read and write. Enrollment
  Management, Section Rosters, and Import Students all depend on it.
- **G3** `student_term_details` had the same never-dropped legacy policy, and
  `SectionList.jsx` (a relocated page) touches it.

The sweep also documented pre-existing weaknesses unrelated to this phase: the
`users` table's `USING (true)` read policy lets any authenticated user — including
any student — read the entire user directory, and eight further tables carry
blanket `USING (TRUE)` reads. Writes were already correctly locked, so this is
exposure rather than tampering. Hardening these was approved as its own separate
migration immediately after this one, deliberately not bundled here.

**Step 2 — migration** (`20261029040940_registrar_role_authorization.sql`, new).
Adds `is_active_registrar()` as a distinct gate; `is_active_admin()` is left
unchanged so the ~60 sites that must stay admin-only cannot drift. Re-points the
nine relocated policies and six function gates, drops the two legacy policies
first (Postgres OR's permissive policies, so re-pointing without dropping would
change nothing), and adds Registrar additively to `enrollments` and
`guardians_admin_select`. Registrar deliberately never receives `INSERT` on
`public.users` — Import Students was confirmed as enrollment-only, so account
creation stays exclusively Admin's.

Function gates are re-pointed by reading each live definition via
`pg_get_functiondef()`, substituting only the gate call, and asserting the
expected substitution count. This avoids hand-transcribing ~350 lines of grading
logic to change one line each, and makes a drifted body abort loudly rather than
silently no-op. That assertion already earned its keep: it revealed that
`enforce_sg_correction_application()` contains **two** gates, not one, because the
same faculty-or-admin check appears in both the secured-correction path and the
ordinary SG-repost path.

No schema change was needed — `users.role` is unconstrained `TEXT`, so
`'registrar'` is simply a new value.

## How to verify

Pre-apply (done): all six function gate counts were verified against the live
migration bodies and match the migration's assertions (1/1/1/1/1/2).

Post-apply, the migration self-verifies in its own closing block and aborts unless:
- `is_active_registrar()` exists;
- all nine relocated policies reference the registrar gate and none still
  reference `is_active_admin()`;
- both legacy admin-only policies are gone;
- `enrollments` SELECT admits Registrar;
- `users_insert_admin` and `activity_logs_select_admin` remain admin-gated;
- Registrar did **not** gain `INSERT` on `public.users`.

Manual, once Phase 1's routes and nav exist: confirm Registrar can actually
**write** (not merely reach) Subjects, Programs, Sections, Departments, Grading
Templates, Academic Terms, and Grade Override; confirm Section Rosters and
Enrollment Management populate; confirm Admin is denied at the database layer on
those same targets, including through the legacy `apply_admin_grade_override` v1/v2
RPCs and not just the v3 the UI calls; confirm Admin retains Manage Users, Import
Users, and Audit Logs; confirm `prevent_self_role_escalation` still blocks a
Registrar attempting to self-promote.
