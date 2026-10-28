# System Maintenance Mode & System Health (R2) Workflow Plan - 2026-10-28

**Status:** Proposed design. No code, migration, or edge function exists yet. Every file listed under "Suggested build order" still requires its own developer confirmation before it is created or edited, per `AGENTS.md`.
**Scope:** Three independent additions, all under Admin's new "System Maintenance" nav group: (1) an admin-only maintenance-mode toggle with a soft cutover, (2) a read-only System Health view for Supabase/database status, and (3) a read-only Storage Health view plus the groundwork for adopting Cloudflare R2 as a file-storage backend. Does **not** change any grading, risk, evaluation, or consultation logic.
**Trigger:** Roadmap item #2 of `PRE_DEFENSE_IMPLEMENTATION_ROADMAP_2026-10-28.md`. Admin's scope is narrowing to system maintenance (role split in item #1); this plan is the maintenance tooling that narrowing implies admin actually needs.

## Objective

1. Let admin take the system into a maintenance state without exposing raw errors or kicking active users out mid-session.
2. Give admin a simple, honest view of whether Supabase/the database is reachable and responding — sized to what this stack actually has (a Vite SPA talking to Supabase and a handful of Deno edge functions; `supabase/functions/` currently holds `create-admin-user`, `delete-admin-user`, `send-email`, `generate-intervention-draft`, and `invoke-advisor` — no custom Node/Express server exists anywhere in this repo).
3. Start the groundwork for Cloudflare R2 as a new file-storage backend, needed by roadmap item #6 (Grade Change Request evidence uploads), without prematurely deciding things item #6 should decide for itself.

## Current Setup vs. New Setup

| | Today | New |
|---|---|---|
| **Admin/Supabase outage or planned work** | No concept of maintenance mode exists anywhere in the codebase. If Supabase is down or admin is mid-migration, every logged-in and logging-in user just hits whatever actually breaks — a failed query shows as a blank list, a stuck spinner, a thrown error in `fetchUserProfile`/`AuthContext.jsx`, or a raw Supabase error surfacing wherever the calling code didn't anticipate it. There is no single, deliberate, user-facing message anywhere. | Admin flips one toggle (`system_settings.maintenance_mode`) with a custom message. Every non-admin hitting this state sees one deliberate screen with admin's own wording — never a broken page, a spinner that never resolves, or a raw error. |
| **Already-logged-in users during an outage/maintenance window** | Nothing distinguishes "Supabase is intentionally down for maintenance" from "something is actually broken." A student mid-session during planned work just starts seeing failed requests/spinners with zero explanation, indistinguishable from a real bug. | Soft cutover: active sessions are untouched and keep working. They get a one-time dismissible pop-up with the admin's message, then continue normally — this is a notice, not an interruption. |
| **New logins during maintenance** | Same as above — a student logging in mid-outage gets whatever Supabase/the UI happens to do when the backend is unreachable or admin is mid-change (unpredictable, un-branded, looks like the app is broken). | Login routes to a dedicated, admin-authored maintenance screen instead of `MainLayout` — a clear, intentional message instead of an ambiguous failure. |
| **Admin's own visibility into system state** | Zero. No page anywhere shows whether Supabase is reachable, how fast it's responding, or whether file storage is healthy. The only way admin finds out something is wrong is a user complaint or admin's own manual testing. | Two new read-only pages: **System Health** (Supabase connectivity + round-trip time, green/amber/red) and **Storage Health (R2)** (bucket reachability/usage). Admin sees problems before users have to report them. |
| **File uploads (avatars)** | `profileService.js` uploads straight to the private Supabase Storage `avatars` bucket, protected by Supabase's own RLS, 2MB cap, `jpeg/png/webp`, owner-only paths. This path is not being touched by this plan at all — it is called out explicitly in Part 3 as **unchanged for now** (whether R2 ever replaces it is deferred to item #6, not decided here). | Cloudflare R2 groundwork added as a **new, additive** backend for file types that don't exist yet (starting with item #6's grade-change evidence uploads) — not a replacement of the avatar flow. R2 has no built-in RLS the way Supabase Storage does, so this is a genuinely new access-control surface, not a drop-in swap. |
| **Which existing code paths does this replace vs. add to?** | — | **Purely additive** everywhere: a new table (`system_settings`), a new context/subscription alongside the existing `AuthContext.jsx` Realtime pattern (reusing, not replacing, the proven `postgres_changes` approach already used for `notifications`), new Admin-only pages, and a new storage client. Nothing in `profileService.js`, `AuthContext.jsx`'s existing notification logic, or any grading/risk/evaluation code is modified or removed — this plan only adds a route-guard branch and a provider on top of what already exists. |

## Part 1 — Maintenance Mode

### Design: one settings row, read at load and pushed live via Realtime

A single-row table carries the flag and message. Supabase Realtime is already a proven pattern in this codebase — `src/lib/AuthContext.jsx` subscribes to `postgres_changes` on `notifications` today (`supabase.channel('realtime-notifications-\${userId}').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', ... })`). Maintenance mode reuses the exact same mechanism instead of polling:

```sql
CREATE TABLE public.system_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforces a single row
  maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  maintenance_message TEXT,
  updated_by UUID REFERENCES public.users(user_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.system_settings (id) VALUES (1);
```

- RLS: readable by every authenticated role (everyone needs to know the flag); writable only by `admin`, enforced the same way other admin-only writes are gated in this codebase (a SECURITY DEFINER RPC, e.g. `set_maintenance_mode(p_enabled boolean, p_message text)`, checking the caller's role server-side rather than trusting a client-side admin check).
- `AuthContext.jsx` (or a new small `MaintenanceContext`, provider-wrapped alongside `AuthProvider` in `src/App.jsx`) subscribes to `postgres_changes` on `system_settings` the same way the notifications channel already does, plus an initial `select` on mount — so every open tab learns about a flip within the same latency the notification poller already achieves (that poller also runs a 4-second `setInterval` fallback; maintenance mode should do the same low-cost fallback rather than relying on Realtime alone, consistent with the existing dual-path pattern).

### Soft cutover behavior (confirmed, not open)

- **Already-logged-in users:** session is untouched. When the flag flips to `true`, the Realtime/poll fallback fires a one-time pop-up (a dismissible banner/toast, not a forced redirect) showing the admin's custom message. The user keeps working normally; nothing blocks them.
- **New logins:** the login screen (`src/pages/public/` route) checks `system_settings.maintenance_mode` before attempting sign-in UI, or immediately after a successful `auth.getSession()`/`signInWithPassword()` resolves — if true and the authenticating user's role isn't `admin`, route them to a dedicated maintenance screen instead of `MainLayout`. This mirrors the existing archived/inactive-account check already in `fetchUserProfile()` (`AuthContext.jsx` lines 90-95), which force-signs-out and blocks a profile load for a bad status — maintenance mode needs the analogous branch, but for a route decision rather than a sign-out.
- **Admin exemption:** the check is `role !== 'admin'`, evaluated after `userProfile` loads (role lives on `profile.role`, same field every other role gate in this app already reads).

### Nav and UI

- Admin → System Maintenance → **Maintenance Mode**: a page with the toggle, a text area for the custom message, and a "last changed by / at" line sourced from `updated_by`/`updated_at`.
- A full-screen maintenance component (e.g. `src/components/layout/MaintenanceScreen.jsx`) rendered in place of the portal routes for a blocked non-admin login, showing only the admin's message — no stack traces, no partial UI.

## Part 2 — System Health

### Design: a client-timed ping, not invented infrastructure

This stack has no dedicated backend process to monitor — `src/lib/supabase.js` is a thin `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)` wrapper, and the only server-side code is the five Deno edge functions listed above. "System health" here realistically means: *is the Supabase connection healthy from the browser's point of view right now.*

- A new Admin page (`src/pages/admin/SystemHealth.jsx`) runs a lightweight, cheap query on an interval (e.g. `supabase.from('system_settings').select('id', { head: true, count: 'exact' })` or an equivalent trivial `select`) timed with `performance.now()`, and reports: reachable/unreachable, and the round-trip time, with a simple status badge (e.g. green under 500ms, amber under 2s, red/unreachable beyond that or on error) — thresholds are illustrative, confirm with developer.
- No new edge function, no new migration beyond what Part 1 already adds (this reuses the same `system_settings` row rather than a dedicated health-check table) — reading from an existing lightweight row is enough to prove connectivity without adding a table purely for pings.
- This page explicitly does not attempt to report on Supabase's own infrastructure status (that's Supabase's dashboard, outside this app) — only whether *this app's* connection to it is working.

## Part 3 — Storage Health (R2) groundwork

### What exists today

`profileService.js` is the only place avatar storage is touched: `AVATAR_BUCKET = 'avatars'`, uploaded via `supabase.storage.from(AVATAR_BUCKET).upload(...)`, read back via `createSignedUrl(path, 3600)`. Per `AGENTS.md`, this bucket is private, 2MB-capped, `jpeg/png/webp` only, with owner-only paths `user_id/...` — access control today rides entirely on Supabase Storage's own RLS-backed policies, enforced server-side by Supabase itself.

### The open question this plan does not answer

Cloudflare R2 has **no built-in row-level security** the way Supabase Storage does — R2 is a flat S3-compatible bucket. Anything uploaded there needs its own access-control story: either (a) an edge function that mints short-lived signed URLs server-side after checking the caller's identity/ownership (mirrors what `createSignedUrl` already gives you for free on Supabase Storage), or (b) a fully public bucket with unguessable keys, which is a materially weaker guarantee than what avatars currently have and should not be the default.

This plan deliberately does **not** decide whether R2:
- **(A)** replaces Supabase Storage for avatars too (migration cost: re-upload/re-point every existing avatar path, rewrite all five `profileService.js` call sites, lose the free RLS Supabase Storage already provides), or
- **(B)** is adopted only for new file types — starting with Grade Change Request evidence attachments (roadmap item #6) — leaving avatars exactly as they are (cost: two storage systems to operate, maintain, and monitor instead of one).

That decision belongs to whichever plan actually needs R2 first — `GRADE_CHANGE_REQUEST_WORKFLOW_PLAN_2026-10-28.md` (roadmap item #6) is the one with a concrete new upload requirement (evidence files) and should make this call when it's drafted. This plan only prepares the **shared groundwork** both options would need regardless: the env vars, the client wrapper, and a health view.

### What this plan does build: an R2 client wrapper and a health view

- New file `src/lib/r2Storage.js` (or `supabase/functions/_shared/r2.ts` if upload/signing must happen server-side per the access-control concern above — likely the right call given RLS doesn't exist on R2, but the exact split is item #6's to make) wrapping the S3-compatible API (`@aws-sdk/client-s3` or a lighter signed-URL-only approach) with R2's endpoint shape.
- Env vars, following the existing `.env.local` (browser-exposed, `VITE_`-prefixed) / `supabase/.env` (server-only, edge functions) split already used for `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and `SERVICE_ROLE_KEY`:
  - Server-only (`supabase/.env`, used only inside edge functions, never shipped to the browser): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.
  - Possibly browser-exposed (`VITE_` prefix, only if a public custom domain is used for serving already-public assets): `VITE_R2_PUBLIC_URL`.
  - Per `AGENTS.md`: **the AI agent never edits `.env*` files** — the developer adds these manually once R2 credentials exist.
- Admin → System Maintenance → **Storage Health (R2)**: read-only page showing whether the R2 bucket responds (a lightweight `HeadBucket`-equivalent call from an edge function, since R2 credentials must stay server-side) and basic usage if R2's API exposes it cheaply; mirrors the System Health page's green/amber/red pattern from Part 2.

## Sequence walkthrough

1. Admin opens **Maintenance Mode**, types "Scheduled maintenance 9-10 PM, grading will be briefly unavailable," flips the toggle on. `set_maintenance_mode` RPC updates the single `system_settings` row.
2. Every open tab (student, faculty, dean sessions already signed in) receives the `postgres_changes` UPDATE event within seconds via the existing Realtime channel pattern, or within 4 seconds via the poller fallback if Realtime is momentarily down. Each shows a one-time dismissible banner with the admin's exact message. Nobody is logged out, nobody loses in-progress work.
3. A student who was logged out tries to log back in during the window. After `auth.getSession()` resolves and the profile loads with `role: 'student'`, the app checks `system_settings.maintenance_mode === true` and routes to `MaintenanceScreen` showing the same message, instead of `MainLayout`.
4. Admin, also attempting to open the app fresh, loads normally — `role === 'admin'` bypasses the check entirely.
5. Admin flips the toggle off once the work is done. The banner-trigger logic only fires on `false -> true` transitions (not on every row update), so turning it off does not pop a second banner at anyone — confirm this behavior is desired, see Open Decisions.

## Open decisions (confirm before any file is touched)

1. **R2 scope (A vs. B above)** — the single biggest undecided question in this plan. Recommend deferring the final call to `GRADE_CHANGE_REQUEST_WORKFLOW_PLAN_2026-10-28.md` since that's the first concrete consumer, but confirm this plan should build only the shared wrapper/health view and not touch avatars either way.
2. Should turning maintenance mode **off** also notify active sessions ("maintenance has ended"), or stay silent as assumed in the walkthrough above?
3. System Health thresholds (500ms/2s illustrative bands) — confirm or adjust.
4. Does the maintenance pop-up need to be dismissible-and-gone, or should it persist (e.g. a persistent top banner) for the duration the flag stays `true`, rather than a one-time toast?
5. R2 access pattern — signed URLs minted by an edge function (recommended, keeps credentials server-side) vs. any other approach — confirm before `r2Storage.js`/`_shared/r2.ts` is drafted in detail by item #6.
6. Confirm `system_settings` as a shared single-row table is acceptable, versus two separate tables/flags for maintenance vs. storage config — a single row was chosen here for simplicity, not because storage config logically belongs with the maintenance flag.

## Suggested build order

1. Migration: `system_settings` table, RLS (read: all authenticated; write: admin via RPC), `set_maintenance_mode` RPC, seed row — developer applies manually.
2. `src/lib/AuthContext.jsx` or new `MaintenanceContext.jsx`: Realtime subscription + poll fallback, exposed `maintenanceMode`/`maintenanceMessage` state.
3. Route guard (`src/App.jsx` or a wrapper around `MainLayout`): non-admin + `maintenance_mode === true` + new session -> `MaintenanceScreen`.
4. `src/components/layout/MaintenanceScreen.jsx`: full-screen message display.
5. Active-session pop-up/banner component, wired to the `false -> true` transition only.
6. Admin UI: `src/pages/admin/MaintenanceModePage.jsx` (toggle + message + last-changed line), `src/pages/admin/SystemHealth.jsx` (connectivity ping + round-trip badge).
7. R2 groundwork only: env var placeholders documented (not set — developer's manual step), `src/lib/r2Storage.js` or `supabase/functions/_shared/r2.ts` skeleton, `src/pages/admin/StorageHealth.jsx` — scope finalized once item #6 confirms option A or B.
8. Manual click-through: flip maintenance on with two browser sessions open (one admin, one non-admin) to confirm the soft-cutover behavior matches the sequence walkthrough exactly; confirm System Health badge reflects a real connectivity drop (e.g. briefly wrong anon key) accurately.
9. Change record in `docs/05-operations/agents/feature-updates/` once implemented and approved, plus a `docs/README.md` index update for this doc.

Each step remains subject to its own per-file confirmation before editing, per `AGENTS.md`.
