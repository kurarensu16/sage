# Backup and restore

**Status:** Current · **Added:** 2026-10-29
**Migration:** `supabase/migrations/20261029215500_backup_and_restore.sql`
**Page:** Admin → System Maintenance → Backup & Restore (`/admin/backup`)

A full backup of ASPIRE's records, taken from inside the system and restorable
from the same file. This document is the operating procedure; the page itself
carries the short version.

---

## What a backup is

One **encrypted** `.json` file, named `aspire-backup_YYYY-MM-DD_HHMM.json`. Its
body is AES-GCM ciphertext; a small clear-text header stays readable so the
system can check a file before asking for its passphrase. The encrypted body
holds:

- **Every ordinary table in the `public` schema**, with its rows. The table list
  is read from the Postgres catalog at the moment of export, not from a list in
  code, so a table added by a future migration is included without anyone
  remembering to add it.
- **Login identities** from `auth.users` — id, email, creation and confirmation
  timestamps, and user metadata.
- **Profile photo metadata** from `storage.objects` — bucket, path, size, type.

### What it deliberately leaves out

| Not included | Why |
|---|---|
| Password hashes | Decided 2026-10-29: the file must not be an offline cracking target. This does **not** affect signing in — see below. |
| Photo image data | The bytes stay in Supabase Storage, which keeps its own backups. The metadata is recorded so a restore can report which photos are missing rather than losing track of them. |
| `system_settings` | Holds maintenance mode, which gates the restore itself. Restoring it mid-restore could switch maintenance off and let users write into a half-restored database. |
| `backup_runs` | The history of backups and restores must survive a restore. |
| `provisioning_locks` | Ephemeral editing locks with a TTL. A restored lock would strand a college until it lapsed. |

## What a restore does to people's accounts

**Passwords are not affected, and nobody has to reset anything.** A restore
touches only the `public` schema. Login records live in the `auth` schema, which
it never deletes or modifies, so everyone signs in afterwards exactly as before.

Excluding password hashes from the file protects the *file* if it leaks. It has
nothing to do with live logins.

**The consequence that does matter** is anyone whose account was created *after*
the backup was taken. Their login still works, but their profile row — name,
role, section, department — is not in the backup and is therefore gone. They can
authenticate and then find the system does not know who they are.

The restore reports this as *"person records skipped for a missing login"* only
for the opposite case. For accounts newer than the backup, compare the account
list before and after, and re-add them through **Import Users**.

**Restoring into a different Supabase project does not carry people over at
all.** Profile rows are only restored where a matching login already exists, and
a fresh project has none. Treat a backup as a way to move this project backwards
in time, not as a way to move it somewhere else.

---

## The passphrase

Every backup is encrypted with a passphrase you choose. There is no plain-text
option, because a backup holds every student's name, email, ID number and
grades, and the one export that gets made in plain text is the one that ends up
in a shared folder.

**A forgotten passphrase cannot be recovered.** There is no escrow, no reset,
and no back door. The file is simply gone. Because of that:

- The page makes you type the passphrase twice.
- You can save a **reminder** with the file. It is stored unencrypted, so write a
  clue only you would understand, never the passphrase itself.
- Write the passphrase down somewhere that is **not** beside the backup.

Use a phrase of several unrelated words rather than a short complex string. It is
both harder to guess and easier to remember a year later, which is when you will
need it.

### What stays readable without the passphrase

A small clear-text header: when the backup was taken, the fingerprint of the
database structure, the table names and their row counts. Three reasons it is
not encrypted:

1. The page can tell you whether a file fits the current database **before**
   asking for a passphrase. Otherwise a wrong passphrase and an incompatible
   backup look identical.
2. You can see what a file is without being able to read anyone's records.
3. A lost passphrase still leaves you knowing what you lost.

Table names and row counts are structure, not records. No personal data is in
the header.

---

## Keeping backups current as the system changes

A migration that adds a required column makes **every earlier backup
unrestorable**. That is the trap: nothing visibly breaks, and you find out during
an emergency.

So every backup records a fingerprint of the database structure, and the page
compares your newest backup's fingerprint against the live one. When they differ
it says so at the top:

> **Your most recent backup can no longer be restored.** The database structure
> has changed since it was taken…

**Take a new backup after applying any migration.** The page will tell you if you
forget, but the window between the migration and the new backup is a window with
no usable backup in it.

The table list itself needs no maintenance: it is read from the Postgres catalog
at export time, so a table added by a future migration is included automatically.
Two things still need a human:

- **The skip list** (`system_settings`, `backup_runs`, `provisioning_locks`) in
  `aspire_backup_skipped_tables()`. A new settings or ephemeral-lock table should
  be added to it, or a restore will roll those values back too.
- **Foreign-key cycles.** If a migration introduces one, the migration's own
  verification block names the tables and restore refuses. Backup still works.

---

## Taking a backup

1. Sign in as admin and open **System Maintenance → Backup & Restore**.
2. Check the record and table counts look right.
3. Enter a passphrase twice, and optionally a reminder.
4. **Create Backup.** The file is encrypted in the browser and downloads.
5. Store it somewhere that is not the same machine, and store the passphrase
   somewhere that is not beside the file.

No maintenance window is needed. A backup is a read, and it is taken under a
single database snapshot, so the whole file is one consistent moment rather than
forty tables read at forty different times.

Take one **before** every migration, **after** every migration, before every
re-seed, and before any defense demonstration.

---

## Restoring a backup

> **Restore deletes every row of every restored table and replaces them with the
> file's contents.** Anything created after the backup was taken is gone. There
> is no undo. The operation is one transaction, so it either completes or changes
> nothing — but a *successful* restore of the wrong file is not recoverable.

1. **Take a fresh backup first**, even of a database you intend to discard. It is
   the only way back to the current state.
2. **Turn on maintenance mode** (System Maintenance → Maintenance Mode). This is
   required: both a restore and a rehearsal refuse to run without it,
   server-side, not just in the page. It also tells everyone signed in what is
   happening.
3. Open **Backup & Restore** and choose the file. Choosing a file changes
   nothing. The page reads its clear-text header and tells you straight away
   whether it still matches the current database structure.
4. Read the summary: when it was taken, how many records, how many accounts. The
   page also says how many records the restore would discard.
5. Enter the passphrase and **Open and check this backup**. The page then reports:
   - whether the file is **intact** — its own record count against the rows
     actually present, which is how a truncated download is caught;
   - whether it is **restorable** — and if not, exactly which columns block it;
   - any differences that will not stop the restore but will lose something,
     such as a table or column that no longer exists.
6. **Test this backup.** The rehearsal performs the entire restore and then rolls
   it back, so you learn whether it really works without spending the database to
   find out. It takes as long as the real restore. Skipping it is allowed; it
   costs nothing but time.
7. Type `RESTORE` and confirm.
8. Read the result. Note any person records skipped for a missing sign-in
   account, and any table the backup did not contain.
9. **Turn maintenance mode off** — deliberately, after checking the result.
10. Re-add anyone whose account was created after the backup was taken (see below).

### Why it is safe to interrupt

Everything happens in one database transaction. A failure, a closed laptop, or a
dropped connection rolls the whole thing back. There is no half-restored state.

---

## Limits and failure modes

**A backup that no longer fits the database.** If a migration added a required
column after the backup was taken, the restore fails and says the backup does
not fit the current database. Nothing changes. Either use a newer backup, or
restore the old one into a database at the matching migration level.

**Deleted accounts.** A person record whose sign-in account no longer exists is
skipped, and the count is reported. Deleting a login is an audited Admin action,
and a restore silently resurrecting the profile of a deleted account would undo
it. Re-create those accounts through Import Users if they are still needed.

**Size.** Export refuses above 500,000 records in total and says so, rather than
timing out halfway. On the Free plan the 500 MiB database limit will stop you
long before that ceiling does, so treat the **Capacity** panel on Storage Health
as the real constraint.

**Foreign-key cycles.** Tables are restored parents-first, in an order computed
from the foreign keys. If a future migration introduced a cycle, the order cannot
be determined and restore refuses before touching anything — the migration's own
verification block names the tables involved. Backup still works.

---

## Where the data goes through

Everything runs through SECURITY DEFINER RPCs gated on `is_active_admin()`. The
browser holds no service-role key, so there is nothing here a non-admin could
borrow by calling it directly:

| Function | Does |
|---|---|
| `aspire_backup_manifest()` | Lists the tables in scope with row counts |
| `aspire_export_backup(int)` | Returns the whole backup document. **STABLE**, so every table is read under one snapshot |
| `aspire_record_backup_run(…)` | Records an export or a rehearsal, with its fingerprint |
| `aspire_validate_backup(jsonb)` | Read-only check: intact? compatible? No locks |
| `aspire_restore_backup(jsonb, boolean)` | Deletes and refills in one transaction, or rehearses and rolls back |
| `aspire_backup_status()` | Fingerprint drift and age of the newest backup |
| `aspire_capacity_report()` | Storage and database usage against the plan |
| `set_hosting_plan(text,bigint,bigint)` | Records which plan the project is on |
| `aspire_storage_usage()` | Per-bucket totals and orphan counts |
| `aspire_list_orphan_storage_objects(text,int)` | Orphan paths, for removal |
| `aspire_record_storage_cleanup(text,int)` | Records a cleanup in the history |

Three functions are revoked from **every** client role and exist only to be
called by the gated ones above and by the migration's own verification:
`aspire_backup_table_order()` (the dependency order),
`aspire_schema_shape()` / `aspire_schema_fingerprint()` (the structure), and
`aspire_compare_schema_shape(jsonb)` (the difference between a backup's
structure and the current one).

### Why export is STABLE, and why it matters

A `VOLATILE` function takes a fresh snapshot for every statement it runs. Reading
forty tables in forty statements would therefore capture forty different
moments — a class could be saved without the grades posted to it a second later,
and the backup would restore with broken references. A `STABLE` function uses the
calling query's single snapshot for all of its reads, so the export is one
consistent picture.

That is also why the export writes nothing: a `STABLE` function must not. The
history row is written afterwards by `aspire_record_backup_run()`, and a failure
there is reported without discarding a good backup.

The migration's verification block asserts the volatility, because this is a
correctness property rather than a style preference.

### What protects a restore

| Guard | Catches |
|---|---|
| Compatibility check | A backup taken before a migration that added a required column — refused up front, by name |
| Integrity check | A truncated or damaged file, by comparing its declared record count to the rows present |
| Rehearsal | Anything the static checks cannot see, such as a tightened constraint — by doing the whole restore and rolling it back |
| Per-table count verification | A silent partial restore. Each table's restored count must equal the file's, inside the transaction, or everything rolls back |
| Exclusive advisory lock | Two admins restoring at once, where the second would quietly overwrite the first |
| Maintenance-mode gate | Anyone writing into a table that has been emptied but not yet refilled |
| Fingerprint drift warning | A backup that has silently become unrestorable since it was taken |

---

## Capacity, and the Free plan

The **Storage Health** page reports two numbers against your plan's limits:

| Measured | What it covers |
|---|---|
| File storage | Everything in Supabase Storage buckets — profile photos today |
| Database | All records, indexes, and sign-in accounts |

**Which tier a project is on cannot be detected.** Supabase exposes that only
through its Management API, which needs a Personal Access Token — a full-account
credential, deliberately not added here to read two numbers. So the tier is the
one thing the system has to be told, and it is told once: the project is seeded
on **Free**, and the Capacity panel offers the other tiers as a choice.

Each tier's limits live in the `hosting_plan_tiers` table rather than in the
page, so nobody types a byte count and a change to Supabase's published figures
is one `UPDATE` rather than a code change. A project on non-standard terms can
store explicit overrides, which win over the tier's figures.

**On the Free plan the database limit is the one to watch.** 500 MiB is tight:
grades, activity scores, notifications and audit logs grow continuously, while
profile photos are capped at 2 MB each and one per person. The meter turns amber
at 75% and red at 90%.

Two things the panel cannot show, because Supabase does not expose them to SQL:
monthly egress (5 GB on Free) and the project's pause-after-inactivity state. Use
the Supabase dashboard for those.

---

## Storage cleanup

The same page's sibling, **Storage Health**, reports the `avatars` bucket's usage
and counts files belonging to accounts that no longer exist. Removing them goes
through the Storage API, not a `DELETE` on `storage.objects`: deleting the row
alone would leave the image in the bucket forever, because the bytes live outside
the database.

The `avatars_admin_delete_orphans` policy permits an admin to delete **only**
paths whose owning account is gone. The owner-only policy for everyone else is
unchanged, so this is a narrow cleanup path rather than a general admin override.

---

## Related

- [`RESET_TRANSACTIONAL_DATA.md`](RESET_TRANSACTIONAL_DATA.md) — clearing mock
  data while keeping users and the catalog. Use that to get a clean slate; use a
  backup to get a specific past state back.
- [`../../04-testing/page-checklists/ADMIN_PORTAL.md`](../../04-testing/page-checklists/ADMIN_PORTAL.md)
  — the `ADM-BACKUP` and `ADM-STORAGE` test cases.
