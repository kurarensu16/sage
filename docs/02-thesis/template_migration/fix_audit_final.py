"""Line-by-line audit fixes approved in chat (2026-11-17): audit items A1-A20 (except A8, UI),
B2-B6, C1-C13 (except UI captions), decisions D2-D6, objectives rewritten 1:1 against the
specific problems, and 1-8 numbering on both lists. UI Design items are deferred.
New prose is highlighted yellow; tracked mode records every change.

Run: py fix_audit_final.py <in.docx> <out.docx> [--tracked]
"""
import copy
import re
import sys
import zipfile
from xml.sax.saxutils import escape
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
TRACKED = '--tracked' in sys.argv[3:]
WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W = '{%s}' % WNS
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
AUTHOR, DATE = 'Claude Code', '2026-11-17T14:00:00Z'
FONT = 'Times New Roman'
N = [137000]
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


def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W + 't') if live(t))


def style(p):
    ppr = p.find(W + 'pPr')
    s = ppr.find(W + 'pStyle') if ppr is not None else None
    return s.get(W + 'val', '') if s is not None else ''


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
body = root.find(W + 'body')


def paras():
    return list(body.iter(W + 'p'))


def find(snippet, start=False):
    hits = [p for p in paras() if (vis_text(p).strip().startswith(snippet) if start else snippet in vis_text(p))]
    assert len(hits) == 1, (snippet[:70], len(hits))
    return hits[0]


def heading(text):
    hits = [p for p in paras() if style(p).startswith('Heading') and vis_text(p).strip() == text]
    assert len(hits) == 1, (text, len(hits))
    return hits[0]


# ------------------------------------------------------------------ run-level primitives
def _split_run_keep(r, t):
    """Move <w:t> t's siblings into separate runs so r holds only rPr + t."""
    rpr = r.find(W + 'rPr')
    kids = [c for c in r if c.tag != W + 'rPr']
    ti = kids.index(t)
    for side, group in (('before', kids[:ti]), ('after', kids[ti + 1:])):
        if group:
            xr = etree.Element(W + 'r')
            if rpr is not None:
                xr.append(copy.deepcopy(rpr))
            for c in group:
                xr.append(c)
            (r.addprevious(xr) if side == 'before' else r.addnext(xr))


def _yellow(rpr):
    for x in rpr.findall(W + 'highlight'):
        rpr.remove(x)
    hl = etree.Element(W + 'highlight')
    hl.set(W + 'val', 'yellow')
    anchor = rpr.find(W + 'szCs') if rpr.find(W + 'szCs') is not None else rpr.find(W + 'sz')
    (anchor.addnext(hl) if anchor is not None else rpr.append(hl))


def replace_run(p, old, new, yellow=True):
    """Replace `old` inside one <w:t> of p. Returns False if old spans runs."""
    ts = [t for t in p.iter(W + 't') if live(t) and old in (t.text or '')]
    if len(ts) != 1:
        return False
    t = ts[0]
    r = t.getparent()
    _split_run_keep(r, t)
    rpr = r.find(W + 'rPr')
    s = t.text
    a = s.index(old)
    parent, idx = r.getparent(), r.getparent().index(r)
    parent.remove(r)
    for kind, txt in (('keep', s[:a]), ('del', old), ('ins', new), ('keep', s[a + len(old):])):
        if not txt or (kind == 'del' and not TRACKED):
            continue
        nr = etree.Element(W + 'r')
        nrpr = copy.deepcopy(rpr) if rpr is not None else etree.Element(W + 'rPr')
        if kind == 'ins' and yellow:
            _yellow(nrpr)
        nr.append(nrpr)
        te = etree.SubElement(nr, W + ('delText' if kind == 'del' else 't'))
        te.text = txt
        te.set(XML_SPACE, 'preserve')
        node = nr
        if TRACKED and kind != 'keep':
            node = mark(kind)
            node.append(nr)
        parent.insert(idx, node)
        idx += 1
    return True


def retext(p, text, yellow=True, keep_bold=False):
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None and live(r)]
    rpr = runs[0].find(W + 'rPr')
    rpr = copy.deepcopy(rpr) if rpr is not None else etree.Element(W + 'rPr')
    if not keep_bold:
        for x in rpr.findall(W + 'b'):
            rpr.remove(x)
    if yellow:
        _yellow(rpr)
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


def edit(p, old, new, label, yellow=True):
    """Run-level replacement; falls back to rewriting the whole paragraph."""
    full = vis_text(p)
    assert old in full, (label, old[:60])
    if not replace_run(p, old, new, yellow):
        retext(p, full.replace(old, new, 1), yellow)
        LOG.append(label + ' (whole paragraph)')
    else:
        LOG.append(label)


def prepend(p, text):
    first = next(r for r in p.iter(W + 'r') if r.find(W + 't') is not None and live(r))
    nr = etree.Element(W + 'r')
    rpr = first.find(W + 'rPr')
    if rpr is not None:
        nr.append(copy.deepcopy(rpr))
    t = etree.SubElement(nr, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    node = nr
    if TRACKED:
        node = mark('ins')
        node.append(nr)
    anchor = first
    while anchor.getparent() is not p:
        anchor = anchor.getparent()
    anchor.addprevious(node)


def delete_paragraph(p):
    if not TRACKED:
        p.getparent().remove(p)
        return
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
    rp.insert(0, mark('del'))


def new_para(text):
    p = etree.fromstring(
        '<w:p xmlns:w="%s"><w:pPr><w:spacing w:after="160" w:line="480" w:lineRule="auto"/>'
        '<w:ind w:firstLine="720"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>'
        '<w:sz w:val="24"/><w:szCs w:val="24"/><w:highlight w:val="yellow"/></w:rPr></w:pPr><w:r><w:rPr>'
        '<w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/><w:sz w:val="24"/><w:szCs w:val="24"/>'
        '<w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">%s</w:t></w:r></w:p>'
        % (WNS, FONT, FONT, FONT, FONT, FONT, FONT, escape(text)))
    if TRACKED:
        p.find(W + 'pPr').find(W + 'rPr').insert(0, mark('ins'))
        r = p.find(W + 'r')
        i = mark('ins')
        p.remove(r)
        i.append(r)
        p.append(i)
    return p


def cell_with(text, row_first=None):
    for tr in body.iter(W + 'tr'):
        cells = tr.findall(W + 'tc')
        if row_first and vis_text(cells[0]).strip() != row_first:
            continue
        for tc in cells:
            if vis_text(tc).strip() == text:
                return tc.find(W + 'p')
    raise AssertionError(('cell', text, row_first))


# ================================================================== B1 + numbering: problems
h_sp, h_obj = heading('Specific Problems'), heading('Objectives of the Study')
probs, cur = [], h_sp.getnext()
while cur is not h_obj:
    if cur.tag == W + 'p' and vis_text(cur).strip():
        probs.append(cur)
    cur = cur.getnext()
assert len(probs) == 8, len(probs)
for i, p in enumerate(probs, 1):
    prepend(p, '%d. ' % i)
LOG.append('Specific Problems numbered 1-8')

h_so, h_scope = heading('Specific Objectives'), heading('Scope and Delimitation')
objs, cur = [], h_so.getnext()
while cur is not h_scope:
    if cur.tag == W + 'p' and vis_text(cur).strip():
        objs.append(cur)
    cur = cur.getnext()
assert len(objs) == 8, len(objs)
assert vis_text(objs[0]).startswith('Develop five secure') and vis_text(objs[6]).startswith('Implement controlled grade')
OBJ = {
    1: "Implement DYCI's program-specific COG templates for regular and Summer terms, including activity-based "
       "computation, grading-period result rounding, transmutation, controlled posting, and frozen class formula "
       "snapshots, and give students timely access to recorded activity scores, tentative performance, and "
       "officially posted MR, TFR, and SG results.",
    2: "Implement an explainable four-factor Academic Risk Score and a prioritized faculty roster while allowing "
       "faculty to evaluate and support students at any risk level.",
    3: "Provide time-bounded grade consultation windows together with timely attendance information, proactive risk "
       "monitoring, faculty advisories, and faculty-led intervention plans with catch-up tasks, student "
       "acknowledgment, and task verification.",
    4: "Provide non-binding AI Study Advising that uses authorized academic evidence available to the student and a "
       "deterministic fallback while leaving formal intervention decisions to faculty members.",
    5: "Support Faculty–Dean collaboration through Dean referrals and escalated-case review, separate "
       "academic-risk and President's Lister eligibility monitoring, Dean-approved one-use grade corrections, and "
       "baseline-to-follow-up measurement of recorded intervention outcomes.",
}
for i, p in enumerate(objs):
    if i in OBJ:
        retext(p, '%d. %s' % (i + 1, OBJ[i]))
    else:
        prepend(p, '%d. ' % (i + 1))
LOG.append('Specific Objectives rewritten 1:1 (2-6) and numbered 1-8')

# ================================================================== A items
edit(find("ASPIRE's five-role RBAC follows least privilege"),
     'policies.direct posted-grade overrides. Sensitive records are additionally protected through applicable '
     'Supabase Row Level Security policies.', 'policies.', 'A1 broken fragment')
edit(find('GWA, General Weighted Average', start=True),
     ", the weighted average of a student's transmuted grades.",
     ". In ASPIRE, the running GWA is the arithmetic mean of the student's available subject grades on the "
     "1.00–5.00 scale, without unit weighting; units are used separately for President's Lister eligibility.",
     'A2 GWA definition')
edit(find('computed as described under Instrument and Validation'), 'Instrument and Validation',
     'Research Instruments', 'A3 cross-reference')
edit(find("regardless of the student's current Safe, Watch, High, or Critical tier"),
     "regardless of the student's current Safe, Watch, High, or Critical tier",
     "regardless of the student's current risk tier (Safe/Low, Watch/Moderate, High, or Critical)", 'A4 Stage 1 tiers')
edit(find('Risk tiers are Low (0-24), Moderate (25-49)'), 'Risk tiers are Low (0-24), Moderate (25-49)',
     'Risk tiers are Safe/Low (0-24), Watch/Moderate (25-49)', 'A4 Table 2.3 tiers')
edit(find('Administrators can maintain and assign COG templates'), 'Administrators can maintain and assign COG templates',
     'The Registrar maintains and assigns COG templates', 'A5 COG templates owner')
edit(find('TAM-based surveys measured Perceived Ease of Use'),
     'TAM-based surveys measured Perceived Ease of Use (PEOU) and Perceived Usefulness (PU) and identified usability '
     'adjustments and formula discrepancies for later cycles.',
     'Panel defenses, adviser and technical-adviser consultations, and the full-cycle tests identified usability '
     'adjustments and formula discrepancies for later cycles; the formal TAM and ISO/IEC 25010:2023 evaluation '
     'follows in the final iteration and is reported in Chapter 3.', 'A6 Phase 7')
edit(find('authorized Student, Faculty, Dean, or Admin roles'), 'Student, Faculty, Dean, or Admin roles',
     'Student, Faculty, Dean, Registrar, or Admin roles', 'A7 Registrar in ethics')
edit(find('is purged once the request is resolved'), 'is purged once the request is resolved',
     'is removed at the term rollover after the term it belongs to, once the request is resolved', 'A9 purge (ethics)')
edit(find('purged on a retention schedule'), 'purged on a retention schedule',
     'removed at the term rollover after its term, once the request is resolved', 'A9 purge (Table 2.14)')
edit(find('is purged at the next term rollover once the request is resolved'),
     'is purged at the next term rollover once the request is resolved',
     'is removed at the term rollover after the term it belongs to, once the request is resolved', 'A9 purge (workflow)')
edit(find('update only a profile photo and contact number and change their password'),
     'update only a profile photo and contact number and change their password',
     'update only a profile photo and contact number (and, for students, their guardian contact) and change their '
     'password', 'A10 guardian (Scope)')
edit(find('Each user may change only their photo, contact number, and password;'),
     'Each user may change only their photo, contact number, and password;',
     'Each user may change only their photo, contact number, and password, and students also their guardian '
     'contact;', 'A10 guardian (workflow)')
edit(find('Users may change only their photo, contact number, and password;'),
     'Users may change only their photo, contact number, and password;',
     'Users may change only their photo, contact number, and password (students also their guardian contact);',
     'A10 guardian (Table 2.3)')
edit(find('saves approved students to the roster'), 'retrieves class records and saves approved students to the roster',
     'retrieves class records and their rosters', 'A11 Faculty DFD Classes')
p = find('(Figure 2.9a, 2.14b, and so on)')
edit(p, '(Figure 2.9a, 2.14b, and so on)', '(Figures 2.14a, 2.14b, and so on)', 'A12 figure numbers')
edit(p, ' Where two lines cross, one arcs over the other.', '', 'A12 arc sentence')
edit(find("does not directly integrate with DYCI's Registrar, billing system"), "DYCI's Registrar, billing system",
     "DYCI's existing registrar records system, billing system", 'A13 Delimitations')
edit(find('Direct integration with the DYCI Registrar, billing system'), 'the DYCI Registrar, billing system',
     "DYCI's existing registrar records system, billing system", 'A13 Compatibility')
delete_paragraph(find('Wagner, S., Lochmann, K.', start=True))
LOG.append('A14 uncited Wagner reference removed')
dyci, etik = find("Dr. Yanga's Colleges, Inc. (2025). Student handbook", start=True), find('Etikan, I., Musa', start=True)
dyci.getparent().remove(dyci)
etik.addprevious(dyci)
LOG.append('A15 reference order')
p = find('the exact notification recipient has not been verified')
edit(p, ' Honor advisories may be initiated by the Dean, but the exact notification recipient has not been verified.',
     '', 'A16 draft note')
edit(p, 'faculty use a unified Academic Intervention evaluation form rather than an Honors Retention context selector',
     'faculty use one Academic Intervention evaluation form for every case', 'A16 developer note')
edit(find('ahead of these diagrams'),
     "The Visual Table of Contents maps ASPIRE's modules, and each user role's functions within them, ahead of these "
     "diagrams.", "The Visual Table of Contents, placed between the Process Design and the Database Design, maps "
     "ASPIRE's modules and each user role's functions within them.", 'A17 VTOC position')
edit(find('matching the module breakdown in Figure 2.13'), ', matching the module breakdown in Figure 2.13,', '',
     'A18 Student DFD')
p = find('organized by the specific objectives in Chapter 1')
edit(p, 'organized by the specific objectives in Chapter 1', 'organized into system testing results and system '
     'evaluation results', 'A19 Ch3 intro')
edit(find('This section proves that the system works as intended'), 'This section proves that',
     'This section presents the evidence that', 'A19 proves')
edit(find('It is completed once Chapter 3 reports real results'),
     'It is completed once Chapter 3 reports real results; writing it before that would mean stating conclusions '
     'the data has not yet supported.', 'The summary of findings, conclusion, and recommendations are drawn only '
     'from the results reported in Chapter 3.', 'A20 Ch4 intro')

# ================================================================== B items
h_ri = heading('Research Instruments')
h_ri.addnext(new_para('Both instruments are researcher-adapted: the TAM items are adapted from Davis (1989) to '
                      "ASPIRE's functions, and the ISO/IEC 25010:2023 items are researcher-made from the standard's "
                      'quality characteristics (ISO/IEC, 2023).'))
LOG.append('B2 instrument type')
find('This study uses a quantitative, developmental research design').addnext(new_para(
    "Preliminary surveys and informal inquiries conducted during requirements analysis informed the system's design "
    'and are not part of the evaluation data.'))
LOG.append('B3 research design note')
find("ASPIRE's functional requirements are organized by module").addnext(new_para(
    "ASPIRE's non-functional requirements are security, through authenticated, role-based access and audited "
    'changes to official records; reliability, through a deterministic fallback when the AI service is unavailable; '
    'performance, through server-side computation with immediate on-screen recalculation; usability, through '
    'role-specific navigation; and compatibility, with modern web browsers and an optional Android build.'))
LOG.append('B4 non-functional requirements')
edit(find('Additional integration checks are required for the distinct grade-entry'),
     'Additional integration checks are required for the distinct grade-entry and persisted-roster behavior on '
     'partially entered grading periods and for database-level score constraints; code-level calculation checks alone '
     'are not proof of all end-to-end behaviors. Final analytics verification must also cover configured component '
     'averages, regular and Summer term progression, per-class attendance threshold counts, released-activity '
     'filtering, honors blockers, evidence-coverage and unavailable states, and equality between displayed and '
     'exported comparison values.',
     'Because code-level calculation checks alone cannot show every end-to-end behavior, such as grade entry on '
     'partially entered grading periods, database-level score constraints, and equality between displayed and '
     'exported values, the full-cycle tests described below exercise the complete workflow.', 'B5 Phase 6')
find('Table 3.1 | Automated Verification Results', start=True).addnext(new_para(
    'In addition to these scripts, the researchers ran eight full-cycle tests from November 2 to November 15, 2026, '
    'each covering the complete workflow from creating user accounts to rolling over an academic term across all '
    'five roles, using mock data in keeping with the Data Privacy Act of 2012 (Republic of the Philippines, 2012). '
    'The bugs and optimization opportunities found in each cycle were resolved before the next.'))
LOG.append('B6 Ch3 full-cycle tests')
edit(find('These are implementation audit findings, not evidence that all end-to-end functionality passed.'),
     'These are implementation audit findings, not evidence that all end-to-end functionality passed.',
     'These are implementation audit findings; end-to-end behavior was exercised separately through the eight '
     'full-cycle tests described under System Development Methodology.', 'B6 V&V')

# ================================================================== D decisions
CRIT = {
    '• (a) Students': '• (a) Students — currently enrolled DYCI students who attended the researchers\' guided '
                      'presentation of the Student Portal before evaluating it.',
    '• (b) Faculty members': '• (b) Faculty members — instructors currently handling at least one class section '
                             'who attended the guided presentation of the Faculty Portal.',
    '• (c) Deans': '• (c) Deans — college Deans who attended the guided presentation of the Dean Portal.',
    '• (d) Registrars': '• (d) Registrar — the DYCI Registrar, who attended the guided presentation of the '
                        'Registrar Portal.',
    '• (e) Administrators': '• (e) Administrator — the system administrator, who attended the guided presentation '
                            'of the Admin Portal.',
}
for k, v in CRIT.items():
    retext(find(k, start=True), v)
LOG.append('D2 inclusion criteria (a)-(e)')
retext(find('Following institutional authorization, students, faculty', start=True),
       "Following institutional authorization, the researchers present each respondent group's portal, using ASPIRE's "
       'demonstration data, before the respondents evaluate it. Respondents then try the portal\'s main workflows '
       '(faculty: score entry, grade posting, risk triage, and intervention; students: posted grades, current '
       'standing, and approved guidance). While respondents answer, the researchers remain available to clarify the '
       'meaning of questionnaire items, without suggesting answers.')
LOG.append('D2 data gathering')
edit(find('with 1-3 IT experts as a separate group'), 'with 1-3 IT experts', 'with 5 IT experts', 'D3 Research Subjects')
edit(cell_with('1-3', row_first='IT experts (IT faculty members, systems analysts, or professional developers)'),
     '1-3', '5', 'D3 Table 2.1')
edit(find('and 1-3 IT experts, who answered'), 'and 1-3 IT experts', 'and 5 IT experts', 'D3 Summary of the Study')
edit(find('Expert ISO/IEC 25010:2023 items (Koo & Li, 2016).'), '(Koo & Li, 2016).',
     '(Koo & Li, 2016), computed when two or more experts participate.', 'D3 ICC condition')
edit(find('The null hypothesis will be rejected in favor of H1 only when'),
     'only when the separately computed Perceived Usefulness and Perceived Ease of Use means for both respondent '
     'groups are at least 2.51 and the Expert ISO/IEC 25010:2023 overall compliance is at least 80%.',
     'only when the Perceived Usefulness and Perceived Ease of Use means of the end-user group (all five roles '
     'combined) and of the IT expert group are each at least 2.51 and the Expert ISO/IEC 25010:2023 overall '
     'compliance is at least 80%. The means of each individual role are reported descriptively in Chapter 3.',
     'D4 hypothesis')
retext(find('ASPIRE is delivered through a responsive React/Vite web application', start=True),
       'ASPIRE is deployed as a web application on Vercel, with Supabase providing the managed database, '
       'authentication, and storage, and an optional Android build produced through Capacitor from the same codebase. '
       "User orientation is a guided presentation of each role's portal, using ASPIRE's demonstration data, given to "
       'each respondent group before evaluation. Institution-wide rollout is proposed after the study, staged by '
       'role: the Registrar and the Administrator first, to set up the term and the accounts; then Deans and faculty; '
       'then students.')
retext(find('[To complete: describe user orientation or training per role', start=True),
       "Before each group's rollout, the same guided presentation used in the evaluation serves as that group's "
       'orientation. The rollout follows the order described under System Implementation, so that terms, accounts, '
       'and class records exist before faculty and students begin using the system.')
LOG.append('D5 System Implementation + Implementation Plan')
for name, old, new in (
        ('Gabriel, John Christian C.', 'Team Lead; oversees the project.',
         'Team Lead; post-defense development; system integration; migration planning; final reviewer and auditor '
         'of the documentation and the system.'),
        ('Sadiaza, Clarence Timothy G.', 'Database design and the initial system.',
         'Initial system development; database design; migration planning.'),
        ('Abalos, Carl Jerome F.', 'Review of Related Literature (RRL) and Review of Related Studies (RRS).',
         'Review of Related Literature (RRL) and Review of Related Studies (RRS); testing; documentation; migration '
         'planning.')):
    edit(cell_with(old, row_first=name), old, new, 'D6 responsibilities ' + name.split(',')[0])

# ================================================================== C items
edit(find("the Dean's dual-tier Risk and Honors Analytics Matrix"), "the Dean's dual-tier Risk and Honors Analytics "
     'Matrix', "the Dean's Risk and Honors Overview", 'C3 Phase 8 name')
edit(find('three absences are the point'), 'three absences are the point', 'three gaps stand out', 'C4')
edit(find("A hierarchical chart of every portal's modules and pages."),
     "A hierarchical chart of every portal's modules and pages.",
     "A hierarchical chart of ASPIRE's modules, the users who work in each, and the functions they perform.", 'C5')
edit(find('Deans, registrars, and administrators. It gives students'), 'Deans, registrars, and administrators',
     'Deans, the Registrar, and administrators', 'C7 SOP')
edit(objs[0], 'Deans, registrars, and administrators', 'Deans, the Registrar, and administrators', 'C7 Objective 1')
edit(find('Students, faculty, Deans, Registrars, and administrators receive'),
     'Students, faculty, Deans, Registrars, and administrators receive',
     'Students, faculty, Deans, the Registrar, and the Administrator receive', 'C7 instruments')
for tbl_first in ('Registrars', 'Administrators'):
    for tr in body.iter(W + 'tr'):
        c0 = tr.findall(W + 'tc')[0]
        if vis_text(c0).strip() == tbl_first:
            edit(c0.find(W + 'p'), tbl_first, tbl_first[:-1], 'C7 table row ' + tbl_first, yellow=False)
for p in paras():
    while 'Etikan, Musa, & Alkassim, 2016' in vis_text(p):
        edit(p, 'Etikan, Musa, & Alkassim, 2016', 'Etikan et al., 2016', 'C8 Etikan citation')
edit(find('records actions in ACTIVITY_LOGS for accountability'), 'in ACTIVITY_LOGS', 'in the activity log', 'C9')
edit(find('approval letters to conduct the evaluation were obtained before any respondent was contacted (Appendix E)'),
     '(Appendix E)', '(Appendices B, C, and E)', 'C10 appendix refs')
delete_paragraph(find('Enrollment and Loading assigns faculty to subject-section classes under an exclusive', start=True))
LOG.append('C11 duplicate Registrar DFD paragraph removed')
edit(find('The existing system has four participants. Only the administrator', start=True),
     'The existing system has four participants. ', '', 'C12 repeated sentence', yellow=False)

# C6 American spelling, every occurrence in the body (references excluded by content)
SPELL = [('enrolment', 'enrollment'), ('Enrolment', 'Enrollment'), ('catalogue', 'catalog'),
         ('Catalogue', 'Catalog'), ('prioritised', 'prioritized'), ('summarises', 'summarizes'),
         ('finalisation', 'finalization'), ('authorised', 'authorized'), ('authorise', 'authorize'),
         ('labelled', 'labeled')]
n_sp = 0
for p in paras():
    for old, new in SPELL:
        guard = 0
        while re.search(r'\b%s' % old, vis_text(p)) and guard < 20:
            guard += 1
            t_hits = [t for t in p.iter(W + 't') if live(t) and old in (t.text or '')]
            if not t_hits:
                break
            replace_run(p, old, new, yellow=False)
            n_sp += 1
LOG.append('C6 spelling fixes: %d' % n_sp)

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('\n'.join(LOG))
print('done, tracked=%s, edits=%d' % (TRACKED, len(LOG)))
