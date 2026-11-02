# Pre-apply migration fixes, and automatic plan limits

- **Date:** 2026-10-29 22:41 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix, plus one approved change to an unapplied migration
- **Migrations:** `20261029093613` and `20261029215500` — both **edited in place**, neither applied

## Files changed

- `supabase/migrations/20261029093613_faculty_loading_and_provisioning.sql`
- `supabase/migrations/20261029215500_backup_and_restore.sql`
- `src/lib/backupService.js`
- `src/pages/admin/StorageHealth.jsx`
- `docs/05-operations/database/BACKUP_AND_RESTORE.md`
- `docs/04-testing/page-checklists/ADMIN_PORTAL.md`

## Two defects found by a pre-apply check

The owner asked for confirmation before running the four pending migrations. A
structural check of all four found two problems, both of which would have bitten
on first run.

### 1. A syntax error that would have aborted Phase 4

`20261029093613` line 621 ended `finalize_faculty_load_draft` with `$;` instead
of `$$;`. The function body was never closed, so the parser would have run on
into the next `CREATE FUNCTION` and failed. Found by counting dollar-quote
openers against closers across all four files — 14 against 13 in that one file.

This had been in the file since it was written earlier in the session; it was
never caught because the file had never been balance-checked. It would have been
caught by running the migration, which is exactly what the owner was about to do.

### 2. A foreign-key cycle that would have made backup useless

`posted_grades` and `remark_override_requests` reference each other:

- `remark_override_requests.posted_grade_id` → `posted_grades` (`ON DELETE RESTRICT`)
- `posted_grades.last_correction_request_id` → `remark_override_requests` (`ON DELETE SET NULL`)

Both are correct. But a cycle has no parents-first ordering, so
`aspire_backup_table_order()` could place neither table. The consequences would
have been: the migration's verification block raising, `aspire_backup_manifest()`
raising, the Backup & Restore page erroring on load, and **export failing
outright**. The feature would not have worked at all.

Fixed by making the `ON DELETE SET NULL` side `DEFERRABLE INITIALLY IMMEDIATE`
and excluding deferrable foreign keys from the dependency graph. Day-to-day
behaviour is unchanged — `INITIALLY IMMEDIATE` still checks after every
statement — but the restore can now `SET CONSTRAINTS ALL DEFERRED` and refill
those two tables in either order.

It had to be that side: `ON DELETE RESTRICT` cannot be deferred.

**A follow-on gap, found while fixing it:** a deferred constraint is checked at
commit, and a rehearsal never reaches one — so a rehearsal would have passed a
backup with broken references. The restore now issues
`SET CONSTRAINTS ALL IMMEDIATE` at the end of its work block, forcing the check
while still inside the transaction. That also turns a commit-time failure in a
real restore into one raised where it can be reported properly.

## Plan limits are now automatic

The owner asked for the hosting plan to be set automatically rather than typed,
noting the project is on the Free tier.

**What is genuinely not possible:** detecting which tier a project is on.
Supabase exposes that only through its Management API, which requires a Personal
Access Token — a full-account credential. Not worth adding to read two numbers,
and said plainly on the page rather than hidden.

**What is now automatic:** the limits themselves. A new `hosting_plan_tiers`
table holds Supabase's published figures (Free, Pro, Team, plus Custom), and
`system_settings.hosting_plan_tier` records which one this project is on —
seeded to `free`. The Capacity panel shows the tier's limits immediately, with no
setup, and changing plan is a choice between named tiers rather than three number
fields. Explicit per-project overrides remain for non-standard terms.

Keeping the tiers in a table rather than in the page means a change to Supabase's
published limits is one `UPDATE`, not a code change — and it keeps vendor figures
out of the JSX, consistent with how the rest of this system treats reference data.

`set_capacity_plan()` was replaced by `set_hosting_plan()`. Nothing had been
applied, so there is no deployed caller to migrate.

## How to verify

- `ADMIN_PORTAL.md` → `ADM-STORAGE`, Capacity panel cases: opens on Free with no
  setup, tiers apply immediately, Custom falls back honestly.
- The migration's own verification block now asserts that a tier **with limits**
  is selected, so a project cannot silently end up with nothing to measure
  against.
- Dollar-quote balance across all four pending migrations is even: 4/4, 15/15,
  6/6, 20/20.
