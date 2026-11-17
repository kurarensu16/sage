"""Capstone activities from Capstone_Timeline.pdf, each assigned to one SDLC phase of the
Iterative and Incremental Model (mapping confirmed in chat). Shared by the standalone
timeline document and Table 2.13 in the paper."""
from datetime import date

PHASES = [
    ('Initial Planning', 'Establishes the project\'s overall goal, scope, and foundational decisions before any development cycle begins.'),
    ('Planning', 'Defines each cycle\'s specific goals, deliverables, and tasks, scoping one increment out of the overall system.'),
    ('Requirements', 'Gathers and specifies the requirements for that iteration\'s increment, covering functional needs and quality attributes.'),
    ('Analysis and Design', 'Translates the specified requirements into a technical blueprint that guides implementation.'),
    ('Implementation', 'Builds the design into working code, producing one functional increment per cycle.'),
    ('Testing', 'Verifies each increment against its requirements before it is integrated into the system.'),
    ('Evaluation', 'Has users and reviewers assess completed increments, surfacing issues to act on in later cycles.'),
    ('Planning (Next Iteration)', 'Feeds evaluation findings into planning the next iteration, closing the cycle.'),
]

ITERATIONS = [
    (1, 'Capstone 1: title submission to final presentation', date(2026, 2, 2), date(2026, 6, 14)),
    (2, 'Capstone 2: system improvement to the initial defense', date(2026, 8, 17), date(2026, 11, 1)),
    (3, 'After the initial defense: update, validation, and evaluation', date(2026, 10, 26), None),
]

D = date
# (phase, activity, category, start, end, counted week); iteration derived from dates
ACTIVITIES = [
    ('Initial Planning', 'Finding 3 problems', 'Data & problem work', D(2026, 2, 2), D(2026, 2, 15), 'W1-2'),
    ('Initial Planning', 'Initial data gathering', 'Data & problem work', D(2026, 2, 16), D(2026, 3, 1), 'W3-4'),
    ('Initial Planning', 'Formulating scope for 3 titles', 'Scope, title & advisor', D(2026, 3, 2), D(2026, 3, 15), 'W5-6'),
    ('Initial Planning', 'Title submission to approval', 'Scope, title & advisor', D(2026, 2, 2), D(2026, 3, 29), 'W1-8'),
    ('Planning', 'Major revision, choose 1 title', 'Revision', D(2026, 4, 6), D(2026, 4, 19), 'W10-11'),
    ('Planning', 'Finding a technical advisor', 'Scope, title & advisor', D(2026, 9, 21), D(2026, 10, 4), 'W22-23'),
    ('Requirements', 'Scale down scope and problem', 'Scope, title & advisor', D(2026, 4, 27), D(2026, 5, 3), 'W13'),
    ('Requirements', 'VP Academic Affairs and VP Operations consultation (Oct 13)', 'Consultation', D(2026, 10, 12), D(2026, 10, 18), 'W25'),
    ('Requirements', 'Informal data gathering with end users to confirm the workflow', 'Data & problem work', D(2026, 11, 2), D(2026, 11, 15), 'W28-29'),
    ('Analysis and Design', 'Paper writing, built with the system', 'System & paper', D(2026, 4, 6), D(2026, 5, 17), 'W10-15'),
    ('Analysis and Design', 'Technical advisor consultation and revision', 'Consultation', D(2026, 9, 28), D(2026, 11, 15), 'W23-29'),
    ('Implementation', 'Partly working system and UI', 'System & paper', D(2026, 4, 6), D(2026, 4, 19), 'W10-11'),
    ('Implementation', 'Revision of system and paper', 'Revision', D(2026, 5, 4), D(2026, 5, 17), 'W14-15'),
    ('Implementation', 'Edit and improve the system', 'System & paper', D(2026, 8, 17), D(2026, 9, 20), 'W17-21'),
    ('Implementation', 'Major system update after the initial defense', 'Revision', D(2026, 10, 26), D(2026, 11, 8), 'W27-28'),
    ('Implementation', 'Update everything and look for the IT expert', 'Revision', D(2026, 11, 2), D(2026, 11, 8), 'W28'),
    ('Testing', 'Full-cycle system testing: 8 cycles with mock data, from user creation to term rollover', 'Validation & evaluation', D(2026, 11, 2), D(2026, 11, 15), 'W28-29'),
    ('Testing', 'Automated verification run (Table 3.1 in the paper)', 'Validation & evaluation', D(2026, 11, 8), D(2026, 11, 8), 'W28'),
    ('Evaluation', 'Title defense: 3 problems, 3 titles', 'Defense', D(2026, 3, 30), D(2026, 4, 5), 'W9'),
    ('Evaluation', 'Re-defense: chosen title', 'Defense', D(2026, 4, 20), D(2026, 4, 26), 'W12'),
    ('Evaluation', 'Final presentation (Capstone 1 ends)', 'Defense', D(2026, 5, 18), D(2026, 5, 24), 'W16'),
    ('Evaluation', 'Initial questionnaire created', 'Data & problem work', D(2026, 10, 12), D(2026, 10, 18), 'W25'),
    ('Evaluation', 'Consultation on the questionnaire before the defense', 'Consultation', D(2026, 10, 19), D(2026, 10, 25), 'W26'),
    ('Evaluation', 'Draft of Chapters 3 and 4', 'System & paper', D(2026, 10, 19), D(2026, 11, 15), 'W26-29'),
    ('Evaluation', 'Initial defense (Oct 26)', 'Defense', D(2026, 10, 26), D(2026, 11, 1), 'W27'),
    ('Evaluation', 'Update the questionnaire from the defense recommendations', 'Data & problem work', D(2026, 11, 2), D(2026, 11, 8), 'W28'),
    ('Evaluation', 'Consult, revise and get the questionnaire approved by the technical advisor', 'Consultation', D(2026, 11, 2), D(2026, 11, 8), 'W28'),
    ('Evaluation', 'Look for 3 validators', 'Validation & evaluation', D(2026, 11, 2), D(2026, 11, 8), 'W28'),
    ('Evaluation', 'Validation by 3 validators, CREDO office and ethics certification', 'Validation & evaluation', D(2026, 11, 2), D(2026, 11, 15), 'W28-29'),
    ('Evaluation', 'Gather information and approval letters to conduct the evaluation', 'Validation & evaluation', D(2026, 11, 9), D(2026, 11, 15), 'W29'),
    ('Evaluation', 'Contact the IT expert and end users to evaluate the system', 'Validation & evaluation', D(2026, 11, 9), D(2026, 11, 22), 'W29-30'),
    ('Evaluation', 'Add the findings to the documentation', 'System & paper', D(2026, 11, 16), D(2026, 11, 22), 'W30'),
    ('Planning (Next Iteration)', 'Follow-up informal data gathering', 'Data & problem work', D(2026, 5, 25), D(2026, 6, 7), 'Break'),
    ('Planning (Next Iteration)', 'Improvement and integration of revisions', 'System & paper', D(2026, 5, 25), D(2026, 6, 14), 'Break'),
    ('Planning (Next Iteration)', 'Further consult and revise cycles (ongoing until approved)', 'Consultation', D(2026, 11, 16), D(2026, 11, 30), 'W30+'),
]

# Half-month columns; mid-June to mid-August (the break) is left out, as in the original.
COLUMNS = [
    ('Feb', '1-15', D(2026, 2, 1), D(2026, 2, 15)), ('Feb', '16-28', D(2026, 2, 16), D(2026, 2, 28)),
    ('Mar', '1-15', D(2026, 3, 1), D(2026, 3, 15)), ('Mar', '16-31', D(2026, 3, 16), D(2026, 3, 31)),
    ('Apr', '1-15', D(2026, 4, 1), D(2026, 4, 15)), ('Apr', '16-30', D(2026, 4, 16), D(2026, 4, 30)),
    ('May', '1-15', D(2026, 5, 1), D(2026, 5, 15)), ('May', '16-31', D(2026, 5, 16), D(2026, 5, 31)),
    ('Jun', '1-14', D(2026, 6, 1), D(2026, 6, 14)),
    ('Aug', '17-31', D(2026, 8, 17), D(2026, 8, 31)),
    ('Sep', '1-15', D(2026, 9, 1), D(2026, 9, 15)), ('Sep', '16-30', D(2026, 9, 16), D(2026, 9, 30)),
    ('Oct', '1-15', D(2026, 10, 1), D(2026, 10, 15)), ('Oct', '16-31', D(2026, 10, 16), D(2026, 10, 31)),
    ('Nov', '1-15', D(2026, 11, 1), D(2026, 11, 15)), ('Nov', '16-30', D(2026, 11, 16), D(2026, 11, 30)),
]

ITER_COLOR = {1: '2F6FB0', 2: '6A5FB5', 3: '2A8C7E'}
CAT_COLOR = {'Data & problem work': '2F6FB0', 'Scope, title & advisor': '6A5FB5', 'Defense': 'C4572B',
             'Revision': '8A6D1C', 'Consultation': '1F8A70', 'System & paper': 'B03A8C',
             'Validation & evaluation': '2E7D8C'}


def iteration_on(day):
    if day < D(2026, 8, 1):
        return 1
    return 3 if day >= D(2026, 10, 26) else 2


def iterations_of(start, end):
    return sorted({iteration_on(start), iteration_on(end)})


def overlaps(start, end, col):
    return start <= col[3] and end >= col[2]


def phase_cell_iterations(phase, col):
    """Iterations active for a phase within one column (split multi-iteration activities by date)."""
    its = set()
    for ph, _, _, s, e, _ in ACTIVITIES:
        if ph == phase and overlaps(s, e, col):
            lo, hi = max(s, col[2]), min(e, col[3])
            its.update({iteration_on(lo), iteration_on(hi)})
    return sorted(its)


def fmt(d):
    return d.strftime('%b ') + str(d.day)


def date_range(s, e):
    return fmt(s) if s == e else '%s - %s' % (fmt(s), fmt(e))
