# Registrar student-records write path and the five net-new Registrar pages

- **Date:** 2026-10-29 05:00 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** `20261029044752_registrar_student_records_rpc.sql` (to apply — the developer is applying all plan migrations together)

## Files changed

New:
- `supabase/migrations/20261029044752_registrar_student_records_rpc.sql`
- `src/pages/registrar/ProgramList.jsx`
- `src/pages/registrar/ProgramForm.jsx`
- `src/pages/registrar/EnrollmentManagement.jsx`
- `src/pages/registrar/ImportStudents.jsx`
- `src/pages/registrar/ViewUsers.jsx`

Edited:
- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`

## What changed and why

Phase 1 batch 2: the five pages the role-split plan lists as net-new for the
Registrar, plus the database capability three of them need.

### The permission problem, and why it is an RPC

A student's home section lives on `public.users.section_id`, and
`users_update_self_or_admin` admits only the row owner or an active admin. So
Enrollment Management and Import Students had no legal write path, and the
dashboard's "students with no home section" alert pointed at a page the
Registrar would have been powerless to act on.

The developer approved a column-limited write for the Registrar. The mechanism
originally proposed for it — `GRANT UPDATE (section_id, ...) ON public.users` —
**does not work**, and that was corrected before anything was written: column
privileges are granted per *database role*, and admin, registrar, faculty and
students are all the same role (`authenticated`); only RLS distinguishes them. A
column grant would have restricted nobody, and revoking UPDATE from
`authenticated` to re-grant columns would have broken both Admin's account
editing and every user's own profile edit.

The capability is therefore a SECURITY DEFINER RPC, which is what `AGENTS.md`
prescribes for privileged writes anyway. `registrar_set_student_records` checks
`is_active_registrar()`, writes only `section_id`, `year_level`, and
`department_id`, and refuses any target whose role is not `student`. The
permission boundary the developer approved is unchanged; the enforcement is
stronger than the original proposal, because the writable column set lives in the
function body where a caller cannot widen it. `public.users` RLS is left
untouched, so "Admin is the only role that can edit an account" stays literally
true at the policy layer, and the migration's own verification block fails if a
registrar branch ever appears on that table's policies.

`registrar_bulk_set_student_records` is the batch variant used by the import, so
a spreadsheet either lands whole or not at all rather than part-applied.

Note `users.program_id` **does not exist** — `UserForm` uses the program only to
filter section choices and never persists it — so the RPC covers only the three
columns that are real.

### Why the home-section backlog matters more than it looks

`getEnrollmentType()` derives Regular versus Irregular by comparing a student's
home section to the class's section, and returns **Irregular when the student has
no home section at all**. The roughly 320 students the earlier
`ADMIN_SETUP_AUDIT_2026-10-11` found are therefore mislabelled Irregular in every
class they appear in. Clearing that backlog in Enrollment Management corrects the
labels system-wide, which is why that page leads with the unassigned count and
explains the consequence inline.

### The pages

- **Degree Programs** (`ProgramList` / `ProgramForm`) — net-new capability;
  programs existed in the data model and were read in several places but no page
  ever managed them. Deletion is advisory-checked: nothing in the schema holds a
  foreign key to `programs`, and a section's program is encoded only in its name
  string, so the section count shown is matched by name and the page says so
  rather than implying the database verified it.
- **Enrollment Management** — assigns home section, year level, and college,
  with a one-tap filter for the unassigned backlog. Student loading is paginated
  because PostgREST caps responses at 1000 rows, and a silent truncation would
  hide exactly the students this page exists to find.
- **Import Students** — enrollment-only by confirmed decision. A row whose
  student number is not already in the system is reported as an error rather
  than creating an account, so account creation stays exclusively Admin's. Rows
  are classified Ready / Unchanged / Error before anything is applied, following
  the existing Import Users preview pattern, and section and year level are
  matched against the database by exact name rather than guessed.
- **View Users** — read-only directory at full column parity with Admin's list.
  It renders no create, edit, or deactivate control, and the database agrees:
  `users_insert_admin` and `users_update_self_or_admin` have no registrar branch,
  so a write would be refused at the RLS layer even if a control were added by
  mistake. It points the reader at Enrollment Management for the one slice of
  this data a registrar may change.

Navigation gains a read-only **User Accounts → View Users** group, Degree
Programs under Academic Setup, and Enrollment Management plus Import Students
under Student Records.

## How to verify

Automated (run and passing): `npm run lint` — 0 errors, 47 warnings, unchanged
from before this batch, so the new files add none; `npm run build` — succeeds;
`npm run verify:grading` — passes. Every `/registrar/*` link in the pages and in
`registrarAnalyticsService.js` was checked against `App.jsx` and all resolve,
including the dashboard's `/registrar/enrollment` integrity alert.

Manual, after both migrations are applied:
1. As registrar, open Enrollment Management, tap the "No home section" tile, and
   assign a section to one student. Confirm it saves, and that the student's
   enrollment type stops reading Irregular in a class of their own section.
2. Confirm choosing a section auto-fills the matching college, and that picking a
   section from a different college than the one selected is rejected.
3. Download the Import Students template, fill two rows, upload. Confirm the
   Ready/Unchanged/Error split is correct, that an unknown student number is an
   error rather than a new account, and that Apply updates only Ready rows.
4. Create, edit, and delete a Degree Program; confirm the section-count warning
   appears on delete when an abbreviation is in use.
5. Open View Users; confirm no create, edit, or deactivate control exists and all
   role tabs count correctly.
6. As admin, confirm Manage Users still edits accounts normally — the RPC must
   not have altered Admin's own path.
7. Negative check: as faculty or a student, call `registrar_set_student_records`
   directly and confirm it raises `42501`.
