import csv
import json
import os
import sys

path_dir = sys.argv[1]
all_tables = {}
for i in range(1, 8):
    fn = os.path.join(path_dir, 'Batch%d.csv' % i)
    with open(fn, newline='', encoding='utf-8-sig') as f:
        rows = list(csv.reader(f))
    data = json.loads(rows[1][0])
    all_tables.update(data['tables'])

targets = {
    'Grading Outcomes': ['posted_grades', 'posted_grade_revisions', 'grade_correction_history',
                          'remark_override_requests', 'grade_change_evidence',
                          'grade_consultation_windows', 'grade_consultation_notes',
                          'grade_posting_operations', 'sg_correction_operations',
                          'admin_grade_override_operations'],
    'Evaluation and Intervention': ['student_risk_evaluations', 'student_risk_private_notes',
                          'student_evaluation_referrals', 'student_evaluation_referral_requests',
                          'faculty_intervention_drafts', 'faculty_intervention_working_drafts',
                          'student_academic_insights', 'attendance_records',
                          'student_consultation_requests'],
    'Notifications and System': ['notifications', 'notification_deliveries',
                          'notification_preferences', 'activity_logs', 'system_settings',
                          'backup_runs', 'hosting_plan_tiers', 'maintenance_reasons',
                          'maintenance_note_presets', 'provisioning_locks', 'faculty_load_drafts'],
    'AI Study Advising': ['student_tutor_plans', 'student_tutor_practice_sets',
                          'student_tutor_practice_attempts', 'student_tutor_log',
                          'search_destinations'],
}
for group, tables in targets.items():
    total = 0
    print('== %s ==' % group)
    for t in tables:
        cols = all_tables.get(t)
        if cols is None:
            print('  %-40s NOT FOUND' % t)
            continue
        r = len(cols) + 3
        total += r
        print('  %-40s cols=%2d rows=%2d' % (t, len(cols), r))
    print('  TOTAL rows=%d  -> target per-part if split 2-ways: %d' % (total, (total + 1) // 2))
    print()
