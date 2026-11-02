# Restore refused by Supabase's safeupdate guard — fixed

- **Date:** 2026-10-30 00:04 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** `20261029230608_scheduled_maintenance_windows.sql` — edited in place; its patch block now applies three independent repairs and is safe to re-run

## Files changed

- `supabase/migrations/20261029230608_scheduled_maintenance_windows.sql`

## What happened

The first real restore failed:

```
POST /rest/v1/rpc/aspire_restore_backup 400
{code: '21000', message: 'DELETE requires a WHERE clause'}
```

Supabase loads **pg-safeupdate**, which refuses any `DELETE` or `UPDATE` without
a qualification — SQLSTATE 21000, `ERRCODE_CARDINALITY_VIOLATION`. The restore
empties each table with a bare `DELETE FROM public.<table>`, which is precisely
the shape that guard exists to stop.

**Nothing was damaged.** The restore is one transaction and it aborted at the
first delete, before writing anything.

This was not findable by inspection: the migration applied cleanly, its
verification passed, and `aspire_validate_backup` and the schema checks all
reported the backup as restorable. Only an actual restore reaches the delete.

## The fix, and the obvious version of it that does not work

`WHERE TRUE` looks like the answer and is wrong. PostgreSQL folds a
constant-true qualification away during planning, so the executed plan carries
no qualification and pg-safeupdate — which inspects the plan, not the parse tree
— refuses it exactly as before. It would have appeared to work right up until
the next real restore.

The delete is now:

```sql
DELETE FROM public.<table> WHERE ctid <> '(0,0)'::tid
```

`ctid` is a column reference, not a constant, so the comparison cannot be folded
and survives into the plan as a real qualification. It matches every row,
because item offsets within a page begin at 1 — no live tuple ever has
ctid `(0,0)`. The guard is satisfied and the set of deleted rows is unchanged.

`TRUNCATE` would also satisfy the guard but is the wrong tool: it cannot take
part in the deferred foreign-key handling this restore depends on, and the
`ON DELETE RESTRICT` keys would force a `CASCADE` reaching further than intended.

## Hardening that came with it

- **The patch block now applies its three repairs independently** — qualified
  deletes, the shared maintenance check, and the audit entry to `activity_logs` —
  each guarded by its own test. It is therefore correct whether the migration is
  applied for the first time or re-run after an earlier version of it, which
  matters here because an earlier version may already be applied.
- **A verification assertion** now fails if the deployed function still contains
  an unqualified delete. The three assertions on this function together mean a
  regression in any of them aborts the migration rather than surfacing during an
  emergency restore.

## What this says about the testing

`ADM-BACKUP`'s rehearsal case is the one that would have caught this, because a
rehearsal executes the same deletes. It was written but not yet run — the
rehearsal is gated on maintenance mode, and maintenance mode was off. Worth
running the rehearsal before relying on a backup, which is what that case exists
for.

## How to verify

Re-run `20261029230608`. Expect:

```
aspire_restore_backup patched: qualified deletes, shared maintenance check, audit entry to activity_logs.
Scheduled maintenance windows verified. 10 reason(s) available.
```

Then, with maintenance mode on, run **Test this backup**. It performs every
delete and insert and rolls back, so it proves the fix without committing
anything.
