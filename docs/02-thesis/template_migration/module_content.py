"""Per-module text for Chapter 1 Scope and Chapter 2 Proposed System (panel: group by module,
not by user). Reworded from the per-portal text it replaces; module list and order match
docs/02-thesis/figures/vtoc_module/vtoc_data.py (Figure 2.13)."""

SCOPE_INTRO = (
    "ASPIRE is organized into fifteen modules shared across its five user roles: Student, Faculty, Dean, "
    "Registrar, and Admin. Each module is described once below, listing the functions available to each "
    "role that uses it. Each role's portal shows only the functions of the modules available to that role, "
    "and Figure 2.13 in Chapter 2 presents the same module structure as the Visual Table of Contents.")

# (module, one-line purpose, [(role, function, description)])
SCOPE = [
    ('Authentication and Account', 'Controls how every user enters ASPIRE and maintains their own account.', [
        ('All users', 'Role-Based Login', 'Authenticates users of all five roles through Supabase Auth, checks whether the account is active, and routes the user to the portal for that role.'),
        ('All users', 'First Login / Change Password', 'Requires users with temporary credentials to create a password of at least eight characters containing uppercase and lowercase letters, a number, and a special character before accessing the system.'),
        ('All users', 'Forgot and Reset Password', 'Sends a time-limited 8-digit recovery code to the user\'s institutional email, verifies the code, applies the shared password rules, and optionally signs out other active sessions.'),
        ('All users', 'My Profile and Change Password', 'Shows administrator-maintained information and lets each user update only a profile photo and contact number and change their password; name, email, ID number, and department remain with the Administrator.'),
    ]),
    ('Dashboard', 'Gives each role a starting summary of the work it needs to act on.', [
        ('Student', 'Dashboard', 'Shows the current available GWA, the AI Standing indicator, recent official grade postings, and faculty advisories, with tentative information distinguished from officially posted grading-period results.'),
        ('Faculty', 'Dashboard', 'Summarizes handled classes, pending grading tasks, consultations, notifications, grade trends, and student-risk information.'),
        ('Dean', 'Dashboard', 'Shows college-level GWA information, grade-submission progress, and intervention cases.'),
        ('Registrar', 'Dashboard', 'Shows term readiness, enrollment and section coverage, faculty loading progress, and outstanding academic-setup work for the active school year and semester.'),
        ('Admin', 'Dashboard', 'Shows institution-wide user and record counts, the active term, and recent system transactions.'),
    ]),
    ('User Accounts', 'Creates and maintains the accounts of all five roles.', [
        ('Admin', 'Manage Users', 'Creates, searches, edits, and deactivates accounts for all five roles. Administrator-controlled identity, department, program, and section changes update related enrollment records where applicable.'),
        ('Admin', 'Import Users', 'Creates accounts in bulk from validated CSV or Excel files.'),
        ('Admin', 'Student Account Requests', 'Reviews the new-student records the Registrar submits and approves or declines each one, so an account exists before the Registrar enrolls the student.'),
        ('Registrar', 'View Users', 'Provides read-only access to account records for verification during enrollment and loading. Account creation and identity changes remain with the Administrator.'),
        ('Registrar', 'New Student Accounts', 'Submits the records of newly admitted students, from a per-college template, to the Administrator for account creation, without creating accounts or assigning emails itself. Records submitted together are tracked as one batch, and the Registrar is notified once every request in the batch is resolved.'),
    ]),
    ('Academic Setup', 'Defines the academic catalog and term calendar that every other module depends on.', [
        ('Registrar', 'Subjects', 'Maintains course codes, titles, units, department ownership, and grading-formula assignments, with CSV or Excel import.'),
        ('Registrar', 'Degree Programs', 'Maintains the program catalog under each college.'),
        ('Registrar', 'Grading Templates', 'Maintains program-specific COG components, weights, and maximum scores. Faculty cannot alter the assigned weight distribution.'),
        ('Registrar', 'Manage Sections', 'Maintains current-term section records by program and academic term, with CSV or Excel import.'),
        ('Registrar', 'Colleges and Departments', 'Maintains colleges and program catalogs and associates Dean accounts with their colleges.'),
        ('Registrar', 'Academic Terms', 'Defines academic terms and manages activation, rollover, next-term readiness, SG grace periods, and pending or overdue status. At a school-year rollover, each section is carried forward or promoted to the next year level in one action, and the Registrar separately marks completing students as graduated, so a graduated student\'s history and access remain intact.'),
    ]),
    ('Enrollment and Faculty Loading', 'Places faculty and students into the classes of the active term.', [
        ('Registrar', 'Faculty Loading and Provisioning', 'Assigns faculty to subject-section classes for the active term in any college. Editing is exclusive per college through a heartbeat-refreshed lock, each assignment requires a complete meeting schedule and a room from the room catalog, and the system refuses a schedule or room conflict for the faculty member, the section, or the room across every college. Assignments are drafted, then finalized into live class records.'),
        ('Registrar', 'Enrollment Management', 'Maintains block-section enrollment and adds irregular or off-block students directly to a class roster.'),
        ('Registrar', 'Section Rosters', 'Shows block-section members separately from students enrolled in individual classes outside their assigned section.'),
        ('Dean', 'Faculty Loading and Provisioning', 'Assigns faculty to subject-section classes within the Dean\'s own college under the same lock, schedule, room, and conflict rules; when a conflicting class belongs to another college, only that college and program are disclosed.'),
    ]),
    ('Classes and Grading', 'Records activity scores and computes and posts official grades from each subject\'s assigned COG template.', [
        ('Faculty', 'My Classes', 'Shows assigned classes, rosters, enrollment counts, and irregular-student labels, and is the entry to the selected-class grading workflow.'),
        ('Faculty', 'Grade Columns Setup', 'Displays the official activity columns and components from the subject\'s assigned COG template before score entry.'),
        ('Faculty', 'Scorebook', 'Provides an autosaving activity-based score grid. Required activity metadata includes the title, description, maximum score, and component assignment. Blank entries remain pending, while an entered zero is a valid recorded score.'),
        ('Faculty', 'Review and Post Grades', 'Calculates provisional ratings using the frozen class COG and posts official MR, TFR, and SG grading-period results through server-authoritative computation, in the required MR, TFR, then SG sequence.'),
        ('Faculty', 'Posted Grades and Corrections', 'Displays posted grading-period results and keeps the official record locked; corrections follow the Grade Change Requests and Overrides module.'),
        ('Student', 'My Subjects', 'Lists enrolled subjects, schedules, instructors, and running performance, including classes outside the student\'s block section once the student is added to that roster.'),
        ('Student', 'Grade Report', 'Shows officially posted MR, TFR, SG, transmuted GWA, and academic status or remarks.'),
        ('Student', 'Score Breakdown', 'Shows released activity titles, descriptions, scores, and tentative computations based on currently recorded evidence.'),
        ('Dean', 'Grade Submission Status', 'Tracks instructor submissions by grading period and identifies pending, late, and overdue classes.'),
        ('Dean', 'Grade Distribution', 'Shows grade distributions for the Dean\'s college for the applied academic period.'),
    ]),
    ('Attendance', 'Records attendance per class and flags the four-absence FDA threshold.', [
        ('Faculty', 'Attendance Monitoring', 'Records current-term attendance and displays Near FDA and FDA recommendation thresholds while retaining the instructor\'s final decision.'),
        ('Student', 'Attendance and Warnings', 'Shows current-term attendance records and an FDA recommendation warning at four or more absences; the final FDA decision remains with the instructor.'),
    ]),
    ('Academic Risk and Intervention', 'Prioritizes students by the Academic Risk Score and carries faculty-led intervention from evaluation to follow-up.', [
        ('Faculty', 'Evaluate Students', 'Presents a roster prioritized by the four-factor Academic Risk Score while allowing faculty to evaluate students at any risk level.'),
        ('Faculty', 'Academic Intervention Form', 'Supports observations, student-visible guidance, catch-up tasks, AI-assisted drafting, plan publication, frozen baseline records, task review, and Dean referral.'),
        ('Faculty', 'Intervention Records', 'Tracks acknowledgment, task progress, referral status, and the one-time follow-up snapshot used to close an intervention case.'),
        ('Student', 'Faculty Action Plans', 'Displays published faculty advisories, intervention guidance, catch-up tasks, acknowledgment status, and reported task progress, with an optional photo or PDF attached as evidence of completion.'),
        ('Dean', 'Risk and Honors Overview', 'Provides separate Academic At-Risk and President\'s Lister eligibility views using grade, attendance, recorded-zero, trajectory, and intervention evidence from one applied academic period.'),
        ('Dean', 'Escalated Cases', 'Supports review of faculty referrals, institutional recommendations, and case disposition.'),
        ('Dean', 'Intervention Results', 'Compares baseline and follow-up records, GWA change, risk transition, verified task completion, acknowledgment, and follow-up status, without presenting them as proof that ASPIRE caused academic change.'),
    ]),
    ('AI Study Advising', 'Provides the student\'s non-binding, AI-assisted study support.', [
        ('Student', 'Academic Insights', 'Converts the evidence the student can already see into plain-language guidance: it groups faculty-released scored activities below the 75% benchmark as areas for attention, explains the blockers between the student and honors eligibility, and provides the Ask ASPIRE explanation feature.'),
        ('Student', 'AI Study Advising', 'Provides activity-grounded study diagnostics, recommendations, and President\'s Lister eligibility explanations, with a deterministic fallback when the AI service is unavailable. It keeps at most one active study plan per subject per term, generates practice sets whose answers are withheld until the student attempts them, and is bounded by a per-student daily limit and an institution-wide call budget. It uses current-term evidence only.'),
    ]),
    ('Grade Change Requests and Overrides', 'Handles every authorized change to an official posted grade.', [
        ('Student', 'Grade Change Requests', 'Lets the student dispute a posted grading-period result within the dispute window, attach the one to three required evidence files, and follow the request through each review.'),
        ('Faculty', 'Grade Change Requests', 'Lets the instructor review a dispute, forward it to the Dean or reject it as not applicable, and apply the authorized correction once a decision is made.'),
        ('Faculty', 'SG Correction Requests', 'Lets the instructor request a student-scoped correction of a posted Semestral Grade with a reason and optional evidence, and apply it once through Edit Full Row and Apply after Dean approval.'),
        ('Dean', 'Grade Change Requests', 'Decides forwarded disputes and faculty correction requests in one queue. Approval authorizes a one-use correction by the assigned faculty member; it neither changes the grade directly nor unlocks the ordinary gradebook.'),
        ('Dean', 'Grade Overrides', 'Receives each Registrar override for the Dean\'s college with its before-and-after values and acknowledges it or queries it with a note; a query stays on the record but does not revert the grade.'),
        ('Registrar', 'Grade Override', 'Replaces an official SG percentage, effective GWA, and academic status together through a separately reasoned and audited workflow.'),
        ('Registrar', 'Late Grade Changes', 'Reviews grade changes requested after the dispute window has closed, which is the only way a closed term is reopened.'),
    ]),
    ('Consultations', 'Records grade consultations raised within the window that opens after each posting.', [
        ('Student', 'Consultation History', 'Shows the concern the student raised, the instructor\'s response, and the outcome.'),
        ('Faculty', 'Grade Consultation Log', 'Records each consultation with its mode, the instructor\'s response, and the resolution.'),
    ]),
    ('Reports', 'Produces printable and exportable summaries for the selected academic period.', [
        ('Faculty', 'Class Performance', 'Summarizes graded evidence, score and component results, attendance, and regular or Summer progression, with Excel export.'),
        ('Faculty', 'Comparisons and Trends', 'Supports descriptive A/B and multi-term comparisons with evidence coverage and Excel export; results do not establish teaching effectiveness or subject difficulty.'),
        ('Dean', 'Generate Reports', 'Produces summaries of academic performance, grade distribution, enrollment, risk-related information, and intervention outcomes for the Dean\'s college.'),
        ('Registrar', 'Generate Reports', 'Produces enrollment, section, loading, and grade-record summaries.'),
    ]),
    ('Notifications', 'Delivers role-appropriate notices raised by the other modules.', [
        ('All users', 'Notifications Inbox', 'Displays each role\'s notices: grades, advising, enrollment, and consultations for students; grade corrections, Dean decisions, rosters, and consultations for faculty; escalated cases and grade corrections for Deans; enrollment, loading, and grade records for the Registrar; and security, roster, and system notices for administrators.'),
        ('All users', 'Notification Settings', 'Lets each user configure the available alert preferences.'),
    ]),
    ('System Maintenance', 'Keeps the platform auditable, healthy, and recoverable.', [
        ('Admin', 'Audit Logs', 'Records relevant account, grading, correction, intervention, override, and configuration actions with available actor and time information.'),
        ('Admin', 'System Health', 'Shows service availability, recent operational errors, and the state of scheduled background work.'),
        ('Admin', 'Storage Health', 'Shows database capacity, object-storage usage, the AI advising allowance, and evidence-retention status against the hosted plan limits.'),
        ('Admin', 'Maintenance Mode', 'Schedules and announces maintenance windows and restricts non-administrator access while a window is active.'),
        ('Admin', 'Backup and Restore', 'Produces encrypted backups of operational records and restores them under administrator authorization.'),
    ]),
    ('Academic Period and Archive Access', 'Lets users review a previous term without changing it. Current Term is the default; the user selects a school year and semester and clicks Load Archive, and only that period loads, read-only.', [
        ('Student', 'Previous Terms', 'Attendance, completed action plans, and consultations.'),
        ('Faculty', 'Previous Terms', 'Attendance, completed intervention records, and the consultation log.'),
        ('Dean', 'Previous Terms', 'Grade distribution, risk and honors views, resolved escalated cases, intervention results, and reports.'),
        ('Registrar', 'Previous Terms', 'Sections and reports.'),
    ]),
]

PROPOSED_INTRO = (
    "The following section presents the proposed ASPIRE system module by module, describing how each "
    "module's workflow runs across the user roles that take part in it.")

PROPOSED = [
    ('Authentication and Account', "A user signs in with institutional credentials; ASPIRE checks that the account is active and opens the portal for that user's role. An account issued with temporary credentials must set a compliant password before first use, and a forgotten password is recovered through a time-limited 8-digit code sent to the institutional email. Each user may change only their photo, contact number, and password; identity details stay with the Administrator."),
    ('Dashboard', "Each role lands on a dashboard that summarizes what it needs to act on first: the student's standing and recent postings, the faculty member's pending grading and at-risk students, the Dean's submission progress and open cases, the Registrar's term readiness, and the Administrator's system activity. Dashboards show computed summaries and link to the modules where the work is done; they do not change records."),
    ('User Accounts', "Accounts originate with the Administrator, who creates them singly or in bulk by CSV or Excel import. For new students, the Registrar submits a batch of student records from the institutional list, the Administrator approves or declines each request and creates the accounts, and the Registrar is notified once the batch is resolved so enrollment can proceed. The Registrar can look up accounts but cannot create or edit them."),
    ('Academic Setup', "Before a term opens, the Registrar defines the catalog that every other module depends on: colleges and departments, degree programs, subjects with their assigned grading formula, program-specific COG templates, and sections. The Registrar then activates the academic term. At rollover, sections are carried forward or promoted, completing students are marked graduated, and SG grace periods are tracked until the term closes. Faculty and Deans use these definitions but cannot change them."),
    ('Enrollment and Faculty Loading', "Opening a college for loading takes an exclusive lock, so two offices cannot load the same college at once; both the Registrar and the Dean of that college can perform the task. An assignment without a complete meeting schedule and room is refused, and the conflict check runs across every college, because general-education faculty may be loaded into other colleges' sections, with the owning college notified when this occurs. The check and the load are serialized per section and per faculty member, so two colleges submitting at the same instant cannot double-book a section or instructor. Finalized assignments become live class records that appear in the faculty member's My Classes and, once the Registrar enrolls students by block section or directly into a class, in each student's My Subjects."),
    ('Classes and Grading', "Faculty first review the Grade Columns Setup drawn from the subject's COG template, then record activities with required titles, descriptions, maximum scores, and component assignments. Each class carries a frozen COG snapshot taken at provisioning, so later template changes do not alter its computation. Faculty preview and post official MR, TFR, and SG results through server-authoritative computation in that order; posted results replace the tentative values on the student's Grade Report, and blank activities are not counted until recorded. The Dean follows submission status and grade distribution for the college."),
    ('Attendance', "Faculty record attendance per class. At four or more absences the system shows faculty an FDA recommendation and the student a warning, while the final FDA decision remains with the instructor. Recorded absences also feed the attendance factor of the Academic Risk Score."),
    ('Academic Risk and Intervention', "The Evaluate Students roster is ordered by the Academic Risk Score, but faculty may evaluate any student. Faculty draft an intervention plan of guidance and catch-up tasks, optionally with AI assistance that they review, and publish it with a frozen baseline. The student sees the plan in Faculty Action Plans, acknowledges it, and reports task progress with evidence; faculty verify or return each task and record a one-time follow-up after the next posted grading-period result. Cases needing institutional attention are referred to the Dean, who reviews escalated cases and compares baseline and follow-up results, alongside separate risk and President's Lister eligibility views."),
    ('AI Study Advising', "Academic Insights explains the evidence the student can already see, and AI Study Advising uses Gemini 2.5 Flash to generate study diagnostics, plans, and practice sets grounded in the faculty's activity metadata and learning resources. When the model service is unavailable, a deterministic local fallback provides rule-based guidance. Neither path can change grades, risk classifications, or faculty intervention plans."),
    ('Grade Change Requests and Overrides', "A dispute over a posted grading-period result follows one chain across four portals. The student submits the request with one to three evidence files within thirty school days of the end of the academic term; the instructor rejects it as not applicable or forwards it to the Dean. Within the window the Dean's approval authorizes the correction; once the window has closed the request passes to the Registrar, who alone may reopen a closed term. Only after authorization does the instructor apply the correction, and a dedicated server transaction recalculates the affected results. Separately, the Registrar may override an official grade through an audited workflow, and the Dean of the student's college must acknowledge or query it. Evidence is held in private storage readable only by the participants and is purged at the next term rollover once the request is resolved."),
    ('Consultations', "After each posting, a consultation window opens. A student raises a concern about a posted grade, and the instructor records the mode, response, and resolution in the Grade Consultation Log, which the student sees as consultation history. Consultation is a reactive channel for discussion; a formal change to a grade follows the Grade Change Requests and Overrides module."),
    ('Reports', "Faculty review class performance and descriptive comparisons with Excel export. The Dean and the Registrar select a school year and semester and click Load Report before period-specific records are retrieved, then print or export the summaries for their scope."),
    ('Notifications', "Events in the other modules, such as grade postings, published plans, enrollment changes, consultation entries, grade-change steps, escalations, and system notices, raise notices to every role involved. Each user reads them in the Notifications Inbox and sets alert preferences in Notification Settings."),
    ('System Maintenance', "The Administrator monitors the platform through audit logs of significant actions, system and storage health views against the hosted plan limits, scheduled maintenance windows that restrict non-administrator access, and encrypted backups that can be restored under administrator authorization."),
    ('Academic Period and Archive Access', "Archives use the existing operational records rather than a separate database. Selecting a previous period does not retrieve records until the user clicks Load Archive; the system then loads only that period, identifies it on screen, and disables historical changes. Unresolved prior-term work stays in its operational queue until resolved, and the AI Study Advising has no archive view."),
]

REQ_SPEC = (
    "ASPIRE's functional requirements are organized by module, matching the breakdown in Scope and "
    "Delimitation above. The fifteen modules are Authentication and Account; Dashboard; User Accounts; "
    "Academic Setup; Enrollment and Faculty Loading; Classes and Grading; Attendance; Academic Risk and "
    "Intervention; AI Study Advising; Grade Change Requests and Overrides; Consultations; Reports; "
    "Notifications; System Maintenance; and Academic Period and Archive Access. Each module serves the "
    "roles that take part in it, and each role's portal shows only the functions of the modules available "
    "to that role.")

VTOC_P1 = (
    "Figure 2.13 presents ASPIRE's Visual Table of Contents organized by module, in two parts. Each module "
    "(n.0) lists the user roles that use it (n.m) and the functions each role performs there (n.m.k), taken "
    "from the navigation each portal displays. Part 1 covers the modules that set up and run each term: "
    "Authentication and Account, Dashboard, User Accounts, Academic Setup, Enrollment and Faculty Loading, "
    "Classes and Grading, Attendance, Academic Risk and Intervention, and AI Study Advising.")
VTOC_P2 = (
    "Part 2 covers the modules that handle grade changes, communication, and oversight: Grade Change Requests "
    "and Overrides, Consultations, Reports, Notifications, System Maintenance, and Academic Period and Archive "
    "Access. A module shared by several roles appears once, with each role's functions listed beneath it; "
    "Authentication and Account and Notifications apply to all five roles.")
