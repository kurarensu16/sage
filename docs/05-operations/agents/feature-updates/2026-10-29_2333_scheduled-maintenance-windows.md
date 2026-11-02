# Scheduled maintenance windows, and two silent-failure fixes

- **Date:** 2026-10-29 23:33 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow), plus two Fixes
- **Migration:** `20261029230608_scheduled_maintenance_windows.sql` (to apply)

## Files changed

- `supabase/migrations/20261029230608_scheduled_maintenance_windows.sql` *(new)*
- `src/lib/maintenanceService.js` *(new)*
- `src/lib/MaintenanceContext.jsx`
- `src/pages/admin/MaintenanceMode.jsx`
- `src/pages/admin/BackupAndRestore.jsx`
- `src/pages/admin/StorageHealth.jsx`
- `src/pages/admin/SystemHealth.jsx`
- `src/pages/faculty/Dashboard.jsx`

## What the owner asked for

A date range and time, a predefined message, and an optional note — so that
opening a maintenance window does not mean retyping everything, every time.
Then, during the build: make the reason a cascading dropdown rather than a grid,
and add ready-made sentences for the note.

## What was built

Maintenance mode was a boolean plus a message typed from memory. It is now a
window:

| Piece | How it is set |
|---|---|
| Reason | Two dropdowns — category, then the specific reason |
| Mode | **Manual** (the switch decides) or **Scheduled** (the clock decides) |
| Window | Start and end, or just "expected back by" in manual mode |
| Note | Ready-made sentences from a dropdown, plus free text if needed |

Nothing has to be typed for a routine window.

Ten reasons across the three categories the owner chose (routine, academic,
unplanned) and seven note presets live in `maintenance_reasons` and
`maintenance_note_presets` — data, not lists in the page, so the wording can be
corrected without a release. The same reasoning as the hosting plan tiers.

### The asymmetry that matters

**The manual switch can only ever force maintenance ON. The clock can only ever
add a window. Neither turns the other off.**

That is deliberate. The dangerous direction is the system re-opening while work
is still running — a restore that started at 9:55 and overruns a 10 PM end time.
Once a person has said "stay closed", only a person re-opens it. The page says so
where Scheduled is chosen, and recommends Manual for restores.

### One source of truth

`is_maintenance_active()` is now the only thing that answers "is the system
closed". The banner, the maintenance screen and **the restore gate** all call it.

This mattered more than it looks: the restore gate read
`system_settings.maintenance_mode` directly. With a clock-driven window, an
automatic window would have satisfied the banner and not the gate — the admin
would see the system closed and still be refused a restore. The gate is the one
protecting a destructive operation, so it cannot have its own opinion.

The message is composed by one function too, and the admin page previews through
that same function. A preview built in JavaScript would eventually have drifted,
and the admin would approve one wording while users saw another.

### No background job

Nothing is scheduled. "Active" is computed from the clock when asked, so there is
no cron to install, nothing to drift, and nothing to fail silently overnight.

The context had to change for this: it previously applied the Realtime payload
directly, but an automatic window opens because the clock passed a time, **not
because any row changed**. It now re-reads through the function on both the poll
and the subscription.

## Two silent failures found while building

Both were mine, both from this session, and both failed quietly — which is why
they survived until something unrelated exposed them.

### 1. `logActivity` was being called with an object

Its real signature is positional: `logActivity(action, message, actor)`. Four
call sites passed an object instead, so `action` received the object, `message`
received `undefined`, and the actor defaulted to `System`. `logActivity` only
`console.warn`s on failure, so the writes failed with nothing on screen.

Fixed in `BackupAndRestore.jsx` (×2), `StorageHealth.jsx`, and
`faculty/Dashboard.jsx` — the last pre-dating this session, in the retired
consultation panel.

### 2. The restore wrote its audit entry to a table that does not exist

`20261029215500` — already applied — inserts into `public.audit_logs`. This
project's audit table is `public.activity_logs`. The insert is wrapped in
`EXCEPTION WHEN OTHERS` precisely so a logging failure cannot roll back a
successful restore, which meant the wrong table name produced no symptom at all.

**The previous change record for that migration claims this entry is written. It
is not, until this migration is applied.** This record is the correction; per
`AGENTS.md` §4 the earlier record stands unedited.

Repaired here by patching the deployed function from its live definition, with
the substitution count asserted, and the verification block now fails if
`audit_logs` still appears in the body.

## Also in this batch

- **Full-width layout.** `SystemHealth`, `StorageHealth` and `MaintenanceMode`
  carried `max-w-3xl`/`max-w-4xl` while Audit Logs, Manage Users, Import Users,
  Student Account Requests, Backup & Restore and the Dashboard do not. Removed,
  so the Admin portal is consistent. `UserForm` keeps its centred `max-w-2xl` —
  that one is a form, not a dashboard, and reads better narrow.
- **Restore outcome modal.** A restore or a rehearsal now ends in a modal that
  has to be dismissed, showing records restored, tables, any person records
  skipped for a missing login, and the two things to do next. The inline panel
  stays as the record; the modal exists because the numbers matter most at the
  moment they are easiest to scroll past.
- **Storage copy.** "1 file … belong" now agrees in number, and the Supabase
  Storage description no longer claims the project has only an `avatars` bucket —
  the live project also has `app-releases`.

## How to verify

- Apply `20261029230608`. Expect two notices: the restore-gate patch, then
  `Scheduled maintenance windows verified. 10 reason(s) available.`
- Manual window: pick a category and reason, leave Scheduled off, start it.
  Confirm the preview matches what a non-admin sees.
- Scheduled window: set a start two minutes out and an end ten minutes out.
  Confirm the system closes on its own, and reopens at the end **without anyone
  pressing anything**.
- The asymmetry: during a scheduled window, press the switch. Confirm the end
  time passes and the system stays closed.
- The gate: with an automatic window active, confirm a restore is allowed — it
  would have been refused before this migration.
- Note presets: add two from the dropdown, remove one with its chip, confirm the
  preview updates and the remaining text is intact.
