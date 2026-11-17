"""Logical Specifications aligned to the template ("system workflows, data flow, business rules,
input and output processes, database relationships, logical models"). Confirmed plan in chat.
New prose highlighted yellow.

 1. Logical Specifications intro lists its parts.
 2. "Proposed System" renamed "System Workflow": Existing System (manual, from the existing-system
    DFD descriptions) first, then Proposed System (the 15 module workflows, moved one level down).
 3. Data Flow: worded numbered sequence naming each step's input and output (no figures; the
    Conceptual Framework already carries the study-level IPO, so no separate I/O table).
 4. Business Rules: Table 2.14 gathering the rules stated across the paper, with sources.
 5. Database Relationships: worded, pointing to Database Design.
 6. VTOC description in plain language (no n.0/n.m/n.m.k codes).
 7. Conceptual Framework Output Phase gains the Registrar.

Run: py fix_logical_specs.py <in.docx> <out.docx> [--tracked]
"""
import copy
import sys
import zipfile
from xml.sax.saxutils import escape
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
TRACKED = '--tracked' in sys.argv[3:]
WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W = '{%s}' % WNS
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
AUTHOR, DATE = 'Claude Code', '2026-11-17T01:00:00Z'
FONT = 'Times New Roman'
N = [121000]


def mark(tag):
    N[0] += 1
    e = etree.Element(W + tag)
    e.set(W + 'id', str(N[0]))
    e.set(W + 'author', AUTHOR)
    e.set(W + 'date', DATE)
    return e


def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W + 't')
                    if not any(a.tag == W + 'del' for a in t.iterancestors()))


def style(p):
    ppr = p.find(W + 'pPr')
    s = ppr.find(W + 'pStyle') if ppr is not None else None
    return s.get(W + 'val', '') if s is not None else ''


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
body = root.find(W + 'body')


def heading(text):
    hits = [p for p in body.iter(W + 'p') if style(p).startswith('Heading') and vis_text(p).strip() == text]
    assert len(hits) == 1, (text, len(hits))
    return hits[0]


def find_unique(snippet):
    hits = [p for p in body.iter(W + 'p') if snippet in vis_text(p)]
    assert len(hits) == 1, (snippet[:70], len(hits))
    return hits[0]


def mark_para_inserted(p):
    if not TRACKED:
        return
    ppr = p.find(W + 'pPr')
    if ppr is None:
        ppr = etree.Element(W + 'pPr')
        p.insert(0, ppr)
    rp = ppr.find(W + 'rPr')
    if rp is None:
        rp = etree.SubElement(ppr, W + 'rPr')
    rp.insert(0, mark('ins'))
    for r in [c for c in p if c.tag == W + 'r']:
        i = mark('ins')
        idx = p.index(r)
        p.remove(r)
        i.append(r)
        p.insert(idx, i)


def retext(p, text, yellow=True, keep_bold=False):
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None
            and not any(a.tag == W + 'del' for a in r.iterancestors())]
    rpr = runs[0].find(W + 'rPr')
    rpr = copy.deepcopy(rpr) if rpr is not None else etree.Element(W + 'rPr')
    for x in (rpr.findall(W + 'highlight') + ([] if keep_bold else rpr.findall(W + 'b'))):
        rpr.remove(x)
    if yellow:
        hl = etree.Element(W + 'highlight')
        hl.set(W + 'val', 'yellow')
        anchor = rpr.find(W + 'szCs') if rpr.find(W + 'szCs') is not None else rpr.find(W + 'sz')
        (anchor.addnext(hl) if anchor is not None else rpr.append(hl))
    for r in runs:
        if TRACKED:
            par = r.getparent()
            i = par.index(r)
            par.remove(r)
            d = mark('del')
            d.append(r)
            par.insert(i, d)
            for t in r.findall(W + 't'):
                t.tag = W + 'delText'
        else:
            r.getparent().remove(r)
    nr = etree.Element(W + 'r')
    nr.append(rpr)
    t = etree.SubElement(nr, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    if TRACKED:
        ins = mark('ins')
        ins.append(nr)
        p.append(ins)
    else:
        p.append(nr)


def rpr_xml(bold=False, yellow=True, sz=24, italic=False):
    return ('<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>%s%s<w:sz w:val="%d"/><w:szCs w:val="%d"/>%s</w:rPr>'
            % (FONT, FONT, FONT, '<w:b/>' if bold else '', '<w:i/>' if italic else '', sz, sz,
               '<w:highlight w:val="yellow"/>' if yellow else ''))


def para(runs, yellow=True, indent=True):
    xml = ('<w:p xmlns:w="%s"><w:pPr><w:spacing w:after="160" w:line="480" w:lineRule="auto"/>%s'
           '<w:jc w:val="both"/>%s</w:pPr>%s</w:p>'
           % (WNS, '<w:ind w:firstLine="720"/>' if indent else '<w:ind w:left="720" w:hanging="360"/>',
              rpr_xml(yellow=yellow),
              ''.join('<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (rpr_xml(b, yellow), escape(t))
                      for t, b in runs)))
    p = etree.fromstring(xml)
    mark_para_inserted(p)
    return p


def caption(text):
    xml = ('<w:p xmlns:w="%s"><w:pPr><w:spacing w:after="160" w:line="480" w:lineRule="auto"/><w:jc w:val="center"/>'
           '%s</w:pPr><w:r>%s<w:t xml:space="preserve">%s</w:t></w:r></w:p>'
           % (WNS, rpr_xml(yellow=False, italic=True), rpr_xml(yellow=False, italic=True), escape(text)))
    p = etree.fromstring(xml)
    mark_para_inserted(p)
    return p


def heading_like(model, text):
    p = etree.Element(W + 'p')
    ppr = copy.deepcopy(model.find(W + 'pPr'))
    for x in ppr.findall(W + 'sectPr') + ppr.findall(W + 'pPrChange') + ppr.findall(W + 'numPr'):
        ppr.remove(x)
    rp = ppr.find(W + 'rPr')
    if rp is not None:
        for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
            rp.remove(x)
    p.append(ppr)
    r = etree.SubElement(p, W + 'r')
    for mr in model.iter(W + 'r'):
        if mr.find(W + 't') is not None and mr.find(W + 'rPr') is not None:
            m = copy.deepcopy(mr.find(W + 'rPr'))
            for x in m.findall(W + 'highlight'):
                m.remove(x)
            r.append(m)
            break
    t = etree.SubElement(r, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    mark_para_inserted(p)
    return p


def table(header, rows, widths):
    b = ''.join('<w:%s w:val="single" w:sz="4" w:space="0" w:color="auto"/>' % s
                for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))

    def cell(t, w, bold=False, yellow=True):
        return ('<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="20" '
                'w:after="20" w:line="240" w:lineRule="auto"/>%s</w:pPr><w:r>%s<w:t xml:space="preserve">%s</w:t>'
                '</w:r></w:p></w:tc>' % (w, rpr_xml(bold, yellow, 20), rpr_xml(bold, yellow, 20), escape(t)))
    trs = ['<w:tr><w:trPr><w:tblHeader/></w:trPr>%s</w:tr>' % ''.join(cell(h, w, True, False) for h, w in zip(header, widths))]
    trs += ['<w:tr><w:trPr><w:cantSplit/></w:trPr>%s</w:tr>' % ''.join(cell(c, w) for c, w in zip(r, widths)) for r in rows]
    tbl = etree.fromstring('<w:tbl xmlns:w="%s"><w:tblPr><w:tblW w:w="%d" w:type="dxa"/><w:jc w:val="center"/>'
                           '<w:tblBorders>%s</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>%s'
                           '</w:tblGrid>%s</w:tbl>' % (WNS, sum(widths), b,
                                                        ''.join('<w:gridCol w:w="%d"/>' % w for w in widths), ''.join(trs)))
    if TRACKED:
        for tr in tbl.findall(W + 'tr'):
            for p in tr.iter(W + 'p'):
                mark_para_inserted(p)
            tr.find(W + 'trPr').append(mark('ins'))
    return tbl


# ================================================================== anchors
h_prop = heading('Proposed System')
h_grading = heading('Grading Engine Specification')
h_physical = heading('Physical Specifications')
prop_intro = find_unique('presents the proposed ASPIRE system module by module')
module_heads = []
cur = prop_intro.getnext()
while cur is not h_grading:
    if cur.tag == W + 'p' and style(cur) == 'Heading4' and vis_text(cur).strip().endswith(' Module'):
        module_heads.append(cur)
    cur = cur.getnext()
assert len(module_heads) == 15, len(module_heads)
H4_MODEL = copy.deepcopy(module_heads[0])

# ================================================================== 1. Logical Specifications intro
retext(find_unique("This section describes ASPIRE's logical structure and processes, independent of their physical"),
       "This section describes ASPIRE's logical structure and processes, independent of their physical "
       "implementation. It presents the system workflow, first of DYCI's existing manual process and then of the "
       "proposed system; the flow of data through the system; the business rules the system enforces; the two "
       "deterministic specifications that compute grades and the Academic Risk Score; and the relationships among "
       "the records the system keeps.")

# ================================================================== 2. System Workflow
retext(h_prop, 'System Workflow', yellow=False, keep_bold=True)
retext(prop_intro, "The system workflow is presented in two parts: the existing system, DYCI's current manual "
                   "process, followed by the proposed system, ASPIRE's workflow module by module.")

EXISTING = [
    "DYCI's current academic grading and monitoring process is manual and involves four participants: the "
    "student, the faculty member, the College Dean, and the Registrar. There is no administrator, because "
    "account provisioning, academic setup, and system configuration do not exist as functions in a manual process.",
    "Faculty enter raw scores into the school-provided Excel COG template, keep the class record and paper "
    "attendance, and compute grades once at the end of each grading period. The template is a spreadsheet held on "
    "the instructor's machine, so its weights can be altered by whoever holds it, and the computation has no "
    "preview or independent check. At-risk students are identified through informal observation, printed grade "
    "sheets are submitted to the Dean, and a correction is requested on a paper form.",
    "Students receive returned papers and keep whatever record of them they choose, ask instructors about grades "
    "in person, seek advice in conversation, and wait for the grade report released at the end of the term. A "
    "grade that looks wrong is raised verbally or on a paper form that the instructor recomputes by hand. There is "
    "no running or tentative grade and no risk indicator, and no request leaves a written trace.",
    "The Dean receives and checks submitted grade sheets, approves corrections on paper, tallies grade "
    "distribution by hand, hears at-risk reports informally, assigns teaching loads on a printed matrix, and "
    "compiles college reports by re-reading the sheets. Submission compliance is known only by noticing which "
    "sheets have arrived, and a faculty member booked into two classes at the same hour is caught only if someone "
    "notices.",
    "The Registrar enrolls students and builds sections, maintains the subject catalogue, opens and closes academic "
    "terms, files the grade sheets forwarded by the Dean, approves late grade changes, and issues records on "
    "request. The catalogue, section lists, and term calendar are kept in separate files that are re-typed wherever "
    "they are needed, and a late grade change carries a signature but no recorded window or authority.",
    "These gaps, namely late visibility of grades, unrecorded risk and requests, manual computation, and "
    "disconnected records, are what the proposed system addresses.",
]
new = [heading_like(H4_MODEL, 'Existing System')] + [para([(t, False)]) for t in EXISTING]
new += [heading_like(H4_MODEL, 'Proposed System'),
        para([("ASPIRE replaces this manual process with fifteen modules. The workflow of each module, across the "
               "user roles that take part in it, is described below.", False)])]
for e in new:
    module_heads[0].addprevious(e)
for h in module_heads:
    h.find(W + 'pPr').find(W + 'pStyle').set(W + 'val', 'Heading5')

# ================================================================== 3. Data Flow
H3_MODEL = h_grading
FLOW = [
    ('Account and term setup. ', "The Administrator creates user accounts, including those for new students whose "
     "records the Registrar submits. The Registrar enters the colleges, programs, subjects, COG templates, sections, "
     "and academic term, which become the catalog every later step reads."),
    ('Faculty loading and enrollment. ', "The Registrar or the Dean assigns faculty, schedules, and rooms to "
     "subject-section classes, and the Registrar enrolls students. The result is the set of live class records and "
     "rosters, each class carrying a frozen copy of its COG template."),
    ('Score and attendance recording. ', "Faculty enter activity scores with their required metadata and record "
     "attendance per class. These records are the input to grade computation, to the student's view of their "
     "scores, and to the risk score."),
    ('Grade computation and posting. ', "ASPIRE computes tentative grades from the recorded scores and the class's "
     "COG, and faculty post the Midterm Rating, Tentative Final Rating, and Semestral Grade in that order. Posted "
     "grades update the student's Grade Report and GWA."),
    ('Risk assessment. ', "Grades, attendance, recorded zero scores, and the Prelim-to-Midterm trajectory produce "
     "each student's Academic Risk Score, which orders the faculty member's evaluation roster and feeds the Dean's "
     "risk and honors views."),
    ('AI study support. ', "The student's scores, activity metadata, and faculty-supplied learning resources are "
     "sent to the AI Study Advising, which returns non-binding diagnostics, study plans, and practice sets. Nothing "
     "it returns is written to grades, risk classifications, or intervention plans."),
    ('Intervention. ', "Faculty evaluate a student and publish an intervention plan with a frozen baseline. The "
     "student acknowledges it and reports task progress with evidence, faculty verify each task, and the next "
     "posted result is recorded as the follow-up."),
    ('Escalation and outcomes. ', "Cases referred by faculty reach the Dean, together with the "
     "baseline-to-follow-up comparison of GWA, risk level, and task completion."),
    ('Grade changes. ', "A disputed or corrected grade passes from the student or faculty member to the Dean, and to "
     "the Registrar after the dispute window. An authorized correction recalculates the posted results and the GWA, "
     "and every step is kept in the audit log."),
    ('Notifications and reports. ', "Postings, published plans, enrollment changes, and grade-change steps raise "
     "notifications to the roles involved, and faculty, Deans, and the Registrar draw printable and exportable "
     "reports from the stored records."),
]
dflow = [heading_like(H3_MODEL, 'Data Flow'),
         para([("Data moves through ASPIRE in the following sequence. Each step names the data that enters it and "
                "the result it passes on to the next.", False)])]
for i, (title, text) in enumerate(FLOW, 1):
    dflow.append(para([('%d. %s' % (i, title), True), (text, False)], indent=False))

# ================================================================== 4. Business Rules
H = 'DYCI Student Handbook (2025-2026)'
S = 'ASPIRE system rule'
RULES = [
    ('Grades are computed only from the subject\'s assigned COG template; each class keeps a frozen copy taken when it is created.', 'Classes and Grading', 'DYCI COG templates; ' + S),
    ('Grading periods post in order: the TFR requires the MR, and the SG requires both, for the complete roster.', 'Classes and Grading', S),
    ('A blank score is pending; an entered zero is a recorded score; unresolved required entries confirmed at posting become zeros.', 'Classes and Grading', S),
    ('Rounding, transmutation, and President\'s List eligibility follow the institutional rules.', 'Classes and Grading; Risk and Honors', H),
    ('An FDA recommendation appears at four or more absences; the final decision remains with the instructor.', 'Attendance', H + '; ' + S),
    ('Risk tiers are Low (0-24), Moderate (25-49), High (50-74), and Critical (75-100); faculty may evaluate any student regardless of tier.', 'Academic Risk and Intervention', 'Researcher-defined'),
    ('An intervention plan is visible to the student only after faculty publish it, must be acknowledged before progress is reported, and keeps a frozen baseline with one follow-up.', 'Academic Risk and Intervention', S),
    ('AI output is advisory and cannot change grades, risk classifications, or intervention plans; AI-drafted plan content needs faculty approval.', 'AI Study Advising', S),
    ('At most one active AI study plan per subject per term, within a per-student daily limit and an institution-wide budget.', 'AI Study Advising', S),
    ('A grade dispute is filed within thirty school days after the term ends, with one to three evidence files; after that window only the Registrar may authorize a change.', 'Grade Change Requests and Overrides', S),
    ('Dean approval of a correction authorizes one use of the full-row editor; it does not change the grade or unlock the gradebook.', 'Grade Change Requests and Overrides', S),
    ('A Registrar override is reasoned and audited, and the Dean of the student\'s college must acknowledge or query it.', 'Grade Change Requests and Overrides', S),
    ('One office edits a college\'s faculty loading at a time; every assignment needs a complete schedule and a room; faculty, section, and room conflicts are refused across all colleges.', 'Enrollment and Faculty Loading', S),
    ('Previous terms load only on request and are read-only.', 'Academic Period and Archive Access', S),
    ('Passwords have at least eight characters with uppercase and lowercase letters, a number, and a symbol.', 'Authentication and Account', S),
    ('Users may change only their photo, contact number, and password; identity details are maintained by the Administrator.', 'Authentication and Account', S),
]
brules = [heading_like(H3_MODEL, 'Business Rules'),
          para([("Table 2.14 lists the business rules ASPIRE enforces, with the module each rule governs and its "
                 "source. The grading and risk computations themselves are specified in detail in the two sections "
                 "that follow.", False)]),
          caption('Table 2.14 | Business Rules'),
          table(['Rule', 'Module', 'Source'], RULES, [4900, 1900, 1600])]
for e in dflow + brules:
    h_grading.addprevious(e)

# ================================================================== 5. Database Relationships
DBREL = (
    "ASPIRE's records are related in seven groups, each drawn as an Entity Relationship Diagram under Database "
    "Design. The academic structure (colleges, departments, programs, subjects, sections, and academic terms) "
    "defines where every class belongs. Accounts link each user to one role and, for students, to a program and "
    "section. A class joins a subject, a section, a term, and an assigned faculty member, carries its frozen COG "
    "snapshot, and is linked to its enrolled students. Grading inputs (activities with their metadata, scores, and "
    "attendance) belong to a class and a student, and grading outcomes (the posted MR, TFR, and SG) are derived from "
    "them. Evaluation and intervention records belong to a student in a class and hold the baseline and follow-up "
    "snapshots, tasks, and referrals. AI study advising records belong to a student and subject in the current term, "
    "and notifications and the audit log refer to the users and records they concern.")
for e in [heading_like(H3_MODEL, 'Database Relationships'), para([(DBREL, False)])]:
    h_physical.addprevious(e)

# ================================================================== 6. VTOC description, plain language
retext(find_unique("Figure 2.13 presents ASPIRE's Visual Table of Contents organized by module"),
       "Figure 2.13 presents ASPIRE's Visual Table of Contents, organized by module and printed in two parts. Each "
       "box carries a number and a name. ASPIRE itself is at the top; below it are the fifteen modules, numbered 1.0 "
       "to 15.0; below each module are the users who work in it; and below each user are the functions that user "
       "performs there. For example, under 6.0 Classes and Grading, the box 6.1 Faculty lists 6.1.1 My Classes "
       "through 6.1.5 Posted Grades and Corrections. Part 1 covers the modules that set up and run each term: "
       "Authentication and Account, Dashboard, User Accounts, Academic Setup, Enrollment and Faculty Loading, "
       "Classes and Grading, Attendance, Academic Risk and Intervention, and AI Study Advising.")

# ================================================================== 7. Conceptual Framework: Registrar output
out_p = find_unique('The Output Phase provides students with timely tentative performance')
old = vis_text(out_p)
new_t = old.replace('; and administrators with configuration',
                    '; the Registrar with the academic catalog, term calendar, enrollment, faculty loading, and '
                    'official grade records; and administrators with configuration')
assert new_t != old
retext(out_p, new_t)

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s' % TRACKED)
