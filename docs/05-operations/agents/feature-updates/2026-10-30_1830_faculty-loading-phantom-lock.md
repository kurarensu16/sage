# Faculty loading: "another user is editing" when nobody was

- **Date:** 2026-10-30 18:30 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migrations:** `20261030182715_fix_loading_notification_conflict.sql` — **not yet applied**

Opening **any** college in Faculty Loading & Provisioning showed *"Another user is
editing this college"* while no other session existed. It affects the **Registrar
and the Dean alike** — both portals render the same `FacultyLoadingWorkspace` and
call the same RPC.

## Files changed

- `supabase/migrations/20261030182715_fix_loading_notification_conflict.sql`
- `src/components/provisioning/FacultyLoadingWorkspace.jsx`

## The actual cause

`acquire_provisioning_lock()` succeeded, then called
`notify_loading_session_started()`, which raised:

```
42P10  there is no unique or exclusion constraint matching the
       ON CONFLICT specification
```

`notifications.dedupe_key` is covered by a **partial** unique index:

```sql
CREATE UNIQUE INDEX notifications_dedupe ON public.notifications
  USING btree (dedupe_key) WHERE (dedupe_key IS NOT NULL)
```

PostgreSQL infers a partial index for `ON CONFLICT` **only when the clause
carries a predicate matching the index's own**. Ten other migrations in this
project write it correctly:

```sql
ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
```

`20261029093613` omitted the `WHERE` in **four places across two functions** —
`notify_loading_session_started` and `notify_load_finalized`. The index is
present and healthy; the statement simply never referred to it.

Because the notification ran inside the same transaction as the lock, the whole
acquire rolled back.

## Two wrong hypotheses, and what stopped them

The first guess was a missing primary key on `provisioning_locks`; the second, a
missing dedupe index. The owner's catalog queries showed the PK exists and the
index exists and matches exactly. Both would have produced a migration that
changed the wrong thing and left the bug in place. **Grepping the migrations
could not have settled either question** — `provisioning_locks` and
`notifications` have constraints that predate version control.

## The UI half

The banner was reading a two-state lock as if it were binary:

```js
const [lock, setLock] = useState({ acquired: false, holderName: '' });
// ... "not acquired" rendered as "somebody else has it"
```

A failed acquire is not the same as a lost race. It is now tri-state:

```js
const [lock, setLock] = useState({ status: 'pending', holderName: '' });
// pending — not asked yet, or the attempt failed; say nothing
// mine    — this session holds it
// theirs  — somebody else holds it; THIS is when the banner is true
```

So any future acquire failure surfaces as the real error rather than as a
colleague who isn't there.

## How to verify

1. Apply `20261030182715`. Its verification block does not merely grep the
   patched source — it **executes** a probe insert carrying the new clause and
   rolls it back through a custom `ASPRB` error code. A read-only check is what
   let this ship broken in the first place.
2. As **registrar**, open each college in Faculty Loading. The banner must not
   appear, and the steps must be editable.
3. As **dean**, open your own college. Same.
4. Open the same college in two browsers. The second must now say another user
   is editing — the banner should still work when it is true.

> **Note:** the Dean's scoping through `can_load_faculty_for_department()` has
> never actually been exercised, because it runs *after* the notification that
> was failing. Worth a deliberate look during QA.

`npm run lint` 0 errors / 48 warnings (unchanged) · `npm run build` clean.
