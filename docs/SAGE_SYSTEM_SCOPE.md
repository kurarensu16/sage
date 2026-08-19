# SAGE — System Scope & Technical Specifications Document

> **System Name**: SAGE (Smart Academic Governance Engine)
> **Target Environment**: Web Application (React 19, Vite, Tailwind CSS, Supabase / Postgres)
> **Document Version**: 5.0
> **Last Updated**: August 11, 2026

---

## 1. Executive Summary

**SAGE** is an enterprise-grade academic management, grading engine, and faculty evaluation governance system engineered specifically for higher education institutions. The system standardizes academic grading workflows, enforces institutional policy compliance (e.g., DYCI grading standards, attendance advisory thresholds), automates student clearance sign-offs, and provides AI-assisted academic advising.

The system operates across **5 distinct user portals**, backed by a 21-table database schema in Supabase Postgres, supporting real-time data synchronization, audit logging, and role-based access control.

---

## 2. In-Scope vs. Out-of-Scope System Boundaries

### 2.1 In-Scope Capabilities

| Category                            | Detailed In-Scope Features                                                                                                                                                                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authentication & Access**   | Role-based routing (5 roles), persistent session state, and role-gated navigation wrappers (`MainLayout`, `RoleGuard`). Authentication is handled securely via standard Supabase Email/Password logins.                                                                                         |
| **Master Data Management**    | Management of Subjects, Sections, Departments, Faculty Assignments, and Bulk Account CSV Importers (generating accounts via email and role).                                                                                                                                                        |
| **Enrollment Gateway**        | **Professor-Led Enrollment Model** using self-regenerating 6-character alphanumeric join codes. Includes an expiration window, manual activation/deactivation toggles, and automatic code invalidation/regeneration on status changes.                                                        |
| **Grading Math Engine**       | Subject-Level Standardized Templates (e.g., General Ed: 50% CS, 40% Exams, 10% Character; Health Sciences, Maritime Lecture/Lab variations). Computes term ratings, milestone averages (Midterm Grade`MR` and Tentative Final Grade `TFR`), and final Semestral Grades `SG = (MR + TFR) / 2`. |
| **Faculty Evaluation Engine** | Dynamic evaluation question builder, designated evaluation windows, student submission tracking, and department effectiveness analytics.                                                                                                                                                            |
| **Governance Policies**       | **Fairness Clause** (excluding late `submitted_timely = false` surveys from faculty rating averages), **Clearance Gating** (blurring final Semestral Grade `SG` until evaluations are completed), and **Dean Controlled Access** (`is_released_to_faculty` toggle).         |
| **Attendance & Advisory**     | Attendance tracking with automated**FDA (Failure Due to Absences) Advisory Badging** at 4 absences for faculty consideration (advisory warning, not a hard system lockout).                                                                                                                   |
| **Grade Override Workflow**   | Formal grade correction workflow with valid reason input, proof document file attachment via**Supabase Storage**, and Dean review approval/rejection queue.                                                                                                                                   |
| **AI Integration**            | Google Gemini 2.5 Flash API integration for automated counseling recommendations, performance risk alerts, and student growth advising.                                                                                                                                                             |
| **Reporting & Exporting**     | Specialized print CSS stylesheets for Official Certificates of Grades (COG), grade ledgers, and department compliance audit exports.                                                                                                                                                                |

### 2.2 Out-of-Scope Boundaries

* **Multi-Tenancy / School Isolation**: The system is a single-tenant instance optimized for DYCI; there are no school subdomain routing, dynamic watermark logo swaps, or dynamic `school_id` filtering.
* **MFA / Hardware Fingerprinting**: Browser-based HWID/fingerprinting and SMS/SMTP OTP codes are excluded to avoid user friction in shared campus computer labs.
* **Financial & Tuition Payments**: SAGE does not process cashier transactions, tuition payments, or financial accounting ledgers.
* **LMS Video Streaming & Live Classrooms**: SAGE is an academic governance and grading system, not a video conferencing or course content storage engine.

---

## 3. Comprehensive Breakdown of the 5 User Portals

SAGE strictly isolates interface components across **5 dedicated user portals**:

```
SAGE System Architecture
├── 1. Student Portal (/student/*)
├── 2. Faculty Portal (/faculty/*)
├── 3. Dean Portal (/dean/*)
├── 4. College Office Portal (/office/*)
└── 5. System Admin Portal (/admin/*)
```

---

### 3.1 Portal 1: Student Portal (`/student/*`)

| Page                                | File Location                            | Key Functionality & Scope                                                                                                                                  | Process Flow & State Transitions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**                 | `src/pages/student/Dashboard.jsx`      | Overview cards, official cumulative GWA summary, enrolled courses list, and**Term Clearance Status Banner**.                                         | **1. Read**: Query user profiles matching student ID. Fetch all sections they are enrolled in.**2. Compute**: Calculate overall GWA dynamically from `posted_grades`. Check if there are any incomplete evaluations in `class_enrollments`. If count > 0, set status to `UNSIGNED`, otherwise `SIGNED & CLEARED`.                                                                                                                                                                           |
| **My Grades Ledger**          | `src/pages/student/MyGradesList.jsx`   | Official GWA Card and full-width Academic Grades Ledger table. Includes a dynamic**Term Selector Dropdown** to view previous school years/semesters. | **1. Read**: Query the student's `class_enrollments` to construct a DISTINCT list of school years and terms they have enrolled in (excluding any terms prior to admission).**2. Load**: Default to the current active term. Pull grades from `posted_grades` matching the selected term.**3. Check**: If the active term is selected and the student has incomplete evaluations, apply blur styling (`🔒.🔒🔒`) to the Semestral Grade (SG) column. Historical terms are never blurred. |
| **Grade Breakdown Detail**    | `src/pages/student/MyGradesDetail.jsx` | Milestone period breakdown showing transmuted ratings and activity scores for the selected term's subject.                                                 | **1. Read**: Triggered when a student selects a subject row in the ledger. Queries quiz, activity, and exam records matching that specific historic or active enrollment in `draft_scores`. **2. Display**: Map individual raw scores categorized under the subject's component template.                                                                                                                                                                                                         |
| **Faculty Evaluation List**   | `src/pages/student/EvalList.jsx`       | Active evaluation windows list per enrolled subject with completion states.                                                                                | **1. Read**: Query active `evaluation_windows` matching student's classrooms. Cross-reference with `evaluation_responses` to check completion status.**2. Render**: Display status badges: `Done` (complete) or `Evaluate` (open/clickable). Allows late evaluations to unlock clearance.                                                                                                                                                                                                   |
| **Faculty Evaluation Survey** | `src/pages/student/EvalForm.jsx`       | Interactive evaluation criteria rating sliders (1-4) and comments.                                                                                         | **1. Read**: Retrieve active criteria from `evaluation_criteria`. **2. Submit**: Evaluate `now() <= evaluation_windows.close_date`. If true, insert response into `evaluation_responses` setting `submitted_timely = true`; if false, set `submitted_timely = false`. Save ratings into `evaluation_ratings` and comments into `evaluation_comments`.                                                                                                                                 |
| **Attendance Log**            | `src/pages/student/Attendance.jsx`     | Attendance summary (Present, Late, Absent) per enrolled course.                                                                                            | **1. Read**: Query `attendance_logs` matching student's user ID.**2. Compute**: Sum totals per status. If Absences count reaches 4 or more, display a prominent yellow warning indicator badge.                                                                                                                                                                                                                                                                                                   |
| **AI Student Advisor**        | `src/pages/student/AIAdvisor.jsx`      | Academic counseling dashboard presenting study recommendations.                                                                                            | **1. Action**: package current term grades and GWA into JSON metadata and invoke Google Gemini 2.5 Flash API edge function.**2. Write**: Store recommendations and timestamps into `ai_counseling_logs` and render advisor feedback.                                                                                                                                                                                                                                                              |
| **Academic Documents**        | `src/pages/shared/Settings.jsx` (Tab)  | Upload COR PDF file to prepare for class enrollment.                                                                                                       | **1. Upload**: Select PDF file and upload to the student COR directory on **Supabase Storage**.**2. Write**: Update student profile setting `latest_cor_url` to the file path and `cor_verified = false`.                                                                                                                                                                                                                                                                                 |

#### Irregular Student Workflows (Student Portal)

| Feature / Action                    | File Location                       | Key Functionality & Scope                                                                         | Process Flow & State Transitions                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Classroom Self-Enrollment** | `src/pages/student/Dashboard.jsx` | Join classrooms individually using join codes instead of automatic block assignment.              | **1. Input**: Enter a 6-character code.**2. Verify**: Check code active/expiry.**3. Write**: Create record in `class_enrollments` setting status to `pending_verification`. |
| **Class / Subject List**      | `src/pages/student/Dashboard.jsx` | Displays their individual active classes and subjects instead of a standard block section roster. | **1. Read**: Pull active enrollments from `class_enrollments` where status is `active`. Renders only these specific classes.                                                            |

---

### 3.2 Portal 2: Faculty Portal (`/faculty/*`)

| Page                                | File Location                               | Key Functionality & Scope                                                                    | Process Flow & State Transitions                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**                 | `src/pages/faculty/Dashboard.jsx`         | Overview metrics of assigned sections, pending grade postings, and student counts.           | **1. Read**: Query `class_records` matching faculty ID.**2. Compute**: Aggregate total class sizes and count sections with `semestral_posted = false` to update pending tasks status.                                                                                                                                                                                                                                                                               |
| **My Class Records**          | `src/pages/faculty/ClassRecordsList.jsx`  | Grid of assigned sections with classroom management controls and Join Codes.                 | **1. Action**: Professor selects a class shell. Clicking "Generate Join Code" creates a 6-character code and updates `join_code` and `joins_expire_at`. Professors can also toggle `accept_joins` between active/inactive.                                                                                                                                                                                                                                              |
| **Score Entry Matrix**        | `src/pages/faculty/ClassRecordDetail.jsx` | Interactive score entry table. Automatically adapts columns and inputs to subject templates. | **1. Load**: Fetch classroom metadata. Read components and weights from the bound `grade_computation_components` template.**2. Add**: Clicking "Add Activity" creates a new activity column in the selected component (e.g. Class Standing), inserting a new record in `grade_components`. Multiple activities can be added under aggregate columns.**3. Save**: Auto-saves user inputs to `draft_scores`. Computes raw and transmuted ratings dynamically. |
| **Roster / COR Verification** | `src/pages/faculty/VerificationQueue.jsx` | Student join request queue. Allows reviewing student-uploaded COR PDFs.                      | **1. Read**: Pull enrollments where `status = 'pending_verification'`. **2. Action**: Opens student COR PDF inside an iframe modal. Click "Approve" to update `class_enrollments.status = 'active'`, or click "Reject" to set status to `'rejected'`.                                                                                                                                                                                                             |
| **Grade Posting Submission**  | `src/pages/faculty/PostGradesModal.jsx`   | Milestone grade posting (Midterm`MR`, Tentative Final `TFR`, Semestral `SG`).          | **1. Verify**: Check that all student scores are encoded for the milestone.**2. Write**: Updates `class_records` setting `midterm_posted`, `finals_posted`, or `semestral_posted` to `true`. Once Semestral is posted, the class record is locked for editing.                                                                                                                                                                                                |
| **Posted Grades Ledger**      | `src/pages/faculty/PostedGradesView.jsx`  | Read-only ledger of locked official posted grades.                                           | **1. Read**: Fetch values from `posted_grades` table.**2. Action**: Render read-only grid. If `semestral_posted = true`, display the "Request Grade Correction" button.                                                                                                                                                                                                                                                                                             |
| **Grade Correction Request**  | `src/pages/faculty/ResubmissionModal.jsx` | Request form requiring justification and evidence attachment.                                | **1. Action**: Upload files (medical certs, exam sheets) to **Supabase Storage**.**2. Write**: Insert request details, file URL, original vs requested grades, and status `pending` into `grade_change_requests`.                                                                                                                                                                                                                                             |
| **Evaluation Results**        | `src/pages/faculty/EvalResultsMy.jsx`     | Aggregated evaluation rating averages and student feedback comments.                         | **1. Read**: Check if `is_released_to_faculty` toggle in evaluation configurations is `true`. If `false`, block view.**2. Filter**: Professor toggles dropdown (On-Time, Late, Combined). Query and average ratings dynamically from `evaluation_ratings` based on chosen scheduling filters.                                                                                                                                                                   |

#### Irregular Student Workflows (Faculty Portal)

| Feature / Action                    | File Location                               | Key Functionality & Scope                                                    | Process Flow & State Transitions                                                                                                                                         |
| ----------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Roster Verification Queue** | `src/pages/faculty/VerificationQueue.jsx` | Professor manually approves/rejects irregular students who joined via code.  | **1. Read**: Pull requests where `status = 'pending_verification'`. **2. Action**: Professor checks COR PDF. Click Approve to update status to `active`. |
| **Roster Badging & Sorting**  | `src/pages/faculty/ClassRecordDetail.jsx` | Renders an amber "Irregular" badge next to irregular students in gradebooks. | **1. Read**: Check student's section attribute. If section matches `"Irregular"` or is null, style row with amber tag and group under manual enrollees.          |

---

### 3.3 Portal 3: Dean Portal (`/dean/*`)

| Page                                   | File Location                                 | Key Functionality & Scope                                                                     | Process Flow & State Transitions                                                                                                                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dean Overview Dashboard**      | `src/pages/dean/Dashboard.jsx`              | Overview of department faculty ratings, evaluation completion rates, and pending corrections. | **1. Read**: Query `grade_change_requests` count where status is `pending`. Calculate department evaluation benchmarks.                                                                                                                                                                   |
| **Department Grade Matrix**      | `src/pages/dean/GradeMatrix.jsx`            | Real-time matrix tracking grade posting status (Unposted vs Posted vs Approved).              | **1. Read**: Fetch all `class_records` matching sections under their college department.**2. State**: Render colored indicators mapping `draft` / `posted` / `sealed` grade states per section.                                                                                 |
| **Grade Distribution Analytics** | `src/pages/dean/GradeDistribution.jsx`      | Visual grade distribution charts and brackets comparing grading patterns.                     | **1. Read**: Fetch `posted_grades` details for active classes in their college.**2. Render**: Compile grading distributions into bar graphs and bell curves.                                                                                                                          |
| **Remark Override Requests**     | `src/pages/dean/RemarkOverrideRequests.jsx` | Approval interface for sealed grade resubmissions.                                            | **1. Read**: Query pending `grade_change_requests`. Load evidence attachments from **Supabase Storage**.**2. Action**: Click "Approve" (calls transaction to update `posted_grades` and sets request status to `approved`) or "Reject" (sets status to `rejected`).       |
| **Evaluation Results Overview**  | `src/pages/dean/EvalResultsOverview.jsx`    | List of department faculty evaluation ratings with the release toggles.                       | **1. Read**: Query criteria averages for department faculty.**2. Compute**: Calculate official performance ratings using strictly timely evaluations (`submitted_timely = true`).**3. Action**: Toggle switch to update `class_records.is_released_to_faculty` to true/false. |
| **Faculty Evaluation Drilldown** | `src/pages/dean/EvalResultsFaculty.jsx`     | Individual instructor deep-dive dashboard showing criteria breakdowns.                        | **1. Read**: Fetch specific rating scores and comments. Render criteria radar charts.**2. Filter**: Toggle dropdown to compare On-Time vs. Late ratings side-by-side to review potential student retaliation drift.                                                                     |
| **At-Risk Students**             | `src/pages/dean/AtRiskStudents.jsx`         | Dashboard auditing students flagged with warning marks or FDA warning triggers.               | **1. Read**: Query active `posted_grades` and `attendance_logs` matching warning thresholds.**2. Roster**: Render lists of students with critical averages or FDA badges, grouped by department code.                                                                               |
| **Summary Reports**              | `src/pages/dean/SummaryReports.jsx`         | Document generator enabling deans to view and export grade logs and evaluation reviews.       | **1. Fetch**: Compile department-wide grading stats and instructor surveys.**2. Export**: Render print-ready layout or execute file save actions.                                                                                                                                       |

#### Irregular Student Workflows (Dean Portal)

| Feature / Action             | File Location                         | Key Functionality & Scope                                                     | Process Flow & State Transitions                                                                                                            |
| ---------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **At-Risk Monitoring** | `src/pages/dean/AtRiskStudents.jsx` | Identifies irregular students with grade warning marks across mixed subjects. | **1. Read**: Query `posted_grades` where score < 75. Filters and flags irregular students separately to prevent block section bias. |

---

### 3.4 Portal 4: College Office Portal (`/office/*`)

| Page                                 | File Location                                      | Key Functionality & Scope                                                                      | Process Flow & State Transitions                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Department Dashboard**       | `src/pages/college_office/Dashboard.jsx`         | Aggregated counts of department students, sections, and clearances.                            | **1. Read**: Query profiles and classroom schedules sandboxed to the Department Admin's department code.                                                                                                                                                                                                     |
| **CSV Account Import**         | `src/pages/college_office/RosterImport.jsx`      | Bulk importer tool for students and faculty.                                                   | **1. Upload**: Read CSV/Excel records.**2. Action**: Create accounts in Supabase Auth, automatically mapping the records and injecting their `department` metadata before writing to `profiles`.                                                                                                   |
| **Clearance Compliance Audit** | `src/pages/college_office/ComplianceAudit.jsx`   | Student evaluation completion checklist with sign-off status.                                  | **1. Read**: Search and select student profile.**2. Verify**: Query all classes student is enrolled in. Check that evaluation submissions count equals active enrollments.**3. Action**: Enable the "Sign Off Clearance" button once verified, updating `clearance_records.status` to cleared. |
| **Subject Assignment**         | `src/pages/college_office/SubjectAssignment.jsx` | Portal to assign master subjects to instructors.                                               | **1. Read**: Query subjects and active faculty profiles matching the Office admin's department.**2. Write**: Link instructor to selected subject in the classroom record. Prohibits linking profiles or subjects from outer departments.                                                               |
| **Evaluation Builder**         | `src/pages/college_office/EvalBuilder.jsx`       | Custom evaluation criteria questionnaire manager for their department.                         | **1. Read**: Query existing evaluation questions from `evaluation_criteria` filtered by department.**2. Write**: Insert, update, or deactivate criteria questions in the database.                                                                                                                   |
| **Evaluation Windows**         | `src/pages/college_office/EvalWindows.jsx`       | Setup scheduling windows for evaluation forms.                                                 | **1. Read**: Pull active sections under their department.**2. Write**: Define evaluation timeline dates, inserting scheduling ranges into the `evaluation_windows` registry.                                                                                                                         |
| **Student Section Modifier**   | `src/pages/college_office/StudentSections.jsx`   | Lookup tool allowing Department Admins to update a student's section or set them as Irregular. | **1. Read**: Query profiles inside their department.**2. Action**: Select a student and select their new block section or select the "Irregular" status dropdown.**3. Write**: Update student's `profiles.section_id` in database (sets to target section or sets to null/irregular status).   |

#### Irregular Student Workflows (College Office Portal)

| Feature / Action                    | File Location                                    | Key Functionality & Scope                                                                  | Process Flow & State Transitions                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Roster Audit / Clearances** | `src/pages/college_office/ComplianceAudit.jsx` | Audits irregular student clearances across mixed sections.                                 | **1. Read**: Fetch student's custom course load. Check completion of evaluation surveys for each distinct class they are manually enrolled in.                      |
| **Section & Status Modifier** | `src/pages/college_office/StudentSections.jsx` | Change student sections or convert them to Irregular status to balance registrar overhead. | **1. Action**: Lookup student by ID, select section dropdown, choose a block section or `"Irregular"`. **2. Write**: Update student section ID in database. |

---

### 3.5 Portal 5: System Admin Portal (`/admin/*`)

| Page                                  | File Location                                 | Key Functionality & Scope                                                 | Process Flow & State Transitions                                                                                                                                                                            |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin Dashboard**             | `src/pages/admin/Dashboard.jsx`             | Global statistics dashboard showing system-wide parameters and logs.      | **1. Read**: Retrieve total user counts, active departments, database telemetry, and critical system alerts.                                                                                          |
| **Users Management**            | `src/pages/admin/UsersList.jsx`             | Master user directory with credentials update tools.                      | **1. Read**: Query user list across all departments.**2. Write**: Update profile roles, toggle status, or request password resets.                                                              |
| **Bulk User CSV Import**        | `src/pages/admin/UserImport.jsx`            | System-wide bulk csv import template mapping profiles.                    | **1. Read**: Parse user CSV fields.**2. Write**: Insert batches of user records with assigned system roles.                                                                                     |
| **Subjects Catalog**            | `src/pages/admin/SubjectsList.jsx`          | Master catalog cataloging course codes and units.                         | **1. Read**: Query global master subjects list.**2. Write**: Insert new subject records and bind them to a specific grading template (`computation_id`).                                      |
| **Grade Computation Templates** | `src/pages/admin/GradeComputationsList.jsx` | COG Manager dashboard allowing configurations of custom grading formulas. | **1. Read**: Retrieve existing templates and weight percentages.**2. Write**: Insert/update grading templates into `grade_computations` and components into `grade_computation_components`. |
| **Sections Management**         | `src/pages/admin/SectionsList.jsx`          | Sections directory setup by year and semester.                            | **1. Write**: Create section shells (`sections`) to be utilized by Department Admins when scheduling classrooms.                                                                                    |
| **Departments Management**      | `src/pages/admin/DepartmentsList.jsx`       | Master list establishing academic departments and Dean assignments.       | **1. Write**: Register new department records and link Dean profiles to their respective college.                                                                                                     |
| **System Audit Logs**           | `src/pages/admin/AuditLogs.jsx`             | Immutable audit trial dashboard.                                          | **1. Read**: Query `audit_logs` record log files. Search and filter by user, timestamp, or action type. Update/Delete actions are disabled.                                                         |
| **Database & System Settings**  | `src/pages/shared/Settings.jsx`             | Global configurations panel.                                              | **1. Action**: Set active term, academic year, and diagnostics configs. Writes directly to `system_settings`.                                                                                       |

#### Irregular Student Workflows (Admin Portal)

| Feature / Action                             | File Location                               | Key Functionality & Scope                                                              | Process Flow & State Transitions                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Irregular Profile Registration**     | `src/pages/admin/UserForm.jsx`            | Assigns students to the`"Irregular"` designation instead of standard block sections. | **1. Action**: Choose "Irregular Student" in the section selection dropdown.**2. Write**: Update student's `profiles.section` value to `"Irregular"`.                                                                |
| **Manual Student Enrollment Registry** | `src/pages/admin/ClassManagementList.jsx` | Manual override modal to assign irregular students to classrooms.                      | **1. Read**: Query students whose section is `"Irregular"`. **2. Write**: Bulk-insert selected student IDs into the `enrollments` table for the selected subject-section classroom, writing a log to `audit_logs`. |

---

## 4. Academic Grading Math & Formulas

SAGE enforces exact subject-level weights and transmutations:

### 4.1 Subject Weight Templates

Centralized templates determine weights dynamically. Individual faculty cannot override these weights:

* **General Education / Professional Education**: 50% Class Standing + 40% Exams + 10% Character.
* **Health Sciences (Theory)**: 30% Class Standing + 60% Exams + 10% Character.
* **Health Sciences (RLE)**: 50% Checklist Rating + 20% NCP & Case Study + 20% Rubric Assessment + 10% Quizzes.
* **Maritime (Lecture)**: 60% Class Standing + 40% Exams.
* **Maritime (Laboratory)**: 40% Systematic Exercises + 60% Demonstration of Competence.

### 4.2 Milestone Progression (Term Calculation)

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
