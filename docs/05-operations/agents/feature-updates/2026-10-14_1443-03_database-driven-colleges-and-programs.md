# Colleges and programs read from the database; label fixes

- **Date:** 2026-10-14 14:43 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** `20261014170000_department_short_name.sql`, `20261014180000_program_abbreviations.sql` (applied 2026-10-14)

## Files changed
- `supabase/migrations/20261014170000_department_short_name.sql`
- `supabase/migrations/20261014180000_program_abbreviations.sql`
- `src/lib/constants.js`
- `src/lib/excelExport.js`
- `src/lib/notificationService.js`
- `src/components/ExportPreviewModal.jsx`
- `src/pages/admin/UserList.jsx`
- `src/pages/admin/UserForm.jsx`
- `src/pages/admin/SectionForm.jsx`
- `src/pages/admin/SectionList.jsx`
- `src/pages/admin/ClassroomProvisioning.jsx`
- `src/pages/admin/DepartmentsList.jsx`
- `src/pages/dean/GradeDistribution.jsx`
- `src/pages/dean/SummaryReports.jsx`
- `src/pages/faculty/Dashboard.jsx`
- `src/pages/faculty/ScoreInput.jsx`
- `src/pages/student/MyGradesDetail.jsx`

## What changed and why

Phase 2 (ASPIRE-C01, C08, C09), extended on the owner's instruction that reference data must always be fetched from Supabase rather than hard-coded.

**Department abbreviations.** "CCS" was produced three ways, none from data: a hard-coded `DEAN, CCS` on the export signatory line with no data binding at all, and two ternaries in `UserList.jsx` matching `'College of IT'`/`'College of CS'` — neither of which is a department name in this database. A `departments.short_name` column was added and populated for all ten colleges (TECH for Technology and Engineering College for Humanity, COA, CAS, CBA, COE, CHS, CHMT, CME, DGE, SOP). Full names are kept; only the displayed abbreviation is new.

**Program abbreviations.** The same program-code mapping was duplicated in five places, including a chain of `programName.includes(...)` guesses in `ClassroomProvisioning.jsx` that produced `BAPSYCH` where the map produced `BAPsych`. All were removed in favour of `programs.abbreviation`. Two of them were load-bearing because their queries never selected the column: `UserForm.jsx` fetched only `(program_id, name, department_id)` and `GradeDistribution.jsx` only `(name)`, so both silently fell back to their in-code map. Both now select `abbreviation`. The column already existed and was populated in the live project; the migration records it so a rebuild from migrations alone does not lose it.

**Export defaults.** `ExportPreviewModal` received raw `exportMetadata`, which has no `college` field, so `metadata.college || 'College of Computer Studies'` always printed the literal. `excelExport.js` had the same fallback in six places, meaning the generated Excel file stamped the wrong college on every non-computing class. Both now read the class's real department, and the course is derived from the section-name prefix.

**`SectionList` CSV import** rewrote any imported college to `'College of Computer Studies'` — a name this database does not contain — so those rows could never match. The rewriting is gone, the sample template is built from existing section data, and the program is resolved against `programs.abbreviation`.

**Wording:** the faculty dashboard's "Ongoing terms" became "Current Grading Period" (C01). On the student Score Breakdown, a period in the `'Covered'` state shows a rating computed from live scores but was labelled with full-confidence wording, so a failing covered period read a flat "At-Risk" before anything was posted; both label branches now gate on `!== 'Posted'` (C08).

## How to verify
`docs/04-testing/CONSULTATION_REMEDIATION_TEST_GUIDE_2026-10-14.md` §6 and §7. In particular §7.2: `CCS`, `College of Computer Studies`, `College of IT` and `College of CS` must appear nowhere in the UI, and §7.4: export a non-computing class and confirm the real college is stamped.

After the migration, check for programs that still have no code:
```sql
SELECT program_id, name FROM public.programs WHERE COALESCE(abbreviation, '') = '';
```
