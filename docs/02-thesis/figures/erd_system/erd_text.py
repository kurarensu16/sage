"""Descriptions for the ERD figures. Table purposes come from the migration comments and from the
wording already used in the paper's Database Design section; links come from schema_model.json."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
M = json.load(open(os.path.join(HERE, 'schema_model.json'), encoding='utf-8'))
META = json.load(open(os.path.join(HERE, 'out', 'figures.json'), encoding='utf-8'))

PURPOSE = {
    'departments': 'lists the colleges, each of which owns programs, subjects, and sections',
    'programs': 'holds the degree program catalog owned by a college',
    'sections': 'holds the block sections created for each school year and semester',
    'subjects': 'is the subject catalog, with units and the grading template each subject uses',
    'academic_terms': 'defines the school year and semester that is active and records when a term rolls over into the next',
    'class_records': 'represents one faculty-subject-section classroom and carries the meeting pattern assigned during faculty loading',
    'enrollments': 'tracks block-section membership together with the irregular and off-block students added directly to a class roster',
    'users': 'is the single identity table for all five roles (Student, Faculty, Dean, Registrar, and Admin)',
    'guardians': 'holds each student\'s primary guardian contact',
    'user_push_tokens': 'registers the Android devices that receive push notices',
    'student_account_requests': 'is the Registrar-to-Admin handoff queue for new students and is not itself a source of accounts',
    'class_activities': 'holds the graded activities of a class record, each with a title, description, maximum score, and grading component',
    'activity_resources': 'holds the learning material a faculty member attaches to an activity, which AI Study Advising uses as grounding',
    'student_activity_scores': 'stores each student\'s numeric score per activity, with NULL meaning ungraded work',
    'student_term_scores': 'stores the student\'s score for each grading term of a class record',
    'student_term_details': 'keeps each student\'s year level and section per term so rollover does not rewrite history',
    'class_grading_columns': 'stores the fixed-slot column layout of a class record\'s scorebook',
    'grade_computations': 'holds the COG grading templates that subjects use',
    'grade_computation_components': 'defines the weighted components of each COG template',
    'posted_grades': 'stores the official grading-period results, with effective grades, remarks, and lock state',
    'posted_grade_revisions': 'keeps the immutable revision trail behind every posted or corrected grade',
    'grade_correction_history': 'records each applied correction with the previous and final values',
    'remark_override_requests': 'carries the grade change request chain, with reasons, evidence references, and the decision at each step',
    'grade_change_evidence': 'records the one to three evidence files attached to a grade change request in private storage',
    'grade_consultation_windows': 'holds one consultation window per class and milestone, open until the assigned faculty member finalizes it',
    'grade_consultation_notes': 'holds the consultations logged inside a window',
    'grade_posting_operations': 'logs each server-side grade posting as a durable, repeat-safe operation',
    'sg_correction_operations': 'logs each staged SG correction applied under an approved request',
    'admin_grade_override_operations': 'logs each Registrar override of an official grade, with the Dean\'s acknowledgment',
    'student_risk_evaluations': 'is the core of the closed-loop pipeline, storing the risk score, advising plan, and frozen baseline and follow-up snapshots',
    'student_risk_private_notes': 'keeps faculty observations away from every student-facing query',
    'student_evaluation_referrals': 'records each referral to the Dean with its rationale and the Dean\'s disposition',
    'student_evaluation_referral_requests': 'remembers every referral request so that a retry cannot reopen a resolved case',
    'faculty_intervention_drafts': 'keeps AI-generated task drafts with their model and prompt version',
    'faculty_intervention_working_drafts': 'keeps unpublished faculty work on an intervention',
    'student_academic_insights': 'holds the advisory log shown in Academic Insights',
    'attendance_records': 'feeds the attendance factor and the FDA warning',
    'student_consultation_requests': 'remains as the historical record of consultation requests, although no page creates rows in it',
    'student_tutor_plans': 'holds at most one active study plan per subject per term and is archived when the term rolls over',
    'student_tutor_practice_sets': 'holds generated practice, with answers withheld from the client',
    'student_tutor_practice_attempts': 'stores the answers a student submits to a practice set',
    'student_tutor_log': 'meters every model call, recording the model served and the tokens used against the budget',
    'search_destinations': 'is the approved list of further-reading links the model may offer',
    'notifications': 'stores the application notices addressed to users',
    'notification_deliveries': 'queues the in-app, device, and email deliveries of each notice',
    'notification_preferences': 'stores each user\'s device and email choices per notice type',
    'activity_logs': 'is the audit ledger that captures significant actions with the actor and time',
    'system_settings': 'holds the single row of maintenance state and system configuration',
    'backup_runs': 'records who exported or restored a backup and when',
    'hosting_plan_tiers': 'holds the published hosting plan limits as reference data',
    'maintenance_reasons': 'holds the reasons a maintenance window can be opened, with the message users see',
    'maintenance_note_presets': 'holds optional sentences an administrator can add to a maintenance notice',
    'provisioning_locks': 'makes faculty loading exclusive per college through an advisory lock that expires without a heartbeat',
    'faculty_load_drafts': 'holds each faculty loading assignment from draft to finalization and keeps superseded rows',
}


def human(t):
    return t.upper()


def join(items):
    items = list(items)
    if len(items) <= 1:
        return ''.join(items)
    return ', '.join(items[:-1]) + ' and ' + items[-1]


def describe(m):
    """Return the description paragraph(s) for one figure entry from figures.json."""
    tset = set(m['tables'])
    s = [f"{m['fig']} shows {join(human(t) for t in m['tables'])}."]
    s.append(' '.join(f"{human(t)} {PURPOSE[t]}." for t in m['tables']))
    links = []
    for t in m['tables']:
        for f in M[t]['fks']:
            if f['parent'] in tset:
                opt = ' (optional)' if M[t]['cols'][f['col']]['nullable'] else ''
                links.append(f"{human(t)}.{f['col']} refers to {human(f['parent'])}{opt}")
    if links:
        shown = links[:6]
        more = f' and {len(links) - 6} more' if len(links) > 6 else ''
        s.append('Within this figure, ' + join(shown) + more + '.')
    ext = sorted({f['parent'] for t in m['tables'] for f in M[t]['fks'] if f['parent'] not in tset})
    if ext:
        s.append('The dashed boxes mark ' + join(human(e) for e in ext) +
                 ', which are drawn in full in another figure and appear here only to show the links that reach them.')
    if any(M[t].get('partial') for t in m['tables']):
        part = [human(t) for t in m['tables'] if M[t].get('partial')]
        one = len(part) == 1
        s.append(join(part) + (' was' if one else ' were') + ' created before the tracked migrations began, so ' +
                 ('its columns come' if one else 'their columns come') +
                 ' from the original schema document plus later changes and should be confirmed against the live database.')
    return ' '.join(s)


def intro():
    n = len(M)
    return (f"ASPIRE's database holds {n} tables. Rather than one diagram that cannot be read, the schema is presented as "
            "seven categories, and a category that is too large for one page is split into parts (Figure 2.14a, 2.14b, and so on). "
            "Each figure was reverse-engineered from the schema definitions, the way a database tool such as MySQL Workbench draws "
            "an existing database: every table appears as a box listing its columns and data types, the primary key is underlined "
            "and marked PK, a foreign key is marked FK, and each line is a foreign-key relationship. The end of a line at the "
            "referenced table shows one row, the end at the referencing table shows many rows, and a circle marks a link that is "
            "optional. Where two lines cross, one arcs over the other. A table that belongs to a different figure appears as a "
            "small dashed box showing only the key that the link reaches.")


if __name__ == '__main__':
    for m in META[:3]:
        print(m['caption']); print(describe(m)); print()
