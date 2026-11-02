# Page audit checklists

One checklist per page, grouped into a file per portal. Every page has its own
section with a stable **case ID** (for example `REG-DASH`), so a later phase can
amend one page without disturbing the others.

These are **living documents**. The post-defense build runs in seven phases
(see [`POST_DEFENSE_IMPLEMENTATION_PHASING_2026-10-29.md`](../../03-development/audits/POST_DEFENSE_IMPLEMENTATION_PHASING_2026-10-29.md)),
and later phases change pages that earlier phases created. A checklist that still
describes the Phase 1 behaviour of a page that Phase 5 rewrote is worse than no
checklist, because it will be ticked off against the wrong expectation.

## Files

| File | Covers |
|---|---|
| [`REGISTRAR_PORTAL.md`](REGISTRAR_PORTAL.md) | Every page in the Registrar portal |
| [`ADMIN_PORTAL.md`](ADMIN_PORTAL.md) | Admin pages, including those narrowed by the role split, plus System Maintenance |
| [`DEAN_PORTAL.md`](DEAN_PORTAL.md) | Dean pages added or changed by the phases |
| [`FACULTY_PORTAL.md`](FACULTY_PORTAL.md) | Faculty pages added or changed by the phases |
| [`STUDENT_PORTAL.md`](STUDENT_PORTAL.md) | Student pages added or changed by the phases |
| [`FACULTY_LOADING.md`](FACULTY_LOADING.md) | The shared Faculty Loading & Provisioning workspace, run once per portal |
| [`GRADE_CHANGE_REQUESTS.md`](GRADE_CHANGE_REQUESTS.md) | The Phase 6 dispute chain, which spans the student, faculty, dean and registrar portals |
| [`AI_STUDY_TUTOR.md`](AI_STUDY_TUTOR.md) | The Phase 7 tutoring mode, which spans the student portal, faculty Score Input, and the admin-curated search destinations |
| [`SHARED_NAVIGATION.md`](SHARED_NAVIGATION.md) | Sidebar, mobile bottom nav, topbar, and the role-generic redirects |

Phases 6–7 add to these files as they introduce pages. A portal file holds only
the pages a phase created or changed; everything else stays in the main runbook,
[`../SYSTEM_TEST_CHECKLIST_2026-10-10.md`](../SYSTEM_TEST_CHECKLIST_2026-10-10.md).

Three files are not portals. `GRADE_CHANGE_REQUESTS.md` follows one request
through four roles, so splitting it four ways would mean four half-tests of a
chain that only means anything end to end. `AI_STUDY_TUTOR.md` is the same
shape: what a faculty member attaches to an activity is what a student is shown
days later, and the privacy wall between them is only testable from both sides
at once.

`FACULTY_LOADING.md` is the other: the Registrar and Dean
render the *same* workspace component with different scope, so its shared
behaviour is checklisted once and run twice rather than copied into both portal
files. `REG-LOADING` and `DEAN-LOADING` hold only what differs.

## Rules for keeping these current

1. **A phase is not done until its checklists are written or amended.** This sits
   alongside the change-record requirement in `AGENTS.md` §4, not instead of it.
2. **When a phase changes a page an earlier phase delivered**, edit that page's
   existing section rather than appending a second one, and update its
   `Last touched by` line. Two checklists for one page is how a page ends up
   half-tested.
3. **When a phase retires a page**, strike its section and note which phase
   retired it. Do not delete it — a reviewer needs to know the page is gone on
   purpose rather than missing by accident.
4. **Case IDs are permanent.** If a page is renamed or relocated, keep the ID and
   note the new path, so evidence gathered against an ID stays meaningful.
5. Each item should be checkable by someone who did not build the feature. Prefer
   "Admin opening `/registrar/subjectlist` is redirected to `/403`" over
   "permissions work".

## Known phase overlaps to watch

These are the places where a later phase is already expected to change a page
checklisted now. Amend rather than duplicate when you get there.

| Page | Changed by | What changes |
|---|---|---|
| `ADM-DASH` Admin Dashboard | Phase 2 (partly done) | Phase 2 added the System Maintenance pages beside it; the dashboard itself is **not yet** repurposed into a system-health overview. Still open |
| `ADM-STORAGE` Storage Health | Phase 6 | The **R2** panel goes from "Not configured" to actually in use once grade-change evidence uploads exist. The Supabase Storage panel is already live |
| `ADM-BACKUP` Backup & Restore | Phases 6–7 | Each new table they add is picked up automatically, so re-run the "discovered automatically" case after those migrations |
| `STU-GRADES`, `STU-GRADEDETAIL` | Phase 6 | A Grade Change Request gates on `finalized_at` for MR/TFR but on *posted* for SG, since SG never gets a `finalized_at` |
| `ADM-PROV` Classroom Provisioning | Phase 4 | Removed from Admin entirely; replaced by Faculty Loading & Provisioning |
| `REG-SUBJ`, `REG-COG` | Phase 3 | Gain the passing-threshold and FDA-threshold fields |
| `REG-OVERRIDE` Grade Override | Phase 6 | Stays a direct correction, but the dispute chain lands beside it |
| `REG-DASH` Registrar Dashboard | Phase 3 | Term-readiness panel reads per-class thresholds once they exist |

## Status legend

`[ ]` not yet run · `[x]` passed · `[!]` failed, see notes · `[-]` not applicable
