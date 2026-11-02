# Shared navigation and role routing — checklists

Covers the components every portal shares. These are the highest-leverage checks
in the whole suite: a defect here breaks one role's entire portal rather than one
page, and Phase 1 found four separate instances of exactly that.

## Role-generic redirects

**ID:** `NAV-REDIRECT` · **Last touched by:** Phase 1

Every post-auth redirect in the app interpolates the role into the path, so
**adding a role silently creates four new required routes**. There is no
allow-list to update and no error to notice — the route either exists or the user
is bounced.

The interpolating call sites: `Login.jsx:21,90`, `ForceChangePassword.jsx:28,77`,
`NotFound.jsx:11`, `Forbidden.jsx:11` (all `/${role}/dashboard`),
`Topbar.jsx:87` (`/${role}/notifications`), `Topbar.jsx:105` and
`Sidebar.jsx:465` (`/${role}/settings`).

For **each** of the five roles (admin, registrar, dean, faculty, student):

- [ ] Signing in lands on that role's dashboard.
- [ ] `/${role}/dashboard` exists — no NotFound, and critically **no redirect
      loop** (NotFound itself redirects to this path, so a missing route ping-pongs).
- [ ] `/${role}/notifications` exists and renders.
- [ ] `/${role}/settings` exists and renders.
- [ ] Hitting an unknown URL while signed in returns to that role's dashboard
      exactly once.
- [ ] Hitting a forbidden URL shows `/403` and its "back" action returns to the
      correct dashboard.
- [ ] A forced password change completes and lands on the correct dashboard.

> **When a future phase adds a role**, add it to this list before anything else.
> This is the cheapest check in the suite and catches the most total breakage.

---

## Sidebar

**ID:** `NAV-SIDEBAR` · **File:** `src/components/layout/Sidebar.jsx`
**Last touched by:** Navigation restructure, 2026-10-30

- [ ] `PORTAL_NAVIGATION` has a key for all five roles.
- [ ] The portal is resolved from the first path segment, and an unmatched
      segment falls back to `faculty` — confirm no role is silently landing on
      the faculty nav.
- [ ] Every item in every role's nav resolves to a real route. Walk them all;
      Phase 1 found eight dead links on one page alone.
- [ ] Active-state highlighting is correct per role, including `activeOn` aliases.
- [ ] Collapsible groups expand and collapse.
- [ ] No role sees another role's items.
- [ ] Sign-out works from every portal.
- [ ] **Standalone links render.** The renderer used to show only the FIRST
      `standalone: true` entry and filter every other one out of the group
      list, so the Registrar’s **Reports** link appeared nowhere. Confirm
      Dean shows *Faculty Loading* and *Generate Reports*, and Registrar shows
      *Reports*, all as top-level links.
- [ ] **No group wraps a single item.** A disclosure triangle hiding one link
      is a click for nothing.
- [ ] **Every page is reachable from the sidebar.** `/faculty/atriskstudents`
      had no entry, no mobile tab, and no link anywhere in the codebase — it
      existed only for someone who typed the URL.
- [ ] Group names are not near-synonyms. Registrar had both *Student Records*
      and *Records*, and neither held what its name implied.

---

## Bottom navigation (mobile)

**ID:** `NAV-BOTTOM` · **File:** `src/components/layout/BottomNav.jsx`
**Last touched by:** Navigation restructure, 2026-10-30

- [ ] `PRIMARY_TABS` has an entry for all five roles. A missing key renders
      **no mobile nav at all** for that role — which was the state for registrar
      before Phase 1 fixed it.
- [ ] Each tab's `to` resolves to a live route.
- [ ] Each tab's `match` predicate highlights on the right pages and does not
      match another portal's paths.
- [ ] Admin's tabs no longer point at relocated pages.
- [ ] Registrar's tabs cover Dashboard / Setup / Enrolment / Grades. Reports
      falls to **More**, which is right for an occasional page.
- [ ] **No two tabs highlight at once.** Each tab tests the path independently,
      so overlapping prefixes light both. `/registrar/section` as a prefix would
      swallow `sectionmasterlist`, which belongs to a different tab — hence the
      exact paths used there.
- [ ] **Core workflow has a tab; only occasional pages fall to More.** Before
      this, Enrollment Management and Faculty Loading had no tab in any role
      that used them.
- [ ] Tested at phone width with no horizontal scroll.

---

## Topbar

**ID:** `NAV-TOPBAR` · **File:** `src/components/layout/Topbar.jsx`
**Last touched by:** unchanged by Phase 1 (verify against the new role)

- [ ] Notification bell badge count is correct per role.
- [ ] The bell opens the signed-in role's own notifications page.
- [ ] The settings link opens the signed-in role's own settings page.
- [ ] Profile name and role label render correctly for a registrar.

---

## Maintenance gate in the layout

**ID:** `NAV-MAINT` · **File:** `src/components/layout/MainLayout.jsx`
**Last touched by:** Phase 2

The gate sits in `MainLayout`, so it covers every portal route at once. Order
matters here and is deliberate.

- [ ] Gate order: loading → no session → inactive/archived account → forced
      password change → **maintenance** → portal. A blocked or archived account
      must still be handled before maintenance, otherwise a disabled account
      would see a maintenance screen instead of being sent to login.
- [ ] With maintenance on, a non-admin arriving fresh sees `MaintenanceScreen`
      in place of the whole portal — no sidebar, no topbar, no partial render.
- [ ] An already-active non-admin session is **not** replaced by the screen.
- [ ] Admin is never replaced by the screen, in either case.
- [ ] The banner renders between the Topbar and the page content and does not
      overlap the scroll area.
- [ ] The banner is **not** shown on top of the MaintenanceScreen (it would be
      redundant).
- [ ] The toast does not collide with the mobile bottom nav at phone width.
- [ ] Signing out while maintenance is on, then back in, re-evaluates fresh —
      the previous session's verdict must not carry over.

---

## Route guard

**ID:** `NAV-GUARD` · **File:** `src/components/layout/RoleGuard.jsx`
**Last touched by:** unchanged by Phase 1 (confirmed generic; no edit was needed)

- [ ] While the profile is loading, the spinner shows rather than a premature
      `/403`.
- [ ] A signed-out visitor to a guarded route goes to `/login`.
- [ ] A signed-in user with the wrong role gets `/403`, not a blank page.
- [ ] An archived or inactive account cannot load a portal.
- [ ] A role value not in any `allowedRoles` group (for example the legacy
      `office` string) cannot reach any portal.
