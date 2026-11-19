"""ASPIRE modules and, per module, each user role's functions. Taken from PORTAL_NAVIGATION
in src/components/layout/Sidebar.jsx plus the header menu (profile, password, notifications)
and the login/password routes. Grouped by module, not by portal, per the panel's comment."""

MODULES = [
    ('Authentication and Account', [
        ('All users', ['Role-Based Login', 'First Login / Change Password', 'Forgot and Reset Password',
                       'My Profile', 'Change Password']),
    ]),
    ('Dashboard', [
        ('Student', ['Standing, GWA, and Recent Postings']),
        ('Faculty', ['Classes, Pending Grading, and Student Risk']),
        ('Dean', ['College GWA, Submissions, and Cases']),
        ('Registrar', ['Term Readiness and Setup Progress']),
        ('Admin', ['Users, Records, and System Activity']),
    ]),
    ('User Accounts', [
        ('Admin', ['Manage Users', 'Import Users (CSV/Excel)', 'Student Account Requests']),
        ('Registrar', ['View Users', 'New Student Accounts']),
    ]),
    ('Academic Setup', [
        ('Registrar', ['Subjects', 'Degree Programs', 'Grading Templates', 'Manage Sections',
                       'Colleges and Departments', 'Academic Terms']),
    ]),
    # 2026-11-18: faculty loading is the Dean's alone; the Dean approves the SG; the
    # Registrar gains Student Records and Class Grade Sheets.
    ('Enrollment and Faculty Loading', [
        ('Registrar', ['Enrollment Management', 'Section Rosters']),
        ('Dean', ['Faculty Loading (own college)']),
    ]),
    ('Classes and Grading', [
        ('Faculty', ['My Classes', 'Grade Columns Setup', 'Scorebook', 'Review and Post Grades',
                     'Posted Grades and Corrections']),
        ('Student', ['My Subjects', 'Grade Report', 'Score Breakdown']),
        ('Dean', ['SG Approvals', 'Grade Submission Status', 'Grade Distribution']),
        ('Registrar', ['Student Records', 'Class Grade Sheets']),
    ]),
    ('Attendance', [
        ('Faculty', ['Attendance Monitoring']),
        ('Student', ['Attendance and Warnings']),
    ]),
    ('Academic Risk and Intervention', [
        ('Faculty', ['Evaluate Students', 'Academic Intervention Form', 'Intervention Records']),
        ('Student', ['Faculty Action Plans']),
        ('Dean', ['Risk and Honors Overview', 'Escalated Cases', 'Intervention Results']),
    ]),
    ('AI Study Advising', [
        ('Student', ['Academic Insights', 'AI Study Advising']),
    ]),
    ('Grade Change Requests and Overrides', [
        ('Student', ['Grade Change Requests']),
        ('Faculty', ['Grade Change Requests', 'SG Correction Requests']),
        ('Dean', ['Grade Change Requests', 'Grade Overrides']),
        ('Registrar', ['Grade Override', 'Late Grade Changes']),
    ]),
    ('Consultations', [
        ('Student', ['Consultation History']),
        ('Faculty', ['Grade Consultation Log']),
    ]),
    ('Reports', [
        ('Faculty', ['Class Performance', 'Comparisons and Trends']),
        ('Dean', ['Generate Reports']),
        ('Registrar', ['Generate Reports']),
    ]),
    ('Notifications', [
        ('All users', ['Notifications Inbox', 'Notification Settings']),
    ]),
    ('System Maintenance', [
        ('Admin', ['Audit Logs', 'System Health', 'Storage Health', 'Maintenance Mode', 'Backup and Restore']),
    ]),
    ('Academic Period and Archive Access', [
        ('Student', ['Previous-Term Attendance, Action Plans, and Consultations']),
        ('Faculty', ['Previous-Term Attendance, Interventions, and Consultation Log']),
        ('Dean', ['Previous-Term Grades, Risk, Cases, Results, and Reports']),
        ('Registrar', ['Previous-Term Sections, Reports, Student Records, and Grade Sheets']),
    ]),
]

PARTS = [(0, 9), (9, 15)]   # part 1: modules 1-9, part 2: modules 10-15
