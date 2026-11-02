# Registrar portal: page relocation, navigation, dashboard analytics, and reports

- **Date:** 2026-10-29 04:41 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** None in this change. The authorization migration is `20261029040940_registrar_role_authorization.sql`, recorded in `2026-10-29_0412_registrar-role-authorization-audit-and-migration.md` and applied separately by the developer.

## Files changed

New:
- `src/lib/registrarAnalyticsService.js`
- `src/components/registrar/RegistrarCharts.jsx`
- `src/pages/registrar/Dashboard.jsx`
- `src/pages/registrar/Reports.jsx`
- `src/pages/registrar/Notifications.jsx`

Relocated with `git mv` (history preserved; git records all nine as renames):
- `src/pages/admin/SubjectList.jsx` → `src/pages/registrar/SubjectList.jsx`
- `src/pages/admin/SubjectForm.jsx` → `src/pages/registrar/SubjectForm.jsx`
- `src/pages/admin/GradeComputationsList.jsx` → `src/pages/registrar/GradeComputationsList.jsx`
- `src/pages/admin/SectionList.jsx` → `src/pages/registrar/SectionList.jsx`
- `src/pages/admin/SectionForm.jsx` → `src/pages/registrar/SectionForm.jsx`
- `src/pages/admin/SectionMasterlist.jsx` → `src/pages/registrar/SectionMasterlist.jsx`
- `src/pages/admin/DepartmentsList.jsx` → `src/pages/registrar/DepartmentsList.jsx`
- `src/pages/admin/TermManagement.jsx` → `src/pages/registrar/TermManagement.jsx`
- `src/pages/admin/GradeOverride.jsx` → `src/pages/registrar/GradeOverride.jsx`

Edited:
- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/components/layout/BottomNav.jsx`
- `src/pages/admin/Dashboard.jsx`
- `src/pages/admin/UserForm.jsx`
- `src/pages/admin/UserList.jsx`

## What changed and why

Phase 1 batch 1 of the Admin/Registrar role split. Admin's Academic Setup,
Academic Terms, Section Rosters, and Grade Override pages move to a new
`registrar` portal; Admin narrows to accounts plus system maintenance.

**Registrar Dashboard (addition beyond the plan).** The role-split plan lists no
Registrar dashboard, but every post-auth redirect in the app interpolates the
role generically — `/${role}/dashboard` in `Login.jsx`, `ForceChangePassword.jsx`,
`NotFound.jsx`, and `Forbidden.jsx`. Without the route, a registrar login lands on
NotFound, which then redirects back to the same missing route: an infinite loop.
The route is therefore mandatory, and on the developer's instruction it carries
analytics scoped to what the Registrar actually owns — records integrity,
enrollment distribution, term readiness, academic structure — deliberately not
student-performance analytics (Dean's) or system health (Admin's).

Records integrity is presented as a work queue rather than a statistic: each
count links to the page that resolves it. The existing `ADMIN_SETUP_AUDIT_2026-10-11`
had already found roughly 320 students with no home section, which is exactly the
kind of thing that should surface on login instead of in an audit months later.

**Registrar Reports (addition beyond the plan, developer-requested).** Four
records-oriented exports: enrollment, section roster masterlist, academic
structure inventory, and the grade override log. Faculty teaching loads are
deliberately excluded — that export belongs to the Faculty Loading &
Provisioning page in roadmap item #4, and duplicating it would give one figure
two sources of truth.

**Connection and hand-over breakages found and fixed.** A sweep for stale
references turned up 22 links that would have broken the hand-over:

- Thirteen navigations *inside* the relocated pages still pointed at
  `/admin/...` (for example SectionForm's Cancel, SubjectList's Add button).
  A registrar clicking them would have been bounced to `/403` by RoleGuard.
- `BottomNav.jsx` (mobile) still pointed Admin's Setup tab at relocated pages
  and had no `registrar` entry at all, so the mobile nav was broken for the new
  role and partly dead for Admin.
- `admin/Dashboard.jsx` linked to eight relocated pages. Those routes no longer
  exist for Admin, so each click would have bounced through NotFound back to the
  dashboard. Stat cards now render as non-navigable tiles when a capability has
  moved — the counts still inform Admin — and the moved quick actions were
  replaced with Audit Logs and Classroom Provisioning.
- `UserForm.jsx` had no `registrar` entry in `ROLES`. Beyond blocking creation of
  the account this whole phase depends on, line 128 validates an existing user's
  role against that list, so **editing a registrar would have silently reset them
  to `student`** — data corruption, not just a missing option.
- `UserList.jsx` import rejected `registrar` as an invalid role, and its
  employee-ID prefix ternary fell through to `DN-` for any unrecognised role,
  which would have stamped a registrar with a dean's ID. The ternary is now a
  keyed lookup so a future role cannot silently inherit another's prefix.
- Registrar is institution-wide like Admin, so both are now exempt from the
  "choose a college" requirement via a shared `COLLEGE_EXEMPT_ROLES` constant
  rather than scattered `role !== 'admin'` checks.

`registrar/Notifications.jsx` exists because `Topbar.jsx:87` links the bell to
`/${role}/notifications` generically. It is modelled on the other portals rather
than reusing Admin's page, which carries admin-only delivery-queue monitoring, or
Dean's, which carries `dean_referral` handling with no registrar meaning.

**Deliberately not changed:** Classroom Provisioning stays reachable by Admin, in
both the sidebar and the mobile nav, until roadmap item #4 gives Registrar and
Dean their own entry point. Removing it now would leave nobody able to provision a
class between phases.

## How to verify

Automated (run and passing): `npm run lint` — 0 errors, 47 warnings, all
pre-existing; `npm run build` — succeeds; `npm run verify:grading` — passes,
confirming the Grade Override relocation did not disturb grading math. A sweep
confirmed every `/registrar/*` route resolves to a real page and no `/admin/*`
link points at a removed route.

Manual, after the authorization migration is applied:
1. Sign in as a registrar; confirm the landing page is the Registrar Dashboard
   and that no redirect loop occurs.
2. Confirm each dashboard panel renders, and that an integrity count links to the
   page that fixes it.
3. Walk Academic Setup → Subjects → Add, then Cancel; confirm you stay inside
   `/registrar/*` and never hit `/403`.
4. Export each of the four reports; confirm the file downloads and an entry
   appears in Audit Logs.
5. Sign in as admin; confirm Academic Setup is gone from the sidebar and mobile
   nav, the dashboard has no dead links, and Manage Users, Import Users, Audit
   Logs, and Classroom Provisioning still work.
6. In Manage Users, create a registrar and confirm no college is required and the
   employee ID is `REG-YYYY-NNNNN`. Then edit that user and confirm the role
   stays `registrar` rather than reverting to `student`.
7. Check the notification bell as a registrar.
