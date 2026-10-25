# Navigation and Academic Archives Implementation Plan

**Date:** 2026-10-25  
**Status:** Phase 1 complete; Phase 2 implemented locally, synchronized with both Word documents, and passing automated verification; authenticated browser acceptance remains pending  
**Scope:** All four portals (Student, Faculty, Dean, and Academic Administrator)  
**Database migration expected:** No. Existing academic-term, class-record, attendance, evaluation, consultation, intervention, and posted-grade relationships are sufficient for the planned work.

## 1. Objective

Implement the approved improvements in two controlled phases:

1. **Phase 1 - Navigation and naming:** make every portal easier to follow, remove duplicate or contextless entry points, and preserve all valid routes and deep links.
2. **Phase 2 - Academic archives:** add consistent, filtered, read-only historical views without mixing records from different academic periods or overwhelming users with all historical data at once.

Each phase includes a mandatory documentation-sync step. After the system changes pass QA, the verified terminology and behavior must be applied to both the repository documentation and the two thesis Word files. A phase is not considered complete while the paper still describes the previous interface or workflow.

Navigation must be stabilized before archive controls are introduced. This keeps route behavior, selected-class context, notification links, and user expectations testable at each release gate.

## 2. Guardrails

- Preserve existing route URLs during both phases. Rename visible labels before considering route renames.
- Preserve notification, email, browser-bookmark, and dashboard deep links.
- Preserve `classRecordId`, student, tab, school-year, semester, and academic-period query parameters.
- Do not create a generic archive page that duplicates existing role pages.
- Use `academic_terms.term_id` as the primary filter key. Use `school_year` plus `semester` only as a compatibility fallback for legacy records.
- Opening **Previous Terms**, selecting a school year, or changing a semester must not query historical records. An archive query starts only when the user clicks **Load Archive** with a complete school-year and semester selection.
- Keep draft filter choices separate from the successfully loaded period. The page label, URL, and results must continue identifying the applied period until a new archive load succeeds.
- Put the successfully loaded academic period in the URL when practical so refresh, back/forward navigation, and shared links keep the same view. Incomplete draft selections must not replace the applied URL state.
- Disable duplicate archive submissions while a request is running; ignore or cancel stale responses when a newer request supersedes them.
- Use a truthful indeterminate loading indicator or skeleton such as **Loading archived records...**. Do not display a fabricated percentage when the data layer cannot provide measurable progress.
- Cache archives by authorized user/role and `term_id` where appropriate. Cached data must follow the same authorization and period boundaries as a live query.
- Historical records are read-only after their workflow is completed or their class is archived.
- A prior-term record that still requires an authorized action remains in its operational queue until resolved; it must not be hidden in a read-only archive.
- Do not add an archive to the AI Study Tutor. Only correct its supporting-data queries so current-term advice does not use attendance or grades from another term.
- Do not change grading formulas, risk weights, RLS policies, or grade-posting rules as part of this plan.
- Do not add a database migration unless implementation reveals a verified data-integrity requirement. Any such migration becomes a separately reviewed change.

## 3. Current Baseline

The codebase already contains useful building blocks:

- `src/lib/termStatus.js` loads academic terms, resolves a class to a term, and identifies current, pending, overdue, and archived class states.
- Student **My Subjects** and **Grade Report** already support academic-period selection.
- Faculty **My Classes** uses the shared **Current Term / Previous Terms** contract: opening Previous Terms only reveals school-year and semester selectors, while **Load Archive** retrieves the selected period and stores the successfully applied term in the URL.
- Faculty **Intervention Records** already contains academic-period filtering in its underlying evaluated-student view.
- Dean **Grade Submission Status**, **Grade Corrections**, and **Generate Reports** already contain some historical or academic-period support.
- Admin **Classroom Provisioning**, **Academic Terms**, and **Section Rosters** already expose historical or term-labelled data.
- The selected-class faculty workflow component already connects **Scorebook**, **Review & Post**, and **Posted Grades & Corrections**.

The work therefore focuses on unifying access, correcting labels and route state, applying consistent filters, and preventing cross-term data mixing.

---

## 4. Phase 1 - Navigation and Naming

### 4.1 Target navigation

#### Student portal

| Group | Menu item | Navigation rule |
|---|---|---|
| General | Dashboard | Current-term overview |
| Courses & Grades | My Subjects | Class membership and the only global **Join Classroom** entry point |
| Courses & Grades | Grade Report | Per-period and official grade summary |
| Attendance | Attendance & Warnings | Attendance registry with period context |
| Academic Support | Advisories & Study Plans | Published faculty evaluations and plans |
| Academic Support | AI Study Tutor | Current academic support only; no archive |
| Consultations | Consultations | Requests, open items, and history |

**Contextual only:** **Score Breakdown** remains accessible from a selected subject or grade row because `/student/mygradesdetail` requires a class identifier. It must not appear as a global sidebar destination.

#### Faculty portal

| Group | Menu item | Navigation rule |
|---|---|---|
| General | Dashboard | Current workload and alerts |
| Classes | My Classes | Primary entry point for each classroom |
| Classes | Create Classroom | Opens the existing classroom-creation flow |
| Classes | Enrollment Requests | Faculty approval of class-code join requests |
| Student Support | Evaluate Students | Create or continue an evaluation |
| Student Support | Intervention Records | Published evaluations, study plans, acknowledgments, and follow-up history |
| Attendance | Attendance Monitoring | Current and historical class attendance |
| Consultations | Consultation Requests | Open requests and consultation history |
| Performance Reports | Class Performance | Per-class results |
| Performance Reports | Comparisons & Trends | Cross-class or cross-period comparison |

**Selected-class workflow:** `My Classes -> Scorebook -> Review & Post -> Posted Grades & Corrections`. These are stages of one class workflow, not three competing global destinations.

#### Dean portal

| Group | Menu item | Navigation rule |
|---|---|---|
| General | Dashboard | College-level current overview |
| Grades | Grade Submission Status | Current and historical posting status |
| Grades | Grade Corrections | Searchable SG-correction queue and history |
| Grades | Grade Distribution | Current or selected historical distribution |
| Risk & Interventions | Risk & Honors Overview | Period-correct risk and honors view |
| Risk & Interventions | Escalated Cases | Cases requiring Dean attention |
| Risk & Interventions | Intervention Results | Follow-up and recorded outcomes |
| Reports | Generate Reports | Period-filtered institutional reports |

The three risk destinations remain separate because they represent different tasks, even though they share one page implementation.

#### Academic Administrator portal

| Group | Menu item | Navigation rule |
|---|---|---|
| General | Dashboard | System overview |
| User Accounts | Manage Users | User lifecycle |
| User Accounts | Import Users | Existing CSV/Excel import action |
| Academic Setup | Subjects | Subject catalog |
| Academic Setup | Grading Templates | COG/grading configurations |
| Academic Setup | Manage Sections | Section setup by academic period |
| Academic Setup | Section Rosters | Student roster per section and term |
| Academic Setup | Colleges & Departments | Existing college/department structure |
| Academic Setup | Classroom Provisioning | Administrative class provisioning |
| System | Audit Logs | System audit trail |
| System | Academic Terms | Term setup and rollover |
| System | Grade Override | Existing controlled override workflow |

### 4.2 Implementation work packages

| ID | Existing condition | Planned change | Main files | Effect / acceptance criterion |
|---|---|---|---|---|
| P1.1 | Sidebar items using query parameters can activate both the base link and action link. | Make active-state matching path- and query-aware. | `src/components/layout/Sidebar.jsx` | Exactly one desktop navigation item is active for **My Classes**, **Create Classroom**, **Manage Users**, and **Import Users**. |
| P1.2 | Mobile destinations do not consistently represent the same information architecture as desktop. | Align role-specific bottom navigation with the revised groups and include durable alias routes in match logic. | `src/components/layout/BottomNav.jsx` | Mobile shows one correct active item for every supported route, including `/student/grades` and all Dean risk subroutes. |
| P1.3 | Student has a context-dependent global **Score Breakdown**, duplicate join entry points, inconsistent page titles, and one incorrect consultation link. | Remove Score Breakdown from the sidebar; keep it as a subject/grade action; keep Join Classroom only in My Subjects; route all consultation actions to `/student/consultations`; align page headings with menu labels. | `src/components/layout/Sidebar.jsx`, `src/components/layout/BottomNav.jsx`, `src/pages/student/MySubjects.jsx`, `src/pages/student/MyGradesList.jsx`, `src/pages/student/MyGradesDetail.jsx`, `src/pages/student/Attendance.jsx`, `src/pages/student/FacultyAdvisingInbox.jsx`, `src/pages/student/Consultations.jsx`, `src/App.jsx` if alias handling is needed | No student menu opens an incomplete page. There is one global join action, and all consultation links open the consultation page. |
| P1.4 | Faculty desktop class workflow is partly unified, but mobile still separates Classes and Scores; labels do not fully express the task. | Keep **Create Classroom** as a required item; use **My Classes** as the class hub; preserve the selected-class workflow; rename **Evaluated Students** to **Intervention Records** and **Performance Comparison** to **Comparisons & Trends**; align mobile access. | `src/components/layout/Sidebar.jsx`, `src/components/layout/BottomNav.jsx`, `src/components/faculty/ClassWorkflowNav.jsx`, `src/pages/faculty/ClassRecordsList.jsx`, `src/pages/faculty/StudentRisk.jsx`, `src/pages/faculty/EvaluatedStudents.jsx`, `src/pages/faculty/PerformanceComparison.jsx`, `src/App.jsx` if redirect handling is needed | Faculty can create a class, select a class, enter scores, review/post, and inspect corrections without losing the selected class or being shown duplicate global grade workflows. |
| P1.5 | Dean desktop destinations are valid, but the mobile risk item matches only one of three routes and deep-linked tabs may highlight the wrong item. | Make Dean risk active states cover overview, escalated cases, and intervention results; make query/tab state select the correct desktop item. | `src/components/layout/Sidebar.jsx`, `src/components/layout/BottomNav.jsx`, `src/pages/dean/AtRiskStudents.jsx` | Each Dean risk route or tab highlights the correct destination on desktop and the common **Risk & Interventions** destination on mobile. |
| P1.6 | Admin labels understate or misdescribe the actual page responsibility. | Apply the approved labels: **Colleges & Departments**, **Manage Sections**, **Section Rosters**, **Classroom Provisioning**, **Audit Logs**, **Academic Terms**, and **Grading Templates**. | `src/components/layout/Sidebar.jsx`, `src/components/layout/BottomNav.jsx`, affected `src/pages/admin/*.jsx` page headings and breadcrumbs | Menu, page heading, breadcrumb, empty state, and action text use the same terminology. Existing URLs continue to work. |
| P1.7 | Notifications and Settings are intentionally outside the main task groups. | Retain notifications in the top bar and Settings in the persistent account/footer area. | `src/components/layout/Sidebar.jsx`, existing top-bar component | No duplicate notification or settings destinations are introduced. |
| P1.8 | The thesis Word files can retain old navigation labels and screenshots after the application changes. | After Phase 1 QA passes, update both Word files with the verified role menus, unified faculty class workflow, page names, descriptions, captions, and affected figures. | `C:\Users\JC Gabriel\Downloads\Revised_Statement_of_the_Problem_ASPIRE.docx`; `C:\Users\JC Gabriel\Downloads\ASPIRE Thesis - Chapters 1-2\ASPIRE_Chapters_1-2_Master_UPDATED_2026-10-21.docx` | The paper and application use the same role names, feature names, navigation hierarchy, and faculty workflow. Existing Word formatting, styles, citations, and unrelated content are preserved. |

### 4.3 Phase 1 connection-safety rules

- Do not delete or rename route paths in `src/App.jsx`.
- Where a route is no longer a global menu item, keep the route available for contextual links and old notifications.
- Keep redirect routes such as `/student/grades`, `/student/airecommendation`, and `/faculty/postedgrades` working.
- Keep selected class context in query parameters when moving among faculty workflow pages.
- Do not combine **Evaluate Students** and **Intervention Records** into one page: one creates/updates an evaluation, while the other reviews history and follow-up.
- Do not combine Dean risk pages into one menu item on desktop; only group them under one mobile shortcut where space is limited.

### 4.4 Phase 1 release gate

Phase 2 must not begin until all of the following pass:

- One active navigation item per route on desktop and mobile.
- Direct URL entry and browser refresh preserve the destination.
- Back and forward navigation preserve the selected class and tab.
- Notification links still reach the correct role page.
- Faculty selected-class workflow passes: **My Classes -> Scorebook -> Review & Post -> Posted Grades & Corrections**.
- Student contextual workflow passes: **My Subjects/Grade Report -> Score Breakdown -> Consultations**.
- `npm run lint`
- `npm run build`

---

## 5. Phase 2 - Filtered, Read-Only Academic Archives

### 5.1 Standard archive interaction

Every newly organized historical view follows this sequence:

1. **Current Term** is the default.
2. The user explicitly selects **Previous Terms**.
3. The archive controls appear, but no historical records are fetched.
4. The user selects a **School Year**; this changes only the draft filter and does not fetch records.
5. The user selects a **Semester** (`1st`, `2nd`, or `Summer`); this completes the draft filter but still does not fetch records.
6. The enabled **Load Archive** button is clicked.
7. The system disables repeat submission and shows an indeterminate progress state or loading skeleton.
8. The system resolves the selection to one `academic_terms.term_id` and fetches only that period.
9. After a successful response, the applied period, URL state, result label, and cache key are updated together.
10. The page shows a visible school-year/semester label and a **Read-only archive** indicator.

Clicking **Previous Terms** or changing either selector must never retrieve and render historical records. **Load Archive** remains disabled until both selectors resolve to one valid term. If a user changes a selector after results are loaded, the existing result remains identified by its original applied period and the page shows **Period changed—click Load Archive to apply** until the next successful load.

Returning to **Current Term** clears the draft archive selection and resumes the page's normal current-term query. A failed archive request keeps the last successfully applied period intact and provides a clear retry action.

### 5.2 Shared implementation

| ID | Existing condition | Planned change | Main files | Effect / acceptance criterion |
|---|---|---|---|---|
| P2.1 | Term logic exists, but pages implement selection independently. | Extend the shared term helper and add one reusable academic-period filter/control with separate draft and applied state plus an explicit **Load Archive** action. | `src/lib/termStatus.js`, new `src/components/common/AcademicPeriodFilter.jsx` | All participating pages use the same term ordering, labels, current/archive state, disabled-load rules, loading/error behavior, and fallback rules. Opening archive controls or changing a selector performs no historical query. |
| P2.2 | Some records have `term_id`; legacy records may expose only school year and semester through their class or section. | Apply a common filter contract: exact `term_id` first, legacy school-year and semester fallback second. | Shared helper plus affected page/service queries | A record appears in one correct period and is not duplicated across terms. |
| P2.3 | Some pages keep filter state only in component memory. | Preserve only the successfully applied period in URL search parameters when practical; keep incomplete or changed draft filters local until **Load Archive** succeeds. | Affected page components | Refresh and back/forward navigation retain the loaded academic period without presenting stale data under un-applied filter labels. |
| P2.4 | The paper does not yet describe the final archive interaction and read-only boundaries. | After Phase 2 QA passes, update both Word files with the verified Current Term / Previous Terms workflow, school-year and semester filters, historical coverage by role, and read-only limitations. | `C:\Users\JC Gabriel\Downloads\Revised_Statement_of_the_Problem_ASPIRE.docx`; `C:\Users\JC Gabriel\Downloads\ASPIRE Thesis - Chapters 1-2\ASPIRE_Chapters_1-2_Master_UPDATED_2026-10-21.docx` | The documented scope matches the implemented archive coverage and does not claim an AI Study Tutor archive, an unrestricted all-history view, or archival of unresolved operational work. |
| P2.5 | Large historical result sets can delay rendering or encourage repeated requests. | Add per-user/role and `term_id` caching where safe, prevent duplicate in-flight loads, ignore stale responses, and paginate or progressively render large tables. | Shared archive control plus affected page/service queries | Reopening an authorized cached period is fast; one click produces at most one active request; large archives remain responsive; cache entries cannot cross users, roles, or terms. |

### 5.3 Student archive work

| Page | Existing behavior | Planned behavior | Main files | Effect |
|---|---|---|---|---|
| Attendance & Warnings | Attendance can be read across terms without a sufficiently clear term boundary. | Add Current Term / Previous Terms selection and query only the selected academic period. Historical attendance is read-only. | `src/pages/student/Attendance.jsx` | Counts, warnings, and detail rows cannot mix semesters. |
| Advisories & Study Plans | Published evaluations are shown mainly as newest-first history without a structured period filter. | Organize advisories and plans by selected academic period with visible class and period labels. | `src/pages/student/FacultyAdvisingInbox.jsx` | Students can review past plans without confusing them with active-term guidance. |
| Consultations | Requests are mainly separated by status and can span terms. | Keep unresolved requests in **Open Requests**; add filtered, read-only history for completed/cancelled consultations. | `src/pages/student/Consultations.jsx` | Old completed consultations are searchable by period; pending items remain actionable regardless of term. |
| AI Study Tutor | No archive is wanted; supporting evidence may accidentally include attendance from other terms. | Keep the feature current-term only and scope every attendance, grade, and class query to the active class term. | `src/pages/student/AcademicInsights.jsx` and supporting query helpers if required | Current advice is period-correct; no AI archive UI is added. |
| My Subjects / Grade Report | Academic-period selection already exists. | Retain existing behavior and adopt the shared labels/control only if it can be done without regression. | `src/pages/student/MySubjects.jsx`, `src/pages/student/MyGradesList.jsx` | Existing historical grades remain available and consistent with the new archive pattern. |

### 5.4 Faculty archive work

| Page | Existing behavior | Planned behavior | Main files | Effect |
|---|---|---|---|---|
| Attendance Monitoring | Primarily loads active classes. | Add selected-period class loading; archived class attendance is view/export only. | `src/pages/faculty/ClassAttendance.jsx` | Faculty can verify past attendance without editing archived records. |
| Evaluate Students | Evaluation creation is associated with allowed classes but historical separation is not the primary workflow. | Default to current/actionable classes; permit explicit historical selection only for viewing evidence. Disable evaluation mutations for archived classes. | `src/pages/faculty/StudentRisk.jsx` | Past evaluations are visible, while new or edited interventions remain limited to authorized actionable classes. |
| Intervention Records | Already has an academic-period filter. | Align its naming, current/archive grouping, URL state, and shared filter control. Preserve authored history. | `src/pages/faculty/EvaluatedStudents.jsx` | Existing functionality is organized rather than duplicated. |
| Consultation Requests | Requests from different terms share one list. | Keep unresolved requests in the active queue; add filtered history for completed/cancelled requests with term labels. | `src/pages/faculty/ConsultationRequests.jsx` | Faculty do not miss an unresolved older request, and completed history is read-only. |
| Class Performance | Already retrieves faculty classes across periods. | Retain current functionality; align labels/filter component only if needed. | `src/pages/faculty/ClassPerformance.jsx` | No redundant archive implementation. |
| Comparisons & Trends | Already supports cross-period comparison. | Retain current comparison behavior and make period labels consistent. | `src/pages/faculty/PerformanceComparison.jsx` | Historical comparison remains analytical, not an editable archive. |

### 5.5 Dean archive work

| Page | Existing behavior | Planned behavior | Main files | Effect |
|---|---|---|---|---|
| Grade Distribution | Primarily loads active classes. | Add academic-period selection and load only classes and posted grades for that period. | `src/pages/dean/GradeDistribution.jsx` | Historical grade distribution is available without combining cohorts. |
| Risk & Honors Overview | Risk records may be active while supporting grade, attendance, score, evaluation, or insight queries span more than one term. | Scope the complete evidence set to the selected period. Current term remains the default; previous terms are read-only. | `src/pages/dean/AtRiskStudents.jsx`, `src/lib/collegeRiskService.js` or existing risk query service | A student's risk and honors result is calculated from one academic period only. |
| Escalated Cases | Requires an academic-period filter and clear term labels. | Add the shared period filter; keep unresolved referrals actionable even when created in a prior term; resolved cases enter read-only history. | `src/pages/dean/AtRiskStudents.jsx` | Dean queues remain complete while history is correctly separated. |
| Intervention Results | Historical outcomes need clearer period organization. | Filter outcome records and their baseline/follow-up evidence by the selected academic period. | `src/pages/dean/AtRiskStudents.jsx` | Recorded change is displayed within the correct term and is not presented as an effect caused by ASPIRE. |
| Generate Reports | Most reports already use term filters, but not every report honors the selected period consistently. | Make every report, especially **Intervention Outcome Report**, use the selected term and display it in the output. | `src/pages/dean/SummaryReports.jsx`, `src/lib/reportsService.js` if required | Screen counts and downloaded report rows match the selected school year and semester. |
| Grade Corrections | Searchable workflow and historical visibility already exist. | Retain current behavior; no new archive subsystem. | `src/pages/dean/RemarkOverrideRequests.jsx` | Avoids duplicate filters and workflow risk. |
| Grade Submission Status | Historical filters already exist. | Retain and visually align with the shared period labels where safe. | Existing grade-status page | No regression to pending/overdue monitoring. |

### 5.6 Academic Administrator archive work

| Page | Existing behavior | Planned behavior | Main files | Effect |
|---|---|---|---|---|
| Manage Sections | Mainly has semester-oriented filtering and allows section management. | Add full academic-period selection; current-term sections remain manageable; previous-term sections are read-only. | `src/pages/admin/SectionList.jsx` | Admin can inspect old setup without accidentally altering an archived cohort. |
| Section Rosters | Already presents period-labelled section rosters. | Retain existing behavior and align terminology only. | `src/pages/admin/SectionMasterlist.jsx` | No redundant archive work. |
| Classroom Provisioning | Already exposes current and prior term data. | Retain existing behavior. | `src/pages/admin/ClassroomProvisioning.jsx` | No regression. |
| Audit Logs | Already provides historical audit access. | Retain existing behavior. | Existing audit-log page | Audit history remains fully available. |
| Academic Terms | Already manages term history and rollover. | Retain existing behavior. | `src/pages/admin/TermManagement.jsx` | Remains the source for active and previous academic periods. |
| Grade Override | Archive changes are explicitly deferred. | Make no archive-specific change in this plan. | None | Existing controlled override workflow is untouched. |

### 5.7 Operational versus archived state

| Record/workflow | Remains actionable when | Becomes read-only history when |
|---|---|---|
| Faculty class | A prior term ended but SG is still pending or overdue within the authorized posting workflow | SG is finalized and the class is archived |
| Consultation | Request is pending, accepted, or otherwise unresolved | Request is completed or cancelled |
| Faculty evaluation/intervention | Authorized draft or follow-up action remains open for an actionable class | Evaluation/plan is published and its workflow is complete, or the class is archived |
| Dean referral/escalated case | Referral is unresolved and requires Dean action | Case is resolved/closed |
| SG correction | Request is pending, approved but unapplied, or otherwise requires an authorized action | Request is rejected, cancelled, or completely applied |
| Attendance | Active class/date is open for authorized faculty recording | Class is archived or the selected historical term is read-only |
| Reports and analytics | Never mutate source academic records | Always read-only |

### 5.8 Phase 2 release gate

- No page sends an archive-data query merely because **Previous Terms** was selected or because either draft selector changed.
- **Load Archive** remains disabled until one valid school-year/semester pair resolves to a term; one click creates at most one active request.
- During a request, the page shows an indeterminate progress indicator or skeleton, prevents duplicate submissions, and never displays an invented percentage.
- A changed draft period never relabels previously loaded results. URL, visible period label, results, and cache key change together only after a successful load.
- Failed requests retain the last successfully loaded result and period, show a useful error, and provide a retry action.
- Cached archive results are isolated by authorized user/role and `term_id`; large results are paginated or progressively rendered.
- Each archive view displays the selected school year and semester.
- Archived views do not expose save, post, approve, publish, resolve, or destructive actions.
- Unresolved older consultation, referral, SG posting, or correction work remains visible in its operational queue.
- Student, faculty, and Dean counts match the same selected term.
- AI Study Tutor uses only active-term academic evidence.
- Dean risk uses grades, attendance, zeros, trajectory, evaluations, and intervention evidence from one selected period.
- Screen values and exported report values agree for the same selected period.
- `npm run lint`
- `npm run build`
- `npm run verify:grading`
- `npm run verify:insights`
- `npm run verify:grade-posting-p0`
- `node scripts/verifyEvaluationTracking.js`
- `node scripts/verifyEvaluationReferrals.js`

### 5.9 Implementation outcome (2026-10-25)

Phase 2 is implemented in the local codebase without a database migration. The reusable `AcademicPeriodFilter` and shared term helpers now support explicit draft-versus-applied selection. Student attendance, advisories/study plans, and completed consultations; faculty attendance, intervention records, and completed consultations; Dean grade distribution, risk/escalation/intervention views, and generated reports; and Academic Administrator section history are period-scoped. Archive mutations are removed or guarded, while unresolved prior-term operational work remains available in the current queue. AI Study Tutor evidence is restricted to the active term and has no archive UI.

Automated results:

- Full ESLint: passed with no errors; 47 existing warnings remain across the repository, including one pre-existing `ClassAttendance` save-effect dependency warning outside the archive behavior.
- `npm run build`: passed.
- `npm run verify:grading`: passed.
- `npm run verify:insights`: passed.
- `npm run verify:grade-posting-p0`: passed.
- `node scripts/verifyEvaluationTracking.js`: passed.
- `node scripts/verifyEvaluationReferrals.js`: not executed because its optional local PGlite package is absent from `scratch/referral-validation`; this is a test-environment prerequisite, not an application failure.

Authenticated manual checks in the matrix below remain required before final release sign-off.

---

## 6. Manual QA Matrix

| Role | Phase 1 navigation case | Phase 2 archive case |
|---|---|---|
| Student | Open each sidebar and mobile destination; open Score Breakdown only from a selected subject; verify the consultation link. | Open Previous Terms, select year and semester, verify no request occurs before **Load Archive**, then load attendance, advisories, and completed consultations; confirm the loading state, applied-period label, no edit actions, and no mixed-term counts. |
| Faculty | Create a classroom; approve an enrollment request; follow one selected class through score entry, review/post, and corrections. | Open Previous Terms, select year and semester, verify no request occurs before **Load Archive**, then load attendance, intervention records, and completed consultations; confirm the loading state, read-only controls, and that unresolved older items remain actionable. |
| Dean | Open each grade and risk destination directly and through mobile navigation; verify the correct active item. | Use **Load Archive** to compare current and prior terms for distribution, risk, escalations, outcomes, and reports; confirm draft changes do not relabel loaded data and all evidence and exports use the applied period. |
| Admin | Open every renamed setup page; verify heading, breadcrumb, action, and menu terminology. | Use **Load Archive** for a previous term in Manage Sections and confirm it is read-only; verify Section Rosters, Audit Logs, and Academic Terms retain existing history without eager all-history loading. |

## 7. Documentation Synchronization

Documentation is updated after each implementation phase passes its release gate. Updating the Word files is a required deliverable of this implementation plan, not an optional follow-up.

### Word files in scope

| Word document | Required use |
|---|---|
| `C:\Users\JC Gabriel\Downloads\Revised_Statement_of_the_Problem_ASPIRE.docx` | Update the current Statement of the Problem, Objectives of the Study, Scope and Delimitation, and any system-overview wording affected by the verified navigation and archive behavior. Preserve the established Scope and Delimitation format. |
| `C:\Users\JC Gabriel\Downloads\ASPIRE Thesis - Chapters 1-2\ASPIRE_Chapters_1-2_Master_UPDATED_2026-10-21.docx` | Synchronize the master Chapters 1-2 copy, including the matching Chapter 1 sections, system descriptions, Chapter 2 interface/workflow discussion, menu labels, captions, and affected screenshots or figures. Preserve citations, references, heading styles, numbering, and unrelated thesis content. |

The revised document is treated as the source for the latest SOP, objectives, and scope wording. The master Chapters 1-2 file must receive the same approved wording so the two Word documents do not diverge.

### After Phase 1

- Update `docs/01-system/overview/ASPIRE_SYSTEM_SCOPE.md` with the final navigation hierarchy and selected-class faculty workflow.
- Update relevant user-journey and test documentation.
- Update both thesis Word documents only after the UI labels and navigation have been verified.
- Replace old menu labels in the SOP/objectives/scope where applicable, the system overview, Chapter 2 descriptions, captions, and screenshots.
- Document **Create Classroom** as a retained faculty capability and the selected-class sequence as **My Classes -> Scorebook -> Review & Post -> Posted Grades & Corrections**.
- Preserve all existing Word formatting, references, and unrelated sections while making equivalent changes in both documents.

### After Phase 2

- Document the archive rules, selected-period behavior, and read-only limitations in the system scope.
- Update both Word documents, including the thesis scope and delimitation, to state that historical academic records are retrieved only after opening Previous Terms, selecting a school year and semester, and explicitly choosing **Load Archive**; completed historical workflows are read-only.
- Identify the implemented historical coverage for student attendance, advisories/study plans, consultations; faculty attendance, evaluations/interventions, consultations; Dean grade distribution, risk/escalations/outcomes/reports; and Admin sections/rosters.
- Do not claim that the AI Study Tutor has historical archiving.
- Do not describe unresolved prior-term work as archived if the system still requires an authorized action.
- Verify that the Word files contain the same terminology and scope before marking Phase 2 complete.

## 8. Deferred or Excluded Work

- AI Study Tutor archive/history UI.
- A second archive page or archive database separate from the operational tables.
- New SG-correction archive controls beyond the existing searchable workflow.
- Archive changes to Academic Administrator Grade Override.
- Route-path renaming or removal.
- Database schema changes unless a separate evidence-backed audit proves they are necessary.
- Changes to grade calculations, FDA rules, risk weights, or intervention causality language outside the navigation/archive presentation required here.

## 9. Completion Criteria

This plan is complete only when:

1. Phase 1 passes its automated and manual release gate.
2. Phase 2 passes its automated and manual release gate.
3. Existing notification and deep links have no broken destinations.
4. Historical views never mix academic periods.
5. No historical query begins before **Load Archive**, and the system provides correct loading, success, empty, error, retry, stale-request, and cached-result behavior.
6. Historical records are read-only without hiding unresolved operational work.
7. Repository scope documentation and both thesis Word documents match the verified system.
8. The two Word files contain the same approved SOP, objectives, scope, navigation terminology, archive coverage, and limitations.
