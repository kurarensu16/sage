"""Give every part of a multi-part figure its own description, by splitting the existing
combined paragraph (written after the last part) across the parts it actually describes,
instead of duplicating it. The Registrar figure's combined paragraph was also found to be
incomplete (stops at module 4.0 of 8); its missing back half (5.0-8.0) is written fresh here,
grounded in the actual DFD images (Figure-2.11a-Registrar-C/D.png).

Run: py fix_figure_descriptions.py <in.docx> <out.docx>
"""
import sys
import zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{%s}' % NS['w']


def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W + 't')
                    if not any(a.tag == W + 'del' for a in t.iterancestors()))


def set_text(p, text):
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None]
    assert runs, vis_text(p)[:40]
    runs[0].find(W + 't').text = text
    runs[0].find(W + 't').set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    for r in runs[1:]:
        r.getparent().remove(r)


def new_para_like(template, text):
    p = etree.fromstring(etree.tostring(template))
    set_text(p, text)
    return p


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
all_p = list(root.iter(W + 'p'))


def find_unique(snippet):
    hits = [p for p in all_p if vis_text(p).strip() == snippet]
    assert len(hits) == 1, (snippet[:70], len(hits))
    return hits[0]


def caption(fig, part_label):
    return find_unique('Figure 2.%s | %s' % (fig, part_label))


# {figure_key: (part captions in order, [text per part], template_source_index)}
PLAN = {
    'student': {
        'caps': ['Level 1 DFD: Student Portal (part 1 of 3)',
                 'Level 1 DFD: Student Portal (part 2 of 3)',
                 'Level 1 DFD: Student Portal (part 3 of 3)'],
        'texts': [
            "Figure 2.8 decomposes the Student Portal into seven processes, matching the "
            "module breakdown in Figure 2.13, and is printed in three parts. Authenticate "
            "User (1.0) retrieves the account record and returns an access session. "
            "Dashboard (2.0) retrieves enrollments, posted grades, activity scores, and the "
            "latest risk evaluation, and returns the running or posted GWA and the standing "
            "badge. My Grades (3.0) retrieves posted milestones (MR, TFR, SG), recorded "
            "scores, activity details, and block membership. My Attendance (4.0) retrieves "
            "attendance records and returns the counts and the FDA warning.",

            "Academic Support (5.0) retrieves activity metadata, faculty learning material, "
            "posted milestones, and scores; sends a grounded prompt to the AI model provider "
            "and receives its diagnostics; saves the advisory log, the active study plan, "
            "generated practice sets, the student's practice attempts, and a metered call "
            "log; retrieves curated further reading; and exchanges the published "
            "intervention plan, the student's acknowledgment, and task completion reports "
            "with the risk evaluations. Grades and Consultation (6.0) retrieves the "
            "consultation history and its window, saves a grade change request with its one "
            "to three required evidence files in private storage, and retrieves the "
            "decision at each step.",

            "Account (7.0) saves the contact number, profile photo, guardian contact, and "
            "notification preferences.",
        ],
    },
    'faculty': {
        'caps': ['Level 1 DFD: Faculty Portal (part 1 of 4)',
                 'Level 1 DFD: Faculty Portal (part 2 of 4)',
                 'Level 1 DFD: Faculty Portal (part 3 of 4)',
                 'Level 1 DFD: Faculty Portal (part 4 of 4)'],
        'texts': [
            "Figure 2.9 decomposes the Faculty Portal into nine processes and is printed in "
            "four parts. Authenticate User (1.0) retrieves the account record, and Dashboard "
            "(2.0) retrieves handled sections, the risk distribution, and open "
            "consultations.",

            "Grades (3.0) saves activity metadata and raw scores, retrieves the COG template "
            "weights, posts the official MR, TFR, and SG milestones through "
            "server-authoritative computation, and carries a student-scoped SG correction "
            "from proposal through the Dean's decision to one-use application, saving the "
            "applied correction to the correction history and retrieving the required "
            "evidence files. Classes (4.0) retrieves class records and saves approved "
            "students to the roster.",

            "Student Risk (5.0) retrieves posted grades, scores, and absence counts; saves "
            "the risk evaluation, private observations, unpublished drafts, Dean referrals, "
            "and an audit entry; and exchanges an evaluation snapshot and three draft tasks "
            "with the AI model provider. Attendance (6.0) saves Present, Late, and Absent "
            "marks and returns FDA warnings.",

            "Performance Reports (7.0) retrieves milestone grades, scores, and attendance "
            "counts and returns class performance, comparisons, and an Excel export. Grade "
            "Consultation Log (8.0) saves consultations logged after a posting. Account "
            "(9.0) saves the contact number, profile photo, and notification preferences.",
        ],
    },
    'dean': {
        'caps': ['Level 1 DFD: Dean Portal (part 1 of 3)',
                 'Level 1 DFD: Dean Portal (part 2 of 3)',
                 'Level 1 DFD: Dean Portal (part 3 of 3)'],
        'texts': [
            "Figure 2.10 decomposes the Dean Portal into seven processes and is printed in "
            "three parts. Authenticate User (1.0) retrieves the account record, and "
            "Dashboard (2.0) retrieves college-wide grades and open evaluations and returns "
            "submission compliance and active interventions. Faculty Loading (3.0) works "
            "under an exclusive per-college edit lock, saves drafted and finalized load, "
            "retrieves offered subjects and the college's sections, provisions the class "
            "record with its meeting pattern, and returns a conflict refusal limited to the "
            "college and program of the clash.",

            "Grades (4.0) retrieves submission status and grade distribution, reviews SG "
            "correction proposals and grade change requests with their evidence, saves the "
            "decision at its step (approve, reject, or pass to the Registrar), and writes an "
            "audit entry; approval authorizes one dedicated faculty application but does not "
            "unlock the ordinary gradebook or change a grade directly. Student Risk (5.0) "
            "retrieves GWA, honors eligibility, and the risk evaluations with their "
            "baselines and follow-up snapshots, saves the disposition of escalated cases, "
            "and returns escalated cases, GWA change, risk transition, and verified "
            "completion.",

            "Reports (6.0) retrieves grade distribution and evaluation outcomes and returns "
            "exportable reports. Account (7.0) saves the contact number, profile photo, and "
            "notification preferences.",
        ],
    },
    'registrar': {
        'caps': ['Level 1 DFD: Registrar Portal (part 1 of 4)',
                 'Level 1 DFD: Registrar Portal (part 2 of 4)',
                 'Level 1 DFD: Registrar Portal (part 3 of 4)',
                 'Level 1 DFD: Registrar Portal (part 4 of 4)'],
        'texts': [
            "Figure 2.11 decomposes the Registrar Portal into eight processes and is printed "
            "in four parts. Authenticate User (1.0) reads account records, and Dashboard "
            "(2.0) summarises term readiness, enrolment and section coverage, and faculty "
            "loading progress. People (3.0) provides read-only access to accounts and hands "
            "over newly requested student accounts.",

            "Academic Setup (4.0) maintains subjects, degree programs, grading templates, "
            "sections, colleges and the academic term calendar.",

            # new: the figure's description previously stopped here; 5.0-6.0 were never
            # written. Grounded in Figure-2.11a-Registrar-C.png.
            "Enrollment and Loading (5.0) works under an exclusive per-college edit lock, "
            "saves drafted, finalized, and reassigned load, retrieves the room catalog, "
            "provisions the class record with its room and meeting pattern, and saves block "
            "membership and irregular or off-block students added to a roster, returning a "
            "conflict refusal disclosed in full. Grade Records (6.0) saves an overridden SG, "
            "effective GWA, and academic status, retrieves requests past the dispute window, "
            "and saves the revision trail and an audit entry, returning the override result.",

            # new: 7.0-8.0 were also never written. Grounded in Figure-2.11a-Registrar-D.png.
            "Reports (7.0) retrieves enrolment and section coverage, the loading summary, "
            "and posted grade records for exportable reports. Account (8.0) saves the "
            "contact number, profile photo, and notification preferences.",
        ],
    },
    'admin': {
        'caps': ['Level 1 DFD: Admin Portal (part 1 of 2)',
                 'Level 1 DFD: Admin Portal (part 2 of 2)'],
        'texts': [
            "Figure 2.12 decomposes the Admin Portal into five processes and is printed in "
            "two parts. Authenticate User (1.0) retrieves the account record, and Dashboard "
            "(2.0) retrieves recent transactions and the active term and returns user counts "
            "by role and system metrics. User Accounts (3.0) saves account creation, "
            "editing, deactivation, and bulk CSV/Excel imports, retrieves and decides "
            "pending student account requests, saves section enrollment for imported "
            "students, and writes an audit entry for each change.",

            "System Maintenance (4.0) retrieves the audit ledger, saves system settings "
            "including the AI call budget and maintenance state, retrieves hosting plan "
            "ceilings and maintenance reasons, saves encrypted backup runs, and queries "
            "Cloudflare R2 for object count and bytes used. Account (5.0) saves the contact "
            "number, profile photo, and notification preferences. Academic setup, term "
            "management, and grade override belong to the Registrar Portal (Figure 2.11).",
        ],
    },
    'vtoc': {
        'caps': ['ASPIRE Visual Table of Contents (VTOC) (part 1 of 2)',
                 'ASPIRE Visual Table of Contents (VTOC) (part 2 of 2)'],
        'texts': [
            "Figure 2.13 presents ASPIRE's role-based menu hierarchy, taken from the "
            "navigation each portal displays, and is printed in two parts. The Student "
            "Portal organizes Courses and Grades (subjects, grade report, score breakdown, "
            "attendance and warnings), Academic Support (faculty action plans, academic "
            "insights, and AI Study Advising), and Requests and Consultations (grade change "
            "requests and consultation history). The Faculty Portal uses Classes, with My "
            "Classes as the entry to the selected-class Scorebook, Review and Post Grades, "
            "and Posted Grades and Corrections workflow and Attendance Monitoring beside it, "
            "together with Student Support, Grades (the grade consultation log and grade "
            "change requests), and Performance Reports.",

            "The Dean Portal has Faculty Loading, Grades (submission status, grade change "
            "requests, grade overrides, and grade distribution), Risk and Interventions, and "
            "Reports. The Registrar Portal separates People, Academic Setup, Enrollment and "
            "Loading, Grade Records, and Reports. The Admin Portal separates User Accounts "
            "and System Maintenance (audit logs, system and storage health, maintenance "
            "mode, and backup and restore). Every portal also provides an Account module for "
            "the profile, password, and notification preferences.",
        ],
    },
}

report = []
for key, spec in PLAN.items():
    # find each part's caption paragraph directly (figure number is embedded in the caption text)
    cap_paras = []
    for c in spec['caps']:
        hits = [p for p in all_p if c in vis_text(p)]
        assert len(hits) == 1, (c, len(hits))
        cap_paras.append(hits[0])
    last_cap = cap_paras[-1]
    # the existing combined description sits right after the LAST part's caption
    old_desc = last_cap.getnext()
    assert old_desc is not None and old_desc.tag == W + 'p'
    template = old_desc
    # insert part 1..N-1 text right after their own captions
    for cap, text in zip(cap_paras[:-1], spec['texts'][:-1]):
        new_p = new_para_like(template, text)
        cap.addnext(new_p)
    # rewrite the last part's paragraph to hold only its own (final) text
    set_text(old_desc, spec['texts'][-1])
    report.append('%s: %d parts described' % (key, len(spec['caps'])))

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('\n'.join(report))
