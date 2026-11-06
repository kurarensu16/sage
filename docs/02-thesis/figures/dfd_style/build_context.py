"""Level 0 (context) DFDs in the Essence Derm style.
Run: py build_context.py   -> writes PNG/SVG into ./out
Flows are directed: to_sys = entity -> system, from_sys = system -> entity.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dfdkit import context

OUT = os.path.join(os.path.dirname(__file__), 'out')
os.makedirs(OUT, exist_ok=True)

# ---------------- Figure 2.6: existing manual system ----------------
existing = [
    dict(name='Student',
         to_sys=['Attendance in class', 'Informal grade inquiries'],
         from_sys=['Term-end grade report', 'Verbal advice']),
    dict(name='Faculty',
         to_sys=['Raw scores in Excel COG template', 'Ad hoc risk observations'],
         from_sys=['Class rosters', 'Excel COG template']),
    dict(name='Dean',
         to_sys=['Paper grade correction approvals'],
         from_sys=['Submitted grade sheets', 'Informal at-risk reports']),
    dict(name='Registrar',
         to_sys=['Enrolment lists', 'Section assignments', 'Approved late grade changes'],
         from_sys=['Submitted grade sheets', 'Student records']),
]
print(context(os.path.join(OUT, 'Figure-2.6-Existing-Level0'), '0.0',
              'Manual Academic\nGrading and Risk\nMonitoring Process',
              existing, None, W=1800,
              store=('D0', 'Excel COG template,\npaper grade sheets,\nregistrar files')))

# ---------------- Figure 2.7: proposed ASPIRE ----------------
left = [
    dict(name='Student',
         to_sys=['Login credentials', 'Plan acknowledgment', 'Task completion reports with optional evidence',
                 'Practice attempts', 'Grade change request with evidence'],
         from_sys=['Tentative and posted grades', 'Attendance record', 'Advisories',
                   'Study guidance', 'Request status']),
    dict(name='Faculty',
         to_sys=['Activity scores and metadata', 'Learning resources', 'Attendance',
                 'Intervention plans', 'Follow-up records', 'Referrals',
                 'Correction requests', 'Dispute decisions'],
         from_sys=['Class rosters', 'Risk roster', 'Submission status']),
    dict(name='College Dean',
         to_sys=['Loading decisions (own college)', 'Correction and dispute decisions',
                 'Case dispositions', 'Report parameters'],
         from_sys=['College analytics', 'Escalated cases', 'Conflict refusals (college scope)']),
    dict(name='Registrar',
         to_sys=['Subjects, programs, grading templates', 'Sections and academic terms',
                 'Faculty loading and enrolment', 'Authorized overrides', 'Late grade changes'],
         from_sys=['Term readiness', 'Loading and enrolment coverage', 'Conflict refusals (full)']),
    dict(name='Administrator',
         to_sys=['Account creation and changes', 'Bulk imports', 'Maintenance windows',
                 'Encrypted backups'],
         from_sys=['Audit trail', 'Service and storage health']),
]
right = [
    dict(name='AI Model Provider\n(Gemini 2.5 Flash\nvia OpenRouter)',
         to_sys=['Study diagnostics', 'Practice sets', 'Task drafts'],
         from_sys=['Grounded prompt', 'Activity metadata']),
    dict(name='Private File Storage\n(Supabase Storage and\nCloudflare R2)',
         to_sys=['Time-limited access links'],
         from_sys=['Profile photos', 'Grade-dispute evidence', 'Task completion evidence']),
    dict(name='Email Delivery',
         to_sys=[],
         from_sys=['Grade, advising and request notices']),
]
print(context(os.path.join(OUT, 'Figure-2.7-Proposed-Level0'), '0.0',
              'ASPIRE\nAcademic Support and\nPerformance Advising',
              left, right, W=1800))
