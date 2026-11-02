# Restore blocked by skipped-table references, and a wrong claim about passwords

- **Date:** 2026-10-30 00:12 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix, plus a correction to earlier records
- **Migration:** `20261029235313_restore_skipped_table_references.sql` (to apply)

## Files changed

- `supabase/migrations/20261029235313_restore_skipped_table_references.sql` *(new)*
- `src/lib/backupService.js`
- `src/pages/admin/BackupAndRestore.jsx`
- `docs/05-operations/database/BACKUP_AND_RESTORE.md`
- `docs/04-testing/page-checklists/ADMIN_PORTAL.md`

## The failure

With the `safeupdate` fix in place, the restore reached its delete phase and
failed with `23503` — PostgREST reported `409 Conflict`.

Tables in the skip list are never emptied, which is their purpose. But three of
them hold foreign keys **into** tables a restore empties, and those references
stay live while the targets are deleted:

| Reference | Action | Effect |
|---|---|---|
| `backup_runs.performed_by` → `users` | NO ACTION | **blocks** |
| `provisioning_locks.locked_by` → `users` | NO ACTION, NOT NULL | **blocks** |
| `system_settings.updated_by` → `users` | NO ACTION | **blocks** |
| `system_settings.hosting_plan_tier` → `hosting_plan_tiers` | NO ACTION | **blocks** |
| `system_settings.maintenance_reason_id` → `maintenance_reasons` | NO ACTION | **blocks** |
| `provisioning_locks.department_id` → `departments` | CASCADE | fine |

Every backup writes a `backup_runs` row, so by the time anyone attempts a
restore, failure was guaranteed. The owner's catalog query produced this list
and settled it in one step.

## How each is resolved

- **Reference data joins the skip list.** `hosting_plan_tiers`,
  `maintenance_reasons` and `maintenance_note_presets` are seeded by migrations,
  not entered by anyone. Restoring them from an older backup would replace
  current definitions with stale ones — reverting plan limits to whatever they
  were months ago — so skipping them is more correct regardless of this bug.
  Skipped-to-skipped references never conflict.
- **Editing locks are emptied by the restore.** A restore ends every editing
  session by definition, and the rows carry a TTL anyway. This also releases
  `locked_by`, which is `NOT NULL` and so could not simply be nulled.
- **Actor columns become `ON DELETE SET NULL`**, and the restore saves their
  values and reattaches them afterwards for everyone the backup still contains,
  so the record of who performed each past backup survives.

`ON DELETE SET NULL` fixes a separate live defect: without it, an admin who had
ever taken a backup could **never be deleted**, because `backup_runs` refused it.

## The function is now stated in full rather than patched again

`aspire_restore_backup` had been patched three times from its live definition.
Each patch was sound, but stacking string substitutions on the most destructive
function in the system makes it progressively harder to know what is deployed.
This migration writes the whole function once, with every fix already in it:
qualified deletes, the shared maintenance check, the audit entry to
`activity_logs`, and the handling above. Verification asserts all three earlier
fixes are still present in the body it just wrote.

## The assertion this migration exists for

Any foreign key from a skipped table into a restored one blocks the delete
phase, and **nothing before an actual restore reveals it** — the migration
applies, the compatibility and integrity checks pass, and the first symptom is a
failed restore. Verification now fails at migration time if a sixth such
reference appears that is not already handled by a cascade, a set-null, or by
being cleared in the restore.

## A wrong claim, corrected

**Earlier records, the page, and the operations doc all said users must reset
their password after a restore. That is false.**

A restore touches only the `public` schema. Login records live in `auth`, which
it never deletes or modifies, so everyone signs in afterwards with the password
they already had. Excluding password hashes from the backup file protects the
*file* if it leaks; it has nothing to do with live logins. The error was mine,
repeated across seven places, and is corrected in all of them.

**The consequence that does matter, and was obscured by the wrong one:** anyone
whose account was created *after* the backup keeps their login but loses their
profile row. They can authenticate and then find the system does not know who
they are. That is now what the page, the doc and the checklist say, with
re-adding them through Import Users as the remedy.

Per `AGENTS.md` §4 the earlier records stand unedited; this is the correction.

## How to verify

Apply `20261029235313`. Expect:

```
Restore now releases skipped-table references. Backup set is N table(s).
```

Note `N` drops by three, since the reference tables leave the backup set. **That
changes the schema fingerprint, so existing backups will read as drifted — take
a fresh one.** Older backups still restore; the three reference tables simply
report as no longer in the backup set and are left alone.

Then, with maintenance mode on, **Test this backup**. The rehearsal performs
every delete and insert and rolls back, so it proves the whole chain without
committing. New checklist cases in `ADM-BACKUP` cover signing in afterwards,
accounts newer than the backup, cleared editing locks, and preserved actors.
