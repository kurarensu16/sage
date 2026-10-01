# Reports Module Plan (Faculty Side)

## 1. Purpose

The Reports module gives faculty **descriptive analytics** on student performance. It helps them see:

- which students are at risk,
- where students perform well or struggle, per activity and per class,
- how the current term compares with past terms of the same course,

so they can decide whether to **improve or retain** their teaching approach and what support to give students.


I've successfully run `git pull` in the `sage` directory.

Here are the changes that were pulled:

* Several Android files (`build.gradle`, `strings.xml`), and `capacitor.config.json` were updated.
* A new documentation file was added: `docs/reports/IRREGULAR_STUDENT_AUDIT_CURRENT_STATE_REVIEW.md`.
* A new component was created: `src/components/common/EnrollmentTypeBadge.jsx`.
* Various UI components and services were updated: `StudentRow.jsx`, `classRoomService.js`, `GradeComputationPreview.jsx`, `ScoreInput.jsx`, and `StudentRisk.jsx`.

## 2. Navigation

```
Reports  (header category in the faculty menu)
├── Class Performance
└── Performance Comparison
```

Both pages share a top bar:

- **Subject dropdown**: lists only the subjects assigned to the logged-in faculty member.
- **Academic year filter**: e.g., 2025-2026, 2026-2027.

Recommendation: keep the selected subject and year when the faculty member switches between the two pages.

## 3. Page 1: Class Performance

This page combines the student summary, at-risk summary, class performance, and activity performance.

### Layout

1. **Summary cards**
   - Total students
   - At-risk count and percentage
   - Count per status: performed well / average / struggling
2. **Data grid (left)**
   - Excel-like table with many rows of data.
   - One row per student, one column per activity (activity title as header, description on hover or in a detail panel).
   - Includes a **student status** column and a risk flag.
   - Sort, filter, and search.
3. **Pivot panel (right)**
   - Excel-style field list with four areas: **Filters, Rows, Columns, Values**.
   - Aggregations: count, sum, average, min, max, % of total.
   - Filtering the grid also updates the pivot, since both read the same dataset.
4. **Activity filter** above the grid to focus on a single activity.
5. **Presets** so faculty don't start from a blank pivot:

| Preset           | Rows           | Columns        | Values                           |
| ---------------- | -------------- | -------------- | -------------------------------- |
| At-risk students | Student        | Activity       | Percentage (filtered to at-risk) |
| Whole class      | Student        | Activity       | Percentage, average              |
| Per activity     | Student status | none           | Count of students, average score |
| By section       | Section        | Student status | Count of students                |

6. **Export** to Excel/CSV, for both the grid and the current pivot result.

On small screens, switch to two tabs (Data | Pivot) instead of side by side.

## 4. Page 2: Performance Comparison

**Rule for "similar subject": same course code.**

- After the subject is chosen, list the academic years in which this faculty member handled that course code.
- Compare the current term against one or more past terms.
- Metrics: **average grade, passing rate, at-risk rate**, plus class size for each term.
- Each metric is labeled **better / worse / about the same**.
- "About the same" means within a small, adjustable margin (start with ±2 to 3 percentage points).
- Add a plain-language summary line, e.g., "Passing rate is up 6 points vs. 2025-2026."
- Pivot-style layout so many rows can be summarized by academic year, section, and activity type.
- Add a note that differences are a **trend indicator**, not proof that teaching changed (different cohorts, different grading setups).

## 5. Data Design

### Shared dataset (one source for both pages)

One row per **student per activity**. Build it as a database view.

| Field                                | Notes                                            |
| ------------------------------------ | ------------------------------------------------ |
| student id, student name             |                                                  |
| section                              |                                                  |
| course code, subject name            | course code drives the comparison                |
| academic year, term                  |                                                  |
| activity title, activity description | from the grading system                          |
| activity type                        | quiz, exam, project, etc.                        |
| score, max score                     |                                                  |
| percentage                           | score ÷ max score, so activities are comparable |
| student status                       | performed well / average / struggling            |
| risk flag                            | same logic as the StudentRisk module             |

### Status bands

Computed from each student's percentage (per activity, and overall):

| Status         | Meaning            |
| -------------- | ------------------ |
| Performed well | Well above passing |
| Average        | Around passing     |
| Struggling     | Below passing      |

- Use the school's official passing grade and grade scale for the cutoffs.
- Store cutoffs as **settings**, not hardcoded values.
- Use the same cutoffs for the at-risk logic so every page shows matching numbers.

## 6. Decisions Made

- The data grid is **auto-generated from the grading system**. There is no Excel upload (avoids messy files, altered grades, and mismatched records). Import can be added later if faculty ask.
- Two report pages instead of four.
- Similar subject = same course code.
- Performed well / struggling is based on grades, in degrees (bands).
- Use a ready-made pivot library first. `react-pivottable` is the common React option; check that it is maintained and compatible with your React version. Fallback: a simple custom pivot (one row field, one column field, one value with count/sum/average).

## 7. Access Control and Privacy

- Faculty see only subjects assigned to them, enforced with **row-level security in the database**, not only in the UI.
- Reports show individual student data, so restrict them to the assigned instructor (and the dean where appropriate).
- Consider logging who exported reports.

## 8. Edge Cases to Handle

- **No past terms** for the course code: show an empty state ("No previous terms found for this course").
- **Missing or ungraded activities:** exclude them from averages and show them as "not yet graded" instead of zero.
- **Different max scores** across activities: always compare by percentage.
- **Weighted grading** (e.g., exams count more): decide whether the overall percentage uses weights, and use the same rule everywhere.
- **Dropped or incomplete students:** decide whether they count in class size and rates, and say so on the page.
- **Small classes:** percentages swing widely, so always show counts beside percentages.
- **Changed grading setup between years:** show the grading criteria next to the comparison so faculty can judge it fairly.
- **Sections:** decide whether "class" means one section or all sections of the subject, and offer a section filter.

## 9. Build Order

1. **Shared dataset view** with row-level security and the status calculation.
2. **Class Performance page:** filters, summary cards, data grid.
3. **Pivot panel** with presets.
4. **Export** to Excel/CSV.
5. **Performance Comparison page:** same course code across years, better/worse/same labels, summary line.
6. **Testing and polish:** empty states, loading states, mobile layout.

## 10. Acceptance Checks

- A faculty member sees only their assigned subjects.
- Grid and pivot always show the same numbers after filtering.
- At-risk counts match the StudentRisk module.
- Status bands change when the cutoff settings change.
- Comparison only lists terms of the same course code that the faculty member handled.
- Export matches what is on screen.
- Every page has empty, loading, and error states.

## 11. Open Questions

- Exact passing grade and grade scale used for the status cutoffs.
- Whether the overall grade is weighted, and how.
- Whether "class" means one section or all sections.
- Whether dropped or incomplete students count in the rates.
- Who besides the instructor (dean, department head) can view these reports.
- The "about the same" margin (start at ±2 to 3 points and adjust after testing with real data).

---

## 12. Score Sheet Feature (Faculty Side)

The score sheet is the **data grid** of the Class Performance page. Build it first, reusing the pages and grading data that already exist.

### How it works (user flow)

1. Faculty opens **Reports > Class Performance**.
2. Picks a **subject** from the dropdown (only assigned subjects) and an **academic year**.
3. The system loads the subject's grading data and builds the score sheet:
   - Rows: one per student.
   - Columns: one per activity (title as header, description on hover), then overall grade, **student status**, and risk flag.
4. Faculty can sort, filter, and search the sheet.
5. Faculty can export the sheet to Excel/CSV.
6. Later phases add the pivot panel beside the sheet and the Performance Comparison page.

### What the score sheet shows

| Column            | Source                                                        |
| ----------------- | ------------------------------------------------------------- |
| Student name / ID | student records                                               |
| Activity columns  | grading system: activity title, description, score, max score |
| Overall grade     | computed (see logic below)                                    |
| Student status    | computed from grades                                          |
| Risk flag         | same logic as the StudentRisk module                          |

Ungraded activities show as empty ("not yet graded"), not as zero.

## 13. Feature Logic

The cutoffs below are **settings** (set from the school's official grading scale), not hardcoded values.

### 13.1 Activity percentage

```
percentage = score / max_score * 100
```

If the activity is not graded yet, the value is empty and is excluded from every average and count.

### 13.2 Overall grade per student

```
overall = average of the student's graded activity percentages
```

If the subject uses weighted grading (e.g., exams count more), use the weights instead:

```
overall = sum(percentage_i * weight_i) / sum(weight_i)   -- graded activities only
```

Use one rule everywhere so the score sheet, pivot, and comparison always match.

### 13.3 Student status (bands)

Applied to an activity percentage or to the overall grade:

```
if value >= HIGH_CUTOFF        -> "Performed well"
else if value >= PASSING_GRADE -> "Average"
else                           -> "Struggling"
```

- `PASSING_GRADE` comes from the school's grading scale.
- `HIGH_CUTOFF` is set by the school or department (a value comfortably above passing).
- Both live in a settings table so they can change without code changes.

### 13.4 At-risk flag

Reuse the StudentRisk module's rule so numbers match on every page:

```
risk_flag = StudentRisk.isAtRisk(student, subject)
```

Do not create a second, different at-risk definition in Reports.

### 13.5 Summary cards

```
total_students   = count of students in the subject (per your rule for dropped students)
at_risk_count    = count where risk_flag = true
at_risk_percent  = at_risk_count / total_students * 100
status_counts    = count of students per status band (overall grade)
```

Always show the count beside the percentage.

### 13.6 Activity performance

For a selected activity:

```
well_count      = students with status "Performed well"
average_count   = students with status "Average"
struggling_count = students with status "Struggling"
activity_average = average of percentages (graded students only)
```

This tells faculty where students excel and where they need extra support.

### 13.7 Pivot logic

- The pivot reads the same dataset as the grid (one row per student per activity), after the grid's filters are applied.
- Faculty choose fields for Filters, Rows, Columns, and Values.
- Aggregations: count, sum, average, min, max, % of total.
- Presets (At-risk students, Whole class, Per activity, By section) only set default field placement.

### 13.8 Performance comparison logic

```
terms = academic years in which this faculty handled the same course_code
for each metric in [average_grade, passing_rate, at_risk_rate]:
    delta = current_term_value - past_term_value
    if abs(delta) <= SAME_MARGIN  -> "About the same"
    else if delta > 0             -> "Better"   (for at_risk_rate, higher is Worse)
    else                          -> "Worse"    (for at_risk_rate, lower is Better)
```

- `SAME_MARGIN` starts at 2 to 3 percentage points and is adjustable.
- `passing_rate = students with overall >= PASSING_GRADE / graded students * 100`.
- **At-risk rate is reversed:** a lower value is better.
- Show class size for each term beside the metrics.
- Summary line example: "Passing rate is up 6 points vs. 2025-2026."
- If there is no earlier term for the course code, show an empty state.

## 14. Documentation Notes (for the system write-up)

Use this wording in the system documentation:

> **Reports Module.** The Reports module gives faculty descriptive analytics on student performance. The Class Performance page presents a score sheet generated from the grading system, with a pivot table for summarizing many rows of data by student, section, activity, or status. The Performance Comparison page compares the current term with earlier terms of the same course code and labels each metric as better, worse, or about the same. Student status is computed from grade bands based on the school's grading scale, and the at-risk flag uses the same rule as the StudentRisk module. Access is limited to the faculty member assigned to the subject.

Also document:

- The settings that control the logic (passing grade, high cutoff, same-margin).
- The data source for the score sheet (the grading system tables).
- That comparison results are trend indicators and not proof of teaching effectiveness.
