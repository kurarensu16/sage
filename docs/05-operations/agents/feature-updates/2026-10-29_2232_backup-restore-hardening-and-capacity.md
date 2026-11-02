# Backup & Restore hardening, encryption, and capacity reporting

- **Date:** 2026-10-29 22:32 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** `20261029215500_backup_and_restore.sql` — **edited in place**, not yet applied

## Files changed

- `supabase/migrations/20261029215500_backup_and_restore.sql`
- `src/lib/backupCrypto.js` *(new)*
- `src/lib/backupService.js`
- `src/pages/admin/BackupAndRestore.jsx`
- `src/pages/admin/StorageHealth.jsx`
- `docs/05-operations/database/BACKUP_AND_RESTORE.md`
- `docs/04-testing/page-checklists/ADMIN_PORTAL.md`

**The migration was edited rather than patched by a follow-up.** It has not been
applied anywhere, so there is nothing to migrate from. A second migration would
have left the first one's weaker definitions in the history for no benefit.
Anyone who applied the earlier draft should re-run this file; the one-argument
`aspire_restore_backup(jsonb)` is dropped explicitly for that case.

## Why this round happened

The owner asked how backup and restore could be improved. The honest answer was
that **you could not find out whether a backup worked without destroying the
database to try it.** Everything below follows from that, plus two requests made
while building: show storage usage against the hosting plan, and keep the backup
in step with Supabase schema changes.

## What changed

### 1. Rehearsal — the main gap

`aspire_restore_backup(payload, p_rehearse)` performs the entire restore and then
deliberately rolls it back, reporting what would have happened. The rollback uses
a PL/pgSQL block with an `EXCEPTION` clause, which gives it its own
subtransaction; the report is carried out through the exception message because
that is the one channel certain to survive the rollback.

It still requires maintenance mode. A rehearsal empties and refills every table,
which holds locks on all of them — a "harmless" test would stall every user.

### 2. Compatibility, checked before anything is touched

Every backup now records a fingerprint **and a full description** of the database
structure (`aspire_schema_shape()`). At restore time
`aspire_compare_schema_shape()` diffs the two and classifies each difference.
A column that is now required and absent from the backup is **blocking** and the
restore refuses up front, naming the table and column. Previously that failed
mid-restore with a column error.

Migration *version* would have been the obvious thing to record instead, but this
project's migrations are applied by hand in the SQL editor, so
`supabase_migrations.schema_migrations` is not populated and cannot be trusted.
The catalog is the only reliable witness — and it describes the difference in
terms a person can act on.

### 3. Drift detection, so nobody has to remember

`aspire_backup_status()` compares the newest backup's fingerprint to the live
one. When they differ the page says *"Your most recent backup can no longer be
restored"*. This is the owner's request — "update the backup and restore every
time changes happen on the Supabase" — turned into something the system reports
rather than a rule someone follows.

The table list already needed no maintenance, being read from the catalog. Two
things still need a human, and are now documented: the skip list, and
foreign-key cycles.

### 4. Integrity and partial-restore guards

- The backup's declared record count is checked against the rows actually
  present. A truncated download is caught before a restore, not during one.
- Inside the restore transaction, **each table's restored count must equal the
  file's**, or everything rolls back. A silent partial restore is worse than a
  failed one, because it looks like success.

### 5. An exclusive lock

`pg_try_advisory_xact_lock` on the restore. Two admins restoring different files
would previously have serialised on row locks, and the second would have quietly
overwritten the first — both reporting success.

### 6. Encryption, always

Owner's decision: **no plain-text option.** AES-GCM with a PBKDF2-SHA256 key
(600,000 iterations), through the browser's own Web Crypto — no new dependency, so
the backup format does not depend on a CDN staying up.

A small **clear-text header** is kept deliberately: format version, when it was
taken, the structure fingerprint, table names and row counts. Three reasons, all
of which the page depends on:

1. An incompatible file can be identified **before** the passphrase is asked for.
   Otherwise a wrong passphrase and an unrestorable backup look identical.
2. You can see what a file is without being able to read anyone's records.
3. A lost passphrase still leaves you knowing what you lost.

No personal data is in the header. Table names and row counts are structure.

The page makes the passphrase be typed twice, offers an optional reminder stored
in the clear, and states plainly that a forgotten passphrase cannot be recovered.

### 7. Capacity against the hosting plan

New **Capacity** panel on Storage Health: file storage and database size against
the plan's limits, amber at 75%, red at 90%. The limits cannot be read from SQL —
nothing in the catalog knows which Supabase tier a project is on — so they are
stored in `system_settings` and editable on the page.

Seeded with the **Supabase Free** tier (1 GiB storage, 500 MiB database), the plan
this project is on as stated by the owner. The seed uses `COALESCE` so re-running
the migration cannot overwrite a corrected limit.

Worth recording: on Free the **500 MiB database limit binds long before** the
1 GiB of file storage, because grades, activity scores and audit logs grow
continuously while photos are capped at 2 MB each, one per person. The export's
500,000-row ceiling is irrelevant by comparison.

## A correctness bug found while hardening

**The export was reading each table under a different snapshot.** A `VOLATILE`
PL/pgSQL function takes a fresh snapshot per statement under READ COMMITTED, so
reading forty tables in forty statements captured forty different moments — a
class could have been saved without the grades posted to it a second later, and
the backup would have restored with broken references. Silent, intermittent, and
only visible after a restore.

Fixed by declaring `aspire_export_backup` **STABLE**, which makes all of its
reads use the calling query's single snapshot. That required moving the audit
write out into `aspire_record_backup_run()`, because a STABLE function must not
write. The migration's verification block now **asserts the volatility**, since
this is a correctness property rather than a style preference.

## Two record-variable guards

`SELECT … INTO` a `RECORD` that matched no row makes field access an error.
`aspire_backup_status()` now returns early via `IF NOT FOUND` — "no backup has
ever been taken" is the normal state on day one — and
`aspire_capacity_report()` raises a message naming the missing migration rather
than failing on a NULL field.

## Not done, and why

**Staging-schema restore** (loading a backup into a separate read-only schema so
one class's grades can be copied out) was offered and not chosen. It remains the
right answer for a surgical recovery, as opposed to rolling the whole institution
back, and is worth revisiting if a real incident ever calls for it.

## How to verify

- `ADMIN_PORTAL.md`: `ADM-BACKUP`, now covering the passphrase, the integrity and
  compatibility checks, the rehearsal, concurrency, and schema drift; and
  `ADM-STORAGE`, now covering the Capacity panel.
- The cases that matter most:
  - search a downloaded backup for a student's surname and for
    `@student.sage.edu` — both must be absent, since everything but the header is
    ciphertext;
  - run **Test this backup**, then confirm the live record counts are unchanged;
  - take a backup, apply a migration, reload — the drift banner must appear.
- Procedure: [`docs/05-operations/database/BACKUP_AND_RESTORE.md`](../../database/BACKUP_AND_RESTORE.md)
