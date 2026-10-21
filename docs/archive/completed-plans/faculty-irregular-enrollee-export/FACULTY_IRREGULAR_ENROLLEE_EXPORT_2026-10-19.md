> **SUPERSEDED on 2026-10-19 — do not implement from this document.**
>
> This plan plus its locked decision 1 ("the official grade sheets remain unified")
> were reversed before any code was written. The registrar files grades against a
> block section masterlist, so the official sheets now carry the block section only
> and the cross-enrolled students get their own parallel set of grade sheets.
>
> What was actually built:
> [`03-development/implementation-reports/FACULTY_IRREGULAR_ENROLLEE_EXPORT_2026-10-19.md`](../../../03-development/implementation-reports/FACULTY_IRREGULAR_ENROLLEE_EXPORT_2026-10-19.md)
> Kept for history only.

# Faculty irregular-enrollee companion export

- **Status:** Planned (implementation plan only; not yet built)
- **Priority:** P2
- **Written:** 2026-10-19
- **Last revalidated:** never (cross-check the current export paths before implementation)
- **Migration:** None expected
- **Related:** `src/lib/classRoomService.js`, `src/lib/excelExport.js`, `src/pages/admin/SectionMasterlist.jsx`

## 1. Current behavior

The faculty grade-sheet export includes every student enrolled in the selected class. This is correct for the official academic record: regular and irregular students must remain together in the class roster and grade sheets.

The application already determines enrollment type in the context of a class:

- **Regular:** the student's home section matches the class section.
- **Irregular:** the student has no home section, or their home section differs from the class section.

Faculty screens keep that information for display, but `excelExport.js` currently writes student names, scores, and grades only. It does not use `enrollment_type` or `is_irregular`, so a generated Excel workbook gives no separate visibility for irregular enrollees.

The Admin Portal's Section Masterlist already handles this distinction correctly: it keeps the home-section masterlist intact and shows irregular enrollees in a separate, per-subject companion list. The faculty export should follow the same principle.

## 2. Goal

When a faculty member exports a class grade workbook that includes one or more irregular students, add an **Irregular Enrollees** companion worksheet. It helps faculty identify cross-enrolled students without changing, filtering, or splitting the official grade sheets.

## 3. Decisions locked for implementation

1. **The official grade sheets remain unified.** Every enrolled student stays in Subject Profile, Record Sheet, and Report of Grades exactly as today.
2. **The companion worksheet is informational.** It does not create a second grade record, alter grades, or remove students from the official class sheets.
3. **Create the worksheet only when needed.** If the class has no irregular enrollees, do not add an empty sheet.
4. **Use the existing class-contextual rule.** Reuse `getEnrollmentType`; do not add a global `is_irregular` flag or duplicate the classification query.
5. **Attach it to every Excel-export selection.** The companion sheet appears whether faculty export all worksheets or a single selected grade worksheet.
6. **Do not add a database migration.** The feature uses existing enrollment and roster data only.

## 4. Companion worksheet contents

The **Irregular Enrollees** worksheet should identify the exported class and include one row per irregular enrollee:

| Column | Purpose |
| --- | --- |
| No. | Export row number |
| Student No. | Student identifier |
| Student Name | Full name |
| Home Section | Student's assigned block section, or `No home section` |
| Class Section | Section of the exported subject offering |
| Subject | Subject code and name |
| MR | Midterm Rating when available |
| TFR | Tentative Final Rating when available |
| SG / Remarks | Semestral Grade and current remark when available |

The grade-summary values must match the values in the official export. The companion worksheet is a reporting aid, not an independent grading calculation.

## 5. Implementation plan

### A. Preserve export-ready enrollment information

1. Review every faculty Excel-export entry point:
   - `src/pages/faculty/ScoreInput.jsx`
   - `src/pages/faculty/GradeComputationPreview.jsx`
   - `src/pages/faculty/PostedGradesView.jsx`
2. Ensure each exported student object retains:
   - `enrollment_type`
   - `is_irregular`
   - a human-readable `home_section_name`
   - the same student number, name, ratings, and remarks used by the official sheet.
3. Extend existing roster data/selects only where the home-section name is not already available. Do not issue a separate per-student request during export.

### B. Build the companion worksheet

1. Add a small, pure helper in `src/lib/excelExport.js` that filters the already prepared export rows to irregular enrollees.
2. Add `buildIrregularEnrolleesSheet(...)`, using the workbook's existing styles and metadata patterns.
3. Reuse the export's rating/remarks values, or the same shared rating helper used by the official sheets. Do not recreate grade formulas differently for this worksheet.
4. In `triggerExcelExport(...)`, append the worksheet only when the filtered list is non-empty.
5. Keep the generated workbook name unchanged; the companion worksheet is part of the same class export.

### C. Explain it in the export UI

1. In `src/components/ExportPreviewModal.jsx`, show a short notice when the selected class contains irregular students: the Excel file will include an **Irregular Enrollees** companion sheet.
2. Keep the preview's regular grade-sheet layout unchanged.
3. Do not add this worksheet to PDF export in this scope. A PDF companion report can be assessed separately if faculty need it later.

### D. Record and verify the change

1. Update the relevant export and testing documentation when implementation is approved.
2. Create the required feature-update record if the change freeze is active at implementation time.
3. Run `npm run lint`, `npm run build`, and `npm run verify:grading` after changing grade-export code.

## 6. Acceptance tests

| ID | Scenario | Expected result |
| --- | --- | --- |
| IE-01 | Export a class with only regular students | Normal workbook; no **Irregular Enrollees** worksheet. |
| IE-02 | Export a class with a student from another home section | Student remains on every official grade sheet and appears once on the companion worksheet with their home section. |
| IE-03 | Export a class with a student who has no home section | Student remains on the official sheets and appears once with `No home section`. |
| IE-04 | Export a mixed roster | No missing or duplicate students in the official sheets; the companion list contains only irregular students. |
| IE-05 | Compare grades | MR, TFR, SG, and remarks match the official exported row for every companion-sheet student. |
| IE-06 | Export Profile, Record, Report, and All | The companion worksheet is included whenever the export contains irregular students. |
| IE-07 | Check classification consistency | A student's export classification matches the faculty roster and Admin Section Masterlist. |

## 7. Out of scope

- Removing irregular students from faculty rosters or official grade sheets.
- Changing enrollment, attendance, grading, or posted-grade rules.
- Adding a global irregular-student flag to `users`.
- Creating a separate PDF companion report.
- Changing the Admin Section Masterlist, which already provides the required regular/irregular separation.

## 8. Risks and safeguards

- **Risk:** An irregular student is accidentally excluded from the official grade record.  
  **Safeguard:** The export continues to receive the full class roster; the companion list is created only as an additional filtered view.

- **Risk:** Different export screens classify the same student differently.  
  **Safeguard:** All paths must preserve and reuse the existing `getEnrollmentType` result.

- **Risk:** The companion worksheet disagrees with official grades.  
  **Safeguard:** Reuse the same computed export values or shared rating helper rather than introducing another grade calculation.
