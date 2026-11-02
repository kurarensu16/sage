# Maintenance Mode, System Health, and R2 storage groundwork (Phase 2)

- **Date:** 2026-10-29 05:37 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** `20261029052220_system_settings_maintenance_mode.sql` (to apply, after the three Phase 1 migrations)

## Files changed

New:
- `supabase/migrations/20261029052220_system_settings_maintenance_mode.sql`
- `src/lib/MaintenanceContext.jsx`
- `src/components/layout/MaintenanceScreen.jsx`
- `src/components/layout/MaintenanceNotice.jsx`
- `src/pages/admin/MaintenanceMode.jsx`
- `src/pages/admin/SystemHealth.jsx`
- `src/pages/admin/StorageHealth.jsx`
- `supabase/functions/_shared/r2.ts`
- `supabase/functions/r2-health/index.ts`
- `docs/05-operations/storage/R2_SETUP.md`

Edited:
- `src/App.jsx`
- `src/components/layout/MainLayout.jsx`
- `src/components/layout/Sidebar.jsx`
- `docs/04-testing/page-checklists/ADMIN_PORTAL.md`
- `docs/04-testing/page-checklists/SHARED_NAVIGATION.md`
- `docs/04-testing/page-checklists/README.md`
- `docs/README.md`

## What changed and why

Phase 2 of the post-defense build: maintenance mode, a connection-health view,
and the groundwork R2 needs before Phase 6 uses it.

### The one genuinely subtle piece: active session versus new login

The confirmed behaviour is a soft cutover — people already working keep working
and get a notice, while someone signing in during the window gets a dedicated
screen. Those are **different outcomes from the same flag value**, so the flag
alone cannot decide between them.

What distinguishes them is *when* the session learned about it. `MaintenanceContext`
latches the state it saw on its **first** successful read: already on at first
read means a new arrival, so block; flipped on later means an active session, so
notify only. The latch is deliberately never recomputed — without it, any
unrelated re-render would re-evaluate the flag and eject someone mid-task, which
is precisely the interruption the soft cutover exists to avoid.

Two safety properties worth noting. A **failed read does not block anyone**: an
unreachable database is an outage to surface elsewhere, never an assertion that
maintenance is on. And **admin is exempt**, because whoever is performing the
maintenance has to stay able to reach the toggle that ends it.

The notice is both pieces the developer specified: a one-time dismissible toast
on the `false → true` transition *and* a persistent top banner for the duration.
The banner clears silently when maintenance ends mid-session — turning it off
raises no notice of its own, per the confirmed decision.

Transport reuses the pattern already proven in `AuthContext.jsx`: a Realtime
`postgres_changes` subscription plus a 4-second polling fallback. The migration
also registers `system_settings` with the `supabase_realtime` publication, which
matters more than it looks — without that registration the subscription silently
never fires and the whole feature would quietly run on polling alone with nobody
aware.

### Database shape

`system_settings` is a single enforced row (`CHECK (id = 1)`), readable by every
authenticated role because every session needs the flag to render its own state.
It has a **SELECT policy only, and no write policy at all**: writes exist solely
through `set_maintenance_mode`, a SECURITY DEFINER RPC that re-checks the
caller's role server-side. So a direct client write is refused by the database
rather than by the UI declining to offer one, and the migration asserts that no
write policy exists. The RPC also rejects an empty message when enabling,
because a maintenance screen with no explanation is worse than none — replacing
an ambiguous failure with a deliberate statement is the entire point.

Per the normalization decision, this table holds maintenance state only. R2
credentials live in `supabase/.env`, read server-side by edge functions, so no
storage-config table is needed at all.

### System Health, scoped honestly

This stack has no backend process to monitor — `supabase.js` is a thin
`createClient` wrapper and the only server-side code is a few edge functions. So
the page measures what can actually be measured: round-trip latency of a
count-only read, timed in the browser, with the confirmed 500ms/2s bands. It
states plainly that it does **not** report Supabase's platform status. That
disclaimer is load-bearing: during an incident it decides whether someone
escalates to the right place or blames the wrong system.

### R2 groundwork

Built as an edge-function path from the start, not a browser client, because R2
is a flat S3-compatible bucket with **no row-level security**. Supabase Storage
gives ownership checks and signed URLs for free; R2 gives neither. A
browser-side R2 client would mean shipping a bucket-wide write key to every
student. So `_shared/r2.ts` mints 5-minute presigned URLs after the caller has
been authorized, and `r2-health` is admin-only.

Scope stays exactly as decided: R2 is for grade-change evidence only, and
avatars remain on Supabase Storage permanently. Both the module header and the
Storage Health page say so, so a later reader does not "finish the migration"
that was deliberately never started.

`R2_SETUP.md` is the walkthrough the developer asked for: bucket creation, a
token scoped to one bucket rather than all, the four server-only variables (with
a note on why a `VITE_` prefix would defeat the design by compiling the secret
into the browser bundle), deployment, verification, and how a presigned URL
actually reaches a viewer.

Until the variables are set, Storage Health reports "Not configured" — the
correct state for Phase 2, and the page frames it as expected rather than
broken. It also distinguishes "function not deployed" from "storage unreachable",
since those need different fixes.

## How to verify

Automated (run and passing): `npm run lint` — 0 errors, 47 warnings, the same
baseline as before Phase 2; `npm run build` — succeeds; `npm run verify:grading`
— passes. All three new admin routes resolve, and provider nesting was checked.

Checklists added and amended in `docs/04-testing/page-checklists/`: new
`ADM-MAINT`, `ADM-HEALTH`, `ADM-STORAGE`, and `NAV-MAINT`; `ADM-GATE` updated
for the new nav items; the README's overlap table corrected to note that Admin's
Dashboard is **not yet** repurposed into a system-health overview — that part of
the Phase 2 plan remains open.

The highest-value manual test is the two-browser soft-cutover sequence in
`ADM-MAINT`: an active student must get toast-plus-banner and keep working, the
same student after re-login must get the screen, the banner must clear silently
when maintenance ends, and admin must never be blocked. If an active session and
a fresh login behave identically, the latch is broken.
