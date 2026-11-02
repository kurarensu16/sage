# Backup & Restore, and Supabase Storage usage on the Admin portal

- **Date:** 2026-10-29 22:00 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** `20261029215500_backup_and_restore.sql` (to apply)

## Files changed

- `supabase/migrations/20261029215500_backup_and_restore.sql` *(new)*
- `src/lib/backupService.js` *(new)*
- `src/pages/admin/BackupAndRestore.jsx` *(new)*
- `src/pages/admin/StorageHealth.jsx`
- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/components/layout/BottomNav.jsx`
- `docs/05-operations/database/BACKUP_AND_RESTORE.md` *(new)*
- `docs/04-testing/page-checklists/ADMIN_PORTAL.md`
- `docs/README.md`

## What changed and why

Requested by the owner: Supabase Storage visibility on the Admin portal, plus
backup and restore, with the explicit requirement that *"it needs to backup
everything and what used to backup will be used to restore"* — one file, round
trip.

### Backup and restore

A full export of every ordinary `public` table, discovered **from the Postgres
catalog rather than a list in code**, so a table added by a future migration is
included without anyone remembering to add it. Plus login identities and photo
metadata. One `.json` file; the same file restores.

**Password hashes are excluded, by the owner's decision.** The alternative —
a complete round trip including `encrypted_password` — would have made every
downloaded backup an offline cracking target sitting in a Downloads folder. After
a restore, accounts exist and sign in through the password reset flow.

Restore is the most destructive action in the system, so it is deliberately slow:
maintenance mode must already be on (enforced **server-side**, not just by a
disabled button), the chosen file is summarised locally before anything is sent,
and the admin types `RESTORE`. It runs as one transaction — it completes or
changes nothing.

Three tables are excluded on purpose: `system_settings` (holds the maintenance
mode that gates the restore), `backup_runs` (the history of restores must survive
a restore), and `provisioning_locks` (a restored lock would strand a college).

### Supabase Storage panel

Storage Health covered only Cloudflare R2, which is not in use yet, and said
nothing about the `avatars` bucket where profile photos actually live. It now
reports usage per bucket and, more usefully, counts files belonging to accounts
that no longer exist. That orphan count is the only number on the page that asks
for a decision.

## Decisions worth recording

**No edge function, no service-role key.** Everything runs through SECURITY
DEFINER RPCs gated on `is_active_admin()`, so the admin's own JWT is the only
credential in play. An edge function would have needed the service-role key for
the same result, with a far larger blast radius.

**Orphan removal goes through the Storage API, not a row delete.** Deleting a
`storage.objects` row would leave the actual image in the bucket forever, because
the bytes live outside the database. The new `avatars_admin_delete_orphans`
policy permits an admin to delete **only** paths whose owning account is gone;
the owner-only policy for everyone else is unchanged.

**The orphan test is a SECURITY DEFINER function, not an inline subquery.** An
inline `NOT EXISTS` over `public.users` inside the delete policy would run under
the caller's RLS, so any policy that hid a users row would make that user's live
avatar look like an orphan — and the policy would then permit deleting it.
`aspire_is_orphan_storage_path()` reads the table definitively, which is the
difference between "no such account" and "cannot see that account".

### Two defects caught before the migration was handed over

1. **The verification block called its own admin-gated function.**
   `is_active_admin()` resolves `auth.uid()`, which is NULL in the SQL editor, so
   running the migration would have failed its own verification for entirely the
   wrong reason. The ordering logic now lives in an ungated internal function
   (`aspire_backup_table_order()`, revoked from every client role) that
   verification can exercise, with the gated public function delegating to it.

2. **The first draft deleted `storage.objects` rows directly**, which would have
   orphaned the image files permanently. Replaced with list-then-remove through
   the Storage API.

## Limits, documented rather than hidden

- Export refuses above 500,000 records and says so, rather than timing out
  halfway.
- A backup taken before a schema-changing migration cannot be restored into the
  newer schema; the page says that in plain English instead of the generic
  "Something required was left blank" that the error code would otherwise map to.
- A profile row whose sign-in account was deleted is skipped and counted, because
  deleting a login is an audited Admin action that a restore must not silently
  undo.
- A foreign-key cycle introduced by a future migration makes restore refuse
  before touching anything; the migration's verification block names the tables.

## How to verify

- `ADMIN_PORTAL.md`: `ADM-BACKUP` (backup, restore gates, restore outcome,
  failure behaviour) and the amended `ADM-STORAGE` (Supabase Storage panel).
- The two cases that matter most: search a downloaded backup for
  `encrypted_password` and `$2a$`/`$2b$` — both must be absent; and confirm a
  removed orphan is really gone from the Supabase Storage browser, not just from
  the table.
- Procedure: [`docs/05-operations/database/BACKUP_AND_RESTORE.md`](../../database/BACKUP_AND_RESTORE.md)
