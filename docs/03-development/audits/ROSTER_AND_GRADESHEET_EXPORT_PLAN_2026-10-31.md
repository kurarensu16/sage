# Roster and gradesheet export — audit and plan

**Date:** 2026-10-31 · **Status:** Plan, not implemented
**Raised during:** QA pass A, Stage 3

Two related pieces of work, neither of which belongs to the grading cycle. Export
is an improvement to how people get information *out* of ASPIRE; nothing in
Objectives 2 through 7 depends on it. **Build after pass A.**

---

## Part 1 — Faculty gradesheet mixes off-block students into the official sheets

### What was reported

Exporting the gradesheet from **Faculty → Scorebook** produced a workbook with a
**single set of sheets**, with cross-enrolled (off-block) students listed among
the block students. No companion set was present.

### Why that is wrong

The registrar files grades against a section's **block masterlist**, which holds
only the students whose home section it is. A student who takes this offering
from another block belongs on a different masterlist. Mixing them hands the
registrar rows it cannot file.

### What the code already does

The whole mechanism exists and, read end to end, looks correct:

| Piece | Where | State |
|---|---|---|
| `getEnrollmentType(studentSection, classSection)` | `classRoomService.js:17` | correct — null home section or null class section both yield `Irregular` |
| `getClassPriorityRoster()` sets `enrollment_type` / `is_irregular` | `classRoomService.js:487` | correct |
| `ScoreInput` labels each student | `ScoreInput.jsx:522` | correct — takes the priority roster's value, else computes it |
| `partitionByEnrollment(students)` | `excelExport.js:667` | correct — splits on `is_irregular ?? enrollment_type === 'Irregular'` |
| `triggerExcelExport` builds a companion set | `excelExport.js:680` | correct — only when `irregular.length > 0` |

`partitionByEnrollment` carries a documented fallback: *"A roster carrying no
classification at all stays whole and counts as block, so an unclassified caller
keeps today's single-set workbook instead of silently dropping students."* That
fallback produces exactly the reported symptom — but the caller **does** classify,
so it should not have been reached.

### Therefore: reproduce before changing anything

The report came from a session that was demonstrably serving a **stale cached
bundle** — the same session where the user importer rejected a role with a valid
list that included `office`, a string that exists nowhere in the repository. That
cache has since been cleared, and `registerServiceWorker.js` now unregisters a
leftover production worker in development.

**Step 1 is to export again on a confirmed-fresh build.** If the companion sheets
appear, there is nothing to fix and this part of the plan closes.

### If it does reproduce

Two candidates, in order of likelihood:

1. **No student in that class is actually off-block.** Confirm with the data
   first — for each enrolled student, compare `users.section_id` against the
   class's `section_id`. If every row is Regular, the export is right and the
   expectation was wrong.
2. **`enrollment_type` is arriving as `Regular` for an off-block student.**
   `ScoreInput.jsx:522` prefers `pInfo.enrollment_type` from the priority roster
   over its own calculation. If the priority roster ever returns a value for a
   student it should not have classified, the correct local calculation is
   discarded. The fix would be to prefer the locally computed value, or to drop
   the priority roster's classification entirely so one function owns the call.

### Guard against regression

There is already `npm run verify:excel-export` (`scripts/verifyExcelGradeExport.js`).
Whatever the outcome, add a case to it that passes a roster containing one
off-block student and asserts the workbook contains a companion set. A silent
fallback with no test is how this became invisible.

---

## Part 2 — Faculty and Dean cannot produce a roster document

### The gap

| Role | Exports today | Missing |
|---|---|---|
| Registrar | `SectionMasterlist` — Print + PDF, home roster **and** irregular enrollees per subject | — |
| Dean | `SummaryReports` — Excel and PDF, audit-logged | a roster |
| Faculty | `ScoreInput` — Excel gradesheet, audit-logged | a roster |

Neither is powerless; both already export. What neither can produce is the
**roster document** itself, so both must ask the Registrar for a list of their
own students.

### Why it should be allowed

A faculty member already sees every student's name and ID number in their
Scorebook, and can export a spreadsheet containing those names **plus grades**.
Withholding a plain roster — strictly less information — protects nothing. The
restriction is a workflow bottleneck, not a privacy control.

### Design

**The unit differs by role, and it is not cosmetic.**

- The Registrar's document is *a section*: its block masterlist, plus whoever
  from elsewhere takes its subjects, grouped per subject offering.
- A faculty member's unit is *one class* — subject plus section. They have no
  business seeing the section's other subjects. Their document is a **class
  roster with off-block students marked**, not a section masterlist with
  companion lists.
- A Dean needs both: one class, and all classes in their college.

**Scope maps onto authority that already exists.** `is_assigned_faculty()` for a
faculty member's own class; `can_load_faculty_for_department()` for a Dean within
their own college. No new authorization concept is required.

**Build it once.** Three separate `html2pdf` implementations of the same document
will diverge the first time a header changes. One shared, role-scoped component,
following the pattern `FacultyLoadingWorkspace` already uses for the Registrar
and Dean pages. The data layer is already shared and reusable as-is:
`getSectionHomeRoster()` and `getSectionIrregularEnrollees()`.

### Two lines to hold

- **No grades on the roster.** The gradesheet export exists for that, and carries
  its own handling expectations. A roster that grows a grade column becomes a
  different document with different privacy rules, and that drift happens one
  "can we just add…" at a time.
- **Log the college-wide export.** A Dean exporting every section is hundreds of
  names and ID numbers in one file. Allow it, but record who generated it —
  `SummaryReports` already logs its exports through `logActivity('File Export', …)`
  and that pattern should be followed.

---

## Sequencing

1. **After pass A.** Both parts touch the Faculty and Dean portals, which
   Stages 4 through 9 run through. Building mid-pass invalidates ticked boxes.
2. Part 1 first, and begin by reproducing. It may close without a code change.
3. Part 2 second. It is additive — new component, two routes, two sidebar
   entries.

## Documentation

Part 2 is **new scope the paper does not describe**. The thesis documents the
Registrar's masterlist only. If built, Chapter 2's Faculty and Dean portal
sections need the module added, and it reads well against Objective 1: each role
produces its own official list, scoped to what they are responsible for.

Part 1 is a fix to documented behaviour and needs no paper change.
