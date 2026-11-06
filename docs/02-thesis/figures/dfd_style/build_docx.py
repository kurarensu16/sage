"""Apply the 2026-11-02 figure and text updates to the thesis Word file.

Input : the current tracked paper (ASPIRE_Chapters_1-2_Master_TRACKED_2026-10-30.docx)
Output: TRACKED_2026-11-02 (earlier revisions kept, new text edits as tracked changes)
        UPDATED_2026-11-02 (every revision accepted, new edits applied plainly)

Picture swaps are NOT tracked changes (Word has no revision mark for picture data).
Extra picture parts and their captions ARE tracked as insertions.
Run: py build_docx.py <source.docx> <out_dir>
"""
import copy
import io
import os
import re
import struct
import sys
import zipfile
from lxml import etree

SRC, OUTDIR = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, 'out')
NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
}
W = '{%s}' % NS['w']
R = '{%s}' % NS['r']
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
AUTHOR, DATE = 'Claude Code', '2026-11-02T14:40:00Z'
MAXW, MAXH = 5376672, 6900000


def png_size(path):
    with open(path, 'rb') as f:
        b = f.read(24)
    return struct.unpack('>II', b[16:24])


def fit(w, h):
    s = min(MAXW / w, MAXH / h)
    return int(w * s), int(h * s)


# ------------------------------------------------------------------ figures
# media file in the paper -> rendered PNG parts (in order)
FIGURES = {
    'image7.png': ['Figure-2.6-Existing-Level0.png'],
    'image39.png': ['Figure-2.6a-Existing-Student.png'],
    'image40.png': ['Figure-2.6b-Existing-Faculty.png'],
    'image41.png': ['Figure-2.6c-Existing-Dean.png'],
    'image42.png': ['Figure-2.6d-Existing-Registrar.png'],
    'image8.png': ['Figure-2.7-Proposed-Level0.png'],
    'image9.png': ['Figure-2.8-Student-A.png', 'Figure-2.8-Student-B.png', 'Figure-2.8-Student-C.png'],
    'image10.png': ['Figure-2.9-Faculty-A.png', 'Figure-2.9-Faculty-B.png', 'Figure-2.9-Faculty-C.png', 'Figure-2.9-Faculty-D.png'],
    'image11.png': ['Figure-2.10-Dean-A.png', 'Figure-2.10-Dean-B.png', 'Figure-2.10-Dean-C.png'],
    'image43.png': ['Figure-2.11a-Registrar-A.png', 'Figure-2.11a-Registrar-B.png', 'Figure-2.11a-Registrar-C.png', 'Figure-2.11a-Registrar-D.png'],
    'image12.png': ['Figure-2.11-Admin-A.png', 'Figure-2.11-Admin-B.png'],
    'image13.png': ['Figure-2.12-VTOC-A.png', 'Figure-2.12-VTOC-B.png'],
}

# ------------------------------------------------------------------ text
T_DFD_INTRO = (
    "The Data Flow Diagram (DFD) illustrates the logical flow of inputs, outputs, and processes within ASPIRE. "
    "This section first presents the Existing System, DYCI's current manual academic grading and risk monitoring "
    "process, followed by the Proposed System (ASPIRE) context diagram (Level 0) and the exploded Level 1 diagrams "
    "for each role-based portal. In every diagram an external entity is a plain yellow rectangle, a process is a "
    "numbered rounded box, and a data store is a box with a grey D-numbered tab. Each arrow is one directed flow: "
    "an arrow into a process is data the process receives, an arrow out of it is data the process returns, an arrow "
    "toward a data store is a save, and an arrow from a data store is a retrieve. No external entity touches a data "
    "store directly. Where a Level 1 diagram is too long for one page it is printed in numbered parts that continue "
    "the same process numbering."
)
T_EXIST_REG = (
    "The Registrar already exists at DYCI and already performs this work, so the existing system is drawn with four "
    "participants. The catalogue, the section lists and the term calendar live in separate files that are re-typed "
    "into every document needing them; a student added to a class outside their block section is a handwritten note; "
    "a late grade change carries a signature but no recorded window or authority; and nothing connects a released "
    "grade back to the sheet it came from."
)
T_L0 = (
    "Figure 2.12 shows ASPIRE as a single process and the parties that exchange data with it. Students send login "
    "credentials, plan acknowledgments, task completion reports, practice attempts, and grade change requests with "
    "evidence, and receive tentative and posted grades, attendance records, advisories, study guidance, and request "
    "status. Faculty send activity scores and metadata, learning resources, attendance, intervention plans, "
    "follow-up records, referrals, correction requests, and dispute decisions, and receive class rosters, the risk "
    "roster, and submission status. The College Dean sends loading decisions for their own college, correction and "
    "dispute decisions, case dispositions, and report parameters, and receives college analytics, escalated cases, "
    "and conflict refusals limited to the college and program involved. The Registrar sends subjects, programs, "
    "grading templates, sections, academic terms, faculty loading and enrolment, authorized overrides, and late "
    "grade changes, and receives term readiness, loading and enrolment coverage, and conflict refusals in full. The "
    "Administrator sends account changes, bulk imports, maintenance windows, and encrypted backups, and receives "
    "the audit trail and service and storage health. Three external parties complete the boundary: the AI model "
    "provider receives a grounded prompt and activity metadata and returns study diagnostics, practice sets, and "
    "task drafts; private file storage holds profile photos and grade-dispute evidence and returns time-limited "
    "access links; and email delivery carries grade, advising, and request notices. The AI provider returns advice "
    "only and cannot change a grade, a risk tier, or an intervention plan on its own."
)
T_STUDENT = (
    "Figure 2.13 decomposes the Student Portal into seven processes, matching the module breakdown in Figure 2.18, "
    "and is printed in three parts. Authenticate User (1.0) retrieves the account record and returns an access "
    "session. Dashboard (2.0) retrieves enrollments, posted grades, activity scores, and the latest risk evaluation, "
    "and returns the running or posted GWA and the standing badge. My Grades (3.0) retrieves posted milestones (MR, "
    "TFR, SG), recorded scores, activity details, and block membership. My Attendance (4.0) retrieves attendance "
    "records and returns the counts and the FDA warning. Academic Support (5.0) retrieves activity metadata, faculty "
    "learning material, posted milestones, and scores; sends a grounded prompt to the AI model provider and receives "
    "its diagnostics; saves the advisory log, the active study plan, generated practice sets, the student's practice "
    "attempts, and a metered call log; retrieves curated further reading; and exchanges the published intervention "
    "plan, the student's acknowledgment, and task completion reports with the risk evaluations. Grades and "
    "Consultation (6.0) retrieves the consultation history and its window, saves a grade change request with its "
    "one to three required evidence files in private storage, and retrieves the decision at each step. Account (7.0) "
    "saves the contact number, profile photo, guardian contact, and notification preferences."
)
T_FACULTY = (
    "Figure 2.14 decomposes the Faculty Portal into nine processes and is printed in four parts. Authenticate User "
    "(1.0) retrieves the account record, and Dashboard (2.0) retrieves handled sections, the risk distribution, and "
    "open consultations. Grades (3.0) saves activity metadata and raw scores, retrieves the COG template weights, "
    "posts the official MR, TFR, and SG milestones through server-authoritative computation, and carries a "
    "student-scoped SG correction from proposal through the Dean's decision to one-use application, saving the "
    "applied correction to the correction history and retrieving the required evidence files. Classes (4.0) "
    "retrieves class records and saves approved students to the roster. Student Risk (5.0) retrieves posted grades, "
    "scores, and absence counts; saves the risk evaluation, private observations, unpublished drafts, Dean "
    "referrals, and an audit entry; and exchanges an evaluation snapshot and three draft tasks with the AI model "
    "provider. Attendance (6.0) saves Present, Late, and Absent marks and returns FDA warnings. Performance Reports "
    "(7.0) retrieves milestone grades, scores, and attendance counts and returns class performance, comparisons, and "
    "an Excel export. Grade Consultation Log (8.0) saves consultations logged after a posting. Account (9.0) saves "
    "the contact number, profile photo, and notification preferences."
)
T_DEAN = (
    "Figure 2.15 decomposes the Dean Portal into seven processes and is printed in three parts. Authenticate User "
    "(1.0) retrieves the account record, and Dashboard (2.0) retrieves college-wide grades and open evaluations and "
    "returns submission compliance and active interventions. Faculty Loading (3.0) works under an exclusive "
    "per-college edit lock, saves drafted and finalized load, retrieves offered subjects and the college's "
    "sections, provisions the class record with its meeting pattern, and returns a conflict refusal limited to the "
    "college and program of the clash. Grades (4.0) retrieves submission status and grade distribution, reviews SG "
    "correction proposals and grade change requests with their evidence, saves the decision at its step (approve, "
    "reject, or pass to the Registrar), and writes an audit entry; approval authorizes one dedicated faculty "
    "application but does not unlock the ordinary gradebook or change a grade directly. Student Risk (5.0) "
    "retrieves GWA, honors eligibility, and the risk evaluations with their baselines and follow-up snapshots, "
    "saves the disposition of escalated cases, and returns escalated cases, GWA change, risk transition, and "
    "verified completion. Reports (6.0) retrieves grade distribution and evaluation outcomes and returns exportable "
    "reports. Account (7.0) saves the contact number, profile photo, and notification preferences."
)
T_ADMIN = (
    "Figure 2.17 decomposes the Admin Portal into five processes and is printed in two parts. Authenticate User "
    "(1.0) retrieves the account record, and Dashboard (2.0) retrieves recent transactions and the active term and "
    "returns user counts by role and system metrics. User Accounts (3.0) saves account creation, editing, "
    "deactivation, and bulk CSV/Excel imports, retrieves and decides pending student account requests, saves "
    "section enrollment for imported students, and writes an audit entry for each change. System Maintenance (4.0) "
    "retrieves the audit ledger, saves system settings including the AI call budget and maintenance state, "
    "retrieves hosting plan ceilings and maintenance reasons, saves encrypted backup runs, and queries Cloudflare R2 "
    "for object count and bytes used. Account (5.0) saves the contact number, profile photo, and notification "
    "preferences. Academic setup, term management, and grade override belong to the Registrar Portal (Figure 2.16)."
)
T_VTOC = (
    "Figure 2.18 presents ASPIRE's role-based menu hierarchy, taken from the navigation each portal displays, and is "
    "printed in two parts. The Student Portal organizes Courses and Grades (subjects, grade report, score "
    "breakdown, attendance and warnings), Academic Support (faculty action plans, academic insights, and AI Study "
    "Advising), and Requests and Consultations (grade change requests and consultation history). The Faculty Portal "
    "uses Classes, with My Classes as the entry to the selected-class Scorebook, Review and Post Grades, and Posted "
    "Grades and Corrections workflow and Attendance Monitoring beside it, together with Student Support, Grades "
    "(the grade consultation log and grade change requests), and Performance Reports. The Dean Portal has Faculty "
    "Loading, Grades (submission status, grade change requests, grade overrides, and grade distribution), Risk and "
    "Interventions, and Reports. The Registrar Portal separates People, Academic Setup, Enrollment and Loading, "
    "Grade Records, and Reports. The Admin Portal separates User Accounts and System Maintenance (audit logs, system "
    "and storage health, maintenance mode, and backup and restore). Every portal also provides an Account module for "
    "the profile, password, and notification preferences."
)

TERMS = [
    ("Academic Insights", "A student-facing view in which the AI summarizes the student's standing and areas for attention from posted grades, scores, and attendance. It is advice only and changes no grade or risk tier."),
    ("Academic Risk Score", "A composite score from 0 to 100 built from four factors (GWA deficit, attendance and the FDA trigger, recorded zero scores, and the Prelim-to-Midterm trajectory) and classified into risk tiers."),
    ("Academic Term", "The school year and semester for which classes, enrolment, and grades are recorded. The Registrar defines, activates, and rolls over academic terms."),
    ("AI Study Advising", "The student-facing AI feature, also called the AI Study Tutor, that grounds study guidance, practice sets, and task drafts in the faculty's activity metadata and learning resources."),
    ("Audit Log", "A permanent ledger of significant system actions that records who acted, what was done, and when, kept for administrators to review."),
    ("Block Section", "The section a regular student belongs to for a term. Irregular or off-block students are added directly to a class roster by the Registrar or the Dean."),
    ("Class Record", "The record of one subject taught to one section in one term, holding its activities, scores, attendance, and posted grades."),
    ("COG Template", "DYCI's institution-approved Computation of Grades template, which fixes a subject's grade components and their weights."),
    ("Context Diagram", "The Level 0 data flow diagram that shows the whole system as a single process together with the external parties that exchange data with it."),
    ("Data Flow", "A named piece of data moving between an external entity, a process, and a data store. Each flow is drawn as its own directed arrow."),
    ("Data Flow Diagram (DFD)", "A diagram of how data moves among external entities, processes, and data stores, without showing how the work is carried out."),
    ("Data Store", "A place where data is held between processes, drawn as a box with a D-numbered tab. In ASPIRE each data store is a database table or a private storage bucket."),
    ("Entity Relationship Diagram (ERD)", "A diagram of the database tables and the relationships between them. ASPIRE presents its schema as separate ERDs, one for each functional layer."),
    ("Exploded Data Flow Diagram (Level 1)", "A diagram that breaks the single process of the context diagram into its modules, each with its own data flows and data stores."),
    ("External Entity", "A person or system outside ASPIRE that sends data to it or receives data from it, such as a Student, Faculty member, College Dean, Registrar, Administrator, the AI model provider, file storage, or email delivery."),
    ("Faculty Loading", "The assignment of faculty to subject-section classes with a meeting schedule, done by the Dean or the Registrar under an exclusive per-college edit lock and finalized into live class records."),
    ("FDA Warning", "An advisory flag shown when a student reaches four or more absences in a class. The final FDA decision remains with the instructor."),
    ("Grade Change Request", "A request to correct a posted grade, raised by a student or a faculty member and carried with its evidence through the faculty, Dean, and, where required, Registrar decisions."),
    ("Grade Consultation", "A recorded conversation between a student and an instructor about a posted grade, held within the consultation window that opens after grades are posted."),
    ("Grade Override", "An authorized change to an official posted grade, made by the Registrar and kept with a revision trail. The Dean acknowledges the override."),
    ("GWA", "General Weighted Average, the weighted average of a student's transmuted grades. The running GWA is labeled tentative until every Semestral Grade is posted."),
    ("Human-in-the-Loop (HITL)", "A design in which AI output is advice that a person reviews and approves before it takes effect."),
    ("Intervention Plan", "A faculty-approved plan of student-visible guidance and catch-up tasks, published after an evaluation and kept with a frozen baseline so that its outcome can be measured at follow-up."),
    ("MR, TFR, and SG", "The Midterm Rating, Tentative Final Rating, and Semestral Grade, the three grading milestones that are posted for each subject."),
    ("Posted Grade", "An official grading-period result that has been computed on the server and released to the student."),
    ("President's List", "The honors recognition defined in the DYCI Student Handbook. ASPIRE monitors eligibility separately from the Academic Risk Score."),
    ("Private Storage", "Access-controlled file storage for profile photos and grade-dispute evidence, reached only through time-limited links."),
    ("Process", "A numbered activity that receives data and returns data, drawn as a rounded box with its process number."),
    ("Registrar", "The institution-wide officer who maintains academic setup, academic terms, enrolment, faculty loading, and official grade records. The Registrar is the fifth ASPIRE role."),
    ("Role-Based Access Control (RBAC)", "A security approach that limits each user to the functions and records that the user's role allows."),
    ("Visual Table of Contents (VTOC)", "A hierarchical chart of every portal's modules and pages."),
]
FIG_SHIFT = 5   # Figures 2.2-2.6 (flowcharts) are removed, so every later figure moves down by five


def fig_new(n):
    # base numbers: 7-18 are the DFDs and VTOC (down by five); 19-24 are the old ERD figures (replaced);
    # 25 and up are the user-interface screens (down by four, since seven ERD categories replace six figures)
    if 7 <= n <= 18:
        return n - FIG_SHIFT
    if n >= 25:
        return n - 4
    return n


def renum_text(s):
    return re.sub(r'(Figures? 2\.)(\d+)',
                  lambda m: m.group(1) + str(fig_new(int(m.group(2)))), s)


for _n in ('T_EXIST_REG', 'T_L0', 'T_STUDENT', 'T_FACULTY', 'T_DEAN', 'T_ADMIN', 'T_VTOC'):
    globals()[_n] = renum_text(globals()[_n])
T_PROPOSED_INTRO = ("The following section presents the proposed ASPIRE system for each of the five user roles, "
                    "describing the end-to-end workflow available to each within the platform.")
T_REGISTRAR_PROSE = ("The Registrar Portal is the fifth portal and the one created by separating registrar work from "
                     "system administration. People provides read-only account lookup and hands over newly requested "
                     "student accounts. Academic Setup maintains subjects, degree programs, grading templates, sections, "
                     "colleges and the academic term calendar, all of which the Admin Portal held before the split.")
T_DEF_INTRO = ("This section defines the terms used in this paper as they apply to ASPIRE. The terms are listed in "
               "alphabetical order.")


# ------------------------------------------------------------------ helpers
class Ctx:
    def __init__(self, root, tracked):
        self.root, self.tracked, self.n = root, tracked, 30000

    def rid(self):
        self.n += 1
        return str(self.n)

    def mark(self, tag):
        e = etree.Element(W + tag)
        e.set(W + 'id', self.rid())
        e.set(W + 'author', AUTHOR)
        e.set(W + 'date', DATE)
        return e


def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W + 't')
                   if not any(a.tag == W + 'del' for a in t.iterancestors()))


def accept_all(root):
    for d in list(root.iter(W + 'del')):
        if d.getparent() is not None and d.getparent().tag != W + 'rPr':
            d.getparent().remove(d)
    for i in list(root.iter(W + 'ins')):
        par = i.getparent()
        if par.tag == W + 'rPr':
            par.remove(i)
            continue
        idx = par.index(i)
        for c in list(i):
            par.insert(idx, c)
            idx += 1
        par.remove(i)
    # paragraph marks deleted earlier
    for d in list(root.iter(W + 'del')):
        par = d.getparent()
        if par is not None and par.tag == W + 'rPr' and par.getparent().tag == W + 'pPr':
            p = par.getparent().getparent()
            nxt = p.getnext()
            par.remove(d)
            if nxt is not None and nxt.tag == W + 'p':
                pos = 1 if nxt.find(W + 'pPr') is not None else 0
                for c in [c for c in p if c.tag != W + 'pPr']:
                    nxt.insert(pos, c)
                    pos += 1
                p.getparent().remove(p)


def find_para(root, start):
    hits = [p for p in root.iter(W + 'p') if vis_text(p).startswith(start)]
    assert len(hits) == 1, (start, len(hits))
    return hits[0]


def base_rpr(p):
    for r in p.iter(W + 'r'):
        if r.find(W + 't') is not None or r.find(W + 'delText') is not None:
            rp = r.find(W + 'rPr')
            return copy.deepcopy(rp) if rp is not None else etree.Element(W + 'rPr')
    return etree.Element(W + 'rPr')


def make_run(rpr, text, bold=None):
    r = etree.Element(W + 'r')
    rp = copy.deepcopy(rpr)
    for x in rp.findall(W + 'noProof'):
        rp.remove(x)
    if bold is not None:
        for x in rp.findall(W + 'b') + rp.findall(W + 'bCs') + rp.findall(W + 'i') + rp.findall(W + 'iCs'):
            rp.remove(x)
        if bold:
            rp.insert(1 if rp.find(W + 'rFonts') is not None else 0, etree.Element(W + 'b'))
    r.append(rp)
    t = etree.SubElement(r, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    return r


def rewrite(ctx, p, text):
    rpr = base_rpr(p)
    runs = [r for r in p.iter(W + 'r')
            if r.find(W + 't') is not None and not any(a.tag == W + 'del' for a in r.iterancestors())]
    for r in runs:
        if ctx.tracked:
            par = r.getparent()
            idx = par.index(r)
            par.remove(r)
            d = ctx.mark('del')
            d.append(r)
            par.insert(idx, d)
            for t in r.findall(W + 't'):
                t.tag = W + 'delText'
        else:
            r.getparent().remove(r)
    new = make_run(rpr, text)
    if ctx.tracked:
        i = ctx.mark('ins')
        i.append(new)
        p.append(i)
    else:
        p.append(new)


def append_text(ctx, p, text):
    rpr = base_rpr(p)
    new = make_run(rpr, text)
    if ctx.tracked:
        i = ctx.mark('ins')
        i.append(new)
        p.append(i)
    else:
        p.append(new)


def mark_para_inserted(ctx, p):
    if not ctx.tracked:
        return
    ppr = p.find(W + 'pPr')
    if ppr is None:
        ppr = etree.Element(W + 'pPr')
        p.insert(0, ppr)
    rp = ppr.find(W + 'rPr')
    if rp is None:
        rp = etree.SubElement(ppr, W + 'rPr')
    for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
        rp.remove(x)
    rp.insert(0, ctx.mark('ins'))
    for r in [c for c in p if c.tag == W + 'r']:
        i = ctx.mark('ins')
        idx = p.index(r)
        p.remove(r)
        i.append(r)
        p.insert(idx, i)


def new_para_like(ctx, template, text_runs):
    """text_runs: list of (text, bold). Paragraph properties and run format copied from template."""
    p = etree.Element(W + 'p')
    ppr = template.find(W + 'pPr')
    if ppr is not None:
        ppr = copy.deepcopy(ppr)
        rp = ppr.find(W + 'rPr')
        if rp is not None:
            for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
                rp.remove(x)
        p.append(ppr)
    rpr = base_rpr(template)
    for text, bold in text_runs:
        p.append(make_run(rpr, text, bold))
    mark_para_inserted(ctx, p)
    return p


# ------------------------------------------------------------------ flowchart removal and renumbering
TOK = re.compile(r'(?:Figures? 2\.)(\d+)(?: to 2\.(\d+))?')
SPECIAL = {(18, 34): (21, 37)}     # stale UI-screen range in the paper; the screens are now 2.21 to 2.37


def newnum(n):
    return fig_new(n)


def del_wrap(ctx, r):
    """Mark one run as deleted (nested inside an insertion when it already sits in one)."""
    par = r.getparent()
    idx = par.index(r)
    par.remove(r)
    d = ctx.mark('del')
    d.append(r)
    par.insert(idx, d)
    for t in r.findall(W + 't'):
        t.tag = W + 'delText'


def live_runs(p):
    return [r for r in p.iter(W + 'r') if not any(a.tag == W + 'del' for a in r.iterancestors())
            and (r.find(W + 't') is not None or r.find(W + 'drawing') is not None)]


def delete_runs(ctx, p, only_drawings=False):
    for r in live_runs(p):
        if only_drawings and r.find(W + 'drawing') is None:
            continue
        if ctx.tracked:
            del_wrap(ctx, r)
        else:
            r.getparent().remove(r)


def delete_paragraph(ctx, p):
    if not ctx.tracked:
        p.getparent().remove(p)
        return
    delete_runs(ctx, p)
    ppr = p.find(W + 'pPr')
    if ppr is None:
        ppr = etree.Element(W + 'pPr')
        p.insert(0, ppr)
    rp = ppr.find(W + 'rPr')
    if rp is None:
        rp = etree.SubElement(ppr, W + 'rPr')
    for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
        rp.remove(x)
    rp.insert(0, ctx.mark('del'))


def remove_flowcharts(ctx, root):
    caps = [p for p in root.iter(W + 'p')
            if re.match(r'Figure 2\.[2-6] \| Proposed System Flowchart', vis_text(p))]
    assert len(caps) == 5, len(caps)
    removed = []
    for cap in caps:
        removed.append(vis_text(cap).strip())
        host = cap.getprevious()
        assert host.find('.//' + W + 'drawing') is not None, vis_text(cap)
        if vis_text(host).strip():
            delete_runs(ctx, host, only_drawings=True)       # picture sits inside a heading paragraph
        else:
            delete_paragraph(ctx, host)
        delete_paragraph(ctx, cap)
    return removed


def retoken_run(ctx, r):
    ts = r.findall(W + 't')
    if len(ts) != 1 or any(c.tag not in (W + 'rPr', W + 't') for c in r):
        return 0
    text = ts[0].text or ''
    pieces, pos, changed = [], 0, 0
    for m in TOK.finditer(text):
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else None
        na, nb = SPECIAL.get((a, b), (newnum(a), newnum(b) if b else None))
        for grp, new in ((1, na), (2, nb)):
            if m.group(grp) is None or str(new) == m.group(grp):
                continue
            pieces.append(('keep', text[pos:m.start(grp)]))
            pieces.append(('chg', m.group(grp), str(new)))
            pos = m.end(grp)
            changed += 1
    if not changed:
        return 0
    pieces.append(('keep', text[pos:]))
    rpr = r.find(W + 'rPr')
    if rpr is None:
        rpr = etree.Element(W + 'rPr')
    if not ctx.tracked:
        ts[0].text = ''.join(q[1] if q[0] == 'keep' else q[2] for q in pieces)
        return changed
    par = r.getparent()
    idx = par.index(r)
    par.remove(r)
    out = []
    for q in pieces:
        if q[0] == 'keep':
            if q[1]:
                out.append(make_run(rpr, q[1]))
        else:
            old = make_run(rpr, q[1])
            old.find(W + 't').tag = W + 'delText'
            d = ctx.mark('del')
            d.append(old)
            out.append(d)
            new = make_run(rpr, q[2])
            if par.tag == W + 'ins':
                out.append(new)
            else:
                i = ctx.mark('ins')
                i.append(new)
                out.append(i)
    for k, e in enumerate(out):
        par.insert(idx + k, e)
    return changed


def renumber_figures(ctx, root):
    n = 0
    for p in list(root.iter(W + 'p')):
        ppr = p.find(W + 'pPr')
        if ppr is not None and ppr.find(W + 'rPr') is not None and ppr.find(W + 'rPr').find(W + 'del') is not None:
            continue            # paragraph being deleted
        for r in [r for r in p.iter(W + 'r') if not any(a.tag == W + 'del' for a in r.iterancestors())]:
            n += retoken_run(ctx, r)
    return n



# ------------------------------------------------------------------ ERD section
sys.path.insert(0, os.path.join(HERE, '..', 'erd_system'))
import erd_text as ET   # noqa: E402

ERD_DIR = os.path.join(HERE, '..', 'erd_system', 'out')


def erd_prepare(ctx, root):
    start = [q for q in root.iter(W + 'p') if vis_text(q).strip() == 'Database Design'][-1]
    end = [q for q in root.iter(W + 'p') if vis_text(q).strip() == 'User Interface Design'][-1]
    intro = start.getnext()
    assert vis_text(intro).startswith("ASPIRE's database schema is organized")
    old = []
    q = intro.getnext()
    while q is not None and q is not end:
        old.append(q)
        q = q.getnext()
    heading_t = next(x for x in old if x.find('.//' + W + 'pStyle') is not None and
                     x.find('.//' + W + 'pStyle').get(W + 'val') == 'Heading3')
    image_t = next(x for x in old if x.find('.//' + W + 'drawing') is not None)
    caption_t = next(x for x in old if vis_text(x).startswith('Figure 2.') and ' | ' in vis_text(x))
    body_t = next(x for x in old if len(vis_text(x)) > 200 and x.find('.//' + W + 'drawing') is None)
    tmpl = dict(heading=copy.deepcopy(heading_t), image=copy.deepcopy(image_t),
                caption=copy.deepcopy(caption_t), body=copy.deepcopy(body_t))
    removed_titles = [vis_text(x).strip()[:60] for x in old if vis_text(x).strip()]
    for x in old:
        if x.find('.//' + W + 'sectPr') is not None:
            continue                               # never delete a section break
        delete_paragraph(ctx, x)
    rewrite(ctx, intro, ET.intro())
    anchor = [x for x in old if x.getparent() is not None][-1] if ctx.tracked else intro
    return dict(tmpl=tmpl, anchor=anchor, removed=removed_titles)


def erd_insert(ctx, root, erd, files, new_rels, docpr, next_rid):
    T = erd['tmpl']
    anchor = erd['anchor']
    last_cat = None
    for m in ET.META:
        new_ps = []
        if m['cat_no'] != last_cat:
            last_cat = m['cat_no']
            new_ps.append(new_para_like(ctx, T['heading'], [(m['category'], None)]))
        path = os.path.join(ERD_DIR, m['png'])
        name = 'erd_' + m['slug'].lower().replace('-', '_') + '.png'
        files['word/media/' + name] = open(path, 'rb').read()
        nid = 'rId%d' % next_rid
        next_rid += 1
        new_rels.append('<Relationship Id="%s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/%s"/>' % (nid, name))
        ip = copy.deepcopy(T['image'])
        for x in list(ip.iter(W + 'ins')) + list(ip.iter(W + 'del')):
            par = x.getparent()
            if par.tag == W + 'rPr':
                par.remove(x)
                continue
            idx = par.index(x)
            if x.tag == W + 'ins':
                for c in list(x):
                    par.insert(idx, c)
                    idx += 1
            par.remove(x)
        for b in ip.iter('{%s}blip' % NS['a']):
            b.set(R + 'embed', nid)
        docpr += 1
        for e in ip.iter('{%s}docPr' % NS['wp']):
            e.set('id', str(docpr))
            e.set('name', name[:-4])
        for e in ip.iter('{%s}inline' % NS['wp']):
            for a in list(e.attrib):
                if a.startswith('{http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing}'):
                    del e.attrib[a]
        cx, cy = fit(*png_size(path))
        for e in ip.iter('{%s}extent' % NS['wp']):
            e.set('cx', str(cx))
            e.set('cy', str(cy))
        for e in ip.iter('{%s}ext' % NS['a']):
            e.set('cx', str(cx))
            e.set('cy', str(cy))
        mark_para_inserted(ctx, ip)
        new_ps.append(ip)
        new_ps.append(new_para_like(ctx, T['caption'], [(m['caption'], None)]))
        new_ps.append(new_para_like(ctx, T['body'], [(ET.describe(m), None)]))
        for q in new_ps:
            anchor.addnext(q)
            anchor = q
    return docpr, next_rid

# ------------------------------------------------------------------ build
def build(tracked, out_path):
    zin = zipfile.ZipFile(SRC)
    files = {n: zin.read(n) for n in zin.namelist()}
    root = etree.fromstring(files['word/document.xml'])
    rels = files['word/_rels/document.xml.rels'].decode('utf-8')
    ctx = Ctx(root, tracked)
    if not tracked:
        accept_all(root)
    removed = remove_flowcharts(ctx, root)
    # restore the Student heading, which lost its last letters next to the flowchart picture
    sh = [q for q in root.iter(W + 'p') if vis_text(q).strip() == 'Proposed System for the Stude']
    assert len(sh) == 1
    append_text(ctx, sh[0], 'nt')
    rewrite(ctx, find_para(root, 'The following section presents the proposed ASPIRE system'), T_PROPOSED_INTRO)
    rewrite(ctx, find_para(root, 'Figure 2.5 presents the Registrar Portal'), T_REGISTRAR_PROSE)
    erd = erd_prepare(ctx, root)
    renumbered = renumber_figures(ctx, root)
    print('tracked' if tracked else 'clean', 'removed', len(removed), 'renumbered tokens', renumbered)

    rid_to_media = {}
    for m in re.finditer(r'<Relationship [^>]*>', rels):
        s = m.group(0)
        i = re.search(r'Id="([^"]+)"', s).group(1)
        t = re.search(r'Target="([^"]+)"', s).group(1)
        rid_to_media[i] = t
    media_to_rid = {v: k for k, v in rid_to_media.items()}
    new_rels = []
    docpr = max(int(x) for x in re.findall(r'<wp:docPr id="(\d+)"', files['word/document.xml'].decode('utf-8')))
    next_rid = max(int(k[3:]) for k in rid_to_media if k.startswith('rId')) + 1

    def set_extent(p, cx, cy):
        for e in p.iter('{%s}extent' % NS['wp']):
            e.set('cx', str(cx))
            e.set('cy', str(cy))
        for e in p.iter('{%s}ext' % NS['a']):
            e.set('cx', str(cx))
            e.set('cy', str(cy))

    swapped = []
    for media, parts in FIGURES.items():
        rid = media_to_rid['media/' + media]
        img_p = None
        for p in root.iter(W + 'p'):
            for b in p.iter('{%s}blip' % NS['a']):
                if b.get(R + 'embed') == rid:
                    img_p = p
        assert img_p is not None, media
        cap_p = img_p.getnext()
        assert vis_text(cap_p).startswith('Figure'), (media, vis_text(cap_p)[:40])
        n = len(parts)
        paths = [os.path.join(FIG, x) for x in parts]
        files['word/media/' + media] = open(paths[0], 'rb').read()
        cx, cy = fit(*png_size(paths[0]))
        set_extent(img_p, cx, cy)
        swapped.append((vis_text(cap_p).split('|')[0].strip(), parts))
        title = vis_text(cap_p)
        if n > 1:
            append_text(ctx, cap_p, ' (part 1 of %d)' % n)
        anchor = cap_p
        for k in range(1, n):
            newname = 'dfd_%s_%d.png' % (media[:-4], k + 1)
            files['word/media/' + newname] = open(paths[k], 'rb').read()
            nid = 'rId%d' % next_rid
            next_rid += 1
            new_rels.append('<Relationship Id="%s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/%s"/>' % (nid, newname))
            ip = copy.deepcopy(img_p)
            for b in ip.iter('{%s}blip' % NS['a']):
                b.set(R + 'embed', nid)
            docpr += 1
            for e in ip.iter('{%s}docPr' % NS['wp']):
                e.set('id', str(docpr))
                e.set('name', newname[:-4])
            for e in ip.iter('{%s}inline' % NS['wp']):
                for a in list(e.attrib):
                    if a.startswith('{http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing}'):
                        del e.attrib[a]
            cx, cy = fit(*png_size(paths[k]))
            set_extent(ip, cx, cy)
            # strip stale revision wrappers copied from the original, then mark as inserted
            for x in list(ip.iter(W + 'ins')) + list(ip.iter(W + 'del')):
                if x.getparent().tag != W + 'rPr':
                    par = x.getparent()
                    idx = par.index(x)
                    for c in list(x):
                        if x.tag == W + 'ins':
                            par.insert(idx, c)
                            idx += 1
                    par.remove(x)
            mark_para_inserted(ctx, ip)
            # caption: same format as the original caption, own text
            cp = new_para_like(ctx, cap_p, [(title + ' (part %d of %d)' % (k + 1, n), None)])
            anchor.addnext(ip)
            ip.addnext(cp)
            anchor = cp

    # ---- reverse-engineered ERD figures
    docpr, next_rid = erd_insert(ctx, root, erd, files, new_rels, docpr, next_rid)

    # ---- narrative paragraphs
    rewrite(ctx, find_para(root, 'The Data Flow Diagram (DFD) illustrates'), T_DFD_INTRO)
    rewrite(ctx, find_para(root, 'The Registrar is absent from Figure'), T_EXIST_REG)
    rewrite(ctx, find_para(root, renum_text('Figure 2.12 presents the main data flows')), T_L0)
    rewrite(ctx, find_para(root, renum_text('Figure 2.13 decomposes the Student Portal')), T_STUDENT)
    rewrite(ctx, find_para(root, renum_text('Figure 2.14 decomposes the Faculty Portal')), T_FACULTY)
    rewrite(ctx, find_para(root, renum_text('Figure 2.15 decomposes the Dean Portal')), T_DEAN)
    rewrite(ctx, find_para(root, "The Admin Portal's Level 1 DFD decomposes"), T_ADMIN)
    rewrite(ctx, find_para(root, renum_text("Figure 2.18 presents ASPIRE's role-based menu hierarchy")), T_VTOC)

    # ---- Definition of Terms: heading + intro + terms, placed before Research Methodology
    meth_h = [q for q in root.iter(W + 'p') if vis_text(q).strip() == 'Research Methodology'][-1]
    body_t = find_para(root, renum_text('Figure 2.7 shows DYCI'))
    h = new_para_like(ctx, meth_h, [('Definition of Terms', None)])
    paras = [h, new_para_like(ctx, body_t, [(T_DEF_INTRO, None)])]
    for term, d in TERMS:
        paras.append(new_para_like(ctx, body_t, [(term, True), (', ' + d, False)]))
    for p in paras:
        meth_h.addprevious(p)

    files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    files['word/_rels/document.xml.rels'] = rels.replace('</Relationships>', ''.join(new_rels) + '</Relationships>').encode('utf-8')
    st = files['word/settings.xml'].decode('utf-8')
    if 'w:updateFields' not in st:
        st = re.sub(r'(<w:settings[^>]*>)', r'\1<w:updateFields w:val="true"/>', st, count=1)
    files['word/settings.xml'] = st.encode('utf-8')
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
        for n, b in files.items():
            z.writestr(n, b)
    return swapped


if __name__ == '__main__':
    sw = build(True, os.path.join(OUTDIR, 'ASPIRE_Chapters_1-2_Master_TRACKED_2026-11-02.docx'))
    build(False, os.path.join(OUTDIR, 'ASPIRE_Chapters_1-2_Master_UPDATED_2026-11-02.docx'))
    for cap, parts in sw:
        print(cap, '->', ', '.join(parts))
