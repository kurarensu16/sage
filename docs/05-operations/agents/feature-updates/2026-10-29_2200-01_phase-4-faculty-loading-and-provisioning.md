# Phase 4 — Faculty Loading & Provisioning

- **Date:** 2026-10-29 22:00 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** `20261029093613_faculty_loading_and_provisioning.sql` (to apply)

## Files changed

- `supabase/migrations/20261029093613_faculty_loading_and_provisioning.sql`
- `src/lib/facultyLoadingService.js`
- `src/components/provisioning/FacultyLoadingWorkspace.jsx`
- `src/components/provisioning/ClassRosterDialog.jsx`
- `src/pages/registrar/FacultyLoadingAndProvisioning.jsx`
- `src/pages/dean/FacultyLoadingAndProvisioning.jsx`
- `src/pages/admin/ClassroomProvisioning.jsx` *(deleted)*
- `src/pages/faculty/FacultyCreateClassroomModal.jsx` *(deleted)*
- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/components/layout/BottomNav.jsx`
- `src/lib/classRoomService.js`
- `docs/04-testing/page-checklists/FACULTY_LOADING.md`
- `docs/04-testing/page-checklists/DEAN_PORTAL.md`
- `docs/04-testing/page-checklists/REGISTRAR_PORTAL.md`
- `docs/04-testing/page-checklists/README.md`
- `docs/README.md`

## What changed and why

Faculty loading moved out of Admin, where it never belonged after the role
split, into two scoped pages: Registrar (any college) and Dean (own college
only). Both render one shared workspace component, so the two cannot drift
apart, but each page **states** its scope rather than the component sniffing the
signed-in role.

Four things were added on the owner's decisions during the build:

1. **A per-college editing lock** (`provisioning_locks`), refreshed by a
   60-second heartbeat and allowed to lapse by TTL. Two people loading the same
   college at once would otherwise overwrite each other silently. A closed tab or
   a crash must not strand a college, which is why the lock expires rather than
   being held until released.

2. **Scheduling** — day of week and a start/end time, **one pattern per class**,
   on the owner's decision that a lab with a different schedule is a separate
   class rather than a second block. Rooms are explicitly out of scope.
   Scheduling is optional so a college can adopt it at its own pace.

3. **Institution-wide conflict detection.** General-education subjects are taught
   across colleges, so a check confined to one college would miss the real
   clashes.

4. **Role-based conflict redaction.** The Registrar handles the institution and
   sees the full conflict; a Dean sees the college and program but not the
   subject code or section name. `redact_schedule_conflict()` strips those fields
   **in the data function, not the message text** — otherwise a Dean could read
   another college's class list by calling `find_schedule_conflict()` directly
   from the console.

## How to verify

- `FACULTY_LOADING.md`: `LOAD-LOCK`, `LOAD-SCHED`, `LOAD-CONFLICT`,
  `LOAD-DRAFT`, `LOAD-ROSTER` — run the file twice, once as registrar and once
  as dean.
- `REGISTRAR_PORTAL.md`: `REG-LOADING`.
- `DEAN_PORTAL.md`: `DEAN-LOADING`.
- The redaction cases are the ones that matter most: they must hold when the
  function is called directly, not only through the page.
