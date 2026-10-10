# ASPIRE Frontend QA Checklist — October 2026 Changes

**Purpose:** Validate the current user-facing changes before release.  
**Scope:** Frontend behavior, connected Edge Function behavior, and visible database results. Future RLS hardening is excluded.  
**Supported roles:** Admin, Dean, Faculty, Student. The retired Office role is out of scope.

## 1. QA result convention

Record one result for every case:

- **PASS** — behavior and visible data match the expected result.
- **FAIL** — behavior is incorrect, incomplete, or produces an unexpected error.
- **BLOCKED** — the environment, account, class, or data required for the test is unavailable.
- **NOT APPLICABLE** — approved by the test lead with a written reason.

For every failure, capture:

- test-case ID;
- role and test account;
- class, Student, term, and academic period;
- exact steps performed;
- expected and actual result;
- screenshot or screen recording;
- browser console error;
- related Supabase Edge Function or database log, when applicable;
- whether refreshing the page changes the result.

## 2. Required test environment

Use test data only. Do not use real Student records for destructive or grade-posting scenarios.

Prepare:

- one Admin account;
- one Dean account;
- two Faculty accounts with different assigned classes;
- at least four Student accounts;
- one active regular-semester class;
- one active summer class, if summer behavior will be released;
- one archived class with a previously submitted evaluation;
- activities containing positive scores, recorded zeros, and blank scores;
- one Student with no evaluation;
- one Student with a saved AI draft;
- one Student with a submitted legacy recovery/retention evaluation;
- one Student with a submitted Academic Intervention evaluation;
- OpenRouter credentials and deployed `generate-intervention-draft` Edge Function.

Recommended browsers:

- latest Chrome or Edge on desktop;
- one narrow/mobile viewport;
- one additional browser when available.

## 2A. Navigation map

Use the normal sidebar navigation unless the test explicitly requires opening a direct URL. The URL is included so the tester can confirm that the correct screen loaded.

### Faculty navigation

| Test area | Sidebar navigation | URL | Continue to |
|---|---|---|---|
| Log Class Scores | **Grades → Log Class Scores** | `/faculty/scoreinput` | Select class and grading tab |
| Preview & Post Grades | **Grades → Preview & Post Grades** | `/faculty/gradecomputationpreview` | Select class, tab, preview, post, or export |
| Posted Grades | Open from Preview/Post workflow | `/faculty/postedgradesview` | Select posted milestone or export |
| Class roster | **Classes → My Class Records** | `/faculty/classrecordslist` | Open an active class |
| Evaluate Students | **Student Risk → Evaluate Students** | `/faculty/evaluatestudent` | Select class and grading term |
| Evaluated Students | **Student Risk → Evaluated Students** | `/faculty/evaluatedstudents` | Switch current/history ownership filters |
| Class Performance | **Performance Reports → Class Performance** | `/faculty/reports/class-performance` | Select class and filters |
| Performance Comparison | **Performance Reports → Performance Comparison** | `/faculty/reports/comparison` | Select comparison classes/periods |
| Dashboard risk chart | **Dashboard** | `/faculty/dashboard` | Review Cohort Risk Distribution |
| Attendance | **Attendance → Attendance Monitoring** | `/faculty/classattendance` | Select active class/session |
| Consultations | **Consultations → Consultation Requests** | `/faculty/consultations` | Open an assigned request |

### Student navigation

| Test area | Sidebar navigation | URL | Continue to |
|---|---|---|---|
| My Grades | **Grades → My Grades** | `/student/mygradeslist` | Select academic period or Subject |
| Grade detail | Open a Subject from My Grades | `/student/mygradesdetail` | Verify released activity and term details |
| Advising Inbox | **Academic Support → Advising Inbox** | `/student/advising-inbox` | Open the submitted intervention |
| Academic Insights | **Academic Support → Academic Insights** | `/student/academic-insights` | Select Subject and generate/view insight |
| Consultations | **Consultations** | `/student/consultations` | Create or inspect a request |
| Attendance | **Attendance** | `/student/attendance` | Select Subject/period |

### Dean navigation

| Test area | Sidebar navigation | URL | Continue to |
|---|---|---|---|
| At-Risk Students | **Student Risk → At-Risk Students** | `/dean/atriskstudents` | Select risk/referral view |
| Escalated cases | **Student Risk → Escalated Cases** | `/dean/escalatedcases` | Open a referred evaluation |
| Intervention outcomes | **Student Risk → Intervention Results** | `/dean/interventionresults` | Review outcome tracking |
| Summary Reports | **Reports → Summary Reports** | `/dean/summaryreports` | Select report, department, semester, and year |
| Grade Posting Status | **Grades → Grade Posting Status** | `/dean/gradepostingstatus` | Inspect class posting and unlock state |
| Remark Overrides | **Grades → Remark Override Requests** | `/dean/remarkoverriderequests` | Open a pending request |

### Admin navigation

| Test area | Sidebar navigation | URL | Continue to |
|---|---|---|---|
| Grade computation templates | **Academic Setup → Grade Computations** | `/admin/gradecomputationslist` | Create or edit a template |
| Audit Log | **System → Audit Log** | `/admin/auditlog` | Filter, inspect, or export events |
| User management | **Users → User List** | `/admin/userlist` | Inspect supported roles/status |

## 2B. End-to-end QA flows

These flows connect the individual test cases and identify where the result must appear next.

### Flow A — Blank score to official zero and updated standing

```text
Faculty: Grades → Log Class Scores
  → select class and term
  → leave required fields blank
  → save and verify they remain blank
  → open Preview & Post Grades
  → choose the posting milestone
  → review affected Students and fields
  → confirm Convert to Zero & Release
  → verify posted/current standing

Student: Grades → My Grades
  → select the same academic period and Subject
  → verify released zero and updated standing

Faculty: Student Risk → Evaluate Students
  → open the same Student
  → verify Recorded Zeros and updated risk evidence

Dean: Reports → Summary Reports
  → select matching department/period
  → verify the released result when included
```

Use QA-GRADE-001 through QA-GRADE-009, QA-EVAL-005, QA-STUDENT-GRADE-001, and QA-CROSS-001.

### Flow B — Initial AI intervention to Student completion

```text
Faculty: Student Risk → Evaluate Students
  → select active class and term
  → click Evaluate
  → generate or restore AI draft
  → edit tasks and add manual/AI tasks
  → enter Faculty Observation and Academic Guidance
  → choose a future Plan Completion Date
  → submit official evaluation

Faculty: Student Risk → Evaluated Students
  → verify submitted case, tasks, and plan date

Student: Academic Support → Advising Inbox
  → open the new Academic Intervention Plan
  → verify guidance, tasks, and plan date
  → report a task complete

Faculty: Student Risk → Evaluated Students
  → refresh and verify reported progress

Dean: Student Risk → Escalated Cases
  → verify only if Faculty requested Dean review
```

Use QA-EVAL-001 through QA-EVAL-012, QA-HISTORY-001 through QA-HISTORY-004, QA-INBOX-001 through QA-INBOX-003, and QA-CROSS-002/003.

### Flow C — Additional AI task with existing tasks preserved

```text
Faculty: Student Risk → Evaluate Students
  → open a restored/generated three-task draft
  → edit one task
  → optionally add one manual task
  → click Suggest with AI
  → verify one new task is appended
  → verify all earlier tasks and edits remain
  → refresh before official submission
  → reopen the same Student and verify the saved draft
```

Use QA-EVAL-004 and QA-EVAL-006 through QA-EVAL-009.

### Flow D — Risk terminology consistency

```text
Faculty: Dashboard
  → verify Safe, Watch, High, Critical distribution
Faculty: Performance Reports → Class Performance
  → compare Performance Status and At-Risk Standing
Faculty: Student Risk → Evaluate Students
  → compare Student risk tier and diagnostic evidence
Faculty: Student Risk → Evaluated Students
  → compare frozen evaluation badge with current standing
Dean: Student Risk → At-Risk Students
  → verify the same evaluation terminology
Student: Academic Support → Advising Inbox
  → verify Academic Intervention or explicit Legacy label
```

Use QA-RISK-001 through QA-RISK-003, QA-HISTORY-004, QA-DEAN-003, and QA-INBOX-003.

### Flow E — Export traceability

Perform exports from each source screen, then verify them centrally:

```text
Faculty: Log Class Scores / Preview & Post Grades / Posted Grades / Class Performance
Dean: Summary Reports
Student: My Grades → Print unofficial grade slip
Admin: Audit Log → Export CSV

Admin: System → Audit Log
  → filter Action = File Export or search actor/class/report
  → verify each initiation event
  → export the filtered ledger
  → refresh and verify the Audit Log export event itself
```

Use QA-GRADE-010, QA-RISK-004, QA-AUDIT-001 through QA-AUDIT-004, QA-DEAN-002, and QA-STUDENT-GRADE-002.

### Flow F — Grade computation template compatibility

```text
Admin: Academic Setup → Grade Computations
  → create a new structural template
  → edit an existing template
  → verify only percentages are editable

Faculty: Classes → My Class Records
  → open a class using that template
  → open grading setup or Log Class Scores
  → verify activities remain assigned to the same components
  → verify calculations use the updated percentages
```

Use QA-TEMPLATE-001 through QA-TEMPLATE-003.

## 3. Release-blocking rules

Do not release if any of the following occurs:

- a blank grade is posted without Faculty review and confirmation;
- a blank grade is shown as zero before posting;
- a recorded zero is described as missing or ungraded;
- the wrong Student receives an evaluation, plan, or notification;
- AI drafts are published without Faculty submission;
- an evaluation draft disappears after refresh when it was expected to be saved;
- adding an AI task removes or replaces existing tasks;
- current and archived class filters expose the wrong evaluation set;
- a grade computation edit disconnects existing activities;
- an export action crashes or exports the wrong class/period;
- a failed operation is presented as successfully completed.

## 4. Faculty — Log Class Scores

### QA-GRADE-001: Blank score remains ungraded

1. Open an active class in **Log Class Scores**.
2. Leave an activity cell blank.
3. Enter positive numeric scores in other cells.
4. Save, refresh, and reopen the class.

Expected:

- the blank cell remains blank;
- the blank cell is not displayed as `0`;
- other scores remain saved;
- calculations exclude the blank activity from earned and possible totals;
- the page explains that blank means not yet graded.

### QA-GRADE-002: Recorded zero remains a numeric score

1. Enter `0` in an activity cell.
2. Save and refresh.

Expected:

- the cell displays `0` after refresh;
- it contributes to grade and risk calculations as a recorded zero;
- it is not counted as Pending/Ungraded.

### QA-GRADE-003: Clearing a saved score

1. Enter and save a numeric score.
2. Clear that same cell.
3. Save and refresh.

Expected:

- the cell is blank after refresh;
- the previous score does not return;
- the cleared score is excluded from calculations;
- no unrelated Student score changes.

### QA-GRADE-004: Completely blank term

1. Clear every score, character rating, and exam value for one Student and term.
2. Save and refresh.

Expected:

- the term remains pending/ungraded;
- no artificial zero term rating appears;
- other terms remain unchanged.

### QA-GRADE-005: Posting with no blank required fields

1. Complete every required field for the selected milestone.
2. Start grade posting.

Expected:

- normal posting confirmation appears;
- no blank-to-zero Student list appears;
- posting completes normally;
- the current standing reflects the posted values.

### QA-GRADE-006: Posting with blank required fields

1. Leave required fields blank for multiple Students.
2. Start posting Midterm, tentative final, or semestral grades.

Expected:

- posting pauses before release;
- the review shows the total blank-field count;
- every affected Student is named;
- every affected term and field is listed;
- the message explains that those blanks will become official zeros;
- no conversion occurs until Faculty confirms.

### QA-GRADE-007: Cancel blank-to-zero review

1. Reach the blank-field review.
2. Cancel or close it.
3. Inspect the score sheet and database-visible UI.

Expected:

- blanks remain blank;
- grades are not posted;
- no current-standing or risk change is released.

### QA-GRADE-008: Confirm blank-to-zero conversion

1. Reach the blank-field review.
2. Select **Convert to Zero & Release**.
3. Reopen the score sheet and affected Student views.

Expected:

- only reviewed required blanks become numeric zeros;
- posting completes;
- current standing, pass/fail status, and risk evidence use the new zeros;
- unrelated terms and Students remain unchanged;
- released Student-facing data matches the Faculty view.

### QA-GRADE-009: Milestone term coverage

Verify separately:

- regular Midterm uses Prelim and Midterm;
- regular tentative final uses Semi-Final and Final;
- regular semestral posting uses all required terms;
- summer milestone behavior follows the approved summer-term configuration.

Expected: the blank review includes only fields required for the selected milestone.

### QA-GRADE-010: Grade-sheet exports

Test Excel and PDF exports with data and with no available data.

Expected:

- valid exports use the selected class and grading tab;
- empty PDF export is safely ignored;
- no page crash occurs;
- an export-initiation event appears in the Admin Audit Log.

## 5. Faculty — Evaluate Students and AI intervention

### QA-EVAL-001: Initial AI draft generation

1. Open **Evaluate Students**.
2. Select an active class and grading term.
3. Click **Evaluate** for a Student without an evaluation.

Expected:

- the generate-draft confirmation identifies the correct Student, class, and term;
- privacy guidance is visible;
- generation creates exactly three initial tasks;
- the draft is clearly marked as requiring Faculty review;
- nothing is published to the Student yet.

### QA-EVAL-002: Slow AI response

Expected:

- an initial progress message appears;
- after the configured delay, a friendly “taking longer” message replaces it;
- no technical provider/model terminology is shown to Faculty.

### QA-EVAL-003: AI failure and manual continuation

Simulate or encounter a failed generation.

Expected:

- a nontechnical error appears;
- Faculty can retry;
- Faculty can continue manually;
- the modal remains usable and does not lose entered Faculty data.

### QA-EVAL-004: Saved AI draft restoration

1. Generate a draft but do not submit the official evaluation.
2. Close or refresh the page.
3. Click **Evaluate** again for the same Student, class, and term.

Expected:

- the saved draft is restored;
- a duplicate initial plan is not generated automatically;
- the three tasks and summary match the saved draft.

### QA-EVAL-005: Diagnostic Pending versus Recorded Zeros

Use a Student with both blank and zero activity scores.

Expected:

- Pending shows only blank/ungraded activities;
- Recorded Zeros shows only numeric zero scores;
- risk points come from recorded zeros according to the configured rule;
- the AI summary does not call zeros “missing work.”

### QA-EVAL-006: Add a manual task

Expected:

- one new editable task is appended;
- existing tasks remain unchanged;
- the count updates correctly;
- no more than five tasks can be added.

### QA-EVAL-007: Suggest an additional AI task

1. Begin with three existing tasks.
2. Edit at least one task.
3. Add a manual task if space permits.
4. Click **Suggest with AI**.

Expected:

- exactly one new AI task is appended;
- every existing task remains present and unchanged;
- the suggestion avoids duplicating the existing tasks;
- the count becomes four or five as appropriate;
- the button is disabled at five tasks;
- AI source and expected deliverable are visible.

### QA-EVAL-008: Additional AI task failure

Expected:

- existing tasks remain intact;
- a friendly retry/manual message appears;
- no empty task is appended;
- Faculty-entered notes and guidance remain intact.

### QA-EVAL-009: AI task editing

Expected:

- Faculty can edit the AI description and expected deliverable;
- the AI label remains visible;
- the edited task is submitted with the Faculty-reviewed plan.

### QA-EVAL-010: Plan completion date

Expected:

- past dates cannot be selected;
- the current date cannot be selected;
- only future dates are accepted;
- submission is disabled or rejected without a valid date;
- all submitted tasks receive the same completion date.

### QA-EVAL-011: Required Faculty text

Verify submission validation for:

- Restricted Faculty Observation;
- Student-Visible Academic Guidance;
- at least one actionable task;
- referral reason when Dean review is selected.

Expected: missing required content produces clear user-facing validation and no partial submission.

### QA-EVAL-012: Official submission

Expected:

- the evaluation is saved for the correct Student/class/term;
- AI content is published only after Faculty confirmation;
- the roster changes from Not evaluated to the saved status;
- the Student Advising Inbox receives the Student-visible guidance and tasks;
- restricted Faculty observation is not visible to the Student.

## 6. Faculty — Evaluated Students

### QA-HISTORY-001: Initial current-assignment load

1. Open **Evaluated Students** directly after login.
2. Leave Ownership on **Currently assigned classes**.

Expected:

- current evaluations load immediately;
- switching to history first is not required;
- only active currently assigned classes appear in the Class selector.

### QA-HISTORY-002: Authored history

1. Switch to **Authored history (read-only)**.

Expected:

- previously authored evaluations appear, including archived classes;
- history is read-only;
- switching back restores current-assignment results.

### QA-HISTORY-003: Academic-period and class filters

Expected:

- All academic periods works on initial load;
- selecting a period updates available grading terms and results;
- class options respect current versus history ownership;
- no stale empty result remains after switching ownership.

### QA-HISTORY-004: Evaluation terminology and plan date

Expected:

- new records show Academic Intervention;
- old records are clearly marked Legacy Passing Recovery or Legacy President’s Lister Retention;
- one plan completion date is shown;
- tasks do not repeat the same due date unnecessarily.

## 7. Faculty — Dashboard and performance pages

### QA-RISK-001: Dashboard distribution

Expected:

- chart categories are Safe, Watch, High, and Critical;
- totals match the visible Student population;
- President’s List candidates are not mixed into risk categories;
- the card title is Cohort Risk Distribution.

### QA-RISK-002: Risk education notes

Verify the note on:

- Faculty Dashboard;
- class roster;
- class performance;
- performance comparison;
- Evaluate Students;
- Evaluated Students;
- grade logging where applicable.

Expected: explanations consistently distinguish grade performance, risk tier, tentative data, pending scores, and evaluation history.

### QA-RISK-003: Class Performance pending classification

Expected:

- Students without enough grade data are reported as pending;
- blanks are not converted to zero for the display;
- performance status and at-risk standing remain separate columns/concepts;
- column help text is accurate.

### QA-RISK-004: Class Performance export

Expected:

- Excel export reflects the selected class and filtered Students;
- an export-initiation audit event is recorded.

## 8. Admin — Grade computation templates

### QA-TEMPLATE-001: Create a new template

Expected:

- Admin can define the name, description, components, maximum scores, behavior, and weights;
- required validation remains functional;
- the total weighting rule is enforced.

### QA-TEMPLATE-002: Edit an existing template

Expected:

- Admin can change component percentages;
- template name and description are disabled;
- component names, maximum scores, multiple-entry behavior, addition, and removal are disabled;
- explanatory text says structural changes require a new template.

### QA-TEMPLATE-003: Preserve existing activity relationships

1. Edit weights on a template already used by a class.
2. Reopen the affected class and its activities.

Expected:

- activities remain connected to their original components;
- no component UUID or activity association is lost;
- grade calculations use the updated weights.

## 9. Admin — Audit Log and exports

### QA-AUDIT-001: Enriched audit display

Expected where data is available:

- operation;
- actor and actor role;
- entity type and ID;
- source;
- descriptive message;
- timestamp.

### QA-AUDIT-002: Audit search

Expected: search matches message, actor, role, entity type, and entity ID.

### QA-AUDIT-003: Audit CSV

Expected:

- CSV includes the enriched audit fields;
- only the filtered rows are exported;
- exporting the ledger creates a File Export audit event;
- CSV values containing punctuation do not corrupt columns.

### QA-AUDIT-004: Cross-page export coverage

Confirm visible audit events after initiating:

- Admin Audit Log CSV;
- Dean report Excel, PDF, and print;
- Faculty class-performance Excel;
- Faculty score-sheet Excel and PDF;
- Faculty grade-preview Excel and PDF;
- Faculty posted-grade Excel and PDF;
- Student unofficial grade-slip print.

Expected: the event describes an export initiation, identifies the actor, and references the relevant report/class/period without exposing restricted content.

## 10. Dean — Reports and evaluation context

### QA-DEAN-001: Summary report context labels

Expected:

- new records use Academic Intervention;
- historical recovery and honors plans are marked Legacy;
- report filters and totals continue to work.

### QA-DEAN-002: Report export guards

Expected:

- Excel, PDF, and print use the selected report, department, semester, and academic year;
- PDF does not start when the report has no data;
- the page does not crash;
- audit events appear for initiated exports.

### QA-DEAN-003: At-risk Student context

Expected: Dean views use the same context names as Faculty and Student pages without changing historical risk snapshots.

## 11. Student — Academic Insights

### QA-INSIGHT-001: Released activities only

Prepare one released and one unreleased activity.

Expected:

- Student Academic Insights uses only the released activity;
- unreleased scores or activity details are not presented by the AI.

### QA-INSIGHT-002: Ungraded versus zero language

Expected:

- blank/null scores are described as ungraded or pending;
- numeric zeros are described as recorded zero scores or low performance;
- zeros are not called missing submissions unless an independent submission status proves that statement;
- the AI does not invent submission status.

## 12. Student — Faculty Advising Inbox

### QA-INBOX-001: Published intervention visibility

Expected:

- only submitted/published evaluation content appears;
- Restricted Faculty Observation is never displayed;
- Student-Visible Academic Guidance is displayed;
- all assigned tasks appear in their correct order.

### QA-INBOX-002: Plan completion date and progress

Expected:

- one plan completion date appears above the tasks;
- repeated target dates are removed from individual tasks;
- task completion progress is correct;
- completed tasks show their completion date.

### QA-INBOX-003: Legacy labels

Expected:

- current records show Academic Intervention Plan;
- older records retain appropriate Legacy labels;
- label changes do not alter tasks or progress.

## 13. Student — My Grades

### QA-STUDENT-GRADE-001: Blank and zero display

Expected:

- unreleased or ungraded values do not appear as zero;
- released numeric zero values remain zero;
- current/tentative standing matches the Faculty-released data.

### QA-STUDENT-GRADE-002: Unofficial grade-slip print

Expected:

- print view uses the selected academic period;
- printing does not change grades;
- an export-initiation audit event appears.

## 14. Cross-role consistency tests

### QA-CROSS-001: Grade release propagation

After confirmed posting with blank-to-zero conversion, compare:

- Faculty Score Input;
- Faculty Class Performance;
- Faculty Evaluate Students;
- Student My Grades;
- Student Academic Insights;
- Dean reports, where included.

Expected: every page uses the same released values and correctly distinguishes zero from ungraded.

### QA-CROSS-002: Evaluation propagation

After Faculty submits an Academic Intervention:

- Faculty roster shows it as evaluated;
- Faculty Evaluated Students shows the case;
- Student Advising Inbox shows only Student-visible content;
- Dean sees the case only when its workflow makes it eligible;
- plan tasks and completion date match across views.

### QA-CROSS-003: Refresh persistence

Refresh after each of the following:

- saved score draft;
- cleared score;
- generated AI draft;
- manually added task;
- official evaluation submission;
- Student task completion.

Expected: persisted states return accurately; unsaved local edits are not falsely represented as official database state.

### QA-CROSS-004: Wrong-user regression

Repeat relevant tests using a second Faculty member and Student.

Expected: changing class, Student, or role does not retain the previous user's draft, modal data, task list, score, or filter state.

## 15. Responsive and usability checks

On desktop and a narrow viewport, verify:

- modals remain scrollable and closable;
- primary buttons remain visible;
- long Student names and task descriptions do not cover controls;
- blank-review Student lists are readable;
- task fields and expected deliverables remain editable;
- date controls show the correct minimum date;
- loading and disabled states are visually clear;
- keyboard focus reaches modal controls in a sensible order;
- error messages are understandable and contain no model/provider internals.

## 16. QA sign-off summary

| Area | Tester | Date | Passed | Failed | Blocked | Release approved |
|---|---|---:|---:|---:|---:|---|
| Faculty grading/posting | | | | | | |
| Faculty evaluation/AI | | | | | | |
| Faculty reports/dashboard | | | | | | |
| Admin templates/audit | | | | | | |
| Dean reports/risk | | | | | | |
| Student insights/inbox/grades | | | | | | |
| Cross-role consistency | | | | | | |
| Responsive/accessibility | | | | | | |

### Final approval conditions

- All release-blocking cases pass.
- Every failed nonblocking case has an owner and accepted disposition.
- Cross-role data is consistent after refresh.
- AI failures leave the manual workflow usable.
- Export events are traceable in the Audit Log.
- No restricted Faculty note appears in a Student view.
- Test evidence is stored with the release record.
