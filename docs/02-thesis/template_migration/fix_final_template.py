"""Align the paper with the professor's final template (CAPSTONE-RESEARCH-chapter1-4.docx).
Confirmed in chat ("update at once"). Newly drafted prose is highlighted yellow for review.

 1. Research Design moves to the start of Chapter 2 (before Research Subjects).
 2. NEW Ch. 1 Significance of the Study (after Delimitations), one paragraph per beneficiary.
 3. Definition of Terms moves to the end of Ch. 1 (after Hypothesis) and splits into
    Conceptual Definitions (cited, only for terms the References already support) and
    Operational Definitions (the existing entries, plus operational entries for the new
    conceptual terms).
 4. NEW Ch. 3 Scale and Verbal Interpretation (Table 3.4, template labels); Table 2.12's
    bottom two labels aligned; old Tables 3.4-3.6 renumbered 3.5-3.7.
 5. NEW Ch. 3 Comparison with Related Systems (Table 3.8 + narrative + uniqueness).
 6. NEW Ch. 4 Summary of the Study (before Summary of Findings).
 7. NEW Ch. 4 Future Work and Direction for Future Research (after Recommendations).
 8. Appendices rebuilt to the template's A-Q list.

Run: py fix_final_template.py <in.docx> <out.docx> [--tracked]
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
AUTHOR, DATE = 'Claude Code', '2026-11-16T16:00:00Z'
FONT = 'Times New Roman'


class Ctx:
    n = 111000

    def mark(self, tag):
        Ctx.n += 1
        e = etree.Element(W + tag)
        e.set(W + 'id', str(Ctx.n))
        e.set(W + 'author', AUTHOR)
        e.set(W + 'date', DATE)
        return e


ctx = Ctx()


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


def find_unique(snippet, exact=False):
    hits = [p for p in body.iter(W + 'p')
            if (vis_text(p).strip() == snippet if exact else snippet in vis_text(p))]
    assert len(hits) == 1, (snippet[:70], len(hits))
    return hits[0]


# ------------------------------------------------------------------ tracking helpers
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
    rp.insert(0, ctx.mark('ins'))
    for r in [c for c in p if c.tag == W + 'r']:
        i = ctx.mark('ins')
        idx = p.index(r)
        p.remove(r)
        i.append(r)
        p.insert(idx, i)


def mark_table_inserted(tbl):
    if not TRACKED:
        return
    for tr in tbl.findall(W + 'tr'):
        for tc in tr.findall(W + 'tc'):
            for p in tc.findall(W + 'p'):
                mark_para_inserted(p)
        trpr = tr.find(W + 'trPr')
        if trpr is None:
            trpr = etree.Element(W + 'trPr')
            tr.insert(0, trpr)
        trpr.append(ctx.mark('ins'))


def retext(p, text, yellow=False):
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None
            and not any(a.tag == W + 'del' for a in r.iterancestors())]
    assert runs, vis_text(p)[:40]
    rpr = runs[0].find(W + 'rPr')
    rpr = copy.deepcopy(rpr) if rpr is not None else etree.Element(W + 'rPr')
    for x in rpr.findall(W + 'b'):
        rpr.remove(x)
    if yellow and rpr.find(W + 'highlight') is None:
        hl = etree.Element(W + 'highlight')
        hl.set(W + 'val', 'yellow')
        after = rpr.find(W + 'szCs')
        if after is None:
            after = rpr.find(W + 'sz')
        (after.addnext(hl) if after is not None else rpr.append(hl))
    if not TRACKED:
        for r in runs:
            r.getparent().remove(r)
        nr = etree.SubElement(p, W + 'r')
        nr.append(rpr)
        t = etree.SubElement(nr, W + 't')
        t.text = text
        t.set(XML_SPACE, 'preserve')
        return
    for r in runs:
        par = r.getparent()
        i = par.index(r)
        par.remove(r)
        d = ctx.mark('del')
        d.append(r)
        par.insert(i, d)
        for t in r.findall(W + 't'):
            t.tag = W + 'delText'
    ins = ctx.mark('ins')
    nr = etree.SubElement(ins, W + 'r')
    nr.append(rpr)
    t = etree.SubElement(nr, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    p.append(ins)


def capture_range(start, end_exclusive):
    els, cur = [], start
    while cur is not None and cur is not end_exclusive:
        els.append(cur)
        cur = cur.getnext()
    for e in els:
        e.getparent().remove(e)
    return els


def insert_before(anchor, elements):
    for e in elements:
        anchor.addprevious(e)


# ------------------------------------------------------------------ builders
def rpr_xml(bold=False, italic=False, yellow=False, sz=24):
    # Schema order: rFonts, b, i, ..., sz, szCs, highlight
    return ('<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>%s%s<w:sz w:val="%d"/>'
            '<w:szCs w:val="%d"/>%s</w:rPr>' % (FONT, FONT, FONT, '<w:b/>' if bold else '',
                                               '<w:i/>' if italic else '', sz, sz,
                                               '<w:highlight w:val="yellow"/>' if yellow else ''))


def para(runs, yellow=False, indent=True, center=False, italic=False):
    """runs: list of (text, bold)."""
    ppr = ('<w:pPr><w:spacing w:after="160" w:line="480" w:lineRule="auto"/>%s<w:jc w:val="%s"/>%s</w:pPr>'
           % ('<w:ind w:firstLine="720"/>' if indent else '', 'center' if center else 'both',
              rpr_xml(italic=italic, yellow=yellow)))
    rx = ''.join('<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>'
                 % (rpr_xml(bold=b, italic=italic, yellow=yellow), escape(t)) for t, b in runs)
    p = etree.fromstring('<w:p xmlns:w="%s">%s%s</w:p>' % (WNS, ppr, rx))
    mark_para_inserted(p)
    return p


def text_para(text, yellow=False):
    return para([(text, False)], yellow=yellow)


def caption(text):
    return para([(text, False)], indent=False, center=True, italic=True)


def term(name, definition, yellow=True):
    return para([(name, True), (', ' + definition, False)], yellow=yellow)


def clean_ppr(model):
    ppr = copy.deepcopy(model.find(W + 'pPr'))
    for x in ppr.findall(W + 'sectPr') + ppr.findall(W + 'pPrChange') + ppr.findall(W + 'numPr'):
        ppr.remove(x)
    rp = ppr.find(W + 'rPr')
    if rp is not None:
        for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
            rp.remove(x)
    return ppr


def heading_like(model, text, page_break=False):
    p = etree.Element(W + 'p')
    ppr = clean_ppr(model)
    if page_break and ppr.find(W + 'pageBreakBefore') is None:
        pb = etree.Element(W + 'pageBreakBefore')
        lead = [c for c in ppr if c.tag in (W + 'pStyle', W + 'keepNext', W + 'keepLines')]
        (lead[-1].addnext(pb) if lead else ppr.insert(0, pb))
    p.append(ppr)
    r = etree.SubElement(p, W + 'r')
    for mr in model.iter(W + 'r'):
        if mr.find(W + 't') is not None and mr.find(W + 'rPr') is not None:
            rp = copy.deepcopy(mr.find(W + 'rPr'))
            for x in rp.findall(W + 'highlight'):
                rp.remove(x)
            r.append(rp)
            break
    t = etree.SubElement(r, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    mark_para_inserted(p)
    return p


def cell(text, w, bold=False, yellow=False, sz=22, center=True):
    return ('<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>'
            '<w:p><w:pPr><w:jc w:val="%s"/>%s</w:pPr><w:r>%s<w:t xml:space="preserve">%s</w:t></w:r></w:p></w:tc>'
            % (w, 'center' if center else 'left', rpr_xml(yellow=yellow, sz=sz),
               rpr_xml(bold=bold, yellow=yellow, sz=sz), escape(text)))


def make_table(header, rows, widths, sz=22, yellow_cols=(), left_cols=()):
    grid = ''.join('<w:gridCol w:w="%d"/>' % w for w in widths)
    hdr = ''.join(cell(t, w, bold=True, sz=sz) for t, w in zip(header, widths))
    trs = []
    for row in rows:
        trs.append('<w:tr>%s</w:tr>' % ''.join(
            cell(t, w, bold=(i == 0 and 0 in left_cols), yellow=i in yellow_cols, sz=sz, center=i not in left_cols)
            for i, (t, w) in enumerate(zip(row, widths))))
    b = ''.join('<w:%s w:val="single" w:sz="4" w:space="0" w:color="auto"/>' % s
                for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))
    tbl = etree.fromstring(
        '<w:tbl xmlns:w="%s"><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>'
        '<w:jc w:val="center"/><w:tblBorders>%s</w:tblBorders></w:tblPr><w:tblGrid>%s</w:tblGrid>'
        '<w:tr><w:trPr><w:tblHeader/></w:trPr>%s</w:tr>%s</w:tbl>' % (WNS, b, grid, hdr, ''.join(trs)))
    mark_table_inserted(tbl)
    return tbl


# ================================================================== anchors (before moves)
h_theory = heading('Theoretical Framework')
h_ch2 = heading('CHAPTER 2')
h_ch3 = heading('CHAPTER 3')
h_def = heading('Definition of Terms')
h_rsubj = heading('Research Subjects')
h_rdes = heading('Research Design')
h_dgp = heading('Data Gathering Procedure')
h_evalcrit = heading('Evaluation Criteria')                # H3 model, Ch. 3
h_results = heading('Results and Discussion')
h_hypo_res = heading('Hypothesis Testing Results')
h_conclusion = heading('Conclusion')                       # H2 model, Ch. 4
h_summary_find = heading('Summary of Findings')
h_refs = heading('References')
h_appx = heading('APPENDICES')
h_rec_model = heading('Recommendations')

# ================================================================== 1. Research Design first
insert_before(h_rsubj, capture_range(h_rdes, h_dgp))

# ================================================================== 2. Significance of the Study
SIG = [
    "The study is significant to the following beneficiaries, presented from the most to the "
    "least directly affected by ASPIRE.",
    "Students. ASPIRE gives students timely visibility into faculty-recorded scores, tentative "
    "computations, officially posted grades, attendance, and their current standing, together "
    "with non-binding AI Study Advising grounded in their own activity metadata. When a faculty "
    "member evaluates a student, the student receives a faculty-approved catch-up plan with "
    "trackable tasks, so academic concerns can be acted on before the end of the term.",
    "Faculty. ASPIRE computes grades from each subject's assigned COG template, posts the "
    "Midterm Rating, Tentative Final Rating, and Semestral Grade through one controlled "
    "workflow, and orders class rosters by an explainable Academic Risk Score. Faculty can see "
    "why a student was flagged, evaluate any student regardless of risk tier, and keep each "
    "intervention plan with a frozen baseline for follow-up.",
    "College Deans. ASPIRE gives Deans college-level views of grade submission, academic risk, "
    "President's Lister eligibility, escalated cases, and intervention results, and a defined "
    "role in faculty loading and in approving student-scoped grade corrections.",
    "Registrar. ASPIRE gives the Registrar one place to maintain academic setup, academic terms, "
    "enrolment, and faculty loading, and to make separately audited overrides to official "
    "grade records.",
    "Dr. Yanga's Colleges, Inc. ASPIRE applies the institution's own Student Handbook and COG "
    "templates in a single system, keeps an audit trail of significant actions, and records "
    "intervention outcomes, giving DYCI structured evidence about its academic support process.",
    "System Administrators. ASPIRE separates account provisioning and system maintenance from "
    "academic work, with role-based access control and an activity log for review.",
    "Future Researchers. The study documents a deterministic, auditable risk model, a "
    "human-in-the-loop intervention workflow, and a baseline-to-follow-up measurement design "
    "that future researchers can calibrate, extend, or compare with predictive approaches.",
    "IT Community. The study shows how a managed cloud backend, role-based access control, and "
    "a grounded AI service with a deterministic fallback can be combined into an academic "
    "system in which AI output remains advisory and cannot change official records.",
]
sig_block = [heading_like(h_theory, 'Significance of the Study')]
for i, s in enumerate(SIG):
    if i == 0:
        sig_block.append(text_para(s, yellow=True))
    else:
        name, rest = s.split('. ', 1) if not s.startswith('Dr. ') else ("Dr. Yanga's Colleges, Inc", s.split('Inc. ', 1)[1])
        sig_block.append(para([(name + '. ', True), (rest, False)], yellow=True))
insert_before(h_theory, sig_block)

# ================================================================== 3. Definition of Terms -> Ch. 1
def_block = capture_range(h_def, h_ch3)
insert_before(h_ch2, def_block)

intro = find_unique('This section defines the terms used in this paper as they apply to ASPIRE.')
retext(intro, "This section defines the key terms used in this paper. Conceptual definitions give "
              "each term's meaning from published sources; operational definitions give how the "
              "term is used, measured, or implemented in ASPIRE. Terms in each list are arranged "
              "alphabetically.", yellow=True)

CONCEPTUAL = [
    ('Human-in-the-Loop (HITL)', 'An approach to artificial intelligence in which human judgment is '
     'built into the system, so that people supervise, correct, or approve model output instead of '
     'leaving decisions entirely to the model (Lazaros et al., 2026).'),
    ('ISO/IEC 25010:2023', 'An international standard that defines a product quality model, a set of '
     'quality characteristics and sub-characteristics used to specify and evaluate software products '
     '(ISO/IEC, 2023).'),
    ('Perceived Ease of Use (PEOU)', '"The degree to which a person believes that using a particular '
     'system would be free of effort" (Davis, 1989, p. 320).'),
    ('Perceived Usefulness (PU)', '"The degree to which a person believes that using a particular '
     'system would enhance his or her job performance" (Davis, 1989, p. 320).'),
    ('Purposive Sampling', 'A nonprobability sampling technique in which the researcher deliberately '
     'selects participants who have qualities relevant to the study (Etikan, Musa, & Alkassim, 2016).'),
    ('Role-Based Access Control (RBAC)', 'An access-control model in which permissions are associated '
     'with roles and users are made members of roles, acquiring those roles\' permissions '
     '(Sandhu et al., 1996).'),
    ('Technology Acceptance Model (TAM)', 'A model that explains users\' acceptance of information '
     'technology through two beliefs, perceived usefulness and perceived ease of use (Davis, 1989).'),
]
conc = [heading_like(h_evalcrit, 'Conceptual Definitions')] + [term(n, d) for n, d in CONCEPTUAL]
conc.append(heading_like(h_evalcrit, 'Operational Definitions'))
first_entry = intro.getnext()
insert_before(first_entry, conc)

OPERATIONAL_NEW = [
    ('MR, TFR, and SG', 'ISO/IEC 25010:2023', 'The quality model used in ASPIRE\'s evaluation. IT experts '
     'rate nine characteristics (36 items) and end users rate seven (28 items) on a four-point scale; '
     'each characteristic\'s mean is converted to a compliance percentage.'),
    ('Posted Grade', 'Perceived Ease of Use (PEOU)', 'Measured by five four-point items in the TAM '
     'section of both questionnaires and reported as a weighted mean per respondent group; a mean of '
     '2.51 or higher is acceptable.'),
    ('Posted Grade', 'Perceived Usefulness (PU)', 'Measured by five four-point items in the TAM section '
     'of both questionnaires and reported as a weighted mean per respondent group; a mean of 2.51 or '
     'higher is acceptable.'),
    ('Registrar', 'Purposive Sampling', 'The selection of respondents from the five ASPIRE roles and '
     'the IT expert panel according to the inclusion criteria under Research Subjects.'),
    ('Visual Table of Contents (VTOC)', 'Technology Acceptance Model (TAM)', 'The basis of the 10-item '
     'TAM section given to every respondent: five Perceived Usefulness and five Perceived Ease of Use '
     'items.'),
]
for before_term, name, d in OPERATIONAL_NEW:
    anchor = next(p for p in def_block if p.tag == W + 'p' and vis_text(p).startswith(before_term + ','))
    anchor.addprevious(term(name, d))

# ================================================================== 4. Scale and Verbal Interpretation
for old, new in (('Table 3.6 |', 'Table 3.7 |'), ('Table 3.5 |', 'Table 3.6 |'), ('Table 3.4 |', 'Table 3.5 |')):
    p = find_unique(old)
    retext(p, vis_text(p).replace(old, new, 1))
for old, new in (('Disagree / Poor', 'Disagree / Moderately Acceptable'),
                 ('Strongly Disagree / Unacceptable', 'Strongly Disagree / Not Acceptable')):
    retext(find_unique(old, exact=True), new)

scale = [
    heading_like(h_evalcrit, 'Scale and Verbal Interpretation'),
    text_para('Each computed weighted mean, for both TAM and ISO/IEC 25010:2023, is interpreted using '
              'the four-point scale in Table 3.4. The ranges are the same as those in Table 2.12 of '
              'Chapter 2.'),
    caption('Table 3.4 | Scale and Verbal Interpretation'),
    make_table(['Mean Range', 'Verbal Interpretation', 'Descriptive Equivalent'],
               [['3.26 - 4.00', 'Highly Acceptable', 'The system fully satisfies the criterion.'],
                ['2.51 - 3.25', 'Acceptable', 'The system satisfies the criterion.'],
                ['1.76 - 2.50', 'Moderately Acceptable', 'The system partially satisfies the criterion.'],
                ['1.00 - 1.75', 'Not Acceptable', 'The system does not satisfy the criterion.']],
               [1800, 2400, 4800]),
]
insert_before(h_results, scale)

# ================================================================== 5. Comparison with Related Systems
V = '[verify]'
CMP_HEADER = ['Features / Criteria',
              'Automated Grading System with Student Performance Analytics (Bato & Pomperada, 2025)',
              'Streamlined Student Information and Grading System (Orboc, 2025)',
              'Early Warning System with Personalized Interventions (Chang et al., 2025)',
              'EX-LAD: Explainable Learning Analytics Dashboard (Khelifi et al., 2024)',
              'AdvisingWise (Jiang et al., 2025)',
              'ASPIRE (Proposed System)']
CMP_ROWS = [
    ['Platform and deployment', 'Web-based', V, 'Models built on LMS data ' + V, 'Dashboard ' + V,
     'LLM multi-agent framework ' + V,
     'Web app on Vercel with Supabase cloud backend; Android build via Capacitor'],
    ['Target users', V, V, 'Students and instructors ' + V, 'Teachers and students',
     'Students and academic advisors', 'Students, Faculty, Deans, Registrar, Admin'],
    ['Core functionality', 'Automated grading and performance analytics',
     'Student information and automated grading', 'Predictive early warning with personalized interventions',
     'Explainable learning-analytics dashboard', 'AI-drafted advising responses validated by a human advisor',
     'COG-based grade computation, deterministic risk scoring, faculty-led intervention, AI Study Advising'],
    ['Data entry and processing', 'Automated grade computation', 'Centralized records; automated grade computation',
     'Machine-learning prediction from LMS data', 'Analytics over institutional academic data',
     'Language-model drafting of responses',
     'Faculty scorebook with mandatory activity metadata; server-side MR, TFR, and SG computation'],
    ['Reporting and analytics', '✓ Student performance analytics', V, '✓ At-risk predictions',
     '✓ Performance, engagement, perseverance', V,
     '✓ Risk and honors views, intervention results, performance reports'],
    ['Notification or alert feature', V, V, '✓ Early warnings', V, V,
     '✓ In-app and email notifications; advisories'],
    ['User access levels and security', V, V, V, V, V,
     '✓ Five-role RBAC, Supabase Auth, audit log'],
    ['Web accessibility', '✓', V, V, V, V, '✓'],
    ['Mobile accessibility', V, V, V, V, V, '✓ Android (Capacitor)'],
    ['Offline capability', V, V, V, V, V, '✗ Outside the study scope'],
    ['Cost and licensing', V, V, V, V, V,
     'Managed cloud services; institution-wide use may require paid tiers'],
]
CMP_TEXT = [
    "Table 3.8 compares ASPIRE with five related systems reviewed in Chapter 1, selected to cover "
    "grading, student records, early warning, learning-analytics dashboards, and AI-assisted advising.",
    "[Verify every related-system cell against its source before submission. Cells marked [verify] are "
    "not stated in the sources as summarized in Chapter 1; replace each with a check mark, a cross mark, "
    "or a short phrase.]",
    "Bato and Pomperada (2025) automate grade computation and add student performance analytics to "
    "reduce repetitive manual work. ASPIRE shares the goal of automated computation, but it computes "
    "grades from DYCI's institution-approved COG templates assigned per subject, and it continues past "
    "the grade itself: posted results feed a deterministic Academic Risk Score, faculty-led intervention "
    "plans, and Dean oversight, which are outside that platform's reported scope.",
    "Orboc (2025) centralizes student records and automates grade computation for a single college. "
    "ASPIRE likewise centralizes academic records, but it adds role-specific workflows for five DYCI "
    "roles, including Registrar academic setup and faculty loading, student-visible tentative "
    "computations, and a correction chain for posted grades that passes through faculty, Dean, and "
    "Registrar decisions.",
    "Chang et al. (2025) predict at-risk students from learning-management-system data and pair warnings "
    "with personalized interventions. ASPIRE also connects warnings to intervention, but it does not "
    "predict: its Academic Risk Score is a deterministic, auditable sum of four factors from records "
    "already in ASPIRE, so faculty can see exactly why a student was flagged, and each intervention plan "
    "keeps a frozen baseline for measuring follow-up outcomes.",
    "EX-LAD (Khelifi et al., 2024) presents explainable performance, engagement, and perseverance "
    "indicators to teachers and students. ASPIRE's dashboards serve a similar monitoring purpose but are "
    "tied to action: a flagged student can be evaluated, assigned a faculty-approved catch-up plan, and "
    "escalated to the Dean, with the plan's outcome recorded.",
    "AdvisingWise (Jiang et al., 2025) drafts advising responses with language models and has a human "
    "advisor validate each one. ASPIRE applies the same human-in-the-loop principle to formal "
    "intervention content, which faculty must approve before students can open it, while its "
    "student-facing AI Study Advising stays non-binding, grounded in activity metadata, and backed by a "
    "deterministic fallback; neither path can change grades or risk classifications.",
    "Taken together, each related system covers one part of the academic-support process: grading, "
    "records, prediction, dashboards, or advising. ASPIRE's contribution is connecting these parts in one "
    "DYCI-specific workflow: COG-based grade computation, timely student visibility, explainable "
    "current-evidence risk assessment, faculty-led intervention with Dean oversight, and "
    "baseline-to-follow-up outcome measurement. This addresses the research gap identified in Chapter 1, "
    "where no reviewed system linked these functions within one workflow, and responds to the General "
    "Problem's call for a centralized, human-in-the-loop system that supports explainable risk "
    "assessment, faculty-led intervention, and measurable intervention outcomes.",
]
cmp = [heading_like(h_evalcrit, 'Comparison with Related Systems'), text_para(CMP_TEXT[0], yellow=True),
       caption('Table 3.8 | Comparison Matrix of ASPIRE and Five Related Systems'),
       make_table(CMP_HEADER, CMP_ROWS, [1400, 1250, 1250, 1250, 1250, 1250, 1550], sz=16,
                  yellow_cols=(1, 2, 3, 4, 5), left_cols=(0,))]
cmp += [text_para(t, yellow=True) for t in CMP_TEXT[1:]]
insert_before(h_hypo_res, cmp)

# ================================================================== 6. Summary of the Study
SUMMARY = (
    "This study developed and evaluated ASPIRE (Academic Support and Performance Advising with "
    "Intervention, Risk, and Evaluation), a centralized, human-in-the-loop academic monitoring and "
    "early-intervention system for Dr. Yanga's Colleges, Inc. (DYCI), Bulacan, Philippines. It addressed "
    "how such a system can give students timely visibility into their academic performance, support "
    "explainable risk assessment and faculty-led intervention, and record measurable intervention "
    "outcomes. ASPIRE was built using the Iterative and Incremental Model and combines COG-based grade "
    "computation, a deterministic Academic Risk Score, faculty-approved intervention plans, Dean "
    "oversight, and non-binding AI Study Advising. The study used a quantitative, developmental research "
    "design. Respondents were purposively selected: 40 targeted end users (20 students, 9 faculty "
    "members, 9 Deans, 1 Registrar, and 1 administrator), who answered the End-User Questionnaire, and "
    "1-3 IT experts, who answered the Expert Questionnaire. Both questionnaires measured acceptance "
    "through the Technology Acceptance Model and software quality through ISO/IEC 25010:2023, and the "
    "results were interpreted using weighted means against predefined acceptability criteria."
)
insert_before(h_summary_find, [heading_like(h_conclusion, 'Summary of the Study'),
                               text_para(SUMMARY, yellow=True)])

# ================================================================== 7. Future Work
FUTURE = [
    "The following directions follow from the delimitations and conclusions of this study.",
    "• Calibrating the Academic Risk Score's point values and tier thresholds against institutional "
    "outcomes, since they are researcher-defined design choices in the present study.",
    "• Measuring academic change across complete live terms, with a study design able to test "
    "whether recorded interventions cause changes in GWA or risk level.",
    "• Comparing the deterministic Academic Risk Score with predictive early-warning models, such as "
    "those reviewed in Chapter 1, using the same institutional records.",
    "• Integrating ASPIRE with DYCI's registrar, billing, and learning-management systems, which the "
    "present system does not connect to.",
    "• Adding a guardian portal and extending historical access beyond one selected term at a time.",
    "• Supporting full offline operation and multi-factor or one-time-passcode authentication, both "
    "outside the present scope.",
    "• Evaluating ASPIRE in other institutions or a multi-tenant deployment so that findings can be "
    "generalized beyond DYCI.",
]
insert_before(h_refs, [heading_like(h_conclusion, 'Future Work and Direction for Future Research')]
              + [text_para(t, yellow=True) for t in FUTURE])

# ================================================================== 8. Appendices A-Q
appx_model_h1 = copy.deepcopy(h_appx)
final_sect = body[-1]
assert final_sect.tag == W + 'sectPr'
for e in capture_range(h_appx, final_sect):
    pass
APPX = [
    ('A', 'Respondents Letter', '[Insert the signed letter to respondents here.]'),
    ('B', 'Approval Letter', '[Insert the signed approval letter here.]'),
    ('C', 'Informed Consent Form', '[Insert the informed consent form given to respondents here.]'),
    ('D', 'Endorsement Letter', '[Insert the endorsement letter here.]'),
    ('E', 'Ethical Clearance', '[Insert the ethical clearance here.]'),
    ('F', 'Grammarian Certificate', '[Insert the grammarian certificate here.]'),
    ('G', 'ISO/IEC 25010:2023 Evaluation Tool', '[Insert the ISO/IEC 25010:2023 sections of the End-User '
     'and Expert questionnaires here.]'),
    ('H', 'Technology Acceptance Model', '[Insert the TAM section of the questionnaires here.]'),
    ('I', 'Data Dictionary', '[Insert the data dictionary here.]'),
    ('J', 'Survey Questionnaire', '[Insert the complete End-User and Expert questionnaires as distributed '
     'to respondents here.]'),
    ('K', 'Interview Guides', '[Not applicable as written: Research Design states that no interviews are '
     'used. Keep or remove this appendix as your adviser directs.]'),
    ('L', 'Program Output', '[Insert program output here.]'),
    ('M', 'Source Code', '[Insert the source code (full or partial) here.]'),
    ('N', 'Gantt Chart', '[Insert the full Gantt chart here; Table 2.13 in Chapter 2 shows the summary '
     'timeline.]'),
    ('O', 'User Manual', '[Insert the user manual here.]'),
    ('P', 'Screenshots', '[Insert system screenshots here.]'),
    ('Q', 'Curriculum Vitae', '[Insert each researcher\'s curriculum vitae here.]'),
]
new = [heading_like(h_refs, 'APPENDICES', page_break=True)]
for letter, title, ph in APPX:
    new.append(heading_like(h_rec_model, 'Appendix %s. %s' % (letter, title), page_break=letter != 'A'))
    new.append(para([(ph, False)], yellow=True, indent=False))
insert_before(final_sect, new)

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s' % TRACKED)
