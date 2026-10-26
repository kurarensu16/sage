# ASPIRE — System Scope & Technical Specifications Document

> **System Name**: ASPIRE (Academic Support and Performance Advising with Intervention, Risk, and Evaluation)
> **Target Environment**: Web Application (React 19, Vite, Tailwind CSS, Supabase / Postgres)
> **Document Version**: 5.3
> **Last Updated**: October 25, 2026

---

## 1. Executive Summary

**ASPIRE** is an enterprise-grade academic management, grading engine, and faculty evaluation governance system engineered specifically for higher education institutions. The system standardizes academic grading workflows, enforces institutional policy compliance (e.g., DYCI grading standards, attendance advisory thresholds), automates student clearance sign-offs, and provides AI-assisted academic advising.

The system operates across **4 distinct user portals**—Student, Faculty, Dean, and System Administrator—backed by Supabase Postgres with real-time data synchronization, audit logging, and role-based access control.

---

## 2. In-Scope vs. Out-of-Scope System Boundaries

### 2.1 In-Scope Capabilities

| Category                            | Detailed In-Scope Features                                                                                                                                                                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authentication & Access**   | Role-based routing for 4 portals, persistent session state, and role-gated navigation wrappers (`MainLayout`, `RoleGuard`). Authentication is handled securely via standard Supabase Email/Password logins.                                                                                         |
| **Master Data Management**    | Management of Subjects, Sections, Departments, Faculty Assignments, and Bulk Account CSV Importers (generating accounts via email and role).                                                                                                                                                        |
| **Enrollment Gateway**        | **Professor-Led Enrollment Model** using 8-character alphanumeric classroom codes. A student's code submission creates a pending request; enrollment becomes active only after the assigned faculty member approves it.                                                        |
| **Grading Math Engine**       | Subject-Level Standardized Templates (e.g., General Ed: 50% CS, 40% Exams, 10% Character; Health Sciences, Maritime Lecture/Lab variations). Computes term ratings, the Midterm Rating (MR), Tentative Final Rating (TFR), and final Semestral Grade `SG = (MR + TFR) / 2`. |
| **Faculty Evaluation Engine** | Dynamic evaluation question builder, designated evaluation windows, student submission tracking, and department effectiveness analytics.                                                                                                                                                            |
| **Governance Policies**       | **Fairness Clause** (excluding late `submitted_timely = false` surveys from faculty rating averages), **Clearance Gating** (blurring final Semestral Grade `SG` until evaluations are completed), and **Dean Controlled Access** (`is_released_to_faculty` toggle).         |
| **Attendance & Advisory**     | Attendance tracking with automated**FDA (Failure Due to Absences) Advisory Badging** at 4 absences for faculty consideration (advisory warning, not a hard system lockout).                                                                                                                   |
| **Grade Override Workflow**   | Formal grade correction workflow with valid reason input, proof document file attachment via**Supabase Storage**, and Dean review approval/rejection queue.                                                                                                                                   |
| **AI Integration**            | Google Gemini 2.5 Flash API integration for automated counseling recommendations, performance risk alerts, and student growth advising.                                                                                                                                                             |
| **Reporting & Exporting**     | Specialized print CSS stylesheets for Official Certificates of Grades (COG), grade ledgers, and department compliance audit exports.                                                                                                                                                                |
| **Academic Archives**         | Selected-period, read-only historical views. Users open **Previous Terms**, choose a school year and semester, and click **Load Archive** before the system retrieves records. Completed historical attendance, advisories/interventions, consultations, risk evidence, reports, and section setup remain separated by academic term; unresolved authorized work stays in its operational queue. The AI Study Tutor has no archive and uses current-term evidence only. |

### 2.2 Out-of-Scope Boundaries

* **Multi-Tenancy / School Isolation**: The system is a single-tenant instance optimized for DYCI; there are no school subdomain routing, dynamic watermark logo swaps, or dynamic `school_id` filtering.
* **MFA / Hardware Fingerprinting**: Browser-based HWID/fingerprinting and SMS/SMTP OTP codes are excluded to avoid user friction in shared campus computer labs.
* **Financial & Tuition Payments**: ASPIRE does not process cashier transactions, tuition payments, or financial accounting ledgers.
* **LMS Video Streaming & Live Classrooms**: ASPIRE is an academic governance and grading system, not a video conferencing or course content storage engine.

---

## 3. Comprehensive Breakdown of the 4 User Portals

ASPIRE strictly isolates interface components across **4 dedicated user portals**:

```
ASPIRE System Architecture
├── 1. Student Portal (/student/*)
├── 2. Faculty Portal (/faculty/*)
├── 3. Dean Portal (/dean/*)
└── 4. System Admin Portal (/admin/*)
```

---

### 3.1 Portal 1: Student Portal (`/student/*`)

| Page                                | File Location                            | Key Functionality & Scope                                                                                                                                  | Process Flow & State Transitions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**                 | `src/pages/student/Dashboard.jsx`      | Overview cards, official cumulative GWA summary, enrolled courses list, and**Term Clearance Status Banner**.                                         | **1. Read**: Query user profiles matching student ID. Fetch all sections they are enrolled in.**2. Compute**: Calculate overall GWA dynamically from `posted_grades`. Check if there are any incomplete evaluations in `class_enrollments`. If count > 0, set status to `UNSIGNED`, otherwise `SIGNED & CLEARED`.                                                                                                                                                                           |
| **Grade Report**          | `src/pages/student/MyGradesList.jsx`   | Official and tentative grade summary with an academic-period selector for available school years and semesters. | **1. Read**: Query the student's enrollments to construct the available academic periods. **2. Load**: Default to the current active term and retrieve the matching class and posted-grade records. **3. Navigate**: Open Score Breakdown only from a selected subject so the required class context is retained. |
| **Score Breakdown**    | `src/pages/student/MyGradesDetail.jsx` | Contextual grading-period breakdown showing ratings and activity scores for one selected subject. | **1. Read**: Requires a selected class record from My Subjects or Grade Report. **2. Display**: Show the subject's recorded activity scores, calculation context, and posted-period status. The page route remains available for durable deep links but is not a contextless sidebar destination. |
| **Faculty Evaluation List**   | `src/pages/student/EvalList.jsx`       | Active evaluation windows list per enrolled subject with completion states.                                                                                | **1. Read**: Query active `evaluation_windows` matching student's classrooms. Cross-reference with `evaluation_responses` to check completion status.**2. Render**: Display status badges: `Done` (complete) or `Evaluate` (open/clickable). Allows late evaluations to unlock clearance.                                                                                                                                                                                                   |
| **Faculty Evaluation Survey** | `src/pages/student/EvalForm.jsx`       | Interactive evaluation criteria rating sliders (1-4) and comments.                                                                                         | **1. Read**: Retrieve active criteria from `evaluation_criteria`. **2. Submit**: Evaluate `now() <= evaluation_windows.close_date`. If true, insert response into `evaluation_responses` setting `submitted_timely = true`; if false, set `submitted_timely = false`. Save ratings into `evaluation_ratings` and comments into `evaluation_comments`.                                                                                                                                 |
| **Attendance & Warnings**     | `src/pages/student/Attendance.jsx`     | Current attendance summary and explicitly loaded, read-only attendance archives. | Current Term loads normally. Previous Terms does not retrieve records until a school year and semester are selected and **Load Archive** is clicked. Counts, warnings, and details are computed only from the applied term. |
| **Advisories & Study Plans**  | `src/pages/student/FacultyAdvisingInbox.jsx` | Published faculty evaluations, intervention plans, acknowledgments, and task progress. | Active plans remain actionable in Current Term. A loaded previous term is labelled read-only and does not expose acknowledgment or task-update controls. |
| **Consultations**             | `src/pages/student/Consultations.jsx` | Student consultation requests and completed history. | Unresolved requests remain in the operational current queue even when created earlier. Previous Terms retrieves only terminal consultation history for the applied period and is read-only. |
| **AI Study Tutor**            | `src/pages/student/AcademicInsights.jsx` | Current-term academic guidance and study support. | The system scopes class, grade, and attendance evidence to the active academic term before generating guidance. Before the external generative provider is called, the client filters known direct identifiers from free-text questions and the backend rebuilds a minimized, de-identified prompt: student names, account and student identifiers, email addresses, class-record identifiers, section labels, instructor names, and free-form faculty notes are excluded. Only the academic evidence needed for the response is transmitted. After the provider returns a generic response, ASPIRE adds the authenticated student's first name locally for personalization; the name is not part of the provider prompt. This is described as de-identification and data minimization, not guaranteed anonymity. No historical archive interface is provided for this feature. |
| **Academic Documents**        | `src/pages/shared/Settings.jsx` (Tab)  | Upload COR PDF file to prepare for class enrollment.                                                                                                       | **1. Upload**: Select PDF file and upload to the student COR directory on **Supabase Storage**.**2. Write**: Update student profile setting `latest_cor_url` to the file path and `cor_verified = false`.                                                                                                                                                                                                                                                                                 |

#### Student Navigation

The student sidebar is organized as **Dashboard**; **Courses & Grades** (My Subjects, Grade Report); **Attendance** (Attendance & Warnings); **Academic Support** (Advisories & Study Plans, AI Study Tutor); and **Consultations**. Join Classroom is available only from My Subjects. Score Breakdown is contextual to a selected subject. A consultation link from a subject opens the Consultations page with that class context retained.

#### Irregular Student Workflows (Student Portal)

| Feature / Action                    | File Location                       | Key Functionality & Scope                                                                         | Process Flow & State Transitions                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Classroom Join Request** | `src/pages/student/MySubjects.jsx` | Request access to a classroom using its 8-character code.              | **1. Input**: Enter the classroom code. **2. Verify**: Check its validity and class availability. **3. Request**: Create a pending enrollment request. **4. Decision**: The assigned faculty member approves or rejects the request; code entry never activates enrollment by itself. |
| **Class / Subject List**      | `src/pages/student/Dashboard.jsx` | Displays their individual active classes and subjects instead of a standard block section roster. | **1. Read**: Pull active enrollments from `class_enrollments` where status is `active`. Renders only these specific classes.                                                            |

---

### 3.2 Portal 2: Faculty Portal (`/faculty/*`)

| Page                                | File Location                               | Key Functionality & Scope                                                                    | Process Flow & State Transitions                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**                 | `src/pages/faculty/Dashboard.jsx`         | Overview metrics of assigned sections, pending grade postings, and student counts.           | **1. Read**: Query `class_records` matching faculty ID.**2. Compute**: Aggregate total class sizes and count sections with `semestral_posted = false` to update pending tasks status.                                                                                                                                                                                                                                                                               |
| **My Classes**          | `src/pages/faculty/ClassRecordsList.jsx`  | Primary class workspace entry showing assigned current classes, selected-period previous classes, classroom codes, enrollment counts, and grading status.                 | **1. Period**: Current Term loads by default; Previous Terms reveals school-year and semester filters and retrieves only the selected period after **Load Archive**. **2. Select**: Faculty choose a class once from My Classes. **3. Work**: The same class ID is preserved through Scorebook → Review & Post → Posted Grades & Corrections. **4. Manage**: Class cards retain quick access to attendance, risk review, grade weights, correction status, and any authorized unfinished prior-term responsibility. |
| **Create Classroom** | `src/pages/faculty/ClassRecordsList.jsx`; `src/pages/faculty/FacultyCreateClassroomModal.jsx` | Separate, visible faculty action for creating a classroom from an assigned class configuration. | The sidebar route `/faculty/classrecordslist?action=create` opens the existing creation modal. This capability remains separate from grading and is not removed by the unified class workflow. |
| **Scorebook**        | `src/pages/faculty/ScoreInput.jsx` | Interactive score-entry matrix that adapts to the class's institutional COG template. | Faculty add activities, enter numeric scores (including recorded zeroes), save changes, and view live computed term results. Blank cells remain pending. After SG is finalized, ordinary score editing is locked and an approved correction is required. |
| **Enrollment Requests** | `src/pages/faculty/EnrollmentRequests.jsx` | Queue for student classroom-code requests. | Faculty review pending requests for their assigned classes and approve or reject them. Approval—not code entry—activates the student's class enrollment. |
| **Grade Posting Submission**  | `src/pages/faculty/GradeComputationPreview.jsx`; `src/pages/faculty/ScoreInput.jsx`; `src/lib/gradePostingService.js` | Server-authoritative grading-period posting in the required order MR → TFR → SG. | **1. Verify**: Requires complete, reviewed inputs and complete-roster posting for the selected period. **2. Sequence**: TFR is blocked until MR exists for the active roster; SG is blocked until both MR and TFR exist. **3. Lock**: SG locks the official score basis; later changes use the student-scoped correction workflow. |
| **Posted Grades & Corrections**      | `src/pages/faculty/PostedGradesView.jsx`  | Official posted-grade ledger and student-scoped correction workspace.                                           | **1. Read**: Display posted MR, TFR, and SG records for the selected class. **2. Request**: Faculty submit a documented SG correction request for Dean review. **3. Apply**: After approval, the authorized student row can be corrected through an audited server-side recalculation; the rest of the class remains locked. |
| **Attendance Monitoring** | `src/pages/faculty/ClassAttendance.jsx` | Current attendance recording and selected-period attendance history. | Current classes permit authorized recording. Previous Terms loads only after the explicit archive action, selects a recorded historical session, and disables initialization, bulk marks, editing, and saving. |
| **Evaluate Students / Intervention Records** | `src/pages/faculty/StudentRisk.jsx`; `src/pages/faculty/EvaluatedStudents.jsx` | Current student-risk evaluation plus read-only published intervention history. | Evaluation creation is limited to active-term classes. Intervention Records uses the shared archive selector and preserves the last successful result if another archive request fails. |
| **Consultation Requests** | `src/pages/faculty/ConsultationRequests.jsx` | Operational consultation queue and selected-period terminal history. | Pending or scheduled requests remain actionable in the current queue. Previous Terms shows completed, declined, or cancelled requests without response controls. |
| **Evaluation Results**        | `src/pages/faculty/EvalResultsMy.jsx`     | Aggregated evaluation rating averages and student feedback comments.                         | **1. Read**: Check if `is_released_to_faculty` toggle in evaluation configurations is `true`. If `false`, block view.**2. Filter**: Professor toggles dropdown (On-Time, Late, Combined). Query and average ratings dynamically from `evaluation_ratings` based on chosen scheduling filters.                                                                                                                                                                   |

#### Faculty Class-Centered Navigation

The faculty sidebar provides **My Classes**, **Create Classroom**, and **Enrollment Requests** under Classes. Scorebook, Review & Post, and Posted Grades & Corrections are not separate global destinations; they are the three ordered stages inside a selected class workspace. Their existing routes and `id` query parameter remain valid so notifications, bookmarks, and correction links continue to open the intended class directly.

The remaining faculty groups are **Student Support** (Evaluate Students, Intervention Records), **Attendance** (Attendance Monitoring), **Consultations** (Consultation Requests), and **Performance Reports** (Class Performance, Comparisons & Trends). On mobile, the class shortcut represents the full selected-class grading workflow instead of separating Classes and Scores.

#### Irregular Student Workflows (Faculty Portal)

| Feature / Action                    | File Location                               | Key Functionality & Scope                                                    | Process Flow & State Transitions                                                                                                                                         |
| ----------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Roster Verification Queue** | `src/pages/faculty/EnrollmentRequests.jsx` | Faculty manually approve or reject irregular students who requested access by code.  | **1. Read**: Pull requests with `pending` status for the faculty member's classes. **2. Action**: Approve to activate the enrollment or reject it; both decisions are recorded. |
| **Roster Badging & Sorting**  | `src/pages/faculty/ScoreInput.jsx` | Identifies irregular enrollment in the selected class and supports class-contextual roster ordering. | **1. Read**: Resolve enrollment type from the student's home section and selected class section. **2. Display**: Preserve the enrollment type in the class roster and scorebook without treating it as a permanent student identity. |

---

### 3.3 Portal 3: Dean Portal (`/dean/*`)

| Page                                   | File Location                                 | Key Functionality & Scope                                                                     | Process Flow & State Transitions                                                                                                                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dean Overview Dashboard**      | `src/pages/dean/Dashboard.jsx`              | Overview of department faculty ratings, evaluation completion rates, and pending corrections. | **1. Read**: Query `grade_change_requests` count where status is `pending`. Calculate department evaluation benchmarks.                                                                                                                                                                   |
| **Department Grade Matrix**      | `src/pages/dean/GradeMatrix.jsx`            | Real-time matrix tracking grade posting status (Unposted vs Posted vs Approved).              | **1. Read**: Fetch all `class_records` matching sections under their college department.**2. State**: Render colored indicators mapping `draft` / `posted` / `sealed` grade states per section.                                                                                 |
| **Grade Distribution Analytics** | `src/pages/dean/GradeDistribution.jsx`      | Current or explicitly loaded historical grade-distribution analysis. | Fetch college classes and posted grades only for the applied academic term, then render distribution brackets without mixing cohorts. Previous terms are read-only. |
| **Remark Override Requests**     | `src/pages/dean/RemarkOverrideRequests.jsx` | Approval interface for sealed grade resubmissions.                                            | **1. Read**: Query pending `grade_change_requests`. Load evidence attachments from **Supabase Storage**.**2. Action**: Click "Approve" (calls transaction to update `posted_grades` and sets request status to `approved`) or "Reject" (sets status to `rejected`).       |
| **Evaluation Results Overview**  | `src/pages/dean/EvalResultsOverview.jsx`    | List of department faculty evaluation ratings with the release toggles.                       | **1. Read**: Query criteria averages for department faculty.**2. Compute**: Calculate official performance ratings using strictly timely evaluations (`submitted_timely = true`).**3. Action**: Toggle switch to update `class_records.is_released_to_faculty` to true/false. |
| **Faculty Evaluation Drilldown** | `src/pages/dean/EvalResultsFaculty.jsx`     | Individual instructor deep-dive dashboard showing criteria breakdowns.                        | **1. Read**: Fetch specific rating scores and comments. Render criteria radar charts.**2. Filter**: Toggle dropdown to compare On-Time vs. Late ratings side-by-side to review potential student retaliation drift.                                                                     |
| **Risk & Interventions**          | `src/pages/dean/AtRiskStudents.jsx`         | Period-correct risk and honors overview, escalated cases, and intervention outcomes. | The selected term scopes classes, grades, scores, attendance, and evaluation evidence together. Unresolved prior-term referrals remain actionable in the operational queue; loaded historical results are read-only. |
| **Generate Reports**              | `src/pages/dean/SummaryReports.jsx`         | Selected-period report generation and export. | The Dean chooses school year and semester, then clicks **Load Report**. Queries and intervention outcomes run only for the applied period, and screen/export labels identify that period. |

#### Dean Navigation

The Dean sidebar is organized as **Dashboard**; **Grades** (Grade Submission Status, Grade Corrections, Grade Distribution); **Risk & Interventions** (Risk & Honors Overview, Escalated Cases, Intervention Results); and **Reports** (Generate Reports). These three risk destinations remain distinct desktop tasks. The mobile **Risk** shortcut covers all three routes, and direct tab links highlight the correct desktop item.

#### Irregular Student Workflows (Dean Portal)

| Feature / Action             | File Location                         | Key Functionality & Scope                                                     | Process Flow & State Transitions                                                                                                            |
| ---------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **At-Risk Monitoring** | `src/pages/dean/AtRiskStudents.jsx` | Identifies irregular students with grade warning marks across mixed subjects. | **1. Read**: Query `posted_grades` where score < 75. Filters and flags irregular students separately to prevent block section bias. |

---

### 3.4 Portal 4: System Admin Portal (`/admin/*`)

| Page                                  | File Location                                 | Key Functionality & Scope                                                 | Process Flow & State Transitions                                                                                                                                                                            |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin Dashboard**             | `src/pages/admin/Dashboard.jsx`             | Global statistics dashboard showing system-wide parameters and logs.      | **1. Read**: Retrieve total user counts, active departments, database telemetry, and critical system alerts.                                                                                          |
| **Manage Users**            | `src/pages/admin/UserList.jsx`             | Master user directory with account and profile administration tools. | Query institutional users and perform authorized account, role, status, section, and password-reset actions. |
| **Import Users**        | `src/pages/admin/UserList.jsx`            | CSV/Excel batch-import workflow within Manage Users. | Validate import rows and active-term section assignments before creating authorized user batches. |
| **Subjects**            | `src/pages/admin/SubjectList.jsx`          | Master subject catalog with course codes, units, and grading-template assignment. | Create or update subjects and bind them to a grading template. |
| **Grading Templates** | `src/pages/admin/GradeComputationsList.jsx` | COG template manager for institutional grading configurations. | Retrieve and maintain authorized grading templates and component weights. |
| **Manage Sections**         | `src/pages/admin/SectionList.jsx`          | Current section setup plus selected-period section archives. | Create, import, edit, and delete are available only for Current Term. Previous Terms loads only after **Load Archive** and hides all mutation controls. |
| **Section Rosters**         | `src/pages/admin/SectionMasterlist.jsx`          | Term-labelled official masterlist and subject-grouped irregular-enrollee companion roster for a selected section. | Select a section, review its assigned and cross-enrolled students, print the visible roster, or download the same roster as a portrait PDF. |
| **Colleges & Departments**      | `src/pages/admin/DepartmentsList.jsx`       | Institutional college and department structure with Dean assignments. | Register department records and connect authorized Dean profiles. |
| **Classroom Provisioning**      | `src/pages/admin/ClassroomProvisioning.jsx`       | Administrative class creation and faculty-loading workflow. | Provision current-term classes from subjects, sections, and faculty assignments. |
| **Audit Logs**           | `src/pages/admin/AuditLog.jsx`             | Searchable, immutable system audit trail. | Query and filter audit records; update and delete actions are disabled. |
| **Academic Terms**  | `src/pages/admin/TermManagement.jsx`             | Active-term setup, next-term preparation, rollover validation, and term history. | Configure academic periods and perform the controlled semester transition. |
| **Grade Override**  | `src/pages/admin/GradeOverride.jsx`             | Controlled administrative grade override workflow. | Validate authority and supporting approval before applying an audited override. |

#### Academic Administrator Navigation

The Academic Administrator sidebar is organized as **Dashboard**; **User Accounts** (Manage Users, Import Users); **Academic Setup** (Subjects, Grading Templates, Manage Sections, Section Rosters, Colleges & Departments, Classroom Provisioning); and **System** (Audit Logs, Academic Terms, Grade Override). Existing URLs are retained even though the visible names are clearer.

#### Irregular Student Workflows (Admin Portal)

| Feature / Action                             | File Location                               | Key Functionality & Scope                                                              | Process Flow & State Transitions                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Irregular Profile Registration**     | `src/pages/admin/UserForm.jsx`            | Assigns students to the`"Irregular"` designation instead of standard block sections. | **1. Action**: Choose "Irregular Student" in the section selection dropdown.**2. Write**: Update student's `profiles.section` value to `"Irregular"`.                                                                |
| **Manual Student Enrollment Registry** | `src/pages/admin/ClassManagementList.jsx` | Manual override modal to assign irregular students to classrooms.                      | **1. Read**: Query students whose section is `"Irregular"`. **2. Write**: Bulk-insert selected student IDs into the `enrollments` table for the selected subject-section classroom, writing a log to `audit_logs`. |

---

### 3.5 Shared Academic-Archive Interaction

The archive-enabled role pages use one interaction contract. **Current Term** is the default. Choosing **Previous Terms** exposes school-year and semester selectors but sends no historical-data query. The user must complete both selections and click **Load Archive**. While the request runs, duplicate submission is disabled and an indeterminate loading state is shown. Only a successful response changes the applied period label and URL; draft selector changes do not relabel existing results. A failure keeps the last successful archive visible and offers retry. Historical results are visibly marked **Read-only archive**.

This interaction covers student attendance, advisories/study plans, and completed consultation history; faculty attendance, intervention records, and completed consultation history; Dean grade distribution, risk/escalations/intervention results, and reports; and Academic Administrator section history. Existing period-aware grade reports, class archives, section rosters, audit logs, and academic-term history remain available through their established pages. The system does not create a duplicate archive database or a separate all-history page.

---

## 4. Academic Grading Math & Formulas

ASPIRE enforces exact subject-level weights and transmutations:

### 4.1 Subject Weight Templates

Centralized templates determine weights dynamically. Individual faculty cannot override these weights:

* **General Education / Professional Education**: 50% Class Standing + 40% Exams + 10% Character.
* **Health Sciences (Theory)**: 30% Class Standing + 60% Exams + 10% Character.
* **Health Sciences (RLE)**: 50% Checklist Rating + 20% NCP & Case Study + 20% Rubric Assessment + 10% Quizzes.
* **Maritime (Lecture)**: 60% Class Standing + 40% Exams.
* **Maritime (Laboratory)**: 40% Systematic Exercises + 60% Demonstration of Competence.

### 4.2 Grading-Period Progression (Term Calculation)

* **Regular Semester (4 Grading Periods)**:
  * **Midterm Grade (MR)** = Weighted average of Prelim and Midterm assessments.
  * **Tentative Final Grade (TFR)** = Weighted average of Semi-Finals and Finals assessments.
  * **Semestral Grade (SG)** = `(MR + TFR) / 2`.
* **Summer Term (2 Grading Periods)**:
  * **Midterm Grade (MR)** = Calculated directly from Midterm assessments (Prelim assessments are omitted).
  * **Tentative Final Grade (TFR)** = Calculated directly from Finals assessments (Semi-Final assessments are omitted).
  * **Semestral Grade (SG)** = `(MR + TFR) / 2`.

> [!NOTE]
> Regular semesters enforce progress mapping across **4 active grading periods** (Prelims, Midterms, Semi-Finals, and Finals), whereas Summer terms scale down the curriculum schedule to execute grade calculations across **2 active grading periods** (Midterms and Finals only).

### 4.3 Official Grade Transmutation Scale

| Raw Score Range     | Transmuted Grade | Academic Standing |
| ------------------- | ---------------- | ----------------- |
| **98 – 100** | **1.00**   | Excellent         |
| **95 – 97**  | **1.25**   | Excellent         |
| **92 – 94**  | **1.50**   | Very Good         |
| **89 – 91**  | **1.75**   | Very Good         |
| **86 – 88**  | **2.00**   | Good              |
| **83 – 85**  | **2.25**   | Good              |
| **80 – 82**  | **2.50**   | Satisfactory      |
| **77 – 79**  | **2.75**   | Fair              |
| **75 – 76**  | **3.00**   | Passed            |
| **Below 75**  | **5.00**   | Failed            |

---

## 5. Governance Policies & Capstone Rulings

1. **Fairness Clause**:
   * Evaluation responses submitted after the designated window (`submitted_timely = false`) unlock student grade visibility and sign term clearance, but are **strictly excluded** from faculty teaching effectiveness rating averages.
2. **Term Clearance Gating**:
   * Unsubmitted evaluations leave student clearance status as `🔴 UNSIGNED (PENDING EVALUATION)`. Official grade summaries in the student portal display as `🔒.🔒🔒` until surveys are completed.
3. **Dean Evaluation Release Control**:
   * Faculty evaluation results are gated behind a Dean release toggle (`is_released_to_faculty`). Unreleased terms show a `🔒 Evaluation Results Pending Release` notice in the faculty portal.
4. **FDA Absence Advisory**:
   * Accruing 4 absences generates a yellow **FDA Advisory** badge on class rosters for faculty review rather than enforcing an automatic hard fail.
5. **Grade Resubmission Proof Upload**:
   * Grade correction requests require formal reason text and evidence file uploads hosted in **Supabase Storage** prior to Dean inspection and approval.

---

## 6. Complete Database Schema (21 Tables)

The underlying database in Supabase Postgres consists of **21 core tables**:

1. `profiles` — User profiles, roles, department assignments, and COR file URLs
2. `departments` — Academic colleges and departments
3. `subjects` — Master subject catalog (Code, Title, Units, weight templates)
4. `sections` — Class sections, school year, and semester
5. `class_enrollments` — Student section enrollment records and approval status
6. `class_records` — Classroom instances linking subject, section, and faculty with Join Code configurations
7. `grade_computations` — Centralized grade weight template definitions
8. `grade_computation_components` — Component setups per template (CS, Exams, etc.)
9. `draft_scores` — Unposted activity and exam scores
10. `posted_grades` — Locked official term grades
11. `grade_change_requests` — Grade resubmission requests and attached proof URLs
12. `evaluation_criteria` — Evaluation questionnaire items and max ratings
13. `evaluation_windows` — Scheduled evaluation windows per section
14. `evaluation_responses` — Student survey submissions and `submitted_timely` flags
15. `evaluation_ratings` — Itemized criteria ratings per survey response
16. `evaluation_comments` — Qualitative student feedback comments
17. `attendance_logs` — Daily student attendance records (Present, Late, Absent)
18. `audit_logs` — System-wide security and administrative audit trail
19. `academic_terms` — Term configuration (School Year, Semester, Term Type)
20. `clearance_records` — Term clearance sign-off statuses
21. `ai_counseling_logs` — History of generated student AI study recommendations

---

## 7. System Verification & Quality Standards

* **CSS / Styling**: Standardized CSS using tailwind tokens; strict prohibition of arbitrary hex codes, raw inline layout styles, and dark mode variants.
* **Iconography**: Exclusively `lucide-react` icons (emojis forbidden).
* **Typography**: Sora (Headers), DM Sans (Body), JetBrains Mono (GWA / Numeric figures).
