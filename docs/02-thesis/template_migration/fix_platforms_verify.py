"""Corrections from the web verification of the five-platform comparison (2026-11-18), approved
in chat: 6 Table 3.11 cells, the Ch.1 platform descriptions, the Ch.3 legend/note/per-system and
closing paragraphs (the 'no human approval anywhere' claim no longer holds for Canvas), 5 new
references, and the Moodle 5.3 label. All edited text was inserted earlier in this session, so it
is replaced in place (in the tracked file it stays part of the same pending insertion).

Run: py fix_platforms_verify.py <in.docx> <out.docx> [--tracked]
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
AUTHOR, DATE = 'Claude Code', '2026-11-18T14:00:00Z'
FONT = 'Times New Roman'
N = [153000]
LOG = []


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


def find(start):
    hits = [p for p in body.iter(W + 'p') if vis(p).startswith(start)]
    assert len(hits) == 1, (start[:50], len(hits))
    return hits[0]


def heading(text):
    hits = [p for p in body.iter(W + 'p') if style(p).startswith('Heading') and vis(p) == text]
    assert len(hits) == 1, (text, len(hits))
    return hits[0]


def t_runs(p):
    return [t for t in p.iter(W + 't') if live(t)]


def set_body(p, text, label):
    """Paragraph = optional bold label run + body run: replace the body run's text."""
    ts = t_runs(p)
    assert len(ts) in (1, 2), (label, len(ts))
    ts[-1].text = text
    LOG.append(label)


def replace_in(p, old, new, label):
    ts = [t for t in t_runs(p) if old in (t.text or '')]
    assert len(ts) == 1, (label, old[:40], len(ts))
    ts[0].text = ts[0].text.replace(old, new, 1)
    LOG.append(label)


# ------------------------------------------------------------------ Chapter 1 descriptions
set_body(find('Moodle. Moodle is a free, open-source'),
         'Moodle is a free, open-source learning management system used by teachers, students, and administrators. '
         'Its gradebook supports grade items, categories, and formulas (Moodle, 2025). Its analytics suite includes a '
         'machine-learning model, “Students at risk of dropping out,” trained on engagement data from '
         'completed courses, alongside static rule-based models for upcoming activity deadlines and for courses '
         'without teaching activity, which cannot be edited (Moodle, 2021, 2023); insights can prompt actions such as '
         'messaging a student. Since version 4.5, its AI subsystem lets teachers generate text and images in the editor '
         'and lets users, including students, summarize course pages (Moodle, 2024).', 'Ch1 Moodle')
p = find('Canvas LMS. Canvas, developed by Instructure')
set_body(p, vis(p).split('. ', 1)[1] + ' Its IgniteAI features include a rubric generator and drafted grading '
         'feedback that instructors review before releasing them to students (Chrisos, 2026).', 'Ch1 Canvas')
p = find('Starfish. Starfish, an EAB product')
replace_in(p, ' Several institutions note that these items are not grades and not permanent records.',
           ' Advisors can also assign To-Dos and combine them with referrals into Success Plans with due dates, whose '
           'completion is tracked and shown to the student (South Texas College, 2023).', 'Ch1 Starfish')
p = find('Navigate360. Navigate360, developed by EAB')
replace_in(p, 'as documented uses. ', 'as documented uses, and it includes a Student Success Predictive Model '
           '(Universities of Wisconsin, 2025). ', 'Ch1 Navigate360')
set_body(find('Khanmigo. Khanmigo is Khan Academy'),
         'Khanmigo is Khan Academy’s AI tutor and teaching assistant for learners and teachers (Khan Academy, '
         '2023). It challenges students to think critically and solve problems without giving them direct answers, '
         'and it offers teachers tools for lesson planning, quizzes, and rubrics (Khan Academy, n.d., 2024).',
         'Ch1 Khanmigo')

# ------------------------------------------------------------------ Chapter 3
replace_in(find('Each cell for an existing system records'), '2023–2026', '2021–2026', 'Ch3 legend years')

tbl = next(t for t in body.iter(W + 'tbl')
           if [vis(c) for c in t.findall(W + 'tr')[0].findall(W + 'tc')][:2] == ['Capability', 'Moodle'])
rows = tbl.findall(W + 'tr')
COL = {'Moodle': 1, 'Canvas': 2, 'Starfish': 3, 'Navigate360': 4, 'Khanmigo': 5}
for row, sys_, old, new in ((5, 'Navigate360', 'NR', 'Yes'), (9, 'Starfish', 'NR', 'Part'),
                            (12, 'Moodle', 'NR', 'Yes'), (12, 'Canvas', 'NR', 'Yes'),
                            (13, 'Canvas', 'NR', 'Part'), (14, 'Moodle', 'NR', 'Part')):
    cells = rows[row].findall(W + 'tc')
    assert vis(cells[0]).startswith('%d.' % row), vis(cells[0])
    t = t_runs(cells[COL[sys_]])
    assert len(t) == 1 and t[0].text == old, (row, sys_, t[0].text)
    t[0].text = new
    LOG.append('Table 3.11 row %d %s: %s -> %s' % (row, sys_, old, new))

set_body(find('Note. Source basis:'),
         'Source basis: Moodle (2021, 2023, 2024, 2025); Brown University (2026), Metropolitan State University of '
         'Denver (2026), University of Alberta (2026), Post (2026), and Chrisos (2026) for Canvas; Penn State (2024), '
         'Long Beach City College (2024), and South Texas College (2023) for Starfish; EAB (2024, 2026) and '
         'Universities of Wisconsin (2025) for Navigate360; and Khan Academy (n.d., 2023, 2024) for Khanmigo. '
         '“Student can see” is Part for Canvas because it displays a student’s own grades or missing '
         'work; the reviewed pages did not describe a dedicated view of flags. “Assigned tasks” is Part for '
         'Starfish because To-Dos and Success Plans track completion, but instructor verification is not described. '
         '“Human approval” is Part for Canvas because instructor review is documented for AI-generated '
         'rubrics and grading feedback, not for every AI feature. “Student-facing AI tutoring” is Part for '
         'Moodle because its AI placements summarize course pages rather than tutor. “Instructor can edit the '
         'flagging criteria” is Part for ASPIRE because the risk-score weights and tier cutoffs are fixed by the '
         'research team in code; the Registrar can adjust each subject’s FDA absence limit and passing '
         'threshold, but individual faculty cannot edit the criteria.', 'Ch3 note')

set_body(find('Moodle already provides configurable grade calculation'),
         ' already provides configurable grade calculation, rule-based detection, teacher messaging, and, since '
         'version 4.5, AI text generation for teachers and AI summaries for students. Its built-in at-risk model is '
         'engagement-based and needs historical data, and its static models cannot be edited. ASPIRE differs by using '
         'a fixed, readable four-factor score tied to DYCI’s grading rules and by continuing past the alert into '
         'evaluation, tasks, verification, and referral. Moodle plugins could close some of these gaps, so the '
         'comparison is limited to Moodle’s core documentation.', 'Ch3 Moodle')
set_body(find('Canvas is the closest mainstream comparator'),
         ' is the closest mainstream comparator for instructor-configurable flags and messaging, and its IgniteAI '
         'features have instructors review AI-generated rubrics and grading feedback before students see them. The '
         'reviewed pages do not describe a risk score with fixed factor weights, task assignment with instructor '
         'verification, referrals, or baseline and follow-up case records, and its analytics and AI features depend '
         'on the institution’s plan.', 'Ch3 Canvas')
set_body(find('Starfish shows that faculty flags and referrals'),
         ' shows that faculty flags and referrals are established practice, so ASPIRE does not claim that idea as new. '
         'Its To-Dos and Success Plans assign tasks to students and track their completion, but the reviewed guides do '
         'not describe instructor verification of that completion, a risk score computed from local grade records, or '
         'fixed baseline and closure measurements; ASPIRE’s contribution lies in these.', 'Ch3 Starfish')
set_body(find('Navigate360 shares ASPIRE'),
         ' shares ASPIRE’s coordinated-intervention and AI-assistance concepts, includes a trained predictive '
         'model, and offers far broader scheduling and communication features. ASPIRE’s narrower design uses a '
         'readable four-factor score built from DYCI grade records instead of a trained model, and adds verified '
         'intervention tasks and case snapshots. Vendor claims about time savings or outcomes are not used here as '
         'evidence.', 'Ch3 Navigate360')
replace_in(find('Taken together, Table 3.11 supports a narrow claim'),
           ', and none of the cited sources documents a required human approval step before AI-generated content '
           'reaches a student.',
           '. Only Canvas documents instructor review of some AI-generated content (rubrics and grading feedback), '
           'whereas ASPIRE requires faculty approval of all AI-drafted intervention content before it is released.',
           'Ch3 closing claim')

# ------------------------------------------------------------------ References
h_refs, h_appx = heading('References'), heading('APPENDICES')


def ref_paras():
    out, cur = [], h_refs.getnext()
    while cur is not h_appx:
        if cur.tag == W + 'p' and vis(cur):
            out.append(cur)
        cur = cur.getnext()
    return out


replace_in(find('Moodle. (2025, December 10). Grade calculations'), '[Moodle 5.0 documentation]',
           '[Moodle 5.3 documentation]', 'Ref Moodle 5.3 label')


def rpr_xml(italic=False):
    return ('<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>%s<w:sz w:val="24"/><w:szCs w:val="24"/>'
            '<w:highlight w:val="yellow"/></w:rPr>' % (FONT, FONT, FONT, '<w:i/>' if italic else ''))


model = ref_paras()[0]
NEW = [
    ('Chrisos, M. (2026, April 10). ', 'Speed meets substance: 4 ways IgniteAI helps instructors deliver quality '
     'feedback faster', ' [Blog post]. Instructure. https://www.instructure.com/en-gb/resources/blog/speed-meets-'
     'substance-4-ways-igniteai-helps-instructors-deliver-quality-feedback', None),
    ('Khan Academy. (n.d.). ', 'Khanmigo', ' [Product page]. https://www.khanmigo.ai/', 'Khan Academy. (2023)'),
    ('Moodle. (2021, June 4). ', 'Using analytics', ' [Moodle 4.5 documentation]. '
     'https://docs.moodle.org/405/en/Upcoming_activities_due', None),
    ('Moodle. (2024, December 7). ', 'AI placements', ' [Moodle 4.5 documentation]. '
     'https://docs.moodle.org/405/en/AI_placements', None),
    ('Universities of Wisconsin. (2025, March 11). ', 'Navigate360 strategy session: Revisiting the Student Success '
     'Predictive Model, part 1', ' [Event listing]. https://www.wisconsin.edu/ss-eab-project/events/month/2025-03/',
     None),
]
for pre, title, post, before in NEW:
    p = etree.Element(W + 'p')
    ppr = copy.deepcopy(model.find(W + 'pPr'))
    for x in ppr.findall(W + 'pPrChange'):
        ppr.remove(x)
    rp = ppr.find(W + 'rPr')
    if rp is not None:
        for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
            rp.remove(x)
    p.append(ppr)
    for text, it in ((pre, False), (title, True), (post, False)):
        p.append(etree.fromstring('<w:r xmlns:w="%s">%s<w:t xml:space="preserve">%s</w:t></w:r>'
                                  % (WNS, rpr_xml(it), escape(text))))
    if TRACKED:
        rpm = p.find(W + 'pPr').find(W + 'rPr')
        if rpm is None:
            rpm = etree.SubElement(p.find(W + 'pPr'), W + 'rPr')
        rpm.insert(0, mark('ins'))
        for r in [c for c in p if c.tag == W + 'r']:
            i = mark('ins')
            idx = p.index(r)
            p.remove(r)
            i.append(r)
            p.insert(idx, i)
    if before:   # APA: undated works precede dated works by the same author
        anchor = next(r for r in ref_paras() if vis(r).startswith(before))
    else:
        key = (pre + title).lower()
        anchor = next((r for r in ref_paras() if vis(r).lower() > key), None)
    (anchor.addprevious(p) if anchor is not None else h_appx.addprevious(p))
    LOG.append('Ref added: ' + pre.strip())

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('\n'.join(LOG))
print('done, tracked=%s, references=%d' % (TRACKED, len(ref_paras())))
