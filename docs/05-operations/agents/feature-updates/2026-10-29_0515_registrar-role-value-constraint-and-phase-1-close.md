# Registrar role value constraint, roster notice re-point, demo account, and Phase 1 close-out

- **Date:** 2026-10-29 05:15 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix (role value constraint) plus New feature (approved outside the documented flow)
- **Migration:** `20261029034500_allow_registrar_role_value.sql` — **must run FIRST**, before `20261029040940` and `20261029044752`.

## Files changed

New:
- `supabase/migrations/20261029034500_allow_registrar_role_value.sql`

Edited:
- `src/lib/notificationDispatcher.js`
- `src/lib/seedDatabase.js`
- `seedAdmin.js`
- `src/pages/admin/UserList.jsx`
- `src/pages/registrar/Notifications.jsx`
- `AGENTS.md`
- `docs/03-development/audits/ADMIN_REGISTRAR_ROLE_SPLIT_WORKFLOW_PLAN_2026-10-28.md`
- `docs/03-development/audits/REGISTRAR_RLS_CALL_SITE_AUDIT_2026-10-29.md`

## What changed and why

### The blocking discovery: the database rejects `registrar`

Both the role-split plan and the 2026-10-29 call-site audit recorded that
`public.users.role` was unconstrained `TEXT`, and concluded no schema change was
needed. **That was wrong.** The developer found empirically that the live
database refuses the value.

The reason neither document could see it: `public.users` — along with
`departments`, `sections`, and `subjects` — was created **outside** the tracked
migrations, so its column definition and constraints are not in version control.
Grepping `supabase/migrations/` can never prove a constraint is absent on those
tables. The role-split plan had anticipated precisely this and instructed that a
constraint found at implementation time be treated as a blocking discovery rather
than routed around, which is what happened here.

`20261029034500_allow_registrar_role_value.sql` resolves it without assuming the
shape, because the shape cannot be read from the repo. It inspects the catalog
and handles either case: if `role` is backed by an enum it adds the `registrar`
label; if a `CHECK` constraint omits `registrar` it drops that constraint —
printing the original definition to the migration output first, so the change
stays recoverable — and replaces it with one listing the full vocabulary
(`admin`, `registrar`, `dean`, `faculty`, `student`, plus the dead-but-still-
referenced `office`). It is idempotent, and its verification block is
catalog-only: an earlier draft probed with a rolled-back `INSERT`, which was
replaced because a needless write against live data is not worth it for a
question the catalog answers directly.

The file is deliberately **not** wrapped in a transaction, since
`ALTER TYPE ... ADD VALUE` has historically been rejected inside one. The
authorization migration that follows compares `role::TEXT = 'registrar'` rather
than using an enum literal, so it never needs the new value visible inside its
own transaction.

Both documents that asserted the wrong thing were corrected in place rather than
left to mislead a future agent, and `AGENTS.md` now records that those four
tables predate the tracked migrations.

### Registrars were invisible in Manage Users

Three spots in `UserList.jsx` omitted the role, so an admin could create a
registrar and then never find it: the role filter dropdown, the mobile role tabs,
and the `roleCounts` tally. All three now include it. (The role *selector* on
account creation was already correct — `UserForm.jsx`'s `ROLES` array was fixed
in the earlier batch; the apparent absence was a stale dev server.)

### Roster notices now reach the Registrar

`notifyRosterImported` notified admins; roster import is Registrar's job since
the split, so it now targets active registrars. The other three admin-targeted
notices in that file stay with Admin deliberately — account status changes,
system and security alerts, and the no-active-dean escalation, whose actionable
fix (assigning a dean) remains Admin's.

A type-name mismatch was also caught: the dispatcher emits
`type: 'roster_import'` while the new Registrar notifications page was matching
`'roster_imported'`, which would have rendered roster notices as generic system
messages instead of grouping them under Records.

### Demo account

`registrar@sage.edu.ph` (REG-2026-00009) added to both seed paths and to
`AGENTS.md`'s demo user list, per confirmed decision #1. Both seeds hardcoded a
single `department_id` for every user and ignored the per-user field, so the
insert now passes `null` for registrar specifically — matching its
institution-wide scope and `UserForm`'s `COLLEGE_EXEMPT_ROLES` — while leaving
the other seeded roles' departments untouched.

`AGENTS.md` also said "4 portals" and "52 migration files"; both were stale (the
migration count was already wrong before this work, at 84 actual).

## How to verify

Automated (run and passing): `npm run lint` — 0 errors, 47 warnings, unchanged
across all three batches; `npm run build` — succeeds; `npm run verify:grading` —
passes; both seed files syntax-check.

Manual, in migration order:
1. Run `20261029034500` first. Watch the NOTICE output — it reports whether the
   column is an enum or had a `CHECK`, and prints any dropped constraint's
   original definition. Keep that output.
2. Run `20261029040940`, then `20261029044752`. Each self-verifies and aborts
   rather than half-applying.
3. Create the registrar account (SQL editor or Manage Users) and confirm the
   value is now accepted.
4. In Manage Users, confirm the Registrar filter option and role tab appear and
   count correctly.
5. Sign in as registrar and confirm the dashboard loads with no redirect loop.
6. Trigger a roster import and confirm the notice reaches the registrar, grouped
   under Records rather than System.
