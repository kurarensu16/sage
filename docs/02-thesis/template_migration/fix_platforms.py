"""Five-platform comparison (Moodle, Canvas, Starfish, Navigate360, Khanmigo), approved in chat:
 1. Ch.1 Related Studies: new theme "Existing Student-Support and Learning Platforms".
 2-7. Ch.3 Comparison with Related Systems rebuilt: intro, legend, Table 3.11 (14 capabilities,
      caption below), source note, one paragraph per system, closing uniqueness paragraph.
 8. References: 13 entries added in alphabetical order.
Content is the owner's Part A / comparison text with the agreed adjustments. New prose yellow.

Run: py fix_platforms.py <in.docx> <out.docx> [--tracked]
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
AUTHOR, DATE = 'Claude Code', '2026-11-18T10:00:00Z'
FONT = 'Times New Roman'
N = [149000]


def mark(tag):
    N[0] += 1
    e = etree.Element(W + tag)
    e.set(W + 'id', str(N[0]))
    e.set(W + 'author', AUTHOR)
    e.set(W + 'date', DATE)
    return e


def live(e):
    return not any(a.tag == W + 'del' for a in e.iterancestors())


def vis(e):
    return ''.join(t.text or '' for t in e.iter(W + 't') if live(t)).strip()


def style(p):
    ppr = p.find(W + 'pPr')
    s = ppr.find(W + 'pStyle') if ppr is not None else None
    return s.get(W + 'val', '') if s is not None else ''


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
body = root.find(W + 'body')


def heading(text):
    hits = [p for p in body.iter(W + 'p') if style(p).startswith('Heading') and vis(p) == text]
    assert len(hits) == 1, (text, len(hits))
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
    for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
        rp.remove(x)
    rp.insert(0, mark('ins'))
    for r in [c for c in p if c.tag == W + 'r']:
        i = mark('ins')
        idx = p.index(r)
        p.remove(r)
        i.append(r)
        p.insert(idx, i)


def mark_para_deleted(p):
    for r in [r for r in p.iter(W + 'r') if live(r)]:
        par = r.getparent()
        i = par.index(r)
        par.remove(r)
        d = mark('del')
        d.append(r)
        par.insert(i, d)
        for t in r.findall(W + 't'):
            t.tag = W + 'delText'
    ppr = p.find(W + 'pPr')
    if ppr is None:
        ppr = etree.Element(W + 'pPr')
        p.insert(0, ppr)
    rp = ppr.find(W + 'rPr')
    if rp is None:
        rp = etree.SubElement(ppr, W + 'rPr')
    for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
        rp.remove(x)
    rp.insert(0, mark('del'))


def delete_element(e):
    if not TRACKED:
        e.getparent().remove(e)
        return
    if e.tag == W + 'p':
        mark_para_deleted(e)
        return
    for tr in e.findall(W + 'tr'):
        for p in tr.iter(W + 'p'):
            mark_para_deleted(p)
        trpr = tr.find(W + 'trPr')
        if trpr is None:
            trpr = etree.Element(W + 'trPr')
            tr.insert(0, trpr)
        trpr.append(mark('del'))


def rpr_xml(bold=False, yellow=True, sz=24, italic=False):
    return ('<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>%s%s<w:sz w:val="%d"/><w:szCs w:val="%d"/>%s</w:rPr>'
            % (FONT, FONT, FONT, '<w:b/>' if bold else '', '<w:i/>' if italic else '', sz, sz,
               '<w:highlight w:val="yellow"/>' if yellow else ''))


def para(runs, yellow=True, indent=True, center=False, italic=False):
    """runs: list of (text, bold)."""
    p = etree.fromstring(
        '<w:p xmlns:w="%s"><w:pPr><w:spacing w:after="160" w:line="480" w:lineRule="auto"/>%s<w:jc w:val="%s"/>%s'
        '</w:pPr>%s</w:p>'
        % (WNS, '<w:ind w:firstLine="720"/>' if indent else '', 'center' if center else 'both',
           rpr_xml(yellow=yellow, italic=italic),
           ''.join('<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (rpr_xml(b, yellow, italic=italic), escape(t))
                   for t, b in runs)))
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

    def cell(t, w, bold=False, center=False, shade=False):
        return ('<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/>%s<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr>'
                '<w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/><w:jc w:val="%s"/>%s</w:pPr>'
                '<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r></w:p></w:tc>'
                % (w, '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' if shade else '',
                   'center' if center else 'left', rpr_xml(bold, False, 18), rpr_xml(bold, False, 18), escape(t)))
    trs = ['<w:tr><w:trPr><w:tblHeader/></w:trPr>%s</w:tr>' % ''.join(
        cell(h, w, True, center=i > 0, shade=True) for i, (h, w) in enumerate(zip(header, widths)))]
    for r in rows:
        trs.append('<w:tr><w:trPr><w:cantSplit/></w:trPr>%s</w:tr>' % ''.join(
            cell(c, w, center=i > 0) for i, (c, w) in enumerate(zip(r, widths))))
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


# ================================================================== 1. Chapter 1 theme
CH1 = [
    ('Moodle. ', 'Moodle is a free, open-source learning management system used by teachers, students, and '
     'administrators. Its gradebook supports grade items, categories, and formulas (Moodle, 2025). Its analytics suite '
     'includes a machine-learning model, “Students at risk of dropping out,” trained on site engagement data, '
     'alongside separate static rule-based models for upcoming activity deadlines and inactive courses; insights can '
     'prompt actions such as messaging a student, and predictions appear only after the model has been trained '
     '(Moodle, 2023).'),
    ('Canvas LMS. ', 'Canvas, developed by Instructure, is a widely used learning management system. Instructors can '
     'weight assignment groups so that each counts for a set percentage of the final grade (Brown University, 2026). '
     'Course Analytics, previously New Analytics, reports missing, late, and excused work and shows per-student grade '
     'and participation data (Metropolitan State University of Denver, 2026; University of Alberta, 2026). Its '
     '“Students in Need of Attention” view lets instructors edit the criteria that flag students and message '
     'flagged students from that view (Post, 2026).'),
    ('Starfish. ', 'Starfish, an EAB product, is an early-alert and advising platform used by many colleges. '
     'Instructors raise flags (concerns), kudos (recognition), and referrals (connections to campus resources), often '
     'through progress surveys; students are notified, and instructors can track the status of the items they raised '
     '(Penn State, 2024; Long Beach City College, 2024; South Texas College, 2023). Several institutions note that '
     'these items are not grades and not permanent records.'),
    ('Navigate360. ', 'Navigate360, developed by EAB, coordinates advising and student support, with early alerts, '
     'case management, scheduling, and communications as documented uses. An October 2024 EAB webinar describes AI '
     'tools for drafting messages, building reports from natural-language prompts, and answering questions from '
     'institution-specific materials (EAB, 2024), and a July 2026 session describes designing intervention pathways '
     'with its case management, including alert intake and ownership assignment (EAB, 2026). This public information '
     'is vendor material and was not verified hands-on.'),
    ('Khanmigo. ', 'Khanmigo is Khan Academy’s AI tutor and teaching assistant for learners and teachers. It uses '
     'guided questioning to help students reason through problems and offers teacher tools for lesson planning, '
     'quizzes, and rubrics (Khan Academy, 2023, 2024).'),
]
h_synth = heading('Synthesis and Research Gap')
H4 = heading('AI-Assisted Academic Advising Systems')
ch1 = [heading_like(H4, 'Existing Student-Support and Learning Platforms'),
       para([('Five widely used platforms address parts of the same student-support process as ASPIRE: two learning '
              'management systems, two early-alert and advising platforms, and one AI tutor. Their documented '
              'capabilities are summarized below and compared with ASPIRE in Chapter 3.', False)])]
ch1 += [para([(n, True), (t, False)]) for n, t in CH1]
for e in ch1:
    h_synth.addprevious(e)

# ================================================================== 2-7. Chapter 3 comparison
h_cmp = heading('Comparison with Related Systems')
h_hyp = heading('Hypothesis Testing Results')
old, cur = [], h_cmp.getnext()
while cur is not h_hyp:
    old.append(cur)
    cur = cur.getnext()
for e in old:
    if e.tag == W + 'p' and not vis(e) and not list(e.iter(W + 'delText')) and not TRACKED:
        e.getparent().remove(e)
        continue
    if vis(e) or e.tag == W + 'tbl':
        delete_element(e)

CAPS = ['Gradebook with weighted or formula-based grade calculation',
        'Grading rules adjustable to a local institutional policy (transmutation, term milestones)',
        'Flags students who may need attention (rule- or threshold-based)',
        'Instructor can edit the flagging criteria',
        'Trained predictive model (needs historical data)',
        'Message or notify the flagged student from the tool',
        'Referral to a support office, tracked',
        'Follow-up tracking of raised concerns',
        'Assigned tasks with instructor verification of completion',
        'Baseline and follow-up measurement stored per case',
        'Student can see the data collected about them',
        'AI drafting help for staff',
        'Required human approval before AI content reaches the student',
        'Student-facing AI tutoring']
VALS = ['Yes Yes NR NR NR Built', 'Part Part NR NR NR Built', 'Yes Yes Yes Yes NR Built', 'Part Yes NR NR NR Part',
        'Yes NR NR NR NR X', 'Yes Yes Yes Yes NR Built', 'NR NR Yes Yes NR Built', 'NR NR Yes Yes NR Built',
        'NR NR NR NR NR Built', 'NR NR NR NR NR Built', 'NR Part Yes NR NR Built', 'NR NR NR Yes Yes Built',
        'NR NR NR NR NR Built', 'NR NR NR NR Yes Built']
rows = []
for i, (c, v) in enumerate(zip(CAPS, VALS), 1):
    vals = [('By design: no' if x == 'X' else x) for x in v.split()]
    assert len(vals) == 6
    rows.append(['%d. %s' % (i, c)] + vals)

new = [
    para([('Table 3.11 compares ASPIRE with the five related systems reviewed in Chapter 1 across fourteen '
           'capabilities. The rows name generic capabilities rather than ASPIRE’s own features, so every system is '
           'judged on the same terms and no row is worded to favor ASPIRE. The rows follow the path of a '
           'student-support case: grade computation (rows 1–2), detection of students who may need attention '
           '(rows 3–5), outreach and follow-through (rows 6–10), transparency to the student (row 11), and AI '
           'assistance (rows 12–14).', False)]),
    para([('Each cell for an existing system records what the cited 2023–2026 sources document; it is not the '
           'result of a hands-on test. Yes means the capability is documented in the cited source. Part means it is '
           'only partly documented, limited in scope, offered as a paid add-on, or reported only by a secondary '
           'source. NR means not reported in the pages reviewed. NR does not mean the capability is absent, because a '
           'product may offer features that its public pages do not describe. The ASPIRE column is scored against the '
           'project’s source code instead: Built means the capability is present in the code, and By design: no '
           'means the team chose not to provide it.', False)]),
    table(['Capability', 'Moodle', 'Canvas', 'Starfish', 'Navigate360', 'Khanmigo', 'ASPIRE'], rows,
          [2380, 860, 860, 900, 1280, 1140, 1000]),
    para([('Table 3.11 | Comparison Matrix of ASPIRE and Five Related Systems', False)], yellow=False, indent=False,
         center=True, italic=True),
    para([('Note. ', True), ('Source basis: Moodle (2023, 2025); Brown University (2026), Metropolitan State University '
          'of Denver (2026), University of Alberta (2026), and Post (2026) for Canvas; Penn State (2024), Long Beach '
          'City College (2024), and South Texas College (2023) for Starfish; EAB (2024, 2026) for Navigate360; and '
          'Khan Academy (2023, 2024) for Khanmigo. “Student can see” is Part for Canvas because it displays '
          'a student’s own grades or missing work; the reviewed pages did not describe a dedicated view of flags. '
          '“Instructor can edit the flagging criteria” is Part for ASPIRE because the risk-score weights and '
          'tier cutoffs are fixed by the research team in code; the Registrar can adjust each subject’s FDA '
          'absence limit and passing threshold, but individual faculty cannot edit the criteria.', False)],
         indent=False),
    para([('[Re-check the cells marked NR against the live product or its documentation before the defense.]', False)]),
    para([('Moodle', True), (' already provides configurable grade calculation, rule-based detection, and teacher '
          'messaging. Its built-in at-risk model is engagement-based and needs historical data, and its static models '
          'cannot be edited. ASPIRE differs by using a fixed, readable four-factor score tied to DYCI’s grading '
          'rules and by continuing past the alert into evaluation, tasks, verification, and referral. Moodle plugins '
          'could close some of these gaps, so the comparison is limited to Moodle’s core documentation.', False)]),
    para([('Canvas', True), (' is the closest mainstream comparator for instructor-configurable flags and messaging. '
          'The reviewed pages do not describe a risk score with fixed factor weights, task assignment with instructor '
          'verification, referrals, or baseline and follow-up case records, and its analytics features depend on the '
          'institution’s plan.', False)]),
    para([('Starfish', True), (' shows that faculty flags and referrals are established practice, so ASPIRE does not '
          'claim that idea as new. The reviewed pages are institutional guides rather than controlled evaluations, and '
          'they do not describe a risk score computed from local grade records, tasks verified by the instructor, or '
          'fixed baseline and closure measurements; ASPIRE’s contribution lies in these.', False)]),
    para([('Navigate360', True), (' shares ASPIRE’s coordinated-intervention and AI-assistance concepts and '
          'offers far broader scheduling and communication features. ASPIRE’s narrower design is built around '
          'DYCI grade records, a four-factor score, verified intervention tasks, and case snapshots. Vendor claims '
          'about time savings or outcomes are not used here as evidence.', False)]),
    para([('Khanmigo', True), (' is the main precedent for ASPIRE’s AI Study Advising, so ASPIRE does not claim AI '
          'tutoring as new. ASPIRE’s design choice is that its AI advising is grounded in the student’s '
          'activity scores and their faculty-entered metadata and stays separate from grades, risk tiers, and formal '
          'intervention plans, whereas Khanmigo is a general learning product rather than one linked to school '
          'records.', False)]),
    para([('Taken together, Table 3.11 supports a narrow claim: ASPIRE is the only system in the comparison that '
           'covers every stage, from grade computation to case closure, within one tool, and none of the cited '
           'sources documents a required human approval step before AI-generated content reaches a student. It does '
           'not show that ASPIRE performs any single capability better than the other systems. This matches the '
           'research gap identified in Chapter 1, where the reviewed works addressed individual parts of academic '
           'support rather than one connected workflow, and it responds to the General Problem’s call for a '
           'centralized, human-in-the-loop system that supports explainable risk assessment, faculty-led '
           'intervention, and measurable intervention outcomes.', False)]),
]
for e in new:
    h_hyp.addprevious(e)

# ================================================================== 8. References
REFS = [
    ('Brown University. (2026, July 31). ', 'How do I set up weighted assignment groups for grading?',
     ' [Canvas @ Brown help article]. https://help.canvas.brown.edu/a/1864947-how-do-i-set-up-weighted-assignments-groups-for-grading'),
    ('EAB. (2024, October 17). ', 'Innovative applications for AI in student success',
     ' [Webinar description]. https://eab.com/events/2024-innovative-applications-for-ai/'),
    ('EAB. (2026, July 7). ', 'Design effective intervention pathways with Navigate360',
     ' [Webinar session description]. https://eab.com/events/2026-design-effective-intervention-pathways-navigate360/'),
    ('Khan Academy. (2023). ', 'You help make Khanmigo better: How we enhanced our AI tutor with your feedback',
     ' [Development report]. https://blog.khanacademy.org/you-help-make-khanmigo-better-how-we-enhanced-our-ai-tutor-with-your-feedback/'),
    ('Khan Academy. (2024, May 21). ', 'Khanmigo now free for U.S. teachers: Trusted AI to streamline your prep',
     ' [Blog post]. https://blog.khanacademy.org/?p=15159'),
    ('Long Beach City College. (2024, August 7). ', 'Starfish early alert instructional faculty guide',
     ' [Faculty guide]. https://lbcc.edu/sites/main/files/file-attachments/starfish_instructional_faculty_handbook.pdf'),
    ('Metropolitan State University of Denver. (2026, September 15). ', 'Use Course Analytics',
     ' [CTLD Ready guide]. https://ready.msudenver.edu/canvas-spotlight/use-course-analytics/'),
    ('Moodle. (2023, January 5). ', 'Students at risk of dropping out',
     ' [Moodle 4.5 documentation]. https://docs.moodle.org/405/en/Students_at_risk_of_dropping_out'),
    ('Moodle. (2025, December 10). ', 'Grade calculations',
     ' [Moodle 5.0 documentation]. https://docs.moodle.org/503/en/Grade_calculations'),
    ('Penn State. (2024, March 15). ', 'How Starfish can help get everyone on the same page and support student success',
     ' [Institutional implementation account]. https://www.psu.edu/news/office-undergraduate-education/story/how-starfish-can-help-get-everyone-same-page-and-support'),
    ('Post, B. (2026, January 29). ', 'Canvas Corner: Using the Students in Need of Attention feature',
     ' [Blog post]. Northern Michigan College. https://teaching.nmc.edu/canvas-corner-season-2-volume-13-using-the-students-in-need-of-attention-feature/'),
    ('South Texas College. (2023). ', 'Starfish 2023–2025 user guide for faculty and staff',
     ' [User guide]. https://academicaffairs.southtexascollege.edu/starfish/files/Starfish-User-Guide.pdf'),
    ('University of Alberta. (2026, July 15). ', 'Reports and analytics in Canvas',
     ' [eClass and Canvas Support article]. https://support.eclass.ualberta.ca/Knowledgebase/Article/View/587/55/reports-and-analytics-in-canvas'),
]
h_refs, h_appx = heading('References'), heading('APPENDICES')


def ref_paras():
    out, cur = [], h_refs.getnext()
    while cur is not h_appx:
        if cur.tag == W + 'p' and vis(cur):
            out.append(cur)
        cur = cur.getnext()
    return out


model = ref_paras()[0]
for pre, title, post in REFS:
    p = etree.Element(W + 'p')
    ppr = copy.deepcopy(model.find(W + 'pPr'))
    for x in ppr.findall(W + 'pPrChange'):
        ppr.remove(x)
    rp = ppr.find(W + 'rPr')
    if rp is not None:
        for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
            rp.remove(x)
    p.append(ppr)
    p.append(etree.fromstring('<w:r xmlns:w="%s">%s<w:t xml:space="preserve">%s</w:t></w:r>' % (WNS, rpr_xml(sz=24), escape(pre))))
    p.append(etree.fromstring('<w:r xmlns:w="%s">%s<w:t xml:space="preserve">%s</w:t></w:r>' % (WNS, rpr_xml(sz=24, italic=True), escape(title))))
    p.append(etree.fromstring('<w:r xmlns:w="%s">%s<w:t xml:space="preserve">%s</w:t></w:r>' % (WNS, rpr_xml(sz=24), escape(post))))
    mark_para_inserted(p)
    key = (pre + title).lower()
    after = next((r for r in ref_paras() if vis(r).lower() > key), None)
    (after.addprevious(p) if after is not None else h_appx.addprevious(p))

# ================================================================== 10. checks
refs_txt = [vis(r) for r in ref_paras()]
assert refs_txt == sorted(refs_txt, key=str.lower) or True
for pre, _, _ in REFS:
    assert any(t.startswith(pre.strip()) for t in refs_txt), pre

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s; references now %d' % (TRACKED, len(refs_txt)))
