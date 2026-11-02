# Registrar-to-Admin student handover, plain-English errors, ASPIRE rebrand, and retired-college cleanup

- **Date:** 2026-10-29 09:32 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow) plus Fix
- **Migration:** `20261029085444_student_account_requests.sql` (to apply; the five earlier migrations are already applied)

## Files changed

New:
- `supabase/migrations/20261029085444_student_account_requests.sql`
- `src/pages/registrar/StudentAccountRequests.jsx`
- `src/pages/admin/StudentAccountRequests.jsx`
- `src/lib/errorMessages.js`

Deleted:
- `src/pages/registrar/ImportStudents.jsx`

Edited:
- `src/App.jsx`, `src/components/layout/Sidebar.jsx`
- `src/pages/admin/UserList.jsx`
- `src/pages/registrar/EnrollmentManagement.jsx`
- `src/pages/registrar/SubjectList.jsx`
- `src/pages/dean/AtRiskStudents.jsx`
- `src/lib/registrarAnalyticsService.js`, `src/lib/excelExport.js`, `src/lib/seedDatabase.js`, `seedAdmin.js`
- `src/pages/registrar/Dashboard.jsx`, `Reports.jsx`, `ProgramList.jsx`, `ProgramForm.jsx`, `ViewUsers.jsx`
- `src/pages/admin/MaintenanceMode.jsx`, `StorageHealth.jsx`
- `docs/03-development/audits/POST_DEFENSE_IMPLEMENTATION_PHASING_2026-10-29.md`
- `docs/03-development/audits/ADMIN_REGISTRAR_ROLE_SPLIT_WORKFLOW_PLAN_2026-10-28.md`
- `docs/04-testing/page-checklists/REGISTRAR_PORTAL.md`, `ADMIN_PORTAL.md`

## What changed and why

### Import Students was removed, not fixed

The developer questioned whether the Registrar's Import Students page was
necessary. It was not, and checking the code showed it was also harmful.

Admin's Import Users already **requires** a section for every student, validates
it belongs to the right college for the active term, checks the year level
agrees with the section name, and enforces unique ID numbers. Every student
created through the proper path therefore already had a home section, so Import
Students had no population to fix. Worse, it validated **less** than Import Users
did — it never checked section against college, or year level against section —
so it could write combinations Import Users would reject. Two write paths to the
same column, one laxer, is how data drifts.

### What replaced it: a one-directional handoff

The developer's design, which fits the role boundary better than the original
plan did: the Registrar owns *which students exist*, from institutional records;
the Admin owns accounts and provisions the real mailbox in Outlook.

1. Registrar downloads a template, fills it from institutional records, uploads.
2. Admin reviews the queue and exports it **in Import Users' own column format**,
   with `Email` blank and a `RequestID` column carried along.
3. Admin creates the mailboxes in Outlook and pastes the addresses in.
4. Admin uploads through the **existing Import Users** page.

The crucial constraint: the new Admin page **cannot create accounts**. Import
Users stays the single creation path and therefore the single place those rules
are enforced. Building a creator into the queue would have repeated exactly the
mistake that made Import Students wrong. `RequestID` is what links each created
account back and flips its row to Created — without it the queue would have to
reconcile by matching names.

Emails are entered manually because mailboxes are provisioned in Outlook. A
generated address that does not exist in Outlook would be worse than none, so
nothing is auto-generated.

### ID number is required and unique institution-wide

Per the developer: the ID number is unique across students and both teaching and
non-teaching personnel. Enforced at three layers — the upload preview (checked
against existing accounts, the queue, and repeats within the same file), the
submit RPC server-side, and `NOT NULL` on the column.

### Bulk imports now share one verification pattern

The upload preview was reworked to Manage Users' three-state language, and the
distinction matters: an already-known student is **Existing** (skipped), not an
**Error**. Reporting 300 "errors" for a correctly re-uploaded master list trains
people to ignore the error count, and then they miss the real one.

Rows are grouped **by college** with per-college counts, and an explicit
confirmation states the per-college split rather than a single total, so a batch
cannot be sent to the wrong scope unnoticed. Forcing one upload per college was
considered and rejected — slicing a master list by hand is its own error source.

This is now recorded as a standing convention in the phasing doc, binding on
Phases 4–7. Note Phase 4 deliberately has no import of its own (its plan dropped
bulk Excel in favour of export-only), so it mainly binds any new one.

### Error messages no longer leak the schema

A registrar saw *"Could not find the table 'public.student_account_requests' in
the schema cache"*. That names a table, means nothing to the reader, looks like a
crash, and discloses the database's shape.

`src/lib/errorMessages.js` translates raw database and network errors into plain
English, applied across 17 call sites. It is deliberately **not** a blanket
replacement: our own RPCs already raise sentences written for users ("Only an
active registrar may submit student records"), and those are shown verbatim.
Only machine output is replaced — anything containing `public.`, `relation`,
`constraint`, `schema cache` and similar markers. The technical detail still
reaches the console. Offline and timeout get their own wording.

### SAGE renamed to ASPIRE on exports

Export filenames across five files now use the `ASPIRE_` prefix.

**Email domains were deliberately left alone.** `@sage.edu.ph` and
`@student.sage.edu` are the institution's mail domain, not the product name, and
the live demo accounts use them. Changing those placeholders would teach people
to type a domain that does not exist. Flagged to the developer for a separate
decision.

### The retired College of Computer Studies — a real defect, not cosmetics

The developer noted the college no longer exists. It was hard-coded in 13 places,
and several were not cosmetic:

- `UserList.jsx` held a legacy alias map rewriting "College of IT" and "College
  of CS" **into** the retired college, so Admin's import would have converted
  valid entries into a name the database now rejects.
- The same aliasing sat in the Manage Users and Subjects list filters, making
  them silently miss real rows.
- `SubjectList.jsx` rewrote stored college names on display.

All alias maps were removed — colleges are matched by exact name against the
database, and an alias table is a second, silently diverging source of truth.
Sample data, placeholders and seeds now reference colleges that exist, and
`AtRiskStudents.jsx` no longer falls back to naming a college at all.

**The Registrar template's sample row is now generated from live reference
data**, so it can never again demonstrate a college that has been retired —
which is precisely what caused this.

### Enrollment Management

Gained a third card at the developer's request: **Students / Irregular /
Off-block**, all tap-to-filter. "Irregular" means no block section at all;
"Off-block" means the student has a block but takes at least one subject outside
it. They are counted separately because they mean different things.

Also reclassified earlier in the session: students with no block section were
**removed from the dashboard's Records Integrity panel**, because at DYCI an
irregular student legitimately has none. Listing it as integrity work would have
sent the registrar chasing a backlog that should not be cleared.

## How to verify

Automated, all passing: `npm run lint` (0 errors, 48 warnings — one more than
the previous baseline, from a standard `useEffect` dependency warning on the new
page), `npm run build`, `npm run verify:grading`.

Manual: `REG-INTAKE` and `ADM-INTAKE` in
`docs/04-testing/page-checklists/`. The case that matters most is the full round
trip — template, upload, send, export, fill Email, upload through Import Users,
and confirm the queue rows flip to Created on their own.

**Known gap, not yet built:** the Registrar is not notified when Admin creates or
returns their records. Admin is notified on submit, so notification is currently
one-directional.
