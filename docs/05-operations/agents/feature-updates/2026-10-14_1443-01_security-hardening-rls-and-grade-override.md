# Security hardening: RLS, audited grade override, OTP password reset

- **Date:** 2026-10-14 14:43 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** `20261014120000_harden_users_rls.sql`, `20261014130000_admin_grade_override_audited.sql`, `20261014140000_rls_live_tables.sql`, `20261014150000_drop_legacy_evaluation_tables.sql` (applied 2026-10-14)

## Files changed
- `supabase/migrations/20261014120000_harden_users_rls.sql`
- `supabase/migrations/20261014130000_admin_grade_override_audited.sql`
- `supabase/migrations/20261014140000_rls_live_tables.sql`
- `supabase/migrations/20261014150000_drop_legacy_evaluation_tables.sql`
- `src/pages/public/ForgotPassword.jsx`
- `src/pages/public/ResetPassword.jsx`
- `src/pages/admin/GradeOverride.jsx`
- `src/pages/faculty/Dashboard.jsx`

## What changed and why

Phase 0 of `docs/03-development/audits/ASPIRE_CONSULTATION_IMPLEMENTATION_PLAN_2026-10-14.md`.

**`public.users` had RLS disabled** since `20260531081149_disable_rls_for_now.sql` and never re-enabled. Because `users.role` is the authorization gate for the whole app, any authenticated account could self-promote with a direct client call. RLS is now on, with a `prevent_self_role_escalation` trigger blocking changes to `role` or `status` by anyone who is not an active admin. SELECT deliberately stays as broad as before, because faculty rosters and notification fan-out read other users' rows; narrowing reads needs roster-scoped policies and is left to its own change.

**The SG correction trigger waived every check for admins** (`enforce_sg_correction_application`, old lines 446-449), so an admin could overwrite a posted, locked grade with no approval and no audit row — the audit trigger only fires when `last_correction_request_id` changes, which that path never set. The blanket bypass is removed. An admin may now act on a correction, but only against an approved request whose proposed values match exactly what is written, the same rule faculty follow. `apply_admin_grade_override` creates that approved request and applies it in one transaction, so the existing audit trigger writes `grade_correction_history` on its own.

**RLS was also off on** `activity_logs`, `student_consultation_requests`, `class_room_join_codes`, `class_join_requests`, `departments`, `sections` and `programs`. All are now enabled with policies written against how the app actually queries them. Activity logs are **admin-only to read** and append-only (UPDATE/DELETE revoked from everyone); the faculty dashboard's "Recent Activity Logs" panel was removed because it was the only non-admin reader.

**Eleven legacy, UI-unreferenced tables were dropped** rather than given policies, since they held synthetic data only.

**Password reset moved from a recovery link to an emailed OTP code.** The pre-send account lookup was removed: it read `public.users` while logged out, which RLS now forbids, and confirming whether an email exists let anyone enumerate accounts. The forgot-password audit entry was dropped for the same reason — it ran unauthenticated, and the ledger only accepts inserts from a signed-in user.

## How to verify
`docs/04-testing/CONSULTATION_REMEDIATION_TEST_GUIDE_2026-10-14.md` §1 (login as all four roles), §2 (OTP reset), §3 (activity logs admin-only), §4 (grade override writes `grade_correction_history`).

Verified on 2026-10-14: migrations applied, all four roles sign in.
