# Excel grade export checklist — 2026-10-20

- **Scope:** the posted-grade alignment fix for Faculty Excel exports and the in-app export preview.
- **Migration:** none. The export reads the existing `posted_grades` records.
- **Screens:** Score Input, Grade Computation Preview, and Posted Grades View.
- **Rule under test:** MR and TFR are progress ratings. SG, GWA, and remarks are official export fields and appear only after the student's SG has been posted.

Mark each row **PASS**, **FAIL**, or **N/A**. A failure in E-1 through E-4 blocks release because it creates an official document that disagrees with posted grades.

## Prerequisites

1. Use a class with at least two enrolled students: one with a posted SG and one without one. `NAV113 / BSMARE-1A` is the original reported case when its test data is available.
2. Keep a copy of the Posted Grades screen open for comparison.
3. Test all three export entry points. If a class has cross-enrolled students, test both the regular and `(Irregular)` sheets too.

## Checklist

| ID | Steps | Expected | Result |
|---|---|---|---|
| **E-1** | In Posted Grades, note one student's posted SG, GWA, and remark. Export a complete workbook from **Posted Grades View** and open `Record Sheet`. | The exported SG, Equivalent/GWA, and Remarks exactly match the posted record, including a corrected or administratively overridden grade. | |
| **E-2** | Repeat E-1 from **Score Input**. | The same student's values match the posted record exactly. | |
| **E-3** | Repeat E-1 from **Grade Computation Preview**. | The same student's values match the posted record exactly. | |
| **E-4** | In Excel, select the posted student's SG, Equivalent/GWA, and Remarks cells. | They are stored values, not recalculating formulas. Changing a raw score in the workbook must not change these official fields. | |
| **E-5** | Select a student with no posted SG but with saved term scores. Export from each of the three screens. | MR and/or TFR may appear. SG, Equivalent/GWA, and Remarks are all blank — never `0`, `5.00`, `Failed`, `Pending`, or `In Progress`. | |
| **E-6** | Select a student with no saved scores and no posted SG. | MR, TFR, SG, Equivalent/GWA, and Remarks are all blank. | |
| **E-7** | Open the workbook's `Report of Grades` sheet. Compare its `SG` column to the `Record Sheet`. | The Report's `SG` column shows the Record Sheet SG, not its GWA/Equivalent value. Unposted SG cells remain blank. | |
| **E-8** | Open the in-app Export Preview before downloading. | College, course, section, and academic year are populated from the class. Student values follow E-1 through E-7. | |
| **E-9** | Use a class from a non-TECH college, such as CME. | College and course are the class's actual values; no default `College of Computer Studies` or `BSIT` appears. | |
| **E-10** | Export a class with activity scores of two or three digits. | Activity score columns are readable and do not show `####` at the default Excel zoom. | |
| **E-11** | If the class has cross-enrolled students, compare the regular and `(Irregular)` Record and Report sheets. | The same posted/unposted rules apply to both sheet sets; every student appears only in their correct roster set. | |

## Automated checks already run

- `npm run verify:excel-export`
- `npm run verify:grading`
- `npm run build`
- `npm run lint` — 0 errors; existing repository warnings remain.

## Evidence to retain

- One workbook for a posted-SG case and one unposted-SG case.
- Screenshots of the matching Posted Grades row and the corresponding Record Sheet row.
- Any failure, including the workbook name, export screen used, student number, and actual versus expected values.
