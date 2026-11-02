# Navigation restructure — sidebar and mobile tabs

- **Date:** 2026-10-30 18:16 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migrations:** none

An audit of both navigation components across all five roles, then the fixes.

## Files changed

- `src/components/layout/Sidebar.jsx`
- `src/components/layout/BottomNav.jsx`
- `docs/04-testing/page-checklists/SHARED_NAVIGATION.md`

## The bug worth leading with

**The sidebar rendered only the first `standalone: true` entry.**

```js
const standaloneTop = groups.find(g => g.standalone);   // first only
const regularGroups = groups.filter(g => !g.standalone); // excludes them all
```

A second standalone entry was neither rendered as the top link nor included in
the groups — it appeared **nowhere**. The Registrar's **Reports** link had been
invisible in the sidebar for exactly this reason.

The renderer now maps the navigation in declaration order, handling standalone
links and groups alike, so any number may appear in any position.

## A page nobody could reach

`/faculty/atriskstudents` had no sidebar entry, no mobile tab, and **nothing in
the codebase linking to it**. It existed only for someone who typed the URL. The
owner confirmed it is wanted, so it is now in Faculty → Student Support.

## Miscategorised items

| Item | Was | Now | Why |
|---|---|---|---|
| Grade Change Requests (student, faculty) | *Consultations* | *Requests & Consultations* / *Grades* | A four-step grade dispute is not a consultation; it shared the group only because both involve talking to an instructor |
| Faculty Loading & Provisioning | *Student Records* | *Enrollment & Loading* | It assigns **faculty** to classes |
| Academic Terms | *Records* | *Academic Setup* | Terms are **defined** here; "Records" is where a record of something kept would go |

**Registrar had two near-synonymous groups** — *Student Records* and *Records* —
so nobody could predict which held what, and neither held what its name implied.
Replaced by **People**, **Enrollment & Loading** and **Grade Records**.

## Groups that wrapped a single item

Five of them: Student *My Attendance*, Faculty *Classes*, Faculty *Attendance*,
Dean *Faculty Loading*, Registrar *User Accounts*. Each cost a disclosure
triangle to reveal one link.

Attendance folded in beside the thing it belongs to in both portals — recorded
per subject for a student, taken per class for a teacher. Dean's two became
standalone links. Registrar's paired with New Student Accounts as *People*.

## Mobile tabs

Core workflow had no tab. **Enrollment Management and Faculty Loading** — the
registrar's term-start work — were reachable only through *More*, as were
Faculty Loading for the Dean and Student Attendance.

Tabs now:

| Role | Tabs | Falls to More |
|---|---|---|
| Student | Dashboard · Subjects · Grades · Support | nothing |
| Faculty | Dashboard · Classes · Support · Grades | Performance reports |
| Dean | Dashboard · Grades · Risk · Loading | Generate Reports |
| Registrar | Dashboard · Setup · Enrolment · Grades | Reports |
| Admin | unchanged | nothing |

Dean's Reports tab was given up for Loading: faculty loading is a multi-step
term-start workflow, generating a report is one occasional page, and *More* is
the right home for the latter.

**Overlap matters here.** Each tab tests the path independently, so two tabs
matching one page both light up. A `/registrar/section` prefix would have
swallowed `sectionmasterlist`, which belongs to the Enrolment tab — hence exact
paths. Verified: no page matches more than one tab in any role.

## Two corrections to the audit itself

**Install actions were never nav groups.** The first pass reported *Download
APK*, *Add to Home Screen* and *Install Desktop App* as registrar nav entries.
They are a platform-specific button in the footer beside Settings and Sign Out;
a parser picked up their `label:` properties and misfiled them. Nothing to fix.

**"Pages highlight no tab" was overstated.** `moreActive` lights the More button
whenever nothing else matches, so there is always something lit. The real issue
was milder: core pages fell back to More instead of having a tab.

The five-slot mobile layout with a rightmost menu button that opens the full
sidebar **already existed** and needed no work.

## How to verify

`docs/04-testing/page-checklists/SHARED_NAVIGATION.md`, `NAV-SIDEBAR` and
`NAV-BOTTOM`.

The two that matter most:

- **Standalone links render.** Dean should show *Faculty Loading* and *Generate
  Reports* as top-level links; Registrar should show *Reports*. Before the fix
  the second and third of those were invisible.
- **No two tabs highlight at once** on any page, in any role.

Checked mechanically: every sidebar link resolves to a declared route, and no
route matches more than one tab.

`npm run lint` 0 errors / 48 warnings (unchanged) · `npm run build` clean.
