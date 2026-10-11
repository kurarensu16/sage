# Student pages: include classes joined from another section

- **Date:** 2026-10-11 21:31 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** None

## Files changed
- `src/pages/student/Attendance.jsx`
- `src/pages/student/AcademicInsights.jsx`
- `src/pages/student/MySubjects.jsx`
- `src/pages/student/MyGradesList.jsx`

## What changed and why
An approved join-by-code request creates an enrollment with the **joined class's section** (`resolve_class_join_request`). Several student pages looked up classes using only the student's block section, so a class joined from another section was missing or showed empty data:

| Page | Before | Now |
|---|---|---|
| Attendance & Warnings | Used the first enrollment's section for every subject, so a joined class showed 0 absences (hiding an FDA warning) | Each enrollment is matched to its own class by subject and section; enrollments are de-duplicated by subject and section |
| AI Study Tutor | Classes from the block section only | Classes matched to every enrollment by subject and section (still active classes only, as before) |
| My Subjects, Grade Report | Enrollments and classes filtered by the block section of the selected term; with no section, every section's class was listed | Enrollments filtered by the selected **term** (semester and school year, ignoring an "AY" prefix), and classes matched by subject and section |

The student dashboard already matched by subject and section and is unchanged. Faculty, Dean and report queries were checked and already match by section and subject.

## How to verify
1. Have a BSIT-1A student join a BSIT-1B class by code; the instructor approves it.
2. My Subjects and Grade Report (current term) list the joined class once, with its own instructor.
3. Record an absence in the joined class. Attendance & Warnings shows it under that class.
4. The AI Study Tutor includes the joined class in its subjects and running GWA.
5. A student with no joined class sees each subject once, as before.
6. `npm run lint` (0 errors), `npm run verify:grading`, `npm run verify:insights`, and `npm run build` pass.
