# Faculty export: block section separated from cross-enrolled students

- **Status:** Implemented
- **Date:** 2026-10-19
- **Scope:** Faculty Excel grade-sheet export (all three faculty export screens)
- **Migration:** None. Uses existing `enrollments`, `users`, and `sections` data.
- **Supersedes:** the planning doc that sat in `06-future-enhancements/`, whose central decision was the opposite of what was built (see §2).

## 1. Why

A faculty member exports a class grade workbook and hands it to the registrar. The registrar files grades against a **block section masterlist**, which lists only the students whose home section that is.

A student who joined the offering by **class join code** belongs to a different block. Before this change that student was mixed into the official grade sheets, so the workbook handed over did not match the masterlist the registrar files against — it carried rows the registrar has nowhere to put.

The Admin Portal's Section Masterlist already keeps these two groups apart. The faculty export now does the same.

## 2. Decision change from the planning doc

The planning doc locked "the official grade sheets remain unified" and treated the irregular list as an informational aid. That is now reversed:

| | Planning doc | Built |
|---|---|---|
| Official sheets | every enrolled student | **block section only** |
| Cross-enrolled students | one informational summary list | **a parallel set of real grade sheets** |
| Registrar can file the cross-enrolled grades | no | yes |

The reversal is deliberate: an informational list does not solve the registrar problem, because the registrar needs a sheet in the official format to file from.

Nothing is dropped from the export. Every enrolled student still appears — the workbook separates them into two sets instead of merging them into one.

## 3. What the workbook now contains

Exporting a class that has cross-enrolled students:

```
Subject Profile                 <- block section only
Record Sheet                    <- block section only
Report of Grades                <- block section only
Subject Profile (Irregular)     <- cross-enrolled students
Record Sheet (Irregular)        <- cross-enrolled students
Report of Grades (Irregular)    <- cross-enrolled students
```

- The `(Irregular)` sheets are **omitted entirely** when a class has no cross-enrolled students, so a normal class exports exactly as before.
- The split applies to every export selection: a single selected sheet gets its own companion, and *Download Complete Workbook* gets all six.
- The file name is unchanged.
- On the companion sheets the `Section:` field reads `<section> - CROSS-ENROLLED LIST`, so the distinction survives printing, not just the tab name.

## 4. The cross-sheet formula constraint

This is the one non-obvious part of the implementation.

The three official sheets wire themselves together with formulas that name their sibling tabs **literally**:

- Subject Profile pulls student names from `'Record Sheet'!C9` onward.
- Record Sheet and Report of Grades pull metadata from `'Subject Profile'!D10` onward.
- Report of Grades pulls names and ratings from `'Record Sheet'!C`, `AB`, `BA`, and `BC`.

So building a second set the same way would produce companion sheets whose formulas resolve to **the block students' names and grades** — silently wrong output.

The builders already have an `isSingleSheet` mode that writes resolved values instead of cross-sheet formulas. The companion set is built in that mode, which keeps each companion sheet on its own roster. Consequence: the companion sheets hold static values rather than live formulas. For a document being handed to a registrar that is acceptable, and arguably preferable.

## 5. Files changed

| File | Change |
|---|---|
| `src/lib/excelExport.js` | New exported `partitionByEnrollment(students)`; `triggerExcelExport` builds the official sheets from the block roster and appends the `(Irregular)` set when non-empty. |
| `src/pages/faculty/PostedGradesView.jsx` | Roster query now selects `users.section_id` and joins `sections:section_id ( name )`; imports `getEnrollmentType` and sets `enrollment_type`, `is_irregular`, `home_section_id`, `home_section_name`. **This screen previously had no enrollment classification at all.** |
| `src/pages/faculty/ScoreInput.jsx` | Roster query joins the home-section name; student objects carry `home_section_name`. |
| `src/pages/faculty/GradeComputationPreview.jsx` | Same; also stops calling `getEnrollmentType` twice per student. |
| `src/components/ExportPreviewModal.jsx` | Shows a notice, before export, naming how many cross-enrolled students there are and that a companion set is coming. |

Classification is never re-derived: `partitionByEnrollment` reads the `is_irregular` / `enrollment_type` the page already resolved through `getEnrollmentType` in `src/lib/classRoomService.js`, which stays the single owner of the rule.

### Safety fallback

A roster that carries no classification at all is treated as entirely block, so the workbook falls back to the previous single set rather than silently losing students. No student can be routed out of the export by a missing flag.

## 6. Verification

| Check | Result |
|---|---|
| `npm run lint` | 0 errors. 61 pre-existing warnings, none in the changed code. |
| `npm run build` | Succeeds. |
| `npm run verify:grading` | Passes — 5 presets, policy scale, attendance, honors, risk boundaries, milestone identity, summer isolation. |
| `partitionByEnrollment` unit check | 10/10 cases: mixed roster, all-block, all-cross-enrolled, `enrollment_type`-only, unclassified fallback, flag-beats-stale-type, empty, undefined, null entry, and no-student-lost. |
| Excel 31-character sheet-name limit | All six names fit; longest is `Report of Grades (Irregular)` at 28. |

Grade math was not touched, so no grading behavior changes.

## 7. Manual test guide

There is no test framework in this repo, so verify by clicking through. Log in as faculty (`a.rivera@sage.edu.ph` / `DemoPassword123!`).

**Setup.** You need one class whose roster is only its block section, and one class with at least one student who joined by code from another block. Admin → Section Masterlist shows which students are cross-enrolled where.

1. **Class with no cross-enrolled students.** Faculty → Class Records → open the class → Score Input → Export.
   - The preview shows **no** amber notice.
   - Export. The workbook has exactly 3 sheets, no `(Irregular)` tabs, and the same rows as before this change.
2. **Class with cross-enrolled students.** Same path.
   - The preview shows the amber notice with the correct count and the section name.
   - Export *Download Complete Workbook*. The workbook has 6 sheets.
   - On `Record Sheet`, confirm **only** block-section students appear.
   - On `Record Sheet (Irregular)`, confirm **only** the code-joiners appear, and that the `Section:` field reads `<section> - CROSS-ENROLLED LIST`.
   - Confirm no student is missing from the workbook, and that nobody appears on both sets.
3. **Grades agree.** Pick one cross-enrolled student. Compare their MR, TFR, SG, and remarks on `Report of Grades (Irregular)` against what the Grade Computation Preview screen shows for them. They must match.
4. **Single-sheet export.** Back in the preview, select just *Report of Grades* and export. Two sheets: `Report of Grades` (block) and `Report of Grades (Irregular)`.
5. **Repeat on the other two screens.** Grade Computation Preview and Posted Grades View must behave identically. Posted Grades View is the important one — it had no classification before this change, so check specifically that its `(Irregular)` sheet is populated and correct.
6. **Classification agrees across the app.** A student on an `(Irregular)` sheet must also show as irregular on the faculty roster and in Admin → Section Masterlist.

## 8. Known limitations and follow-ups

- **No per-student home-section column.** Each student's home block is now fetched and carried as `home_section_name`, but it is not printed: the sheet layouts are fixed-position grids with merges, and adding a column risks the official sheets. The student number identifies the student for the registrar. Printing the column is a contained follow-up if faculty ask for it.
- **PDF export is unchanged.** The split is Excel-only, as scoped.
- **Posted Grades View does not de-duplicate its roster**, unlike the other two screens, which de-duplicate by `user_id`. Duplicate enrollment rows would therefore show a student twice — on the companion sheet as well as the official one. This predates this change and was left alone; worth a separate look.
- **The 60-student grid in `buildSubjectProfile`** is unchanged (30 + 30 fixed rows). A block section larger than 60 was already truncated on that sheet before this change.
