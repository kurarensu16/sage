# SAGE: Smart Academic Grading and Evaluation System
## System Design Document
* **Institution**: Dr. Yanga's Colleges, Inc.
* **Program**: BS Information Technology — Capstone Project
* **Academic Year**: AY 2025–2026

---

## 1. System Overview

SAGE (Smart Academic Grading and Evaluation System) is a web-based academic management system developed for Dr. Yanga's Colleges, Inc. (DYCI). The system automates class record management, grade computation, student performance monitoring, faculty evaluation, and AI-driven academic recommendations.

SAGE is designed to eliminate manual grade computation, reduce the burden of grade consultations, enforce data privacy in faculty evaluations, and provide data-driven insights for both students and administration. It does not replace DYCI's existing enrollment system — enrolled students are imported into SAGE at the start of each semester via CSV.

### Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19 + Vite + Tailwind CSS + SheetJS (xlsx) |
| **Backend / Database** | Supabase (PostgreSQL + Auth + Storage) |
| **AI Integration** | Google Gemini 2.5 Flash API |
| **Deployment** | Vercel |
| **Design System** | Sora + DM Sans + JetBrains Mono, Sage green (#356d62) primary |

---

## 2. User Roles

### 2.1 Admin
* Manage all user accounts (create, update, enable/disable)
* Pre-load subjects database (once per school year or as needed)
* Pre-load sections database (once per semester)
* Create classrooms — one per subject/section/faculty combination
* Import enrolled students per classroom via CSV
* Reassign faculty to a classroom (for substitutions or replacements)
* Create and configure evaluation forms and criteria
* Set evaluation window open and close dates
* Perform admin override on locked posted grades
* Archive classrooms at semester end
* View all system data and audit logs

### 2.2 Dean
* View all class records across departments and sections
* Monitor grade posting status per faculty per grading period
* Use the **Registry Unlock Override Dashboard** to selectively unlock specific grading milestones for faculty edits
* Approve or reject real-time **Unlock Requests** sent by faculty members for specific class records and milestones
* Review and approve formal **Grade Resubmission Requests** submitted with student evidence attachments (`evidence_url`) for locked grade adjustments
* Control **Evaluation Release Controls** (`is_released_to_faculty` toggle) to release survey scores and feedback to faculty members individually or in bulk
* Access **Dual-Channel Evaluation Analytics** (On-Time Official vs Late Informational) and **Retaliation-Drift** rating cards
* View grade distribution summaries per subject and section
* View AI-generated faculty fitness predictions for all faculty under their department
* View the list of AI-flagged at-risk students
* Generate printable and exportable summary reports

### 2.3 Faculty
* Create class records per subject and section
* Define grade components (activity, quiz, exam, project) with percentage weights or apply department COG templates
* Input student scores per component (enforcing full activity names; shortened codes prohibited)
* View real-time running grade and Early Warning System indicators per student
* Post grades dynamically per milestone grading period (Prelim, Midterm, Semi-Final, Final) via a selective choices modal
* Request the Dean to unlock locked milestones directly from the Posted Grades view
* Submit formal **Grade Change Requests** for locked grades with required reason notes and uploaded student proof files for Dean review and approval
* Treat 4 student absences as an **FDA Advisory Recommendation** for faculty review, preserving faculty discretion based on overall student circumstances
* View faculty evaluation results per section (anonymized) **only after Dean release approval**
* Receive notifications when an evaluation window closes, when an evaluation is released by the Dean, or when a milestone unlock/resubmission request is resolved

### 2.4 Student
* View finalized **Midterm** and **Final** grade summaries (real-time daily recalculations removed for official summaries)
* Access activity, quiz, and assignment breakdown details with full descriptive titles
* Submit faculty evaluations per subject section within active designated timelines
* On-time survey completion signs term clearance; missing evaluations lock grade summary visibility and leave clearance unsigned
* Submit late evaluations to unlock grade visibility and clearance, flagged as `submitted_timely = false` and excluded from faculty teaching effectiveness ratings (Fairness Clause)
* Receive notifications when grades are posted or evaluation windows open/close
* View AI-generated academic recommendations

### 2.5 College Office (Department Admin)
* Manage department-level student rosters and section assignments
* Process CSV bulk user imports and verify student Certificate of Registration (COR) records
* Audit student evaluation completion progress across sections for end-of-term physical and digital clearance sign-off
* View clearance compliance summary metrics and export clearance audit logs for registrar operations

---

## 3. Functional Requirements

### 3.1 Authentication & Access Control
| FR # | Description |
|---|---|
| **FR01** | The system shall allow users to log in using role-based credentials. |
| **FR02** | The system shall restrict module access based on user role. |

### 3.2 Class & Enrollment Management
| FR # | Description |
|---|---|
| **FR03** | Admin shall be able to pre-load and manage the master database of academic subjects. |
| **FR03a** | Admin shall be able to batch import academic subjects via CSV or Excel (.xlsx) file uploads. |
| **FR04** | Admin shall be able to pre-load and manage the master database of class sections, linked directly to specific academic programs and colleges (e.g., BSIT, BSN, BSA) to maintain program structure. |
| **FR04a** | Admin shall be able to batch import class sections via CSV or Excel (.xlsx) file uploads. |
| **FR05** | Admin shall be able to create a classroom by linking a pre-loaded subject, section, and faculty member, enforcing Department/College alignment checks to ensure faculty are teaching within their department unless explicitly overridden. |
| **FR06** | Admin shall be able to import enrolled students per classroom via CSV or Excel (.xlsx) file uploads. |
| **FR06b** | Faculty shall be able to generate 6-character alphanumeric Join Codes (Professor-Led Enrollment) for students to self-enroll, supporting Irregular students. |
| **FR06a** | Admin shall be able to batch import users (students, faculty, deans) via CSV or Excel (.xlsx) file uploads. |
| **FR07** | Admin shall be able to reassign a faculty member to an existing classroom, logging the action for auditing. |
| **FR08** | Admin shall be able to archive a classroom, warning Admins if unposted grades exist before locking it from edits. |

### 3.3 Grading Module
| FR # | Description |
|---|---|
| **FR09** | Faculty shall be able to create a class record per subject and section. |
| **FR10** | Faculty shall be able to define grade components (activity, quiz, exam, project) with corresponding percentage weights. |
| **FR11** | The system shall validate that grade component weights sum to 100% before allowing score input. |
| **FR12** | Faculty shall be able to input scores per student per component. |
| **FR13** | The system shall automatically compute the term grades (Prelim, Midterm, Semi-Final, Final) and rating aggregation averages (Midterm Rating, Tentative Final Rating, and Semestral Grade) based on defined weights and rounding rules. |
| **FR14** | The system shall compute a real-time running grade per student based on currently encoded score components (Class Standing, Character Rating, and Term Exam). |
| **FR15** | The system shall display a visual standing indicator per student: Safe (green), At-Risk (yellow), or Failing Trajectory (red), based on the running grade GWA. |
| **FR16** | The system shall display a tooltip on At-Risk and Failing Trajectory indicators showing the exact running percentage. |
| **FR17** | Faculty shall be able to post grades selectively per grading period milestone (Prelim, Midterm, MR, Semi-Final, Final, TFR, Semestral Grade) via a milestone choice modal. |
| **FR17a** | The system shall allow faculty to filter the class record view by individual grading period (Prelim, Midterm, Semi-Final, Final) or view all terms side-by-side. |
| **FR17b** | The system shall provide a fullscreen expand/collapse toggle on class record tables (Score Input, Computation Preview, and Posted Grades) to maximize viewing area, with Escape key and backdrop-click to exit. |
| **FR18** | The system shall lock specific grading milestone columns from faculty editing once posted. |
| **FR18a** | Faculty shall be able to submit a dynamic "Request Unlock" for any locked milestone column, transitioning its state to "Unlock Requested" and notifying the Dean. |
| **FR18b** | The Dean Portal shall display active faculty unlock requests and provide a "Registry Override Dashboard" to approve/reject unlock requests in real-time or selectively force-unlock any milestone column for a class record. |


### 3.4 Student Portal
| FR # | Description |
|---|---|
| **FR19** | Students shall be able to view their grades per subject per grading period. |
| **FR19a** | Students shall be able to view individual activity breakdowns (e.g., Activity 1 to 6) under the Class Standing component via an expandable accordion row. |
| **FR19b** | Students shall be able to view a Complete Semestral Grade Record (Spreadsheet View) at the bottom of the breakdown page showing the complete calculation chain (PG, MG, MR, SFG, FG, TFR, SG, GWA, Remarks) with a fullscreen option for easier reading. |
| **FR20** | The system shall notify students when a new grade period is posted. |
| **FR21** | The system shall display each student's lapses or missing score components. |
| **FR22** | Students shall not be able to view other students' grades. |

### 3.5 Faculty Evaluation Module
| FR # | Description |
|---|---|
| **FR23** | Admin shall be able to create an evaluation form with criteria and rating items. |
| **FR24** | Admin shall be able to set an open and close date for each evaluation window. |
| **FR25** | Students shall only be able to submit evaluations within the active window. |
| **FR26** | The system shall hide student identity from faculty when displaying evaluation results. |
| **FR27** | Faculty shall be able to view evaluation results broken down per section. |
| **FR28** | Faculty shall be notified when an evaluation window closes. |

### 3.6 Dean Module
| FR # | Description |
|---|---|
| **FR29** | The Dean shall be able to view grade posting status of all faculty per grading period. |
| **FR30** | The Dean shall be able to view grade distribution summaries per subject and section. |
| **FR31** | The Dean shall be able to view AI-generated faculty fitness predictions for all faculty under their department. |
| **FR32** | The Dean shall be able to view the list of at-risk students flagged by the AI recommendation system. |
| **FR33** | The Dean shall be able to generate printable and exportable summary reports. |

### 3.7 AI Features
| FR # | Description |
|---|---|
| **FR34** | The system shall generate an AI-based recommendation per student advising whether to continue their course based on academic performance. |
| **FR35** | The system shall generate an AI-based faculty fitness prediction assessing whether the professor is recommended for the next school year, based on evaluation ratings and comments. |

---

## 4. Non-Functional Requirements

| NFR # | Category | Requirement |
|---|---|---|
| **NFR01** | Security | Student identity in evaluations must be anonymized and non-recoverable from the UI. |
| **NFR02** | Privacy | The system must comply with the Philippine Data Privacy Act (RA 10173). |
| **NFR03** | Performance | Grade computation must complete within 3 seconds of input submission. |
| **NFR04** | Performance | Running grade computation must update within 2 seconds of a new score being saved. |
| **NFR05** | Usability | The interface must be usable on both desktop and mobile browsers. |
| **NFR06** | Reliability | The system must maintain 99% uptime during active evaluation windows. |
| **NFR07** | Maintainability | Codebase must follow component-based architecture for ease of updates. |
| **NFR08** | Scalability | The system must support at least 500 concurrent student users. |
| **NFR09** | Integrity | Posted grades must be immutable without an admin-logged override. |

---

## 5. Entity Relationship Diagram

The SAGE database consists of 21 tables hosted on Supabase (PostgreSQL). Tables are organized into functional groups including User/Organizational Data, Class/Enrollment Management, Grading, Evaluations, and AI Insights/Logs.

> [!NOTE]
> For the complete and up-to-date Entity Relationship Diagram (ERD), Table Schemas, and SQL DDL scripts, please refer directly to the master database documentation: `docs/SAGE_DATABASE_SCHEMA.md`.

---

## 6. Use Case Diagram

SAGE has 33 use cases across 9 modules distributed among 4 actors.

| UC # | Module | Use Case | Actors |
|---|---|---|---|
| **UC01** | Authentication | Log In | Admin, Dean, Faculty, Student |
| **UC02** | Authentication | Access Role-Based Modules | Admin, Dean, Faculty, Student |
| **UC03** | User Management | Manage User Accounts | Admin |
| **UC04** | Class Management | Pre-load & Manage Subjects | Admin |
| **UC05** | Class Management | Pre-load & Manage Sections | Admin |
| **UC06** | Class Management | Create Classroom | Admin |
| **UC07** | Class Management | Import Students via CSV | Admin |
| **UC08** | Class Management | Reassign Faculty to Classroom | Admin |
| **UC09** | Class Management | Archive Classroom | Admin |
| **UC10** | Evaluation Management | Create Evaluation Form | Admin |
| **UC11** | Evaluation Management | Set Evaluation Window | Admin |
| **UC12** | Evaluation Management | Override Posted Grade | Admin |
| **UC13** | Dean Oversight | View All Class Records | Dean |
| **UC14** | Dean Oversight | Monitor Grade Posting Status | Dean |
| **UC15** | Dean Oversight | View Grade Distribution | Dean |
| **UC16** | Dean Oversight | View AI Faculty Predictions | Dean |
| **UC17** | Dean Oversight | View At-Risk Students | Dean |
| **UC18** | Dean Oversight | Generate Summary Reports | Dean |
| **UC18a** | Dean Oversight | Override / Approve Milestone Grade Unlock | Dean |
| **UC19** | Class Record | Create Class Record | Faculty |
| **UC20** | Class Record | Define Grade Components & Weights | Faculty |
| **UC21** | Class Record | Input Student Scores | Faculty |
| **UC22** | Class Record | View Early Warning Indicators | Faculty |
| **UC23** | Class Record | Post Grades per Milestone | Faculty |
| **UC23a** | Class Record | Request Milestone Grade Unlock | Faculty |
| **UC24** | Faculty Evaluation | View Evaluation Results per Section | Faculty |
| **UC25** | Faculty Evaluation | Receive Evaluation Notification | Faculty |
| **UC26** | Student Portal | View Own Grades | Student |
| **UC27** | Student Portal | Receive Grade Notification | Student |
| **UC28** | Student Portal | View Lapses & Missing Scores | Student |
| **UC29** | Student Portal | Submit Faculty Evaluation | Student |
| **UC30** | AI Features | Generate Student Recommendation | Student, Dean |
| **UC31** | AI Features | Generate Faculty Fitness Prediction | Faculty, Dean |


---

## 7. Data Flow Diagram

### 7.1 Level 0 — Context Diagram

The Level 0 DFD treats the entire system as a single process and identifies all external entities and their high-level data flows.

| Entity | Data Sent to System | Data Received from System |
|---|---|---|
| **Admin** | User data, classroom setup, CSV imports, eval forms, windows, grade overrides, archive commands | System reports, confirmations, audit logs |
| **Dean** | Report and filter requests, milestone unlock approvals/overrides | Grade reports, eval results, AI predictions, at-risk student lists, unlock request alerts |
| **Faculty** | Scores, grade components, post commands, milestone unlock requests | Computed grades, running grade indicators, eval results, notifications, unlock status updates |
| **Student** | Evaluation responses, grade view requests | Grades, lapses, AI recommendations, notifications |

### 7.2 Level 1 — Process Decomposition

| Process | Name | Description |
|---|---|---|
| **P1** | Authentication | Validates credentials and issues role-based session tokens. |
| **P2** | User & Class Management | Admin creates users, classrooms, imports students via CSV, reassigns faculty, archives classes. |
| **P3** | Class Record & Grade Management | Faculty creates class records, defines components, inputs scores, auto-computes grades, triggers Early Warning System indicators, posts grades, submits milestone unlock requests. |
| **P4** | Student Grade Portal | Students view posted grades, component breakdowns, and lapses. |
| **P5** | Faculty Evaluation | Admin manages eval forms and windows. Students submit anonymous responses. Faculty view results. |
| **P6** | AI Recommendation Engine | Reads grade and evaluation data and generates student recommendations and faculty fitness predictions. |
| **P7** | Dean Oversight & Reporting | Dean views all grade and evaluation data, AI predictions, manages milestone unlock approvals/overrides, and generates reports. |
| **P8** | Notification Service | Dispatches notifications to students and faculty on key system events. |

### 7.3 Data Stores

| Store | Tables Covered |
|---|---|
| **D1** | `users` |
| **D2** | `departments`, `subjects`, `sections` |
| **D3** | `enrollments`, `class_records`, `class_faculty_log` |
| **D4** | `grade_components`, `component_scores`, `posted_grades`, `unlock_requests` |
| **D5** | `evaluation_forms`, `evaluation_criteria`, `evaluation_windows` |
| **D6** | `evaluation_responses`, `evaluation_ratings`, `evaluation_comments` |
| **D7** | `ai_student_recommendations` |
| **D8** | `ai_faculty_predictions` |
| **D9** | `notifications` |


---

## 8. UI Screen List

SAGE consists of multiple screens distributed across 5 role portals plus shared public screens.

### 8.1 Shared / Public Screens
| Screen # | Screen Name | Key Elements |
|---|---|---|
| **S01** | Login Page | Email + password fields. Role determined server-side. Redirect to role dashboard after login. |
| **S02** | Forgot Password Page | Email input to receive reset link. |
| **S03** | Reset Password Page | New password + confirm password fields. |

### 8.2 Admin Screens
| Screen # | Screen Name | Key Elements |
|---|---|---|
| **S04** | Admin Dashboard | KPI row: Total Users, Active Eval Windows, Pending Grade Posts, Archived Classrooms. Audit logs: recent grade posts, reassignments, overrides. |
| **S05** | User Management — List | Table of all users: name, email, role badge, department, status. Search and filter. Add User button. |
| **S06** | User Management — Create / Edit | Form: name, email, role, department. Enable/disable toggle. |
| **S07** | Subjects Database — List | Table of all pre-loaded subjects: code, description, units, department. Search and filter. Pre-load Subject button. |
| **S08** | Subjects Database — Create / Edit | Form to configure subject code, descriptive name, unit counts, department. |
| **S09** | Sections Database — List | Table of all pre-loaded sections: name, school year, semester, department. Search and filter. Pre-load Section button. |
| **S10** | Sections Database — Create / Edit | Form to configure section name, department, school year, and semester. |
| **S11** | Classrooms Directory — List | Table: subject, section, faculty assigned, status (active/archived), student count. Actions: reassign faculty, archive. |
| **S12** | Classrooms Directory — Create / Edit / CSV Registry | Form: select subject, section, faculty. CSV import button for student enrollment. Preview imported students before saving. |
| **S13** | Evaluation Form Builder | Create form with title. Add/remove/reorder criteria: label, description, max rating. Live preview panel. |
| **S14** | Evaluation Forms — List | Table of all created forms. View, edit, delete actions. |
| **S15** | Evaluation Window Management — List | Table: faculty, section, form used, open date, close date, status badge. Create Window button. |
| **S16** | Evaluation Window — Create / Edit | Select faculty, section, form. Set open and close datetime. Save/publish. |
| **S17** | Grade Override | Search by student, subject, section, period. View locked grade. Override input with reason field. Logs override with admin ID and timestamp. |
| **S18** | Admin Notifications / Audit Logs | System events: grade posts, eval closures, AI triggers, overrides, faculty reassignments. |

### 8.3 Dean Screens
| Screen # | Screen Name | Key Elements |
|---|---|---|
| **S19** | Dean Dashboard | KPI row: Total Faculty, Total Sections, At-Risk Students, Pending Grade Posts. Quick links to reports and AI summaries. |
| **S20** | Grade Posting Status — Overview | Table per faculty: subjects, sections, periods posted vs pending. Filter by department, semester, school year. Includes the top-level **Dean's Registry Unlock Override Dashboard** with active faculty unlock requests list (showing "Approve Request" button) and custom force-override buttons to lock or unlock individual milestones. |
| **S21** | Grade Distribution — View | Select subject, section, period. View breakdown: passed, failed, grade ranges. Visual chart representation. |
| **S22** | Faculty Evaluation Results — Overview | List of all faculty with average evaluation rating per semester. Click to drill down per faculty. |
| **S23** | Faculty Evaluation Results — Per Faculty | Breakdown per section. Ratings per criterion. Anonymized comments. AI fitness prediction summary and verdict. |
| **S24** | At-Risk Students — List | Table: student name, course, section, running grade, AI recommendation, Early Warning indicator. Filter by course, section, severity. |
| **S25** | Summary Reports | Select report type, filter by semester/school year/department. Export as PDF or print. |

### 8.4 Faculty Screens
| Screen # | Screen Name | Key Elements |
|---|---|---|
| **S26** | Faculty Dashboard | KPI row: Active Class Records, Pending Grade Posts, At-Risk Students (across all classes), Open Eval Windows. Upcoming deadlines card. |
| **S27** | Class Records — List | Table: subject, section, school year, semester, status, posting status per period. Create Class Record button. Actions card updated to show both "Input Scores" and "View Posted" side-by-side. |
| **S28** | Class Record — Create | Select subject, section, school year, semester. Confirm and proceed to grade component setup. |
| **S29** | Grade Components — Setup | Per grading period (Prelim/Midterm/Semi-Final/Final). Add components: type, name, max score, weight. Live weight total validator (must equal 100%). |
| **S30** | Score Input — Student List | Select class record. **View Period dropdown** to filter by individual term (Prelim, Midterm, Semi-Final, Final) or view all terms side-by-side. Editable table per student: columns for Class Standing (Max 110), Character Rating (Max 100), and Term Exam (Max 40). Running Grade column (mono GWA equivalent, color-coded), Early Warning indicator dot (green/yellow/red) with hover tooltip. Inline save per row. Inputs disabled dynamically based on milestone lock state. **Fullscreen expand button** on table card header with Escape key / backdrop-click to exit. |
| **S31** | Grade Computation — Preview | Auto-computed grade per student showing full progression chain (PG, MG, MR, SFG, FG, TFR, SG, GWA, Remarks). Component breakdown. Missing scores highlighted. Summary bar: passed, failed, incomplete counts. Post Grades button with highly aesthetic milestone selection modal (enabling selective term posting) and lock confirmation dialog. **Fullscreen expand button** on table card header with sticky column headers and Escape key to exit. |
| **S32** | Posted Grades — View | Read-only view of posted grades. Displays locked GWA report columns (MR, TFR, SG, GWA, Remarks) matching the official printed format. Includes status badges per milestone and a **"📨 Request Unlock"** button next to locked terms, notifying the Dean when clicked. Top header navigation shortcuts provided. **Fullscreen expand button** on table card header with sticky column headers and Escape key to exit. |
| **S33** | Faculty Evaluation Results — My Results | Select section and eval window. View ratings per criterion (anonymized). View comments. AI fitness prediction (own result). |
| **S34** | Faculty Notifications | Eval window closed alerts, grade override notifications, AI prediction ready alerts. |

### 8.5 Student Screens
| Screen # | Screen Name | Key Elements |
|---|---|---|
| **S35** | Student Dashboard | KPI row: Enrolled Subjects, Latest Grade Posted, Pending Evaluations, AI Recommendation status. Enrolled subjects list with period badges. Notifications preview. |
| **S36** | My Grades — Subject List | List of enrolled subjects per semester. Badge per subject showing latest posted period (Posted=emerald, Pending=amber). |
| **S37** | My Grades — Subject Detail | Tabs: Prelim/Midterm/Semi-Final/Final. Per tab: computed grade, component breakdown table with expandable Class Standing row to view individual activity scores (Activity 1 to 6), missing scores/lapses highlighted. Includes a Complete Semestral Grade Record (Spreadsheet View) at the bottom showing the full calculation chain (PG, MG, MR, SFG, FG, TFR, SG, GWA, Remarks) with a fullscreen toggle. |
| **S38** | Faculty Evaluation — List | Active evaluation windows: faculty name, subject, section, open/close dates, status badge, deadline countdown. Evaluate button if pending. |
| **S39** | Faculty Evaluation — Form | Anonymity notice banner. Criteria grouped by 7 categories with 1-4 rating buttons. Textareas for strengths and improvement points. Anonymous submission confirmation dialog. |
| **S40** | AI Recommendation — View | Verdict badge (Continue/At-Risk/Recommend Shift). AI summary paragraph. Basis grade snapshot table. Generated timestamp. |
| **S41** | Student Notifications | Grade posted alerts, evaluation window opened alerts, AI recommendation ready alerts. |

### 8.6 Screen Count Summary

| Role | Screen Count | Screen Range |
|---|---|---|
| Shared / Public | 3 | S01 – S03 |
| Admin | 15 | S04 – S18 |
| Dean | 7 | S19 – S25 |
| Faculty | 9 | S26 – S34 |
| Student | 7 | S35 – S41 |
| **TOTAL** | **41** | **S01 – S41** |

---

*End of System Design Document — SAGE, DYCI Capstone Project AY 2025-2026*
