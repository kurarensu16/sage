"""Migrate Chapter 2 to the new capstone+chapter+1-4 template order, and add Chapter 3-4 scaffolds.

Chapter 1 needs no structural change (its order already matches the template; the one extra
section it has, Statement of the Problem, is not in the template at all and is left in place
pending the adviser's call -- see the final report).

Everything new here is grounded in content that already exists in the paper or the repo's own
docs (QA checklists, Scope and Delimitation, System Development Methodology, Development Stack).
A few things cannot be grounded (Gantt dates, who-did-what, hardware specs) and are left as
clearly bracketed placeholders instead of invented.

Run: py migrate_ch1_4.py <source.docx> <out_dir>
Writes TRACKED and UPDATED copies (same two-file convention as build_docx.py).
"""
import copy
import io
import os
import re
import sys
import zipfile
from lxml import etree

SRC, OUTDIR = sys.argv[1], sys.argv[2]
NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}
W = '{%s}' % NS['w']
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
AUTHOR, DATE = 'Claude Code', '2026-11-08T12:00:00Z'


class Ctx:
    def __init__(self, tracked):
        self.tracked = tracked
        self.n = 90000

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


def heading(root, text, nth=0):
    hits = [p for p in root.iter(W + 'p') if vis_text(p).strip() == text]
    if not hits:
        raise AssertionError('heading not found: %r' % text)
    return hits[nth]


def para_style(p):
    ppr = p.find(W + 'pPr')
    if ppr is None:
        return None
    st = ppr.find(W + 'pStyle')
    return st.get(W + 'val') if st is not None else None


def set_para_style(p, style):
    ppr = p.find(W + 'pPr')
    if ppr is None:
        ppr = etree.Element(W + 'pPr')
        p.insert(0, ppr)
    st = ppr.find(W + 'pStyle')
    if st is None:
        st = etree.SubElement(ppr, W + 'pStyle')
        ppr.insert(0, st)
    st.set(W + 'val', style)


def base_rpr(p):
    for r in p.iter(W + 'r'):
        if r.find(W + 't') is not None:
            rp = r.find(W + 'rPr')
            return copy.deepcopy(rp) if rp is not None else etree.Element(W + 'rPr')
    return etree.Element(W + 'rPr')


def make_run(rpr, text, bold=None, italic=None, highlight=None):
    r = etree.Element(W + 'r')
    rp = copy.deepcopy(rpr)
    for x in rp.findall(W + 'noProof'):
        rp.remove(x)
    if bold is not None:
        for x in rp.findall(W + 'b') + rp.findall(W + 'bCs'):
            rp.remove(x)
        if bold:
            rp.insert(0, etree.Element(W + 'b'))
    if italic is not None:
        for x in rp.findall(W + 'i') + rp.findall(W + 'iCs'):
            rp.remove(x)
        if italic:
            rp.insert(0, etree.Element(W + 'i'))
    if highlight:
        for x in rp.findall(W + 'highlight'):
            rp.remove(x)
        h = etree.Element(W + 'highlight')
        h.set(W + 'val', 'yellow')
        rp.insert(0, h)
    r.append(rp)
    t = etree.SubElement(r, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    return r


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


def delete_paragraph(ctx, p):
    """Mark an existing paragraph as deleted in place (tracked), or remove it (clean)."""
    if not ctx.tracked:
        p.getparent().remove(p)
        return
    for r in [r for r in p.iter(W + 'r') if not any(a.tag == W + 'del' for a in r.iterancestors())
              and r.find(W + 't') is not None]:
        par = r.getparent()
        idx = par.index(r)
        par.remove(r)
        d = ctx.mark('del')
        d.append(r)
        par.insert(idx, d)
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
    rp.insert(0, ctx.mark('del'))


def rewrite(ctx, p, text):
    """Replace a paragraph's visible text with new text, as a tracked edit or plainly."""
    rpr = base_rpr(p)
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None
            and not any(a.tag == W + 'del' for a in r.iterancestors())]
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


def new_para(ctx, template, runs, style=None):
    """runs: list of (text, bold, italic) or (text, bold, italic, highlight).
    Paragraph/run formatting copied from template."""
    p = etree.Element(W + 'p')
    ppr = template.find(W + 'pPr')
    if ppr is not None:
        ppr = copy.deepcopy(ppr)
        rp = ppr.find(W + 'rPr')
        if rp is not None:
            for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
                rp.remove(x)
        p.append(ppr)
    if style:
        set_para_style(p, style)
    rpr = base_rpr(template)
    for run in runs:
        text, bold, italic = run[0], run[1], run[2]
        highlight = run[3] if len(run) > 3 else None
        p.append(make_run(rpr, text, bold, italic, highlight))
    mark_para_inserted(ctx, p)
    return p


def highlight_heading(ctx, p):
    """Mark an existing heading paragraph's text as yellow-highlighted (its section is empty)."""
    for r in p.iter(W + 'r'):
        rp = r.find(W + 'rPr')
        if rp is None:
            rp = etree.Element(W + 'rPr')
            r.insert(0, rp)
        for x in rp.findall(W + 'highlight'):
            rp.remove(x)
        h = etree.Element(W + 'highlight')
        h.set(W + 'val', 'yellow')
        rp.insert(0, h)
    return p


def clone_relabel(ctx, p, new_text=None, new_style=None):
    """Deep-copy a paragraph (e.g. a heading), optionally change its style/text, mark inserted."""
    clone = copy.deepcopy(p)
    for x in list(clone.iter(W + 'ins')) + list(clone.iter(W + 'del')):
        par = x.getparent()
        if par is None:
            continue
        if par.tag == W + 'rPr':
            par.remove(x)
            continue
        idx = par.index(x)
        if x.tag == W + 'ins':
            for c in list(x):
                par.insert(idx, c)
                idx += 1
        par.remove(x)
    for dt in clone.iter(W + 'delText'):
        dt.tag = W + 't'
    if new_style:
        set_para_style(clone, new_style)
    if new_text is not None:
        ts = clone.findall('.//' + W + 't')
        if ts:
            ts[0].text = new_text
            for extra in ts[1:]:
                extra.getparent().getparent().remove(extra.getparent())
    mark_para_inserted(ctx, clone)
    return clone


def capture_range(root, start_text, end_text):
    """Return the list of body elements from start_text (inclusive) to end_text (exclusive),
    read in one pass before any mutation. Both are matched against the *original*, untouched
    document, so this must run before any clone/delete touches that stretch."""
    start = heading(root, start_text)
    end = heading(root, end_text)
    elems = []
    e = start
    while e is not None and e is not end:
        elems.append(e)
        e = e.getnext()
    assert e is end, 'end marker not found after start'
    return elems


def split_at(elems, texts):
    """Split a captured element list into contiguous groups, each starting at one of `texts`
    (in the order those headings actually occur in `elems`). Returns an ordered dict-like list
    of (heading_text, [elements])."""
    groups, cur_text, cur = [], None, []
    for el in elems:
        t = vis_text(el).strip()
        if t in texts:
            if cur:
                groups.append((cur_text, cur))
            cur_text, cur = t, [el]
        else:
            cur.append(el)
    if cur:
        groups.append((cur_text, cur))
    return groups


def relocate_groups(ctx, root, elems, order, before_text, renames=None):
    """Split `elems` into groups keyed by the headings in `order`, then insert clones of those
    groups (renamed per `renames`) before `before_text`, in `order`, and mark every original
    element in `elems` as deleted in place (tracked) or remove it (clean)."""
    renames = renames or {}
    groups = dict(split_at(elems, set(order)))
    anchor = heading(root, before_text)
    for key in order:
        for el in groups[key]:
            if el.tag == W + 'tbl':
                anchor.addprevious(copy.deepcopy(el))
                continue
            txt = vis_text(el).strip()
            new_text, new_style = renames.get(txt, (None, None))
            anchor.addprevious(clone_relabel(ctx, el, new_text, new_style))
    for el in elems:
        if el.tag == W + 'tbl':
            el.getparent().remove(el)
        else:
            delete_paragraph(ctx, el)


def make_table(rows_data, col_widths):
    """rows_data: list of rows, each a list of (text, bold, italic) or (text, bold, italic,
    highlight). col_widths in dxa twips."""
    cols = ''.join('<w:gridCol w:w="%d"/>' % w for w in col_widths)
    trs = []
    for r in rows_data:
        cells = []
        for cell, w in zip(r, col_widths):
            text, bold, italic = cell[0], cell[1], cell[2]
            hl = cell[3] if len(cell) > 3 else False
            rpr = ((' <w:b/>' if bold else '') + (' <w:i/>' if italic else '')
                   + (' <w:highlight w:val="yellow"/>' if hl else ''))
            rpr = ('<w:rPr>%s</w:rPr>' % rpr) if rpr.strip() else ''
            cells.append('<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/></w:tcPr>'
                         '<w:p><w:r>%s<w:t xml:space="preserve">%s</w:t></w:r></w:p></w:tc>'
                         % (w, rpr, text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')))
        trs.append('<w:tr>' + ''.join(cells) + '</w:tr>')
    xml = ('<w:tbl xmlns:w="%s"><w:tblPr><w:tblStyle w:val="TableGrid"/>'
           '<w:tblW w:w="0" w:type="auto"/><w:tblBorders>'
           '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>'
           '</w:tblPr><w:tblGrid>%s</w:tblGrid>%s</w:tbl>') % (NS['w'], cols, ''.join(trs))
    return etree.fromstring(xml)


def P(ctx, tmpl, text, italic=None, style=None, highlight=None):
    return new_para(ctx, tmpl, [(text, None, italic, highlight)], style)


def add_chapters_3_4(ctx, root, normal_t):
    refs = heading(root, 'References')
    h1_t = heading(root, 'CHAPTER 2')  # style template for a Heading1 chapter-number line
    h2_t = heading(root, 'Tools and Technologies Used')  # a real Heading2 template
    h3_t = heading(root, 'Requirements Specifications')  # a real Heading3 template

    def ins(el):
        refs.addprevious(el)

    # ================= CHAPTER 3 =================
    ins(P(ctx, h1_t, 'CHAPTER 3', style='Heading1'))
    ins(P(ctx, h1_t, 'RESULTS, DISCUSSION, AND INTERPRETATION OF DATA', style='Heading1'))
    ins(P(ctx, normal_t,
          "This chapter presents the results of the study, organized by the specific objectives "
          "in Chapter 1, and interprets the data gathered from system testing and, once "
          "collection is complete, from respondent evaluation. The automated verification "
          "results below were produced by the project's own check scripts and are reported as "
          "run; the respondent evaluation results are reported where the corresponding data "
          "exists and are otherwise left as a structure for the team to complete.", None))

    ins(P(ctx, h2_t, 'System Testing Results', style='Heading2'))
    ins(P(ctx, normal_t,
          "This section proves that the system works as intended, through the automated "
          "verification already completed and the manual functional and non-functional testing "
          "whose scope is documented in the project's testing records.", None))

    ins(P(ctx, h3_t, 'Functional Testing', style='Heading3'))
    ins(P(ctx, normal_t,
          "ASPIRE's grading engine, CSV import/export, AI-advisory freshness rules, evaluation "
          "tracking, and referral workflow are each checked by a dedicated, repeatable "
          "verification script that compares the application's computed output against an "
          "independent reference (a parallel SQL implementation for grading, and known expected "
          "cases for the others). All five currently pass. Table 3.1 records the run referenced "
          "in this paper.", None))
    func_rows = [
        [('Verification Script', True, False), ('Scope', True, False), ('Result', True, False)],
        [('verify:grading', False, False),
         ('5 grading presets, the policy transmutation scale, attendance, honors, risk-score '
          'boundaries, milestone identity, summer-term isolation, consultation-window states, '
          'grade-change-request rules, and 2,807 dynamic-threshold transmutations, each checked '
          'against a parallel SQL implementation.', False, False),
         ('Passed', False, False)],
        [('verify:csv', False, False), ('CSV grade export/import round-trip.', False, False), ('Passed', False, False)],
        [('verify:insights', False, False), ('AI academic-insight freshness rules.', False, False), ('Passed', False, False)],
        [('verifyEvaluationTracking.js', False, False),
         ('Zero/blank score handling, dynamic activity coverage, risk-score contribution, '
          'Manila-timezone dates, term coverage, honors eligibility, task verification, '
          'follow-up eligibility, intervention outcomes, period-closure states, and referral '
          'email syntax/privacy.', False, False), ('Passed', False, False)],
        [('verifyEvaluationReferrals.js', False, False),
         ('42 referral-workflow groups: migration shape, RLS and grants, legacy compatibility, '
          'authorization, deduplication, retry after resolution, referral/task/status '
          'preservation, creation-time atomicity, and notification-failure rollback.', False, False),
         ('Passed', False, False)],
    ]
    ins(make_table(func_rows, [2600, 6200, 1500]))
    ins(P(ctx, normal_t, 'Table 3.1 | Automated Verification Results (run 2026-11-08)', italic=True))

    ins(P(ctx, normal_t,
          "The manual, portal-by-portal functional test plan (one checklist per portal, plus "
          "shared navigation and specific workflows such as Grade Change Requests and AI Study "
          "Advising) is documented separately in the project's testing records. Table 3.2 lists "
          "a representative sample of its test cases; the Actual Result and Status columns are "
          "left for the team to complete once that checklist is formally run and recorded.", None))
    manual_rows = [
        [('Test Case', True, False), ('Expected Result', True, False), ('Actual Result', True, False), ('Status', True, False)],
        [('Faculty: My Classes shows the meeting schedule', False, False),
         ('Each class card shows its meeting days and time under the enrolment count', False, False),
         ('[To complete]', False, True, True), ('[To complete]', False, True, True)],
        [('Student: Grade Report after posting', False, False),
         ('Posted grading-period results (MR/TFR/SG) replace tentative values; blank activities '
          'are excluded until recorded', False, False),
         ('[To complete]', False, True, True), ('[To complete]', False, True, True)],
        [('Dean: SG correction approval', False, False),
         ('Approval authorizes one dedicated faculty application and does not unlock the '
          'ordinary gradebook', False, False),
         ('[To complete]', False, True, True), ('[To complete]', False, True, True)],
        [('Registrar: faculty-loading schedule conflict', False, False),
         ('A clashing subject/section/time is refused, with the clash disclosed in full', False, False),
         ('[To complete]', False, True, True), ('[To complete]', False, True, True)],
    ]
    ins(make_table(manual_rows, [2600, 3800, 2400, 1500]))
    ins(P(ctx, normal_t, 'Table 3.2 | Manual Functional Test Cases (sample)', italic=True))

    ins(P(ctx, h3_t, 'Non-Functional Testing', style='Heading3'))
    ins(P(ctx, normal_t,
          "Performance is addressed architecturally: server-authoritative grade computation and "
          "risk scoring run on Supabase's managed Postgres rather than the client, and the React "
          "(Vite) frontend recalculates visible grades immediately while persisting drafts in the "
          "background. Security is enforced through role-based route guards across all five "
          "portals and Supabase Row Level Security scoped per role, both exercised by the "
          "integration tests described under Verification, Validation and Testing in Chapter 2. "
          "Compatibility covers the supported web browsers and the Android build produced "
          "through Capacitor from the same codebase. Reliability covers the deterministic "
          "rule-based fallback that keeps AI Study Advising available when the external model is "
          "not.", None))
    ins(P(ctx, normal_t,
          "[To complete: record measured response times, concurrent-user behavior, and any "
          "defects found once formal non-functional testing is run.]", True, highlight=True))

    ins(P(ctx, h2_t, 'System Evaluation Results', style='Heading2'))
    ins(P(ctx, normal_t,
          "This section presents the data gathered from respondents using the TAM and ISO/IEC "
          "25010:2023 instruments described in Chapter 2. It is structured in advance of that "
          "data; the subsections below are completed once evaluation data collection finishes.",
          None))
    ins(highlight_heading(ctx, P(ctx, h3_t, 'Profile of the Respondents', style='Heading3')))
    ins(P(ctx, normal_t,
          "[To complete: report the number of evaluators by role (Student, Faculty, Dean, "
          "Registrar, Admin, IT Expert) against the inclusion criteria and targets in Research "
          "Subjects, Chapter 2.]", True, highlight=True))
    prof_rows = [
        [('Respondent Group', True, False), ('Target', True, False), ('Actual', True, False)],
        [('Students', False, False), ('[To complete]', False, True, True), ('[To complete]', False, True, True)],
        [('Faculty', False, False), ('[To complete]', False, True, True), ('[To complete]', False, True, True)],
        [('Dean / Administrators', False, False), ('[To complete]', False, True, True), ('[To complete]', False, True, True)],
        [('IT Experts', False, False), ('[To complete]', False, True, True), ('[To complete]', False, True, True)],
    ]
    ins(make_table(prof_rows, [3000, 3000, 3000]))
    ins(P(ctx, normal_t, 'Table 3.3 | Profile of the Respondents', italic=True))

    ins(P(ctx, h3_t, 'Evaluation Criteria', style='Heading3'))
    ins(P(ctx, normal_t,
          "Evaluation uses the same instruments described under Research Instruments in Chapter "
          "2: a 10-item TAM section (five Perceived Usefulness, five Perceived Ease of Use "
          "items) for every respondent, and ISO/IEC 25010:2023 software-quality checklists "
          "covering nine characteristics for IT experts (Functional Suitability, Performance "
          "Efficiency, Compatibility, Interaction Capability, Reliability, Security, "
          "Maintainability, Flexibility, and Safety) and seven for end users.", None))

    ins(highlight_heading(ctx, P(ctx, h3_t, 'Results and Discussion', style='Heading3')))
    ins(P(ctx, normal_t,
          "[To complete once evaluation data collection finishes: (1) present the gathered TAM "
          "and ISO/IEC 25010:2023 data in tables and descriptive summaries; (2) compute "
          "item-level and construct-level weighted means and standard deviations as described "
          "under Data Analysis and Statistical Treatment, Chapter 2; (3) interpret the results "
          "against the 2.51 TAM acceptability threshold and the 80% ISO compliance criterion; "
          "(4) summarize the closed-loop functional-verification outcome measures; and (5) "
          "discuss the findings against the related literature and studies reviewed in Chapter "
          "1.]", True, highlight=True))

    ins(highlight_heading(ctx, P(ctx, h3_t, 'Hypothesis Testing Results', style='Heading3')))
    ins(P(ctx, normal_t,
          "[To complete: report the acceptance or rejection of the study's hypothesis (Chapter "
          "1, Hypothesis of the Study) against the TAM and ISO/IEC 25010:2023 thresholds, once "
          "evaluation data is available.]", True, highlight=True))

    # ================= CHAPTER 4 =================
    ins(P(ctx, h1_t, 'CHAPTER 4', style='Heading1'))
    ins(P(ctx, h1_t, 'CONCLUSION AND RECOMMENDATIONS', style='Heading1'))
    ins(P(ctx, normal_t,
          "This chapter synthesizes the study by summarizing its findings, drawing conclusions "
          "based on those findings, and presenting recommendations. It is completed once Chapter "
          "3 reports real results; writing it before that would mean stating conclusions the "
          "data has not yet supported.", None))

    ins(highlight_heading(ctx, P(ctx, h2_t, 'Summary of Findings', style='Heading2')))
    ins(P(ctx, normal_t,
          "[To complete: summarize the significant findings from Chapter 3 against each specific "
          "objective in Chapter 1 (Objectives of the Study).]", True, highlight=True))

    ins(highlight_heading(ctx, P(ctx, h2_t, 'Conclusion', style='Heading2')))
    ins(P(ctx, normal_t,
          "[To complete: state whether the objectives were achieved and what the findings mean, "
          "drawn only from the results actually reported in Chapter 3.]", True, highlight=True))

    ins(highlight_heading(ctx, P(ctx, h2_t, 'Recommendations', style='Heading2')))
    ins(P(ctx, normal_t,
          "[To complete: practical recommendations based on the conclusions above, for future "
          "development, institutional adoption, or further research.]", True, highlight=True))


def build(tracked, out_path):
    zin = zipfile.ZipFile(SRC)
    files = {n: zin.read(n) for n in zin.namelist()}
    root = etree.fromstring(files['word/document.xml'])
    ctx = Ctx(tracked)

    # ---- Chapter 2 title ----------------------------------------------------------------
    rewrite(ctx, heading(root, 'System Development'), 'SYSTEM DEVELOPMENT and METHODOLOGY')

    # ---- 1. move Research Methodology's six subsections to the front of Chapter 2 --------
    renames = {
        'Respondents and Setting of the Study': ('Research Subjects', 'Heading2'),
        'Instrument and Validation': ('Research Instruments', 'Heading2'),
        'TAM Questionnaire': (None, 'Heading3'),
        'ISO/IEC 25010:2023 Evaluation Checklist': (None, 'Heading3'),
        'Research Design': (None, 'Heading2'),
        'Data Gathering Procedure': (None, 'Heading2'),
        'Closed-Loop Functional Verification': (None, 'Heading3'),
        'Statistical Treatment of Data': ('Data Analysis and Statistical Treatment', 'Heading2'),
        'Ethical Considerations': (None, 'Heading2'),
    }
    # capture the whole subtree in one pass, before any mutation, then relocate its six
    # headings in the template's literal order: Subjects, Instruments, Design, Data Gathering,
    # Data Analysis, Ethical Considerations.
    rm_elems = capture_range(root, 'Research Design', 'References')
    order = ['Respondents and Setting of the Study', 'Instrument and Validation', 'Research Design',
             'Data Gathering Procedure', 'Statistical Treatment of Data', 'Ethical Considerations']
    relocate_groups(ctx, root, rm_elems, order, 'System Development Methodology', renames)
    # the old umbrella heading + its one-sentence intro are now empty of content; remove them
    rm_heading = heading(root, 'Research Methodology')
    rm_intro = rm_heading.getnext()
    delete_paragraph(ctx, rm_intro)
    delete_paragraph(ctx, rm_heading)

    # ---- 2. Requirements Specifications and Analysis (new, before Proposed System) -------
    body_t = heading(root, 'Proposed System').getnext()  # an H3, use as a Normal-paragraph stand-in
    normal_t = heading(root, 'System Development Methodology').getnext()
    anchor = heading(root, 'Proposed System')
    req_h2 = new_para(ctx, heading(root, 'System Development Methodology'),
                       [('Requirements Specifications and Analysis', None, None)], 'Heading2')
    req_h3a = new_para(ctx, heading(root, 'System Development Methodology'),
                        [('Requirements Specifications', None, None)], 'Heading3')
    req_a = new_para(ctx, normal_t, [(
        "ASPIRE's functional requirements are organized by portal and module, matching the "
        "breakdown in Scope and Delimitation above. The Shared/Public Portal covers role-based "
        "authentication and password management for all five roles. The Student Portal covers "
        "the dashboard, Courses and Grades, Attendance, Academic Support (AI Study Advising and "
        "advisory review), Consultations, Notifications, and Account. The Faculty Portal covers "
        "the dashboard, the selected-class grading workflow (Scorebook, grade posting, and "
        "corrections), Student Support (evaluation and intervention), Attendance, Performance "
        "Reports, Consultations, Notifications, and Account. The Dean Portal covers the "
        "dashboard, Grades, Faculty Loading, Risk and Interventions, Reports, Notifications, and "
        "Account. The Registrar Portal covers the dashboard, People, Academic Setup, Enrollment "
        "and Loading, Grade Records, Reports, Notifications, and Account. The Admin Portal covers "
        "the dashboard, User Accounts, System maintenance, Notifications, and Account. The Grade "
        "Change Request Chain and Academic Period and Archive Access cut across these portals. "
        "Each module's functional requirements, performance requirements (response time, "
        "computational accuracy, and auditability), and security requirements (role-based access "
        "control and Supabase Row Level Security) are detailed per module in Scope and "
        "Delimitation and, for the grading and risk logic specifically, in Logical Specifications "
        "below.", None, None)])
    req_h3b = new_para(ctx, heading(root, 'System Development Methodology'),
                        [('Requirements Analysis', None, None)], 'Heading3')
    req_b = new_para(ctx, normal_t, [(
        "The requirements-gathering process considered DYCI's Student Handbook and COG "
        "templates, program-specific grade components, grading-period posting, authorized SG "
        "corrections, attendance rules, and honors eligibility. The functional scope that "
        "resulted covers five-role RBAC (Student, Faculty, Dean, Registrar, and Admin), "
        "subject-assigned dynamic COG computation, student-specific score recording with "
        "required activity metadata, live risk-scoring explanations, and faculty-managed "
        "academic intervention. Quality considerations identified during analysis cover "
        "authenticated access, data security, correct grade arithmetic, interface "
        "responsiveness, and auditable modification workflows; each is addressed by a "
        "corresponding system control described later in this chapter.", None, None)])
    for el in (req_h2, req_h3a, req_a, req_h3b, req_b):
        anchor.addprevious(el)

    # ---- 3. Logical Specifications (new, before Grading Engine Specification) ------------
    anchor = heading(root, 'Grading Engine Specification')
    log_h2 = new_para(ctx, heading(root, 'System Development Methodology'),
                       [('Logical Specifications', None, None)], 'Heading2')
    log_p = new_para(ctx, normal_t, [(
        "This section describes ASPIRE's logical structure and processes, independent of their "
        "physical implementation. ASPIRE's academic processes are expressed as two deterministic "
        "specifications: the Grading Engine, which computes the Midterm Rating, Tentative Final "
        "Rating, and Semestral Grade from a subject's assigned COG template, and the Academic "
        "Risk Score, which classifies a student's standing from four weighted factors. Both are "
        "detailed below.", None, None)])
    anchor.addprevious(log_h2)
    anchor.addprevious(log_p)

    # ---- 4. Development Stack and Tools -> Physical Specifications, moved up -------------
    dst_text_fixed = (
        "ASPIRE uses a React.js (Vite) frontend, a Supabase backend (PostgreSQL with Supabase "
        "Auth and Row Level Security on sensitive tables), and Gemini 2.5 Flash for AI advising. "
        "Code is versioned in Git on GitHub, deployed on Vercel, and packaged for Android with "
        "Capacitor. No specialized client hardware is required beyond a modern web browser and "
        "an internet connection; server-side computation runs on Supabase's managed "
        "infrastructure rather than on the client device. Table 2.10 details each component.")
    dst_h2 = heading(root, 'Development Stack and Tools')
    dst_body = dst_h2.getnext()
    phys_h2 = clone_relabel(ctx, dst_h2, 'Physical Specifications', 'Heading2')
    phys_body = new_para(ctx, normal_t, [(dst_text_fixed, None, None)])
    vtoc_anchor = heading(root, 'Visual Table of Contents')
    vtoc_anchor.addprevious(phys_h2)
    vtoc_anchor.addprevious(phys_body)
    delete_paragraph(ctx, dst_body)
    delete_paragraph(ctx, dst_h2)

    # ---- 5. System Design (new intro, before Process Design) -----------------------------
    anchor = heading(root, 'Process Design')
    sd_h2 = new_para(ctx, heading(root, 'System Development Methodology'),
                      [('System Design', None, None)], 'Heading2')
    sd_p = new_para(ctx, normal_t, [(
        "ASPIRE's system design is presented in three parts: the Process Design (the Data Flow "
        "Diagrams showing how data moves between each role and the system's modules), the "
        "Database Design (the Entity Relationship Diagrams for the system's schema layers), and "
        "the User Interface Design (the principal screens of each portal). The Visual Table of "
        "Contents maps every portal's modules to its menu hierarchy ahead of these diagrams.",
        None, None)])
    anchor.addprevious(sd_h2)
    anchor.addprevious(sd_p)

    # ---- 6. fix the second "via OpenRouter" mention, in System Implementation ------------
    si_body = heading(root, 'System Implementation').getnext()
    assert 'OpenRouter' in vis_text(si_body)
    rewrite(ctx, si_body, vis_text(si_body).replace(
        'AI diagnostics use OpenRouter with local rule-based fallback.',
        'AI diagnostics use Gemini 2.5 Flash with a local rule-based fallback.'))

    # ---- 7. fill the empty "Tools and Technologies Used" table ---------------------------
    ttu_caption = [p for p in root.iter(W + 'p')
                   if vis_text(p).strip().startswith('Table 2.10 | Tools and Technologies Used')][0]
    tbl_xml = '''<w:tbl xmlns:w="%s">
      <w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>
      </w:tblPr><w:tblGrid><w:gridCol w:w="2600"/><w:gridCol w:w="6900"/></w:tblGrid>
      %s
    </w:tbl>''' % (NS['w'], '%ROWS%')

    def row(a, b, bold_a=True, italic_b=False, highlight_b=False):
        return ('<w:tr><w:tc><w:tcPr><w:tcW w:w="2600" w:type="dxa"/></w:tcPr>'
                '<w:p><w:r>%s<w:t xml:space="preserve">%s</w:t></w:r></w:p></w:tc>'
                '<w:tc><w:tcPr><w:tcW w:w="6900" w:type="dxa"/></w:tcPr>'
                '<w:p><w:r>%s<w:t xml:space="preserve">%s</w:t></w:r></w:p></w:tc></w:tr>') % (
            '<w:rPr><w:b/></w:rPr>' if bold_a else '', a,
            '<w:rPr>%s%s</w:rPr>' % ('<w:i/>' if italic_b else '',
                                      '<w:highlight w:val="yellow"/>' if highlight_b else ''), b)

    rows = ''.join([
        row('Category', 'Tools', True, False),
        row('Frontend', 'React 19, Vite, Tailwind CSS', True, False),
        row('Backend / Database', 'Supabase (PostgreSQL, Supabase Auth, Row Level Security, '
            'Deno Edge Functions)', True, False),
        row('AI', 'Gemini 2.5 Flash', True, False),
        row('Version control', 'Git, hosted on GitHub', True, False),
        row('Code editor', 'Visual Studio Code', True, False),
        row('Package manager', 'npm', True, False),
        row('Deployment', 'Vercel (web application), Capacitor (Android build)', True, False),
        row('Hardware Development Tools', '[To complete: list the development team’s '
            'hardware, e.g. laptop models, processor, and RAM, and the devices used to test '
            'ASPIRE’s responsive and Android builds.]', True, True, True),
        row('End-user hardware', 'ASPIRE requires only a modern desktop or mobile web browser '
            'with an internet connection; no specialized client hardware is required. The '
            'Android build requires a device running a Capacitor-supported Android version.',
            True, False),
    ])
    tbl_el = etree.fromstring(tbl_xml.replace('%ROWS%', rows))
    ttu_caption.addnext(tbl_el)
    # new tables are inserted plainly in both copies; Word has no clean revision-mark for a
    # freshly inserted table, so this one doesn't show as a tracked insertion in the TRACKED file

    # ---- 8. Schedule Timeline, Responsibilities, Implementation Plan (new placeholders) --
    si_h2 = heading(root, 'System Implementation')
    # the paragraph right after the table just inserted anchors the next new sections
    after_table = tbl_el.getnext()

    sched_h2 = highlight_heading(ctx, new_para(ctx, si_h2, [('Schedule Timeline', None, None)], 'Heading2'))
    sched_p = new_para(ctx, normal_t, [(
        "[To complete: insert a Gantt chart or timeline table showing the planned phases and "
        "dates of ASPIRE's development, from initial planning through testing and evaluation. "
        "System Development Methodology above already describes the eight phases of the "
        "iterative cycle used; this section should assign dates to each pass of that cycle.]",
        None, True, True)])
    resp_h2 = highlight_heading(ctx, new_para(ctx, si_h2, [('Responsibilities', None, None)], 'Heading2'))
    team = ['Abalos, Carl Jerome F.', 'Gabriel, John Christian C.', 'Sadiaza, Clarence Timothy G.']
    resp_rows = row('Name', 'Role and Responsibilities', True, False) + ''.join(
        row(n, '[To complete: describe this member’s primary responsibilities, e.g. '
            'backend and database development, frontend development, or testing and '
            'documentation.]', True, True, True) for n in team)
    resp_tbl = etree.fromstring(tbl_xml.replace('%ROWS%', resp_rows))

    impl_h2 = new_para(ctx, si_h2, [('Implementation Plan', None, None)], 'Heading2')
    impl_p = new_para(ctx, normal_t, [(
        "ASPIRE's deployment follows the procedure described under System Implementation: the "
        "web application is built and hosted on Vercel, with Supabase providing the managed "
        "database, authentication, and storage, and an Android build produced through Capacitor "
        "from the same codebase. Database migrations are written as versioned SQL files and "
        "applied by the system owner before each release; seed scripts populate reference data "
        "such as colleges, programs, and sections ahead of go-live.", None, None)])
    impl_p2 = new_para(ctx, normal_t, [(
        "[To complete: describe user orientation or training per role, and the planned pilot "
        "implementation. A short walkthrough session for each role (Student, Faculty, Dean, "
        "Registrar, Admin) before that group's rollout is recommended but not yet scheduled.]",
        None, True, True)])

    for el in (sched_h2, sched_p, resp_h2):
        after_table.addprevious(el)
    after_table.addprevious(resp_tbl)
    for el in (impl_h2, impl_p, impl_p2):
        after_table.addprevious(el)

    # ---- 9. move "System Testing" to the end, renamed "Verification, Validation and Testing"
    vvt_lead = (
        "ASPIRE's quality assurance follows three distinct activities. Verification determines "
        "whether the system was built according to its specified requirements and design. "
        "Validation determines whether the system meets the actual needs of its users; this is "
        "carried out through the TAM and ISO/IEC 25010:2023 evaluation described under Research "
        "Instruments, administered once evaluation data collection is complete. Testing covers "
        "the activities performed to identify defects and assess performance, usability, and "
        "reliability. The verification and testing activities already completed are described "
        "below; validation results are reported in Chapter 3.")
    vvt_lead_p = new_para(ctx, normal_t, [(vvt_lead, None, None)])
    # System Maintenance is not named anywhere in the template's Chapter 2; left in place, right
    # after System Implementation, rather than guessing where the template would want it.
    vt_elems = capture_range(root, 'System Testing', 'System Implementation')
    relocate_groups(ctx, root, vt_elems, ['System Testing'], 'Definition of Terms',
                     renames={'System Testing': ('Verification, Validation and Testing', 'Heading2')})
    vvt_h2 = heading(root, 'Verification, Validation and Testing')
    vvt_h2.addnext(vvt_lead_p)

    # ---- Chapter 3 and Chapter 4 scaffold, inserted before References --------------------
    add_chapters_3_4(ctx, root, normal_t)

    files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    st = files['word/settings.xml'].decode('utf-8')
    if 'w:updateFields' not in st:
        st = re.sub(r'(<w:settings[^>]*>)', r'\1<w:updateFields w:val="true"/>', st, count=1)
    files['word/settings.xml'] = st.encode('utf-8')
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
        for n, b in files.items():
            z.writestr(n, b)


if __name__ == '__main__':
    os.makedirs(OUTDIR, exist_ok=True)
    build(True, os.path.join(OUTDIR, 'ASPIRE_Chapters_1-4_TRACKED_2026-11-08.docx'))
    build(False, os.path.join(OUTDIR, 'ASPIRE_Chapters_1-4_UPDATED_2026-11-08.docx'))
    print('done')
